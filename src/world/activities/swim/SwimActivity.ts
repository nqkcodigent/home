import * as THREE from "three";

import {
  createSwimState,
  stepSwim,
  swimBob,
  DEFAULT_SWIM,
} from "./model";
import { dampAngle } from "../../character/motion";
import { gameEvents } from "../../../events";
import { playSfx } from "../../../ui/sfx";

import type { PlayHudPayload } from "../../../events";
import type { Character } from "../../character/Character";
import type { Engine } from "../../Engine";
import type { SwimInput, SwimState, SwimTuning } from "./model";
import type { SessionReport } from "../index";

/**
 * Ván bơi ao — nối mô phỏng (`model`) với thế giới 3D.
 *
 * Lớp này mỏng như `KiteActivity`: mô phỏng tính vị trí, lớp này vẽ nó ra
 * bằng nhân vật thật (nghiêng người, tay đạp nước, vòng sóng) và đẩy số liệu
 * ra bảng `play`.
 *
 * ── Ai lái nhân vật ────────────────────────────────────────────────────────
 * TRÒ CHƠI, chứ không phải `WorldGame`: trong ván bơi, vòng lặp chính được
 * bảo là KHÔNG đụng vào nhân vật (xem `WorldGame.frame`), nên lớp này set
 * thẳng `root.position`/`rotation` mỗi frame. Vì cùng lý do, khi ván xong nó
 * PHẢI trả lại tư thế đứng (`resetPose`) trước khi trả quyền — nếu không,
 * nhân vật sẽ nằm sấp trên mặt sân suốt buổi còn lại.
 *
 * Ván có ba pha, đều do người chơi cầm cờ: `enter` (trượt xuống nước từ bờ),
 * `swim` (bơi tự do, nhặt sen), `out` (tấp vào bờ). Không có đồng hồ nào cắt
 * ngang — `R` lúc nào cũng đưa người chơi vào bờ, dù đã nhặt hết sen hay chưa.
 */

/** Mặt nước trong `Props.createPond` — trùng con số, không suy đoán. */
const WATER_Y = 0.06;
const WATER_OPACITY = 0.62;

/** Thời lượng pha trượt xuống nước / tấp vào bờ (giây). */
const ENTER_SECONDS = 1.3;
const EXIT_SECONDS = 1.1;

/** Góc nghiêng người khi bơi (radian) — gần như nằm sấp trên mặt nước. */
const SWIM_TILT = 1.18;

/** Thời gian tối thiểu giữa hai lần đẩy số liệu ra bảng (giây). */
const PUBLISH_INTERVAL = 0.1;

/** Một vòng sóng sống bao lâu (giây) và to ra tới đâu (lần). */
const RIPPLE_SECONDS = 1.1;
const RIPPLE_GROW = 3.4;
const RIPPLE_INTERVAL = 0.5;

interface Ripple {
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  age: number;
}

export interface SwimActivityOptions {
  engine: Engine;
  character: Character;
  /** Tâm ao và bán kính THẬT của ao — mô hình tự kẹp lại nhỏ hơn một quãng */
  pond: { x: number; z: number; radius: number };
  /** Điểm trên bờ — nhân vật trượt xuống nước từ đây và cũng tấp vào đây */
  entry: { x: number; z: number };
  /** Trục điều khiển, do lớp `Input` của game cung cấp */
  readInput: () => SwimInput;
  /** Phím thoát ván vừa được bấm chưa (đọc xong là xoá) */
  readExit: () => boolean;
  /**
   * Bộ số của ván — mặc định là `DEFAULT_SWIM`. Sổ hồi ký đưa vào đây bộ số
   * đã cộng kỹ năng, nhưng lớp này không biết gì về tiến trình.
   */
  tuning?: SwimTuning;
}

export class SwimActivity {
  /** Ván này TỰ LÁI nhân vật — `WorldGame` đọc cờ này để không giẫm chân. */
  readonly drivesCharacter = true;

  private readonly options: SwimActivityOptions;

  private readonly tuning: SwimTuning;

  private readonly group = new THREE.Group();

  private readonly waterPosition = new THREE.Vector3();

  private state: SwimState;

  private phase: "enter" | "swim" | "out" = "enter";

