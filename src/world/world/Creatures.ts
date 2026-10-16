import * as THREE from "three";

import { obstacleOffset } from "../physics/collide";
import { terrainHeight } from "../terrain/heightfield";

/**
 * Sinh vật trong sân — thứ khiến một sân vườn im lìm thành một nơi CÓ NGƯỜI.
 *
 * Bốn loài, cùng một triết lý với mọi hình khối trong game: dựng bằng hình
 * khối cơ bản, không model ngoài, và chuyển động do `update()` lái thuần bằng
 * số — không AnimationClip, không mixer, không gì không kiểm soát được.
 *
 *  - **Chim trời**: một đàn bay vòng quanh sân ở độ cao mười mấy mét. Hai con
 *    trong đàn là "chim bám diều": khi người chơi thả diều (`setFocus`), chúng
 *    rời lộ trình, bay vòng quanh cánh diều — đó là toàn bộ lý do có chúng.
 *  - **Chim cành**: đậu trên cột hàng rào, nóc giếng, dây phơi. Tới gần là bay
 *    mất, một lúc sau đậu lại chỗ khác.
 *  - **Gà**: đi bới quanh đống rơm, sổ lông chạy thốc thỉnh khi người chạy
 *    tới gần.
 *  - **Bướm**: lượn quanh mấy khóm hoa, cánh đập liên hồi.
 *
 * Mọi toạ độ đều tất định theo `elapsed` (và một PRNG có hạt giống cho gà),
 * nên sân giống nhau ở mọi lần tải và ở mọi máy — và test so sánh được.
 */

/** Hẹp hơn THREE.Vector3 để các hàm thuần dùng được trong test mà không cần three. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Điểm trên trời mà chim bám theo (con diều) — toạ độ thế giới. */
export interface SkyFocus {
  x: number;
  y: number;
  z: number;
  /**
   * Cột khí nóng gần nhất (tâm ở tầm cao con diều). Có thì phần còn lại của
   * đàn bay lượn xoắn ốc quanh nó — chim lượn thành cột chính là dấu hiệu
   * nhiệt lưu ngoài đời, nên trời vẫn "chỉ có con diều" mà người chơi đọc
   * được chỗ có gió lên.
   */
  thermal?: Vec3 & { radius: number };
}

/** Vùng đi lại của gà — tâm, bán kính, và những chỗ KHÔNG được bước vào. */
export interface WanderZone {
  homeX: number;
  homeZ: number;
  radius: number;
  /** Vật cản hình tròn (đống rơm, chân tường…) */
  avoid: readonly { x: number; z: number; radius: number }[];
}

// ── Hàm thuần — chỗ test bám vào ───────────────────────────────────────────

export interface BirdRoute {
  cx: number;
  cz: number;
  radius: number;
  height: number;
  /** Số vòng bay mỗi giây */
  speed: number;
  phase: number;
  /** Độ méo ellipse — bay vòng tròn tròn thì trông như máy bay mô hình */
  stretch: number;
}

/**
 * Vị trí một con chim trên lộ trình vòng quanh sân tại thời điểm `t`.
 *
 * Có hai gợn sóng nhỏ (độ cao và bán kính lệch pha) — thiếu chúng thì cả
 * đàn là một vòng tròn cứng đờ bay quanh trời như bánh xe.
 */
export function birdRoutePosition(out: Vec3, route: BirdRoute, t: number): Vec3 {
  const angle = route.phase + t * route.speed * Math.PI * 2;

  out.x = route.cx + Math.cos(angle) * route.radius;
  out.z = route.cz + Math.sin(angle) * route.radius * route.stretch;
  out.y =
    route.height +
    Math.sin(angle * 0.7 + route.phase) * 2.2 +
    Math.sin(angle * 1.9) * 0.6;

  return out;
}

/**
 * Vị trí chim bám quanh con diều — một vòng nghiêng, không phải vòng nằm
 * ngang: có con bay dưới diều, có con vờn phía trên, nên khung hình nào cũng
 * thấy vài cánh.
 */
export function birdFocusOrbit(
  out: Vec3,
  focus: SkyFocus,
  route: BirdRoute,
  t: number,
): Vec3 {
  const angle = route.phase + t * 0.55;

  const radius = 5.5 + Math.sin(t * 0.3 + route.phase) * 2;

  out.x = focus.x + Math.cos(angle) * radius;
  out.z = focus.z + Math.sin(angle) * radius;
  out.y = focus.y + Math.sin(angle * 0.8 + route.phase) * 3.5 - 1.2;

  return out;
}

