import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { terrainHeight } from "../terrain/heightfield";
import { POND_RADIUS } from "./layout";

import type { Obstacle } from "../physics/collide";

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
  // Tường quét vôi vàng, mái ngói đỏ son — màu nhà quê Bắc Bộ.
  wall: 0xf1dba8,
  roof: 0xb4553f,
  wood: 0x8a5a3a,
  frame: 0xfdf8ee,
  glass: 0xa9d9f2,
};

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

/** Một ô cửa sổ khoét trên tường, toạ độ dọc theo chiều dài tường (mét). */
interface WallHole {
  from: number;
  to: number;
  bottom: number;
  top: number;
}

/**
 * Tường có ô cửa sổ KHOÉT THẬT — dựng từ các tấm quanh lỗ, không phải một tấm
 * đặc dán kính lên trên. Tường chạy dọc trục X cục bộ từ 0 tới `length`, độ
 * dày theo Z; bên gọi đặt vị trí và xoay.
 */
function wallWithHoles(
  length: number,
  height: number,
  thickness: number,
  material: THREE.Material,
  holes: WallHole[],
): THREE.Group {
  const wall = new THREE.Group();
  const piece = (from: number, to: number, bottom: number, top: number) => {
    if (to - from < 1e-3 || top - bottom < 1e-3) return;

    wall.add(
      box(to - from, top - bottom, thickness, material, [
        (from + to) / 2,
        (bottom + top) / 2,
        0,
      ]),
    );
  };

  let cursor = 0;

  for (const hole of [...holes].sort((a, b) => a.from - b.from)) {
    piece(cursor, hole.from, 0, height);
    piece(hole.from, hole.to, 0, hole.bottom);
    piece(hole.from, hole.to, hole.top, height);
    cursor = hole.to;
  }

  piece(cursor, length, 0, height);

  return wall;
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

  // Hàng ngói: những gờ ngang sẫm màu hơn chạy dọc mái — mái nhìn ra là mái
  // ngói lợp, không phải một tấm tôn sơn đỏ.
  const tileColor = (material as THREE.MeshStandardMaterial).color.clone().multiplyScalar(0.78);
  const tile = standard(tileColor.getHex(), { roughness: 0.95 });
  const fascia = standard(0x7a5236);

  for (const side of [-1, 1]) {
    const length = slope + 0.24;
    const slab = box(width, 0.16, length, material, [
      0,
      topY + rise / 2,
      (side * depth) / 4,
    ]);

    slab.rotation.x = side * angle;

    for (let along = -length / 2 + 0.2; along < length / 2; along += 0.34) {
      const row = box(width, 0.05, 0.07, tile, [0, 0.1, along]);

      row.castShadow = false;
      slab.add(row);
    }

    // Diềm gỗ ở hai đầu hồi.
    for (const end of [-1, 1]) {
      slab.add(box(0.08, 0.22, length, fascia, [(end * width) / 2, 0, 0]));
    }

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

/**
 * Kích thước nhà, và khoảng trống làm cửa.
 *
 * Xuất ra ngoài vì VA CHẠM của ngôi nhà phải khớp từng con số với hình khối:
 * một bức tường dựng ở đây mà chặn ở chỗ khác là lỗi không nhìn thấy được cho
 * tới lúc người chơi đi xuyên qua tường hoặc kẹt trong nhà.
 */
export const HOUSE = {
  width: 7.2,
  depth: 6.2,
  wallHeight: 3.1,
  wallThickness: 0.3,
  /** Khoảng trống của cửa ra vào, toạ độ X cục bộ (mặt tiền hướng +Z) */
  doorFrom: -2.02,
  doorTo: -0.78,
  /** Mặt trên bó hè — vành đá quanh chân tường */
  plinthY: 0.28,
  /** Mặt sàn gỗ trong nhà — cao hơn bó hè một chút */
  floorY: 0.3,
  /** Mặt bậc thềm trước cửa */
  stepY: 0.22,
} as const;

/** Miệng ống khói (toạ độ cục bộ của nhà) — khói bếp bốc lên từ đây. */
export const CHIMNEY_TOP = { x: 2.1, y: HOUSE.wallHeight + 2.25, z: -1.2 } as const;

/** Tâm hai cửa sổ mặt tiền (X cục bộ); ô kính 1,2 × 1,05 m ở độ cao 1,9 m. */
const FRONT_WINDOWS = [1.4, 2.7] as const;

/** Cửa sổ tường hông phải (+X): tâm theo Z, độ cao tâm, kích thước ô. */
// Rộng hơn và thấp hơn một chút: ngồi trên ghế đẩu vẫn thấy được cả cái ao.
export const SIDE_WINDOW = { z: 0.6, y: 1.8, width: 1.45, height: 1.1 } as const;

/**
 * Ghế đẩu cạnh cửa sổ hông — chỗ ngồi ngắm sân (toạ độ cục bộ của nhà;
 * `height` là độ cao mặt ghế so với gốc nhà). Khớp với ghế đẩu bên phải bàn
 * trong `createInterior`.
 */
export const WINDOW_SEAT = { x: 2.95, z: 0.7, height: HOUSE.floorY - 0.06 + 0.45 } as const;

/** Tên các bộ phận tương tác được — bối cảnh tìm chúng bằng `getObjectByName`. */
export const HOUSE_PARTS = {
  door: "house-door",
  chestLid: "house-chest-lid",
  lampLight: "house-lamp-light",
  lampBulb: "house-lamp-bulb",
} as const;

/**
 * Độ cao mặt nền tại một điểm trong TOẠ ĐỘ CỤC BỘ của nhà, hoặc `undefined` nếu
 * điểm đó nằm ngoài nhà.
 *
 * Đây là lời giải cho lỗi "mất chân" khi vào nhà: sàn và bó hè cao hơn mặt đất
 * gần ba tấc, mà nhân vật thì trước đây chỉ biết `terrainHeight` — nên chân lún
 * xuống dưới mặt sàn. Ba bậc nền, khớp từng con số với hình khối ở `createHouse`.
 */
export function houseGroundHeight(localX: number, localZ: number): number | undefined {
  const halfWidth = HOUSE.width / 2;
  const halfDepth = HOUSE.depth / 2;

  const doorCenter = (HOUSE.doorFrom + HOUSE.doorTo) / 2;

  // Bậc thềm trước cửa (2,2 × 0,9 m, mép trong sát bó hè).
  if (
    Math.abs(localX - doorCenter) <= 1.1 &&
    localZ > halfDepth + 0.25 &&
    localZ <= halfDepth + 0.95
  ) {
    return HOUSE.stepY;
  }

  // Bó hè rộng hơn tường 0,25 m mỗi bên.
  if (Math.abs(localX) > halfWidth + 0.25 || Math.abs(localZ) > halfDepth + 0.25) {
    return undefined;
  }

  const inside =
    Math.abs(localX) < halfWidth - HOUSE.wallThickness / 2 &&
    Math.abs(localZ) < halfDepth - HOUSE.wallThickness / 2;

  return inside ? HOUSE.floorY : HOUSE.plinthY;
}

/**
 * Nhà — nay là một cái nhà VÀO ĐƯỢC.
 *
 * Bản trước là một khối hộp đặc: nhìn thì đúng, mà người chơi đi tới đâu cũng
 * bị đẩy ra, và cả ngôi nhà chỉ còn là một hình chữ nhật trên bản đồ. Nay bốn
 * bức tường được dựng thành bốn tấm, mặt tiền chừa một khoảng làm cửa, bên
 * trong có sàn, trần, giường, bàn, rương và một ngọn đèn dầu.
 *
 * Yêu cầu của người chơi rất rõ: *được đi lại tự do cả trong nhà lẫn ngoài
 * sân*. Một khối đặc thì không thể vừa "nhìn như cái nhà" vừa "đi vào được" —
 * nên nó phải là cái nhà thật, và `createHouseObstacles()` là phần va chạm
 * tương ứng.
 */
export function createHouse(palette: PropPalette = VILLAGE_PALETTE): THREE.Group {
  const house = new THREE.Group();

  house.name = "house";

  const wall = standard(palette.wall);
  const wood = standard(palette.wood);
  const frame = standard(palette.frame);
  const roof = standard(palette.roof, { roughness: 0.95 });

  const { width, depth, wallHeight, wallThickness } = HOUSE;

  // ── Tường: bốn tấm, không phải một khối ──────────────────────────────────
  const halfWidth = width / 2;
  const halfDepth = depth / 2;

  // Tường hậu và hai tường hông: nguyên tấm.
  house.add(box(width, wallHeight, wallThickness, wall, [0, wallHeight / 2, -halfDepth]));
  house.add(box(wallThickness, wallHeight, depth, wall, [-halfWidth, wallHeight / 2, 0]));

  // Tường hông phải có ô cửa sổ thật — chỗ ngồi bên bàn nhìn ra sân qua đây.
  const sideWall = wallWithHoles(depth, wallHeight, wallThickness, wall, [
    {
      from: SIDE_WINDOW.z - SIDE_WINDOW.width / 2 + halfDepth,
      to: SIDE_WINDOW.z + SIDE_WINDOW.width / 2 + halfDepth,
      bottom: SIDE_WINDOW.y - SIDE_WINDOW.height / 2,
      top: SIDE_WINDOW.y + SIDE_WINDOW.height / 2,
    },
  ]);

  // Xoay −90°: trục X cục bộ của tường chạy theo +Z của nhà.
  sideWall.position.set(halfWidth, 0, -halfDepth);
  sideWall.rotation.y = -Math.PI / 2;
  house.add(sideWall);

  // Mặt tiền: hai đoạn, chừa khoảng cửa ở giữa — đây là chỗ người chơi đi vào.
  const frontLeft = HOUSE.doorFrom + halfWidth;
  const frontRight = halfWidth - HOUSE.doorTo;

  house.add(
    box(frontLeft, wallHeight, wallThickness, wall, [
      -halfWidth + frontLeft / 2,
      wallHeight / 2,
      halfDepth,
    ]),
  );

  // Đoạn mặt tiền bên phải cửa có hai ô cửa sổ khoét thật.
  const frontWall = wallWithHoles(
    frontRight,
    wallHeight,
    wallThickness,
    wall,
    FRONT_WINDOWS.map((x) => ({
      from: x - 0.6 - HOUSE.doorTo,
      to: x + 0.6 - HOUSE.doorTo,
      bottom: 1.9 - 0.525,
      top: 1.9 + 0.525,
    })),
  );

  frontWall.position.set(HOUSE.doorTo, 0, halfDepth);
  house.add(frontWall);

  // Sàn gỗ và trần: sàn hơi cao hơn mặt đất một chút để không tranh nhau với
  // cỏ, trần thì che nắng cho căn phòng khỏi trông như sân khấu hở.
  house.add(
    box(width - wallThickness, 0.06, depth - wallThickness, standard(0xc79a63), [
      0,
      HOUSE.floorY - 0.03,
      0,
    ]),
  );

  house.add(
    box(width - wallThickness, 0.08, depth - wallThickness, standard(0xe4d3b6), [
      0,
      wallHeight - 0.04,
      0,
    ]),
  );

  // Chân tường sẫm màu như vệt mưa hắt bùn — tường mới có tuổi. Một vành mỏng
  // ôm sát mặt ngoài, mặt tiền chừa khoảng cửa.
  const plinthBand = standard(0xc9ad7c);
  const band = 0.55;
  const skin = wallThickness / 2 + 0.015;

  house.add(
    box(width + 0.03, band, 0.02, plinthBand, [0, band / 2, -halfDepth - skin + 0.01]),
    box(0.02, band, depth + 0.03, plinthBand, [-halfWidth - skin + 0.01, band / 2, 0]),
    box(0.02, band, depth + 0.03, plinthBand, [halfWidth + skin - 0.01, band / 2, 0]),
    box(frontLeft, band, 0.02, plinthBand, [-halfWidth + frontLeft / 2, band / 2, halfDepth + skin - 0.01]),
    box(frontRight - 0.2, band, 0.02, plinthBand, [HOUSE.doorTo + 0.2 + (frontRight - 0.2) / 2, band / 2, halfDepth + skin - 0.01]),
  );

  // Bó hè quanh chân tường, cho ngôi nhà có "bệ" chứ không nổi lơ lửng.
  house.add(
    box(width + 0.5, HOUSE.plinthY, depth + 0.5, standard(0xe6d6bb), [
      0,
      HOUSE.plinthY / 2,
      0,
    ]),
  );

  const roofGroup = roofSlabs(width + 1.1, depth + 0.6, roof, wallHeight, 1.7);

  house.add(roofGroup);

  // Ống khói
  house.add(box(0.7, 1.5, 0.7, standard(0xc2867a), [CHIMNEY_TOP.x, wallHeight + 1.5, CHIMNEY_TOP.z]));

  // ── Cửa ra vào (mặt tiền hướng +Z) ─────────────────────────────────────
  // Cánh cửa ĐÓNG khi dựng: người chơi bắt đầu trong nhà, và mở cửa là cách họ
  // bước ra sân. Bối cảnh xoay `HOUSE_PARTS.door` quanh bản lề để mở/đóng.
  const doorWidth = HOUSE.doorTo - HOUSE.doorFrom;
  const doorCenter = (HOUSE.doorFrom + HOUSE.doorTo) / 2;
  const doorHeight = 2.42;

  // Đoạn tường trên đỉnh cửa — thiếu nó thì trên khung cửa là một lỗ thủng
  // nhìn thẳng lên mái.
  house.add(
    box(doorWidth + 0.36, wallHeight - doorHeight, wallThickness, wall, [
      doorCenter,
      (wallHeight + doorHeight) / 2,
      halfDepth,
    ]),
  );

  // Khung cửa: hai thanh dọc + một thanh ngang, chứ không phải một tấm bịt.
  for (const side of [-1, 1]) {
    house.add(
      box(
        0.18,
        doorHeight,
        0.18,
        frame,
        [doorCenter + (side * (doorWidth + 0.18)) / 2, doorHeight / 2, halfDepth + 0.05],
      ),
    );
  }

  house.add(box(doorWidth + 0.54, 0.16, 0.18, frame, [doorCenter, doorHeight, halfDepth + 0.05]));

  // Cánh cửa gỗ, bản lề ở mép trái, mở quay ra ngoài sân.
  const doorLeaf = new THREE.Group();

  doorLeaf.name = HOUSE_PARTS.door;
  // Bản lề ở mép trái khoảng cửa, mặt dưới cánh cửa ngang mặt sàn.
  doorLeaf.position.set(HOUSE.doorFrom, HOUSE.floorY - 0.075, halfDepth + 0.1);

  // Cao kín từ mặt sàn tới sát khung trên — không chừa khe nhìn ra trời.
  const leafHeight = doorHeight - HOUSE.floorY - 0.02;

  doorLeaf.add(box(doorWidth, leafHeight, 0.12, wood, [doorWidth / 2, 0.075 + leafHeight / 2, 0]));
  doorLeaf.add(
    cylinder(
      0.07,
      0.07,
      0.14,
      standard(0xd9b25f, { metalness: 0.5, roughness: 0.4 }),
      [doorWidth - 0.14, 1.05, 0.1],
    ),
  );

  house.add(doorLeaf);

  // Bậc thềm
  house.add(
    box(2.2, HOUSE.stepY, 0.9, standard(0xd8c6a5), [doorCenter, HOUSE.stepY / 2, halfDepth + 0.5]),
  );

  // Kính TRONG SUỐT: người chơi ngồi bên cửa sổ là để nhìn ra sân, một tấm
  // kính đục thì chỉ là bức tường màu xanh.
  const glass = standard(palette.glass, {
    roughness: 0.15,
    metalness: 0.1,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });

  // Cửa sổ: khung trắng, ô kính xanh, hai thanh chia
  for (const offset of FRONT_WINDOWS) {
    // Viền khung quanh lỗ — bốn thanh, để lỗ vẫn nhìn xuyên được.
    for (const [dx, dy, w, h] of [
      [0, 0.6, 1.5, 0.15],
      [0, -0.6, 1.5, 0.15],
      [0.675, 0, 0.15, 1.05],
      [-0.675, 0, 0.15, 1.05],
    ]) {
      house.add(box(w, h, 0.36, frame, [offset + dx, 1.9 + dy, depth / 2]));
    }
    house.add(
      Object.assign(box(1.2, 1.05, 0.04, glass, [offset, 1.9, depth / 2]), {
        castShadow: false,
      }),
    );
    house.add(box(1.3, 0.07, 0.16, frame, [offset, 1.9, depth / 2 + 0.14]));
    house.add(box(0.07, 1.15, 0.16, frame, [offset, 1.9, depth / 2 + 0.14]));
  }

  // Cánh chớp gỗ sơn xanh mở hai bên dãy cửa sổ, bồn hoa dưới bậu.
  const shutter = standard(0x5f8f86);
  const slat = standard(0x4d7a72);

  for (const [edge, side] of [
    [FRONT_WINDOWS[0] - 0.6, -1],
    [FRONT_WINDOWS[1] + 0.6, 1],
  ] as const) {
    const hinge = new THREE.Group();

    hinge.position.set(edge + side * 0.08, 1.9, depth / 2 + 0.2);
    hinge.rotation.y = side * -1.2;
    hinge.add(box(0.55, 1.05, 0.05, shutter, [side * 0.28, 0, 0]));

    for (const y of [-0.3, -0.1, 0.1, 0.3]) hinge.add(box(0.45, 0.04, 0.07, slat, [side * 0.28, y, 0]));

    house.add(hinge);
  }

  const planterWidth = FRONT_WINDOWS[1] - FRONT_WINDOWS[0] + 1.2;
  const planterX = (FRONT_WINDOWS[0] + FRONT_WINDOWS[1]) / 2;

  house.add(box(planterWidth, 0.2, 0.26, standard(0xa8603e), [planterX, 1.25, depth / 2 + 0.3]));

  const blooms = [0xe0573a, 0xf2a1b5, 0xffd45f, 0xf7f2ea];
  const leaves = standard(0x5e9a45, { flatShading: true });

  for (let index = 0; index < 9; index += 1) {
    const x = planterX - planterWidth / 2 + 0.2 + (index * (planterWidth - 0.4)) / 8;
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), leaves);

    leaf.position.set(x, 1.42, depth / 2 + 0.3);
    house.add(leaf);

    const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.06, 0), standard(blooms[index % blooms.length]));

    bloom.position.set(x + 0.05, 1.53, depth / 2 + 0.36);
    house.add(bloom);
  }

  // Cửa sổ hông: khung viền quanh lỗ (bốn thanh, không phải một tấm che).
  const { z: sideZ, y: sideY, width: sideW, height: sideH } = SIDE_WINDOW;

  for (const [dy, dz, h, d] of [
    [sideH / 2 + 0.06, 0, 0.12, sideW + 0.24],
    [-sideH / 2 - 0.06, 0, 0.12, sideW + 0.24],
    [0, sideW / 2 + 0.06, sideH, 0.12],
    [0, -sideW / 2 - 0.06, sideH, 0.12],
  ]) {
    house.add(box(0.36, h, d, frame, [halfWidth, sideY + dy, sideZ + dz]));
  }

  house.add(
    Object.assign(box(0.04, sideH, sideW, glass, [halfWidth, sideY, sideZ]), {
      castShadow: false,
    }),
  );

  house.add(createInterior(palette));

  return house;
}

