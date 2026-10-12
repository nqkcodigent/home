import * as THREE from "three";

import type { KiteState } from "./model";

/**
 * Diều giấy — phần NHÌN của minigame.
 *
 * Không có file model nào ở đây: một con diều là bốn điểm giấy căng trên hai
 * thanh tre, dựng thẳng bằng BufferGeometry thì nhẹ hơn cả việc nạp một file
 * .glb, và đổi màu giấy chỉ là đổi một tham số.
 *
 * Mô hình được tách thành `createKiteModel()` vì có HAI chỗ cần nó: ván diều
 * (con diều đang bay) và sân tuổi thơ (con diều nằm chờ trên cỏ, để người chơi
 * lại gần bấm tương tác). Hai chỗ phải là cùng một con diều — nếu không thì
 * "reset lại vị trí ban đầu" chỉ là một câu nói suông.
 *
 * Hai thứ đi kèm cũng nằm trong này vì chúng chỉ có nghĩa khi ở cạnh nhau:
 *
 *  - **Dây diều** — đường cong mỗi frame từ tay người chơi tới diều. Độ võng
 *    của dây là cách duy nhất để "thấy" lực căng mà không cần nhìn thanh HUD:
 *    dây căng thì gần như thẳng, dây chùng thì võng sâu. Đứt dây rồi thì dây
 *    biến mất — đó cũng là một cách nói.
 *  - **Đuôi diều** — chuỗi đốt nối tiếp nhau (mỗi đốt là con của đốt trước),
 *    nên nó vung như một sợi roi thay vì cứng đờ.
 *
 * Không có hiệu ứng nào khác trên trời: không cột sáng, không dấu vết khí
 * nóng. Bầu trời chỉ có con diều — camera bay theo nó thì tầm nhìn luôn trong.
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

/** Bao nhiêu phần quãng đường trôi thành khoảng cách xa thêm theo hướng bay. */
const KITE_ESCAPE_SCALE = 0.35;

/** Số đốt của đuôi và số điểm của dây. */
const TAIL_SEGMENTS = 9;
const STRING_POINTS = 16;

/** Nửa chiều cao cánh diều (mét) — nửa trên và nửa dưới tính từ tâm giấy. */
const KITE_SHOULDER = 1.25;

/** Đuôi: đốt đầu dài hơn một chút, các đốt sau đều nhau (mét). */
const TAIL_FIRST_LINK = 0.18;
const TAIL_LINK = 0.24;

/**
 * Chiều cao CẢ cánh diều lẫn đuôi (mét) — từ đỉnh giấy xuống tận đuôi.
 *
 * Xuất ra ngoài vì đây không chỉ là chuyện hình khối: chọn tầm ống kính cho
 * góc toàn cảnh cần biết con diều chiếm bao nhiêu phần khung hình, mà muốn
 * biết thì phải biết nó cao bao nhiêu mét. Một hằng số, hai chỗ dùng.
 */
export const KITE_HEIGHT =
  KITE_SHOULDER * 1.35 + KITE_SHOULDER + TAIL_FIRST_LINK + TAIL_SEGMENTS * TAIL_LINK;

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

  // Đứt dây rồi thì diều không còn bị sợi dây giữ trên một vành cung nữa: nó
  // trôi ngang (`lateral`) và xa dần THEO HƯỚNG BAY (`drift`). Thiếu số hạng
  // thứ hai thì con diều trôi ngang mãi trên một đường tròn, trông như đang
  // bị buộc vào một sợi dây vô hình.
  const escaped = state.phase === "adrift" ? state.drift * KITE_ESCAPE_SCALE : 0;

  const depth = KITE_MIN_DEPTH + horizontal * KITE_DEPTH_SCALE + escaped;

  out
    .copy(frame.origin)
    .addScaledVector(frame.forward, depth)
    .addScaledVector(frame.right, state.lateral);

  out.y = frame.origin.y + state.altitude;

  return out;
}

/** Một con diều giấy, dựng bằng hình khối, kèm cách giải phóng tài nguyên. */
export interface KiteModel {
  readonly group: THREE.Group;
  /** Các đốt đuôi, từ gốc tới ngọn — cho hiệu ứng vung theo gió. */
  readonly tail: readonly THREE.Group[];
  dispose(): void;
}

/**
 * Dựng một con diều: giấy, hai thanh tre, sáo, và đuôi nhiều đốt.
 *
 * Trả về cả danh sách đốt đuôi để bên gọi vung nó theo gió, và `dispose()` để
 * bên gọi trả tài nguyên GPU — mỗi con diều có geometry riêng của nó.
 */