/**
 * Chim lượn nhiệt: bay vòng quanh trục cột khí nóng và từ từ bốc lên, tới
 * đỉnh thì trượt xuống chân cột lượn lại — một chuỗi xoắn ốc không bao giờ
 * dừng. Mỗi con lệch pha nên cả nhóm trải đều thành một "cột chim".
 */
export function birdThermalSpiral(
  out: Vec3,
  thermal: Vec3 & { radius: number },
  route: BirdRoute,
  t: number,
): Vec3 {
  const angle = route.phase * 3 + t * 0.9;
  // Lên 14 m trong ~12 giây rồi bắt đầu lại từ chân cột.
  const climb = (t * 0.085 + route.phase * 0.37) % 1;
  const radius = Math.max(2.5, thermal.radius * 0.8) * (0.9 + Math.sin(t * 0.4 + route.phase) * 0.1);

  out.x = thermal.x + Math.cos(angle) * radius;
  out.z = thermal.z + Math.sin(angle) * radius;
  out.y = thermal.y - 5 + climb * 14;

  return out;
}

/**
 * Chỗ gà định đi bới tiếp — một điểm ngẫu nhiên trong vùng, tránh xa vật
 * cản. Trả `undefined` nếu thử 8 lần chưa ra chỗ đẹp (vùng quá chật) — người
 * gọi để gà đứng im một nhịp rồi thử lại, không bao giờ nhảy vào tường.
 */
export function pickWanderTarget(
  zone: WanderZone,
  random: () => number,
): { x: number; z: number } | undefined {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const angle = random() * Math.PI * 2;
    const distance = Math.sqrt(random()) * zone.radius;

    const x = zone.homeX + Math.cos(angle) * distance;
    const z = zone.homeZ + Math.sin(angle) * distance;

    const blocked = zone.avoid.some(
      (obstacle) =>
        obstacleOffset(obstacle, x, z).distance < obstacle.radius + 0.4,
    );

    if (!blocked) return { x, z };
  }

  return undefined;
}

/**
 * Cột đậu trống kế tiếp của một con chim, tính theo vòng từ cột hiện tại.
 *
 * Chim phải ĐỔI chỗ đậu khi bị hù (quay lại đúng cột cũ thì chuyến bay vô
 * nghĩa), nhưng hai con đậu CHUNG một cột thì chúng nằm đè lên nhau — cùng một
 * toạ độ, cùng một khung hình, trông như một con chim có tám cánh. Vì sân luôn
 * có nhiều cột hơn chim, vòng quét này hầu như luôn tìm được chỗ khác; hết chỗ
 * thì đành ở lại cột cũ.
 */
export function nextFreePerch(
  from: number,
  taken: ReadonlySet<number>,
  count: number,
): number {
  if (count <= 0) return from;

  // Quét các cột KHÁC cột đang đứng: chỗ của chính nó không phải là "đổi chỗ".
  for (let step = 1; step < count; step += 1) {
    const candidate = (from + step) % count;

    if (!taken.has(candidate)) return candidate;
  }

  return from;
}

/**
 * Chỗ gà chạy THOÁT tới khi bị hù: kéo dài đường thẳng người→gà ra sau một
 * quãng, rồi kẹp về vùng. Không bao giờ chạy TỚI người chơi — đó là lỗi kinh
 * điển của mọi con vật chạy trong game.
 */
export function fleeDestination(
  zone: WanderZone,
  from: { x: number; z: number },
  player: { x: number; z: number },
): { x: number; z: number } {
  const dx = from.x - player.x;
  const dz = from.z - player.z;
  const length = Math.hypot(dx, dz);

  const away =
    length > 1e-3
      ? { x: from.x + (dx / length) * 3.2, z: from.z + (dz / length) * 3.2 }
      : { x: zone.homeX, z: zone.homeZ };

  // Kẹp về vùng — chạy ra tận bìa rồi dừng, không vượt qua hàng rào ảo.
  const outX = away.x - zone.homeX;
  const outZ = away.z - zone.homeZ;
  const outDistance = Math.hypot(outX, outZ);

  if (outDistance <= zone.radius) return away;

  return {
    x: zone.homeX + (outX / outDistance) * zone.radius,
    z: zone.homeZ + (outZ / outDistance) * zone.radius,
  };
}