/**
 * Đồ đạc bên trong — căn nhà phải có chỗ để ĐI QUA, không phải một cái hộp
 * rỗng.
 *
 * Bày ít thứ thôi, và bày sát tường: phòng chỉ 6,6 × 5,6 m, mà nhân vật lại
 * chiếm gần một mét vuông. Giường, bàn, rương là đủ để căn phòng có nghĩa
 * "nhà ở" — và mỗi thứ đều có hình tròn va chạm tương ứng trong
 * `createHouseObstacles()`.
 */
function createInterior(palette: PropPalette): THREE.Group {
  const interior = new THREE.Group();

  interior.name = "house-interior";
  // Đồ đạc dựng với chân ở y = 0; đặt cả nhóm xuống MẶT SÀN (chiếu lót sàn
  // nằm 7 cm trên gốc nhóm, nên gốc thấp hơn mặt sàn đúng chừng đó trừ 1 cm).
  interior.position.y = HOUSE.floorY - 0.06;

  const wood = standard(palette.wood, { roughness: 0.9 });
  const bamboo = standard(0xc9a15f, { roughness: 0.8 });
  const cloth = standard(0x8fa9c4);

  const { width, wallHeight } = HOUSE;

  // ── Giường tre, góc sau bên trái ────────────────────────────────────────
  const bedX = -2.36;
  const bedZ = -1.5;

  interior.add(box(1.42, 0.12, 2.1, bamboo, [bedX, 0.42, bedZ]));

  for (const [ox, oz] of [
    [-0.6, -0.94],
    [0.6, -0.94],
    [-0.6, 0.94],
    [0.6, 0.94],
  ]) {
    interior.add(box(0.12, 0.42, 0.12, wood, [bedX + ox, 0.21, bedZ + oz]));
  }

  interior.add(box(1.2, 0.1, 1.7, cloth, [bedX, 0.53, bedZ - 0.1]));
  interior.add(box(0.5, 0.16, 0.34, standard(0xf6f3ea), [bedX, 0.62, bedZ - 0.82]));

  // ── Bàn gỗ + hai ghế đẩu, góc trước bên phải ────────────────────────────
  const tableX = 1.9;
  const tableZ = 0.6;

  interior.add(box(1.3, 0.1, 0.9, wood, [tableX, 0.62, tableZ]));

  for (const [ox, oz] of [
    [-0.5, -0.3],
    [0.5, -0.3],
    [-0.5, 0.3],
    [0.5, 0.3],
  ]) {
    interior.add(box(0.09, 0.62, 0.09, wood, [tableX + ox, 0.31, tableZ + oz]));
  }

  for (const [ox, oz] of [
    [-1.05, 0.1],
    [1.05, 0.1],
  ]) {
    interior.add(box(0.34, 0.06, 0.34, wood, [tableX + ox, 0.42, tableZ + oz]));
    interior.add(box(0.28, 0.4, 0.28, wood, [tableX + ox, 0.2, tableZ + oz]));
  }

  // Chén trà trên bàn — chi tiết nhỏ, nhưng là thứ nói "có người ở đây".
  interior.add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.06, 0.09, 12),
      standard(0xf3ece0, { roughness: 0.5 }),
    ).translateX(tableX - 0.28).translateY(0.71).translateZ(tableZ - 0.1),
  );

  // ── Rương thóc, sát tường hậu bên phải ──────────────────────────────────
  const chestX = 2.5;
  const chestZ = -2.3;

  interior.add(box(1.1, 0.62, 0.62, wood, [chestX, 0.31, chestZ]));

  // Nắp rương: bản lề ở mép sau, nên nhóm đặt gốc ở đó và nắp lùi ra trước.
  const chestLid = new THREE.Group();

  chestLid.name = HOUSE_PARTS.chestLid;
  chestLid.position.set(chestX, 0.62, chestZ - 0.33);
  chestLid.add(box(1.14, 0.1, 0.66, standard(0x6f4630), [0, 0.05, 0.33]));
  interior.add(chestLid);
  interior.add(
    box(0.16, 0.12, 0.06, standard(0xd9b25f, { metalness: 0.5, roughness: 0.35 }), [
      chestX,
      0.5,
      chestZ + 0.33,
    ]),
  );

  // ── Chiếu cói giữa nhà ─────────────────────────────────────────────────
  const mat = new THREE.Mesh(
    new THREE.PlaneGeometry(2.1, 1.5),
    standard(0xe3cf9a, { roughness: 1 }),
  );

  mat.rotation.x = -Math.PI / 2;
  mat.position.set(0.2, 0.07, 1.2);
  mat.receiveShadow = true;
  interior.add(mat);

  // ── Đèn dầu treo giữa nhà ───────────────────────────────────────────────
  const lamp = new THREE.Group();

  lamp.position.set(-0.2, wallHeight - 0.85, 0);
  lamp.add(
    box(0.03, 0.5, 0.03, standard(0x3a2c1e), [0, 0.3, 0]),
    Object.assign(
      new THREE.Mesh(
        new THREE.CylinderGeometry(0.13, 0.09, 0.2, 10),
        standard(0xffe3ae, { emissive: 0xffb96a, emissiveIntensity: 0.55 }),
      ),
      { name: HOUSE_PARTS.lampBulb },
    ),
  );

  interior.add(lamp);

  const lampLight = new THREE.PointLight(0xffbe7a, 9, 8, 1.8);

  lampLight.name = HOUSE_PARTS.lampLight;

  lampLight.position.set(-0.2, wallHeight - 0.95, 0);
  interior.add(lampLight);

  // Cửa sổ hông đổ sáng vào trong: bóng của khung cửa sổ phải nhìn thấy được
  // từ trong nhà, nếu không thì căn phòng chỉ là một cái hộp có lỗ.
  const windowLight = new THREE.PointLight(0xa9d9f2, 4, 7, 2);

  windowLight.position.set(width / 2 - 0.6, 1.9, 0.6);
  interior.add(windowLight);

  // Trần nhà phải nhận bóng, nếu không thì ngọn đèn treo vô hình.
  interior.traverse((child) => {
    if (child instanceof THREE.Mesh) child.receiveShadow = true;
  });

  return interior;
}

