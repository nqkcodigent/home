import * as THREE from "three";

import { createShuttlecock } from "./Shuttlecock";
import {
  createShuttleState,
  stepShuttle,
  DEFAULT_SHUTTLE,
} from "./model";
import { gameEvents } from "../../../events";

import type { PlayHudPayload } from "../../../events";
import type { Character } from "../../character/Character";
import type { Engine } from "../../Engine";
import type { ShuttleState, ShuttleTuning } from "./model";
import type { SessionReport } from "../index";

/**
 * Ván đá cầu — trò chơi dân gian, và là trò chơi con DUY NHÁT giữ nguyên
 * quyền đi lại cho người chơi.
 *
 * Cả ván là một cuộc chạy: cầu bị đẩy lệch sau mỗi cú đá, nên người chơi
 * phải chạy tới chỗ nó rơi rồi bấm E đúng lúc cầu ở ngang tầm chân. Vì thế
 * `WorldGame` KHÔNG khoá input và KHÔNG tự lái nhân vật trong ván này —
 * vòng lặp chính vẫn chạy y như đang đi dạo, chỉ khác là cú bấm E thuộc về
 * ván (đá) chứ không phải đồ vật.
 *
 * Ván không có thua cuộc: cầu rơi là lượt kết thúc, kỷ lục lưu lại, và cú
 * bấm E kế tiếp là tung lượt mới. `R` thoát ra sân lúc nào cũng được.
 */

/** Thời gian diễn vung chân (giây). */
const KICK_SECONDS = 0.36;

/** Thời gian tối thiểu đẩy số liệu ra bảng (giây). */
const PUBLISH_INTERVAL = 0.1;

export interface ShuttlecockActivityOptions {
  engine: Engine;
  character: Character;
  /** Chỗ cầu nằm chờ — cũng là tâm của điểm tương tác */
  spot: { x: number; z: number };
  /** Cú bấm đá trong frame này (phím E, đã qua hàng đợi một-lần) */
  readKick: () => boolean;
  /** Phím thoát ván vừa được bấm chưa (đọc xong là xoá) */
  readExit: () => boolean;
  /**
   * Bộ số của ván — mặc định là `DEFAULT_SHUTTLE`. Sổ hồi ký đưa vào đây bộ
   * số đã cộng kỹ năng, nhưng lớp này không biết gì về tiến trình.
   */
  tuning?: ShuttleTuning;
}

export class ShuttlecockActivity {
  /** Ván này người chơi vẫn đi lại được — `WorldGame` đọc cờ này. */
  readonly freeMove = true;

  private readonly options: ShuttlecockActivityOptions;

  private readonly tuning: ShuttleTuning;

  private readonly field = createShuttlecock();

  private state: ShuttleState;

  /** Đồng hồ diễn vung chân (giây); âm là đang đứng yên. */
  private kickPose = -1;

  private sincePublish = 0;

  /** Số cú của lượt vừa kết thúc — bộ nhớ frame để báo thành tích. */
  private comboSnapshot = 0;

  private detach: (() => void) | undefined;

  private resolve: (() => void) | undefined;

  private finished = false;

  constructor(options: ShuttlecockActivityOptions) {
    this.options = options;

    this.tuning = options.tuning ?? DEFAULT_SHUTTLE;

    this.state = createShuttleState(options.spot.x, options.spot.z);
  }

  /**
   * Tóm tắt ván vừa xong cho Sổ hồi ký: kỷ lục của trò này là số cú liên tiếp
   * nhiều nhất trong một lượt, đúng con số đang in trên bảng.
   */
  readonly summary = (): SessionReport => ({
    name: "shuttlecock",
    score: this.state.best,
    thermals: 0,
  });

  /** Thêm cầu vào scene và chạy tới khi người chơi bấm thoát. */
  play(): Promise<void> {
    const { engine } = this.options;

    engine.scene.add(this.field.group);

    this.publish(true);

    this.detach = engine.onUpdate(({ dt }) => this.tick(dt));

    return new Promise<void>((resolve) => {
      this.resolve = resolve;
    });
  }

  /** Dỡ cầu khỏi scene. Gọi được nhiều lần. */
  dispose() {
    // Dỡ giữa chừng (HMR, app unmount) vẫn phải TRẢ KẾT QUẢ — xem chú thích
    // tương tự trong `SwimActivity`.
    if (!this.finished) this.finish();

    this.detach?.();
    this.detach = undefined;

    // Dỡ giữa chừng khi chân đang còn giơ — không trả lại thì nhân vật đứng
    // xổng một chân cho tới frame `animate()` kế tiếp.
    this.releasePose();

    this.options.engine.scene.remove(this.field.group);

    this.field.dispose();
  }

