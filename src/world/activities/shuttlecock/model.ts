/**
 * Đá cầu — luật chơi, thuần số, không biết three.js cũng không biết React.
 *
 * Trò chơi dân gian quen thuộc nhất của sân làng: giữ chiếc cầu bay trên
 * không càng lâu càng tốt. Luật tối giản của bản này:
 *
 *  - **Pha `ready`**: cầu nằm trên sân. Bấm đá (`kick`) khi đứng ngay cạnh là
 *    tung cầu lên — ván bắt đầu.
 *  - **Pha `rally`**: cầu đang bay. Bấm đá đúng lúc cầu ở ngang tầm chân là
 *    một cú đá: cầu vọt lên, và mỗi cú sau cao hơn cú trước một chút. Đá
 *    hụt (cầu quá cao, quá xa, hoặc đã chạm đất) thì cầu rơi — lượt kết
 *    thúc, số cú liên tiếp thành kết quả.
 *  - Cầu không đứng yên một chỗ: mỗi cú đá đẩy nó lệch một hướng tất định
 *    (theo số thứ tự cú đá, không có số ngự nhiên), nên người chơi phải
 *    CHẠY quanh sân — cả ván là một cuộc chạy, đó là lý do trò chơi này giữ
 *    nguyên quyền đi lại (xem `FREE_MOVE_ACTIVITIES`).
 *
 * Không có thua cuộc, không có đồng hồ: bấm đá là chơi lại ngay.
 */

export type ShuttlePhase = "ready" | "rally";

export interface ShuttleInput {
  /** Cú bấm đá trong frame này (phím E — đã qua hàng đợi một-lần) */
  kick: boolean;
}

export interface ShuttleTuning {
  /** Trọng lực (mét/giây²) — cầu lông rơi chậm hơn đá banh nhiều */
  gravity: number;
  /** Tốc độ lên của một cú đá (mét/giây) */
  kickSpeed: number;
  /** Tốc độ tung khi bắt đầu lượt (mét/giây) */
  serveSpeed: number;
  /** Bán kính đá được, tính từ người chơi (mét) */
  reach: number;
  /** Cầu ở cao từ X tới Y mới đá được (mét) — trên đầu thì với không tới */
  kickLow: number;
  kickHigh: number;
  /** Mỗi cú đá đẩy cầu lệch ngang bao nhiêu (mét/giây) */
  sway: number;
  /** Cứ liên tiếp N cú thì tăng tốc độ thêm — cú sau cao hơn cú trước */
  climbPerCombo: number;
  /** Trần tăng thêm đó (mét/giây) — tới hạn thì độ cao thôi, không tăng nữa */
  climbMax: number;
  /** Ma sát không khí cho vận tốc ngang (1/giây) */
  airDrag: number;
  /** Bán kính tung lại được khi cầu đã nằm trên sân (mét) */
  serveReach: number;
}

export const DEFAULT_SHUTTLE: ShuttleTuning = {
  gravity: 7.2,
  kickSpeed: 5.4,
  serveSpeed: 6.0,
  reach: 1.15,
  kickLow: 0.1,
  kickHigh: 2.1,
  sway: 0.5,
  climbPerCombo: 0.2,
  climbMax: 1.4,
  airDrag: 0.7,
  serveReach: 1.7,
};

export interface ShuttleState {
  /** Thời gian mô phỏng (giây) */
  t: number;
  phase: ShuttlePhase;
  /** Vị trí ngang của cầu (toạ độ thế giới) */
  x: number;
  z: number;
  /** Độ cao cầu so với mặt sân (mét) */
  y: number;
  /** Vận tốc */
  vx: number;
  vy: number;
  vz: number;
  /** Số cú liên tiếp trong lượt đang chạy */
  combo: number;
  /** Số cú liên tiếp cao nhất trong phiên chơi */
  best: number;
  /** Cầu vừa được đá ở frame này — lớp 3D bám cờ để diễn vung chân */
  justKicked: boolean;
  /** Cầu vừa chạm đất ở frame này — lớp 3D bám cờ để báo kết quả lượt */
  justLanded: boolean;
}

