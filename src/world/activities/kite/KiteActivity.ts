import * as THREE from "three";

import { KiteField, kiteWorldPosition } from "./Kite";
import { kiteShot, nextShotMode, resolveShotMode } from "./kiteCamera";
import {
  createKiteState,
  endKite,
  stepKite,
  thermalsAt,
  windDirection,
  windStrength,
  DEFAULT_KITE,
} from "./model";
import { gameEvents } from "../../../events";
import { KiteSynth } from "../../audio/kiteSynth";
import { GRASS_CALM_WIND, GRASS_SWAY } from "../../world/Terrain";

import type { SkyFrame } from "./Kite";
import type { KiteShot, KiteShotMode } from "./kiteCamera";
import type { CameraShot } from "../../CameraRig";
import type { KiteInput, KiteOutcome, KiteState, KiteTuning } from "./model";
import type { Character } from "../../character/Character";
import type { Engine } from "../../Engine";
import type { KiteResultPayload } from "../../../events";

/**
 * Ván thả diều — nối mô phỏng (model) với thế giới 3D (KiteField).
 *
 * Lớp này cố tình MỎNG: nó chỉ làm những việc mà các bên kia đều không làm
 * được — chạy trên vòng lặp frame, đẩy số liệu ra HUD, chọn góc máy, lái âm
 * thanh và gió cỏ theo mô phỏng, và trả về kết quả khi ván kết thúc. Mọi luật
 * chơi nằm ở `model.ts`, mọi hình khối ở `Kite.ts`, mọi góc máy ở
 * `kiteCamera.ts`.
 *
 * ── Ai kết thúc ván ────────────────────────────────────────────────────────
 * NGƯỜI CHƠI, bằng phím `R`. Không có đồng hồ đếm ngược nào cắt ngang: dù diều
 * còn nguyên dây hay đã đứt và trôi đi, chỉ đến khi người chơi cất diều thì
 * camera mới rời con diều mà quay về nhân vật. Đó là yêu cầu thẳng của người
 * chơi, và nó cũng là lý do `describeKiteResult` chỉ có hai kết cục.
 *
 * `WorldGame` CHỜ promise của `play()`. Vì ván không tự kết thúc, đường thoát
 * phải luôn tồn tại ở CẢ HAI đầu: phím `R` cho người chơi, và `dispose()` cho
 * hệ thống (HMR, app unmount). Không bao giờ có một promise treo — soft-lock.
 */

export interface KiteActivityOptions {
  engine: Engine;
  /** Nhân vật cầm dây — vị trí tay lấy từ đây */
  character: Character;
  /** Trục điều khiển, do lớp `Input` của game cung cấp */
  readInput: () => KiteInput;
  /** Phím đổi góc máy vừa được bấm chưa (đọc xong là xoá) */
  readViewToggle: () => boolean;
  /** Phím cất diều vừa được bấm chưa (đọc xong là xoá) */
  readExit: () => boolean;
  /**
   * Cổng camera. Truyền một góc máy để giữ camera ở đó, truyền `undefined` để
   * trả camera về góc nhìn thứ ba.
   */
  camera: (shot: CameraShot | undefined) => void;
  /** Hướng diều bay ra, trên mặt phẳng XZ */
  forward: { x: number; z: number };
  /**
   * Độ dài GỢI Ý của ván (ms).
   *
   * Không phải trần thời gian: qua mốc này HUD chỉ nhắc người chơi bấm `R` để
   * thu diều — không gì được phép cắt ngang chuyến phiêu lưu của người chơi.
   */
  suggestedMs?: number;
}

/** Thời gian tối thiểu giữa hai lần đẩy số liệu ra HUD (giây). */
const PUBLISH_INTERVAL = 0.1;

/** Không có gợi ý nào thì nhắc thu diều sau ngần này giây. */
const DEFAULT_HINT_AFTER = 30;

/** Trạng thái "người chơi không lái được nữa" — dùng khi dây đã đứt. */
const NO_INPUT: KiteInput = { reel: 0, steer: 0 };

export class KiteActivity {
  private readonly options: KiteActivityOptions;

  private readonly tuning: KiteTuning = DEFAULT_KITE;

  private readonly field = new KiteField();

  private readonly frame: SkyFrame;

  private readonly kitePosition = new THREE.Vector3();

  private readonly previousKite = new THREE.Vector3();