  // ── Vòng lặp ────────────────────────────────────────────────────────────

  private tick(dt: number) {
    if (this.options.readExit()) {
      this.finish();

      return;
    }

    this.comboSnapshot = this.state.combo;

    const { character } = this.options;

    this.state = stepShuttle(
      this.state,
      { x: character.position.x, z: character.position.z },
      { kick: this.options.readKick() },
      dt,
      this.tuning,
    );

    if (this.state.justKicked) this.kickPose = 0;
    if (this.state.justLanded && this.comboSnapshot > 0) {
      gameEvents.emit("notice", {
        text: `Đá được ${this.comboSnapshot} cú liên tiếp!`,
        hold: 2200,
      });
    }

    this.render(dt);

    this.sincePublish += dt;
    this.publish(false);
  }

  private render(dt: number) {
    const state = this.state;

    // Cầu nghiêng theo hướng đi ngang — đang bay chứ không phải đang trượt.
    const leanX = THREE.MathUtils.clamp(state.vz * 0.12, -0.5, 0.5);
    const leanZ = THREE.MathUtils.clamp(-state.vx * 0.12, -0.5, 0.5);

    this.field.place(state.x, state.y, state.z, leanX, leanZ, (4 + state.vy) * dt);

    this.updateKickPose(dt);
  }

  /**
   * Diễn vung chân: lớp dáng đi của nhân vật chạy MỖI frame trong vòng lặp
   * chính, nên cú đá phải được ghi đè SAU đó (thứ tự đăng ký listener bảo
   * đảm điều này). Khi hết thời gian vung, lớp dáng đi tự viết lại các khớp
   * từ frame kế tiếp — không cần trả tay.
   */
  private updateKickPose(dt: number) {
    if (this.kickPose < 0) return;

    this.kickPose += dt;

    const progress = this.kickPose / KICK_SECONDS;

    if (progress >= 1) {
      this.kickPose = -1;
      this.releasePose();

      return;
    }

    const rig = this.options.character.rig;

    // Vung chân phải lên — sin nửa chu kỳ: dứt khoát lên, êm hơn khi hạ xuống.
    const swing = Math.sin(Math.PI * progress);

    rig.legR.rotation.x = -swing * 1.15;
    rig.kneeR.rotation.x = swing * 0.5;
    rig.legL.rotation.x = swing * 0.12;
    rig.body.rotation.x = swing * 0.1;
    rig.armL.rotation.x = swing * 0.5;
    rig.armR.rotation.x = -swing * 0.5;
    // Nhảy nhỏ một nhịp — trẻ con đá cầu thì cả người nhấc theo.
    rig.root.position.y = swing * 0.05;
  }

  /** Trả các khớp về 0 — gọi khi hết vung và khi dỡ ván giữa chừng. */
  private releasePose() {
    const rig = this.options.character.rig;

    rig.legR.rotation.x = 0;
    rig.legL.rotation.x = 0;
    rig.kneeR.rotation.x = 0;
    rig.body.rotation.x = 0;
    rig.armL.rotation.x = 0;
    rig.armR.rotation.x = 0;
    rig.root.position.y = 0;
  }

  // ── Bảng số liệu ─────────────────────────────────────────────────────────

  private publish(force: boolean) {
    if (!force && this.sincePublish < PUBLISH_INTERVAL) return;

    this.sincePublish = 0;

    const stats: PlayHudPayload["stats"] = [
      { label: "Liên tiếp", value: `${this.state.combo}` },
      { label: "Kỷ lục", value: `${this.state.best}` },
    ];

    gameEvents.emit("play", {
      visible: !this.finished,
      title: "Đá cầu",
      stats,
      hint:
        this.state.phase === "ready"
          ? this.state.best > 0
            ? "Chạy tới chỗ cầu nằm, bấm E để tung lượt mới · R để ra chơi trò khác"
            : "Đứng gần chiếc cầu rồi bấm E để tung lên"
          : "Bấm E khi cầu ở ngang tầm chân · R để kết thúc",
    });
  }

  // ── Kết thúc ─────────────────────────────────────────────────────────────

  private finish() {
    if (this.finished) return;

    this.finished = true;

    this.detach?.();
    this.detach = undefined;

    gameEvents.emit("play", { visible: false, title: "Đá cầu", stats: [] });

    if (this.state.best > 0) {
      gameEvents.emit("notice", {
        text: `Kỷ lục hôm nay: ${this.state.best} cú liên tiếp`,
        hold: 2200,
      });
    }

    this.resolve?.();
    this.resolve = undefined;
  }
}
