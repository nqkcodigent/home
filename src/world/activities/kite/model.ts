/**
 * Thả diều — luật chơi, thuần số, không biết three.js cũng không biết React.
 *
 * Vì sao tách hẳn ra: đây là chỗ dễ sai nhất của một minigame (cân bằng, trần
 * độ cao, lúc nào thì đứt dây), và cũng là thứ duy nhất không thể "nhìn là
 * biết đúng". Tách ra thì mô phỏng 60 giây chạy trong vài mili-giây của unit
 * test, còn lớp 3D chỉ còn việc vẽ kết quả.
 *
 * ── Luật chơi, học trong năm giây ──────────────────────────────────────────
 * *Muốn lên cao thì phải thả dây dài, mà dây càng dài thì càng dễ đứt.*
 *
 * Đó là toàn bộ trò chơi, và mọi công thức dưới đây phục vụ đúng một câu đó:
 *
 *  - **Lực nâng** chỉ phụ thuộc sức gió. Gió mạnh thì diều lên, gió lặng thì
 *    diều tụt — người chơi không điều khiển được, chỉ phải chịu.
 *  - **Trần độ cao** bằng độ dài dây đang thả. Thả thêm dây là cách duy nhất
 *    để lên cao hơn.
 *  - **Lực căng** = gió × độ dài dây. Dây thả hết cỡ mà gặp cơn gió mạnh là
 *    đứt. Người chơi phải *thu dây lại* mỗi khi thanh căng nhích lên.
 *  - **Nhiệt lưu** (cột khí nóng) cho lực nâng gấp đôi và cộng điểm, nhưng
 *    cũng kéo căng thêm một chút — phần thưởng có giá của nó.
 *
 * Cố ý KHÔNG có hình phạt cho việc thu dây (ngoài việc mất độ cao): người
 * chơi mới phải luôn có một nước đi an toàn rõ ràng. Một mô phỏng mà "chữa
 * cháy cũng làm mọi thứ tệ hơn" thì không dạy được gì.
 */

export type KiteOutcome = "landed" | "snapped" | "timeout";

export interface KiteInput {
  /** > 0 thu dây vào (mất độ cao nhưng hạ lực căng), < 0 thả dây ra */
  reel: number;
  /** -1 … 1: lạng sang trái/phải để tìm cột khí nóng */
  steer: number;
}

export interface KiteTuning {
  /** Thời lượng một ván (giây) */
  duration: number;
  /** Gió nền */
  windBase: number;
  /** Biên độ gió giật */
  windSwing: number;
  /** Tốc độ thu/thả dây (mét/giây) */
  feedRate: number;
  /** Dây ngắn nhất / dài nhất (mét) */
  lineMin: number;
  lineMax: number;
  /** Tỉ lệ dây thành trần độ cao — diều không thể cao hơn dây đang giữ */
  lineCeiling: number;
  /** Tốc độ lạng ngang (mét/giây) */
  steerSpeed: number;
  /** Tốc độ bị gió đẩy trôi (mét/giây khi gió mạnh nhất) */
  driftSpeed: number;
  /** Lực nâng (mét/giây² trên mỗi đơn vị gió) */
  lift: number;
  /** Sức ghì của trọng lượng diều (mét/giây²) */
  gravity: number;
  /** Lực nâng của một cột khí nóng (mét/giây) */
  thermalLift: number;
  /** Trần độ cao tuyệt đối (mét) */
  maxAltitude: number;
  /** Lực căng làm đứt dây */
  snapTension: number;
  /** Điểm mỗi mét độ cao, mỗi giây */
  scorePerMetre: number;
  /** Điểm thưởng khi phá kỷ lục độ cao, mỗi mét */
  recordBonus: number;
  /** Điểm thưởng khi bắt được một cột khí nóng */
  thermalBonus: number;
}

export const DEFAULT_KITE: KiteTuning = {
  duration: 45,
  windBase: 0.55,
  windSwing: 0.3,
  feedRate: 9,
  lineMin: 4,
  lineMax: 60,
  lineCeiling: 0.95,
  steerSpeed: 5.5,
  driftSpeed: 1.4,
  lift: 7.5,
  gravity: 2.8,
  thermalLift: 5.5,
  maxAltitude: 90,
  snapTension: 1,
  scorePerMetre: 0.35,
  recordBonus: 2,
  thermalBonus: 40,
};

