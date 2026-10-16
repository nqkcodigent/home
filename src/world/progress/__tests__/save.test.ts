// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";

import { SAVE_KEY, localStorageJournal, memoryJournal } from "../save";
import { createJournal, normalizeJournal } from "../store";

/**
 * Kho lưu là chỗ DUY NHẤT trong game được phép nuốt lỗi, nên cũng là chỗ phải
 * chứng minh rằng nó nuốt đúng: ba tình huống có thật ngoài đời đều phải đi
 * qua mà không làm người chơi thấy gì.
 */

describe("kho lưu — localStorage", () => {
  beforeEach(() => localStorage.clear());

  it("ghi rồi đọc lại đúng sổ", () => {
    const storage = localStorageJournal();
    const journal = { ...createJournal(), threads: 7, bests: { kite: 34 } };

    storage.save(journal);

    expect(normalizeJournal(storage.load())).toEqual(journal);
    expect(localStorage.getItem(SAVE_KEY)).toContain('"threads":7');
  });

  it("chưa từng chơi thì không có gì để đọc", () => {
    expect(localStorageJournal().load()).toBeUndefined();
  });

  it("JSON hỏng nằm sẵn trên đĩa cũng không ném — chỉ là một sổ mới", () => {
    for (const junk of ["{không phải json", "[]", "null", '"sổ"']) {
      localStorage.setItem(SAVE_KEY, junk);

      expect(normalizeJournal(localStorageJournal().load())).toEqual(createJournal());
    }
  });

  it("localStorage bị chặn: đọc ra undefined, ghi không ném", () => {
    const blocked = (): Storage => {
      throw new Error("chế độ riêng tư");
    };

    const storage = localStorageJournal(SAVE_KEY, blocked);

    expect(storage.load()).toBeUndefined();
    expect(() => storage.save(createJournal())).not.toThrow();
  });

  it("hết chỗ (setItem ném) thì buổi chiều không được nhớ, chứ không sập", () => {
    const full = {
      getItem: () => null,
      setItem: () => {
        throw new Error("bộ nhớ đầy");
      },
    } as unknown as Storage;

    const storage = localStorageJournal(SAVE_KEY, () => full);

    expect(() => storage.save(createJournal())).not.toThrow();
  });

  it("không có localStorage thì sổ sống trong bộ nhớ một phiên", () => {
    const storage = memoryJournal();

    expect(storage.load()).toBeUndefined();

    storage.save({ ...createJournal(), threads: 3 });

    expect(normalizeJournal(storage.load()).threads).toBe(3);
  });
});
