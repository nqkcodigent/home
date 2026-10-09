import * as THREE from "three";

import { Badges } from "./interact/Badges";
import { CameraRig } from "./CameraRig";
import { Engine } from "./Engine";
import { HowlerAudio } from "./audio/HowlerAudio";
import { Input } from "./Input";
import { Tweens } from "./Tween";
import { createStoryAudioHandler } from "./audio/storyAudio";
import { createAdultRoom } from "./locations/adultRoom";
import { createChildhoodYard } from "./locations/childhoodYard";
import { disposeObject } from "./world/dispose";
import { findActiveSpot } from "./interact/spots";
import { gameEvents } from "../events";
import { playSfx } from "../ui/sfx";
import { setInputDevice } from "../ui/device";
import { storyDirector } from "../story/director";

import type { AudioSlot } from "./audio/HowlerAudio";
import type { BeatOfType } from "../story/types";
import type { StageHandlers } from "../story/StoryDirector";
import type { FrameInfo } from "./Engine";
import type { LocationBuilder, LocationRuntime, WorldServices } from "./locations/types";
import type { Spot } from "./interact/spots";
import type { StoryLine } from "../story/StoryDirector";

/**
 * WorldGame — bộ máy của trò chơi.
 *
 * Giữ ĐÚNG một bản của mọi logic dùng chung: vào/đổi bối cảnh, nhịp truyện,
 * điểm ký ức, camera, âm thanh, hiệu ứng giấc mơ. Bối cảnh (sân tuổi thơ, căn
 * hộ) chỉ khai báo dữ liệu.
 *
 * Vì sao không giữ lại Phaser cho phần 2D: cả trò chơi giờ là một thế giới 3D
 * liền mạch, không còn màn hình nào cần sprite. Hai engine cùng dựng một khung
 * hình là hai vòng lặp, hai hệ toạ độ và hai chỗ để lệch nhau.
 */

const LOCATIONS: Record<string, LocationBuilder> = {
  AdultHomeScene: createAdultRoom,
  ChildhoodScene: createChildhoodYard,
};

/** Thời gian tối thiểu cho mỗi pha của hiệu ứng giấc mơ (ms). */
const DREAM_PHASE_MS = 520;

/**
 * story.json đếm bằng mili-giây (giống `clock.delay`), còn lớp 3D đếm bằng
 * giây (khớp `dt` của vòng lặp frame). Đây là chỗ ĐỔI ĐƠN VỊ duy nhất.
 */
function seconds(ms: number): number {
  return ms / 1000;
}

export class WorldGame {
  private readonly audio = new HowlerAudio();

  private readonly tweens = new Tweens();

  private readonly storyAudio = createStoryAudioHandler(this.audio);

  private engine: Engine | undefined;

  private rig: CameraRig | undefined;

  private input: Input | undefined;

  private badges: Badges | undefined;

  private overlay: HTMLDivElement | undefined;

  private location: LocationRuntime | undefined;

  private detachFrame: (() => void) | undefined;

  private readonly collected = new Set<string>();

  private activeSpotId: string | undefined;

  private controlsEnabled = false;

  private footsteps: { move: (p: { x: number; y: number; z: number }) => void; stop: () => void } | undefined;

  private stageAttached = false;

  /** Idempotent: React StrictMode gọi effect hai lần, chỉ được dựng một engine. */
  start(container: HTMLElement) {
    if (this.engine) return;

    const engine = new Engine(container);

    this.engine = engine;
    this.input = new Input(container);
    // Rig và thế giới dùng CHUNG một bộ Tween, nên chỉ có một chỗ gọi update().
    this.rig = new CameraRig(engine.camera, this.tweens);

    this.badges = new Badges(container);
    this.overlay = createDreamOverlay(container);

    setInputDevice(this.input.currentDevice);

    this.attachStage();

    this.enter("AdultHomeScene");

    this.detachFrame = engine.onUpdate((frame) => this.frame(frame));

    engine.start();
  }

  /** Cần điều khiển cảm ứng đẩy vào đây (toạ độ đã chuẩn hoá -1…1). */
  setStick(right: number, forward: number) {
    this.input?.setStick(right, forward);
  }

  releaseStick() {
    this.input?.releaseStick();
  }

  /** Nút tương tác trên màn hình cảm ứng. */
  interact() {
    this.input?.queueInteract();
  }

  destroy() {
    this.detachFrame?.();
    this.detachFrame = undefined;

    this.teardownLocation();

    this.badges?.dispose();
    this.badges = undefined;

    this.overlay?.remove();
    this.overlay = undefined;

    this.input?.dispose();
    this.input = undefined;

    this.rig = undefined;

    this.audio.dispose();

    this.tweens.clear();

    this.engine?.dispose();
    this.engine = undefined;
  }

