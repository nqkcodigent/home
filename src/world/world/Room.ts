import * as THREE from "three";

import type { Bounds, Obstacle } from "../physics/collide";

/**
 * Căn hộ của người lớn — chương mở đầu, ban đêm.
 *
 * Khác hẳn sân tuổi thơ về tông: ở đây cố ý dùng màu xám xanh, ít chi tiết,
 * và chỉ có hai nguồn sáng (đèn ngủ vàng ấm + ánh trăng xanh lạnh từ cửa sổ).
 * Tương phản giữa hai bối cảnh chính là cách kể chuyện rẻ nhất mà mạnh nhất:
 * căn phòng này phải trông trống trải trước khi giấc mơ mở ra.
 */

export interface RoomPoint {
  x: number;
  y: number;
  z: number;
}

export interface RoomBuild {
  group: THREE.Group;
  /** Điểm kịch bản: chỗ đi tới (`walk`) và chỗ ngắm (`pan`) */
  points: {
    hall: RoomPoint;
    bed: RoomPoint;
    window: RoomPoint;
    room: RoomPoint;
  };
  spawn: { x: number; z: number; yaw: number };
  obstacles: Obstacle[];
  bounds: Bounds;
}

const WALL = 0x2c3444;
const WALL_DARK = 0x232a38;
const FLOOR = 0x4b3a2e;
const WOOD = 0x6d4b32;

const WIDTH = 20;
const DEPTH = 16;
const HEIGHT = 3.5;

function standard(
  color: number,
  options: THREE.MeshStandardMaterialParameters = {},
) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
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

function plane(
  width: number,
  height: number,
  material: THREE.Material,
  position: [number, number, number],
  rotation: [number, number, number] = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);

  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.receiveShadow = true;

  return mesh;
}

