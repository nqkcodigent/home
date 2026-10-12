import * as THREE from "three";

import { KiteField, kiteWorldPosition } from "./Kite";
import {
  createKiteState,
  stepKite,
  thermalsAt,
  windDirection,
  windStrength,
  DEFAULT_KITE,
} from "./model";
import { gameEvents } from "../../../events";

import type { SkyFrame } from "./Kite";
import type { KiteInput, KiteOutcome, KiteState, KiteTuning } from "./model";
import type { Character } from "../../character/Character";
import type { Engine } from "../../Engine";
import type { KiteResultPayload } from "../../../events";

/**
 * Ván thả diều — nối mô phỏng (model) với thế giới 3D (KiteField).
 *
 * Lớp này cố tình MỎNG: nó chỉ làm bốn việc mà cả hai bên kia đều không làm
 * được — chạy trên vòng lặp frame, đẩy số liệu ra HUD, khoá camera theo con
 * diều, và trả về kết quả khi ván kết thúc. Mọi luật chơi nằm ở `model.ts`,
 * mọi hình khối nằm ở `Kite.ts`.
 *
 * Nhịp `activity` trong story.json CHỜ promise của `play()`, nên đường thoát
 * phải luôn tồn tại: mọi cách kết thúc (hết giờ, đứt dây, diều rơi) đều đi qua
 * `finish()`, và `WorldGame` gọi `dispose()` trong `finally`.
 */

export interface KiteActivityOptions {
  engine: Engine;
  /** Nhân vật cầm dây — vị trí tay lấy từ đây */
  character: Character;
  /** Trục điều khiển, do lớp `Input` của game cung cấp */
  readInput: () => KiteInput;
  /**
   * Cổng camera. Truyền một điểm để khoá khung hình vào đó (kèm khoảng cách),
   * truyền `undefined` để trả camera về góc nhìn thứ ba.
   */
  camera: (target: THREE.Vector3 | undefined, distance: number) => void;
  /** Hướng diều bay ra, trên mặt phẳng XZ */
  forward: { x: number; z: number };
  /** Trần thời gian của nhịp truyện (ms) — ghi đè thời lượng mặc định */
  durationMs?: number;
}

/** Thời gian tối thiểu giữa hai lần đẩy số liệu ra HUD (giây). */
const PUBLISH_INTERVAL = 0.1;

export class KiteActivity {
  private readonly options: KiteActivityOptions;

  private readonly tuning: KiteTuning;

  private readonly field = new KiteField();

  private readonly frame: SkyFrame;

  private readonly kitePosition = new THREE.Vector3();

  private readonly hand = new THREE.Vector3();

  private readonly aim = new THREE.Vector3();

  private state: KiteState;

  private detach: (() => void) | undefined;

  private resolve: ((result: KiteResultPayload) => void) | undefined;

  private sincePublish = 0;

  constructor(options: KiteActivityOptions) {
    this.options = options;

    this.tuning = options.durationMs
      ? { ...DEFAULT_KITE, duration: options.durationMs / 1000 }
      : DEFAULT_KITE;

    this.state = createKiteState(this.tuning);

    const forward = new THREE.Vector3(
      options.forward.x,
      0,
      options.forward.z,
    ).normalize();

    this.frame = {
      origin: new THREE.Vector3().copy(options.character.position),
      forward,
      // Trục ngang của vùng trời, vuông góc với hướng bay.
      right: new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize(),
    };
  }

  /** Thêm diều vào scene và chạy tới khi ván kết thúc. */
  play(): Promise<KiteResultPayload> {
    const { engine } = this.options;

    engine.scene.add(this.field.group);

    this.publish(true);

    this.detach = engine.onUpdate(({ dt, elapsed }) => this.tick(dt, elapsed));

    return new Promise<KiteResultPayload>((resolve) => {
      this.resolve = resolve;
    });
  }

  /** Dỡ diều khỏi scene và trả camera lại. Gọi được nhiều lần. */
  dispose() {
    this.detach?.();
    this.detach = undefined;

    this.field.dispose();

    this.options.camera(undefined, 0);
  }

  // ── Vòng lặp ────────────────────────────────────────────────────────────