// ── Mô hình ────────────────────────────────────────────────────────────────

function standard(color: number) {
  // Tô mịn: con vật là khối tròn lông mềm, không phải đá đẽo nhiều mặt.
  return new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
}

function box(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  position: [number, number, number],
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);

  mesh.position.set(...position);
  mesh.castShadow = true;

  return mesh;
}

/** Một con chim: mình thuôn, hai cánh gắn qua khớp để vỗ. */
function createBird(bodyColor: number, wingColor: number) {
  const group = new THREE.Group();

  const body = standard(bodyColor);
  const wing = standard(wingColor);

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), body);

  torso.scale.set(0.8, 0.8, 1.5);
  torso.castShadow = true;

  group.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), body);

  head.position.set(0, 0.07, 0.15);
  head.castShadow = true;

  group.add(head);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.06, 6), standard(0xe0a03a));

  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.06, 0.22);

  group.add(beak);

  const tail = box(0.07, 0.015, 0.14, body, [0, 0.02, -0.2]);

  tail.rotation.x = 0.25;
  group.add(tail);

  const wingL = new THREE.Group();
  const wingR = new THREE.Group();

  wingL.position.set(-0.05, 0.04, 0.02);
  wingR.position.set(0.05, 0.04, 0.02);

  const bladeL = box(0.24, 0.012, 0.1, wing, [-0.12, 0, 0]);
  const bladeR = box(0.24, 0.012, 0.1, wing, [0.12, 0, 0]);

  wingL.add(bladeL);
  wingR.add(bladeR);

  group.add(wingL, wingR);

  return { group, wingL, wingR };
}

/** Màu lông gà ta: [mình, cánh/đuôi] — gà mái nâu, gà trắng, gà chọi đen đỏ. */
const CHICKEN_COATS: readonly [number, number][] = [
  [0xb9824a, 0x8a5a30],
  [0xf1ece0, 0xd8cfbd],
  [0x5a3426, 0x2e2622],
  [0xd39a52, 0x9a4e2a],
];

/** Con gà: mình tròn, mỏ, mồng đỏ, hai cánh nhỏ vỗ thốc thỉnh khi chạy. */
function createChicken(coat: readonly [number, number] = CHICKEN_COATS[0]) {
  const group = new THREE.Group();

  const feather = standard(coat[0]);
  const dark = standard(coat[1]);

  const torso = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), feather);

  torso.scale.set(0.85, 0.9, 1.15);
  torso.position.y = 0.26;
  torso.castShadow = true;

  group.add(torso);

  // Đuôi dựng — ba chiếc lông cong nghiêng ra sau.
  for (const tilt of [-0.35, 0, 0.35]) {
    const plume = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), dark);

    plume.scale.set(0.35, 1.7, 0.7);
    plume.position.set(tilt * 0.14, 0.38, -0.18);
    plume.rotation.x = -0.5;
    plume.rotation.z = tilt * 0.4;
    plume.castShadow = true;

    group.add(plume);
  }

  // Đầu và mỏ gắn qua một khớp cổ — lớp update chỉ cần xoay cái đầu để "mổ".
  const head = new THREE.Group();

  head.position.set(0, 0.4, 0.13);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), feather);

  skull.castShadow = true;
  head.add(skull);

  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.07, 6), standard(0xe8933a));

  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, -0.01, 0.09);

  head.add(beak);

  const red = standard(0xc9402e);
  const comb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), red);

  comb.scale.set(0.4, 1, 1.3);
  comb.position.set(0, 0.09, 0.01);
  head.add(comb);

  // Yếm đỏ dưới mỏ, hai mắt đen.
  const wattle = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), red);

  wattle.scale.set(0.6, 1.3, 0.8);
  wattle.position.set(0, -0.06, 0.07);
  head.add(wattle);

  for (const side of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 4), standard(0x1c1410));

    eye.position.set(side * 0.06, 0.02, 0.05);
    head.add(eye);
  }

  group.add(head);

  const wingL = new THREE.Group();
  const wingR = new THREE.Group();

  wingL.position.set(-0.12, 0.28, 0);
  wingR.position.set(0.12, 0.28, 0);

  for (const [wing, side] of [
    [wingL, -1],
    [wingR, 1],
  ] as const) {
    const blade = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 8), dark);

    blade.scale.set(0.3, 0.6, 1.1);
    blade.position.set(side * 0.02, -0.02, -0.03);
    blade.castShadow = true;
    wing.add(blade);
  }

  group.add(wingL, wingR);

  // Hai chân — cylinders mảnh, đủ để đọc là "đang đi".
  const legMaterial = standard(0xe8933a);

  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.14, 5), legMaterial);

    leg.position.set(side * 0.05, 0.07, 0.02);
    leg.castShadow = true;

    group.add(leg);
  }

  return { group, head, wingL, wingR };
}

