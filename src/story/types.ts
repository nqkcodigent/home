export type AudioOp = "fadeIn" | "fadeOut" | "crossFade" | "play" | "stop";

export type StoryBeat =
  | {
      id?: string;
      type: "dialog";
      speaker?: string;
      text: string;
      emotion?: string;
      portrait?: string;
    }
  | { id?: string; type: "pause"; duration: number }
  | { id?: string; type: "walk"; to: string; duration?: number }
  | { id?: string; type: "pan"; to: string; duration?: number }
  | {
      id?: string;
      type: "zoom";
      level: number;
      duration?: number;
      follow?: boolean;
    }
  | { id?: string; type: "reveal"; duration?: number }
  | {
      id?: string;
      type: "audio";
      op: AudioOp;
      slot: string;
      to?: string;
      duration?: number;
      volume?: number;
    }
  | { id?: string; type: "controls"; enabled: boolean }
  | { id?: string; type: "transition"; scene: string; duration?: number }
  /**
   * Nhịp `activity` — giao quyền cho một trò chơi con trong thế giới (thả
   * diều). Tên hoạt động khớp với bảng đăng ký của stage; stage nào không có
   * trò đó thì lỗi nêu tên stage + beat, không im lặng bỏ qua.
   *
   * `duration` (ms) là trần thời gian; trò chơi vẫn có thể kết thúc sớm (dây
   * đứt) và tự trả quyền lại. Nhịp này CHỜ tới lúc đó, nên `controls` sau nó
   * luôn chạy đúng thứ tự.
   */
  | {
      id?: string;
      type: "activity";
      activity: string;
      duration?: number;
    };

export type StoryBeatType = StoryBeat["type"];

export type BeatOfType<T extends StoryBeatType> = Extract<StoryBeat, { type: T }>;

export interface Story {
  title?: string;

  scenes: StoryBeat[];
}

export interface StoryData {
  [name: string]: Story;
}
