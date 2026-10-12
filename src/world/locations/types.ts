import type * as THREE from "three";

import type { AudioSlot } from "../audio/HowlerAudio";
import type { Character } from "../character/Character";
import type { Engine } from "../Engine";
import type { Obstacle } from "../physics/collide";
import type { Spot } from "../interact/spots";

/**
 * Hợp đồng giữa thế giới và bộ máy của game.
 *
 * Thế giới CHỈ khai báo dữ liệu và phản ứng của đồ vật (cửa mở, đèn tắt…);
 * vòng lặp, camera, phím bấm và trò chơi con đều nằm ở `WorldGame`.
 */

export interface WorldServices {
  engine: Engine;
}

export interface RigPreset {
  distance: number;
  height: number;
  pitch: number;
  yaw: number;
}

export interface LocationRuntime {
  group: THREE.Group;
  character: Character;
  /**
   * Con diều NẰM CHỜ trên cỏ. `WorldGame` giấu nó trong lúc người chơi đang
   * thả và hiện lại đúng chỗ cũ khi ván kết thúc — đó là toàn bộ cơ chế
   * "reset diều".
   */
  kite?: THREE.Object3D;
  /** Đồ vật tương tác được (bấm E khi đứng gần) */
  spots: Spot[];
  /**
   * Phản ứng của đồ vật khi người chơi chạm vào (mở cửa, bật đèn…). Điểm có
   * `activity` thì không đi qua đây — `WorldGame` mở trò chơi con.
   */
  interact: (spotId: string) => void;
  rig: RigPreset;
  /** Độ cao nhãn tương tác cho từng điểm (mặc định 2,4 m) */
  badgeHeight?: Record<string, number>;
  footstepSlot: AudioSlot;
  /** Hướng thả diều (mặt phẳng XZ) — diều phải bay ra chỗ trống */
  kiteForward?: { x: number; z: number };
  /** Vật cản tĩnh — camera đọc để không bay xuyên tường, gốc cây */
  colliders?: readonly Obstacle[];
  /** Chuyển động riêng của thế giới (cây đung đưa, cửa đang mở…) */
  update?: (dt: number, elapsed: number) => void;
}
