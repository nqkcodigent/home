import * as THREE from "three";

/**
 * Gió hiện ra thành hình — vài vệt gió mảnh lướt qua con diều, CHỈ lúc giật.
 *
 * Không nằm trong `KiteField` (luật "trên trời chỉ có con diều" khoá bằng
 * test là về cột sáng và vật che tầm nhìn): đây là nét chì 1 px, trong suốt,
 * tắt hẳn khi gió lặng. Hình học dựng MỘT lần; mỗi frame chỉ ghi lại toạ độ
 * vào cùng một bộ đệm (luật L4).
 */

const STREAKS = 6;
const POINTS = 8;
/** Mỗi vệt dài bao nhiêu (m), và lướt nhanh bao nhiêu (m/s). */
const LENGTH = 3.2;
const SPEED = 7;
/** Quãng lướt trước khi vòng lại (m) — vệt sinh ra sau diều, tắt ở trước. */
const SPAN = 24;

const UP = new THREE.Vector3(0, 1, 0);

export class WindStreaks {
  readonly object: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;

  private readonly positions = new Float32Array(STREAKS * (POINTS - 1) * 2 * 3);

  private readonly across = new THREE.Vector3();

  constructor() {
    const geometry = new THREE.BufferGeometry();

    geometry.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));

    this.object = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.object.name = "wind-streaks";
    this.object.frustumCulled = false;
    this.object.visible = false;
  }

  /** `gust` 0…1 — độ mạnh cơn giật; `along` là hướng gió (đã chuẩn hoá). */
  update(center: THREE.Vector3, along: THREE.Vector3, gust: number, elapsed: number) {
    this.object.visible = gust > 0.02;
    this.object.material.opacity = gust * 0.5;

    if (!this.object.visible) return;

    this.across.crossVectors(UP, along).normalize();

    let cursor = 0;

    for (let streak = 0; streak < STREAKS; streak += 1) {
      const travel = ((elapsed * SPEED + streak * 5.3) % SPAN) - SPAN / 2;
      const lift = ((streak * 2.7) % 6) - 3;
      const side = ((streak * 3.1) % 8) - 4;

      for (let point = 0; point < POINTS - 1; point += 1) {
        for (const k of [point, point + 1]) {
          const ahead = travel + (k / (POINTS - 1)) * LENGTH;
          const wave = Math.sin(elapsed * 3 + k * 0.8 + streak) * 0.15;

          this.positions[cursor] = center.x + along.x * ahead + this.across.x * side;
          this.positions[cursor + 1] = center.y + lift + wave;
          this.positions[cursor + 2] = center.z + along.z * ahead + this.across.z * side;
          cursor += 3;
        }
      }
    }

    this.object.geometry.getAttribute("position").needsUpdate = true;
  }

  dispose() {
    this.object.removeFromParent();
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}
