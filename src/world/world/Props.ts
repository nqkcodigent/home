import * as THREE from "three";

import { terrainHeight } from "../terrain/heightfield";

/**
 * Vật thể trong sân — nhà, giếng, cây, hàng rào…
 *
 * Mỗi hàm trả về một `THREE.Group` đã dựng xong, gốc đặt ở mặt đất (y = 0 của
 * vật thể nằm trên chân). Nhờ vậy chỗ đặt chỉ cần `position.set(x, height, z)`
 * mà không phải nhớ từng vật thể lệch gốc bao nhiêu — đúng loại lỗi đã làm
 * cái giếng của bản cũ chìm nửa thân xuống đất.
 */

export interface PropPalette {
  wall: number;
  roof: number;
  wood: number;
  frame: number;
  glass: number;
}

export const VILLAGE_PALETTE: PropPalette = {
  wall: 0xf4e6cd,
  roof: 0xb4553f,
  wood: 0x8a5a3a,
  frame: 0xfdf8ee,
  glass: 0xa9d9f2,
};

const CANOPY_GREENS = [0x5f9c3c, 0x6fae45, 0x4f8c34, 0x7cbb4e];

function standard(color: number, options: THREE.MeshStandardMaterialParameters = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.88,
    metalness: 0,
    ...options,
  });
}

function box(
  width: number,
  height: number,
  depth: number,
  material: THREE.Material,
  position: [number, number, number],
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    material,
  );

  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

function cylinder(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  material: THREE.Material,
  position: [number, number, number],
  segments = 14,
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material,
  );

  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  return mesh;
}

/**
 * Mái: hai má dốc úp vào nhau, cộng một nóc tròn.
 *
 * `topY` là đỉnh tường, `rise` là chiều cao từ diềm mái lên nóc. Má sau được
 * quay ngược dấu má trước, nếu không thì hai má chụm lại thành hình chữ V.
 */
function roofSlabs(
  width: number,
  depth: number,
  material: THREE.Material,
  topY: number,
  rise: number,
) {
  const group = new THREE.Group();

  const slope = Math.hypot(depth / 2, rise);
  const angle = Math.atan2(rise, depth / 2);

  for (const side of [-1, 1]) {
    const slab = box(width, 0.16, slope + 0.24, material, [
      0,
      topY + rise / 2,
      (side * depth) / 4,
    ]);

    slab.rotation.x = side * angle;

    group.add(slab);
  }

  const ridge = cylinder(0.17, 0.17, width + 0.3, material, [
    0,
    topY + rise,
    0,
  ], 10);

  ridge.rotation.z = Math.PI / 2;
  group.add(ridge);

  return group;
}

// ── Nhà ───────────────────────────────────────────────────────────────────

