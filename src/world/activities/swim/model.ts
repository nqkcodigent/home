/**
 * Bơi ao — luật chơi, thuần số, không biết three.js cũng không biết React.
 *
 * Cùng triết lý với mô phỏng diều (`kite/model.ts`): mọi luật chơi nằm ở đây
 * để test chạy vài phút bơi trong vài mili-giây, còn lớp 3D chỉ vẽ kết quả.
 *
 * ── Luật chơi, học trong năm giây ──────────────────────────────────────────
 * *Bơi vòng quanh cái ao, nhặt hết những bông sen đang trôi.*
 *
 *  - Người chơi đạp nước tới (`forward`) và quay (`turn`). Nước cản nên tốc
 *    độ luôn tụt về 0 — muốn giữ nhịp thì phải đạp đều.
 *  - Bơi được giới hạn trong lòng ao: chạm mép là trượt lại vào, không bao
 *    giờ leo được lên bờ trong khi đang bơi.
 *  - Năm bông sen trôi nhẹ quanh một điểm neo (tất định theo `t`, không có
 *    số ngẫu nhiên — cùng một ván luôn cho cùng một kết quả). Bơi tới gần là
 *    nhặt; nhặt hết là xong ván, nhưng người chơi vẫn bơi tiếp được tới khi
 *    tự bấm thoát.
 *
 * Không có đồng hồ đếm ngược và không có hình phạt: đây là trò chơi của trẻ
 * con, không phải bài kiểm tra.
 */

export interface SwimInput {
  /** > 0 đạp nước tới trước, < 0 lùi nhẹ */
  forward: number;
  /** -1 … 1 quay trái/phải */
  turn: number;
}

export interface SwimTuning {
  /** Tốc độ tối đa (mét/giây) */
  glide: number;
  /** Tốc độ quay (radian/giây) */
  turnRate: number;
  /** Hệ số cản nước — càng lớn thì càng mau hết tốc độ */
  drag: number;
  /** Bán kính tối đa được bơi, tính từ tâm ao (mét) */
  radius: number;
  /** Khoảng cách nhặt được một bông sen (mét) */
  reach: number;
  /** Bông sen trôi quanh điểm neo bao xa tối đa (mét) */
  drift: number;
  /** Tốc độ sen trôi (radian/giây) */
  driftRate: number;
  /** Bao cao thân nổi trên mặt nước (mét) */
  floatY: number;
  /** Biên độ nhấp nhô theo nhịp đạp (mét) */
  bob: number;
  /** Nhịp đập tay/chân (radian/giây) — lớp hình thể đọc trực tiếp */
  strokeRate: number;
}

export const DEFAULT_SWIM: SwimTuning = {
  glide: 2.4,
  turnRate: 2.1,
  drag: 2.7,
  // Ao bán kính 3,2 m (Props.createPond): bơi trong 2,75 m là còn một vòng
  // nước trống trước mép cỏ — nhìn thì vẫn là ao, mà chân không với tới bờ.
  radius: 2.75,
  reach: 0.85,
  drift: 0.5,
  driftRate: 0.35,
  floatY: 0.16,
  bob: 0.05,
  strokeRate: 5.5,
};

export interface Lotus {
  /** Vị trí HIỆN TẠI trong thế giới (mét) — lớp 3D đặt hoa vào đây */
  x: number;
  z: number;
  /** Điểm neo — sen trôi quanh đây */
  homeX: number;
  homeZ: number;
  /** Pha trôi riêng, để các bông không lắc đồng loạt */
  phase: number;
  /** Đã nhặt chưa */
  caught: boolean;
}

export interface SwimState {
  /** Thời gian mô phỏng (giây) — sen trôi theo đồng hồ này */
  t: number;
  x: number;
  z: number;
  /** Hướng mũi (radian, 0 = +Z) */
  heading: number;
  /** Tốc độ dọc theo hướng (mét/giây) */
  speed: number;
  /** Tâm ao — mép bơi và điểm neo hoa đều tính từ đây */
  pond: { x: number; z: number };
  lotuses: Lotus[];
  /** Số bông đã nhặt */
  caught: number;
  total: number;
  /** Bông vừa nhặt ở frame này (chỉ số trong `lotuses`) — lớp 3D nổ hiệu ứng */
  justCaught?: number;
  /** Đã nhặt hết sen chưa */
  done: boolean;
}

/** Số bông sen của một ván. */
export const LOTUS_COUNT = 5;

/**
 * PRNG có hạt giống — cùng một ván luôn rải sen ở đúng những chỗ cũ.
 *
 * Sinh nguyên thuỷ, cùng thuật toán với `mulberry` trong `Props`: hai bản sao
 * nhỏ còn hơn một module chung chỉ để dùng hai lần.
 */
