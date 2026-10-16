import { describe, expect, it } from "vitest";

import { Character } from "../Character";

import type { MotionInput } from "../motion";

/**
 * Nhân vật dùng three.js nhưng KHÔNG cần WebGL để kiểm thử: dựng hình học,
 * áp động học và bám nền đều là số học thuần.
 */

const IDLE: MotionInput = { forward: 0, right: 0, run: false };

function tick(character: Character, seconds: number, input: MotionInput = IDLE) {
  const steps = Math.round(seconds * 60);

  for (let index = 0; index < steps; index += 1) {
    character.update(input, 0, 1 / 60, index / 60);
  }
}

describe("Character", () => {
  it("đứng yên trong sân thì đứng đúng mặt đất (y = 0)", () => {
    const character = new Character({ variant: "player", x: 0, z: 0 });

    expect(character.position.y).toBe(0);
    expect(character.speed).toBe(0);
    expect(character.busy).toBe(false);
  });

  it("đứng trên mặt sàn do thế giới khai báo — không lún chân xuống sàn nhà", () => {
    const character = new Character({
      variant: "player",
      x: 0,
      z: 0,
      groundHeight: () => 0.3,
    });

    expect(character.position.y).toBeCloseTo(0.3, 6);

    tick(character, 1, { forward: 1, right: 0, run: false });

    expect(character.position.y).toBeCloseTo(0.3, 6);
  });

  it("bước lên bậc nền thì chân lên mượt, không nhảy cả bậc trong một frame", () => {
    // Đi về -Z; qua z = -1 là bước lên sàn cao 0,3 m.
    const character = new Character({
      variant: "player",
      x: 0,
      z: 0,
      groundHeight: (_x, z) => (z < -1 ? 0.3 : 0),
    });

    let previous = character.position.y;
    let biggestJump = 0;

    for (let index = 0; index < 180; index += 1) {
      character.update({ forward: 1, right: 0, run: false }, 0, 1 / 60, index / 60);

      biggestJump = Math.max(biggestJump, Math.abs(character.position.y - previous));
      previous = character.position.y;
    }

    expect(character.position.z).toBeLessThan(-2);
    expect(character.position.y).toBeCloseTo(0.3, 3);
    expect(biggestJump).toBeLessThan(0.15);
  });

  it("nhân vật quay về hướng đang đi", () => {
    const character = new Character({ variant: "player", x: 0, z: 0 });

    tick(character, 1, { forward: 1, right: 0, run: false });

    // Hướng đi là -Z → yaw = π theo quy ước atan2(dx, dz).
    expect(Math.abs(character.root.rotation.y)).toBeCloseTo(Math.PI, 2);
  });

  it("đi theo input thì bị vật cản chặn lại và mất tốc độ", () => {
    const character = new Character({
      variant: "player",
      x: 0,
      z: 0,
      obstacles: [{ x: 0, z: -2, radius: 1 }],
    });

    tick(character, 3, { forward: 1, right: 0, run: false });

    // Bị đẩy ra khỏi thân vật cản (bán kính 1 + bán kính nhân vật 0.36).
    expect(character.position.z).toBeGreaterThan(-0.65);
    expect(character.position.z).toBeLessThan(0);
  });
});

