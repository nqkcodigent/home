import * as THREE from "three";

import { createKiteModel } from "../activities/kite/Kite";
import { createTree } from "./Props";
import { terrainHeight } from "../terrain/heightfield";

import type { Vec3 } from "./Creatures";

/**
 * Cột mốc — những thứ GỌI người chơi từ xa, lý do để rẽ khỏi lối đi.
 *
 * Thế giới mở mà chỉ thấy đích khi đã đứng sát thì chẳng ai đi xa. Ba thứ ở
 * đây đều nhìn thấy từ giữa sân:
 *  - **Cây đa cô đơn trên đỉnh đồi gió** — bóng cây to giữa nền trời là lời mời
 *    leo đồi (trên đó có bãi diều riêng và một gốc cây ngồi ngắm làng).
 *  - **Con diều của đứa trẻ nào đó** bay trên tháp chuông — có người khác ở làng
 *    này, và ở phía đó có gì để xem.
 *  - **Khói bếp** bốc từ ống khói nhà mình — đi xa cỡ nào ngoảnh lại cũng biết
 *    đường về.
 */

export interface LandmarksOptions {
  hillTree: { x: number; z: number };
  /** Gốc dây của con diều xa (chân tháp chuông) */
  farKite: { x: number; z: number };
  /** Miệng ống khói — toạ độ thế giới */
  chimney: Vec3;
}

/** Số cụm khói và một vòng đời (giây) của mỗi cụm. */
const PUFFS = 7;
const PUFF_SECONDS = 5;

/**
 * Cụm khói thứ `index` lúc `elapsed`: bay lên, nở ra, lệch theo gió, mờ dần.
 * Thuần số — lớp vẽ chỉ chép kết quả vào mesh.
 */
export function smokePuff(
  index: number,
  elapsed: number,
  chimney: Vec3,
): { x: number; y: number; z: number; scale: number; opacity: number } {
  const age = (elapsed / PUFF_SECONDS + index / PUFFS) % 1;

  return {
    x: chimney.x + age * 2.2 + Math.sin(elapsed * 0.7 + index) * 0.15 * age,
    y: chimney.y + age * 4.5,
    z: chimney.z + age * 0.8,
    scale: 0.25 + age * 0.9,
    // Hiện dần lúc vừa ra khỏi ống khói, rồi tan.
    opacity: 0.42 * Math.min(1, age * 6) * (1 - age),
  };
}

export class Landmarks {
  readonly group = new THREE.Group();

  private readonly options: LandmarksOptions;

  private readonly puffs: THREE.Mesh<THREE.SphereGeometry, THREE.MeshStandardMaterial>[] = [];

  private readonly kite = createKiteModel();

  private readonly kiteLine: THREE.Line;

  private readonly anchor: THREE.Vector3;

  constructor(options: LandmarksOptions) {
    this.options = options;
    this.group.name = "landmarks";

    const tree = createTree({ scale: 2.3, seed: 2024, banyan: true });

    tree.position.set(options.hillTree.x, terrainHeight(options.hillTree.x, options.hillTree.z), options.hillTree.z);
    this.group.add(tree);

    const puffGeometry = new THREE.SphereGeometry(0.5, 8, 6);

    for (let index = 0; index < PUFFS; index += 1) {
      const puff = new THREE.Mesh(
        puffGeometry,
        new THREE.MeshStandardMaterial({ color: 0xece8e0, transparent: true, depthWrite: false, roughness: 1 }),
      );

      puff.castShadow = false;
      this.puffs.push(puff);
      this.group.add(puff);
    }

    this.anchor = new THREE.Vector3(
      options.farKite.x,
      terrainHeight(options.farKite.x, options.farKite.z) + 1,
      options.farKite.z,
    );
    this.kite.group.scale.setScalar(1.6);
    this.group.add(this.kite.group);

    this.kiteLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([this.anchor, this.anchor.clone()]),
      new THREE.LineBasicMaterial({ color: 0xf4efe6, transparent: true, opacity: 0.6 }),
    );
    this.kiteLine.frustumCulled = false;
    this.group.add(this.kiteLine);
  }

  update(elapsed: number) {
    this.puffs.forEach((puff, index) => {
      const at = smokePuff(index, elapsed, this.options.chimney);

      puff.position.set(at.x, at.y, at.z);
      puff.scale.setScalar(at.scale);
      puff.material.opacity = at.opacity;
    });

    // Con diều xa: lượn chữ số tám thong thả trên đầu tháp chuông.
    const kite = this.kite.group.position.set(
      this.anchor.x + Math.sin(elapsed * 0.31) * 3,
      this.anchor.y + 24 + Math.sin(elapsed * 0.62) * 1.5,
      this.anchor.z - 6 + Math.cos(elapsed * 0.31) * 1.2,
    );

    this.kite.group.rotation.set(-0.35, 0.6, Math.sin(elapsed * 0.9) * 0.25);

    const line = this.kiteLine.geometry.getAttribute("position");

    line.setXYZ(1, kite.x, kite.y, kite.z);
    line.needsUpdate = true;
  }
}
