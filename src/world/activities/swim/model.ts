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
 *
 * ── Lặn (trục chiều sâu) ───────────────────────────────────────────────────
 * *Sen sâu thì ở dưới; càng ở dưới lâu càng ít hơi.* Hai trong năm bông chìm
 * ở đáy (0,6–1,2 m). Giữ `dive` để chìm; ở dưới nước thì `air` tụt, lên mặt
 * thì hồi. Hết hơi KHÔNG phạt: tự nổi lên, mất đà, đợi hồi nửa hơi mới lặn lại.
 *
 * ── Đàn cá chép ────────────────────────────────────────────────────────────
 * Bốn con cá lượn vòng dưới mặt nước. Bơi chạm được một con là "chạm cá"
 * (`tagged` +1) và con đó vọt đi một quãng rồi mới lượn lại — một trò đuổi
 * bắt nhẹ nhàng giữa hai bông sen, không phải nhiệm vụ.
 */

export interface SwimInput {
  /** > 0 đạp nước tới trước, < 0 lùi nhẹ */
  forward: number;
  /** -1 … 1 quay trái/phải */
  turn: number;
  /** Giữ để lặn xuống; nhả là nổi lên */
  dive?: boolean;
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
  /** Lặn sâu nhất (mét dưới mặt nước) */
  depthMax: number;
  /** Tốc độ chìm khi giữ lặn / nổi khi nhả (mét/giây) */
  diveRate: number;
  riseRate: number;
  /** Ở dưới nước được bao lâu thì hết hơi (giây) */
  breath: number;
  /** Lên mặt nước bao lâu thì đầy hơi lại (giây) */
  breathRecover: number;
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
  depthMax: 1.2,
  diveRate: 0.9,
  riseRate: 1.3,
  breath: 7,
  breathRecover: 3.5,
};

/** Lệch độ sâu tối đa giữa người và bông sen mà vẫn nhặt được (mét). */
export const DEPTH_REACH = 0.35;

/** Từ bông thứ mấy thì sen chìm dưới đáy. */
const SUNK_FROM = 3;

/** Hết hơi rồi thì phải hồi tới mức này mới lặn lại được. */
const GASP_UNTIL = 0.5;

export interface Lotus {
  /** Vị trí HIỆN TẠI trong thế giới (mét) — lớp 3D đặt hoa vào đây */
  x: number;
  z: number;
  /** Điểm neo — sen trôi quanh đây */
  homeX: number;
  homeZ: number;
  /** Pha trôi riêng, để các bông không lắc đồng loạt */
  phase: number;
  /** Nằm sâu bao nhiêu dưới mặt nước (0 = nổi) */
  depth: number;
  /** Đã nhặt chưa */
  caught: boolean;
}

export interface Fish {
  x: number;
  z: number;
  /** Hướng bơi (radian) — lớp 3D xoay cá theo */
  heading: number;
  /** Vòng lượn quanh tâm ao */
  orbit: number;
  phase: number;
  /** Còn hoảng bao lâu (giây) — đang vọt đi, chưa chạm lại được */
  startled: number;
  /** Đã vọt ra xa bao nhiêu khỏi vòng lượn (mét) — tắt dần khi hết hoảng */
  dashX: number;
  dashZ: number;
}

/** Số cá, tầm chạm, và thời gian hoảng sau khi bị chạm. */
export const FISH_COUNT = 4;
const FISH_REACH = 0.6;
const FISH_STARTLE = 2.5;

export interface SwimState {
  /** Thời gian mô phỏng (giây) — sen trôi theo đồng hồ này */
  t: number;
  x: number;
  z: number;
  /** Hướng mũi (radian, 0 = +Z) */
  heading: number;
  /** Tốc độ dọc theo hướng (mét/giây) */
  speed: number;
  /** Đang ở sâu bao nhiêu dưới mặt nước (mét, ≥ 0) */
  depth: number;
  /** Hơi còn lại, 0 … 1 */
  air: number;
  /** Vừa hết hơi — đang ngoi lên thở, chưa lặn lại được */
  gasping: boolean;
  /** Tâm ao — mép bơi và điểm neo hoa đều tính từ đây */
  pond: { x: number; z: number };
  lotuses: Lotus[];
  /** Số bông đã nhặt */
  caught: number;
  total: number;
  /** Bông vừa nhặt ở frame này (chỉ số trong `lotuses`) — lớp 3D nổ hiệu ứng */
  justCaught?: number;
  fish: Fish[];
  /** Số lần chạm được cá */
  tagged: number;
  /** Con cá vừa chạm ở frame này */
  justTagged?: number;
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

