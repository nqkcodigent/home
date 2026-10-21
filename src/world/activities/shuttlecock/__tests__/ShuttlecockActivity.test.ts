import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { Character } from "../../../character/Character";
import { ShuttlecockActivity } from "../ShuttlecockActivity";
import { gameEvents } from "../../../../events";

import type { PlayHudPayload } from "../../../../events";
import type { Engine } from "../../../Engine";

/**
 * Vòng đời ván đá cầu — ngoài phạm vi test của mô hình.
 *
 * Bốn điều khoá:
 *  1. Promise: `dispose()` giữa chừng vẫn phải trả kết quả (đường thoát của
 *     hệ thống — HMR, unmount — không được để soft-lock).
 *  2. `freeMove = true` là hợp đồng với `WorldGame`: ván này KHÔNG khoá input.
 *  3. Cú đá phải ghi đè được dáng đi (legR vung lên) — nếu không, người chơi
 *     thấy một cú đá "vô hình".
 *  4. Bảng số liệu hiện khi vào ván, tắt khi ra ván.
 */

function makeJoint() {
  return {
    rotation: new THREE.Euler(),
    position: new THREE.Vector3(),
  } as unknown as THREE.Group;
}

function makeHarness() {
  let tick: ((frame: { dt: number; elapsed: number }) => void) | undefined;

  const engine = {
    scene: new THREE.Group(),
    onUpdate: (listener: (frame: { dt: number; elapsed: number }) => void) => {
      tick = listener;

      return () => {
        tick = undefined;
      };
    },
  } as unknown as Engine;

  // Nhân vật đứng ngay trên điểm cầu nằm chờ — cú tung phải ăn.
  const gaze: ({ x: number; y: number; z: number } | undefined)[] = [];
  const character = {
    position: new THREE.Vector3(2, 0, 3),
    root: new THREE.Group(),
    setGaze: (point: { x: number; y: number; z: number } | undefined) => gaze.push(point),
    rig: {
      root: makeJoint(),
      body: makeJoint(),
      head: makeJoint(),
      armL: makeJoint(),
      armR: makeJoint(),
      elbowL: makeJoint(),
      elbowR: makeJoint(),
      legL: makeJoint(),
      legR: makeJoint(),
      kneeL: makeJoint(),
      kneeR: makeJoint(),
    },
  } as unknown as Character;

  const hud: PlayHudPayload[] = [];
  const off = gameEvents.on("play", (payload) => hud.push(payload));

  let kickQueued = false;
  let exitQueued = false;

  const activity = new ShuttlecockActivity({
    engine,
    character,
    spot: { x: 2, z: 3 },
    readKick: () => {
      const queued = kickQueued;

      kickQueued = false;

      return queued;
    },
    readExit: () => {
      const queued = exitQueued;

      exitQueued = false;

      return queued;
    },
  });

  let frame = 0;

  return {
    activity,
    engine,
    character,
    hud,
    gaze,
    kick: () => {
      kickQueued = true;
    },
    pressExit: () => {
      exitQueued = true;
    },
    run(frames: number) {
      for (let index = 0; index < frames; index += 1) {
        tick?.({ dt: 1 / 60, elapsed: frame / 60 });
        frame += 1;
      }
    },
    stop: off,
  };
}

