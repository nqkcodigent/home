import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { SwimActivity } from "../SwimActivity";
import { gameEvents } from "../../../../events";

import type { PlayHudPayload } from "../../../../events";
import type { Character } from "../../../character/Character";
import type { Engine } from "../../../Engine";
import type { SwimInput } from "../model";

/**
 * Vòng đời của một ván bơi — phần mà unit test của mô phỏng không chạm tới.
 *
 * Ba điều đáng khoá:
 *
 *  1. **Promise**: ván con `await` bởi `WorldGame`, nên mọi đường thoát đều
 *     phải trả kết quả. `dispose()` giữa chừng (HMR, unmount) là đường thoát
 *     của HỆ THỐNG và nó không được phép để promise treo.
 *  2. **Tư thế bơi phải được trả lại**: ván set thẳng `root.rotation.x` của
 *     nhân vật — dỡ ván mà quên trả thì đứa trẻ nằm sấp trên mặt sân.
 *  3. **Bảng số liệu**: hiện khi vào ván, tắt khi ra ván — không được kẹt lại
 *     trên màn hình sau khi đã tấp vào bờ.
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

  const root = new THREE.Group();

  const character = {
    root,
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

  let exitQueued = false;
  let input: SwimInput = { forward: 0, turn: 0 };

  const pond = { x: 17.5, z: -5.5, radius: 3.2 };

  const activity = new SwimActivity({
    engine,
    character,
    pond,
    entry: { x: 14.2, z: -4.6 },
    readInput: () => input,
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
    root,
    setInput: (next: SwimInput) => {
      input = next;
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

describe("SwimActivity — vòng đời", () => {
  it("dỡ giữa chừng vẫn TRẢ QUYỀN và dựng nhân vật đứng dậy", async () => {
    const harness = makeHarness();

    const done = harness.activity.play();

    expect(harness.engine.scene.children.length).toBe(1);

    // Đủ lâu để vào hẳn pha bơi — nhân vật đang nằm sấp trên nước.
    harness.run(120);

    expect(harness.root.rotation.x).toBeGreaterThan(0.5);

    let settled = false;

    void done.then(() => {
      settled = true;
    });

    expect(settled).toBe(false);

    harness.activity.dispose();

    await Promise.resolve();

    expect(settled).toBe(true);
    // Tư thế bơi được trả lại — nếu không, nhân vật nằm sấp trên sân.
    expect(harness.root.rotation.x).toBe(0);
    // Scene sạch: không còn nhóm trường hoa nào.
    expect(harness.engine.scene.children.length).toBe(0);

    // Gọi lần hai là không sao — dispose phải idempotent.
    harness.activity.dispose();

    harness.stop();
  });

  it("bấm R là vào bờ: bảng tắt, promise xong, đúng sau pha tấp bờ", async () => {
    const harness = makeHarness();

    const done = harness.activity.play();

    // Qua pha vào nước rồi bấm thoát.
    harness.run(90);
    harness.pressExit();
    harness.run(30);

    // Pha tấp bờ ~1,1 giây = 66 frame; chạy thêm cho chắc.
    harness.run(60);

    await done;

    const last = harness.hud.at(-1);

    expect(last?.visible).toBe(false);
    expect(harness.root.rotation.x).toBe(0);

    harness.activity.dispose();
    harness.stop();
  });

  it("đạp nước thì nhân vật thật sự rời tâm ao", () => {
    const harness = makeHarness();

    void harness.activity.play();

    // Qua pha vào nước — điểm xuất phát là chính giữa ao.
    harness.run(90);

    const start = harness.root.position.clone();

    expect(start.x).toBeCloseTo(17.5);
    expect(start.z).toBeCloseTo(-5.5);

    // Bơi thẳng +Z (heading = 0) năm giây — nếu mô hình không lái được thì
    // nhân vật nằm yên ở tâm ao và test này fails.
    harness.setInput({ forward: 1, turn: 0 });
    harness.run(300);

    expect(harness.root.position.z).toBeGreaterThan(start.z + 1);
    // Vẫn trong ao: không bao giờ ra ngoài bán kính mô hình.
    const distance = Math.hypot(harness.root.position.x - 17.5, harness.root.position.z + 5.5);

    expect(distance).toBeLessThanOrEqual(3.2 + 1e-6);

    harness.activity.dispose();
    harness.stop();
  });

  it("bảng số liệu nói rõ còn mấy bông sen", () => {
    const harness = makeHarness();

    void harness.activity.play();

    harness.run(10);

    const last = harness.hud.at(-1);

    expect(last?.visible).toBe(true);
    expect(last?.title).toBe("Bơi ao");
    expect(last?.stats.some((stat) => stat.label === "Sen" && stat.value === "0/5")).toBe(true);

    harness.activity.dispose();
    harness.stop();
  });
});

describe("SwimActivity — nước có trọng lượng", () => {
  it("lặn sâu thì mặt ao đục dần; lên bờ thì trả lại độ trong cũ", () => {
    const harness = makeHarness();
    const material = new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.62 });
    const water = new THREE.Mesh(new THREE.CircleGeometry(1), material);

    water.name = "pond-water";
    harness.engine.scene.add(water);

    void harness.activity.play();
    harness.run(90);
    harness.setInput({ forward: 0, turn: 0, dive: true });
    harness.run(120);

    expect(material.opacity).toBeGreaterThan(0.75);

    harness.activity.dispose();

    expect(material.opacity).toBeCloseTo(0.62, 6);
    harness.stop();
  });
});
