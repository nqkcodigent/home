import * as THREE from "three";

import { disposeObject } from "./dispose";
import { distanceToPath, YARD } from "./layout";
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

const GRASS_LIGHT = new THREE.Color(0x8ec96a);
const GRASS_DARK = new THREE.Color(0x6ba84c);
const DIRT = new THREE.Color(0xc9a273);

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
      grassCount: 900,
      flowerCount: 130,
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

      // Hai sắc cỏ trộn theo một nhiễu sin rẻ tiền — mặt cỏ phẳng lì một màu
      // trông như thảm nhựa.
      const mix = 0.5 + 0.5 * Math.sin(x * 0.13) * Math.cos(z * 0.11);
      const variation = 0.9 + 0.2 * Math.sin(x * 0.7 + z * 0.4);

      color.copy(GRASS_LIGHT).lerp(GRASS_DARK, mix * 0.85).multiplyScalar(variation);

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

    const ground = new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.95,
        metalness: 0,
      }),
    );

    ground.receiveShadow = true;
    ground.name = "ground";

    return ground;
  }

  // ── Cỏ ──────────────────────────────────────────────────────────────────

  private createGrass(): THREE.InstancedMesh {
    const { grassCount, seed } = this.options;

    const geometry = new THREE.ConeGeometry(0.055, 0.34, 5, 1);

    // Gốc nón nằm ở tâm: dời lên để chân cỏ nằm trên mặt đất.
    geometry.translate(0, 0.17, 0);

    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }),
      grassCount,
    );

    const random = createRandom(seed);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    const position = new THREE.Vector3();
    const color = new THREE.Color();

    let placed = 0;

    for (let attempt = 0; attempt < grassCount * 6 && placed < grassCount; attempt += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 4 + random() * 26;

      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      if (distanceToPath(x, z) < 1.5) continue;
      if (Math.hypot(x - YARD.well.x, z - YARD.well.z) < 2.6) continue;
      if (Math.hypot(x - YARD.pond.x, z - YARD.pond.z) < 3.4) continue;

      // Chừa sân trước nhà: cỏ mọc um tùm ngay cửa ra vào trông lạnh lẽo.
      if (Math.abs(x - YARD.house.x) < 4.4 && Math.abs(z - YARD.house.z) < 4.4) {
        continue;
      }

      position.set(x, terrainHeight(x, z) - 0.02, z);

      const height = 0.7 + random() * 0.9;

      scale.set(0.8 + random() * 0.5, height, 0.8 + random() * 0.5);

      quaternion.setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        random() * Math.PI * 2,
      );

      matrix.compose(position, quaternion, scale);

      mesh.setMatrixAt(placed, matrix);

      color
        .copy(GRASS_LIGHT)
        .lerp(GRASS_DARK, random())
        .multiplyScalar(0.85 + random() * 0.3);

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

    const geometry = new THREE.SphereGeometry(0.075, 8, 6);

    const mesh = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 }),
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

    for (let attempt = 0; attempt < flowerCount * 8 && placed < flowerCount; attempt += 1) {
      const angle = random() * Math.PI * 2;
      const radius = 5 + random() * 20;

      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      if (distanceToPath(x, z) < 1.9) continue;
      if (Math.hypot(x - YARD.well.x, z - YARD.well.z) < 3) continue;

      position.set(x, terrainHeight(x, z) + 0.16, z);
      scale.setScalar(0.8 + random() * 0.6);

      matrix.compose(position, quaternion, scale);

      mesh.setMatrixAt(placed, matrix);

      color.setHex(petals[Math.floor(random() * petals.length)]);

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

/** Sinh số ngẫu nhiên có hạt giống — cảnh phải giống nhau ở mọi lần tải. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;

    return state / 4294967296;
  };
}