export function createHouse(palette: PropPalette = VILLAGE_PALETTE): THREE.Group {
  const house = new THREE.Group();

  house.name = "house";

  const wall = standard(palette.wall);
  const wood = standard(palette.wood);
  const frame = standard(palette.frame);
  const roof = standard(palette.roof, { roughness: 0.95 });

  const width = 7.2;
  const depth = 6.2;
  const wallHeight = 3.1;

  house.add(box(width, wallHeight, depth, wall, [0, wallHeight / 2, 0]));

  // Bó hè quanh chân tường, cho ngôi nhà có "bệ" chứ không nổi lơ lửng.
  house.add(
    box(width + 0.5, 0.28, depth + 0.5, standard(0xe6d6bb), [0, 0.14, 0]),
  );

  const roofGroup = roofSlabs(width + 1.1, depth + 0.6, roof, wallHeight, 1.7);

  house.add(roofGroup);

  // Ống khói
  house.add(box(0.7, 1.5, 0.7, standard(0xc2867a), [2.1, wallHeight + 1.5, -1.2]));

  // Cửa ra vào (mặt tiền hướng +Z)
  const doorFrame = box(1.6, 2.3, 0.18, frame, [-1.4, 1.15, depth / 2 + 0.05]);

  house.add(doorFrame);
  house.add(box(1.24, 1.95, 0.16, wood, [-1.4, 1.05, depth / 2 + 0.12]));

  // Tay nắm cửa
  house.add(
    cylinder(0.07, 0.07, 0.14, standard(0xd9b25f, { metalness: 0.5, roughness: 0.4 }), [
      -0.95,
      1.05,
      depth / 2 + 0.24,
    ]),
  );

  // Bậc thềm
  house.add(box(2.2, 0.22, 0.9, standard(0xd8c6a5), [-1.4, 0.11, depth / 2 + 0.5]));

  // Cửa sổ: khung trắng, ô kính xanh, hai thanh chia
  for (const offset of [1.4, 2.7]) {
    house.add(
      box(1.5, 1.35, 0.16, frame, [offset, 1.9, depth / 2 + 0.04]),
    );
    house.add(
      box(1.2, 1.05, 0.14, standard(palette.glass, { roughness: 0.25, metalness: 0.1 }), [
        offset,
        1.9,
        depth / 2 + 0.12,
      ]),
    );
    house.add(box(1.3, 0.07, 0.16, frame, [offset, 1.9, depth / 2 + 0.14]));
    house.add(box(0.07, 1.15, 0.16, frame, [offset, 1.9, depth / 2 + 0.14]));
  }

  // Cửa sổ hông
  house.add(box(0.16, 1.2, 1.4, frame, [width / 2 + 0.04, 1.9, 0.6]));
  house.add(
    box(0.14, 0.95, 1.1, standard(palette.glass, { roughness: 0.25 }), [
      width / 2 + 0.12,
      1.9,
      0.6,
    ]),
  );

  return house;
}

// ── Giếng ─────────────────────────────────────────────────────────────────

export function createWell(): THREE.Group {
  const well = new THREE.Group();

  well.name = "well";

  const stone = standard(0x9a978f, { roughness: 1, flatShading: true });
  const wood = standard(VILLAGE_PALETTE.wood);
  const roofMaterial = standard(VILLAGE_PALETTE.roof);

  well.add(cylinder(0.95, 1.05, 0.75, stone, [0, 0.375, 0]));

  // Lòng giếng tối: nhìn xuống phải thấy "sâu", không phải thấy đáy.
  const shaft = cylinder(0.62, 0.62, 0.4, standard(0x1b1d1f), [0, 0.78, 0]);

  shaft.castShadow = false;
  well.add(shaft);

  for (const side of [-1, 1]) {
    well.add(cylinder(0.08, 0.09, 1.9, wood, [side * 0.85, 1.7, 0]));
  }

  const crossbar = cylinder(0.07, 0.07, 1.9, wood, [0, 2.5, 0], 10);

  crossbar.rotation.z = Math.PI / 2;
  well.add(crossbar);

  well.add(roofSlabs(2.5, 1.8, roofMaterial, 2.6, 0.75));

  // Gầu nước lơ lửng trên miệng giếng
  const rope = cylinder(0.02, 0.02, 1.0, standard(0xd8c9a4), [0, 1.9, 0]);

  rope.castShadow = false;
  well.add(rope);
  well.add(cylinder(0.19, 0.16, 0.26, wood, [0, 1.28, 0]));

  return well;
}

// ── Cây ───────────────────────────────────────────────────────────────────

export interface TreeOptions {
  scale?: number;
  seed?: number;
}