  // ── Vòng lặp ────────────────────────────────────────────────────────────

  private frame({ dt, elapsed }: FrameInfo) {
    const engine = this.engine;
    const rig = this.rig;
    const input = this.input;
    const location = this.location;

    if (!engine || !rig || !input) return;

    this.tweens.update(dt);

    if (input.consumePauseToggle()) {
      const muted = this.audio.toggleMuted();

      gameEvents.emit("notice", {
        text: muted ? "Đã tắt tiếng" : "Đã bật tiếng",
        hold: 1400,
      });
    }

    const look = input.look();

    if (location) {
      // Nhân vật đi theo hướng CAMERA: xoay camera rồi bấm W là đi về phía
      // màn hình, đúng như mọi game góc nhìn thứ ba.
      location.character.update(input.snapshot(), rig.yawAngle, dt, elapsed);

      const position = location.character.position;

      rig.setTarget(position.x, position.y, position.z);
      location.update?.(dt, elapsed);

      this.updateBadges();
      this.updateFootsteps();
    }

    rig.update(dt, look, elapsed);

    const direction = new THREE.Vector3();

    engine.camera.getWorldDirection(direction);

    this.audio.setListener(engine.camera.position, direction);

    this.badges?.update(engine.camera);
  }

  // ── Bối cảnh ────────────────────────────────────────────────────────────

  private services(): WorldServices {
    return {
      engine: this.engine as Engine,
      rig: this.rig as CameraRig,
      audio: this.audio,
      badges: this.badges as Badges,
      tweens: this.tweens,
      transition: (scene, duration) => void this.transition(scene, duration),
      setControls: (enabled) => this.setControls(enabled),
    };
  }

  private enter(name: string) {
    const engine = this.engine;
    const rig = this.rig;

    if (!engine || !rig) return;

    const build = LOCATIONS[name];

    if (!build) throw new Error(`World: unknown location "${name}"`);

    this.tweens.clear();
    this.teardownLocation();

    const location = build(this.services());

    this.location = location;
    this.collected.clear();
    this.activeSpotId = undefined;

    engine.scene.add(location.group);

    rig.applyPreset(location.rig);
    rig.setTarget(
      location.character.position.x,
      location.character.position.y,
      location.character.position.z,
    );
    rig.lookAt(
      location.character.position.x,
      location.character.position.y + 1,
      location.character.position.z,
    );

    this.badges?.clear();

    for (const spot of location.spots) {
      this.badges?.add({
        id: spot.id,
        label: spot.label,
        position: new THREE.Vector3(
          spot.x,
          location.badgeHeight?.[spot.id] ?? 2.4,
          spot.z,
        ),
      });
    }

    this.setControls(false);

    // HUD + thẻ chương
    gameEvents.emit("hud", {
      time: location.heading.time,
      chapter: location.heading.title,
    });

    gameEvents.emit("chapter", {
      index: location.heading.index,
      title: location.heading.title,
      subtitle: location.heading.subtitle,
    });

    if (location.spots.length > 0) {
      gameEvents.emit("hud", { memories: 0, total: location.spots.length });
    }

    void storyDirector
      .play(location.story)
      .then(() => {
        // Nhịp cuối của chương có thể đã đổi bối cảnh; khi đó không bật lại
        // điều khiển của cảnh cũ nữa.
        if (this.location === location) this.setControls(true);
      })
      .catch((error: unknown) => {
        console.error("[world] story failed", error);
      });
  }

  private teardownLocation() {
    const location = this.location;

    if (!location) return;

    this.footsteps?.stop();
    this.footsteps = undefined;

    this.location = undefined;

    disposeObject(location.group);
  }

  private setControls(enabled: boolean) {
    this.controlsEnabled = enabled;

    this.input?.setMuted(!enabled);

    if (!enabled) {
      this.location?.character.halt();
      this.badges?.hideAll();
      this.activeSpotId = undefined;
    }

    gameEvents.emit("controls", { enabled });
  }

  private transition(scene: string, duration: number) {
    const overlay = this.overlay;

    if (!overlay || !LOCATIONS[scene]) return Promise.resolve();

    overlay.classList.add("is-active");

    return new Promise<void>((resolve) => {
      window.setTimeout(() => {
        this.enter(scene);

        window.setTimeout(() => {
          overlay.classList.remove("is-active");
          resolve();
        }, Math.max(DREAM_PHASE_MS, duration * 0.4));
      }, Math.max(DREAM_PHASE_MS, duration * 0.5));
    });
  }

