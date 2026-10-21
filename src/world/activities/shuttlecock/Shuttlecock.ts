import * as THREE from "three";

/**
 * Chiếc cầu (cầu gà) — hình khối cơ bản, đúng thứ người Việt vẫn đá từ bé:
 * cái đế cao su tròn ở dưới, bông lông xòe ra phía trên.
 *
 * Không tải model ngoài: tám chiếc lông là tám khối mỏng xoay quanh một gốc,
 * và cả quả cầu chỉ là vài chục tam giác — nhẹ hơn bất kỳ file .glb nào, và
 * vẫn nhìn ra ngay đây là cái gì.
 */

const SKIRT_COUNT = 8;

export interface ShuttlecockModel {
  group: THREE.Group;
  /** Cao độ mặt sân mà đế cầu đặt lên (mét) — mô hình không biết thế giới */
  baseY: number;
  /**
   * Cập nhật theo trạng thái bay: vị trí, độ xoay và độ nghiêng theo vận
   * tốc. `spinRate` là số vòng/giây.
   */
  place: (x: number, y: number, z: number, leanX: number, leanZ: number, spin: number) => void;
  dispose: () => void;
}

export function createShuttlecock(): ShuttlecockModel {
  const group = new THREE.Group();

  group.name = "shuttlecock";

  const cork = new THREE.MeshStandardMaterial({ color: 0xe8d9b0, roughness: 0.8 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0x8a4b3a, roughness: 0.7 });
  const feather = new THREE.MeshStandardMaterial({
    color: 0xfbf6e8,
    roughness: 0.9,
    flatShading: true,
  });

  // Đế nút: hai lớp — nút bần tròn dưới, vành cao su đỏ ôm trên.
  const baseY = 0.05;

  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.062, 12, 8), cork);

  knob.scale.y = 0.8;
  knob.position.y = baseY;
  knob.castShadow = true;

  group.add(knob);

  const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.062, 0.03, 12), rubber);

  ring.position.y = baseY + 0.045;
  ring.castShadow = true;

  group.add(ring);

  // Tám chiếc lông xòe ra như cái phễu — gắn vào một nhóm xoay chung, nên
  // toàn bộ cầu chỉ cần một phép xoay `rotation.y` mỗi frame.
  const skirt = new THREE.Group();

  skirt.position.y = baseY + 0.06;

  const length = 0.24;

  for (let index = 0; index < SKIRT_COUNT; index += 1) {
    const angle = (index / SKIRT_COUNT) * Math.PI * 2;

    const featherGroup = new THREE.Group();

    featherGroup.rotation.y = angle;

    const plume = new THREE.Mesh(new THREE.BoxGeometry(0.045, length, 0.014), feather);

    plume.position.set(0.05, length / 2 + 0.02, 0);
    // Xòe ra khoảng 20° — chụm quá thì giống bút chì, xòe quá thì giống bông.
    plume.rotation.z = -0.36;
    plume.castShadow = true;

    featherGroup.add(plume);
    skirt.add(featherGroup);
  }

  group.add(skirt);

  let spinAngle = 0;

  return {
    group,
    baseY,
    place(x, y, z, leanX, leanZ, spin) {
      spinAngle += spin;

      group.position.set(x, y + baseY, z);
      group.rotation.set(leanX, spinAngle, leanZ);
    },
    dispose() {
      group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          child.material.dispose();
        }
      });
    },
  };
}