  /** Đồng hồ của pha hiện tại (giây) */
  private phaseTime = 0;

  /** Độ nghiêng người — 0 đứng trên bờ, 1 nằm trên mặt nước */
  private immerse = 0;

  private readonly lotusGroups: THREE.Group[] = [];

  private readonly fishGroups: THREE.Group[] = [];

  /** Vật liệu mặt ao (nếu cảnh có) — đục dần khi lặn sâu, trả lại khi lên bờ */
  private water: THREE.MeshStandardMaterial | undefined;

  private readonly ripples: Ripple[] = [];

  private sinceRipple = 0;

  private sincePublish = 0;

  private detach: (() => void) | undefined;

  private resolve: (() => void) | undefined;

  /** Đã trả quyền chưa — mỗi ván chỉ kết thúc đúng một lần. */
  private finished = false;

  constructor(options: SwimActivityOptions) {
    this.options = options;

    this.tuning = options.tuning ?? DEFAULT_SWIM;

    this.state = createSwimState(options.pond);

    this.group.name = "swim-field";

    this.buildLotuses();
    this.buildFish();
    this.buildRipples();
  }

  /** Thêm trường hoa vào scene và chạy tới khi người chơi tấp vào bờ. */
  play(): Promise<void> {
    const { engine } = this.options;

    engine.scene.add(this.group);

    const water = engine.scene.getObjectByName("pond-water");

    if (water instanceof THREE.Mesh && water.material instanceof THREE.MeshStandardMaterial) {
      this.water = water.material;
    }

    this.publish(true);

    this.detach = engine.onUpdate(({ dt, elapsed }) => this.tick(dt, elapsed));

    return new Promise<void>((resolve) => {
      this.resolve = resolve;
    });
  }

  /**
   * Tóm tắt ván vừa xong cho Sổ hồi ký: số sen nhặt được là kỷ lục của trò
   * này. Đọc SAU khi `play()` trả về — lúc đó `caught` đã là con số cuối cùng.
   */
  readonly summary = (): SessionReport => ({
    name: "swim",
    score: this.state.caught,
    thermals: 0,
  });

  /** Dỡ trường hoa, trả nhân vật về tư thế đứng. Gọi được nhiều lần. */
  dispose() {
    // Dỡ giữa chừng (HMR, app unmount) vẫn phải TRẢ QUYỀN: `WorldGame` đang
    // `await` promise này, và một promise không bao giờ giải quyết là soft-lock.
    if (!this.finished) this.finish();

    this.detach?.();
    this.detach = undefined;

    this.resetPose();
    this.options.engine.scene.remove(this.group);

    if (this.water) this.water.opacity = WATER_OPACITY;

    for (const { mesh } of this.ripples) mesh.geometry.dispose();

    for (const lotus of [...this.lotusGroups, ...this.fishGroups]) {
      lotus.traverse((child) => {
        if (child instanceof THREE.Mesh) child.geometry.dispose();
      });
    }
  }

  // ── Vòng lặp ────────────────────────────────────────────────────────────

  private tick(dt: number, elapsed: number) {
    this.phaseTime += dt;

    if (this.phase === "enter") {
      this.immerse = ease(this.phaseTime / ENTER_SECONDS);

      if (this.phaseTime >= ENTER_SECONDS) {
        this.phase = "swim";
        this.phaseTime = 0;
      }
    } else if (this.phase === "swim") {
      this.immerse = 1;

      if (this.options.readExit()) {
        this.beginExit();
      } else {
        this.state = stepSwim(this.state, this.options.readInput(), dt, this.tuning);
      }
    } else {
      this.immerse = 1 - ease(this.phaseTime / EXIT_SECONDS);

      if (this.phaseTime >= EXIT_SECONDS) {
        this.finish();

        return;
      }
    }

    this.render(dt, elapsed);

    this.sincePublish += dt;
    this.publish(false);
  }

