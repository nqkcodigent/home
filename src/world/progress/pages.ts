import type { JournalMetric } from "./store";

/**
 * Trang hồi ký — phần THƯỞNG nhìn thấy được của một buổi chiều.
 *
 * Mỗi trang là một cột mốc của chính ba trò chơi con, và mở ra bằng đúng con
 * số mà sổ đã đếm (kỷ lục độ cao, tổng sen, tổng cột khí nóng…). Không có
 * bảng nhiệm vụ: trang chưa mở hiện ra như một ô trống trong sổ, kèm một dòng
 * mách nước đủ để người chơi biết đi đâu — chứ không phải một danh sách việc
 * phải làm.
 *
 * Chữ trong trang là chuyện của một đứa trẻ đã lớn, nhớ lại. Không trang nào
 * kể chuyện thay người chơi, cũng không trang nào dạy luật chơi — luật đã nằm
 * trong HUD và trong nhãn dán trên đồ vật.
 */

export type PageId =
  | "first-kite"
  | "kite-thirty"
  | "thermal-column"
  | "lotus-five"
  | "swim-round"
  | "shuttle-three"
  | "one-afternoon";

export interface MemoryPage {
  id: PageId;
  /** Tiêu đề trang — cũng là thứ hiện trong thông báo khi trang mở */
  title: string;
  /** Một hai câu của trang */
  text: string;
  /** Điều kiện mở, viết cho người chơi đọc */
  hint: string;
  metric: JournalMetric;
  target: number;
  unit: string;
  /** Sợi chỉ nhận được khi trang mở */
  threads: number;
}

/** Mỗi trang khâu vào sổ bằng hai sợi chỉ. */
const PAGE_THREADS = 2;

export const PAGES: Record<PageId, MemoryPage> = {
  "first-kite": {
    id: "first-kite",
    title: "Con diều đầu tiên",
    text: "Cầm con diều chạy một quãng, rồi thấy nó giật giật trên tay. Dây căng lên một cái là biết gió đã bắt được nó rồi.",
    hint: "Thả diều một lần",
    metric: "bestKite",
    target: 1,
    unit: "m",
    threads: PAGE_THREADS,
  },
  "kite-thirty": {
    id: "kite-thirty",
    title: "Ba mươi mét",
    text: "Ba mươi mét là ngang ngọn tre già ngoài bờ rào. Đứng dưới nhìn lên, con diều chỉ còn một chấm đỏ, muốn thấy nó phải nheo mắt.",
    hint: "Đưa diều lên 30 m",
    metric: "bestKite",
    target: 30,
    unit: "m",
    threads: PAGE_THREADS,
  },
  "thermal-column": {
    id: "thermal-column",
    title: "Cột khí nóng",
    text: "Chỗ đất nóng bốc lên thì diều cứ thế mà vọt, chẳng cần thả thêm dây. Đàn chim lượn vòng đúng trên cái cột vô hình ấy — chúng biết trước cả mình.",
    hint: "Bắt một cột khí nóng",
    metric: "thermalsTotal",
    target: 1,
    unit: "cột",
    threads: PAGE_THREADS,
  },
  "lotus-five": {
    id: "lotus-five",
    title: "Năm bông sen",
    text: "Nước ao mát tới mức trèo lên bờ vẫn còn thấy lạnh ở lưng. Năm bông sen ấy đem cắm vào chai nước trên bàn, sáng hôm sau nở hết.",
    hint: "Nhặt đủ 5 sen",
    metric: "lotusTotal",
    target: 5,
    unit: "sen",
    threads: PAGE_THREADS,
  },
  "swim-round": {
    id: "swim-round",
    title: "Một vòng ao",
    text: "Nhặt sạch sen trong một ván — từ bờ này sang bờ kia, bông nào cũng tới. Lên bờ ngồi thở, nghe tiếng nước còn đọng trong tai.",
    hint: "Nhặt hết 5 sen trong một ván",
    metric: "bestSwim",
    target: 5,
    unit: "sen",
    threads: PAGE_THREADS,
  },
  "shuttle-three": {
    id: "shuttle-three",
    title: "Ba cú liền",
    text: "Quả cầu bay lên, rơi xuống ngay tầm chân, rồi lại bay. Ba cú liền nhau mà chân vẫn chưa kịp mỏi.",
    hint: "Đá 3 cú liên tiếp",
    metric: "bestShuttle",
    target: 3,
    unit: "cú",
    threads: PAGE_THREADS,
  },
  "one-afternoon": {
    id: "one-afternoon",
    title: "Một buổi chiều",
    text: "Năm ván rồi mà trời vẫn chưa chịu tối. Đứa trẻ nào cũng có một buổi chiều như thế: không ai gọi về, và cũng chẳng muốn về.",
    hint: "Chơi đủ 5 ván",
    metric: "sessions",
    target: 5,
    unit: "ván",
    threads: PAGE_THREADS,
  },
};

export const PAGE_LIST: readonly MemoryPage[] = Object.values(PAGES);

export function isPageId(value: string): value is PageId {
  return value in PAGES;
}
