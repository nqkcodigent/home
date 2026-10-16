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
 *
 * ── Độ khó ─────────────────────────────────────────────────────────────────
 *  - Đá bằng chân: cửa đá chỉ tới ngang ngực (`kickHigh`), cầu trên đầu là
 *    phải chờ nó rơi.
 *  - *Hoàn hảo* đòi cầu ĐANG RƠI — đá đón lúc cầu còn bay lên là vội.
 *  - Bấm hụt thì khựng chân một nhịp (`whiffRecover`): không spam E được.
 *  - Càng nhiều cú liên tiếp, cầu càng khó: đá một mình thì lệch xa hơn; có
 *    bạn thì bạn trả rộng hơn và căng hơn (bay thấp, rơi sớm).
 *
 * ── Chấm cú đá, và người đá cùng ───────────────────────────────────────────
 * Mỗi lần bấm đá giữa lượt được chấm một từ: *hoàn hảo* (cầu ngang tầm gối,
 * sát chân), *tốt* (vẫn trúng), *hụt* (bấm mà không với tới — cầu bay tiếp).
 * Có `friend` thì cú đá của người chơi BAY SANG BẠN: hoàn hảo là rơi đúng
 * chỗ bạn đứng, tốt là lệch sang bên để bạn phải chạy. Bạn đá trả lại về phía
 * người chơi (lệch một quãng tất định) — chỉ cú của người chơi mới tính combo.
 */

export type ShuttlePhase = "ready" | "rally";

export type KickGrade = "perfect" | "good" | "miss";

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
  /** Cú "hoàn hảo": cầu trong tầm này quanh chân, và ở độ cao này (mét) */
  sweetReach: number;
  sweetLow: number;
  sweetHigh: number;
  /** Bấm hụt thì bao lâu sau mới vung chân lại được (giây) */
  whiffRecover: number;
}

export const DEFAULT_SHUTTLE: ShuttleTuning = {
  gravity: 7.2,
  kickSpeed: 5.4,
  serveSpeed: 6.0,
  reach: 1.15,
  kickLow: 0.1,
  kickHigh: 1.6,
  sway: 0.5,
  climbPerCombo: 0.2,
  climbMax: 1.4,
  airDrag: 0.7,
  serveReach: 1.7,
  sweetReach: 0.6,
  sweetLow: 0.3,
  sweetHigh: 0.95,
  whiffRecover: 0.45,
};

/** Cú "tốt" sang bạn lệch ngần này mét; cú bạn trả về lệch ngần này quanh người chơi. */
const GOOD_MISS = 1.2;
const RETURN_SPREAD = 1.2;

/** Độ khó tăng theo combo tới cú thứ này thì thôi tăng. */
const RAMP_KICKS = 12;
/** Ở đỉnh độ khó: bạn trả lệch thêm ngần này mét, và bớt ngần này lực lên (m/s). */
const RAMP_SPREAD = 1.4;
const RAMP_FLATTEN = 1.3;
/** Ở đỉnh độ khó, đá một mình lệch gấp ngần này lần. */
const RAMP_SWAY = 2.2;

/** 0 … 1 — combo càng cao càng khó, có trần. */
function ramp(combo: number): number {
  return Math.min(1, combo / RAMP_KICKS);
}

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
  /** Chấm điểm cú bấm đá của frame này (không bấm thì `undefined`) */
  grade?: KickGrade;
  /** Ai đá cú gần nhất */
  by: "player" | "friend";
  /** Bạn vừa đá ở frame này — lớp 3D diễn vung chân cho bạn */
  friendKicked: boolean;
  /** Chỗ cú đá gần nhất nhắm rơi xuống — bạn chạy tới đây để đón */
  targetX: number;
  targetZ: number;
  /** Còn khựng chân sau cú bấm hụt (giây) — > 0 thì bấm đá không có tác dụng */
  recover: number;
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
    by: "player",
    friendKicked: false,
    targetX: x,
    targetZ: z,
    recover: 0,
  };
}

/**
 * Vận tốc ngang để cầu đang ở độ cao `y`, vừa được đá lên với `vy`, rơi đúng
 * xuống (toX, toZ). Tính cả ma sát không khí: quãng ngang sau thời gian T là
 * v₀·(1 − e^(−kT))/k, nên v₀ = quãng·k/(1 − e^(−kT)).
 */