  private render(dt: number, elapsed: number) {
    const { character, entry } = this.options;
    const state = this.state;

    // ── Vị trí và tư thế ────────────────────────────────────────────────
    // Pha vào/ra: nhân vật TRƯỢT giữa bờ và vị trí mô hình — hai đầu của một
    // đường thẳng, nên không bao giờ có khung hình nào nhảy tọa độ.
    const modelY = WATER_Y + swimBob(state) - state.depth;
    const bankY = character.root.position.y;

    const x = entry.x + (state.x - entry.x) * this.immerse;
    const z = entry.z + (state.z - entry.z) * this.immerse;
    const y = bankY + (modelY - bankY) * this.immerse;

    this.waterPosition.set(x, y, z);

    character.root.position.copy(this.waterPosition);
    character.root.rotation.y = dampAngle(
      character.root.rotation.y,
      state.heading,
      9,
      dt,
    );
    character.root.rotation.x = SWIM_TILT * this.immerse;

    this.poseSwimmer(elapsed);

    // ── Vòng sóng ───────────────────────────────────────────────────────
    this.sinceRipple += dt;

    const moving = Math.abs(state.speed) > 0.35;

    // Trên mặt nước: vệt sóng sau lưng, bơi càng nhanh vệt càng dày. Dưới
    // nước: bọt khí nổi thành vòng nhỏ trên mặt, thưa hơn — vẫn biết mình ở đâu.
    const surfaced = state.depth < 0.15;
    const pace = Math.min(1, Math.abs(state.speed) / this.tuning.glide);
    const interval = surfaced ? RIPPLE_INTERVAL * (1.3 - pace * 0.9) : RIPPLE_INTERVAL * 1.6;

    if ((surfaced ? moving || state.justCaught !== undefined : true) && this.sinceRipple >= interval) {
      this.sinceRipple = 0;

      // Vệt sóng rơi lại sau lưng nửa thân người, không nở ngay dưới cằm.
      const behind = surfaced ? 0.5 : 0;

      this.spawnRipple(x - Math.sin(state.heading) * behind, z - Math.cos(state.heading) * behind);
    }

    // Lặn càng sâu, mặt nước phía trên càng đục: người bơi chìm dần vào bóng tối.
    if (this.water) {
      this.water.opacity = WATER_OPACITY + (state.depth / this.tuning.depthMax) * 0.22;
    }

    for (const ripple of this.ripples) {
      if (ripple.age < 0) continue;

      ripple.age += dt;

      const grow = 1 + (ripple.age / RIPPLE_SECONDS) * RIPPLE_GROW;

      ripple.mesh.scale.setScalar(grow);
      ripple.mesh.material.opacity =
        0.45 * Math.max(0, 1 - ripple.age / RIPPLE_SECONDS);

      if (ripple.age >= RIPPLE_SECONDS) {
        ripple.age = -1;
        ripple.mesh.visible = false;
      }
    }

    // ── Hoa sen ─────────────────────────────────────────────────────────
    state.lotuses.forEach((lotus, index) => {
      const lotusGroup = this.lotusGroups[index];

      lotusGroup.visible = !lotus.caught;
      // Sen sấp mặt lúc người vừa chạm tới: nhanh mà vẫn nhìn ra được.
      lotusGroup.position.set(lotus.x, WATER_Y + 0.02 - lotus.depth, lotus.z);
      lotusGroup.rotation.y = state.t * 0.2 + lotus.phase;
    });

    if (state.justCaught !== undefined) {
      const lotus = state.lotuses[state.justCaught];

      playSfx("chime");
      this.spawnRipple(lotus.x, lotus.z);
      this.spawnRipple(lotus.x, lotus.z);
    }

    // ── Cá chép ─────────────────────────────────────────────────────────
    state.fish.forEach((fish, index) => {
      const group = this.fishGroups[index];
      // Đang hoảng thì quẫy đuôi nhanh gấp ba.
      const wag = Math.sin(state.t * (fish.startled > 0 ? 24 : 8) + fish.phase) * 0.45;

      group.position.set(fish.x, WATER_Y - 0.28, fish.z);
      group.rotation.y = fish.heading;
      group.children[1].rotation.y = wag;
    });

    if (state.justTagged !== undefined) {
      const fish = state.fish[state.justTagged];

      this.spawnRipple(fish.x, fish.z);
    }
  }

