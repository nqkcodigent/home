import * as THREE from "three";

import { terrainHeight } from "../terrain/heightfield";

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

/** Tâm hai cửa sổ mặt tiền (X cục bộ); ô kính 1,2 × 1,05 m ở độ cao 1,9 m. */
const FRONT_WINDOWS = [1.4, 2.7] as const;

/** Cửa sổ tường hông phải (+X): tâm theo Z, độ cao tâm, kích thước ô. */
export const SIDE_WINDOW = { z: 0.6, y: 1.9, width: 1.1, height: 0.95 } as const;

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
  house.add(box(0.7, 1.5, 0.7, standard(0xc2867a), [2.1, wallHeight + 1.5, -1.2]));

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
 * Bốn bức tường được rải thành từng hình tròn nhỏ — cùng cách làm với hàng
 * rào, và cùng một lý do: hình tròn là thứ duy nhất hệ va chạm biết.
 *
 * Mặt tiền CHỪA khoảng cửa, nên đây cũng chính là chỗ nói bằng số rằng "nhà
 * này vào được".
 */
export function createHouseObstacles(): Obstacle[] {
  const obstacles: Obstacle[] = [];

  const { width, depth, doorFrom, doorTo } = HOUSE;
  const halfWidth = width / 2;
  const halfDepth = depth / 2;

  /** Rải cọc chặn dọc một đoạn thẳng, bước nhỏ hơn hai lần bán kính. */
  const wall = (
    from: { x: number; z: number },
    to: { x: number; z: number },
  ) => {
    const length = Math.hypot(to.x - from.x, to.z - from.z);
    const steps = Math.max(1, Math.ceil(length / 0.42));

    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;

      obstacles.push({
        x: from.x + (to.x - from.x) * t,
        z: from.z + (to.z - from.z) * t,
        radius: 0.22,
      });
    }
  };

  // Tường hậu, hai tường hông.
  wall({ x: -halfWidth, z: -halfDepth }, { x: halfWidth, z: -halfDepth });
  wall({ x: -halfWidth, z: -halfDepth }, { x: -halfWidth, z: halfDepth });
  wall({ x: halfWidth, z: -halfDepth }, { x: halfWidth, z: halfDepth });

  // Mặt tiền: hai đoạn, chừa đúng khoảng cửa ở giữa.
  wall({ x: -halfWidth, z: halfDepth }, { x: doorFrom, z: halfDepth });
  wall({ x: doorTo, z: halfDepth }, { x: halfWidth, z: halfDepth });

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
  const obstacles: Obstacle[] = [];
  const z = HOUSE.depth / 2;

  for (let x = HOUSE.doorFrom; x <= HOUSE.doorTo + 1e-6; x += 0.31) {
    obstacles.push({ x, z, radius: 0.22 });
  }

  return obstacles;
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

/**
 * Bán kính mặt nước của cái ao (mét).
 *
 * Khai báo thành hằng số vì có BA bên cùng cần con số này: hình khối (`createPond`),
 * vật cản của nhân vật, và mô hình bơi (bơi ra ngoài bán kính là bơi lên cỏ).
 */
export const POND_RADIUS = 3.2;

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
