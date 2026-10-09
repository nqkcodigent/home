import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { CameraRig } from "../CameraRig";
import { Tweens } from "../Tween";

const NO_LOOK = { x: 0, y: 0, zoom: 0 };

function setup() {
  const camera = new THREE.PerspectiveCamera(46, 1);
  const tweens = new Tweens();
  const rig = new CameraRig(camera, tweens);

  rig.setTarget(0, 0, 0);
  rig.lookAt(0, 0, 0);

  return { camera, tweens, rig };
}

/** Chạy N khung hình, cập nhật cả bộ hiệu ứng như WorldGame vẫn làm. */
function run(
  harness: ReturnType<typeof setup>,
  seconds: number,
) {
  const steps = Math.round(seconds * 60);

  for (let index = 0; index < steps; index += 1) {
    harness.tweens.update(1 / 60);
    harness.rig.update(1 / 60, NO_LOOK, index / 60);
  }
}

describe("CameraRig", () => {
  it("camera luôn cách tâm ngắm đúng bằng khoảng cách đặt trước", () => {
    const harness = setup();

    run(harness, 1);

    // Tâm ngắm = vị trí nhân vật + độ cao 0.95 m (mặc định của rig).
    const aim = new THREE.Vector3(0, 0.95, 0);

    expect(harness.camera.position.distanceTo(aim)).toBeCloseTo(
      harness.rig.distanceToTarget,
      1,
    );

    // Đứng ở phía -Z (yaw mặc định π) và nhìn về gốc toạ độ.
    expect(harness.camera.position.z).toBeLessThan(0);
  });

  it("dollyTo() chạy xong nhờ bộ Tweens dùng chung", async () => {
    const harness = setup();
    const before = harness.rig.distanceToTarget;

    const done = harness.rig.dollyTo(1.35, 0.5);

    run(harness, 0.6);

    await done;

    // level 1.35 nghĩa là lại gần hơn: khoảng cách nhỏ hơn ban đầu.
    expect(harness.rig.distanceToTarget).toBeLessThan(before);
    expect(harness.rig.distanceToTarget).toBeCloseTo(before / 1.35, 2);
  });

  it("panTo() kéo tâm ngắm lệch khỏi nhân vật rồi trả về được", async () => {
    const harness = setup();

    const done = harness.rig.panTo({ x: 20, y: 0, z: 0 }, 0.4);

    run(harness, 0.5);

    await done;

    expect(harness.rig.loadPan().x).toBeGreaterThan(1);

    harness.rig.resetPan();

    expect(harness.rig.loadPan().x).toBe(0);
  });

  it("zoom quá xa hay quá gần đều bị kẹp trong khoảng an toàn", async () => {
    const harness = setup();

    const far = harness.rig.dollyTo(0.05, 0.4);

    run(harness, 0.5);

    await far;

    expect(harness.rig.distanceToTarget).toBeLessThanOrEqual(12);

    const near = harness.rig.dollyTo(50, 0.4);

    run(harness, 0.5);

    await near;

    expect(harness.rig.distanceToTarget).toBeGreaterThanOrEqual(2.2 - 1e-9);
  });

  it("kéo chuột xoay được camera, và camera không chui xuống đất", () => {
    const harness = setup();

    run(harness, 0.5);

    const before = harness.rig.yawAngle;

    harness.tweens.update(1 / 60);
    harness.rig.update(1 / 60, { x: 120, y: 0, zoom: 0 }, 1);

    expect(harness.rig.yawAngle).not.toBe(before);
    expect(harness.camera.position.y).toBeGreaterThan(0);
  });

  it("applyPreset() đổi cỡ camera của bối cảnh mới", () => {
    const harness = setup();

    harness.rig.applyPreset({ distance: 4, height: 1, pitch: 0.2, yaw: 0 });

    expect(harness.rig.distanceToTarget).toBe(4);
    expect(harness.rig.yawAngle).toBe(0);
  });
});
