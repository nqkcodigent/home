import type { Journal } from "./store";

/**
 * Chỗ DUY NHẤT trong game biết `localStorage` là gì.
 *
 * `store.ts` là reducer thuần; file này là cái rìa — nơi mọi thứ có thể hỏng
 * đều hỏng được, và nơi duy nhất được phép im lặng. Ba tình huống có thật:
 *
 *  1. **Chế độ riêng tư / bộ nhớ đầy.** `setItem` NÉM. Người chơi vẫn phải
 *     chơi được, chỉ là buổi chiều không được nhớ.
 *  2. **Dữ liệu cũ hoặc hỏng.** `JSON.parse` ném, hoặc trả về một thứ không
 *     phải sổ. Cả hai đều đi về `normalizeJournal` và ra một sổ mới.
 *  3. **Không có `window`.** Test chạy trong node: không có localStorage thì
 *     sổ chỉ sống trong bộ nhớ một phiên.
 *
 * Không lỗi nào ở đây được phép nổi lên thành màn hình trắng.
 */

/**
 * Khoá trong `localStorage`.
 *
 * KHÔNG có hậu tố phiên bản: hậu tố biến mỗi lần nâng cấp thành một ổ đĩa mới
 * và bỏ quên dữ liệu cũ, còn số phiên bản thì đã nằm TRONG dữ liệu
 * (`normalizeJournal` đọc nó).
 */
export const SAVE_KEY = "childhood-game:journal";

export interface JournalStorage {
  /** Dữ liệu thô đã lưu — `undefined` là chưa từng chơi, hoặc không đọc được. */
  load(): unknown;
  save(journal: Journal): void;
}

export function localStorageJournal(
  key: string = SAVE_KEY,
  /** Nguồn `localStorage`, tách ra để test được cả trường hợp bị chặn */
  storage: () => Storage | undefined = browserStorage,
): JournalStorage {
  return {
    load() {
      try {
        const blob = storage()?.getItem(key);

        return blob ? JSON.parse(blob) : undefined;
      } catch {
        // JSON hỏng, hoặc đọc bị chặn: coi như chưa từng chơi.
        return undefined;
      }
    },

    save(journal) {
      try {
        storage()?.setItem(key, JSON.stringify(journal));
      } catch {
        // Hết chỗ hoặc chế độ riêng tư: buổi chiều này không được nhớ, và
        // người chơi không cần biết điều đó.
      }
    },
  };
}

/** Sổ sống trong bộ nhớ một phiên — dùng khi không có `localStorage`. */
export function memoryJournal(): JournalStorage {
  let held: unknown;

  return {
    load: () => held,
    save: (journal) => {
      held = journal;
    },
  };
}

function browserStorage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    // Truy cập `localStorage` cũng có thể ném (chặn cookie bên thứ ba).
    return undefined;
  }
}