  // ── Nhịp truyện ─────────────────────────────────────────────────────────

  private attachStage() {
    if (this.stageAttached) return;

    this.stageAttached = true;

    const handlers: StageHandlers = {
      audio: (beat) => this.handleAudio(beat),

      walk: (beat) => {
        const location = this.location;
        const point = location?.walkPoints[beat.to];

        if (!location || !point) {
          throw new Error(`Story: bối cảnh không có điểm đi tới "${beat.to}"`);
        }

        return location.character.walkTo(
          point.x,
          point.z,
          seconds(beat.duration ?? 1500),
        );
      },

      pan: (beat) => {
        const location = this.location;
        const point = location?.panPoints[beat.to];

        if (!location || !point) {
          throw new Error(`Story: bối cảnh không có điểm ngắm "${beat.to}"`);
        }

        return this.rig?.panTo(point, seconds(beat.duration ?? 1200));
      },

      zoom: async (beat) => {
        await this.rig?.dollyTo(beat.level, seconds(beat.duration ?? 1500));

        if (beat.follow) {
          this.rig?.setFollow(true);
          this.rig?.resetPan();
        }
      },

      reveal: (beat) => this.reveal(seconds(beat.duration ?? 1500)),

      controls: (beat) => {
        this.setControls(beat.enabled);
      },

      transition: (beat) => this.transition(beat.scene, beat.duration ?? 3000),
    };

    storyDirector.attachStage({ name: "World", handlers });
  }

  /**
   * Nhịp `audio` — điểm khác duy nhất so với bản cũ: slot nào có nguồn trong
   * không gian thì phát tại chỗ, nên tiếng trống trường đến từ phía trường.
   */
  private handleAudio(beat: BeatOfType<"audio">) {
    const source =
      beat.op === "play"
        ? this.location?.spatialSources?.[beat.slot as AudioSlot]
        : undefined;

    if (source) {
      const voice = this.audio.playAt(beat.slot as AudioSlot, source, {
        volume: beat.volume ?? 0.5,
        loop: false,
        id: `beat-${beat.slot}`,
      });

      window.setTimeout(() => voice.stop(), 9000);

      return;
    }

    return this.storyAudio(beat);
  }

  /** Nhịp `reveal`: nhân vật hiện dần ra khỏi làn sáng (giây). */
  private reveal(duration: number) {
    const character = this.location?.character;

    if (!character) return Promise.resolve();

    character.setOpacity(0);

    this.rig?.resetPan();

    return this.tweens.add({
      duration,
      onUpdate: (t) => character.setOpacity(t),
    });
  }

  // ── Điểm ký ức ──────────────────────────────────────────────────────────

  private updateBadges() {
    const location = this.location;

    if (!location || location.spots.length === 0) return;

    const position = location.character.position;

    const match = findActiveSpot(
      position.x,
      position.z,
      location.spots,
      this.collected,
    );

    if (match?.spot.id !== this.activeSpotId) {
      this.activeSpotId = match?.spot.id;

      if (match) this.badges?.show(match.spot.id);
      else this.badges?.hideAll();
    }

    if (match && this.controlsEnabled && this.input?.consumeInteract()) {
      void this.remember(match.spot);
    }
  }

  private async remember(spot: Spot<StoryLine>) {
    const location = this.location;

    if (!location) return;

    this.setControls(false);

    await storyDirector.say(spot.payload as StoryLine);

    // Cảnh có thể đã đổi trong lúc người chơi đọc — đừng đếm hồi ký vào sân
    // của chương khác.
    if (this.location !== location) return;

    playSfx("chime");

    this.collected.add(spot.id);

    gameEvents.emit("hud", {
      memories: this.collected.size,
      total: location.spots.length,
    });

    this.setControls(true);
  }

  private updateFootsteps() {
    const location = this.location;

    if (!location) return;

    const moving = location.character.speed > 0.4 && this.controlsEnabled;
    const position = location.character.position;

    if (moving && !this.footsteps) {
      this.footsteps = this.audio.playAt(location.footstepSlot, position, {
        volume: 0.15,
        loop: true,
        id: "steps",
      });
    } else if (!moving && this.footsteps) {
      this.footsteps.stop();
      this.footsteps = undefined;
    }

    this.footsteps?.move(position);
  }
}

/** Tấm phủ trắng của giấc mơ (CSS quyết định hình dạng của nó). */
function createDreamOverlay(container: HTMLElement): HTMLDivElement {
  const overlay = document.createElement("div");

  overlay.className = "dream";
  overlay.setAttribute("aria-hidden", "true");
  container.appendChild(overlay);

  return overlay;
}

export const worldGame = new WorldGame();
