import type * as THREE from "three";

import type { AudioSlot } from "../audio/HowlerAudio";
import type { Badges } from "../interact/Badges";
import type { CameraRig } from "../CameraRig";
import type { Character } from "../character/Character";
import type { Engine } from "../Engine";
import type { HowlerAudio } from "../audio/HowlerAudio";
import type { Spot } from "../interact/spots";
import type { StageHandlers } from "../../story/StoryDirector";
import type { StoryLine } from "../../story/StoryDirector";
import type { Tweens } from "../Tween";

/**
 * Hợp đồng giữa "một bối cảnh" và bộ máy của game.
 *
 * Bản Phaser cũ có hai Scene gần như song sinh: mỗi scene tự dựng thế giới, tự
 * xử lý nhịp truyện, tự đặt camera. Sửa một lỗi phải sửa hai lần, và phần lớn
 * mã trong đó giống hệt nhau. Ở đây bối cảnh CHỈ khai báo dữ liệu (vật thể,
 * điểm ký ức, điểm kịch bản, tâm trạng ánh sáng); mọi nhịp truyện nằm ở
 * WorldGame, viết một lần.
 */

export interface WorldServices {
  engine: Engine;
  rig: CameraRig;
  audio: HowlerAudio;
  badges: Badges;
  tweens: Tweens;
  /** Đổi bối cảnh kèm hiệu ứng giấc mơ */
  transition: (scene: string, duration: number) => void;
  setControls: (enabled: boolean) => void;
}

export interface LocationHeading {
  index: number;
  title: string;
  subtitle: string;
  time: string;
}

export interface RigPreset {
  distance: number;
  height: number;
  pitch: number;
  yaw: number;
}

export interface LocationRuntime {
  /** Tên bối cảnh, khớp với `transition.scene` trong story.json */
  name: string;
  heading: LocationHeading;
  /** Tên đoạn truyện chạy khi vào bối cảnh */
  story: string;
  group: THREE.Group;
  character: Character;
  spots: Spot<StoryLine>[];
  walkPoints: Record<string, { x: number; z: number }>;
  panPoints: Record<string, { x: number; y: number; z: number }>;
  rig: RigPreset;
  /** Độ cao đặt nhãn tương tác cho từng điểm (mặc định 2,4 m) */
  badgeHeight?: Record<string, number>;
  /**
   * Lời kết của bối cảnh, đọc lên MỘT lần khi người chơi đã nhặt hết hồi ký.
   * Đây là chỗ chương khép lại — không phải nhịp truyện, vì nó phụ thuộc vào
   * việc người chơi đã đi hết sân hay chưa.
   */
  epilogue?: StoryLine;
  footstepSlot: AudioSlot;
  /**
   * Hướng thả diều trong bối cảnh này (mặt phẳng XZ). Diều phải bay ra chỗ
   * trống — hướng đó là chuyện của sân, không phải chuyện của minigame.
   */
  kiteForward?: { x: number; z: number };
  /** Nguồn âm thanh có vị trí (tiếng trống trường vọng từ xa) */
  spatialSources?: Partial<Record<AudioSlot, { x: number; y: number; z: number }>>;
  /** Vài bối cảnh cần một chút chuyển động riêng (cây đung đưa, mây trôi) */
  update?: (dt: number, elapsed: number) => void;
}

export type LocationBuilder = (services: WorldServices) => LocationRuntime;

export type StageHandlersOf = StageHandlers;