export interface KiteState {
  /** Thời gian mô phỏng (giây) — cũng là "đồng hồ trời" của trường gió */
  t: number;
  altitude: number;
  /** Tốc độ lên/xuống hiện tại (mét/giây) */
  climb: number;
  /** Vị trí ngang trong vùng trời (mét) */
  lateral: number;
  /** Dây đang thả ra (mét) */
  lineLength: number;
  /** Lực căng dây, 0…1; chạm `snapTension` là đứt */
  tension: number;
  score: number;
  /** Độ cao lớn nhất đã đạt */
  best: number;
  /** Số cột khí nóng đã bắt */
  thermals: number;
  /** Chỉ số các cột đã bắt — để không cộng điểm hai lần */
  captured: number[];
  timeLeft: number;
  over: boolean;
  outcome?: KiteOutcome;
}

export interface Thermal {
  /** Chỉ số cột — dùng để nhớ đã bắt chưa */
  index: number;
  /** Vị trí ngang (mét) */
  x: number;
  radius: number;
  /** 0…1, càng mạnh thì lên càng nhanh */
  strength: number;
  /** Còn sống bao lâu nữa (giây) */
  remaining: number;
}

/** Bề rộng vùng trời mà người chơi được lạng trong đó (mét, mỗi bên). */
export const KITE_SPAN = 15;

/** Chu kỳ sinh cột khí nóng và tuổi thọ của mỗi cột (giây). */
const THERMAL_PERIOD = 6.5;
const THERMAL_LIFE = 14;

/** Phần dư luôn dương, kể cả với số âm — `%` của JS giữ dấu của số bị chia. */
function fract(value: number): number {
  return ((value % 1) + 1) % 1;
}

/**
 * Sức gió tại thời điểm `t` (0,08…1).
 *
 * Ba sóng sin lệch tần số cho ra nhịp gió "thở": có lúc lặng, có lúc giật.
 * Cố ý KHÔNG dùng số ngẫu nhiên: trường gió phải giống nhau ở mọi máy, nếu
 * không thì bảng điểm không so được và test cũng không tất định.
 */
export function windStrength(t: number, tuning: KiteTuning = DEFAULT_KITE): number {
  const wave =
    Math.sin(t * 0.35) * 0.6 +
    Math.sin(t * 0.9 + 1.3) * 0.4 +
    Math.sin(t * 2.3 + 0.7) * 0.18;

  return clamp(tuning.windBase + tuning.windSwing * wave, 0.08, 1);
}

/** Hướng gió theo độ (0 = bắc), xoay chậm — chỉ để HUD có cái mà vẽ. */
export function windDirection(t: number): number {
  return (t * 7 + 20) % 360;
}

/**
 * Các cột khí nóng đang sống ở thời điểm `t`, sắp theo thời điểm sinh.
 *
 * Cột sinh đều đặn theo `THERMAL_PERIOD` tại những vị trí trải theo dãy tỉ lệ
 * vàng — không bao giờ lặp lại đúng chỗ cũ, mà vẫn tất định. Có cột của "đợt
 * trước" còn sống khi người chơi bắt đầu, nên bầu trời trông như đang chạy sẵn
 * chứ không phải sinh ra theo người chơi.
 */
export function thermalsAt(t: number): Thermal[] {
  const last = Math.floor(t / THERMAL_PERIOD);
  const thermals: Thermal[] = [];

  for (let index = last - 2; index <= last + 2; index += 1) {
    const age = t - index * THERMAL_PERIOD;

    if (age < 0 || age > THERMAL_LIFE) continue;

    const place = fract(index * 0.6180339887);
    const power = fract(index * 0.7548776662);
    const size = fract(index * 0.3819660113);

    thermals.push({
      index,
      x: (place * 2 - 1) * KITE_SPAN,
      radius: 2.4 + size * 1.6,
      strength: 0.55 + power * 0.85,
      remaining: THERMAL_LIFE - age,
    });
  }

  return thermals;
}

export function createKiteState(
  tuning: KiteTuning = DEFAULT_KITE,
): KiteState {
  return {
    t: 0,
    // Bắt đầu đã ở trên không: nhịp truyện đưa người chơi vào lúc diều đang
    // lên, không phải cảnh cầm dây chạy lấy đà.
    altitude: 8,
    climb: 1.4,
    lateral: 0,
    lineLength: tuning.lineMin + (tuning.lineMax - tuning.lineMin) * 0.35,
    tension: 0.2,
    score: 0,
    best: 8,
    thermals: 0,
    captured: [],
    timeLeft: tuning.duration,
    over: false,
  };
}