describe("Character — hành động", () => {
  it("với tay: đồ vật phản ứng đúng lúc tay chạm tới, một lần, rồi hành động kết thúc", async () => {
    const character = new Character({ variant: "player", x: 0, z: 0 });

    let contacts = 0;
    let contactAt = -1;
    let seconds = 0;

    const done = character.perform("reach", 0.6, () => {
      contacts += 1;
      contactAt = seconds;
    }, 0.5);

    expect(character.busy).toBe(true);

    let forward = 0;

    for (let index = 0; index < 60; index += 1) {
      seconds += 1 / 60;
      character.update(IDLE, 0, 1 / 60, seconds);
      forward = Math.min(forward, character.rig.armR.rotation.x);
    }

    await done;

    expect(contacts).toBe(1);
    expect(contactAt).toBeGreaterThan(0.28);
    expect(contactAt).toBeLessThan(0.34);
    expect(character.busy).toBe(false);

    // Tay phải vươn ra TRƯỚC (xoay âm quanh X) — rõ ràng, không phải vài độ.
    expect(forward).toBeLessThan(-0.8);
  });

  it("blend ra mượt: tay trôi dần về dáng đứng, không bật về trong một frame", () => {
    const character = new Character({ variant: "player", x: 0, z: 0 });

    void character.perform("reach", 0.3);

    tick(character, 0.3);

    const atEnd = character.rig.armR.rotation.x;

    character.update(IDLE, 0, 1 / 60, 1);

    const nextFrame = character.rig.armR.rotation.x;

    expect(Math.abs(nextFrame - atEnd)).toBeLessThan(0.2);

    tick(character, 1.5);

    expect(Math.abs(character.rig.armR.rotation.x)).toBeLessThan(0.1);
  });

  it("hành động mới thay hành động cũ mà không bỏ rơi phản ứng của hành động cũ", async () => {
    const character = new Character({ variant: "player", x: 0, z: 0 });

    let touched = false;

    const first = character.perform("reach", 1, () => {
      touched = true;
    }, 0.9);

    void character.perform("reel", 1);

    await first;

    expect(touched).toBe(true);
  });
});

describe("Character — lớp hình thể", () => {
  it("mắt chớp rồi mở lại, không kẹt ở trạng thái nhắm", () => {
    const character = new Character({ variant: "player", x: 0, z: 0 });
    const steps = Math.round(6 * 60);

    let shuttered = 0;

    for (let index = 0; index < steps; index += 1) {
      character.update(IDLE, 0, 1 / 60, index / 60);

      if (character.rig.eyes[0].scale.y < 0.9) shuttered += 1;
    }

    // Phải có chớp (nếu không thì mắt là mắt thuỷ tinh)…
    expect(shuttered).toBeGreaterThan(0);

    // …nhưng chỉ trong khoảnh khắc: một lần chớp 0,16 giây, cách nhau ~3 giây.
    // Nếu ai đó xoá phép hồi phục thì con số này vọt lên bằng cả số frame.
    expect(shuttered).toBeLessThan(steps * 0.2);
  });

  it("gối gập khi bước và không bao giờ gập ngược về sau", () => {
    const character = new Character({ variant: "player", x: 0, z: 0 });

    let deepest = 0;

    for (let index = 0; index < 120; index += 1) {
      character.update(
        { forward: 1, right: 0, run: false },
        0,
        1 / 60,
        index / 60,
      );

      const left = character.rig.kneeL.rotation.x;
      const right = character.rig.kneeR.rotation.x;

      expect(left).toBeGreaterThanOrEqual(0);
      expect(right).toBeGreaterThanOrEqual(0);

      deepest = Math.max(deepest, left, right);
    }

    expect(deepest).toBeGreaterThan(0.2);
  });

  it("khuỷu tay gập theo pha vung, không duỗi thẳng như thanh gỗ", () => {
    const character = new Character({ variant: "player", x: 0, z: 0 });

    for (let index = 0; index < 120; index += 1) {
      character.update(
        { forward: 1, right: 0, run: false },
        0,
        1 / 60,
        index / 60,
      );

      expect(character.rig.elbowL.rotation.x).toBeLessThan(-0.1);
      expect(character.rig.elbowR.rotation.x).toBeLessThan(-0.1);
    }
  });

  it("chạy là một dáng khác, không chỉ là đi nhanh hơn", () => {
    const walking = new Character({ variant: "player", x: 0, z: 0 });
    const running = new Character({ variant: "player", x: 0, z: 0 });

    tick(walking, 2, { forward: 1, right: 0, run: false });
    tick(running, 2, { forward: 1, right: 0, run: true });

    expect(running.speed).toBeGreaterThan(walking.speed);

    // Người chúi về trước nhiều hơn khi chạy.
    expect(running.rig.body.rotation.x).toBeGreaterThan(
      walking.rig.body.rotation.x,
    );
  });

  it("đứng yên thì vẫn thở: thân giãn ra co vào, chân về tư thế nghỉ", () => {
    const character = new Character({ variant: "player", x: 0, z: 0 });

    let lowest = Number.POSITIVE_INFINITY;
    let highest = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < 300; index += 1) {
      character.update(IDLE, 0, 1 / 60, index / 60);

      const scale = character.rig.body.scale.y;

      lowest = Math.min(lowest, scale);
      highest = Math.max(highest, scale);
    }

    expect(highest - lowest).toBeGreaterThan(0.005);
    expect(Math.abs(character.rig.legL.rotation.x)).toBeLessThan(0.02);
  });

  it("đuôi khăn rủ xuống khi đứng, bay ra sau khi chạy", () => {
    const standing = new Character({ variant: "player", x: 0, z: 0 });
    const running = new Character({ variant: "player", x: 0, z: 0 });

    tick(standing, 2);
    tick(running, 2, { forward: 1, right: 0, run: true });

    const rest = standing.rig.scarfTail?.rotation.x ?? 0;
    const flying = running.rig.scarfTail?.rotation.x ?? 0;

    expect(Math.abs(rest)).toBeLessThan(0.25);
    expect(flying).toBeGreaterThan(rest + 0.4);
  });
});

