import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { KiteActivity } from "../KiteActivity";
import { gameEvents } from "../../../../events";

import type { CameraShot } from "../../../CameraRig";
import type { Character } from "../../../character/Character";
import type { Engine } from "../../../Engine";
import type { KiteHudPayload, KiteResultPayload } from "../../../../events";
import type { KiteInput } from "../model";

/**
 * Vòng đời của một ván diều — phần mà unit test của mô phỏng không chạm tới.
 *
 * Hai điều đáng khoá ở đây:
 *
 *  1. **Promise**: nhịp `activity` trong cốt truyện `await` `play()`, nên mọi
 *     đường thoát đều phải đi qua `finish()`. Ván diều nay không có đồng hồ —
 *     nó chỉ kết thúc khi người chơi bấm phím cất diều — nên đường thoát của
 *     HỆ THỐNG (`dispose()`) càng phải chắc: một promise treo là treo cả hàng
 *     đợi của `StoryDirector`, đúng thứ spec gọi là soft-lock.
 *  2. **Camera thuộc về con diều**, không phải về nhân vật: sau khi dây đứt,
 *     người chơi vẫn đang bay theo con diều, và chỉ cú bấm của họ mới kéo
 *     camera về lại sân.
 *
 * Engine và nhân vật ở đây là hai cái vỏ: ván diều chỉ cần một `Scene` để thêm
 * nhóm hình khối, một chỗ đăng ký `onUpdate`, và một `Vector3` làm vị trí tay.
 */
