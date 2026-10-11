import * as THREE from "three";

import { Tweens, easeInOutSine } from "./Tween";
import { terrainHeight } from "./terrain/heightfield";

import type { LookDelta } from "./Input";

/**
 * CameraRig — camera góc nhìn thứ ba kiểu character-threejs: một "cần gạt"
 * xoay quanh nhân vật, có giảm xóc, kẹp độ cao theo địa hình.
 *
 * Camera KHÔNG bám cứng vào nhân vật. Nó bám vào một điểm đã làm mượt
 * (`smoothed`), nên nhân vật đi giật cục cũng không làm hình rung; đồng thời
 * `lookOffset` cho phép nhịp truyện `pan` kéo điểm nhìn sang cửa sổ hay bàn
 * mà không cần đụng tới vị trí người chơi.
 */

export interface CameraRigOptions {
  /** Khoảng cách mặc định sau lưng nhân vật (mét) */
  distance?: number;
  /** Độ cao tương đối của tâm ngắm so với chân nhân vật */
  height?: number;
  /** Độ nhạy kéo chuột (radian/pixel) */
  sensitivity?: number;
}

const MIN_PITCH = -0.12;
const MAX_PITCH = 1.15;
const MIN_DISTANCE = 2.2;
const MAX_DISTANCE = 12;

export class CameraRig {
  private readonly tweens: Tweens;

  private readonly camera: THREE.PerspectiveCamera;

  private readonly options: Required<CameraRigOptions>;

  private readonly target = new THREE.Vector3();

  private readonly smoothed = new THREE.Vector3();

  private readonly desired = new THREE.Vector3();

  private readonly lookOffset = new THREE.Vector3();

  private readonly lookTarget = new THREE.Vector3();

  private yaw = Math.PI;

  private pitch = 0.34;

  private distance: number;

  private baseDistance: number;

  private followEnabled = true;

  private initialised = false;

  /**
   * Chế độ điện ảnh — xem `setCinematic()`.
   */
  private cinematic:
    | { distance: number; pitch: number; fov: number }
    | undefined;

  private readonly cinematicTarget = new THREE.Vector3();

  /** FOV gốc, để trả lại đúng ống kính cũ khi hết cảnh điện ảnh. */
  private readonly baseFov: number;

  /** Khoảng cách cần trôi về sau khi hết cảnh điện ảnh. */
  private returnDistance: number | undefined;

  /**
   * @param tweens  Bộ hiệu ứng DÙNG CHUNG với WorldGame. Cần rig tự sở hữu một
   *   bộ riêng thì phải có hai chỗ gọi `update()` — và quên một chỗ nghĩa là
   *   mọi nhịp `zoom`/`pan` chờ mãi không xong.
   */
  constructor(
    camera: THREE.PerspectiveCamera,
    tweens: Tweens,
    options: CameraRigOptions = {},
  ) {
    this.camera = camera;
    this.tweens = tweens;
    this.options = {
      distance: options.distance ?? 6.2,
      height: options.height ?? 0.95,
      sensitivity: options.sensitivity ?? 0.0035,
    };

    this.distance = this.options.distance;
    this.baseDistance = this.options.distance;
    this.baseFov = camera.fov;
  }

  /** Góc quay hiện tại — dùng làm mốc cho chuyển động tương đối camera. */
  get yawAngle(): number {
    return this.yaw;
  }

  /** Khoảng cách hiện tại tới tâm ngắm (mét) — cho test và HUD gỡ lỗi. */
  get distanceToTarget(): number {
    return this.distance;
  }

  get following(): boolean {
    return this.followEnabled;
  }

  setFollow(enabled: boolean) {
    this.followEnabled = enabled;
  }

  /* Mọi thời lượng trong lớp này tính bằng GIÂY (khớp `dt` của frame). */

  /** Ngắm vào một điểm trong thế giới (đặt ngay, không nội suy). */
  lookAt(x: number, y: number, z: number) {
    this.target.set(x, y, z);
    this.smoothed.copy(this.target);
    this.lookOffset.set(0, 0, 0);
    this.initialised = false;
  }