/**
 * Tiến mô phỏng thêm `dt` giây. KHÔNG sửa `state` — trả về trạng thái mới.
 *
 * Thuần như vậy để test có thể chạy hai cách chơi khác nhau trên CÙNG một
 * trường gió rồi so sánh, mà không phải nhân bản gì.
 */
export function stepKite(
  state: KiteState,
  input: KiteInput,
  dt: number,
  tuning: KiteTuning = DEFAULT_KITE,
): KiteState {
  if (state.over || dt <= 0) return state;

  const t = state.t + dt;
  const wind = windStrength(t, tuning);

  // ── Dây ──────────────────────────────────────────────────────────────────
  const lineLength = clamp(
    state.lineLength - input.reel * tuning.feedRate * dt,
    tuning.lineMin,
    tuning.lineMax,
  );

  const span = tuning.lineMax - tuning.lineMin;
  const lineRatio = span > 0 ? (lineLength - tuning.lineMin) / span : 0;

  // ── Vị trí ngang ─────────────────────────────────────────────────────────
  // Gió luôn đẩy diều trôi về một phía; người chơi lạng để bù.
  const lateral = clamp(
    state.lateral + input.steer * tuning.steerSpeed * dt + wind * tuning.driftSpeed * dt,
    -KITE_SPAN * 1.25,
    KITE_SPAN * 1.25,
  );

  const live = thermalsAt(t);
  const thermal = live.find((cone) => Math.abs(lateral - cone.x) <= cone.radius);

  // ── Lực căng ─────────────────────────────────────────────────────────────
  // Một dòng: gió × độ dài dây. Ở 3/4 dây thì lực căng quanh 0,6 và còn chỗ
  // để thở; thả hết dây thì chỉ cần một cơn giật là đứt.
  const tensionTarget = clamp(
    wind * (0.25 + 1.05 * lineRatio) + (thermal ? 0.1 * thermal.strength : 0),
    0,
    1.5,
  );

  const tension = damp(state.tension, tensionTarget, 7, dt);

  // ── Lực nâng và trần độ cao ──────────────────────────────────────────────
  const ceiling = Math.min(lineLength * tuning.lineCeiling, tuning.maxAltitude);

  const climbTarget =
    wind * tuning.lift +
    (thermal ? tuning.thermalLift * thermal.strength : 0) -
    tuning.gravity -
    // Thu dây thì diều bị ghì xuống — đây là cái giá của việc hạ lực căng.
    Math.max(0, input.reel) * 4.5 -
    // Vượt trần thì bị hút về lại, không dán cứng vào trần.
    Math.max(0, state.altitude - ceiling) * 4;

  const climb = damp(state.climb, climbTarget, 2.4, dt);

  const altitude = clamp(state.altitude + climb * dt, 0, ceiling);

  // ── Điểm ─────────────────────────────────────────────────────────────────
  let score = state.score + altitude * tuning.scorePerMetre * dt;

  if (thermal) score += tuning.thermalBonus * 0.5 * thermal.strength * dt;

  const best = Math.max(state.best, altitude);

  if (best > state.best) score += (best - state.best) * tuning.recordBonus;

  let thermals = state.thermals;
  let captured = state.captured;

  if (thermal && !captured.includes(thermal.index)) {
    thermals += 1;
    captured = [...captured, thermal.index];
    score += tuning.thermalBonus;
  }

  // Dọn chỉ số cột đã tắt để mảng không dài mãi theo thời gian.
  const oldestLive = live.length > 0 ? live[0].index : 0;

  captured = captured.filter((index) => index >= oldestLive - 2);

  const timeLeft = Math.max(0, state.timeLeft - dt);

  const base: KiteState = {
    ...state,
    t,
    altitude,
    climb,
    lateral,
    lineLength,
    tension,
    score,
    best,
    thermals,
    captured,
    timeLeft,
  };

  // ── Kết thúc ────────────────────────────────────────────────────────────
  // Ưu tiên đứt dây: nếu vừa cạn giờ vừa đứt thì chuyện đứt dây mới là chuyện
  // người chơi vừa gây ra.
  if (tension >= tuning.snapTension) {
    return { ...base, over: true, outcome: "snapped", climb: -6 };
  }

  if (timeLeft <= 0) {
    return { ...base, over: true, outcome: "timeout", climb: 0 };
  }

  if (altitude <= 0.05 && climb <= 0) {
    return { ...base, over: true, outcome: "landed", climb: 0 };
  }

  return base;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Hàm mượt dùng chung cho mô phỏng — cùng công thức với lớp nhân vật. */
function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}