describe("Character — ngồi", () => {
  it("bước tới ghế, quay đúng hướng, hạ hông xuống mặt ghế, chân gập", async () => {
    const character = new Character({ variant: "player", x: 0, z: 0 });
    const seat = { x: 1.5, z: 1, yaw: Math.PI / 2, height: 0.45 };

    let seated = false;

    void character.sit(seat).then(() => {
      seated = true;
    });

    // Nửa giây đầu: đang BƯỚC tới, không dịch chuyển tức thì.
    tick(character, 0.5);

    expect(character.speed).toBeGreaterThan(0.3);
    expect(Math.hypot(character.position.x - 1.5, character.position.z - 1)).toBeGreaterThan(0.2);

    tick(character, 3);
    await Promise.resolve();

    expect(seated).toBe(true);
    expect(character.position.x).toBeCloseTo(1.5, 2);
    expect(character.position.z).toBeCloseTo(1, 2);
    expect(character.root.rotation.y).toBeCloseTo(Math.PI / 2, 1);

    // Hông nằm trên mặt ghế: gốc hình (chân) nhấc lên, đùi gập ra trước, gối gập.
    const hip = character.position.y + character.rig.root.position.y + character.rig.legL.position.y;

    expect(hip).toBeGreaterThan(seat.height);
    expect(hip).toBeLessThan(seat.height + 0.15);
    expect(character.rig.legL.rotation.x).toBeLessThan(-1.2);
    expect(character.rig.kneeL.rotation.x).toBeGreaterThan(1);
  });

  it("đứng dậy mượt rồi mới đi lại được", async () => {
    const character = new Character({ variant: "player", x: 0, z: 0 });

    void character.sit({ x: 0, z: 0, yaw: 0, height: 0.45 });
    tick(character, 3);

    let standing = false;

    void character.standUp().then(() => {
      standing = true;
    });

    // Ngay frame đầu chưa bật dậy: hông vẫn còn ở trên cao.
    character.update(IDLE, 0, 1 / 60, 3);

    expect(character.rig.root.position.y).toBeGreaterThan(0.1);

    tick(character, 2);
    await Promise.resolve();

    expect(standing).toBe(true);
    expect(character.seated).toBe(false);

    tick(character, 1, { forward: 1, right: 0, run: false });

    expect(character.position.z).toBeLessThan(-0.5);
  });
});

describe("Character — thay trang phục", () => {
  it("dress() dựng lại hình mà giữ nguyên chỗ đứng, hướng và vẫn đi tiếp được", () => {
    const character = new Character({ variant: "player", x: 1, z: 2, yaw: 0.5 });
    const before = character.rig;

    character.dress({ accessory: "nonLa", shirt: 0xbcd8ec });

    expect(character.rig).not.toBe(before);
    expect(character.root.children).toContain(character.rig.root);
    expect(character.root.children).not.toContain(before.root);
    expect(character.position.x).toBe(1);
    expect(character.root.rotation.y).toBeCloseTo(0.5, 6);

    tick(character, 1, { forward: 1, right: 0, run: false });

    expect(character.speed).toBeGreaterThan(0.5);
  });
});
