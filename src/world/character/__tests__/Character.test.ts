import { describe, expect, it } from "vitest";

import { Character } from "../Character";

import type { MotionInput } from "../motion";

/**
 * Nhân vật dùng three.js nhưng KHÔNG cần WebGL để kiểm thử: dựng hình học,
 * áp động học và bám địa hình đều là số học thuần. Vì vậy bài đi bộ theo kịch
 * bản có thể chạy trong test — và nó phải chạy, vì đây đúng là chỗ từng lệch
 * đơn vị (mili-giây của story.json so với giây của vòng lặp frame) khiến một
 * cú đi bộ 1,8 giây thành 1.800 giây.
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
    expect(character.scriptedWalk).toBe(false);
  });

  it("walkTo() đi hết quãng đường trong đúng số giây đã cho", async () => {
    const character = new Character({ variant: "player", x: 0, z: 0 });

    const finish = character.walkTo(0, -8, 2);

    expect(character.scriptedWalk).toBe(true);

    // Nửa đầu: đã đi được một phần, chưa tới nơi.
    tick(character, 1);

    expect(character.position.z).toBeLessThan(-1);
    expect(character.position.z).toBeGreaterThan(-8);

    tick(character, 1.2);

    await finish;

    // Kịch bản kết thúc khi còn cách đích trong ARRIVE_EPSILON (2 cm) — đúng
    // như thiết kế: dừng sớm một chút còn hơn đúng tới nơi rồi mới trả quyền.
    expect(Math.abs(character.position.z + 8)).toBeLessThan(0.03);
    expect(character.scriptedWalk).toBe(false);
  });

  it("time-lapse như núi: không đi quá chậm khi dt ở mức bình thường", () => {
    const character = new Character({ variant: "player", x: 0, z: 0 });

    void character.walkTo(0, -6, 1.5);

    tick(character, 1.5);

    // Nếu đơn vị lệch (giây ↔ mili-giây) thì chỗ này chỉ nhích được vài phần
    // nghìn mét thay vì gần trọn 6 mét.
    expect(Math.abs(character.position.z)).toBeGreaterThan(5.5);
  });

  it("walkTo() với thời lượng 0 là dịch chuyển tức thì", async () => {
    const character = new Character({ variant: "player", x: 0, z: 0 });

    await character.walkTo(3, 4, 0);

    expect(character.position.x).toBeCloseTo(3, 6);
    expect(character.position.z).toBeCloseTo(4, 6);
  });

  it("nhân vật quay về hướng đang đi", () => {
    const character = new Character({ variant: "player", x: 0, z: 0 });

    void character.walkTo(0, -6, 1);

    tick(character, 1);

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

  it("setOpacity() đổi độ trong suốt của mọi vật liệu — dùng cho nhịp reveal", () => {
    const character = new Character({ variant: "player", x: 0, z: 0 });

    character.setOpacity(0.25);

    expect(character.root.visible).toBe(true);

    for (const material of character.rig.materials) {
      expect(material.opacity).toBeCloseTo(0.25, 6);
      expect(material.transparent).toBe(true);
    }

    character.setOpacity(0);

    expect(character.root.visible).toBe(false);
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
});
