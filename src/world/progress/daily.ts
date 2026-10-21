import { ACTIVITIES } from "../activities";
import { createRandom } from "../world/Terrain";

import type { ActivityName } from "../activities";
import type { SessionMetric } from "./store";

/**
 * "Buổi chiều hôm nay" — ba mục, một cho mỗi chỗ chơi.
 *
 * Đây là câu trả lời duy nhất cho câu hỏi "vì sao ngày mai quay lại": không có
 * cốt truyện để đi tiếp, nhưng mỗi ngày có ba việc khác nhau, và chúng luôn
 * vừa sức một buổi chơi.
 *
 * ── Ba luật của file này ───────────────────────────────────────────────────
 *  - **Tất định.** Ba mục sinh từ CHUỖI NGÀY bằng PRNG có hạt giống, nên cùng
 *    một ngày thì mọi máy ra cùng một buổi chiều. Không server, không đồng bộ,
 *    và test so được hai lần gọi.
 *  - **Không chuỗi ngày, không hình phạt.** Hôm nay không chơi thì chỉ là hôm
 *    nay không có mục mới. Cozy game không mắng người chơi vì đi làm.
 *  - **Không nằm trong `model.ts`.** Chỗ này là `progress/`, không phải mô
 *    phỏng: luật L1 cấm số ngẫu nhiên trong mô phỏng, chứ không cấm nó ở lớp
 *    nội dung.
 */

export interface DailyTask {
  id: string;
  label: string;
  /** Trò nào chấm mục này — chỉ ván của trò đó mới đọc ra số */
  name: ActivityName;
  metric: SessionMetric;
  target: number;
  unit: string;
  /** Sợi chỉ nhận được khi xong */
  threads: number;
}

/** Mỗi mục trong ngày khâu vào sổ bằng một sợi chỉ. */
const TASK_THREADS = 1;

export const DAILY_POOL: readonly DailyTask[] = [
  {
    id: "kite-30",
    label: "Thả diều lên ba mươi mét",
    name: "kite",
    metric: "kiteAltitude",
    target: 30,
    unit: "m",
    threads: TASK_THREADS,
  },
  {
    id: "kite-45",
    label: "Thả diều lên bốn mươi lăm mét",
    name: "kite",
    metric: "kiteAltitude",
    target: 45,
    unit: "m",
    threads: TASK_THREADS,
  },
  {
    id: "kite-thermal-2",
    label: "Bắt hai cột khí nóng trong một ván",
    name: "kite",
    metric: "kiteThermals",
    target: 2,
    unit: "cột",
    threads: TASK_THREADS,
  },
  {
    id: "swim-3",
    label: "Nhặt ba bông sen trong một ván",
    name: "swim",
    metric: "swimLotus",
    target: 3,
    unit: "sen",
    threads: TASK_THREADS,
  },
  {
    id: "swim-4",
    label: "Nhặt bốn bông sen trong một ván",
    name: "swim",
    metric: "swimLotus",
    target: 4,
    unit: "sen",
    threads: TASK_THREADS,
  },
  {
    id: "swim-5",
    label: "Nhặt hết năm bông sen",
    name: "swim",
    metric: "swimLotus",
    target: 5,
    unit: "sen",
    threads: TASK_THREADS,
  },
  {
    id: "shuttle-6",
    label: "Đá sáu cú liên tiếp",
    name: "shuttlecock",
    metric: "shuttleCombo",
    target: 6,
    unit: "cú",
    threads: TASK_THREADS,
  },
  {
    id: "shuttle-8",
    label: "Đá tám cú liên tiếp",
    name: "shuttlecock",
    metric: "shuttleCombo",
    target: 8,
    unit: "cú",
    threads: TASK_THREADS,
  },
  {
    id: "shuttle-10",
    label: "Đá mười cú liên tiếp",
    name: "shuttlecock",
    metric: "shuttleCombo",
    target: 10,
    unit: "cú",
    threads: TASK_THREADS,
  },
];

/**
 * Ngày theo giờ MÁY người chơi, dạng `YYYY-MM-DD` — khoá của `Journal.days`.
 *
 * `Date` chỉ được đọc ở đây, ở lớp tiến trình. Mô phỏng vẫn không biết hôm nay
 * là ngày nào, nên một ván diều vẫn cho cùng kết quả ở mọi múi giờ.
 */
export function todayKey(now: Date = new Date()): string {
  const month = `${now.getMonth() + 1}`.padStart(2, "0");
  const day = `${now.getDate()}`.padStart(2, "0");

  return `${now.getFullYear()}-${month}-${day}`;
}

/** Hạt giống từ chuỗi ngày (FNV-1a) — ngày nào cũng ra một con số khác. */
function daySeed(day: string): number {
  let hash = 2166136261;

  for (let index = 0; index < day.length; index += 1) {
    hash ^= day.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function poolFor(name: ActivityName): readonly DailyTask[] {
  const pool = DAILY_POOL.filter((task) => task.name === name);

  // Không có mục nào cho trò này thì đó là lỗi dữ liệu, không phải lỗi chơi
  // được: ném ra ngay thay vì trả về một buổi chiều thiếu mục.
  if (pool.length === 0) throw new Error(`Buổi chiều hôm nay: thiếu mục cho "${name}"`);

  return pool;
}

/**
 * Ba mục của một ngày — mỗi chỗ chơi đúng một mục.
 *
 * Chọn theo TỪNG TRÒ chứ không bốc ba mục từ một rổ chung: bốc ngẫu nhiên cả
 * rổ thì có ngày cả ba mục đều là thả diều, và buổi chiều đó chỉ còn một chỗ
 * để đi.
 */
export function dailyTasks(day: string): DailyTask[] {
  const random = createRandom(daySeed(day));

  return ACTIVITIES.map((name) => {
    const pool = poolFor(name);

    return pool[Math.floor(random() * pool.length) % pool.length];
  });
}
