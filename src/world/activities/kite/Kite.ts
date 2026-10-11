import * as THREE from "three";

import type { KiteState, Thermal } from "./model";

/**
 * Diều giấy — phần NHÌN của minigame.
 *
 * Không có file model nào ở đây: một con diều là bốn điểm giấy căng trên hai
 * thanh tre, dựng thẳng bằng BufferGeometry thì nhẹ hơn cả việc nạp một file
 * .glb, và đổi màu giấy chỉ là đổi một tham số.
 *
 * Ba thứ đi kèm cũng nằm trong này vì chúng chỉ có nghĩa khi ở cạnh nhau:
 *
 *  - **Dây diều** — đường cong mỗi frame từ tay người chơi tới diều. Độ võng
 *    của dây là cách duy nhất để "thấy" lực căng mà không cần nhìn thanh HUD:
 *    dây căng thì gần như thẳng, dây chùng thì võng sâu.
 *  - **Đuôi diều** — chuỗi đốt nối tiếp nhau (mỗi đốt là con của đốt trước),
 *    nên nó vung như một sợi roi thay vì cứng đờ.
 *  - **Cột khí nóng** — trụ sáng mờ, thở nhè nhẹ. Người chơi phải thấy được
 *    mình đang bay vào đâu, nếu không thì "tìm nhiệt lưu" chỉ là đoán mò.
 */

export interface SkyFrame {
  /** Gốc — chân người chơi, trên mặt đất */
  origin: THREE.Vector3;
  /** Hướng diều bay ra (đã chuẩn hoá, nằm ngang) */
  forward: THREE.Vector3;
  /** Trục ngang của vùng trời (vuông góc với forward) */
  right: THREE.Vector3;
}

/** Khoảng cách ngang nhỏ nhất / hệ số giãn theo độ dài dây. */
const KITE_MIN_DEPTH = 18;
const KITE_DEPTH_SCALE = 0.3;

/** Vùng trời nằm cách người chơi bao xa (nơi dựng các cột khí nóng). */
const THERMAL_DEPTH = 26;

/** Số đốt của đuôi và số điểm của dây. */
const TAIL_SEGMENTS = 9;
const STRING_POINTS = 16;

const PAPER = 0xf2635a;
const PAPER_TRIM = 0xffd45f;
const BAMBOO = 0xb98a4b;
const TAIL_PAPER = 0xfff0c9;

/**
 * Vị trí con diều trong thế giới, suy từ trạng thái mô phỏng.
 *
 * Hàm thuần (không đụng tới scene) nên test được bằng số: đây là chỗ duy nhất
 * chuyển "độ cao 42 m, lạng -3 m" thành toạ độ ba chiều.
 *
 * Dây dài L, diều cao H thì khoảng cách ngang là √(L² − H²) — đúng hình học của
 * một sợi dây căng. Trần độ cao trong mô phỏng bằng `0,95·L`, nên biểu thức
 * dưới căn luôn dương; vẫn kẹp lại cho chắc.
 */
export function kiteWorldPosition(
  frame: SkyFrame,
  state: KiteState,
  out: THREE.Vector3 = new THREE.Vector3(),
): THREE.Vector3 {
  const horizontal = Math.sqrt(
    Math.max(0, state.lineLength * state.lineLength - state.altitude * state.altitude),
  );

  const depth = KITE_MIN_DEPTH + horizontal * KITE_DEPTH_SCALE;

  out
    .copy(frame.origin)
    .addScaledVector(frame.forward, depth)
    .addScaledVector(frame.right, state.lateral);

  out.y = frame.origin.y + state.altitude;

  return out;
}

export class KiteField {
  readonly group = new THREE.Group();

  private readonly kite = new THREE.Group();

  private readonly tail: THREE.Group[] = [];

  private readonly stringLine: THREE.Line;

  private readonly stringPositions: Float32Array;

  private readonly columns: THREE.Mesh[] = [];

  private readonly columnMaterial: THREE.MeshBasicMaterial;

  private readonly geometries: THREE.BufferGeometry[] = [];

  private readonly materials: THREE.Material[] = [];

  private readonly scratch = new THREE.Vector3();

  private readonly scratchFrom = new THREE.Vector3();

  private readonly scratchTo = new THREE.Vector3();