export function createTree(options: TreeOptions = {}): THREE.Group {
  const tree = new THREE.Group();
  const scale = options.scale ?? 1;
  const random = mulberry(options.seed ?? 12345);

  tree.name = "tree";

  const trunkHeight = 2.1 * scale;

  const trunk = cylinder(
    0.22 * scale,
    0.34 * scale,
    trunkHeight,
    standard(0x6b4a2f, { flatShading: true }),
    [0, trunkHeight / 2, 0],
    10,
  );

  tree.add(trunk);

  const canopyMaterial = standard(
    CANOPY_GREENS[Math.floor(random() * CANOPY_GREENS.length)],
    { flatShading: true, roughness: 0.95 },
  );

  const blobs = 4;

  for (let index = 0; index < blobs; index += 1) {
    const radius = (1.15 + random() * 0.7) * scale;

    const blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry(radius, 0),
      canopyMaterial,
    );

    blob.position.set(
      (random() - 0.5) * 1.5 * scale,
      trunkHeight + radius * 0.45 + random() * 0.8 * scale,
      (random() - 0.5) * 1.5 * scale,
    );

    blob.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    blob.castShadow = true;

    tree.add(blob);
  }

  return tree;
}

// ── Bụi, đá, đống rơm ─────────────────────────────────────────────────────

export function createBush(scale = 1): THREE.Group {
  const bush = new THREE.Group();
  const random = mulberry(777);
  const material = standard(0x55913d, { flatShading: true });

  for (let index = 0; index < 3; index += 1) {
    const blob = new THREE.Mesh(
      new THREE.IcosahedronGeometry((0.45 + random() * 0.3) * scale, 0),
      material,
    );

    blob.position.set(
      (index - 1) * 0.5 * scale,
      0.35 * scale + random() * 0.2,
      (random() - 0.5) * 0.4 * scale,
    );

    blob.castShadow = true;
    bush.add(blob);
  }

  return bush;
}

export function createRock(scale = 1): THREE.Mesh {
  const rock = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.55 * scale, 0),
    standard(0x8d8b86, { flatShading: true, roughness: 1 }),
  );

  rock.scale.set(1.15, 0.7, 1);
  rock.castShadow = true;
  rock.receiveShadow = true;

  return rock;
}

export function createHaystack(scale = 1): THREE.Group {
  const stack = new THREE.Group();
  const straw = standard(0xd9b563, { flatShading: true, roughness: 1 });

  stack.add(cylinder(0.9 * scale, 1.05 * scale, 1.1 * scale, straw, [0, 0.55 * scale, 0], 10));

  const top = new THREE.Mesh(
    new THREE.ConeGeometry(0.95 * scale, 0.9 * scale, 10),
    straw,
  );

  top.position.y = 1.55 * scale;
  top.castShadow = true;

  stack.add(top);

  return stack;
}

// ── Hàng rào ──────────────────────────────────────────────────────────────

export interface FenceOptions {
  /** Khoảng trống làm cổng, theo trục X */
  gapFrom?: number;
  gapTo?: number;
  spacing?: number;
}

export function createFence(
  fromX: number,
  toX: number,
  z: number,
  options: FenceOptions = {},
): THREE.Group {
  const fence = new THREE.Group();

  const spacing = options.spacing ?? 1.7;
  const wood = standard(0xb2865a, { roughness: 0.95 });
  const postHeight = 0.95;

  for (let x = fromX; x <= toX; x += spacing) {
    const inGap =
      options.gapFrom !== undefined &&
      options.gapTo !== undefined &&
      x > options.gapFrom - spacing * 0.5 &&
      x < options.gapTo + spacing * 0.5;

    if (inGap) continue;

    const y = terrainHeight(x, z);

    fence.add(cylinder(0.07, 0.08, postHeight, wood, [x, y + postHeight / 2, z], 8));

    // Hai thanh ngang: đoạn nối tới cột kế tiếp.
    const next = Math.min(x + spacing, toX);

    if (next - x > 0.6) {
      const midX = (x + next) / 2;
      const midY = (terrainHeight(midX, z) + y) / 2;

      for (const height of [0.42, 0.72]) {
        fence.add(
          box(next - x, 0.07, 0.07, wood, [midX, midY + height, z]),
        );
      }
    }
  }

  return fence;
}

