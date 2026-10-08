import { describe, expect, it } from "vitest";

import { StoryDirector } from "../StoryDirector";

import type { StoryEmitter, StoryStage } from "../StoryDirector";

import type { StoryData } from "../types";

// ---------------------------------------------------------------
// Fakes: interface là test surface — không cần Phaser
// ---------------------------------------------------------------

function makeEmitter() {
  const listeners = new Map<string, Set<(payload?: unknown) => void>>();

  const dialogs: { speaker?: string; text: string; emotion?: string }[] = [];

  const emitter: StoryEmitter = {
    emit(event, payload) {
      if (event === "dialog") {
        const { speaker, text, emotion } = payload as {
          speaker?: string;
          text: string;
          emotion?: string;
        };

        dialogs.push({ speaker, text, emotion });
      }

      [...(listeners.get(event) ?? [])].forEach((listener) => listener(payload));
    },

    on(event, listener) {
      if (!listeners.has(event)) {
        listeners.set(event, new Set());
      }

      listeners.get(event)!.add(listener);
    },

    off(event, listener) {
      listeners.get(event)?.delete(listener);
    },
  };

  return {
    emitter,
    dialogs,

    /** Giả lập người chơi bấm tiếp tục dialog */
    next() {
      emitter.emit("dialogNext", undefined);
    },
  };
}

function makeClock() {
  const pauses: number[] = [];

  return {
    pauses,

    clock: {
      delay: (ms: number) => {
        pauses.push(ms);

        return Promise.resolve();
      },
    },
  };
}

/** Xả đủ microtask để hàng đợi của director chạy qua các beat không block */
async function flush() {
  for (let i = 0; i < 20; i++) {
    await Promise.resolve();
  }
}

const scripts: StoryData = {
  intro: {
    scenes: [
      {
        type: "dialog",
        speaker: "Bạn",
        text: "Một ngày nữa lại hết.",
        emotion: "tired",
      },
      { type: "pause", duration: 500 },
      { type: "controls", enabled: true },
      { type: "transition", scene: "ChildhoodScene" },
    ],
  },

  morning: {
    scenes: [{ type: "dialog", speaker: "Bạn", text: "Chào buổi sáng." }],
  },
};

function makeStage() {
  const calls: string[] = [];

  const stage: StoryStage = {
    name: "FakeStage",

    handlers: {
      controls: (beat) => {
        calls.push(`controls:${beat.enabled}`);
      },

      transition: (beat) => {
        calls.push(`transition:${beat.scene}`);
      },
    },
  };

  return { stage, calls };
}

function makeDirector() {
  const emitterBox = makeEmitter();
  const clockBox = makeClock();
  const stageBox = makeStage();

  const director = new StoryDirector({
    scripts,
    clock: clockBox.clock,
    emitter: emitterBox.emitter,
  });

  director.attachStage(stageBox.stage);

  return { director, ...emitterBox, ...clockBox, ...stageBox };
}

// ---------------------------------------------------------------

describe("StoryDirector", () => {
  it("chạy script đúng thứ tự, dialog chờ người chơi bấm tiếp", async () => {
    const { director, dialogs, calls, pauses, next } = makeDirector();

    const done = director.play("intro");

    await flush();

    expect(dialogs).toEqual([
      { speaker: "Bạn", text: "Một ngày nữa lại hết.", emotion: "tired" },
    ]);
    expect(calls).toEqual([]); // chưa qua được dialog
    expect(pauses).toEqual([]);

    next(); // hoàn thành dialog đầu

    await flush();

    expect(pauses).toEqual([500]); // pause beat dùng injected clock

    await done; // controls + transition chạy nốt

    expect(calls).toEqual(["controls:true", "transition:ChildhoodScene"]);
  });

  it("say() xếp hàng FIFO sau script đang chạy", async () => {
    const { director, dialogs, next } = makeDirector();

    const scriptDone = director.play("intro");

    await flush();

    // Script đang chờ dialog — thoại lẻ không được đè lên
    const sayDone = director.say({ speaker: "Bạn", text: "Giếng này..." });

    await flush();

    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].text).toBe("Một ngày nữa lại hết.");

    next(); // xong dialog của script

    await scriptDone;

    await flush();

    // Bây giờ thoại lẻ mới được phát
    expect(dialogs).toHaveLength(2);
    expect(dialogs[1].text).toBe("Giếng này...");

    next(); // xong dialog lẻ

    await sayDone;
  });

  it("beat khi chưa gắn stage → lỗi rõ ràng", async () => {
    const { emitter } = makeEmitter();

    const director = new StoryDirector({
      scripts: { bad: { scenes: [{ type: "walk", to: "hall" }] } },
      clock: { delay: () => Promise.resolve() },
      emitter,
    });

    await expect(director.play("bad")).rejects.toThrow(/no stage attached/);
  });

  it("stage thiếu handler → lỗi nêu tên stage và beat", async () => {
    const { emitter } = makeEmitter();

    const director = new StoryDirector({
      scripts: { bad: { scenes: [{ type: "transition", scene: "X" }] } },
      clock: { delay: () => Promise.resolve() },
      emitter,
    });

    director.attachStage({ name: "LonelyStage", handlers: {} });

    await expect(director.play("bad")).rejects.toThrow(
      /stage "LonelyStage" has no handler for beat "transition"/,
    );
  });

  it("script không tồn tại → reject ngay", async () => {
    const { director } = makeDirector();

    await expect(director.play("khong-ton-tai")).rejects.toThrow(
      /unknown script/,
    );
  });

  it("lỗi một script không làm kẹt hàng đợi các lần gọi sau", async () => {
    const { director, dialogs, next } = makeDirector();

    await expect(director.play("khong-ton-tai")).rejects.toThrow();

    const done = director.play("morning");

    await flush();

    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].text).toBe("Chào buổi sáng.");

    next();

    await done;
  });
});
