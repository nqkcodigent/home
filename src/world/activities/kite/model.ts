/**
 * Thả diều — luật chơi, thuần số, không biết three.js cũng không biết React.
 *
 * Vì sao tách hẳn ra: đây là chỗ dễ sai nhất của một minigame (cân bằng, trần
 * độ cao, lúc nào thì đứt dây), và cũng là thứ duy nhất không thể "nhìn là
 * biết đúng". Tách ra thì mô phỏng vài phút bay chạy trong vài mili-giây của
 * unit test, còn lớp 3D chỉ còn việc vẽ kết quả.
 *
 * ── Luật chơi, học trong năm giây ──────────────────────────────────────────
 * *Muốn lên cao thì phải thả dây dài, mà dây càng dài thì càng dễ đứt.*
 *
 *  - **Lực nâng** chỉ phụ thuộc sức gió. Gió mạnh thì diều lên, gió lặng thì
 *    diều tụt — người chơi không điều khiển được, chỉ phải chịu.
 *  - **Trần độ cao** bằng độ dài dây đang thả. Thả thêm dây là cách duy nhất
 *    để lên cao hơn.
 *  - **Lực căng** = gió × độ dài dây. Căng hết cỡ là đứt ngay.
 *  - **Nguy cơ đứt** (`strain`) tích lại theo thời gian, nhanh hơn khi dây thả
 *    nhiều, khi gió giật, và khi diều đã trôi ra sát mép vùng trời. Nó khiến
 *    *lúc nào* đứt là chuyện không đoán trước được, nhưng KHÔNG cần số ngẫu
 *    nhiên: cùng một lối chơi thì luôn cho cùng một ván, nên test vẫn tất định.
 *
 * ── Ván diều không có đồng hồ ──────────────────────────────────────────────
 * Bản trước đếm ngược 45 giây rồi tự kết thúc. Nay ván chạy tới khi NGƯỜI CHƠI
 * cất diều (`endKite`), vì yêu cầu là: dù diều còn bay hay đã đứt dây trôi đi,
 * chỉ khi người chơi bấm phím thoát thì mới quay lại đi dạo. Mô phỏng vì thế
 * không bao giờ tự đặt `over` — nó chỉ có hai pha:
 *
 *  - `flying`  — dây còn, người chơi lái được, nhiệt lưu còn ăn điểm.
 *  - `adrift`  — dây đã đứt. Diều trôi theo gió và tụt dần, KHÔNG ai lái được
 *    nữa; lái vào lúc này là vô nghĩa nên mô phỏng bỏ qua `steer`/`reel`.
 *    Điểm lúc này đến từ quãng đường trôi — phần thưởng cho chuyến phiêu lưu.
 *
 * Cố ý KHÔNG có hình phạt cho việc thu dây (ngoài việc mất độ cao): người
 * chơi mới phải luôn có một nước đi an toàn rõ ràng.
 */

export type KiteOutcome = "snapped" | "stowed";

/** Hai pha của một ván — xem phần đầu file. */
export type KitePhase = "flying" | "adrift";

export interface KiteInput {
  /** > 0 thu dây vào (mất độ cao nhưng hạ lực căng), < 0 thả dây ra */
  reel: number;
  /** -1 … 1: lạng sang trái/phải để tìm cột khí nóng */
  steer: number;
}

export interface KiteTuning {
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
  /** Lực căng làm đứt dây NGAY (không cần tích nguy cơ) */
  snapTension: number;
  /** Miễn đứt trong bao nhiêu giây đầu — ván nào cũng phải kịp đã */
  snapGrace: number;
  /** Nguy cơ đứt cơ sở (mỗi giây) */
  snapBase: number;
  /** Nguy cơ đứt tăng theo bình phương LỰC CĂNG — sức căng là thứ người chơi đọc được */
  snapLoad: number;
  /** Nguy cơ đứt khi diều trôi ra sát mép vùng trời */
  snapFar: number;
  /** Diều trôi ngang nhanh gấp mấy lần khi đã đứt dây */
  driftEscape: number;
  /** Độ tụt của diều đã đứt dây (mét/giây²) */
  adriftGravity: number;  /** Độ chao đảo của diều đã đứt dây (mét/giây²) */
  adriftWobble: number;
  /** Điểm mỗi mét độ cao, mỗi giây */
  scorePerMetre: number;
  /** Điểm mỗi mét diều trôi ngang sau khi đứt dây */
  driftScore: number;
  /** Điểm thưởng khi phá kỷ lục độ cao, mỗi mét */
  recordBonus: number;
  /** Điểm thưởng khi bắt được một cột khí nóng */
  thermalBonus: number;
}

