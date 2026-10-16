import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { disposeObject } from "./dispose";
import { distanceToPath, POND_RADIUS, YARD } from "./layout";
import { terrainHeight } from "../terrain/heightfield";

/**
 * Mặt đất: cỏ, lối đi đất, bụi cỏ và hoa.
 *
 * Lối đi được vẽ bằng MÀU ĐỈNH (vertex color) chứ không phải mesh riêng: một
 * dải đất đặt nổi trên cỏ sẽ z-fighting ở mọi sườn dốc, còn tô màu đỉnh thì
 * dính chặt vào địa hình và miễn phí.
 *
 * Cỏ và hoa dùng InstancedMesh — 800 bụi cỏ là 1 draw call, không phải 800.
 */

/** Gió nhẹ thường ngày khi không thả diều. */
export const GRASS_CALM_WIND = 0.25;

/**
 * Uniform dùng chung cho mọi bãi cỏ: ván diều đặt `wind` theo sức gió của
 * mô phỏng, xong ván thì trả về `GRASS_CALM_WIND`.
 */
export const GRASS_SWAY = {
  time: { value: 0 },
  wind: { value: GRASS_CALM_WIND },
};

const GRASS_LIGHT = new THREE.Color(0x8ec96a);
const GRASS_DARK = new THREE.Color(0x6ba84c);
/** Mảng cỏ ngả vàng nắng và mảng cỏ xanh mát — hai nét màu của tranh đồng quê. */
const GRASS_SUN = new THREE.Color(0xb7c96a);
const GRASS_COOL = new THREE.Color(0x5e9a55);
const DIRT = new THREE.Color(0xc9a273);

/** Chiều cao túm cỏ (mét) — shader gió đo độ cong theo nó. */
const BLADE_HEIGHT = 0.42;

export interface TerrainOptions {
  size?: number;
  segments?: number;
  grassCount?: number;
  flowerCount?: number;
  seed?: number;
}

export class Terrain {
  readonly group = new THREE.Group();

  private readonly options: Required<TerrainOptions>;

  constructor(options: TerrainOptions = {}) {
    this.options = {
      size: 220,
      segments: 128,
      grassCount: 3200,
      flowerCount: 520,
      seed: 20261009,
      ...options,
    };

    this.group.name = "terrain";
    this.group.add(this.createGround(), this.createGrass(), this.createFlowers());
  }

  dispose() {
    disposeObject(this.group);
  }

  // ── Đất ─────────────────────────────────────────────────────────────────

  private createGround(): THREE.Mesh {
    const { size, segments } = this.options;

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);

    geometry.rotateX(-Math.PI / 2);

    const position = geometry.getAttribute("position") as THREE.BufferAttribute;
    const colors = new Float32Array(position.count * 3);
    const color = new THREE.Color();

