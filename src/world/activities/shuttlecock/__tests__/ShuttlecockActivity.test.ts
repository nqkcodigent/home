import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { ShuttlecockActivity } from "../ShuttlecockActivity";
import { gameEvents } from "../../../../events";

import type { PlayHudPayload } from "../../../../events";
import type { Character } from "../../../character/Character";
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
  const character = {
    position: new THREE.Vector3(2, 0, 3),
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