/**
 * Vật cản của ngôi nhà, trong TOẠ ĐỘ CỤC BỘ của nhà.
 *
 * Trả về toạ độ cục bộ vì ngôi nhà được đặt ở đâu là chuyện của bối cảnh (nó
 * còn bị xoay một chút cho tự nhiên), và bên gọi mới là bên biết phép biến đổi.
 * Bốn bức tường là bốn đoạn thẳng có độ dày (xem `Obstacle.toX`).
 *
 * Mặt tiền CHỪA khoảng cửa, nên đây cũng chính là chỗ nói bằng số rằng "nhà
 * này vào được".
 */
export function createHouseObstacles(): Obstacle[] {
  const obstacles: Obstacle[] = [];

  const { width, depth, doorFrom, doorTo } = HOUSE;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;

  const WALL_THICK = 0.22;

  /** Một bức tường = một đoạn thẳng có độ dày, trượt dọc theo nó là phẳng. */
  const wall = (
    from: { x: number; z: number },
    to: { x: number; z: number },
  ) => {
    obstacles.push({ x: from.x, z: from.z, toX: to.x, toZ: to.z, radius: WALL_THICK });
  };

  // Tường hậu, hai tường hông.
  wall({ x: -halfWidth, z: -halfDepth }, { x: halfWidth, z: -halfDepth });
  wall({ x: -halfWidth, z: -halfDepth }, { x: -halfWidth, z: halfDepth });
  wall({ x: halfWidth, z: -halfDepth }, { x: halfWidth, z: halfDepth });

  // Mặt tiền: hai đoạn, chừa khoảng cửa. Đầu đoạn lùi lại đúng độ dày tường
  // để phần đặc của đầu tròn dừng NGAY mép khung cửa — không lấn vào lối đi
  // (bản chuỗi hình tròn lấn 0,22 m mỗi bên, lối chỉ còn 0,08 m: chạy là kẹt).
  wall({ x: -halfWidth, z: halfDepth }, { x: doorFrom - WALL_THICK, z: halfDepth });
  wall({ x: doorTo + WALL_THICK, z: halfDepth }, { x: halfWidth, z: halfDepth });

  // Đồ đạc — vừa đủ để người chơi không đi xuyên qua giường hay bàn.
  // (Cánh cửa KHÔNG nằm ở đây: nó đóng/mở được — xem `createDoorObstacles`.)
  obstacles.push({ x: -2.36, z: -1.5, radius: 0.95 });
  // Bàn: đủ chặn mặt bàn mà chừa chỗ ghế đẩu cạnh cửa sổ (`WINDOW_SEAT`) để
  // ngồi xuống rồi đứng dậy không bị đẩy giật ra.
  obstacles.push({ x: 1.9, z: 0.6, radius: 0.7 });
  obstacles.push({ x: 2.5, z: -2.3, radius: 0.62 });

  return obstacles;
}