// ── Dây phơi ──────────────────────────────────────────────────────────────

export function createClothesLine(): THREE.Group {
  const line = new THREE.Group();

  const wood = standard(0x8f6b45);
  const length = 5.2;

  for (const side of [-1, 1]) {
    line.add(cylinder(0.06, 0.07, 2.1, wood, [(side * length) / 2, 1.05, 0], 8));
  }

  const rope = cylinder(0.018, 0.018, length, standard(0xe8e0cc), [0, 1.85, 0]);

  rope.rotation.z = Math.PI / 2;
  rope.castShadow = false;
  line.add(rope);

  // Vài bộ quần áo, màu nhạt như vải phơi nắng.
  const clothes: [number, number, number][] = [
    [-1.7, 0xffe9a8, 0.9],
    [-0.5, 0xbfe3ff, 1.05],
    [0.9, 0xffc9c9, 0.8],
    [1.9, 0xd9f2d0, 0.95],
  ];

  for (const [x, color, height] of clothes) {
    const shirt = box(0.62, height, 0.08, standard(color, { roughness: 1 }), [
      x,
      1.85 - height / 2 + 0.02,
      0,
    ]);

    shirt.rotation.z = (x % 0.4) * 0.5;
    line.add(shirt);
  }

  return line;
}

// ── Trường làng (xa) ──────────────────────────────────────────────────────

export function createBellTower(): THREE.Group {
  const tower = new THREE.Group();

  tower.name = "bell-tower";

  const wall = standard(0xf0dfc0);
  const roof = standard(0xa8513c);
  const bronze = standard(0x8a6a3a, { metalness: 0.55, roughness: 0.45 });

  tower.add(box(4.6, 5.4, 4.6, wall, [0, 2.7, 0]));

  for (const side of [-1, 1]) {
    // Cột đỡ mái
    tower.add(cylinder(0.16, 0.18, 2.4, standard(0x7c4c33), [side * 1.9, 6.2, 0], 8));
    tower.add(cylinder(0.16, 0.18, 2.4, standard(0x7c4c33), [side * 1.9, 6.2, -3.4], 8));
  }

  tower.add(roofSlabs(6.2, 5.4, roof, 7.3, 1.5));

  const bell = cylinder(0.42, 0.5, 0.75, bronze, [0, 6.5, -1.7], 12);

  tower.add(bell);

  return tower;
}

// ── Ao nhỏ ────────────────────────────────────────────────────────────────

export function createPond(radius = 3.2): THREE.Group {
  const pond = new THREE.Group();

  pond.name = "pond";

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 36),
    new THREE.MeshStandardMaterial({
      color: 0x66b3d6,
      roughness: 0.15,
      metalness: 0.25,
      transparent: true,
      opacity: 0.82,
    }),
  );

  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.06;
  water.receiveShadow = true;

  pond.add(water);

  // Bờ đất: vành khuyên dẹt giữ nước khỏi "tràn" ra cỏ.
  const bank = new THREE.Mesh(
    new THREE.RingGeometry(radius, radius + 0.5, 36),
    standard(0xb99a6d, { roughness: 1 }),
  );

  bank.rotation.x = -Math.PI / 2;
  bank.position.y = 0.04;
  bank.receiveShadow = true;

  pond.add(bank);

  const random = mulberry(4242);

  for (let index = 0; index < 7; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = radius + 0.3 + random() * 0.4;

    const reed = cylinder(
      0.03,
      0.05,
      0.9 + random() * 0.6,
      standard(0x6f9e46, { flatShading: true }),
      [Math.cos(angle) * distance, 0.5, Math.sin(angle) * distance],
      5,
    );

    pond.add(reed);
  }

  return pond;
}

// ── Tiện ích ──────────────────────────────────────────────────────────────

/** PRNG có hạt giống, để cây cối giống nhau ở mọi lần tải. */
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