    const phase = random() * Math.PI * 2;

    lotuses.push({
      x: homeX,
      z: homeZ,
      homeX,
      homeZ,
      phase,
      depth: index >= SUNK_FROM ? 0.6 + random() * 0.6 : 0,
      caught: false,
    });
  }

  const fish: Fish[] = Array.from({ length: FISH_COUNT }, (_, index) => ({
    x: pond.x,
    z: pond.z,
    heading: 0,
    orbit: pond.radius * (0.35 + 0.12 * index),
    phase: (index / FISH_COUNT) * Math.PI * 2,
    startled: 0,
    dashX: 0,
    dashZ: 0,
  }));

  return {
    t: 0,
    x: pond.x,
    z: pond.z,
    fish,
    tagged: 0,
    // Quay mặt ra (+Z) — hướng nhìn thấy bờ cổng, cũng là hướng của lối vào ao.
    heading: 0,
    speed: 0,
    depth: 0,
    air: 1,
    gasping: false,
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

  // ── Lặn và hơi ─────────────────────────────────────────────────────────
  const sinking = input.dive === true && !state.gasping && state.air > 0;
  const depth = sinking
    ? Math.min(tuning.depthMax, state.depth + tuning.diveRate * step)
    : Math.max(0, state.depth - tuning.riseRate * step);
  const air =
    depth > 0.05
      ? Math.max(0, state.air - step / tuning.breath)
      : Math.min(1, state.air + step / tuning.breathRecover);
  const gasping = air <= 0 || (state.gasping && air < GASP_UNTIL);

  // ── Quay và đạp ────────────────────────────────────────────────────────
  const heading = state.heading + input.turn * tuning.turnRate * step;

  // Nước cản: tốc độ luôn chạy về mục tiêu theo hàm mũ, nên máy 60 fps và
  // máy 144 fps cho cùng một nhịp bơi.
  // Hết hơi thì mất đà: chỉ lo ngoi lên, không đạp tới được.
  const target = gasping
    ? 0
    : input.forward > 0
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

    if (
      Math.hypot(x - x2, z - z2) <= tuning.reach &&
      Math.abs(depth - lotus.depth) <= DEPTH_REACH
    ) {
      caught += 1;
      justCaught = index;

      return { ...lotus, x: x2, z: z2, caught: true };
    }

    return { ...lotus, x: x2, z: z2 };
  });

  // ── Đàn cá ─────────────────────────────────────────────────────────────
  let tagged = state.tagged;
  let justTagged: number | undefined;

  const fish = state.fish.map((one, index) => {
    // Lượn vòng, con lẻ đi ngược chiều; hết hoảng thì quãng vọt tắt dần về 0.
    const direction = index % 2 === 0 ? 1 : -1;
    const angle = one.phase + direction * t * (0.5 - index * 0.06);
    const fade = Math.exp(-1.2 * step);
    let dashX = one.startled > 0 ? one.dashX : one.dashX * fade;
    let dashZ = one.startled > 0 ? one.dashZ : one.dashZ * fade;
    let startled = Math.max(0, one.startled - step);

    const fx = state.pond.x + Math.cos(angle) * one.orbit + dashX;
    const fz = state.pond.z + Math.sin(angle) * one.orbit + dashZ;

    if (startled === 0 && Math.hypot(x - fx, z - fz) <= FISH_REACH) {
      tagged += 1;
      justTagged = index;
      startled = FISH_STARTLE;

      // Vọt ra xa người bơi, nhưng vẫn trong lòng ao.
      const away = Math.atan2(fz - z, fx - x);

      dashX = Math.cos(away) * 1.2;
      dashZ = Math.sin(away) * 1.2;
    }

    const nx = clampToPond(fx, fz, state.pond, tuning.radius);

    return {
      ...one,
      x: nx.x,
      z: nx.z,
      heading: Math.atan2(nx.x - one.x, nx.z - one.z) || one.heading,
      startled,
      dashX,
      dashZ,
    };
  });

  return {
    t,
    x,
    z,
    fish,
    tagged,
    justTagged,
    heading: boundedHeading,
    speed: bounded,
    depth,
    air,
    gasping,
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

function clampToPond(
  x: number,
  z: number,
  pond: { x: number; z: number },
  radius: number,
): { x: number; z: number } {
  const dx = x - pond.x;
  const dz = z - pond.z;
  const distance = Math.hypot(dx, dz);

  if (distance <= radius) return { x, z };

  return { x: pond.x + (dx / distance) * radius, z: pond.z + (dz / distance) * radius };
}