export const DEFAULT_KITE: KiteTuning = {
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
  snapGrace: 10,
  snapBase: 0.004,
  snapLoad: 0.12,
  snapFar: 0.08,
  driftEscape: 1.6,
  adriftGravity: 1.1,
  adriftWobble: 1.1,
  scorePerMetre: 0.35,
  driftScore: 0.6,
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
  /** Lực căng dây, 0…1; chạm `snapTension` là đứt ngay */
  tension: number;
  score: number;
  /** Độ cao lớn nhất đã đạt */
  best: number;
  /** Số cột khí nóng đã bắt */
  thermals: number;
  /** Chỉ số các cột đã bắt — để không cộng điểm hai lần */
  captured: number[];
  phase: KitePhase;
  /** Nguy cơ đứt tích luỹ, 0…1 — chạm 1 là dây đứt */
  strain: number;
  /** Thời điểm đứt dây (giây, tính từ lúc bắt đầu ván) */
  snapAt?: number;
  /** Quãng đường diều đã trôi ngang sau khi đứt dây (mét) */
  drift: number;
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

/**
 * Vùng trời mà diều ĐÃ ĐỨT DÂY được trôi tới (mét, mỗi bên).
 *
 * Rộng hơn hẳn vùng lái được: mất dây rồi thì diều không còn chịu luật nào
 * ngoài gió, và cái "xa dần" ấy chính là cảm giác phiêu lưu mà cảnh quay phải
 * bám theo. Vẫn có trần, vì trôi vô hạn thì bản đồ và camera đều vô nghĩa.
 */
export const KITE_DRIFT_SPAN = KITE_SPAN * 2.4;

/** Mép vùng trời bắt đầu tính là "diều bay quá xa" (phần của nửa bên). */
const FAR_EDGE = 0.9;

/** Diều đã đứt dây không bao giờ chạm hẳn đất — nó còn lê trên cỏ. */
const ADRIFT_FLOOR = 0.7;

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
 * "Cơn giật" 0…1, giữ nguyên trong khoảng một giây rồi đổi.
 *
 * Đây là chỗ duy nhất tạo cảm giác bất ngờ cho ván diều, và nó tất định: băm
 * số thứ tự của khoảng 1,1 giây ra một con số 0…1. Nhờ vậy lúc đứt dây là
 * chuyện không đoán trước được với người chơi, mà `stepKite` vẫn là hàm thuần
 * — test chạy lại luôn cho cùng kết quả.
 */
export function gustNoise(t: number): number {
  const step = Math.floor(Math.max(0, t) / 1.1);
  const hashed = Math.sin(step * 12.9898 + 4.1414) * 43758.5453;

  return hashed - Math.floor(hashed);
}

/** Hệ số nhân của cơn giật: 0,6…2,2 — trung bình 1,4. */
function gustFactor(t: number): number {
  return 0.6 + gustNoise(t) * 1.6;
}

/**
 * Nguy cơ đứt dây MỖI GIÂY ở trạng thái hiện tại.
 *
 * Ba thành phần, xếp theo mức độ người chơi cảm nhận được:
 *  - nền: ván nào cũng có ngày đứt dây, không ai giữ được con diều mãi;
 *  - **lực căng** (bình phương): thanh căng trên HUD là thứ người chơi liếc
 *    suốt ván, nên rủi ro phải tỉ lệ với đúng con số họ nhìn thấy;
 *  - diều trôi ra sát mép: dấu hiệu "quá xa", tự nhiên nhất để dây đứt.
 *
 * Nhân với `gustFactor` để nguy cơ dồn thành từng cơn chứ không rỉ đều.
 */
export function snapRate(
  state: KiteState,
  tuning: KiteTuning = DEFAULT_KITE,
): number {
  if (state.phase !== "flying") return 0;
  if (state.t < tuning.snapGrace) return 0;

  const span = tuning.lineMax - tuning.lineMin;
  const ratio = span > 0 ? clamp((state.lineLength - tuning.lineMin) / span, 0, 1) : 0;

  const beyond = clamp(
    (Math.abs(state.lateral) - KITE_SPAN * FAR_EDGE) / (KITE_SPAN * (1 - FAR_EDGE)),
    0,
    1,
  );

  const shape =
    tuning.snapBase +
    tuning.snapLoad * state.tension * state.tension +
    tuning.snapFar * beyond * ratio;

  return shape * gustFactor(state.t);
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
    phase: "flying",
    strain: 0,
    snapAt: undefined,
    drift: 0,
    over: false,
  };
}

