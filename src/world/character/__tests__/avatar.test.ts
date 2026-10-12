import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { AVATAR_LOOKS, createAvatar } from "../avatar";

import type { AvatarVariant } from "../avatar";

const VARIANTS = Object.keys(AVATAR_LOOKS) as AvatarVariant[];

describe("createAvatar", () => {
  it("dựng được mọi biến thể, không ném lỗi và không rỗng", () => {
    for (const variant of VARIANTS) {
      const rig = createAvatar(variant);

      expect(rig.root.name).toBe(`avatar-${variant}`);
      expect(rig.root.children.length).toBeGreaterThanOrEqual(5);
      expect(rig.materials.length).toBeGreaterThan(8);
    }
  });

  it("mặt có hai mắt, mỗi mắt đủ tròng trắng + con ngươi + điểm sáng", () => {
    const rig = createAvatar("player");

    expect(rig.eyes).toHaveLength(2);

    for (const eye of rig.eyes) {
      // Ba lớp: tròng trắng, con ngươi, điểm sáng. Thiếu một lớp là mắt trở
      // lại thành chấm đen dán lên cầu da.
      expect(eye.children).toHaveLength(3);
    }

    // Đầu: cầu + 2 tai + 2 mắt + 2 lông mày + miệng + mũi + 2 má + tóc…
    expect(rig.head.children.length).toBeGreaterThanOrEqual(12);
  });

  it("có khớp khuỷu và khớp gối, mỗi khớp mang theo phần chi bên dưới", () => {
    const rig = createAvatar("player");

    expect(rig.elbowL.parent).toBe(rig.armL);
    expect(rig.elbowR.parent).toBe(rig.armR);

    expect(rig.kneeL.parent).toBe(rig.legL);
    expect(rig.kneeR.parent).toBe(rig.legR);

    // Cẳng tay + bàn tay nằm trong khuỷu; ống chân + guốc nằm trong gối.
    expect(rig.elbowL.children.length).toBeGreaterThanOrEqual(2);
    expect(rig.kneeL.children.length).toBeGreaterThanOrEqual(4);
  });

  it("quay khuỷu/gối thật sự đổi vị trí đầu chi — khớp nằm đúng chỗ", () => {
    const rig = createAvatar("player");

    rig.root.updateMatrixWorld(true);

    const handBefore = rig.elbowL.children[1].getWorldPosition(new THREE.Vector3());
    const footBefore = rig.kneeL.children[1].getWorldPosition(new THREE.Vector3());

    rig.elbowL.rotation.x = -0.8;
    rig.kneeL.rotation.x = 0.8;

    rig.root.updateMatrixWorld(true);

    const handAfter = rig.elbowL.children[1].getWorldPosition(new THREE.Vector3());
    const footAfter = rig.kneeL.children[1].getWorldPosition(new THREE.Vector3());

    expect(handBefore.distanceTo(handAfter)).toBeGreaterThan(0.05);
    expect(footBefore.distanceTo(footAfter)).toBeGreaterThan(0.05);
  });

  it("mọi vật liệu bắt đầu đục hoàn toàn — nhịp reveal mới là thứ làm mờ", () => {
    for (const variant of VARIANTS) {
      for (const material of createAvatar(variant).materials) {
        expect(material.transparent).toBe(false);
        expect(material.opacity).toBe(1);
        expect(material.depthWrite).toBe(true);
      }
    }
  });

  it("bốn kiểu tóc khác nhau được dùng hết — không có kiểu chết trong data", () => {
    const styles = new Set(
      VARIANTS.map((variant) => AVATAR_LOOKS[variant].hairStyle),
    );

    expect(styles.size).toBe(4);
  });

  it("nhân vật chính mặc áo len có khăn quàng; nhân vật phụ thì không", () => {
    expect(createAvatar("player").scarfTail).toBeInstanceOf(THREE.Group);
    expect(createAvatar("friend").scarfTail).toBeUndefined();
  });
});
