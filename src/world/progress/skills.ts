import { DEFAULT_KITE } from "../activities/kite/model";
import { DEFAULT_SHUTTLE } from "../activities/shuttlecock/model";
import { DEFAULT_SWIM } from "../activities/swim/model";
import { DEFAULT_MOTION } from "../character/motion";

import type { KiteTuning } from "../activities/kite/model";
import type { ShuttleTuning } from "../activities/shuttlecock/model";
import type { SwimTuning } from "../activities/swim/model";
import type { MotionTuning } from "../character/motion";
import type { JournalMetric } from "./store";

/**
 * Kỹ năng — và lý do chúng KHÔNG phải một hệ thống mới.
 *
 * Cả ba mô phỏng đã nhận `tuning` làm tham số từ đầu, nên "tiến trình" ở đây
 * chỉ là một hàm thuần: `kiteTuning(base, skills) → tuning`. Không có bảng
 * chỉ số nhân vật, không có cây kỹ năng phân nhánh, và không có con số nào
 * mới — mọi hiệu ứng đều là con số đang nằm trong `DEFAULT_*`.
 *
 * ── Nguyên tắc cân bằng ────────────────────────────────────────────────────
 * **Kỹ năng NỚI CỬA SỔ, không làm mất luật.** *Dây bền* dời ngưỡng đứt dây ra
 * xa, chứ không biến "thả nhiều dây là liều" thành chuyện không bao giờ xảy
 * ra: `snapTension` giữ nguyên 1, nên dây căng quá vẫn đứt. Người chơi mới
 * không có kỹ năng nào vẫn chơi được y như trước, và người có kỹ năng vẫn
 * phải đọc trời.
 *
 * ── Vì sao mỗi trò đúng hai kỹ năng ────────────────────────────────────────
 * Có ba hoạt động để nới, nên ba nhánh × 3 cấp = 9 ô phải cân chỉ để người
 * chơi CHỌN. Ở đây họ không phải chọn gì cả — chỉ phải chơi, rồi kỹ năng tự
 * mở bằng chính thành tích của trò đó.
 */

export type SkillId =
  | "kite-line-1"
  | "kite-line-2"
  | "kite-line-3"
  | "kite-strong"
  | "swim-stroke"
  | "swim-eye"
  | "shuttle-spring"
  | "walk-light"
  | "walk-fleet";

export interface Skill {
  id: SkillId;
  /** Tên trên trang sổ */
  label: string;
  family: "kite" | "swim" | "shuttlecock" | "walk";
  /** Hiệu ứng, viết bằng con số trước → sau */
  effect: string;
  /** Mở bằng gì (câu người chơi đọc được) */
  hint: string;
  /** Ngưỡng mở khoá — đọc thẳng từ sổ, không có bộ đếm riêng */
  metric: JournalMetric;
  target: number;
  unit: string;
}

/**
 * Bảng kỹ năng khoá theo `SkillId`: thiếu một ô là lỗi biên dịch, chứ không
 * phải một kỹ năng lặng lẽ không bao giờ mở được.
 */
export const SKILLS: Record<SkillId, Skill> = {
  "kite-line-1": {
    id: "kite-line-1",
    label: "Dây dài I",
    family: "kite",
    effect: "Trần dây 60 → 72 m",
    hint: "Phá kỷ lục độ cao 30 m",
    metric: "bestKite",
    target: 30,
    unit: "m",
  },
  "kite-line-2": {
    id: "kite-line-2",
    label: "Dây dài II",
    family: "kite",
    effect: "Trần dây 72 → 84 m",
    hint: "Phá kỷ lục độ cao 55 m",
    metric: "bestKite",
    target: 55,
    unit: "m",
  },
  "kite-line-3": {
    id: "kite-line-3",
    label: "Dây dài III",
    family: "kite",
    effect: "Trần dây 84 → 96 m",
    hint: "Phá kỷ lục độ cao 80 m",
    metric: "bestKite",
    target: 80,
    unit: "m",
  },
  "kite-strong": {
    id: "kite-strong",
    label: "Dây bền",
    family: "kite",
    effect: "Ân hạn đứt 10 → 14 giây, nguy cơ theo tải 0.12 → 0.095",
    hint: "Bắt đủ 4 cột khí nóng",
    metric: "thermalsTotal",
    target: 4,
    unit: "cột",
  },
  "swim-stroke": {
    id: "swim-stroke",
    label: "Sải tay",
    family: "swim",
    effect: "Tốc độ 2.4 → 2.75 m/s, nhịp quạt tay 5.5 → 6.2 rad/s",
    hint: "Nhặt hết 5 sen trong một ván",
    metric: "bestSwim",
    target: 5,
    unit: "sen",
  },
  "swim-eye": {
    id: "swim-eye",
    label: "Mắt nhặt",
    family: "swim",
    effect: "Tầm nhặt 0.85 → 1.05 m",
    hint: "Nhặt đủ 25 sen",
    metric: "lotusTotal",
    target: 25,
    unit: "sen",
  },
  "shuttle-spring": {
    id: "shuttle-spring",
    label: "Cầu dẻo",
    family: "shuttlecock",
    effect: "Cửa sổ đá 1.15 → 1.35 m",
    hint: "Đá 10 cú liên tiếp",
    metric: "bestShuttle",
    target: 10,
    unit: "cú",
  },
  "walk-light": {
    id: "walk-light",
    label: "Bước nhẹ",
    family: "walk",
    effect: "Đi bộ 2.2 → 2.5 m/s",
    hint: "Ngồi ngắm cảnh ở 3 chỗ khác nhau",
    metric: "nooksTotal",
    target: 3,
    unit: "chỗ",
  },
  "walk-fleet": {
    id: "walk-fleet",
    label: "Chân sáo",
    family: "walk",
    effect: "Chạy 4.5 → 5.3 m/s, bứt tốc 18 → 23 m/s²",
    hint: "Ngồi ngắm cảnh ở 7 chỗ khác nhau",
    metric: "nooksTotal",
    target: 7,
    unit: "chỗ",
  },
};