  setTarget(x: number, y: number, z: number) {
    this.target.set(x, y, z);
  }

  /** Nhịp `pan`: kéo tâm ngắm lệch khỏi nhân vật trong `duration` giây. */
  panTo(
    target: { x: number; y: number; z: number },
    duration: number,
  ): Promise<void> {
    const offset = new THREE.Vector3()
      .subVectors(new THREE.Vector3(target.x, target.y, target.z), this.target)
      .clampLength(-18, 18);

    const start = this.lookOffset.clone();

    return this.tweens.add({
      duration,
      onUpdate: (t) => {
        this.lookOffset.lerpVectors(start, offset, t);
      },
    });
  }

  loadPan() {
    return { x: this.lookOffset.x, y: this.lookOffset.y, z: this.lookOffset.z };
  }

  resetPan() {
    this.lookOffset.set(0, 0, 0);
  }

  /** Nhịp `zoom`: level > 1 là lại gần (giống quy ước của bản Phaser cũ). */
  dollyTo(level: number, duration: number): Promise<void> {
    const start = this.distance;

    const goal = clamp(
      this.baseDistance / Math.max(level, 0.2),
      MIN_DISTANCE,
      MAX_DISTANCE,
    );

    return this.tweens.add({
      duration,
      ease: easeInOutSine,
      onUpdate: (t) => {
        this.distance = start + (goal - start) * t;
      },
    });
  }

  /** Đặt lại cỡ zoom mặc định (dùng khi vào cảnh mới). */
  resetZoom() {
    this.distance = this.options.distance;
    this.baseDistance = this.options.distance;
    this.returnDistance = undefined;
  }

  /**
   * Đổi bối cảnh: cỡ camera, góc nhìn và độ cao đều đổi theo.
   *
   * `initialised = false` để frame sau camera ĐẶT thẳng vào vị trí mới thay vì
   * bay xuyên qua bản đồ từ bối cảnh cũ sang bối cảnh mới.
   */
  applyPreset(preset: { distance: number; height: number; pitch: number; yaw: number }) {
    this.options.distance = preset.distance;
    this.options.height = preset.height;

    this.distance = preset.distance;
    this.baseDistance = preset.distance;

    this.pitch = preset.pitch;
    this.yaw = preset.yaw;

    this.lookOffset.set(0, 0, 0);
    this.followEnabled = true;
    this.initialised = false;

    // Bối cảnh mới thì mọi thứ của cảnh cũ phải hết hiệu lực: hết cảnh điện
    // ảnh, hết quán tính zoom, và trả lại ống kính gốc.
    this.cinematic = undefined;
    this.returnDistance = undefined;

    if (this.camera.fov !== this.baseFov) {
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
    }
  }

  setYaw(yaw: number) {
    this.yaw = yaw;
  }

  /**
   * Nhịp điện ảnh: khoá tâm ngắm vào một điểm bất kỳ và nới ống kính.
   *
   * Vì sao cần: minigame thả diều kéo dài tới 60 m dây, mà góc nhìn thứ ba
   * bám nhân vật thì không khung hình nào chứa nổi cả người chơi lẫn con diều
   * ở cỡ bình thường. Chế độ này chỉ đổi BA con số (khoảng cách, pitch, FOV) và
   * tạm ngừng xoay theo chuột — người chơi đang điều khiển diều, kéo chuột là
   * để kéo dây.
   *
   * Gọi `setCinematic(undefined)` để trả lại camera góc nhìn thứ ba; mọi giá
   * trị đều trôi về đích theo hàm mũ nên vào/ra cảnh đều mượt.
   */
  setCinematic(
    target: { x: number; y: number; z: number } | undefined,
    distance = 24,
    // Pitch âm: camera hạ xuống DƯỚI điểm ngắm để nhìn lên. Diều luôn ở trên
    // đầu, nên khung hình đúng là khung hình ngước lên trời.
    pitch = -0.08,
    fov = 58,
  ) {
    if (!target) {
      this.cinematic = undefined;
      // Không đặt lại ngay: camera TRÔI về cỡ cũ trong vài phần giây (xem
      // `returnDistance` trong update), nếu không thì vừa hết ván diều là
      // khung hình nhảy một cái.
      this.returnDistance = this.baseDistance;

      return;
    }

    this.cinematic = { distance, pitch, fov };
    this.cinematicTarget.set(target.x, target.y, target.z);
  }

