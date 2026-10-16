import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { CameraRig, MIN_BOOM, boomClearance } from "../CameraRig";
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

describe("CameraRig — góc máy tự do", () => {
  function shot(fov = 58, shake = 0) {
    return {
      position: new THREE.Vector3(-20, 3, 0),
      look: new THREE.Vector3(10, 30, 0),
      fov,
      shake,
    };
  }

  it("bay tới vị trí chỉ định, ngắm đúng điểm và nới ống kính", () => {
    const harness = setup();

    harness.rig.setShot(shot());
    run(harness, 3);

    const { camera } = harness;

    expect(camera.position.distanceTo(new THREE.Vector3(-20, 3, 0))).toBeLessThan(0.1);
    expect(camera.fov).toBeCloseTo(58, 1);

    // Camera nhìn LÊN điểm ngắm trên trời.
    const forward = new THREE.Vector3();

    camera.getWorldDirection(forward);

    expect(forward.y).toBeGreaterThan(0.5);
  });

  it("rung lệch hướng nhìn nhưng không đẩy camera khỏi vị trí", () => {
    const calm = setup();
    const shaky = setup();

    calm.rig.setShot(shot(58, 0));
    shaky.rig.setShot(shot(58, 1));
    run(calm, 2.1);
    run(shaky, 2.1);

    expect(shaky.camera.position.distanceTo(calm.camera.position)).toBeLessThan(1e-6);
    expect(shaky.camera.quaternion.angleTo(calm.camera.quaternion)).toBeGreaterThan(0.001);
  });

  it("nhả góc máy thì trả lại khoảng cách và ống kính cũ", () => {
    const harness = setup();

    harness.rig.setShot(shot());
    run(harness, 2);

    const wide = harness.camera.fov;

    harness.rig.setShot(undefined);
    run(harness, 4);

    expect(harness.camera.fov).toBeLessThan(wide);
    expect(harness.camera.fov).toBeCloseTo(46, 1);
    expect(harness.camera.position.length()).toBeLessThan(12);
  });

  it("thu diều: camera bay về sau lưng nhân vật êm, không bổ nhào trong nửa giây", () => {
    const harness = setup();

    // Camera đang ở tít trên trời theo con diều.
    harness.rig.setShot({
      position: new THREE.Vector3(30, 40, 30),
      look: new THREE.Vector3(30, 38, 40),
      fov: 62,
      shake: 0,
    });
    run(harness, 3);

    harness.rig.setShot(undefined);

    const start = harness.camera.position.clone();

    run(harness, 0.25);

    const travelled = harness.camera.position.distanceTo(start);
    const total = start.length();

    // Sau một phần tư giây mới đi được một phần quãng đường — đang BAY về…
    expect(travelled).toBeGreaterThan(total * 0.15);
    expect(travelled).toBeLessThan(total * 0.6);

    // …và vài giây sau thì đã về hẳn góc nhìn thứ ba.
    run(harness, 4);

    expect(harness.camera.position.length()).toBeLessThan(12);
  });

  it("thả diều: di chuột là bay vòng QUANH điểm ngắm, khoảng cách giữ nguyên", () => {
    const harness = setup();
    const target = new THREE.Vector3(10, 30, 0);

    harness.rig.setShot({ position: new THREE.Vector3(-10, 34, 0), look: target, fov: 60, shake: 0 });
    run(harness, 4);

    const before = harness.camera.position.clone();
    const radius = before.distanceTo(target);

    // Một cú lướt chuột ngang: 300 px.
    harness.rig.update(1 / 60, { x: 300, y: 0, zoom: 0 }, 5);

    const after = harness.camera.position.clone();

    expect(after.distanceTo(before)).toBeGreaterThan(3);
    expect(after.distanceTo(target)).toBeCloseTo(radius, 1);

    // Lăn chuột: lại gần con diều.
    harness.rig.update(1 / 60, { x: 0, y: 0, zoom: -1.4 }, 5.1);

    expect(harness.camera.position.distanceTo(target)).toBeLessThan(radius * 0.8);
  });

  it("ngồi ngắm cảnh: chuột chỉ ngoảnh đầu — camera đứng yên, góc ngoảnh có giới hạn", () => {
    const harness = setup();

    harness.rig.setShot({
      position: new THREE.Vector3(0, 1.5, 0),
      look: new THREE.Vector3(0, 1.5, 10),
      fov: 52,
      shake: 0,
      pivot: "camera",
    });
    run(harness, 4);

    const seat = harness.camera.position.clone();

    // Lướt chuột thật xa: ngoảnh hết cỡ chứ không quay ra sau lưng.
    harness.rig.update(1 / 60, { x: 5000, y: 0, zoom: 0 }, 5);

    expect(harness.camera.position.distanceTo(seat)).toBeLessThan(0.05);

    const direction = new THREE.Vector3();

    harness.camera.getWorldDirection(direction);

    // Lệch khỏi hướng nhìn gốc (+Z) đúng bằng giới hạn ~1,3 rad, chưa quay ra sau.
    expect(direction.z).toBeGreaterThan(0.2);
    expect(direction.z).toBeLessThan(0.4);
  });

  it("trả lại góc thứ ba thì quên độ lệch chuột — lần sau vào lại nhìn thẳng", () => {
    const harness = setup();
    const shot = () => ({
      position: new THREE.Vector3(-10, 34, 0),
      look: new THREE.Vector3(10, 30, 0),
      fov: 60,
      shake: 0,
    });

    harness.rig.setShot(shot());
    run(harness, 3);
    harness.rig.update(1 / 60, { x: 400, y: 0, zoom: 0 }, 4);

    harness.rig.setShot(undefined);
    run(harness, 3);

    harness.rig.setShot(shot());
    run(harness, 6);

    expect(harness.camera.position.distanceTo(new THREE.Vector3(-10, 34, 0))).toBeLessThan(0.2);
  });
});