/** Vật cản của cánh cửa lúc ĐÓNG — chặn kín khoảng cửa (toạ độ cục bộ của nhà). */
export function createDoorObstacles(): Obstacle[] {
  const z = HOUSE.depth / 2;

  return [{ x: HOUSE.doorFrom, z, toX: HOUSE.doorTo, toZ: z, radius: 0.22 }];
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
  /** Cây phượng: điểm những chùm hoa đỏ cam trên tán */
  blossom?: boolean;
  /** Cây đa: tán xoè rộng và thấp, rễ phụ buông từ cành xuống */
  banyan?: boolean;
}

/** Hướng nắng chiều (cùng phía với mặt trời của `Sky`) — để tô sáng một bên tán. */
const SUN_SIDE = new THREE.Vector3(-0.55, 0.55, 0.62).normalize();

/** Bảng màu tán: [bóng dưới tán, thân tán, ánh nắng trên đỉnh]. */
const CANOPY_PALETTES: readonly [number, number, number][] = [
  [0x35603a, 0x5f9c3c, 0xc9dc78],
  [0x3d6a34, 0x74ad46, 0xdde58a],
  [0x2f5a40, 0x4f8c4a, 0xb6d58a],
  [0x46703a, 0x86b24e, 0xe8e59a],
];

const BLOSSOM: [number, number, number] = [0x8a3326, 0xe0573a, 0xffb36b];