    for (let index = 0; index < position.count; index += 1) {
      const x = position.getX(index);
      const z = position.getZ(index);
      const height = terrainHeight(x, z);

      position.setY(index, height);

      // Mảng màu loang như màu nước: nhiễu mềm nhiều tầng, bước sóng dài hơn
      // hẳn ô lưới (1,7 m). Nhiễu sin ngắn cũ bị lấy mẫu thưa thành sọc vằn.
      const mix = fbm(x * 0.035, z * 0.035);
      const sun = fbm(x * 0.022 + 31.7, z * 0.022 - 12.4);

      color.copy(GRASS_LIGHT).lerp(GRASS_DARK, mix);
      color.lerp(GRASS_SUN, smooth(0.5, 0.78, sun) * 0.7);
      color.lerp(GRASS_COOL, smooth(0.55, 0.85, 1 - sun) * 0.45);

      // Lối đi: cứng trong lòng đường, tan dần ra hai bên.
      const path = distanceToPath(x, z);

      if (path < 1.55) {
        const blend = path < 0.95 ? 1 : 1 - (path - 0.95) / 0.6;

        color.lerp(DIRT, blend * 0.92);
      }

      // Sân giếng bị giẫm nhiều nên đất trơ ra một khoảng.
      const wellDistance = Math.hypot(x - YARD.well.x, z - YARD.well.z);

      if (wellDistance < 2.4) {
        color.lerp(DIRT, (1 - wellDistance / 2.4) * 0.55);
      }

      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }

    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.95,
      metalness: 0,
    });

    // Khoét một lỗ tròn đúng bằng mặt ao, để thấy được lòng ao bên dưới (người
    // lặn, sen chìm). Khoét trong shader vì lưới đất ô 1,7 m — hạ đỉnh lưới thì
    // mép hố răng cưa và lan ra ngoài bờ; `discard` thì tròn tuyệt đối.
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uPond = { value: new THREE.Vector3(YARD.pond.x, YARD.pond.z, POND_RADIUS) };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec2 vGroundXZ;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGroundXZ = position.xz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 uPond;\nvarying vec2 vGroundXZ;")
        .replace(
          "#include <clipping_planes_fragment>",
          "#include <clipping_planes_fragment>\nif (distance(vGroundXZ, uPond.xy) < uPond.z) discard;",
        );
    };

    const ground = new THREE.Mesh(geometry, material);

    ground.receiveShadow = true;
    ground.name = "ground";

    return ground;
  }

  // ── Cỏ ──────────────────────────────────────────────────────────────────

  private createGrass(): THREE.InstancedMesh {
    const { grassCount, seed } = this.options;

    const geometry = createTuftGeometry();

    // Màu đỉnh tối ở gốc, sáng ở ngọn (xem `createTuftGeometry`) nhân với
    // màu từng túm — một nét cọ chứ không phải một chóp nón đồng màu.
    const material = new THREE.MeshStandardMaterial({
      roughness: 1,
      metalness: 0,
      vertexColors: true,
    });

    // Ngọn cỏ lệch theo gió, gốc đứng yên (lệch tỉ lệ bình phương độ cao).
    // Pha lấy theo vị trí từng bụi nên cả bãi gợn như sóng, không lắc đồng loạt.
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = GRASS_SWAY.time;
      shader.uniforms.uWind = GRASS_SWAY.wind;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWind;")
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          #ifdef USE_INSTANCING
            float phase = instanceMatrix[3].x * 0.35 + instanceMatrix[3].z * 0.25;
            float bend = (sin(uTime * 2.2 + phase) + 0.4 * sin(uTime * 5.1 + phase * 2.0)) * uWind;
            float tip = transformed.y / ${BLADE_HEIGHT.toFixed(2)};
            transformed.x += bend * tip * tip * 0.12;
          #endif`,
        );
    };

    const mesh = new THREE.InstancedMesh(geometry, material, grassCount);

    mesh.onBeforeRender = () => {
      GRASS_SWAY.time.value = performance.now() / 1000;
    };

    const random = createRandom(seed);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const color = new THREE.Color();

    let placed = 0;

    for (let attempt = 0; attempt < grassCount * 8 && placed < grassCount; attempt += 1) {
      const angle = random() * Math.PI * 2;
      // Dày quanh sân, thưa dần ra đồng xa (căn bậc hai → mật độ đều theo
      // diện tích, nhân thêm một độ lệch về phía gần).
      const radius = 3 + Math.pow(random(), 0.8) * 62;

      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      // Cỏ mọc thành đám chứ không rải đều như cấy.
      if (fbm(x * 0.12 + 7.1, z * 0.12 - 3.3) < 0.4) continue;

      if (distanceToPath(x, z) < 1.5) continue;
      if (Math.hypot(x - YARD.well.x, z - YARD.well.z) < 2.6) continue;
      if (Math.hypot(x - YARD.pond.x, z - YARD.pond.z) < 3.4) continue;

      // Chừa sân trước nhà: cỏ mọc um tùm ngay cửa ra vào trông lạnh lẽo.
      if (Math.abs(x - YARD.house.x) < 4.4 && Math.abs(z - YARD.house.z) < 4.4) {
        continue;
      }

      position.set(x, terrainHeight(x, z) - 0.02, z);

      const height = 0.6 + random() * 0.8;
      const width = 0.8 + random() * 0.6;

      scale.set(width, height, width);

      quaternion.setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        random() * Math.PI * 2,
      );

      matrix.compose(position, quaternion, scale);

      mesh.setMatrixAt(placed, matrix);

      color
        .copy(GRASS_LIGHT)
        .lerp(GRASS_DARK, random())
        .lerp(GRASS_SUN, fbm(x * 0.022 + 31.7, z * 0.022 - 12.4) * 0.5)
        .multiplyScalar(0.9 + random() * 0.25);

      mesh.setColorAt(placed, color);

      placed += 1;
    }

    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;

    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    mesh.name = "grass";

    return mesh;
  }

  // ── Hoa ─────────────────────────────────────────────────────────────────

  private createFlowers(): THREE.InstancedMesh {
    const { flowerCount, seed } = this.options;

    const geometry = createFlowerGeometry();

    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, vertexColors: true, side: THREE.DoubleSide }),
      flowerCount,
    );

    const random = createRandom(seed + 991);
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const scale = new THREE.Vector3(1, 1, 1);
    const quaternion = new THREE.Quaternion();
    const color = new THREE.Color();

    // Hoa dại Việt Nam: trắng, hồng nhạt, vàng nhạt, tím nhạt.
    const petals = [0xfff8f8, 0xffd9e6, 0xfff0a6, 0xdcd0ff];

    let placed = 0;

    // Hoa dại mọc theo khóm, mỗi khóm một màu — như những chấm màu điểm lên
    // tranh, không rắc đều như hạt tiêu.
    const patches = Array.from({ length: 22 }, () => {
      const angle = random() * Math.PI * 2;
      const radius = 6 + random() * 40;

      return {
        x: Math.cos(angle) * radius,
        z: Math.sin(angle) * radius,
        spread: 1.2 + random() * 2.2,
        petal: petals[Math.floor(random() * petals.length)],
      };
    });

    for (let attempt = 0; attempt < flowerCount * 8 && placed < flowerCount; attempt += 1) {
      const patch = patches[attempt % patches.length];
      // Tổng hai số ngẫu nhiên ~ phân bố tam giác: dày ở giữa khóm, thưa ra mép.
      const angle = random() * Math.PI * 2;
      const radius = (random() + random()) * 0.5 * patch.spread;

      const x = patch.x + Math.cos(angle) * radius;
      const z = patch.z + Math.sin(angle) * radius;

      if (distanceToPath(x, z) < 1.9) continue;
      if (Math.hypot(x - YARD.well.x, z - YARD.well.z) < 3) continue;
      if (Math.hypot(x - YARD.pond.x, z - YARD.pond.z) < POND_RADIUS + 0.4) continue;
      if (Math.abs(x - YARD.house.x) < 4.4 && Math.abs(z - YARD.house.z) < 4.4) continue;

      position.set(x, terrainHeight(x, z) - 0.02, z);
      quaternion.setFromAxisAngle(UP, random() * Math.PI * 2);
      scale.setScalar(0.75 + random() * 0.6);

      matrix.compose(position, quaternion, scale);

      mesh.setMatrixAt(placed, matrix);

      color.setHex(patch.petal);

      mesh.setColorAt(placed, color);

      placed += 1;
    }

    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;

    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    mesh.name = "flowers";

    return mesh;
  }
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Túm cỏ: ba lá thon hình tam giác cong ra ngoài, xoè ba hướng. Màu đỉnh tối
 * ở gốc, sáng ở ngọn — nét đậm-nhạt của một nhát cọ.
 */
function createTuftGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];

  for (let blade = 0; blade < 3; blade += 1) {
    const turn = (blade / 3) * Math.PI * 2 + blade * 0.4;
    const out = 0.06 + blade * 0.02;
    const height = BLADE_HEIGHT * (0.75 + blade * 0.12);
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    // Lá: hai đỉnh gốc rộng 4 cm, mũi lệch ra ngoài theo hướng xoè.
    const front = [
      [-0.035, 0, 0],
      [0.035, 0, 0],
      [0, height, out],
    ];
    // Mặt sau dựng riêng (đảo chiều) thay cho DoubleSide: DoubleSide lật pháp
    // tuyến ở mặt sau, nửa bãi cỏ thành nét đen.
    const back = [front[1], front[0], front[2]];

    for (const [lx, ly, lz] of [...front, ...back]) {
      positions.push(lx * cos + lz * sin, ly, -lx * sin + lz * cos);

      const shade = 0.72 + 0.45 * (ly / BLADE_HEIGHT);

      colors.push(shade, shade, shade * 0.95);
    }
  }

  const geometry = new THREE.BufferGeometry();

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  // Pháp tuyến hướng lên trời: lá mỏng hai mặt mà lấy pháp tuyến thật thì một
  // nửa bãi cỏ tối sầm theo hướng mặt trời.
  const normals = geometry.getAttribute("normal") as THREE.BufferAttribute;

  for (let index = 0; index < normals.count; index += 1) normals.setXYZ(index, 0, 1, 0);

  return geometry;
}