export function createKiteModel(): KiteModel {
  const group = new THREE.Group();

  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const tail: THREE.Group[] = [];

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

  materials.push(sail, trim, bamboo, tailPaper);

  const height = KITE_SHOULDER;
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

  geometries.push(sailGeometry);

  group.add(new THREE.Mesh(sailGeometry, sail));

  // Viền giấy: một khung mảnh chạy quanh mép, chỉ để mắt bám được vào hình.
  const outlineGeometry = new THREE.BufferGeometry();

  outlineGeometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [...top, ...left, ...bottom, ...right, ...top].flat(),
      3,
    ),
  );

  geometries.push(outlineGeometry);

  const outlineMaterial = new THREE.LineBasicMaterial({ color: PAPER_TRIM });

  materials.push(outlineMaterial);

  group.add(new THREE.Line(outlineGeometry, outlineMaterial));

  // Hai thanh tre: sống dọc và thanh ngang, hơi lệch ra sau mặt giấy.
  const spine = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, height * 2.35, 0.045),
    bamboo,
  );

  spine.position.set(0, -height * 0.18, -0.12);
  group.add(spine);
  geometries.push(spine.geometry);

  const crossbar = new THREE.Mesh(
    new THREE.BoxGeometry(width * 2.1, 0.04, 0.04),
    bamboo,
  );

  crossbar.position.set(0, -height * 0.1, -0.16);
  group.add(crossbar);
  geometries.push(crossbar.geometry);

  // Sáo diều: một ống tre nhỏ gắn vào sống — chi tiết nhỏ mà ai lớn lên ở
  // quê cũng nhận ra ngay.
  const whistle = new THREE.Mesh(
    new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8),
    bamboo,
  );

  whistle.position.set(0.12, height * 0.55, -0.1);
  whistle.rotation.z = 0.4;
  group.add(whistle);
  geometries.push(whistle.geometry);

  // Đuôi: chuỗi đốt lồng nhau, gốc ở đáy cánh diều.
  const tailRoot = new THREE.Group();

  tailRoot.position.set(0, -height * 1.35, 0);
  group.add(tailRoot);

  let parent: THREE.Object3D = tailRoot;

  for (let index = 0; index < TAIL_SEGMENTS; index += 1) {
    const segment = new THREE.Group();

    segment.position.y = index === 0 ? -TAIL_FIRST_LINK : -TAIL_LINK;

    const ribbon = new THREE.Mesh(
      new THREE.BoxGeometry(0.16 - index * 0.008, 0.1, 0.012),
      index % 3 === 0 ? trim : tailPaper,
    );

    ribbon.position.y = -0.06;
    segment.add(ribbon);
    geometries.push(ribbon.geometry);

    parent.add(segment);
    parent = segment;
    tail.push(segment);
  }

  group.traverse((child) => {
    child.frustumCulled = false;
  });

  return {
    group,
    tail,
    dispose() {
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();

      group.removeFromParent();
    },
  };
}

export class KiteField {
  readonly group = new THREE.Group();

  private readonly model = createKiteModel();

  private readonly stringLine: THREE.Line;

  private readonly stringPositions: Float32Array;

  private readonly builtMaterials: THREE.Material[] = [];

  private readonly builtGeometries: THREE.BufferGeometry[] = [];

  private readonly scratch = new THREE.Vector3();

  private readonly scratchFrom = new THREE.Vector3();

  private readonly scratchTo = new THREE.Vector3();

  constructor() {
    this.group.name = "kite-field";

    this.group.add(this.model.group);

    // Dây diều: một đường gấp khúc nhiều điểm, cập nhật vị trí mỗi frame.
    this.stringPositions = new Float32Array(STRING_POINTS * 3);

    const stringGeometry = new THREE.BufferGeometry();

    stringGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.stringPositions, 3),
    );

    this.builtGeometries.push(stringGeometry);

    const stringMaterial = new THREE.LineBasicMaterial({
      color: 0xfffaf0,
      transparent: true,
      opacity: 0.9,
    });

    this.builtMaterials.push(stringMaterial);

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
    const group = this.model.group;

    group.position.copy(position);

    group.rotation.order = "YXZ";
    group.rotation.y = Math.atan2(
      towardPlayer.x - position.x,
      towardPlayer.z - position.z,
    );
    group.rotation.x = -(0.18 + wind * 0.45);
    group.rotation.z = Math.sin(elapsed * 0.9) * 0.08 * (0.4 + wind);

    this.model.tail.forEach((segment, index) => {
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
   * `tension` âm (dây đã đứt) thì dây biến mất hẳn.
   */
  stretchString(from: THREE.Vector3, to: THREE.Vector3, tension: number): void {
    if (tension < 0) {
      this.stringLine.visible = false;

      return;
    }

    this.stringLine.visible = true;

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

  dispose(): void {
    this.model.dispose();

    for (const geometry of this.builtGeometries) geometry.dispose();
    for (const material of this.builtMaterials) material.dispose();

    this.group.removeFromParent();
  }
}