describe("CameraRig — cần gạt không bay xuyên vật cản", () => {
  it("boomClearance(): tường dạng đoạn cắt cần gạt trước mặt tường", () => {
    const wall = [{ x: 3, z: -5, toX: 3, toZ: 5, radius: 0.2 }];

    // Mặt tường + lề ở 3 − 0,2 − 0,45 = 2,35 m; lấy mẫu 1/48 nên sai < 0,1 m.
    const reach = boomClearance(0, 0, 4, 0, wall) * 4;

    expect(reach).toBeLessThanOrEqual(2.35);
    expect(reach).toBeGreaterThan(2.25);
    expect(boomClearance(0, 0, -4, 0, wall)).toBe(1);
  });

  it("boomClearance(): cắt đúng chỗ chạm vật cản đầu tiên", () => {
    const wall = [{ x: 3, z: 0, radius: 1 }];

    // Chạm ở 3 − 1 − 0,45 = 1,55 m, trên tầm với 4 m.
    expect(boomClearance(0, 0, 4, 0, wall) * 4).toBeCloseTo(1.55, 5);

    // Quay đi hướng khác, hoặc vật cản ở ngoài tầm với: không phải cắt gì.
    expect(boomClearance(0, 0, -4, 0, wall)).toBe(1);
    expect(boomClearance(0, 0, 1, 0, wall)).toBe(1);
    expect(boomClearance(0, 0, 4, 0, [])).toBe(1);

    // Vật cản ngay sát tâm ngắm (nhân vật đứng ép sát tường): dừng ở SÀN, chứ
    // không co về 0 — thà camera chạm tường còn hơn nằm trong đầu nhân vật.
    expect(boomClearance(0, 0, 4, 0, [{ x: 0.1, z: 0, radius: 1 }])).toBe(MIN_BOOM);
  });

  it("cần gạt co lại khi chọc vào nhà, và nhả ra khi quay đi chỗ khác", () => {
    const harness = setup();

    // Một vật cản to bằng cái nhà trong sân, cách nhân vật 6 m về phía +X.
    harness.rig.setColliders([{ x: 6, z: 0, radius: 1 }]);
    harness.rig.setYaw(Math.PI / 2);

    run(harness, 1);

    const blocked = harness.camera.position;

    expect(blocked.x).toBeLessThan(6);
    expect(Math.hypot(blocked.x - 6, blocked.z)).toBeGreaterThanOrEqual(1);

    harness.rig.setColliders([]);
    run(harness, 3);

    expect(harness.camera.position.x).toBeGreaterThan(5.5);
  });
});

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