export function createRoom(): RoomBuild {
  const group = new THREE.Group();

  group.name = "room";

  // ── Vỏ phòng ────────────────────────────────────────────────────────────
  group.add(
    plane(WIDTH, DEPTH, standard(FLOOR, { roughness: 0.9 }), [0, 0, 0], [
      -Math.PI / 2,
      0,
      0,
    ]),
  );

  group.add(
    plane(WIDTH, HEIGHT, standard(WALL_DARK), [0, HEIGHT / 2, -DEPTH / 2], [
      0,
      0,
      0,
    ]),
  );
  group.add(
    plane(WIDTH, HEIGHT, standard(WALL_DARK), [0, HEIGHT / 2, DEPTH / 2], [
      0,
      Math.PI,
      0,
    ]),
  );
  group.add(
    plane(DEPTH, HEIGHT, standard(WALL), [-WIDTH / 2, HEIGHT / 2, 0], [
      0,
      Math.PI / 2,
      0,
    ]),
  );
  group.add(
    plane(DEPTH, HEIGHT, standard(WALL), [WIDTH / 2, HEIGHT / 2, 0], [
      0,
      -Math.PI / 2,
      0,
    ]),
  );
  group.add(
    plane(WIDTH, DEPTH, standard(0x1f2531), [0, HEIGHT, 0], [Math.PI / 2, 0, 0]),
  );

  // ── Cửa sổ + trăng ──────────────────────────────────────────────────────
  const windowX = -4;

  group.add(
    box(2.8, 2.0, 0.12, standard(0xd8d4c8), [windowX, 1.9, -DEPTH / 2 + 0.06]),
  );

  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 1.6),
    new THREE.MeshBasicMaterial({ color: 0xbcd2ff }),
  );

  glass.position.set(windowX, 1.9, -DEPTH / 2 + 0.14);
  group.add(glass);

  // Song cửa
  for (const offset of [-0.4, 0, 0.4]) {
    group.add(
      box(0.06, 1.6, 0.1, standard(0xd8d4c8), [
        windowX + offset * 2,
        1.9,
        -DEPTH / 2 + 0.16,
      ]),
    );
  }

  const moonlight = new THREE.SpotLight(0xa9c4ff, 42, 28, 0.68, 0.85, 1.3);

  moonlight.position.set(windowX, 2.6, -DEPTH / 2 + 0.5);
  moonlight.target.position.set(windowX + 1.5, 0, 2);
  moonlight.castShadow = true;
  moonlight.shadow.mapSize.set(1024, 1024);
  moonlight.shadow.bias = -0.0012;
  group.add(moonlight, moonlight.target);

  // ── Cửa ra hành lang ────────────────────────────────────────────────────
  const doorX = 6;

  group.add(
    box(1.5, 2.4, 0.14, standard(0xcfc9bb), [doorX, 1.2, -DEPTH / 2 + 0.08]),
  );
  group.add(
    box(1.24, 2.2, 0.1, standard(0x3c2c22), [doorX, 1.1, -DEPTH / 2 + 0.16]),
  );
  group.add(
    box(0.1, 0.1, 0.12, standard(0xd9b25f, { metalness: 0.6, roughness: 0.35 }), [
      doorX - 0.42,
      1.05,
      -DEPTH / 2 + 0.22,
    ]),
  );

  // ── Giường ──────────────────────────────────────────────────────────────
  const bedX = -7.2;

  group.add(box(2.4, 0.38, 2.8, standard(WOOD), [bedX, 0.19, 0.4]));
  group.add(box(2.2, 0.28, 2.6, standard(0xe8e3d6), [bedX, 0.5, 0.4]));
  group.add(box(1.5, 0.16, 2.5, standard(0x5a6d8c), [bedX + 0.32, 0.68, 0.4]));
  group.add(box(0.7, 0.2, 1.0, standard(0xf6f3ea), [bedX - 0.55, 0.72, -0.6]));

  // ── Bàn ngủ + đèn ───────────────────────────────────────────────────────
  group.add(box(0.8, 0.55, 0.8, standard(0x54402f), [bedX, 0.28, 2.9]));

  const lamp = new THREE.Group();

  lamp.position.set(bedX, 0.55, 2.9);
  lamp.add(box(0.22, 0.05, 0.22, standard(0x2f333a), [0, 0.03, 0]));
  lamp.add(box(0.05, 0.5, 0.05, standard(0x2f333a), [0, 0.28, 0]));
  lamp.add(
    new THREE.Mesh(
      new THREE.ConeGeometry(0.26, 0.3, 12, 1, true),
      standard(0xffe1a8, {
        side: THREE.DoubleSide,
        emissive: 0xffb96a,
        emissiveIntensity: 0.35,
      }),
    ).translateY(0.58),
  );
  group.add(lamp);

  const lampLight = new THREE.PointLight(0xffb56a, 26, 11, 1.6);

  lampLight.position.set(bedX, 1.2, 2.9);
  lampLight.castShadow = true;
  lampLight.shadow.mapSize.set(1024, 1024);
  lampLight.shadow.bias = -0.002;
  group.add(lampLight);

  // ── Bàn làm việc + laptop còn sáng ──────────────────────────────────────
  const deskX = 6.2;
  const deskZ = -5.4;

  group.add(box(3.0, 0.12, 1.3, standard(0x7a5638), [deskX, 0.78, deskZ]));

  for (const [ox, oz] of [
    [-1.3, -0.5],
    [1.3, -0.5],
    [-1.3, 0.5],
    [1.3, 0.5],
  ]) {
    group.add(
      box(0.1, 0.78, 0.1, standard(0x3b2b20), [deskX + ox, 0.39, deskZ + oz]),
    );
  }

  const laptopBase = box(1.0, 0.06, 0.7, standard(0x9aa3ad, { metalness: 0.5 }), [
    deskX,
    0.87,
    deskZ + 0.25,
  ]);

  group.add(laptopBase);

  const screen = box(1.0, 0.62, 0.05, standard(0x9aa3ad, { metalness: 0.5 }), [
    deskX,
    1.18,
    deskZ - 0.1,
  ]);

  screen.rotation.x = -0.24;
  group.add(screen);
  group.add(
    box(0.88, 0.5, 0.03, new THREE.MeshBasicMaterial({ color: 0xa8d8ff }), [
      deskX,
      1.18,
      deskZ - 0.05,
    ]).rotateX(-0.24),
  );

  const screenGlow = new THREE.PointLight(0x9fd0ff, 6, 5.5, 2);

  screenGlow.position.set(deskX, 1.3, deskZ + 0.2);
  group.add(screenGlow);

  // Ghế xoay
  group.add(box(0.6, 0.1, 0.6, standard(0x343b47), [5.4, 0.46, -3.6]));
  group.add(box(0.6, 0.7, 0.1, standard(0x343b47), [5.4, 0.85, -3.85]));
  group.add(box(0.12, 0.45, 0.12, standard(0x2a303a), [5.4, 0.22, -3.6]));
  group.add(box(0.5, 0.06, 0.5, standard(0x2a303a), [5.4, 0.03, -3.6]));

  // ── Thảm ────────────────────────────────────────────────────────────────
  const rug = new THREE.Mesh(
    new THREE.CircleGeometry(2.6, 32),
    standard(0x5c4a63, { roughness: 1 }),
  );

  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0.5, 0.012, 1.5);
  rug.receiveShadow = true;
  group.add(rug);

  // ── Tranh trên tường ────────────────────────────────────────────────────
  for (const [x, y, color] of [
    [-8.5, 2.3, 0xd9c7a3],
    [2.5, 2.4, 0xb9cbd9],
  ] as const) {
    group.add(box(0.9, 0.7, 0.05, standard(0x2a2018), [x, y, -DEPTH / 2 + 0.1]));
    group.add(box(0.78, 0.58, 0.03, standard(color), [x, y, -DEPTH / 2 + 0.14]));
  }

  return {
    group,
    points: {
      hall: { x: doorX - 1.4, y: 0, z: -DEPTH / 2 + 1.6 },
      bed: { x: bedX + 2.2, y: 0, z: 1.2 },
      window: { x: windowX, y: 1.7, z: -DEPTH / 2 },
      room: { x: 0.5, y: 1.1, z: 4 },
    },
    spawn: { x: 1.5, z: 5.5, yaw: Math.PI },
    obstacles: [
      { x: bedX, z: 0.4, radius: 1.95 },
      { x: bedX, z: 2.9, radius: 0.62 },
      { x: deskX, z: deskZ, radius: 1.7 },
      { x: 5.4, z: -3.6, radius: 0.65 },
    ],
    bounds: {
      minX: -WIDTH / 2 + 0.6,
      maxX: WIDTH / 2 - 0.6,
      minZ: -DEPTH / 2 + 0.6,
      maxZ: DEPTH / 2 - 0.6,
    },
  };
}