/** Con bướm: hai cánh tam giác dập dềnh — chỉ cần thế là nhận ra ngay. */
function createButterfly(color: number) {
  const group = new THREE.Group();

  const wingMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });

  const body = box(0.02, 0.02, 0.09, standard(0x3a2c20), [0, 0, 0]);

  group.add(body);

  const wingL = new THREE.Group();
  const wingR = new THREE.Group();

  const bladeL = box(0.1, 0.004, 0.13, wingMaterial, [-0.055, 0, 0]);
  const bladeR = box(0.1, 0.004, 0.13, wingMaterial, [0.055, 0, 0]);

  bladeL.rotation.y = 0.3;
  bladeR.rotation.y = -0.3;

  wingL.add(bladeL);
  wingR.add(bladeR);

  group.add(wingL, wingR);

  return { group, wingL, wingR };
}

// ── Creatures ──────────────────────────────────────────────────────────────

interface FlockBird {
  group: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  route: BirdRoute;
  flap: number;
  /** Một trong hai chim bám theo con diều khi có focus */
  companion: boolean;
  readonly last: THREE.Vector3;
  readonly target: THREE.Vector3;
}

type PerchState = "perch" | "air" | "return";

interface PerchedBird {
  group: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  perch: number;
  state: PerchState;
  /** Còn bao lâu nữa thì chuyển trạng thái (giây) */
  timer: number;
  flap: number;
  readonly velocity: THREE.Vector3;
  readonly last: THREE.Vector3;
  readonly target: THREE.Vector3;
}

interface Chicken {
  group: THREE.Group;
  head: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  random: () => number;
  yaw: number;
  target: { x: number; z: number } | undefined;
  /** Còn bao lâu nữa thì đổi chỗ (giây) */
  idle: number;
  /** Còn bao lâu nữa thì hết giật (giây) */
  fleeing: number;
  pecking: boolean;
  peckTimer: number;
}

interface Butterfly {
  group: THREE.Group;
  wingL: THREE.Group;
  wingR: THREE.Group;
  cx: number;
  cz: number;
  rx: number;
  rz: number;
  phase: number;
  /** 0 đang lượn … 1 đã đậu trên vai người chơi */
  land: number;
}

/** Đứng yên ngần này giây thì một con bướm gần đó bay tới đậu lên vai. */
export const BUTTERFLY_LAND_SECONDS = 15;

/** Chỉ bướm trong tầm này mới để ý tới người đứng yên (m). */
const BUTTERFLY_NOTICE = 12;

export interface CreaturesOptions {
  seed?: number;
  /** Chỗ đậu của chim cành — toạ độ thế giới, tính sẵn độ cao */
  perches: readonly Vec3[];
  /** Vùng đi lại của gà */
  chickenZone: WanderZone;
  /** Vùng lượn của bướm — vài khóm hoa */
  butterflyZones: readonly { x: number; z: number; radius: number }[];
  flockSize?: number;
  chickenCount?: number;
  butterflyCount?: number;
}

const FLOCK_HEIGHT_MIN = 14;
const FLOCK_HEIGHT_MAX = 30;

/** Chim cành bay mất nếu người tới gần hơn ngần này (mét). */
const PERCH_SCARE_DISTANCE = 3.2;

/** Gà giật mình nếu người chạy tới gần hơn ngần này (mét). */
const CHICKEN_FLEE_DISTANCE = 2.1;

/** Vector tạm cho mọi phép dựng hình — không cấp phát trong update. */
const SCRATCH_A = new THREE.Vector3();

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

export class Creatures {
  readonly group = new THREE.Group();

  private readonly flock: FlockBird[] = [];

  private readonly perched: PerchedBird[] = [];

  private readonly chickens: Chicken[] = [];

  private readonly butterflies: Butterfly[] = [];

  private readonly perches: readonly Vec3[];

  private readonly chickenZone: WanderZone;

  private focus: SkyFocus | undefined;