interface Blob {
  x: number;
  y: number;
  z: number;
  radius: number;
  palette: readonly [number, number, number];
}

/**
 * Một tán lá liền khối từ nhiều cầu mềm, tô màu theo đỉnh như vẽ tay: dưới
 * tán sẫm và mát, đỉnh tán và phía nắng sáng ấm. Gộp thành MỘT hình — một cây
 * là một lần vẽ chứ không phải tám.
 */
function paintedClump(blobs: readonly Blob[]): THREE.BufferGeometry {
  const bottom = Math.min(...blobs.map((blob) => blob.y - blob.radius));
  const top = Math.max(...blobs.map((blob) => blob.y + blob.radius));
  const shade = new THREE.Color();
  const body = new THREE.Color();
  const light = new THREE.Color();
  const color = new THREE.Color();
  const normal = new THREE.Vector3();

  const parts = blobs.map((blob) => {
    const geometry = new THREE.IcosahedronGeometry(blob.radius, 1);

    geometry.translate(blob.x, blob.y, blob.z);

    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const colors = new Float32Array(position.count * 3);

    shade.setHex(blob.palette[0]);
    body.setHex(blob.palette[1]);
    light.setHex(blob.palette[2]);

    for (let index = 0; index < position.count; index += 1) {
      const height = (position.getY(index) - bottom) / (top - bottom);

      normal
        .set(position.getX(index) - blob.x, position.getY(index) - blob.y, position.getZ(index) - blob.z)
        .normalize();

      const sunny = Math.max(0, normal.dot(SUN_SIDE));

      color.copy(shade).lerp(body, Math.min(1, height * 1.4));
      color.lerp(light, sunny * sunny * (0.25 + height * 0.55));
      colors.set([color.r, color.g, color.b], index * 3);
    }

    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.deleteAttribute("uv");

    return geometry;
  });

  return mergeGeometries(parts)!;
}

