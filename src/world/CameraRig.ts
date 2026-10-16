import * as THREE from "three";

import { Tweens, easeInOutSine } from "./Tween";
import { terrainHeight } from "./terrain/heightfield";
import { obstacleOffset } from "./physics/collide";

import type { LookDelta } from "./Input";
import type { Obstacle } from "./physics/collide";

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

/** Góc máy tự do — xem `CameraRig.setShot()`. */
export interface CameraShot {
  position: THREE.Vector3;
  look: THREE.Vector3;
  fov: number;
  /** 0…1 — độ rung */
  shake: number;
  /**
   * Chuột xoay quanh đâu: `look` (mặc định) — quay QUANH điểm ngắm, như bay
   * vòng quanh con diều; `camera` — đứng yên mà ngoảnh đầu nhìn quanh, như
   * người đang ngồi.
   */
  pivot?: "look" | "camera";
}

/** Pha bay về góc thứ ba sau một góc máy tự do (giây). */
const RETURN_SECONDS = 1.8;

const MIN_PITCH = -0.12;
const MAX_PITCH = 1.15;
const MIN_DISTANCE = 2.2;
const MAX_DISTANCE = 12;

/**
 * Cần gạt ngắn nhất, theo tỉ lệ tầm với (0,26 × 6,2 m ≈ 1,6 m).
 *
 * Có sàn này vì lý do khác hẳn `MIN_DISTANCE`: đó là giới hạn của người chơi
 * (đừng cho zoom sát quá), còn đây là giới hạn khi vật cản ở ngay sau lưng —
 * thu hết cỡ thì camera chui vào trong đầu nhân vật.
 */
export const MIN_BOOM = 0.26;

/** Đệm thêm quanh mỗi vật cản (mét) — camera không dán sát mặt tường. */
const BOOM_MARGIN = 0.45;

/**
 * Hệ số rút ngắn cần gạt để đoạn [tâm ngắm → camera] không chạm vật cản nào.
 *
 * Trả về 1 khi cả đoạn trống, ngược lại là tỉ lệ xa nhất còn kịp dừng TRƯỚC
 * vật cản đầu tiên. Toán trên mặt phẳng XZ, cùng dữ liệu với va chạm của nhân
 * vật: giao đúng một điểm chạm của phương trình bậc hai, lấy nghiệm nhỏ (điểm
 * vào, không phải điểm ra).
 */
export function boomClearance(
  fromX: number,
  fromZ: number,
  offsetX: number,
  offsetZ: number,
  colliders: readonly Obstacle[],
  margin = BOOM_MARGIN,
): number {
  const lengthSq = offsetX * offsetX + offsetZ * offsetZ;

  if (lengthSq < 1e-6) return 1;

  let best = 1;

  for (const collider of colliders) {
    const radius = collider.radius + margin;

    if (collider.toX !== undefined) {
      best = Math.min(best, segmentClearance(fromX, fromZ, offsetX, offsetZ, collider, radius));

      continue;
    }

    const dx = fromX - collider.x;
    const dz = fromZ - collider.z;

    const c = dx * dx + dz * dz - radius * radius;

    // Tâm ngắm đã nằm trong vật cản (hiếm: nhân vật không đi vào được). Không
    // có nghiệm dương nào để mà cắt, nên chỉ còn nước giữ cần gạt ở mức ngắn.
    if (c <= 0) {
      best = Math.min(best, MIN_BOOM);

      continue;
    }

    const b = 2 * (offsetX * dx + offsetZ * dz);
    const discriminant = b * b - 4 * lengthSq * c;

    if (discriminant <= 0) continue;

    const hit = (-b - Math.sqrt(discriminant)) / (2 * lengthSq);

    if (hit >= 0 && hit < best) best = hit;
  }

  return Math.max(MIN_BOOM, best);
}

/**
 * Như trên, cho vật cản dạng đoạn (tường): dò dọc cần gạt từng bước 1/48.
 * shortcut: lấy mẫu chứ không giải đúng tia–viên thuốc, sai tối đa ~1/48 cần gạt
 * (≈10 cm) — đủ cho camera; cần chính xác hơn thì giải giao tia–hình hộp + hai đầu tròn.
 */