  constructor(options: CreaturesOptions) {
    const random = mulberry(options.seed ?? 70707);

    this.group.name = "creatures";

    this.perches = options.perches;
    this.chickenZone = options.chickenZone;

    const flockSize = options.flockSize ?? 6;

    for (let index = 0; index < flockSize; index += 1) {
      const bird = createBird(0x4d443c, 0x3c352e);

      const route: BirdRoute = {
        cx: (random() - 0.5) * 10,
        cz: (random() - 0.5) * 10,
        radius: 14 + random() * 10,
        height: FLOCK_HEIGHT_MIN + random() * (FLOCK_HEIGHT_MAX - FLOCK_HEIGHT_MIN),
        speed: 0.025 + random() * 0.02,
        phase: random() * Math.PI * 2,
        stretch: 0.72 + random() * 0.3,
      };

      this.flock.push({
        group: bird.group,
        wingL: bird.wingL,
        wingR: bird.wingR,
        route,
        flap: 6 + random() * 3,
        // Hai con đầu đàn là "chim bám diều".
        companion: index < 2,
        last: new THREE.Vector3(),
        target: new THREE.Vector3(),
      });

      this.group.add(bird.group);
    }

    // Chim cành: đan xen nâu sẫm và đen-trắng cho hàng rào đỡ đơn điệu.
    //
    // Luôn để dành hai chỗ đậu trống: bị hù bay đi rồi đậu lại đúng cột cũ thì
    // chuyến bay không có nghĩa gì, mà hai con đậu chung một cột thì chúng nằm
    // đè lên nhau (xem `nextFreePerch`).
    const perchedCount = Math.max(0, options.perches.length - 2);

    options.perches.slice(0, perchedCount).forEach((perch, index) => {
      const bird = createBird(
        index % 2 === 0 ? 0x7a5b3c : 0x2f3138,
        index % 2 === 0 ? 0x63482e : 0x24262c,
      );

      bird.group.position.set(perch.x, perch.y, perch.z);
      bird.group.rotation.y = index * 1.7;

      this.perched.push({
        group: bird.group,
        wingL: bird.wingL,
        wingR: bird.wingR,
        perch: index,
        state: "perch",
        timer: 0,
        flap: 7 + random() * 2,
        velocity: new THREE.Vector3(),
        last: new THREE.Vector3(),
        target: new THREE.Vector3(),
      });

      this.group.add(bird.group);
    });

    const chickenCount = options.chickenCount ?? 3;

    for (let index = 0; index < chickenCount; index += 1) {
      const chicken = createChicken(CHICKEN_COATS[index % CHICKEN_COATS.length]);

      const start = pickWanderTarget(options.chickenZone, random) ?? {
        x: options.chickenZone.homeX,
        z: options.chickenZone.homeZ,
      };

      chicken.group.position.set(start.x, terrainHeight(start.x, start.z), start.z);

      this.chickens.push({
        group: chicken.group,
        head: chicken.head,
        wingL: chicken.wingL,
        wingR: chicken.wingR,
        random: mulberry(1000 + index * 77),
        yaw: random() * Math.PI * 2,
        target: undefined,
        idle: random() * 2,
        fleeing: 0,
        pecking: false,
        peckTimer: random() * 2,
      });

      this.group.add(chicken.group);
    }

    const butterflyCount = options.butterflyCount ?? 4;

    const wingColors = [0xfff2c4, 0xffd9e6, 0xcfe8ff, 0xf6ffcf];

    for (let index = 0; index < butterflyCount; index += 1) {
      const zone =
        options.butterflyZones[index % options.butterflyZones.length] ?? {
          x: 0,
          z: 0,
          radius: 4,
        };

      const butterfly = createButterfly(wingColors[index % wingColors.length]);

      this.butterflies.push({
        group: butterfly.group,
        wingL: butterfly.wingL,
        wingR: butterfly.wingR,
        cx: zone.x,
        cz: zone.z,
        rx: zone.radius * 0.7,
        rz: zone.radius * 0.5,
        phase: random() * Math.PI * 2,
        land: 0,
      });

      this.group.add(butterfly.group);
    }
  }

  /**
   * Điểm trên trời để chim bám theo (con diều). Trả `undefined` để chim về
   * lộ trình — gọi mỗi frame, không tốn gì.
   */
  setFocus(focus: SkyFocus | undefined) {
    this.focus = focus;
  }

  /** Lần gần nhất có chim cành bị hù bay: ở đâu, lúc nào (`elapsed`). */
  lastScare: { x: number; z: number; at: number } | undefined;