export const SKILL_LIST: readonly Skill[] = Object.values(SKILLS);

export function isSkillId(value: string): value is SkillId {
  return value in SKILLS;
}

/** Một cấp *Dây dài* nới trần dây thêm ngần này mét. */
const LINE_STEP = 12;

/** *Dây bền*: ân hạn đứt dài hơn, nguy cơ theo tải thấp hơn — ngưỡng đứt thì KHÔNG đổi. */
const STRONG_GRACE = 14;
const STRONG_LOAD = 0.095;

/** *Sải tay*: nhanh hơn và quạt tay dày hơn. */
const STROKE_GLIDE = 2.75;
const STROKE_RATE = 6.2;

/** *Mắt nhặt*: với tới xa hơn một chút. */
const EYE_REACH = 1.05;

/** *Cầu dẻo*: cửa sổ đá rộng hơn. */
const SPRING_REACH = 1.35;

const LINE_SKILLS: readonly SkillId[] = ["kite-line-1", "kite-line-2", "kite-line-3"];

export function kiteTuning(skills: readonly SkillId[]): KiteTuning {
  const tiers = LINE_SKILLS.filter((id) => skills.includes(id)).length;
  const strong = skills.includes("kite-strong");

  return {
    ...DEFAULT_KITE,
    lineMax: DEFAULT_KITE.lineMax + tiers * LINE_STEP,
    snapGrace: strong ? STRONG_GRACE : DEFAULT_KITE.snapGrace,
    snapLoad: strong ? STRONG_LOAD : DEFAULT_KITE.snapLoad,
  };
}

export function swimTuning(skills: readonly SkillId[]): SwimTuning {
  const stroke = skills.includes("swim-stroke");
  const eye = skills.includes("swim-eye");

  return {
    ...DEFAULT_SWIM,
    glide: stroke ? STROKE_GLIDE : DEFAULT_SWIM.glide,
    strokeRate: stroke ? STROKE_RATE : DEFAULT_SWIM.strokeRate,
    reach: eye ? EYE_REACH : DEFAULT_SWIM.reach,
  };
}

export function shuttleTuning(skills: readonly SkillId[]): ShuttleTuning {
  return {
    ...DEFAULT_SHUTTLE,
    reach: skills.includes("shuttle-spring") ? SPRING_REACH : DEFAULT_SHUTTLE.reach,
  };
}

/** *Bước nhẹ* / *Chân sáo*: đi nhanh hơn, chạy nhanh và bứt tốc hơn. */
const LIGHT_WALK = 2.5;
const FLEET_RUN = 5.3;
const FLEET_ACCEL = 23;

export function motionTuning(skills: readonly SkillId[]): MotionTuning {
  const fleet = skills.includes("walk-fleet");

  return {
    ...DEFAULT_MOTION,
    walkSpeed: skills.includes("walk-light") ? LIGHT_WALK : DEFAULT_MOTION.walkSpeed,
    runSpeed: fleet ? FLEET_RUN : DEFAULT_MOTION.runSpeed,
    acceleration: fleet ? FLEET_ACCEL : DEFAULT_MOTION.acceleration,
  };
}
