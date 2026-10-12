import * as THREE from "three";

import type { SkyFrame } from "./Kite";

/**
 * Các góc máy của ván thả diều — hàm thuần, không đụng tới camera thật.
 *
 * `KiteActivity` tính một "shot" mỗi frame rồi giao cho `CameraRig.setShot()`;
 * rig lo phần trôi mượt giữa hai góc, nên đổi góc ở đây chỉ là đổi con số.
 *
 * ── Vì sao góc chính là "bay theo diều" ────────────────────────────────────
 * Yêu cầu của người chơi rất rõ: lúc thả diều thì camera phải BAY LÊN và thả
 * trôi theo con diều, chứ không đứng dưới đất ngước lên. Nên `drift` không
 * neo vào nhân vật một chút nào — nó chỉ biết con diều và hướng nó đang bay.
 *
 * Vào ván là camera rời nhân vật bay thẳng lên góc này — không có màn mở đầu
 * nào chen giữa. Ba góc còn lại là để người chơi tự chọn (phím C):
 *
 *  - `wide`  — toàn cảnh từ phía sân: thấy cả người, cả dây, cả diều.
 *  - `eyes`  — sau vai nhân vật, ngước lên; dùng khi dây sắp đứt (nhìn thấy
 *              dây căng từ chỗ người cầm).
 *  - `auto`  — tự đổi góc theo diễn biến: căng thì về `eyes`, vào nhiệt lưu
 *              hoặc trôi tự do thì về `drift`.
 */

export type KiteShotMode = "drift" | "wide" | "eyes" | "auto";

export const KITE_SHOT_MODES: readonly KiteShotMode[] = ["drift", "wide", "eyes", "auto"];

/** Tên hiện trên HUD. */
export const KITE_SHOT_LABELS: Record<KiteShotMode, string> = {
  drift: "Bay theo diều",
  wide: "Toàn cảnh",
  eyes: "Ngước nhìn",
  auto: "Tự động",
};

export interface KiteShotContext {
  frame: SkyFrame;
  /** Vị trí con diều trong thế giới */
  kite: THREE.Vector3;
  /** Vận tốc con diều (mét/giây) — camera trôi ngược lại hướng này */
  velocity: THREE.Vector3;
  altitude: number;
  climb: number;
  tension: number;
  snapTension: number;
  /** Thời gian mô phỏng (giây) */
  t: number;
  /** Dây đã đứt — diều đang trôi tự do */
  adrift: boolean;
  /** Đã trôi bao lâu kể từ lúc đứt dây (giây) */
  driftTime: number;
  /** Diều đang nằm trong một cột khí nóng */
  inThermal: boolean;
}

export interface KiteShot {
  position: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  /** 0…1 — độ rung, rig quy ra góc lệch */
  shake: number;
}

/** Mỗi góc giữ bao lâu ở chế độ tự động (giây). */
const AUTO_HOLD = 6;

const AUTO_CYCLE: readonly Exclude<KiteShotMode, "auto">[] = ["wide", "eyes", "drift"];

export function nextShotMode(mode: KiteShotMode): KiteShotMode {
  return KITE_SHOT_MODES[(KITE_SHOT_MODES.indexOf(mode) + 1) % KITE_SHOT_MODES.length];
}

/**
 * Chế độ tự động chọn góc nào: sự kiện thắng nhịp. Dây sắp đứt thì nhìn từ
 * mắt người cầm dây; vào nhiệt lưu thì bay theo diều cho thấy nó vọt lên.
 */
export function autoShotMode(ctx: KiteShotContext): Exclude<KiteShotMode, "auto"> {
  if (ctx.adrift) return "drift";
  if (ctx.tension >= ctx.snapTension * 0.85) return "eyes";
  if (ctx.inThermal) return "drift";

  return AUTO_CYCLE[Math.floor(ctx.t / AUTO_HOLD) % AUTO_CYCLE.length];
}

/**
 * Góc máy THẬT SỰ dùng ở frame này.
 *
 * Một luật ghi đè lựa chọn của người chơi: **đã đứt dây** thì chỉ còn một
 * cảnh để xem — camera tiếp tục trôi theo con diều đang bay tự do, cho tới khi
 * người chơi bấm R thu diều.
 */
export function resolveShotMode(
  mode: KiteShotMode,
  ctx: KiteShotContext,
): Exclude<KiteShotMode, "auto"> {
  if (ctx.adrift) return "drift";
  if (mode === "auto") return autoShotMode(ctx);

  return mode;
}

/** Rung bắt đầu từ 70% ngưỡng đứt và lên tối đa ở ngưỡng đứt. */
export function shakeAmount(tension: number, snapTension: number): number {
  return clamp((tension - snapTension * 0.7) / (snapTension * 0.3), 0, 1);
}

/** Diều vọt lên thì ống kính nới ra — tối đa thêm 12°. */
export function climbFov(base: number, climb: number): number {
  return base + clamp(climb, 0, 8) * 1.5;
}

const UP = new THREE.Vector3(0, 1, 0);

/** Vector tạm cho các phép dựng hình — hàm vẫn thuần, chỉ khỏi cấp phát. */
const BACK = new THREE.Vector3();
const HEADING = new THREE.Vector3();