  /** Tư thế bơi: nghiêng người, tay đánh so le, chân đạp — đọc trực tiếp rig. */
  private poseSwimmer(elapsed: number) {
    const rig = this.options.character.rig;

    const lively = Math.min(1, Math.abs(this.state.speed) / this.tuning.glide + 0.2);
    const stroke = Math.sin(this.state.t * this.tuning.strokeRate);

    // Tay đánh so le — bơi ếch nhẹ nhàng, không phải nước rút.
    rig.armL.rotation.x = -1.05 + stroke * 0.7 * lively;
    rig.armR.rotation.x = -1.05 - stroke * 0.7 * lively;
    rig.elbowL.rotation.x = -0.35 - Math.max(0, stroke) * 0.4;
    rig.elbowR.rotation.x = -0.35 - Math.max(0, -stroke) * 0.4;

    // Chân đạp so le, gối gập rất nhẹ.
    rig.legL.rotation.x = stroke * 0.28 * lively;
    rig.legR.rotation.x = -stroke * 0.28 * lively;
    rig.kneeL.rotation.x = Math.max(0, -stroke) * 0.35;
    rig.kneeR.rotation.x = Math.max(0, stroke) * 0.35;

    // Ngẩng mặt lên thở, ngó quanh rất nhẹ khi đứng yên trên nước. Lặn thì
    // chúi đầu xuống: người nghiêng thêm theo độ sâu.
    rig.body.rotation.x = Math.min(1, this.state.depth / 0.4) * 0.35;
    rig.body.rotation.z = stroke * 0.05 * lively;
    rig.head.rotation.x = -0.42 * (1 - Math.min(1, this.state.depth / 0.4));
    rig.head.rotation.y = Math.sin(elapsed * 0.5) * 0.12 * (1 - lively);

    // Gốc rig giữ yên: mọi độ cao do root nhân vật quyết định.
    rig.root.position.y = 0;
  }

  /** Trả nhân vật về tư thế đứng — gọi trước khi trả quyền cho `WorldGame`. */
  private resetPose() {
    const { character } = this.options;

    character.root.rotation.x = 0;
    character.root.rotation.z = 0;

    const rig = character.rig;

    rig.root.position.y = 0;
    rig.body.rotation.set(0, 0, 0);
    rig.head.rotation.set(0, 0, 0);
    rig.armL.rotation.set(0, 0, 0);
    rig.armR.rotation.set(0, 0, 0);
    rig.elbowL.rotation.set(0, 0, 0);
    rig.elbowR.rotation.set(0, 0, 0);
    rig.legL.rotation.set(0, 0, 0);
    rig.legR.rotation.set(0, 0, 0);
    rig.kneeL.rotation.set(0, 0, 0);
    rig.kneeR.rotation.set(0, 0, 0);
  }

  // ── Hiệu ứng ────────────────────────────────────────────────────────────

  private spawnRipple(x: number, z: number) {
    const ripple = this.ripples.find((candidate) => candidate.age < 0);

    if (!ripple) return;

    ripple.age = 0;
    ripple.mesh.visible = true;
    ripple.mesh.scale.setScalar(1);
    ripple.mesh.material.opacity = 0.45;
    ripple.mesh.position.set(x, WATER_Y + 0.012, z);
  }

  // ── Hình khối ────────────────────────────────────────────────────────────

  private buildLotuses() {
    for (const lotus of this.state.lotuses) {
      // Sen chìm phát sáng nhẹ, để nhìn qua làn nước đục vẫn tìm ra.
      const lotusGroup = createLotus(lotus.depth > 0);

      lotusGroup.position.set(lotus.x, WATER_Y + 0.02, lotus.z);

      this.lotusGroups.push(lotusGroup);
      this.group.add(lotusGroup);
    }
  }

  private buildFish() {
    this.state.fish.forEach((_, index) => {
      // Chép cam và chép trắng xen nhau.
      const fish = createFish(index % 2 === 0 ? 0xf08a3c : 0xf4efe6);

      this.fishGroups.push(fish);
      this.group.add(fish);
    });
  }