function segmentClearance(
  fromX: number,
  fromZ: number,
  offsetX: number,
  offsetZ: number,
  collider: Obstacle,
  radius: number,
): number {
  if (obstacleOffset(collider, fromX, fromZ).distance <= radius) return MIN_BOOM;

  for (let step = 1; step <= 48; step += 1) {
    const t = step / 48;

    if (obstacleOffset(collider, fromX + offsetX * t, fromZ + offsetZ * t).distance < radius) {
      return (step - 1) / 48;
    }
  }

  return 1;
}

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

  /** Góc máy tự do — xem `setShot()`. */
  private shot: CameraShot | undefined;

  /** Còn bao lâu nữa (giây) thì hết pha bay về sau một góc máy tự do. */
  private returning = 0;

  /**
   * Góc máy tự do đã làm mượt (chưa cộng phần chuột). Chuột cộng SAU bước làm
   * mượt, nên xoay chuột phản hồi tức thì trong khi khung hình vẫn trôi êm
   * theo con diều.
   */
  private readonly shotPosition = new THREE.Vector3();

  private shotFresh = true;

  /** Độ lệch chuột trong góc máy tự do — xoá khi trả lại góc thứ ba. */
  private readonly shotOffset = { yaw: 0, pitch: 0, zoom: 1 };

  private readonly scratch = new THREE.Vector3();

  private readonly shake = new THREE.Vector3();

  /** Vật cản của bối cảnh hiện tại — cần gạt phải vòng ra ngoài chúng. */
  private colliders: readonly Obstacle[] = [];

  /** Hệ số rút ngắn cần gạt hiện tại (xem `boomClearance`). */
  private boom = 1;

  /** FOV gốc, để trả lại đúng ống kính cũ khi hết góc máy tự do. */
  private readonly baseFov: number;

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
    this.boom = 1;

    // Bối cảnh mới thì mọi thứ của cảnh cũ phải hết hiệu lực: hết góc máy tự
    // do, và trả lại ống kính gốc.
    this.shot = undefined;
    this.returning = 0;

    if (this.camera.fov !== this.baseFov) {
      this.camera.fov = this.baseFov;
      this.camera.updateProjectionMatrix();
    }
  }

  setYaw(yaw: number) {
    this.yaw = yaw;
  }

  /** Vật cản của bối cảnh (nhà, cây, giếng…) — đổi khi vào bối cảnh mới. */
  setColliders(colliders: readonly Obstacle[]) {
    this.colliders = colliders;
    this.boom = 1;
  }

  /**
   * Góc máy tự do: đặt camera ở một vị trí bất kỳ, ngắm một điểm bất kỳ.
   *
   * Vì sao cần: ván thả diều có góc nhìn từ mắt nhân vật và góc bay theo con
   * diều — cần gạt xoay quanh một tâm ngắm không dựng được hai góc đó. Mọi giá
   * trị trôi về đích theo hàm mũ, nên đổi góc là camera BAY sang, không giật.
   * Chuột bị bỏ qua: lúc này kéo chuột là để kéo dây.
   *
   * Gọi `setShot(undefined)` để trả lại góc nhìn thứ ba: camera bay về sau
   * lưng nhân vật trong `RETURN_SECONDS` với bộ giảm xóc mềm hơn thường lệ —
   * từ trên trời cao bổ nhào về trong nửa giây thì chóng mặt, không thư thả.
   */
  setShot(shot: CameraShot | undefined) {
    if (this.shot && !shot) {
      this.returning = RETURN_SECONDS;
      this.resetShotOffset();
    }

    if (!this.shot && shot) this.shotFresh = true;

    this.shot = shot;
  }

  private resetShotOffset() {
    this.shotOffset.yaw = 0;
    this.shotOffset.pitch = 0;
    this.shotOffset.zoom = 1;
  }

  update(dt: number, look: LookDelta, elapsed: number) {
    const shot = this.shot;

    if (shot) {
      this.updateShot(shot, dt, look, elapsed);

      return;
    }

    if (this.camera.fov !== this.baseFov) {
      this.camera.fov = dampTowards(this.camera.fov, this.baseFov, 3, dt);
      this.camera.updateProjectionMatrix();
    }

    if (this.followEnabled) {
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
    const offsetX = Math.sin(this.yaw) * horizontal;
    const offsetZ = Math.cos(this.yaw) * horizontal;

    // Chọc vào nhà thì phải ngắn lại. Thu NGAY nhưng nhả RA TỪ TỪ: một khung
    // hình có tường ở tiền cảnh vẫn dễ chịu hơn cảnh camera nhấp nhô giữa hai
    // bên tường mỗi khi tâm ngắm lướt qua mép vật cản.
    const clearance = boomClearance(focusX, focusZ, offsetX, offsetZ, this.colliders);

    this.boom =
      clearance < this.boom
        ? clearance
        : dampTowards(this.boom, clearance, 2.2, dt);

    this.desired.set(
      focusX + offsetX * this.boom,
      focusY + Math.sin(this.pitch) * this.distance * this.boom,
      focusZ + offsetZ * this.boom,
    );

    if (!this.initialised) {
      this.smoothed.set(focusX, focusY, focusZ);
      this.initialised = true;

      this.camera.position.copy(this.desired);
    } else {
      // Giảm xóc độc lập với tần số khung hình (exp thay vì lerp hằng số).
      // Lúc đang bay về từ góc máy tự do thì mềm hơn hẳn.
      const returning = this.returning > 0;

      this.returning = Math.max(0, this.returning - dt);

      const followLerp = 1 - Math.exp(-(returning ? 2.4 : 6.5) * dt);
      const lookLerp = 1 - Math.exp(-(returning ? 3.6 : 9) * dt);

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

  private updateShot(shot: CameraShot, dt: number, look: LookDelta, elapsed: number) {
    const rate = 1 - Math.exp(-3 * dt);

    if (!this.initialised) {
      this.shotPosition.copy(shot.position);
      this.smoothed.copy(shot.look);
      this.initialised = true;
      this.shotFresh = false;
    } else {
      // Bắt đầu từ ĐÚNG chỗ camera đang đứng: vào góc máy là bay sang, không nhảy.
      if (this.shotFresh) {
        this.shotPosition.copy(this.camera.position);
        this.shotFresh = false;
      }

      this.shotPosition.lerp(shot.position, rate);
      this.smoothed.lerp(shot.look, rate);
    }

    this.applyShotLook(shot, look);

    const floor =
      terrainHeight(this.camera.position.x, this.camera.position.z) + 0.55;

    if (this.camera.position.y < floor) this.camera.position.y = floor;

    this.camera.fov = dampTowards(this.camera.fov, shot.fov, 3, dt);
    this.camera.updateProjectionMatrix();

    // Rung bằng cách lệch ĐIỂM NGẮM (không lệch vị trí) để nhiễu không tích
    // vào bộ giảm xóc; biên độ tỉ lệ khoảng cách nên góc lệch luôn như nhau.
    const amplitude =
      shot.shake * 0.012 * this.camera.position.distanceTo(this.smoothed);

    this.shake.set(
      Math.sin(elapsed * 37) + Math.sin(elapsed * 23 + 1.3) * 0.5,
      Math.sin(elapsed * 41 + 0.7) + Math.sin(elapsed * 19 + 2.1) * 0.5,
      Math.sin(elapsed * 29 + 2.4),
    ).multiplyScalar(amplitude);

    this.lookTarget.add(this.shake);

    this.camera.lookAt(this.lookTarget);
  }

  /**
   * Cộng phần chuột vào góc máy tự do — đặt `camera.position` và `lookTarget`.
   *
   *  - `look`: quay quanh điểm ngắm (yaw tự do, pitch có trần, lăn chuột để
   *    lại gần/ra xa) — bay vòng quanh con diều mà ngắm.
   *  - `camera`: camera đứng yên, chỉ ngoảnh — có giới hạn như cổ người thật.
   */
  private applyShotLook(shot: CameraShot, look: LookDelta) {
    const offset = this.shotOffset;
    const sensitivity = this.options.sensitivity;
    const orbit = (shot.pivot ?? "look") === "look";

    offset.yaw -= look.x * sensitivity;
    offset.pitch += look.y * sensitivity;

    if (orbit) {
      offset.pitch = clamp(offset.pitch, -0.5, 1);

      if (look.zoom !== 0) {
        offset.zoom = clamp(offset.zoom * (1 + look.zoom * 0.25), 0.45, 2.2);
      }
    } else {
      offset.yaw = clamp(offset.yaw, -1.3, 1.3);
      offset.pitch = clamp(offset.pitch, -0.55, 0.55);
    }

    // Vector từ tâm quay tới đầu bên kia: camera (quay quanh điểm ngắm) hoặc
    // điểm ngắm (ngoảnh từ camera).
    const pivot = orbit ? this.smoothed : this.shotPosition;
    const arm = this.scratch.subVectors(orbit ? this.shotPosition : this.smoothed, pivot);

    const length = arm.length();
    const horizontal = Math.hypot(arm.x, arm.z);
    const heading = Math.atan2(arm.x, arm.z) + offset.yaw;
    // Kéo chuột xuống: quay quanh diều thì camera lên cao; ngoảnh đầu thì cúi xuống.
    const elevation = clamp(
      Math.atan2(arm.y, horizontal) + (orbit ? offset.pitch : -offset.pitch),
      -1.45,
      1.45,
    );
    const reach = length * (orbit ? offset.zoom : 1);

    arm.set(
      Math.sin(heading) * Math.cos(elevation) * reach,
      Math.sin(elevation) * reach,
      Math.cos(heading) * Math.cos(elevation) * reach,
    );

    if (orbit) {
      this.camera.position.copy(this.smoothed).add(arm);
      this.lookTarget.copy(this.smoothed);
    } else {
      this.camera.position.copy(this.shotPosition);
      this.lookTarget.copy(this.shotPosition).add(arm);
    }
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