export function kiteShot(
  mode: KiteShotMode,
  ctx: KiteShotContext,
  out: KiteShot = { position: new THREE.Vector3(), look: new THREE.Vector3(), fov: 58, shake: 0 },
): KiteShot {
  const { frame, kite } = ctx;
  const resolved = resolveShotMode(mode, ctx);

  if (resolved === "eyes") {
    // Sau vai nhân vật, ngước thẳng lên con diều.
    out.position
      .copy(frame.origin)
      .addScaledVector(UP, 1.45)
      .addScaledVector(frame.forward, -0.7)
      .addScaledVector(frame.right, 0.35);
    out.look.copy(kite);
    out.fov = climbFov(50, ctx.climb);
  } else if (resolved === "drift") {
    driftShot(ctx, out);
  } else {
    wideShot(ctx, out);
  }

  out.shake = shakeAmount(ctx.tension, ctx.snapTension);

  return out;
}

/**
 * Bay theo diều — góc máy chính của ván.
 *
 * Camera lùi lại NGƯỢC HƯỚNG BAY của con diều (lấy từ vận tốc thật, không
 * phải từ hướng thả), cao hơn diều một quãng, và ngắm vào một điểm HƠI XA về
 * phía trước nó. Ba tính chất đó cho ra cảm giác "thả trôi theo diều":
 *
 *  - hướng lùi theo vận tốc nên khi diều đổi hướng, camera lượn theo;
 *  - tầm với nới dần theo độ cao và theo thời gian trôi, nên càng bay lâu thì
 *    khung càng mở, cảnh càng rộng — và cảnh trôi tự do còn rộng hơn nữa;
 *  - tâm ngắm nằm trước diều, nên diều ở một phần ba dưới khung hình và phía
 *    trên là trời: đó là chỗ mắt tìm con diều, và nó cũng để lộ đường bay.
 */
function driftShot(ctx: KiteShotContext, out: KiteShot): void {
  const { frame, kite, velocity } = ctx;

  const speed = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);

  // Diều gần như đứng yên (mới bắt đầu, hoặc vừa đổi hướng) thì lấy hướng thả
  // làm hướng bay — nếu không, hướng sẽ nhiễu loạn vì chia cho số gần 0.
  HEADING.copy(speed > 0.4 ? velocity : frame.forward);

  HEADING.y = 0;

  if (HEADING.lengthSq() < 1e-6) HEADING.copy(frame.forward);

  HEADING.normalize();

  const distance = clamp(
    (ctx.adrift ? 12 : 9) + ctx.altitude * 0.16 + ctx.driftTime * 0.9,
    10,
    30,
  );

  const height = 2.6 + ctx.altitude * 0.05;

  out.position
    .copy(kite)
    .addScaledVector(HEADING, -distance)
    .addScaledVector(UP, height)
    .addScaledVector(frame.right, 1.2);

  // Ngắm trước mũi diều: diều nằm ở phần dưới khung, phần trên là đường bay.
  // Tốc độ được kẹp lại vì một khung hình nhiễu (đổi khung, khởi động) không
  // được phép đẩy tâm ngắm ra xa cả trăm mét.
  const lead = 3 + Math.min(speed, 12) * 0.6;

  out.look.copy(kite).addScaledVector(HEADING, lead).addScaledVector(UP, -0.06 * distance);

  out.fov = climbFov(ctx.adrift ? 66 : 60, ctx.climb);
}

/**
 * Toàn cảnh: đứng cùng phía người chơi, ngước lên con diều.
 *
 * Tầm với gần như KHÔNG nới theo độ cao (0,18 m mỗi mét), khác hẳn cảm giác
 * trực giác là "diều lên cao thì lùi ra". Lùi theo độ cao thì tới lúc diều ở
 * 30 m, nó chỉ còn hơn hai chục điểm ảnh — người chơi không còn NHÌN thấy thứ
 * mình đang chơi. Giữ ống kính ổn định thì cả bầu trời, cả sân và cả con diều
 * đều nằm trong khung.
 */
function wideShot(ctx: KiteShotContext, out: KiteShot): void {
  const { frame, kite } = ctx;

  const distance = clamp(8 + ctx.altitude * 0.18, 10, 19);

  // Điểm neo đứng trên đường dây, lệch về phía diều (0,62): camera ở gần diều
  // hơn nhờ vậy, mà vẫn thuộc về phía người chơi.
  out.look.copy(frame.origin).lerp(kite, 0.62);

  BACK.copy(frame.forward)
    .multiplyScalar(-0.85)
    .addScaledVector(frame.right, 0.5)
    .normalize();

  out.position.copy(out.look).addScaledVector(BACK, distance);
  out.position.y = Math.max(frame.origin.y + 2, out.position.y);

  // NGẮM THẲNG VÀO DIỀU — khác hẳn chỗ đặt camera. Ngắm vào một điểm giữa dây
  // nghe hợp lý, nhưng điểm đó nằm thấp hơn diều cả chục mét khi diều lên cao,
  // và hệ quả là ở 40 m con diều đã vượt ra ngoài mép trên của khung. Hạ tâm
  // ngắm xuống một chút (0,22 × tầm với) để diều nằm ở một phần ba trên.
  out.look.copy(kite);
  out.look.y -= distance * 0.22;

  out.fov = climbFov(58, ctx.climb);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