  private buildRipples() {
    const material = new THREE.MeshBasicMaterial({
      color: 0xdff4ff,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    for (let index = 0; index < 8; index += 1) {
      const mesh = new THREE.Mesh(new THREE.RingGeometry(0.32, 0.4, 28), material.clone());

      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;

      this.ripples.push({ mesh, age: -1 });
      this.group.add(mesh);
    }
  }

  // ── Bảng số liệu ─────────────────────────────────────────────────────────

  /** Đẩy số liệu ra bảng theo dạng patch — 10 lần/giây là quá đủ để đọc. */
  private publish(force: boolean) {
    if (!force && this.sincePublish < PUBLISH_INTERVAL) return;

    this.sincePublish = 0;

    const stats: PlayHudPayload["stats"] = [
      { label: "Sen", value: `${this.state.caught}/${this.state.total}` },
      { label: "Bơi", value: `${Math.floor(this.state.t)} giây` },
      { label: "Hơi", value: `${Math.round(this.state.air * 100)}%` },
      { label: "Chạm cá", value: `${this.state.tagged}` },
    ];

    gameEvents.emit("play", {
      visible: !this.finished,
      title: "Bơi ao",
      stats,
      hint: this.state.gasping
        ? "Hết hơi — ngoi lên thở một chút đã"
        : this.state.done
          ? "Nhặt hết sen rồi — bấm R để vào bờ"
          : "Nhặt sen, đuổi chạm đàn cá chép · giữ Shift để lặn — R để vào bờ",
    });
  }

  // ── Kết thúc ─────────────────────────────────────────────────────────────

  private beginExit() {
    this.phase = "out";
    this.phaseTime = 0;
  }

  private finish() {
    if (this.finished) return;

    this.finished = true;

    this.detach?.();
    this.detach = undefined;

    gameEvents.emit("play", { visible: false, title: "Bơi ao", stats: [] });

    gameEvents.emit("notice", {
      text: this.state.done
        ? `Nhặt đủ ${this.state.total} bông sen — lanh thật!`
        : `Nhặt được ${this.state.caught}/${this.state.total} bông sen`,
      hold: 2400,
    });

    // Trả tư thế đứng NGAY khi ván kết thúc, không đợi tới `dispose()`: promise
    // xong nghĩa là `WorldGame` có thể trả quyền đi bộ ngay tại dòng sau.
    this.resetPose();

    this.resolve?.();
    this.resolve = undefined;
  }
}

/** Cá chép: thân dẹt + đuôi xoè (con thứ hai là đuôi — lớp vẽ quẫy nó). */
function createFish(color: number): THREE.Group {
  const fish = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), material);

  body.scale.set(0.8, 0.55, 2);
  fish.add(body);

  const tail = new THREE.Group();

  tail.position.z = -0.19;

  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 4), material);

  fin.rotation.x = -Math.PI / 2;
  fin.scale.set(1, 1, 0.3);
  fin.position.z = -0.06;
  tail.add(fin);
  fish.add(tail);

  return fish;
}

/** Một bông sen nổi: đài lá tròn + bông hồng cánh xếp + nhụy vàng. */
function createLotus(glow = false): THREE.Group {
  const lotus = new THREE.Group();

  const pad = new THREE.Mesh(
    new THREE.CircleGeometry(0.34, 18),
    new THREE.MeshStandardMaterial({ color: 0x3f8f4a, roughness: 0.9 }),
  );

  pad.rotation.x = -Math.PI / 2;
  pad.receiveShadow = true;

  lotus.add(pad);

  const petalMaterial = new THREE.MeshStandardMaterial({
    color: 0xffb7cf,
    roughness: 0.6,
    emissive: glow ? 0xff8fb8 : 0x000000,
    emissiveIntensity: glow ? 0.7 : 0,
  });

  for (let index = 0; index < 6; index += 1) {
    const angle = (index / 6) * Math.PI * 2;

    const petal = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), petalMaterial);

    petal.scale.set(1, 0.6, 1.7);
    petal.position.set(Math.cos(angle) * 0.1, 0.1, Math.sin(angle) * 0.1);
    petal.rotation.y = -angle;
    petal.castShadow = true;

    lotus.add(petal);
  }

  const heart = new THREE.Mesh(
    new THREE.SphereGeometry(0.06, 8, 6),
    new THREE.MeshStandardMaterial({ color: 0xffd75e, roughness: 0.5 }),
  );

  heart.position.y = 0.13;

  lotus.add(heart);

  return lotus;
}

/** Easing bậc hai — pha vào/ra nước chỉ cần thế. */
function ease(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));

  return clamped * clamped * (3 - 2 * clamped);
}