const FOLIAGE = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0 });
const BARK = 0x6e4a30;

export function createTree(options: TreeOptions = {}): THREE.Group {
  const tree = new THREE.Group();
  const scale = options.scale ?? 1;
  const random = mulberry(options.seed ?? 12345);
  const palette = CANOPY_PALETTES[Math.floor(random() * CANOPY_PALETTES.length)];
  const wide = options.banyan ? 1.7 : 1;

  tree.name = "tree";

  const trunkHeight = (options.banyan ? 2.4 : 2.1 + random() * 0.5) * scale;
  const lean = (random() - 0.5) * 0.12;
  const bark = standard(BARK, { roughness: 0.95 });

  // Thân thon dần, hơi nghiêng; hai cành chẽ ra đỡ tán.
  const trunk = cylinder(0.2 * scale, 0.36 * scale, trunkHeight, bark, [0, trunkHeight / 2, 0], 9);

  trunk.rotation.z = lean;
  tree.add(trunk);

  for (const side of [-1, 1]) {
    const length = (0.9 + random() * 0.5) * scale * wide;
    const branch = cylinder(0.07 * scale, 0.13 * scale, length, bark, [0, 0, 0], 6);

    branch.position.set(side * length * 0.35, trunkHeight * 0.85 + length * 0.3, (random() - 0.5) * 0.4 * scale);
    branch.rotation.z = -side * (0.7 + random() * 0.3);
    tree.add(branch);
  }

  // Tán: một cầu lớn ở giữa, vòng cầu nhỏ hơn quanh nó, vài cầu nhô trên đỉnh.
  const blobs: Blob[] = [];
  const crown = trunkHeight + 0.9 * scale;
  const ring = 6 + Math.floor(random() * 3);

  blobs.push({ x: 0, y: crown, z: 0, radius: 1.45 * scale * (options.banyan ? 1.2 : 1), palette });

  for (let index = 0; index < ring; index += 1) {
    const angle = (index / ring) * Math.PI * 2 + random() * 0.5;
    const out = (1.0 + random() * 0.45) * scale * wide;

    blobs.push({
      x: Math.cos(angle) * out,
      y: crown - 0.25 * scale + random() * 0.6 * scale,
      z: Math.sin(angle) * out,
      radius: (0.85 + random() * 0.4) * scale,
      palette: options.blossom && random() < 0.45 ? BLOSSOM : palette,
    });
  }

  for (let index = 0; index < (options.banyan ? 2 : 3); index += 1) {
    blobs.push({
      x: (random() - 0.5) * 1.1 * scale,
      y: crown + (0.75 + random() * 0.4) * scale,
      z: (random() - 0.5) * 1.1 * scale,
      radius: (0.75 + random() * 0.3) * scale,
      palette: options.blossom && index === 0 ? BLOSSOM : palette,
    });
  }

  const canopy = new THREE.Mesh(paintedClump(blobs), FOLIAGE);

  canopy.castShadow = true;
  canopy.position.x = Math.sin(lean) * -trunkHeight * 0.5;
  tree.add(canopy);

  if (options.banyan) {
    // Rễ phụ buông thõng từ dưới tán — dáng cây đa đầu làng.
    const root = standard(0x7d5a3c, { roughness: 1 });

    for (let index = 0; index < 12; index += 1) {
      const angle = random() * Math.PI * 2;
      const out = (0.8 + random() * 1.3) * scale;
      const length = (1.2 + random() * 1.3) * scale;
      const strand = cylinder(0.025 * scale, 0.035 * scale, length, root, [0, 0, 0], 4);

      strand.position.set(Math.cos(angle) * out, crown - 0.9 * scale - length / 2, Math.sin(angle) * out);
      strand.castShadow = false;
      tree.add(strand);
    }
  }

  return tree;
}