/**
 * Bông hoa dại: cuống xanh, năm cánh tròn ngửa lên, nhuỵ vàng. Cánh màu trắng
 * để nhân với màu từng khóm; cuống và nhuỵ mang sẵn màu riêng.
 */
function createFlowerGeometry(): THREE.BufferGeometry {
  const paint = (geometry: THREE.BufferGeometry, hex: number) => {
    const color = new THREE.Color(hex);
    const count = geometry.getAttribute("position").count;

    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(Array.from({ length: count }, () => [color.r, color.g, color.b]).flat(), 3),
    );

    return geometry.toNonIndexed();
  };

  const stemHeight = 0.24;
  const stem = new THREE.CylinderGeometry(0.008, 0.011, stemHeight, 4, 1);

  stem.translate(0, stemHeight / 2, 0);

  const parts = [paint(stem, 0x7fb055)];

  for (let petal = 0; petal < 5; petal += 1) {
    const turn = (petal / 5) * Math.PI * 2;
    const leaf = new THREE.CircleGeometry(0.045, 6);

    leaf.scale(1, 1.6, 1);
    leaf.translate(0, 0.06, 0);
    leaf.rotateX(-Math.PI / 2 + 0.25);
    leaf.rotateY(turn);
    leaf.translate(0, stemHeight, 0);
    parts.push(paint(leaf, 0xffffff));
  }

  const heart = new THREE.SphereGeometry(0.03, 6, 4);

  heart.translate(0, stemHeight + 0.01, 0);
  parts.push(paint(heart, 0xffc93a));

  for (const part of parts) part.deleteAttribute("uv");

  return mergeGeometries(parts.map((part) => {
    part.deleteAttribute("normal");
    part.computeVertexNormals();

    return part;
  }))!;
}

/** Nhiễu giá trị 2D mềm (0 … 1) — tất định, đủ cho loang màu đất. */
function noise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const corner = (cx: number, cz: number) => {
    const value = Math.sin(cx * 127.1 + cz * 311.7) * 43758.5453;

    return value - Math.floor(value);
  };
  const top = corner(ix, iz) + (corner(ix + 1, iz) - corner(ix, iz)) * ux;
  const bottom = corner(ix, iz + 1) + (corner(ix + 1, iz + 1) - corner(ix, iz + 1)) * ux;

  return top + (bottom - top) * uz;
}

/** Ba tầng nhiễu chồng nhau (0 … 1): mảng lớn, mảng vừa, vệt nhỏ. */
export function fbm(x: number, z: number): number {
  return (noise(x, z) * 0.57 + noise(x * 2.03, z * 2.03) * 0.29 + noise(x * 4.1, z * 4.1) * 0.14);
}

function smooth(from: number, to: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));

  return t * t * (3 - 2 * t);
}

/** Sinh số ngẫu nhiên có hạt giống — cảnh phải giống nhau ở mọi lần tải. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;

    return state / 4294967296;
  };
}