  private tick(dt: number, elapsed: number) {
    this.state = stepKite(this.state, this.options.readInput(), dt, this.tuning);

    this.render(elapsed);

    this.sincePublish += dt;

    this.publish(false);

    if (this.state.over) this.finish();
  }

  private render(elapsed: number) {
    const { character } = this.options;
    const wind = windStrength(this.state.t, this.tuning);

    // Gốc khung trời lấy theo vị trí HIỆN TẠI của nhân vật: nếu nhịp truyện
    // vừa dịch chuyển họ thì dây vẫn dính đúng tay.
    this.frame.origin.copy(character.position);

    kiteWorldPosition(this.frame, this.state, this.kitePosition);

    this.field.placeKite(this.kitePosition, this.frame.origin, wind, elapsed);

    this.hand
      .copy(this.frame.origin)
      .addScaledVector(this.frame.forward, 0.35)
      .setY(this.frame.origin.y + 0.95);

    this.field.stretchString(this.hand, this.kitePosition, this.state.tension);

    this.field.placeThermals(this.frame, thermalsAt(this.state.t), elapsed);

    // Khung hình phải chứa cả người chơi lẫn con diều: ngắm vào khoảng giữa
    // hai đầu dây, và lùi ra theo độ cao. Ống kính rộng do rig lo.
    this.aim.copy(this.frame.origin).lerp(this.kitePosition, 0.5);

    this.options.camera(this.aim, clamp(14 + this.state.altitude * 0.55, 16, 46));
  }

  /** Đẩy số liệu ra HUD theo dạng patch — 10 lần/giây là quá đủ để đọc. */
  private publish(force: boolean) {
    if (!force && this.sincePublish < PUBLISH_INTERVAL) return;

    this.sincePublish = 0;

    gameEvents.emit("kite", {
      visible: !this.state.over,
      phase: this.state.over ? "over" : this.state.t > 0 ? "flying" : "launch",
      score: Math.round(this.state.score),
      altitude: this.state.altitude,
      tension: this.state.tension,
      wind: windStrength(this.state.t, this.tuning),
      windDirection: windDirection(this.state.t),
      timeLeft: this.state.timeLeft,
      thermals: this.state.thermals,
    });
  }

  private finish() {
    this.detach?.();
    this.detach = undefined;

    const result = describeKiteResult(this.state);

    // Bảng số liệu tắt trước, rồi bảng kết quả hiện ra — hai thứ không đè nhau.
    gameEvents.emit("kite", {
      visible: false,
      phase: "over",
      score: Math.round(this.state.score),
      altitude: this.state.altitude,
      tension: this.state.tension,
      thermals: this.state.thermals,
      timeLeft: this.state.timeLeft,
    });

    gameEvents.emit("kiteResult", result);

    this.resolve?.(result);
    this.resolve = undefined;
  }
}

/**
 * Câu chữ của bảng kết quả — tách riêng để test được, và để câu chuyện của
 * từng cách kết thúc nằm cùng một chỗ thay vì rải trong lớp vẽ.
 */
export function describeKiteResult(state: KiteState): KiteResultPayload {
  const score = Math.round(state.score);
  const bestAltitude = Math.round(state.best);

  const outcome: KiteOutcome = state.outcome ?? "timeout";

  if (outcome === "snapped") {
    return {
      outcome,
      score,
      bestAltitude,
      title: "Đứt dây",
      detail: `Dây căng quá, đứt phựt một cái. Con diều chao đi rồi rơi xuống bụi tre. ${score} điểm, cao nhất ${bestAltitude} mét.`,
    };
  }

  if (outcome === "landed") {
    return {
      outcome,
      score,
      bestAltitude,
      title: "Diều xuống",
      detail: `Giữ dây chặt quá nên diều tụt dần rồi nằm im trên cỏ. ${score} điểm, cao nhất ${bestAltitude} mét.`,
    };
  }

  return {
    outcome,
    score,
    bestAltitude,
    title: "Trời đã tối",
    detail: `Nắng tắt hẳn, đành thu dây cuốn lại. ${score} điểm, cao nhất ${bestAltitude} mét.`,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