  constructor() {
    this.group.name = "kite-field";

    this.group.add(this.buildKite());

    this.columnMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff2c0,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });

    this.materials.push(this.columnMaterial);

    const columnGeometry = new THREE.CylinderGeometry(1, 0.62, 1, 16, 1, true);

    this.geometries.push(columnGeometry);

    for (let index = 0; index < 4; index += 1) {
      const column = new THREE.Mesh(columnGeometry, this.columnMaterial);

      column.visible = false;
      this.columns.push(column);
      this.group.add(column);
    }

    // Dây diều: một đường gấp khúc nhiều điểm, cập nhật vị trí mỗi frame.
    this.stringPositions = new Float32Array(STRING_POINTS * 3);

    const stringGeometry = new THREE.BufferGeometry();

    stringGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.stringPositions, 3),
    );

    this.geometries.push(stringGeometry);

    const stringMaterial = new THREE.LineBasicMaterial({
      color: 0xfffaf0,
      transparent: true,
      opacity: 0.9,
    });

    this.materials.push(stringMaterial);

    this.stringLine = new THREE.Line(stringGeometry, stringMaterial);

    this.stringLine.frustumCulled = false;

    this.group.add(this.stringLine);
  }

  /**
   * Đặt diều vào đúng chỗ, quay mặt về phía người chơi và nghiêng theo gió.
   *
   * Diều nghiêng về phía xa khi gió mạnh (nó "nằm" trên luồng gió), và đuôi
   * vung theo cùng một cơn gió đó.
   */
  placeKite(
    position: THREE.Vector3,
    towardPlayer: THREE.Vector3,
    wind: number,
    elapsed: number,
  ): void {
    this.kite.position.copy(position);

    this.kite.rotation.order = "YXZ";
    this.kite.rotation.y = Math.atan2(
      towardPlayer.x - position.x,
      towardPlayer.z - position.z,
    );
    this.kite.rotation.x = -(0.18 + wind * 0.45);
    this.kite.rotation.z = Math.sin(elapsed * 0.9) * 0.08 * (0.4 + wind);

    this.tail.forEach((segment, index) => {
      segment.rotation.x =
        0.22 + wind * 0.55 + Math.sin(elapsed * 5.4 + index * 0.55) * 0.14;
      segment.rotation.z =
        Math.sin(elapsed * 3.6 + index * 0.8) * 0.2 * (0.35 + wind);
    });
  }

  /**
   * Căng dây từ tay người chơi tới diều.
   *
   * `tension` (0…1) quyết định độ võng: dây căng thì gần như thẳng — đó là
   * phản hồi thị giác cho thanh lực căng trên HUD, và nó đọc nhanh hơn số.
   */
  stretchString(from: THREE.Vector3, to: THREE.Vector3, tension: number): void {
    const sag = (1 - Math.min(1, Math.max(0, tension))) * 0.09;

    this.scratchFrom.copy(from);
    this.scratchTo.copy(to);

    // Điểm điều khiển của đường cong bậc hai: trung điểm hai đầu, hạ xuống
    // theo độ võng. Võng tính theo mét dây nên dây dài võng sâu hơn dây ngắn.
    const distance = this.scratchFrom.distanceTo(this.scratchTo);

    const control = this.scratch.set(
      (this.scratchFrom.x + this.scratchTo.x) / 2,
      (this.scratchFrom.y + this.scratchTo.y) / 2 - sag * distance,
      (this.scratchFrom.z + this.scratchTo.z) / 2,
    );

    for (let index = 0; index < STRING_POINTS; index += 1) {
      const t = index / (STRING_POINTS - 1);
      const inverse = 1 - t;

      const x =
        inverse * inverse * this.scratchFrom.x +
        2 * inverse * t * control.x +
        t * t * this.scratchTo.x;
      const y =
        inverse * inverse * this.scratchFrom.y +
        2 * inverse * t * control.y +
        t * t * this.scratchTo.y;
      const z =
        inverse * inverse * this.scratchFrom.z +
        2 * inverse * t * control.z +
        t * t * this.scratchTo.z;

      this.stringPositions[index * 3] = x;
      this.stringPositions[index * 3 + 1] = y;
      this.stringPositions[index * 3 + 2] = z;
    }

    const attribute = this.stringLine.geometry.getAttribute("position");

    attribute.needsUpdate = true;
    this.stringLine.geometry.computeBoundingSphere();
  }

  /** Dựng (hoặc ẩn) các cột khí nóng đang sống trong vùng trời. */
  placeThermals(frame: SkyFrame, thermals: Thermal[], elapsed: number): void {
    this.columns.forEach((column, index) => {
      const thermal = thermals[index];

      if (!thermal) {
        column.visible = false;

        return;
      }

      const height = 34 + thermal.strength * 22;

      column.visible = true;
      column.position
        .copy(frame.origin)
        .addScaledVector(frame.forward, THERMAL_DEPTH)
        .addScaledVector(frame.right, thermal.x);

      column.position.y = frame.origin.y + height / 2;
      column.scale.set(thermal.radius, height, thermal.radius);

      // Thở nhè nhẹ: cột khí nóng không phải một cái ống nhựa.
      const pulse = 0.75 + Math.sin(elapsed * 1.7 + index) * 0.25;

      column.rotation.y = elapsed * 0.12 + index;
      column.scale.x *= pulse;
      column.scale.z *= pulse;

      column.renderOrder = 2;
    });
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();

    for (const material of this.materials) material.dispose();

    this.group.removeFromParent();
  }

  // ── Dựng hình ────────────────────────────────────────────────────────────

  private buildKite(): THREE.Group {
    const sail = new THREE.MeshStandardMaterial({
      color: PAPER,
      roughness: 0.62,
      metalness: 0,
      side: THREE.DoubleSide,
    });

    const trim = new THREE.MeshStandardMaterial({
      color: PAPER_TRIM,
      roughness: 0.7,
      metalness: 0,
      side: THREE.DoubleSide,
    });

    const bamboo = new THREE.MeshStandardMaterial({
      color: BAMBOO,
      roughness: 0.85,
      metalness: 0,
    });

    const tailPaper = new THREE.MeshStandardMaterial({
      color: TAIL_PAPER,
      roughness: 0.75,
      metalness: 0,
      side: THREE.DoubleSide,
    });

    this.materials.push(sail, trim, bamboo, tailPaper);

    const height = 1.25;
    const width = 0.95;

    // Cánh diều: bốn điểm giấy (đỉnh, hai cánh, đuôi) cộng một điểm giữa đẩy
    // ra sau — nhờ điểm giữa mà mặt giấy cong lên thành cái chảo, đúng dáng
    // diều giấy thật chứ không phải một tấm bìa phẳng.
    const top = [0, height, 0];
    const bottom = [0, -height * 1.35, 0];
    const left = [-width, -height * 0.1, 0];
    const right = [width, -height * 0.1, 0];
    const belly = [0, -height * 0.15, -0.28];

    const triangles = [
      top, left, belly,
      left, bottom, belly,
      bottom, right, belly,
      right, top, belly,
    ];

    const sailGeometry = new THREE.BufferGeometry();

    sailGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(triangles.flat(), 3),
    );
    sailGeometry.computeVertexNormals();

    this.geometries.push(sailGeometry);

    this.kite.add(new THREE.Mesh(sailGeometry, sail));

    // Viền giấy: một khung mảnh chạy quanh mép, chỉ để mắt bám được vào hình.
    const outlineGeometry = new THREE.BufferGeometry();

    outlineGeometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(
        [...top, ...left, ...bottom, ...right, ...top].flat(),
        3,
      ),
    );

    this.geometries.push(outlineGeometry);

    const outlineMaterial = new THREE.LineBasicMaterial({ color: PAPER_TRIM });

    this.materials.push(outlineMaterial);

    this.kite.add(new THREE.Line(outlineGeometry, outlineMaterial));

    // Hai thanh tre: sống dọc và thanh ngang, hơi lệch ra sau mặt giấy.
    const spine = new THREE.Mesh(
      new THREE.BoxGeometry(0.045, height * 2.35, 0.045),
      bamboo,
    );

    spine.position.set(0, -height * 0.18, -0.12);
    this.kite.add(spine);
    this.geometries.push(spine.geometry);

    const crossbar = new THREE.Mesh(
      new THREE.BoxGeometry(width * 2.1, 0.04, 0.04),
      bamboo,
    );

    crossbar.position.set(0, -height * 0.1, -0.16);
    this.kite.add(crossbar);
    this.geometries.push(crossbar.geometry);

    // Sáo diều: một ống tre nhỏ gắn vào sống — chi tiết nhỏ mà ai lớn lên ở
    // quê cũng nhận ra ngay.
    const whistle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8),
      bamboo,
    );

    whistle.position.set(0.12, height * 0.55, -0.1);
    whistle.rotation.z = 0.4;
    this.kite.add(whistle);
    this.geometries.push(whistle.geometry);

    // Đuôi: chuỗi đốt lồng nhau, gốc ở đáy cánh diều.
    const tailRoot = new THREE.Group();

    tailRoot.position.set(0, -height * 1.35, 0);
    this.kite.add(tailRoot);

    let parent: THREE.Object3D = tailRoot;

    for (let index = 0; index < TAIL_SEGMENTS; index += 1) {
      const segment = new THREE.Group();

      segment.position.y = index === 0 ? -0.18 : -0.24;

      const ribbon = new THREE.Mesh(
        new THREE.BoxGeometry(0.16 - index * 0.008, 0.1, 0.012),
        index % 3 === 0 ? trim : tailPaper,
      );

      ribbon.position.y = -0.06;
      segment.add(ribbon);
      this.geometries.push(ribbon.geometry);

      parent.add(segment);
      parent = segment;
      this.tail.push(segment);
    }

    this.kite.traverse((child) => {
      child.frustumCulled = false;
    });

    return this.kite;
  }
}