  update(dt: number, look: LookDelta, elapsed: number) {
    const cinematic = this.cinematic;

    if (cinematic) {
      // Trôi về thông số điện ảnh; `look` bị bỏ qua hoàn toàn.
      this.pitch = dampTowards(this.pitch, cinematic.pitch, 3, dt);
      this.distance = dampTowards(this.distance, cinematic.distance, 3, dt);
      this.camera.fov = dampTowards(this.camera.fov, cinematic.fov, 3, dt);
      this.camera.updateProjectionMatrix();

      this.target.copy(this.cinematicTarget);
    }

    if (!cinematic) {
      if (this.returnDistance !== undefined) {
        this.distance = dampTowards(this.distance, this.returnDistance, 3, dt);

        if (Math.abs(this.distance - this.returnDistance) < 0.05) {
          this.returnDistance = undefined;
        }
      }

      if (this.camera.fov !== this.baseFov) {
        this.camera.fov = dampTowards(this.camera.fov, this.baseFov, 3, dt);
        this.camera.updateProjectionMatrix();
      }
    }

    if (!cinematic && this.followEnabled) {
      if (look.x !== 0) this.yaw -= look.x * this.options.sensitivity;
      if (look.y !== 0) this.pitch += look.y * this.options.sensitivity;
    }

    if (look.zoom !== 0) {
      this.baseDistance = clamp(
        this.baseDistance + look.zoom,
        MIN_DISTANCE,
        MAX_DISTANCE,
      );
    }

    this.pitch = clamp(this.pitch, MIN_PITCH, MAX_PITCH);

    const focusX = this.target.x + this.lookOffset.x;
    const focusY = this.target.y + this.options.height + this.lookOffset.y;
    const focusZ = this.target.z + this.lookOffset.z;

    // Cần gạt: vị trí mong muốn = tâm ngắm + vector xoay quanh nó.
    const horizontal = Math.cos(this.pitch) * this.distance;

    this.desired.set(
      focusX + Math.sin(this.yaw) * horizontal,
      focusY + Math.sin(this.pitch) * this.distance,
      focusZ + Math.cos(this.yaw) * horizontal,
    );

    if (!this.initialised) {
      this.smoothed.set(focusX, focusY, focusZ);
      this.initialised = true;

      this.camera.position.copy(this.desired);
    } else {
      // Giảm xóc độc lập với tần số khung hình (exp thay vì lerp hằng số).
      const followLerp = 1 - Math.exp(-6.5 * dt);
      const lookLerp = 1 - Math.exp(-9 * dt);

      this.smoothed.x += (focusX - this.smoothed.x) * lookLerp;
      this.smoothed.y += (focusY - this.smoothed.y) * lookLerp;
      this.smoothed.z += (focusZ - this.smoothed.z) * lookLerp;

      this.camera.position.lerp(this.desired, followLerp);
    }

    // Đừng để camera chui xuống đất ở triền dốc.
    const floor =
      terrainHeight(this.camera.position.x, this.camera.position.z) + 0.55;

    if (this.camera.position.y < floor) {
      this.camera.position.y = floor;
    }

    // Thở rất nhẹ khi đứng yên: khung hình tĩnh tuyệt đối trông như ảnh chết.
    const breathe = Math.sin(elapsed * 0.9) * 0.012;

    this.lookTarget.set(this.smoothed.x, this.smoothed.y + breathe, this.smoothed.z);

    this.camera.lookAt(this.lookTarget);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Làm mượt độc lập tần số khung hình — cùng công thức với lớp nhân vật. */
function dampTowards(
  current: number,
  target: number,
  rate: number,
  dt: number,
): number {
  return current + (target - current) * (1 - Math.exp(-rate * Math.max(0, dt)));
}