  private readonly velocity = new THREE.Vector3();

  private readonly velocitySample = new THREE.Vector3();

  private readonly hand = new THREE.Vector3();

  private readonly shot: KiteShot = {
    position: new THREE.Vector3(),
    look: new THREE.Vector3(),
    fov: 58,
    shake: 0,
  };

  private readonly synth = new KiteSynth();

  private view: KiteShotMode = "drift";

  /** Góc máy THẬT SỰ đang dùng — đứt dây thì bị khoá về `drift`. */
  private resolvedView: KiteShotMode = "drift";

  private readonly hintAfter: number;

  private detachView: (() => void) | undefined;

  private state: KiteState;

  private detach: (() => void) | undefined;

  private resolve: ((result: KiteResultPayload) => void) | undefined;

  private sincePublish = 0;

  /** Đã trả kết quả chưa — bảo đảm mỗi ván chỉ kết thúc đúng một lần. */
  private finished = false;

  constructor(options: KiteActivityOptions) {
    this.options = options;

    this.hintAfter = options.suggestedMs
      ? options.suggestedMs / 1000
      : DEFAULT_HINT_AFTER;

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

    // Khung hình đầu chưa có gì để so vận tốc, nên "vị trí trước đó" phải là
    // vị trí XUẤT PHÁT của con diều. Để nguyên gốc toạ độ (0, 0, 0) thì hiệu
    // số đầu tiên là cả chục mét một frame, và camera sẽ ngắm vào một điểm
    // cách con diều hàng trăm mét trong đúng khung hình mở màn.
    kiteWorldPosition(this.frame, this.state, this.previousKite);
  }

  /** Thêm diều vào scene và chạy cho tới khi người chơi cất diều. */
  play(): Promise<KiteResultPayload> {
    const { engine } = this.options;

    engine.scene.add(this.field.group);

    this.publish(true);

    this.synth.start();

    this.detachView = gameEvents.on("kiteView", () => this.cycleView());

    this.detach = engine.onUpdate(({ dt, elapsed }) => this.tick(dt, elapsed));

    return new Promise<KiteResultPayload>((resolve) => {
      this.resolve = resolve;
    });
  }

  /** Dỡ diều khỏi scene và trả camera lại. Gọi được nhiều lần. */
  dispose() {
    // Dỡ giữa chừng (HMR, app unmount) vẫn phải TRẢ KẾT QUẢ: `WorldGame` đang
    // `await` promise này, và một promise không bao giờ giải quyết là
    // soft-lock. `finished` giữ cho ván đã kết thúc không phát kết quả lần hai.
    if (!this.finished) this.finish();

    this.detach?.();
    this.detach = undefined;

    this.detachView?.();
    this.detachView = undefined;

    this.field.dispose();

    this.synth.stop();

    GRASS_SWAY.wind.value = GRASS_CALM_WIND;

    this.options.camera(undefined);
  }

  private cycleView() {
    this.view = nextShotMode(this.view);
  }

  // ── Vòng lặp ────────────────────────────────────────────────────────────

  private tick(dt: number, elapsed: number) {
    if (this.options.readViewToggle()) this.cycleView();

    // Thu diều: kiểm tra TRƯỚC khi tiến mô phỏng, để ván đóng băng đúng ở
    // khung hình người chơi bấm phím.
    if (this.options.readExit()) {
      this.finish();

      return;
    }

    // Dây đứt rồi thì mô phỏng cũng không đọc input nữa — không ai lái được
    // con diều đã mất dây, và để nó "vâng lời" lúc này là nói dối người chơi.
    const input = this.state.phase === "adrift" ? NO_INPUT : this.options.readInput();

    this.state = stepKite(this.state, input, dt, this.tuning);

    this.render(elapsed, dt);

    this.sincePublish += dt;

    this.publish(false);
  }