function mulberry(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;

    let t = state;

    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Người chơi bắt đầu bơi: nổi ở giữa ao, hướng ra cửa sân (+Z). */
export function createSwimState(
  pond: { x: number; z: number; radius: number },
  seed = 20261015,
): SwimState {
  const random = mulberry(seed);

  const lotuses: Lotus[] = [];

  // Góc vàng: các bông trải đều quanh ao mà không cần tính khoảng cách đôi.
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let index = 0; index < LOTUS_COUNT; index += 1) {
    const angle = index * golden + random() * 0.5;
    const distance = pond.radius * (0.3 + random() * 0.45);

    const homeX = pond.x + Math.cos(angle) * distance;
    const homeZ = pond.z + Math.sin(angle) * distance;

    lotuses.push({
      x: homeX,
      z: homeZ,
      homeX,
      homeZ,
      phase: random() * Math.PI * 2,
      caught: false,
    });
  }

  return {
    t: 0,
    x: pond.x,
    z: pond.z,
    // Quay mặt ra (+Z) — hướng nhìn thấy bờ cổng, cũng là hướng của lối vào ao.
    heading: 0,
    speed: 0,
    pond: { x: pond.x, z: pond.z },
    lotuses,
    caught: 0,
    total: lotuses.length,
    done: false,
  };
}

/** Một bước mô phỏng. Trả về trạng thái MỚI — mô hình bất biến, không đụng vào dữ liệu cũ. */
export function stepSwim(
  state: SwimState,
  input: SwimInput,
  dt: number,
  tuning: SwimTuning = DEFAULT_SWIM,
): SwimState {
  const step = Math.max(0, dt);
  const t = state.t + step;

  // ── Quay và đạp ────────────────────────────────────────────────────────
  const heading = state.heading + input.turn * tuning.turnRate * step;

  // Nước cản: tốc độ luôn chạy về mục tiêu theo hàm mũ, nên máy 60 fps và
  // máy 144 fps cho cùng một nhịp bơi.
  const target =
    input.forward > 0
      ? tuning.glide * Math.min(input.forward, 1)
      : input.forward < 0
        ? tuning.glide * 0.45 * Math.max(input.forward, -1)
        : 0;

  const speed =
    state.speed + (target - state.speed) * (1 - Math.exp(-tuning.drag * step));

  let x = state.x + Math.sin(heading) * speed * step;
  let z = state.z + Math.cos(heading) * speed * step;

  // ── Mép ao ─────────────────────────────────────────────────────────────
  // Chạm mép thì TRƯỢT dọc bờ, đúng cách va chạm của nhân vật đi bộ: chỉ bỏ
  // đi phần vận tốc hướng ra ngoài, giữ nguyên phần đi song song. Nhờ vậy bơi
  // vòng quanh mép ao vẫn mượt, mà không bao giờ leo được lên bờ.
  const dx = x - state.pond.x;
  const dz = z - state.pond.z;
  const distance = Math.hypot(dx, dz);

  let bounded = speed;
  let boundedHeading = heading;

  if (distance > tuning.radius) {
    const normalX = dx / distance;
    const normalZ = dz / distance;

    x = state.pond.x + normalX * tuning.radius;
    z = state.pond.z + normalZ * tuning.radius;

    let velocityX = Math.sin(heading) * speed;
    let velocityZ = Math.cos(heading) * speed;

    const outward = velocityX * normalX + velocityZ * normalZ;

    if (outward > 0) {
      velocityX -= normalX * outward;
      velocityZ -= normalZ * outward;
    }

    bounded = Math.hypot(velocityX, velocityZ);
    // Đâm vuông góc vào bờ thì hướng giữ nguyên (tốc độ đã về gần không);
    // còn bơi chéo thì hướng bị bẻ dần song song mép ao.
    if (bounded > 1e-4) boundedHeading = Math.atan2(velocityX, velocityZ);
  }

  // ── Sen trôi và nhặt ───────────────────────────────────────────────────
  let caught = state.caught;
  let justCaught: number | undefined;

  const lotuses = state.lotuses.map((lotus, index) => {
    if (lotus.caught) return lotus;

    const x2 =
      lotus.homeX + Math.sin(t * tuning.driftRate + lotus.phase) * tuning.drift;
    const z2 =
      lotus.homeZ +
      Math.cos(t * tuning.driftRate * 0.8 + lotus.phase * 1.7) * tuning.drift;

    if (Math.hypot(x - x2, z - z2) <= tuning.reach) {
      caught += 1;
      justCaught = index;

      return { ...lotus, x: x2, z: z2, caught: true };
    }

    return { ...lotus, x: x2, z: z2 };
  });

  return {
    t,
    x,
    z,
    heading: boundedHeading,
    speed: bounded,
    pond: state.pond,
    lotuses,
    caught,
    total: state.total,
    justCaught,
    done: caught >= state.total,
  };
}

/**
 * Độ cao của thân trên mặt nước (mét) — việc của lớp hình thể, nhưng con số
 * thì thuộc về mô hình: cùng một công thức nên sóng và nhịp bơi mới ăn khớp.
 */
export function swimBob(state: SwimState, tuning: SwimTuning = DEFAULT_SWIM): number {
  // Đang đứng yên thì gần như nằm im trên mặt nước; bơi nhanh thì nhịp nhấp
  // rõ hơn — đúng thứ nước thật làm với một đứa trẻ đang đạp chân.
  const lively = Math.min(1, Math.abs(state.speed) / tuning.glide + 0.25);

  return (
    tuning.floatY +
    Math.sin(state.t * tuning.strokeRate) * tuning.bob * lively +
    Math.sin(state.t * 1.7) * 0.02
  );
}