  private clock = 0;

  /** Người chơi đã đứng yên bao lâu (giây), và đứng ở đâu */
  private stillFor = 0;

  private readonly lastPlayer = new THREE.Vector3(Number.NaN, 0, 0);

  /** Con bướm đang bay tới / đậu trên vai (chỉ số), nếu có */
  private lander: number | undefined;

  /**
   * `shoulder` là điểm trên vai người chơi (toạ độ thế giới) — có thì bướm
   * đậu lên đó khi người chơi đứng yên đủ lâu; không có thì bướm cứ lượn.
   */
  update(
    dt: number,
    elapsed: number,
    player: { x: number; y: number; z: number },
    shoulder?: Vec3,
  ) {
    const step = Math.min(dt, 0.1);

    this.clock = elapsed;

    const moved = Math.hypot(player.x - this.lastPlayer.x, player.z - this.lastPlayer.z);

    this.stillFor = moved < 0.01 ? this.stillFor + step : 0;
    this.lastPlayer.set(player.x, player.y, player.z);

    if (this.stillFor === 0) this.lander = undefined;

    this.updateFlock(step, elapsed);
    this.updatePerched(step, player);
    this.updateChickens(step, player);
    this.updateButterflies(step, elapsed, shoulder);
  }

  // ── Chim trời ────────────────────────────────────────────────────────────

  private updateFlock(dt: number, elapsed: number) {
    const focus = this.focus;

    for (const bird of this.flock) {
      // Hai chim bám diều bay quanh con diều khi có focus; còn lại cứ lộ trình.
      // Cả hai hàm đều GHI thẳng vào `bird.target` — điểm đích mà vòng lặp này
      // chỉ cần làm mượt, không cần biết nó từ đâu ra.
      if (focus && bird.companion) {
        birdFocusOrbit(bird.target, focus, bird.route, elapsed);
      } else if (focus?.thermal) {
        birdThermalSpiral(bird.target, focus.thermal, bird.route, elapsed);
      } else {
        birdRoutePosition(bird.target, bird.route, elapsed);
      }

      // Chim bám diều phải vội hơn chim bay lộ trình thường.
      const rate = focus && bird.companion ? 2.4 : 1.6;

      bird.last.copy(bird.group.position);
      bird.group.position.lerp(bird.target, 1 - Math.exp(-rate * dt));

      this.orient(bird.group, bird.last, bird.group.position, dt);

      const flap = 0.35 + Math.sin(elapsed * bird.flap + bird.route.phase) * 0.55;

      bird.wingL.rotation.z = flap;
      bird.wingR.rotation.z = -flap;
    }
  }

  // ── Chim cành ────────────────────────────────────────────────────────────

  private updatePerched(dt: number, player: { x: number; y: number; z: number }) {
    for (const bird of this.perched) {
      const perch = this.perches[bird.perch];

      if (bird.state === "perch") {
        // Đứng im, thỉnh thoảng ngó quanh — hai động tác nhỏ đủ để con chim
        // đang đậu không trông như một miếng gỗ dán trên hàng rào.
        bird.group.rotation.y += Math.sin(bird.group.position.x * 7 + bird.timer) * dt * 0.4;
        bird.wingL.rotation.z = 0.12;
        bird.wingR.rotation.z = -0.12;

        const distance = Math.hypot(player.x - bird.group.position.x, player.z - bird.group.position.z);

        if (distance < PERCH_SCARE_DISTANCE) {
          this.lastScare = { x: bird.group.position.x, z: bird.group.position.z, at: this.clock };
          bird.state = "air";
          bird.timer = 3.2 + (bird.perch % 3);

          bird.velocity.set(
            (bird.group.position.x - player.x) * 0.6,
            3.4,
            (bird.group.position.z - player.z) * 0.6,
          );
        }
      } else if (bird.state === "air") {
        bird.timer -= dt;

        bird.velocity.y -= dt * 1.2;

        bird.last.copy(bird.group.position);
        bird.group.position.addScaledVector(bird.velocity, dt);

        this.orient(bird.group, bird.last, bird.group.position, dt);

        const flap = Math.sin((3.2 - bird.timer) * bird.flap) * 0.9;

        bird.wingL.rotation.z = flap;
        bird.wingR.rotation.z = -flap;

        if (bird.timer <= 0) {
          bird.state = "return";
          // Đổi chỗ đậu — xem `nextFreePerch`.
          bird.perch = this.pickPerch(bird);
        }
      } else {
        bird.target.set(perch.x, perch.y, perch.z);

        bird.last.copy(bird.group.position);
        bird.group.position.lerp(bird.target, 1 - Math.exp(-2.2 * dt));

        this.orient(bird.group, bird.last, bird.group.position, dt);

        const flap = Math.sin(bird.timer * bird.flap) * 0.7;

        bird.timer += dt;
        bird.wingL.rotation.z = flap;
        bird.wingR.rotation.z = -flap;

        if (bird.group.position.distanceTo(bird.target) < 0.25) {
          bird.state = "perch";
          bird.timer = 0;
          bird.group.position.copy(bird.target);
          bird.group.rotation.set(0, bird.perch * 1.7, 0);
        }
      }
    }
  }