/**
 * Bụi tre: những thân tre mảnh có đốt, xoè ra từ một gốc rồi rủ ngọn; lá dồn
 * lên nửa trên thành những đám vàng-xanh. Lũy tre — viền của mọi làng quê.
 */
export function createBamboo(seed = 7): THREE.Group {
  const clump = new THREE.Group();
  const random = mulberry(seed);
  const culm = standard(0x8fae4e, { roughness: 0.7 });
  const node = standard(0x6f8a3a, { roughness: 0.8 });
  const blobs: Blob[] = [];
  const palette: [number, number, number] = [0x6f9442, 0xa9c860, 0xf0f0ae];

  clump.name = "bamboo";

  // Thân và đốt của cả bụi gộp thành hai hình — 13 thân × 10 đốt mà để rời là
  // hơn trăm lần vẽ cho một bụi tre.
  const culms: THREE.BufferGeometry[] = [];
  const nodes: THREE.BufferGeometry[] = [];
  const pose = new THREE.Object3D();

  for (let index = 0; index < 13; index += 1) {
    const angle = random() * Math.PI * 2;
    const height = 5 + random() * 2.6;
    const tilt = 0.08 + random() * 0.22;

    pose.position.set(Math.cos(angle) * 0.35 * random(), 0, Math.sin(angle) * 0.35 * random());
    pose.rotation.set(Math.sin(angle) * tilt, 0, -Math.cos(angle) * tilt);
    pose.updateMatrix();

    culms.push(new THREE.CylinderGeometry(0.045, 0.06, height, 6).translate(0, height / 2, 0).applyMatrix4(pose.matrix));

    for (let y = 0.55; y < height - 0.3; y += 0.55 + random() * 0.15) {
      nodes.push(new THREE.CylinderGeometry(0.068, 0.068, 0.05, 6).translate(0, y, 0).applyMatrix4(pose.matrix));
    }

    // Lá: nhiều đám nhỏ lơ thơ dọc nửa trên của thân tới tận ngọn, chìa ra
    // hai bên — lá tre thưa và nhẹ, không đặc như tán cây.
    for (let leaf = 0; leaf < 6; leaf += 1) {
      const along = height * (0.5 + leaf * 0.095);
      const side = leaf % 2 === 0 ? 1 : -1;
      const at = new THREE.Vector3(side * (0.25 + random() * 0.3), along, (random() - 0.5) * 0.5).applyEuler(pose.rotation);

      blobs.push({
        x: pose.position.x + at.x,
        y: at.y,
        z: pose.position.z + at.z,
        radius: 0.24 + random() * 0.18,
        palette,
      });
    }
  }

  const stalks = new THREE.Mesh(mergeGeometries(culms)!, culm);

  stalks.castShadow = true;
  clump.add(stalks, new THREE.Mesh(mergeGeometries(nodes)!, node));

  const leaves = new THREE.Mesh(paintedClump(blobs), FOLIAGE);

  // Đám lá tre dẹt như những chùm lông chim.
  leaves.scale.set(1, 0.55, 1);
  leaves.position.y = (blobs.reduce((sum, blob) => sum + blob.y, 0) / blobs.length) * 0.45;
  leaves.castShadow = true;
  clump.add(leaves);

  return clump;
}

/**
 * Cây chuối: thân giả xanh nâu, tàu lá to dài xoè ra rồi cong rủ xuống — bóng
 * dáng góc vườn quen thuộc cạnh giếng, sau nhà.
 */
export function createBanana(seed = 3): THREE.Group {
  const plant = new THREE.Group();
  const random = mulberry(seed);
  const height = 1.9 + random() * 0.6;

  plant.name = "banana";
  plant.add(cylinder(0.1, 0.17, height, standard(0x8b9a55, { roughness: 0.85 }), [0, height / 2, 0], 8));

  const leafMaterial = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.75,
    metalness: 0,
    side: THREE.DoubleSide,
  });

  const leaves = 7;

  for (let index = 0; index < leaves; index += 1) {
    const length = 1.5 + random() * 0.5;
    const geometry = new THREE.PlaneGeometry(0.62, length, 2, 8);
    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const colors = new Float32Array(position.count * 3);
    const color = new THREE.Color();

    for (let vertex = 0; vertex < position.count; vertex += 1) {
      // Lá dựng dọc theo +Y từ cuống; uốn cong rủ xuống về phía ngọn, mép lá
      // hơi cụp lại như lòng máng.
      const along = (position.getY(vertex) + length / 2) / length;
      const across = position.getX(vertex) / 0.31;

      // Thon ở cuống và ở mũi, rộng ở giữa — hình lá chuối chứ không phải dải băng.
      position.setX(vertex, position.getX(vertex) * Math.pow(Math.sin(Math.PI * Math.min(0.97, 0.08 + along)), 0.6));
      position.setY(vertex, along * length);
      position.setZ(vertex, -along * along * length * 0.55 + across * across * 0.06);

      color.setHex(0x5f9e3c).lerp(new THREE.Color(0xc8e070), along * 0.55 + (1 - Math.abs(across)) * 0.3);
      colors.set([color.r, color.g, color.b], vertex * 3);
    }

    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const leaf = new THREE.Mesh(geometry, leafMaterial);

    leaf.position.y = height - 0.1;
    leaf.rotation.set(0, (index / leaves) * Math.PI * 2 + random() * 0.4, 0, "YXZ");
    // Ngả ra ngoài: lá non dựng đứng, lá già xoè ngang.
    leaf.rotation.x = -(0.35 + random() * 0.6);
    leaf.castShadow = true;
    plant.add(leaf);
  }

  return plant;
}

// ── Bụi, đá, đống rơm ─────────────────────────────────────────────────────

