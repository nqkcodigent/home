import type * as THREE from "three";

import type { AudioSlot } from "../audio/HowlerAudio";
import type { Character } from "../character/Character";
import type { Engine } from "../Engine";
import type { Obstacle } from "../physics/collide";
import type { Spot } from "../interact/spots";
import type { SkyFocus } from "../world/Creatures";

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
  /** Quả cầu nằm chờ trên bãi cỏ — cất đi lúc đang đá, như con diều */
  shuttle?: THREE.Object3D;
  /** Người bạn đứng chờ ở bãi đá cầu — ván đá cầu mượn bạn để đá cùng */
  friend?: Character;
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
  /** Tiếng bước chân theo mặt nền tại (x, z) — cỏ và sàn gỗ nghe khác nhau */
  footstepSlot: (x: number, z: number) => AudioSlot;
  /** Hướng thả diều (mặt phẳng XZ) — diều phải bay ra chỗ trống */
  kiteForward?: { x: number; z: number };
  /**
   * Cái ao: tâm và bán kính THẬT của mặt nước. Ván bơi cần con số này chứ không
   * suy ra từ hình khối — bơi ra ngoài mép ao là bơi lên cỏ.
   */
  pond?: { x: number; z: number; radius: number };
  /**
   * Điểm trên trời cho đàn chim bám theo (con diều). `WorldGame` đẩy vào mỗi
   * frame lúc đang thả diều; `undefined` là chim về lộ trình vòng quanh sân.
   */
  setSkyFocus?: (focus: SkyFocus | undefined) => void;
  /** Mức chạng vạng 0…1; `instant` để đặt ngay (lúc vào game) thay vì trôi dần */
  setDusk?: (level: number, instant?: boolean) => void;
  /** Đổi màu đuôi con diều nằm chờ trên cỏ (trang phục) */
  kiteTail?: (color: number | undefined) => void;
  /** Cất kỷ vật đã nhặt khỏi bãi cỏ (id trong `KEEPSAKE_LIST`) */
  hideKeepsake?: (id: string) => void;
  /** Lần gần nhất chim cành bị hù bay (nhiệm vụ ẩn "Khách không mời") */
  lastScare?: () => { x: number; z: number; at: number } | undefined;
  /** Vật cản tĩnh — camera đọc để không bay xuyên tường, gốc cây */
  colliders?: readonly Obstacle[];
  /** Chuyển động riêng của thế giới (cây đung đưa, cửa đang mở…) */
  update?: (dt: number, elapsed: number) => void;
}