  /**
   * Cột đậu trống cho một con chim — xem `nextFreePerch`.
   *
   * Cột của một con ĐANG BAY không tính là có chủ: đó chính là chỗ mà con vừa
   * bị hù kia nhắm tới. Còn cột của con đang trên đường về thì đã có chủ — hai
   * con cùng nhắm một cột trong cùng một frame là chúng đậu chồng lên nhau.
   */
  private pickPerch(bird: PerchedBird): number {
    const taken = new Set<number>();

    for (const other of this.perched) {
      if (other !== bird && other.state !== "air") taken.add(other.perch);
    }

    return nextFreePerch(bird.perch, taken, this.perches.length);
  }

  // ── Gà ───────────────────────────────────────────────────────────────────

  private updateChickens(dt: number, player: { x: number; y: number; z: number }) {
    const zone = this.chickenZone;

    for (const chicken of this.chickens) {
      const position = chicken.group.position;
      const playerDistance = Math.hypot(player.x - position.x, player.z - position.z);

      // Bị hù thì quên hết mọi kế hoạch khác.
      if (playerDistance < CHICKEN_FLEE_DISTANCE && chicken.fleeing <= 0) {
        chicken.fleeing = 1.6;
        chicken.target = fleeDestination(zone, position, player);
        chicken.pecking = false;
      }

      if (chicken.fleeing > 0) chicken.fleeing -= dt;

      const speed = chicken.fleeing > 0 ? 1.6 : 0.42;

      if (!chicken.target) {
        chicken.idle -= dt;

        if (chicken.idle <= 0) {
          chicken.target = pickWanderTarget(zone, chicken.random);
          chicken.idle = 1.2 + chicken.random() * 2.4;
        }
      }

      if (chicken.target) {
        const dx = chicken.target.x - position.x;
        const dz = chicken.target.z - position.z;
        const distance = Math.hypot(dx, dz);

        if (distance < 0.2) {
          chicken.target = undefined;
        } else {
          const heading = Math.atan2(dx, dz);

          chicken.yaw +=
            Math.atan2(
              Math.sin(heading - chicken.yaw),
              Math.cos(heading - chicken.yaw),
            ) * Math.min(1, dt * 8);

          position.x += Math.sin(chicken.yaw) * speed * dt;
          position.z += Math.cos(chicken.yaw) * speed * dt;

          chicken.group.rotation.y = chicken.yaw;
        }
      }

      // Mổ: đang đứng im, đầu cúi xuống liên hồi mấy nhịp rồi ngẩng lên.
      chicken.peckTimer -= dt;

      if (chicken.peckTimer <= 0) {
        chicken.pecking = !chicken.pecking;
        chicken.peckTimer = chicken.pecking ? 0.5 + chicken.random() * 0.4 : 1.5 + chicken.random() * 2.5;
      }

      const peck = chicken.pecking && !chicken.target ? 0.95 : 0;

      chicken.head.rotation.x += (peck - chicken.head.rotation.x) * Math.min(1, dt * 10);

      // Sổ lông khi chạy thốc: hai cánh vỗ mạnh, còn đi bộ thì cánh im.
      const flap = chicken.fleeing > 0 ? Math.sin(chicken.fleeing * 26) * 1.1 : 0.08;

      chicken.wingL.rotation.z = flap;
      chicken.wingR.rotation.z = -flap;

      // Gà đi thì nhấp nhô rất nhẹ — đủ để bước chân có nhịp.
      chicken.group.position.y =
        terrainHeight(position.x, position.z) +
        (chicken.fleeing > 0 ? Math.abs(Math.sin(chicken.fleeing * 22)) * 0.05 : 0);
    }
  }