describe("ShuttlecockActivity — vòng đời", () => {
  it("ván này giữ nguyên quyền đi lại — đó là hợp đồng với WorldGame", () => {
    const harness = makeHarness();

    expect(harness.activity.freeMove).toBe(true);

    harness.activity.dispose();
    harness.stop();
  });

  it("bấm E lúc đứng trên cầu là tung lên và diễn vung chân", () => {
    const harness = makeHarness();

    void harness.activity.play();

    harness.run(2);

    // Tung: frame kế tiếp cầu phải ở trên không.
    harness.kick();
    harness.run(3);

    //legR vung lên (số âm là đưa về trước) trong lúc diễn vung.
    const legSwing = harness.character.rig.legR.rotation.x as number;

    expect(legSwing).toBeLessThan(-0.01);

    // Chờ hết thời gian vung — frame sau đó lớp dáng đi tự viết lại khớp.
    harness.run(40);

    expect(harness.character.rig.legR.rotation.x).toBe(0);

    harness.activity.dispose();
    harness.stop();
  });

  it("bấm R là kết thúc: bảng tắt, promise xong, dispose thêm lần nữa vẫn ổn", async () => {
    const harness = makeHarness();

    const done = harness.activity.play();

    harness.run(10);
    harness.pressExit();
    harness.run(5);

    await done;

    expect(harness.hud.at(-1)?.visible).toBe(false);

    harness.activity.dispose();
    harness.stop();
  });

  it("dỡ giữa chừng vẫn TRẢ KẾT QUả và dọn sạch scene", async () => {
    const harness = makeHarness();

    const done = harness.activity.play();

    expect(harness.engine.scene.children.length).toBe(1);

    harness.run(10);

    let settled = false;

    void done.then(() => {
      settled = true;
    });

    expect(settled).toBe(false);

    harness.activity.dispose();

    await Promise.resolve();

    expect(settled).toBe(true);
    expect(harness.engine.scene.children.length).toBe(0);

    harness.stop();
  });

  it("bảng số liệu đủ hai con số, và nói rõ nên làm gì", () => {
    const harness = makeHarness();

    void harness.activity.play();

    harness.run(5);

    const last = harness.hud.at(-1);

    expect(last?.visible).toBe(true);
    expect(last?.title).toBe("Đá cầu");
    expect(last?.stats.map((stat) => stat.label)).toEqual(["Liên tiếp", "Kỷ lục"]);
    expect(last?.hint).toContain("E");

    harness.activity.dispose();
    harness.stop();
  });
});

describe("ShuttlecockActivity — dáng đá", () => {
  it("cầu bay thì mắt dõi theo cầu; dỡ ván thì thôi nhìn", () => {
    const harness = makeHarness();

    void harness.activity.play();
    harness.kick();
    harness.run(10);

    const watching = harness.gaze.at(-1);

    // Nhìn đúng quả cầu: cùng toạ độ ngang với chỗ tung, ở trên cao.
    expect(watching?.x).toBeCloseTo(2, 3);
    expect(watching?.y).toBeGreaterThan(0.3);

    harness.activity.dispose();

    expect(harness.gaze.at(-1)).toBeUndefined();
    harness.stop();
  });

  it("đá bằng chân phía gần cầu, đùi mở sang ngang (má trong), tay dang; xong thì về dáng gốc", () => {
    const harness = makeHarness();
    const { rig } = harness.character;

    // Cầu lệch sang bên +X của hình (nhân vật nhìn +Z) ⇒ chân bên +X là legR.
    harness.character.position.x = 1.7;

    void harness.activity.play();
    harness.kick();
    harness.run(6);

    expect(rig.legR.rotation.x).toBeLessThan(-0.5);
    expect(rig.legR.rotation.z).toBeGreaterThan(0.2);
    expect(rig.kneeR.rotation.x).toBeGreaterThan(0.6);
    // Chân trụ chỉ nghiêng chút để đỡ người, không mở ra như chân đá.
    expect(Math.abs(rig.legL.rotation.z)).toBeLessThan(0.1);
    expect(rig.armR.rotation.z).toBeGreaterThan(0.5);

    harness.run(40);

    expect(rig.legR.rotation.z).toBe(0);
    expect(rig.legR.rotation.y).toBe(0);

    harness.activity.dispose();

    expect(rig.armR.rotation.z).toBeCloseTo(0.16, 6);
    harness.stop();
  });
});

describe("ShuttlecockActivity — bạn đá cùng", () => {
  it("mượn người bạn của sân: không thêm/bớt gì khỏi scene, bạn đứng yên chờ cú tung", () => {
    const harness = makeHarness();
    const partner = new Character({ variant: "friend", x: 2, z: 6.4 });
    const withFriend = new ShuttlecockActivity({
      engine: harness.engine,
      character: harness.character,
      spot: { x: 2, z: 3 },
      partner,
      readKick: () => false,
      readExit: () => false,
    });

    expect(withFriend.drivesFriend).toBe(true);

    void withFriend.play();

    // Chỉ có quả cầu — người bạn là của sân, đã nằm sẵn trong cảnh.
    expect(harness.engine.scene.children).toHaveLength(1);

    harness.run(30);

    expect(partner.position.x).toBeCloseTo(2, 3);
    expect(partner.position.z).toBeCloseTo(6.4, 3);

    withFriend.dispose();

    expect(harness.engine.scene.children).toHaveLength(0);

    harness.activity.dispose();
    harness.stop();
  });
});