/** Số cầu bắt đầu: nằm trên sân, chờ người chơi tới đá. */
export function createShuttleState(x: number, z: number): ShuttleState {
  return {
    t: 0,
    phase: "ready",
    x,
    z,
    y: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    combo: 0,
    best: 0,
    justKicked: false,
    justLanded: false,
  };
}

/** Hướng đẩy lệch ngang của cú đá số `combo` — tất định, so le nhau. */
function swayAngle(combo: number): number {
  const fraction = Math.sin(combo * 127.1) * 43758.5453;

  return ((((fraction % 1) + 1) % 1) * Math.PI * 2);
}

/**
 * Một bước mô phỏng. `player` là vị trí người chơi — cầu không biết nó, nhưng
 * luật đá thì so khoảng cách hai người.
 */
export function stepShuttle(
  state: ShuttleState,
  player: { x: number; z: number },
  input: ShuttleInput,
  dt: number,
  tuning: ShuttleTuning = DEFAULT_SHUTTLE,
): ShuttleState {
  const step = Math.max(0, dt);
  const t = state.t + step;

  const distance = Math.hypot(state.x - player.x, state.z - player.z);

  // ── Cú bấm đá ──────────────────────────────────────────────────────────
  let { vx, vy, vz, combo } = state;
  let phase = state.phase;
  let justKicked = false;

  if (input.kick) {
    if (phase === "ready" && distance <= tuning.serveReach) {
      // tung cầu lên — lượt mới bắt đầu từ số 0.
      phase = "rally";
      combo = 0;
      vy = tuning.serveSpeed;
      justKicked = true;
    } else if (
      phase === "rally" &&
      distance <= tuning.reach &&
      state.y >= tuning.kickLow &&
      state.y <= tuning.kickHigh
    ) {
      combo += 1;
      vy = Math.min(
        tuning.kickSpeed + combo * tuning.climbPerCombo,
        tuning.kickSpeed + tuning.climbMax,
      );

      const angle = swayAngle(combo);

      vx = Math.sin(angle) * tuning.sway;
      vz = Math.cos(angle) * tuning.sway;
      justKicked = true;
    }
  }

  // ── Bay ────────────────────────────────────────────────────────────────
  let y = state.y;
  let x = state.x;
  let z = state.z;

  if (phase === "rally") {
    vy -= tuning.gravity * step;
    y += vy * step;

    // Không khí chỉ giữ vận tốc NGANG — độ cao là chuyện của trọng lực.
    const damping = Math.exp(-tuning.airDrag * step);

    vx *= damping;
    vz *= damping;

    x += vx * step;
    z += vz * step;

    if (y <= 0 && vy < 0) {
      // Chạm đất: lượt kết thúc. Cầu nằm lại đúng chỗ rơi — người chơi chạy
      // tới mà tung lại.
      y = 0;
      vx = 0;
      vy = 0;
      vz = 0;
      phase = "ready";

      if (combo > state.best) {
        // best ghi NỐI TIẾP chứ không phải tổng: đó là kỷ-lục-một-lượt mà
        // người chơi nhớ nhất.
        state = { ...state, best: combo };
      }

      combo = 0;
    }
  }

  return {
    ...state,
    t,
    phase,
    x,
    z,
    y,
    vx,
    vy,
    vz,
    combo,
    justKicked,
    justLanded: phase === "ready" && state.phase === "rally",
  };
}

/** Người có đứng gần enough để thấy cầu không — dùng cho nhãn tương tác. */
export function canServe(
  state: ShuttleState,
  player: { x: number; z: number },
  tuning: ShuttleTuning = DEFAULT_SHUTTLE,
): boolean {
  return (
    state.phase === "ready" &&
    Math.hypot(state.x - player.x, state.z - player.z) <= tuning.serveReach
  );
}