  // ── Bướm ─────────────────────────────────────────────────────────────────

  private updateButterflies(dt: number, elapsed: number, shoulder: Vec3 | undefined) {
    if (shoulder && this.lander === undefined && this.stillFor >= BUTTERFLY_LAND_SECONDS) {
      this.lander = nearestWithin(this.butterflies, shoulder, BUTTERFLY_NOTICE);
    }

    this.butterflies.forEach((butterfly, index) => {
      const t = elapsed * 0.5 + butterfly.phase;
      const landing = shoulder !== undefined && index === this.lander;

      // Bay tới chậm rãi (~3 giây), giật mình bay đi thì nhanh.
      butterfly.land += ((landing ? 1 : 0) - butterfly.land) * Math.min(1, dt * (landing ? 0.9 : 2.5));

      const k = butterfly.land * butterfly.land * (3 - 2 * butterfly.land);
      const pathX = butterfly.cx + Math.sin(t) * butterfly.rx;
      const pathZ = butterfly.cz + Math.sin(t * 1.37 + 1.1) * butterfly.rz;
      const pathY =
        terrainHeight(pathX, pathZ) + 0.8 + Math.sin(t * 2.6) * 0.35 + Math.sin(t * 7.1) * 0.05;
      const x = shoulder ? pathX + (shoulder.x - pathX) * k : pathX;
      const y = shoulder ? pathY + (shoulder.y + 0.04 - pathY) * k : pathY;
      const z = shoulder ? pathZ + (shoulder.z - pathZ) * k : pathZ;

      // Bướm bay theo quỹ đạo thuần vị trí — không cần làm mượt vận tốc.
      const heading = Math.atan2(x - butterfly.group.position.x, z - butterfly.group.position.z);

      if (
        Math.abs(x - butterfly.group.position.x) > 1e-4 ||
        Math.abs(z - butterfly.group.position.z) > 1e-4
      ) {
        butterfly.group.rotation.y = heading;
      }

      butterfly.group.position.set(x, y, z);

      // Đậu rồi thì cánh khép lại, thỉnh thoảng mới hé ra một nhịp chậm.
      const resting = k > 0.95;
      const flap = resting
        ? 1.15 + Math.max(0, Math.sin(elapsed * 1.3 + butterfly.phase)) * 0.35
        : Math.sin(elapsed * 9 + butterfly.phase * 3) * 0.85;

      butterfly.wingL.rotation.z = resting ? flap : 0.25 + flap;
      butterfly.wingR.rotation.z = resting ? -flap : -0.25 - flap;
    });
  }

  // ── Tiện ích ─────────────────────────────────────────────────────────────

  /** Quay mặt theo hướng di chuyển, có nghiêng người theo khúc cua. */
  private orient(group: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, dt: number) {
    SCRATCH_A.subVectors(to, from);

    const distance = SCRATCH_A.length();

    if (distance < 1e-5 || dt <= 0) return;

    const speed = distance / dt;

    const yaw = Math.atan2(SCRATCH_A.x, SCRATCH_A.z);
    const pitch = Math.atan2(SCRATCH_A.y, Math.hypot(SCRATCH_A.x, SCRATCH_A.z));

    group.rotation.y += Math.atan2(
      Math.sin(yaw - group.rotation.y),
      Math.cos(yaw - group.rotation.y),
    ) * Math.min(1, dt * 6);

    group.rotation.x += (-pitch * 0.7 - group.rotation.x) * Math.min(1, dt * 5);

    // Nghiêng cánh theo... tốc độ đổi hướng — đơn giản hoá bằng tốc độ bay:
    // bay nhanh thì nghiêng nhiều, bay chậm thì gần như nằm yên.
    const bank = Math.min(0.5, speed * 0.04);

    group.rotation.z += (bank - group.rotation.z) * Math.min(1, dt * 4);
  }
}

/** Con gần điểm `to` nhất trong tầm `within` (chỉ số), hoặc `undefined`. */
function nearestWithin(
  butterflies: readonly { group: THREE.Group }[],
  to: Vec3,
  within: number,
): number | undefined {
  let best: number | undefined;
  let bestDistance = within;

  butterflies.forEach(({ group }, index) => {
    const distance = Math.hypot(group.position.x - to.x, group.position.z - to.z);

    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });

  return best;
}
