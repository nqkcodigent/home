import * as THREE from "three";

/**
 * Giải phóng geometry + material của cả một nhánh scene.
 *
 * three.js không tự thu hồi tài nguyên GPU khi object bị bỏ khỏi scene; đổi
 * bối cảnh (phòng người lớn ↔ sân tuổi thơ) mà không gọi hàm này là rò rỉ
 * buffer mỗi lần chuyển cảnh.
 */
export function disposeObject(root: THREE.Object3D) {
  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Points)) {
      return;
    }

    child.geometry?.dispose();

    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];

    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }

      material.dispose();
    }
  });

  root.removeFromParent();
}