  private render(elapsed: number, dt: number) {
    const { character } = this.options;
    const wind = windStrength(this.state.t, this.tuning);
    const adrift = this.state.phase === "adrift";

    // Gốc khung trời lấy theo vị trí HIỆN TẠI của nhân vật, nên dây luôn dính
    // đúng tay.
    this.frame.origin.copy(character.position);

    kiteWorldPosition(this.frame, this.state, this.kitePosition);

    // Vận tốc con diều, lọc thông thấp: dùng ngay hiệu số giữa hai frame thì
    // camera rung theo từng bước nhảy của mô phỏng.
    if (dt > 0) {
      this.velocitySample
        .subVectors(this.kitePosition, this.previousKite)
        .divideScalar(dt);

      this.velocity.lerp(this.velocitySample, 1 - Math.exp(-6 * dt));
    }

    this.previousKite.copy(this.kitePosition);

    this.field.placeKite(this.kitePosition, this.frame.origin, wind, elapsed);

    this.hand
      .copy(this.frame.origin)
      .addScaledVector(this.frame.forward, 0.35)
      .setY(this.frame.origin.y + 0.95);

    // Dây đã đứt thì không còn dây để nhìn: `-1` là quy ước "giấu dây" của
    // `KiteField.stretchString`.
    this.field.stretchString(
      this.hand,
      this.kitePosition,
      adrift ? -1 : this.state.tension,
    );

    const lateral = this.state.lateral;

    const context = {
      frame: this.frame,
      kite: this.kitePosition,
      velocity: this.velocity,
      altitude: this.state.altitude,
      climb: this.state.climb,
      tension: this.state.tension,
      snapTension: this.tuning.snapTension,
      t: this.state.t,
      adrift,
      driftTime: this.state.snapAt === undefined ? 0 : this.state.t - this.state.snapAt,
      inThermal: thermalsAt(this.state.t).some(
        (cone) => Math.abs(lateral - cone.x) <= cone.radius,
      ),
    };

    this.resolvedView = resolveShotMode(this.view, context);

    kiteShot(this.view, context, this.shot);

    this.options.camera(this.shot);

    this.synth.update({ altitude: this.state.altitude, wind, tension: this.state.tension });

    GRASS_SWAY.wind.value = GRASS_CALM_WIND + wind * 0.9;
  }

  /** Đẩy số liệu ra HUD theo dạng patch — 10 lần/giây là quá đủ để đọc. */
  private publish(force: boolean) {
    if (!force && this.sincePublish < PUBLISH_INTERVAL) return;

    this.sincePublish = 0;

    const adrift = this.state.phase === "adrift";

    gameEvents.emit("kite", {
      visible: !this.finished,
      phase: this.finished
        ? "over"
        : this.state.t <= 0
          ? "launch"
          : adrift
            ? "adrift"
            : "flying",
      score: Math.round(this.state.score),
      altitude: this.state.altitude,
      tension: this.state.tension,
      wind: windStrength(this.state.t, this.tuning),
      windDirection: windDirection(this.state.t),
      line: this.state.lineLength,
      elapsed: this.state.t,
      drift: this.state.drift,
      thermals: this.state.thermals,
      view: this.resolvedView,
      hint: this.state.t >= this.hintAfter,
    });
  }

  /**
   * Kết thúc ván.
   *
   * Không truyền kết cục thì tự suy ra từ trạng thái: dây đã đứt hay chưa là
   * toàn bộ khác biệt giữa "cất con diều đang bay" và "đi nhặt con diều đã
   * bay mất".
   */
  private finish(outcome?: KiteOutcome) {
    if (this.finished) return;

    this.finished = true;

    this.detach?.();
    this.detach = undefined;

    this.state = endKite(
      this.state,
      outcome ?? (this.state.phase === "adrift" ? "snapped" : "stowed"),
    );

    const result = describeKiteResult(this.state);

    // Bảng số liệu tắt trước, rồi bảng kết quả hiện ra — hai thứ không đè nhau.
    gameEvents.emit("kite", {
      visible: false,
      phase: "over",
      score: result.score,
      altitude: this.state.altitude,
      tension: this.state.tension,
      thermals: this.state.thermals,
      elapsed: this.state.t,
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

  if (state.outcome === "snapped") {
    return {
      outcome: "snapped",
      score,
      bestAltitude,
      title: "Đứt dây",
      detail: `Dây căng quá, đứt phựt một cái. Con diều trôi mãi về phía chân trời rồi nhỏ dần thành một chấm đỏ — ${score} điểm, cao nhất ${bestAltitude} mét.`,
    };
  }

  return {
    outcome: "stowed",
    score,
    bestAltitude,
    title: "Cất diều",
    detail: `Thu dây cuốn lại, lòng vẫn còn vương tiếng sáo. ${score} điểm, cao nhất ${bestAltitude} mét. Chiều nào cũng quay lại thả tiếp được.`,
  };
}