/**
 * Kết thúc ván theo ý NGƯỜI CHƠI (cất diều).
 *
 * Nằm ở đây chứ không ở lớp ván (KiteActivity) vì đây là một phép biến đổi
 * trạng thái như mọi phép khác, và vì `over` là thứ `stepKite` phải tôn trọng:
 * ván đóng băng ngay tại khung hình người chơi bấm phím, không trôi thêm.
 */
export function endKite(state: KiteState, outcome: KiteOutcome): KiteState {
  if (state.over) return state;

  return { ...state, over: true, outcome, climb: 0 };
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

  if (state.phase === "adrift") {
    return adriftStep(state, t, wind, dt, tuning);
  }

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
  };

  // ── Đứt dây ─────────────────────────────────────────────────────────────
  // Hai đường vào cùng một sự kiện. Căng quá ngưỡng thì đứt ngay lập tức —
  // đó là hình phạt cho việc thả dây hết cỡ. Còn lại thì nguy cơ tích dần,
  // nên dây đứt vào một lúc không ai hẹn trước.
  //
  // Cả hai đường đều phải qua `snapGrace`: ván nào cũng cần một quãng đầu yên
  // ắng, không thì người chơi vừa thấy con diều đã thấy nó bay mất.
  const overstretched =
    t >= tuning.snapGrace && tension >= tuning.snapTension;

  const strain = overstretched
    ? 1
    : Math.min(1, state.strain + snapRate(state, tuning) * dt);

  if (strain >= 1) {
    return {
      ...base,
      phase: "adrift",
      strain: 1,
      snapAt: t,
      // Diều vừa mất dây thì chúi xuống trước đã; quỹ đạo trôi tiếp do
      // `adriftStep` lo.
      tension: 0,
      climb: Math.min(climb, -1.2),
    };
  }

  return { ...base, strain };
}

/**
 * Pha trôi tự do — dây đã đứt.
 *
 * Người chơi không còn lái được gì (`input` bị bỏ qua, đúng như thực tế: mất
 * dây rồi thì chỉ còn đứng nhìn). Diều chao theo từng cơn gió, trôi ngang
 * nhanh hơn hẳn lúc còn dây và tụt dần; chạm cỏ thì lê trên cỏ. Điểm cộng
 * theo quãng đường trôi, nên "đi xa" là phần thưởng, không phải hình phạt.
 */
function adriftStep(
  state: KiteState,
  t: number,
  wind: number,
  dt: number,
  tuning: KiteTuning,
): KiteState {
  // Hai sóng lệch tần số: một nhịp chao chậm và một rung nhỏ như giấy vỗ.
  const flutter =
    Math.sin(t * 1.9) * tuning.adriftWobble +
    Math.sin(t * 4.3 + 1.1) * tuning.adriftWobble * 0.4;

  const lateral = clamp(
    state.lateral + (wind * tuning.driftSpeed * tuning.driftEscape + flutter * 0.6) * dt,
    -KITE_DRIFT_SPAN,
    KITE_DRIFT_SPAN,
  );

  // Còn một chút lực nâng (giấy diều vẫn cưỡi được gió) nhưng không đủ để
  // thắng trọng lượng, nên đường bay là một đường tụt RẤT chậm có chao — gặp
  // cơn giật mạnh thì nó còn lên, hết gió thì tụt vài chục phân một giây.
  //
  // Chậm là chủ ý: cảnh trôi tự do là cảnh phiêu lưu của người chơi. Tụt
  // nhanh thì mười mấy giây sau con diều đã nằm trên cỏ và "bay theo diều"
  // biến thành "nhìn con diều lê trên cỏ".
  const climbTarget = wind * tuning.lift * 0.22 - tuning.adriftGravity + flutter;

  const climb = damp(state.climb, climbTarget, 1.2, dt);

  const altitude = Math.max(ADRIFT_FLOOR, state.altitude + climb * dt);

  const travelled = Math.abs(lateral - state.lateral);

  const best = Math.max(state.best, altitude);

  const score =
    state.score +
    travelled * tuning.driftScore +
    altitude * tuning.scorePerMetre * 0.5 * dt;

  return {
    ...state,
    t,
    altitude,
    climb,
    lateral,
    tension: damp(state.tension, 0, 3, dt),
    score,
    best,
    drift: state.drift + travelled,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Hàm mượt dùng chung cho mô phỏng — cùng công thức với lớp nhân vật. */
function damp(current: number, target: number, rate: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-rate * dt));
}