function aimVelocity(
  from: { x: number; z: number },
  to: { x: number; z: number },
  y: number,
  vy: number,
  tuning: ShuttleTuning,
): { vx: number; vz: number } {
  const flight = (vy + Math.sqrt(vy * vy + 2 * tuning.gravity * Math.max(0, y))) / tuning.gravity;
  const k = tuning.airDrag;
  const factor = k / (1 - Math.exp(-k * flight));

  return { vx: (to.x - from.x) * factor, vz: (to.z - from.z) * factor };
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
  friend?: { x: number; z: number },
): ShuttleState {
  const step = Math.max(0, dt);
  const t = state.t + step;

  const distance = Math.hypot(state.x - player.x, state.z - player.z);

  // ── Cú bấm đá ──────────────────────────────────────────────────────────
  let { vx, vy, vz, combo } = state;
  let phase = state.phase;
  let justKicked = false;
  let grade: KickGrade | undefined;
  let by = state.by;
  let friendKicked = false;
  let targetX = state.targetX;
  let targetZ = state.targetZ;
  let recover = Math.max(0, state.recover - step);

  if (input.kick && recover === 0) {
    if (phase === "ready" && distance <= tuning.serveReach) {
      // tung cầu lên — lượt mới bắt đầu từ số 0.
      phase = "rally";
      combo = 0;
      vy = tuning.serveSpeed;
      justKicked = true;
      // Tung cho CHÍNH MÌNH đá — coi như bạn vừa chuyền, để bạn đứng yên chờ.
      by = "friend";
      targetX = state.x;
      targetZ = state.z;
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

      grade =
        state.vy <= 0 &&
        distance <= tuning.sweetReach &&
        state.y >= tuning.sweetLow &&
        state.y <= tuning.sweetHigh
          ? "perfect"
          : "good";

      const angle = swayAngle(combo);

      if (friend) {
        // Hoàn hảo thì rơi đúng chỗ bạn; tốt thì lệch, bạn phải chạy đón.
        const miss = grade === "perfect" ? 0 : GOOD_MISS;

        targetX = friend.x + Math.sin(angle) * miss;
        targetZ = friend.z + Math.cos(angle) * miss;
        ({ vx, vz } = aimVelocity(state, { x: targetX, z: targetZ }, state.y, vy, tuning));
      } else {
        // Đá một mình: cú hoàn hảo giữ cầu gần chân hơn.
        const sway =
          tuning.sway * (grade === "perfect" ? 0.4 : 1) * (1 + (RAMP_SWAY - 1) * ramp(combo));

        vx = Math.sin(angle) * sway;
        vz = Math.cos(angle) * sway;
      }

      justKicked = true;
      by = "player";
    } else if (phase === "rally") {
      grade = "miss";
      recover = tuning.whiffRecover;
    }
  }

  // ── Bạn đá trả ─────────────────────────────────────────────────────────
  // Bạn không bao giờ hụt — đá cầu với bạn thân thì bạn luôn là người giỏi
  // hơn. Đá khi cầu đang rơi xuống ngang tầm, rồi nhắm về phía người chơi.
  if (
    friend &&
    phase === "rally" &&
    by === "player" &&
    !justKicked &&
    vy < 0 &&
    state.y >= tuning.kickLow &&
    state.y <= tuning.sweetHigh &&
    Math.hypot(state.x - friend.x, state.z - friend.z) <= tuning.reach
  ) {
    const angle = swayAngle(combo + 50);
    const hard = ramp(combo);
    const spread = RETURN_SPREAD + RAMP_SPREAD * hard;

    vy = tuning.kickSpeed - RAMP_FLATTEN * hard;
    targetX = player.x + Math.sin(angle) * spread;
    targetZ = player.z + Math.cos(angle) * spread;
    ({ vx, vz } = aimVelocity(state, { x: targetX, z: targetZ }, state.y, vy, tuning));
    by = "friend";
    friendKicked = true;
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
    grade,
    by,
    friendKicked,
    targetX,
    targetZ,
    recover,
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