function makeHarness(options: { suggestedMs?: number } = {}) {
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

  const character = {
    position: new THREE.Vector3(4, 0, 6),
  } as unknown as Character;

  const shots: (CameraShot | undefined)[] = [];
  const hud: KiteHudPayload[] = [];

  const off = gameEvents.on("kite", (payload) => hud.push(payload));

  let input: KiteInput = { reel: 0, steer: 0 };
  let exitQueued = false;
  let viewQueued = false;

  const activity = new KiteActivity({
    engine,
    character,
    readInput: () => input,
    readViewToggle: () => {
      const queued = viewQueued;

      viewQueued = false;

      return queued;
    },
    readExit: () => {
      const queued = exitQueued;

      exitQueued = false;

      return queued;
    },
    camera: (shot) => shots.push(shot),
    forward: { x: 0, z: 1 },
    suggestedMs: options.suggestedMs,
  });

  let frame = 0;

  return {
    activity,
    engine,
    shots,
    hud,
    tooltip: () => hud.at(-1),
    setInput: (next: KiteInput) => {
      input = next;
    },
    pressExit: () => {
      exitQueued = true;
    },
    pressView: () => {
      viewQueued = true;
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

describe("KiteActivity — vòng đời", () => {
  it("dỡ giữa chừng vẫn TRẢ KẾT QUẢ và dọn sạch scene", async () => {
    const harness = makeHarness();
    const results: KiteResultPayload[] = [];
    const off = gameEvents.on("kiteResult", (payload) => {
      if (payload) results.push(payload);
    });

    const done = harness.activity.play();

    expect(harness.engine.scene.children.length).toBe(1);

    harness.run(10);

    let settled = false;

    void done.then(() => {
      settled = true;
    });

    expect(settled).toBe(false);

    harness.activity.dispose();

    await done;

    expect(results).toHaveLength(1);
    // Dỡ khỏi scene và trả camera về góc nhìn thứ ba — đây là điều duy nhất
    // khiến người chơi không bị bỏ lại trên trời.
    expect(harness.engine.scene.children.length).toBe(0);
    expect(harness.shots.at(-1)).toBeUndefined();

    off();
    harness.stop();
  });

  it("ván diều KHÔNG tự kết thúc: chạy ba phút không bấm gì thì vẫn đang bay", async () => {
    const harness = makeHarness();

    void harness.activity.play();

    harness.run(60 * 180);

    expect(harness.tooltip()?.visible).toBe(true);

    harness.activity.dispose();

    harness.stop();
  });

  it("người chơi bấm phím cất diều thì ván kết thúc đúng một lần", async () => {
    const harness = makeHarness();
    const results: KiteResultPayload[] = [];
    const off = gameEvents.on("kiteResult", (payload) => {
      if (payload) results.push(payload);
    });

    const done = harness.activity.play();

    harness.run(30);

    harness.pressExit();
    // Phím được đọc ở khung hình kế tiếp — vòng lặp frame là thứ duy nhất

    // chạy được logic của ván.
    harness.run(1);

    const result = await done;

    expect(result.outcome).toBe("stowed");
    expect(results).toHaveLength(1);

    // Dỡ thêm cũng không phát kết quả lần thứ hai.
    harness.activity.dispose();

    expect(results).toHaveLength(1);
    expect(harness.engine.scene.children.length).toBe(0);

    off();
    harness.stop();
  });

  it("chưa bay được giây nào mà đã bấm cất diều thì cũng thoát êm", async () => {
    const harness = makeHarness();

    const done = harness.activity.play();

    // Bấm ngay trong khung hình đầu — trước cả lần tiến mô phỏng nào.
    harness.pressExit();
    harness.run(1);

    const result = await done;

    expect(result.outcome).toBe("stowed");
    expect(result.score).toBe(0);

    harness.activity.dispose();
    harness.stop();
  });

  it("dây đứt thì camera bị KHOÁ vào cảnh bay theo diều, kể cả khi người chơi đổi góc", async () => {
    const harness = makeHarness();

    const done = harness.activity.play();

    // Thả hết dây là cách chơi bảo đảm có ngày đứt dây.
    harness.setInput({ reel: -1, steer: 0 });

    harness.run(60 * 60);

    expect(harness.tooltip()?.phase).toBe("adrift");

    // Người chơi vẫn còn đang xem: ván chưa kết thúc, và diều đã trôi xa.
    expect(harness.tooltip()?.visible).toBe(true);
    expect(harness.tooltip()?.altitude).toBeGreaterThan(0);

    // Bấm đổi góc máy: cảnh vẫn là cảnh bay theo diều.
    harness.pressView();
    harness.run(10);

    expect(harness.tooltip()?.view).toBe("drift");

    // Và camera thật sự ở trên trời, không phải sau lưng nhân vật đứng dưới
    // sân: nó đang ở tầm cao của con diều.
    const shot = harness.shots.at(-1);
    const altitude = harness.tooltip()?.altitude ?? 0;

    expect(shot?.position.y).toBeGreaterThan(altitude);

    harness.activity.dispose();

    await done;

    harness.stop();
  });

  it("đứt dây rồi mới cất diều thì kết cục là ĐỨT DÂY, không phải cất gọn", async () => {
    const harness = makeHarness();

    const done = harness.activity.play();

    harness.setInput({ reel: -1, steer: 0 });
    harness.run(60 * 60);

    harness.pressExit();
    harness.run(1);

    const result = await done;

    expect(result.outcome).toBe("snapped");
    expect(result.detail.length).toBeGreaterThan(0);

    harness.activity.dispose();
    harness.stop();
  });

  it("con diều biết mình ở đâu NGAY trước khung hình đầu — chim bám theo nó, không lao về gốc sân", async () => {
    const harness = makeHarness();

    // Đọc TRƯỚC khi ván chạy: `WorldGame` lấy điểm này ở listener đầu tiên của
    // mỗi frame, và (0, 0, 0) chính là giữa sân — cả đàn chim sẽ bổ nhào xuống
    // đó trong đúng một frame nếu `skyFocus()` chưa có gì để trả.
    const before = { ...harness.activity.skyFocus() };

    expect(Number.isFinite(before.x)).toBe(true);
    expect(Math.hypot(before.x, before.y, before.z)).toBeGreaterThan(1);
    expect(before.y).toBeGreaterThan(1);

    void harness.activity.play();

    harness.run(120);

    const after = harness.activity.skyFocus();

    // Bay hai giây thì con diều phải đã ở chỗ khác — nếu không thì đàn chim
    // đang bám theo một điểm đứng im.
    expect(Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z)).toBeGreaterThan(0.5);

    harness.activity.dispose();
    harness.stop();
  });

  it("đàn chim được chỉ tới cột khí nóng gần nhất, ngang tầm con diều", async () => {
    const harness = makeHarness();

    void harness.activity.play();

    let seen = false;

    // Vài chục giây là đủ để ít nhất một cột khí nóng sinh ra.
    for (let second = 0; second < 40 && !seen; second += 1) {
      harness.run(60);

      const focus = harness.activity.skyFocus();

      if (focus.thermal) {
        seen = true;

        expect(Math.abs(focus.thermal.y - focus.y)).toBeLessThan(0.01);
        expect(focus.thermal.radius).toBeGreaterThan(0);
      }
    }

    expect(seen).toBe(true);

    harness.activity.dispose();
    harness.stop();
  });

  it("qua độ dài gợi ý thì HUD nhắc cất diều — nhưng ván vẫn không bị cắt ngang", async () => {
    const harness = makeHarness({ suggestedMs: 1000 });

    void harness.activity.play();

    harness.run(30);

    expect(harness.tooltip()?.hint).toBe(false);

    harness.run(90);

    expect(harness.tooltip()?.hint).toBe(true);
    // Nhắc, chứ không kết thúc: vẫn đang bay, vẫn còn điểm.
    expect(harness.tooltip()?.visible).toBe(true);

    harness.activity.dispose();
    harness.stop();
  });
});