export function createBush(scale = 1): THREE.Group {
  const bush = new THREE.Group();
  const random = mulberry(777 + Math.round(scale * 100));
  const palette = CANOPY_PALETTES[1];
  const blobs: Blob[] = [];

  for (let index = 0; index < 5; index += 1) {
    blobs.push({
      x: (index - 2) * 0.32 * scale + (random() - 0.5) * 0.2,
      y: (0.3 + random() * 0.25) * scale,
      z: (random() - 0.5) * 0.5 * scale,
      radius: (0.38 + random() * 0.25) * scale,
      palette,
    });
  }

  const mesh = new THREE.Mesh(paintedClump(blobs), FOLIAGE);

  mesh.castShadow = true;
  bush.add(mesh);

  return bush;
}

/** Tảng đá tròn lẳn, mặt trên phủ rêu — đá ở bờ ruộng, không phải đá sỏi góc cạnh. */
export function createRock(scale = 1): THREE.Mesh {
  const geometry = new THREE.IcosahedronGeometry(0.55 * scale, 1);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const random = mulberry(91);
  const stone = new THREE.Color(0x9a958a);
  const moss = new THREE.Color(0x7c9a4a);
  const color = new THREE.Color();

  for (let index = 0; index < position.count; index += 1) {
    // Lồi lõm nhẹ cho đá khỏi tròn như quả bóng.
    const bump = 0.88 + random() * 0.2;

    position.setXYZ(index, position.getX(index) * bump, position.getY(index) * bump, position.getZ(index) * bump);

    const up = position.getY(index) / (0.55 * scale);

    color.copy(stone).multiplyScalar(0.8 + up * 0.25).lerp(moss, Math.max(0, up - 0.35) * 1.2);
    colors.set([color.r, color.g, color.b], index * 3);
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const rock = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));

  rock.scale.set(1.15, 0.7, 1);
  rock.castShadow = true;
  rock.receiveShadow = true;

  return rock;
}

/** Độ cao mặt ngồi của gốc cây cụt — chỗ ngồi ngắm cảnh rải quanh làng (mét). */
export const STUMP_HEIGHT = 0.4;

/** Gốc cây cụt: vỏ sẫm, mặt cắt sáng có vòng tuổi — nhìn là biết "ngồi được". */
export function createStump(): THREE.Group {
  const stump = new THREE.Group();

  stump.name = "stump";
  stump.add(cylinder(0.3, 0.36, STUMP_HEIGHT, standard(0x6e4e30), [0, STUMP_HEIGHT / 2, 0], 9));
  stump.add(cylinder(0.27, 0.27, 0.02, standard(0xd2ab72), [0, STUMP_HEIGHT, 0], 9));
  stump.add(cylinder(0.14, 0.14, 0.022, standard(0xb38a55), [0, STUMP_HEIGHT + 0.001, 0], 9));

  return stump;
}

/** Độ cao mặt ngồi của băng ghế gỗ ngoài sân (mét). */
export const BENCH_SEAT_HEIGHT = 0.46;

/**
 * Băng ghế gỗ — chỗ ngồi ngắm ao. Mặt ngồi hướng về +Z cục bộ (người ngồi
 * quay mặt về phía đó), tựa lưng ở phía -Z.
 */
export function createBench(): THREE.Group {
  const bench = new THREE.Group();

  bench.name = "bench";

  const wood = standard(0xa8784a, { roughness: 0.9 });
  const dark = standard(0x6f4a2c);

  // Ba nan ngồi, hở khe — nhìn là biết ghế gỗ chứ không phải khối hộp.
  for (const z of [-0.14, 0, 0.14]) {
    bench.add(box(1.7, 0.05, 0.12, wood, [0, BENCH_SEAT_HEIGHT - 0.025, z]));
  }

  // Tựa lưng hơi ngả ra sau.
  const back = new THREE.Group();

  back.position.set(0, BENCH_SEAT_HEIGHT, -0.22);
  back.rotation.x = -0.18;
  back.add(box(1.7, 0.1, 0.04, wood, [0, 0.22, 0]), box(1.7, 0.1, 0.04, wood, [0, 0.4, 0]));
  bench.add(back);

  // Bốn chân + hai thanh đỡ tay.
  for (const x of [-0.72, 0.72]) {
    bench.add(box(0.07, BENCH_SEAT_HEIGHT, 0.07, dark, [x, BENCH_SEAT_HEIGHT / 2, 0.17]));
    bench.add(box(0.07, BENCH_SEAT_HEIGHT + 0.45, 0.07, dark, [x, (BENCH_SEAT_HEIGHT + 0.45) / 2 - 0.02, -0.2]));
    bench.add(box(0.07, 0.05, 0.42, dark, [x, BENCH_SEAT_HEIGHT + 0.2, -0.02]));
  }

  return bench;
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

export { POND_RADIUS };

/** Đáy ao sâu nhất, tính từ mặt đất (mét) — đủ cho `SwimTuning.depthMax`. */
const POND_FLOOR = 1.6;

export function createPond(radius = POND_RADIUS): THREE.Group {
  const pond = new THREE.Group();

  pond.name = "pond";

  const water = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 36),
    new THREE.MeshStandardMaterial({
      color: 0x66b3d6,
      roughness: 0.15,
      metalness: 0.25,
      transparent: true,
      // Đủ trong để thấy người lặn và sen dưới đáy, đủ đục để vẫn là nước ao.
      opacity: 0.62,
    }),
  );

  water.name = "pond-water";
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.06;
  water.receiveShadow = true;

  pond.add(water);

  // Lòng ao: một cái chậu bùn tròn ngay dưới lỗ khoét trên mặt đất (xem
  // `Terrain` — mặt đất bỏ đi mọi điểm trong bán kính ao). Thành dốc gần mép
  // rồi phẳng, để bơi sát bờ ở độ sâu tối đa vẫn không chạm đáy.
  const bed = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.001, -POND_FLOOR),
        new THREE.Vector2(radius - 0.3, -POND_FLOOR + 0.12),
        new THREE.Vector2(radius, 0.02),
      ],
      36,
    ),
    standard(0x56603f, { roughness: 1, side: THREE.DoubleSide }),
  );

  bed.receiveShadow = true;
  pond.add(bed);

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
