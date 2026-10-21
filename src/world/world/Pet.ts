import * as THREE from "three";

import { resolveCollisions } from "../physics/collide";
import { dampAngle } from "../character/motion";

import type { Obstacle } from "../physics/collide";

/**
 * Con chó vàng — bạn đi theo, không nhiệm vụ, không chỉ số.
 *
 * Luật đi theo nằm trong một hàm thuần (`stepPet`) để test chạy được:
 *  - Đứng cách người chơi ~1,4 m; cách xa hơn 2,3 m mới đứng dậy chạy theo
 *    (khoảng trễ để nó không nhấp nhổm theo từng bước chân).
 *  - Đi bằng CÙNG hệ va chạm với nhân vật: vướng tường, vướng ao. Đẩy mãi mà
 *    không tới (người chơi đang bơi giữa ao, đang ở sau bức tường) thì ngồi đợi
 *    ở đó một lúc rồi mới thử lại — đúng dáng con chó chờ chủ trên bờ ao.
 *  - Lạc quá xa (bị tường kẹt, người chơi chạy mất hút) thì lặng lẽ xuất hiện
 *    lại sau lưng chủ: chó thật cũng tìm được đường về.
 */

export interface PetState {
  x: number;
  z: number;
  yaw: number;
  speed: number;
  /** Pha bước chân (vòng 0 … 1) */
  gait: number;
  /** Đã đứng yên bao lâu (giây) — đủ lâu thì ngồi xuống */
  still: number;
  /** Còn ngồi đợi bao lâu nữa mới thử đi tiếp (giây) — sau khi bị vướng */
  wait: number;
  /** Bị chặn liên tục bao lâu (giây) */
  stuck: number;
}

export const PET_RADIUS = 0.25;
const HEEL = 1.4;
const START = 2.3;
const TROT = 2.8;
const RUN = 5.2;
const ACCEL = 10;
const TELEPORT = 16;
const STRIDES_PER_METRE = 1.7;

export function createPetState(x: number, z: number): PetState {
  return { x, z, yaw: 0, speed: 0, gait: 0, still: 0, wait: 0, stuck: 0 };
}

export function stepPet(
  state: PetState,
  player: { x: number; z: number },
  dt: number,
  obstacles: readonly Obstacle[],
): PetState {
  const dx = player.x - state.x;
  const dz = player.z - state.z;
  const distance = Math.hypot(dx, dz);

  if (distance > TELEPORT) {
    const back = resolveCollisions(
      player.x - (dx / distance) * HEEL,
      player.z - (dz / distance) * HEEL,
      PET_RADIUS,
      obstacles,
    );

    return { ...createPetState(back.x, back.z), yaw: Math.atan2(dx, dz) };
  }

  const wait = Math.max(0, state.wait - dt);
  const wants = wait === 0 && distance > (state.speed > 0.05 ? HEEL : START);
  const target = wants ? (distance > 6 ? RUN : TROT) : 0;
  const delta = target - state.speed;
  const speed = state.speed + Math.sign(delta) * Math.min(Math.abs(delta), ACCEL * dt);
  const yaw = wants ? dampAngle(state.yaw, Math.atan2(dx, dz), 8, dt) : state.yaw;

  const resolved = resolveCollisions(
    state.x + Math.sin(yaw) * speed * dt,
    state.z + Math.cos(yaw) * speed * dt,
    PET_RADIUS,
    obstacles,
  );
  const travelled = Math.hypot(resolved.x - state.x, resolved.z - state.z);

  // Muốn đi mà gần như không nhích được (≤ 30 %) ⇒ đang vướng.
  const stuck = wants && speed > 0.5 && travelled < speed * dt * 0.3 ? state.stuck + dt : 0;
  const giveUp = stuck > 0.4;

  return {
    x: resolved.x,
    z: resolved.z,
    yaw,
    speed: giveUp ? 0 : dt > 0 ? Math.min(speed, travelled / dt) : speed,
    gait: (state.gait + travelled * STRIDES_PER_METRE) % 1,
    still: travelled < 0.002 ? state.still + dt : 0,
    wait: giveUp ? 2 : wait,
    stuck: giveUp ? 0 : stuck,
  };
}

export interface PetOptions {
  x: number;
  z: number;
  obstacles: readonly Obstacle[];
  ground: (x: number, z: number) => number;
}

/** Hình con chó + lớp hoạt hoạ. Mọi luật đi lại ở `stepPet`. Dỡ cùng nhóm của bối cảnh. */
export class Pet {
  readonly group = new THREE.Group();

  private state: PetState;

  private readonly options: PetOptions;

  private obstacles: readonly Obstacle[];

  private readonly body = new THREE.Group();

  private readonly head = new THREE.Group();

  private readonly tail = new THREE.Group();

  private readonly legs: THREE.Group[] = [];

  private sit = 0;

  constructor(options: PetOptions) {
    this.options = options;
    this.obstacles = options.obstacles;
    this.state = createPetState(options.x, options.z);
    this.group.name = "pet";
    this.build();
  }

  get position(): { x: number; z: number } {
    return this.state;
  }

  update(dt: number, elapsed: number, player: { x: number; z: number }) {
    const step = Math.min(dt, 0.1);

    this.state = stepPet(this.state, player, step, this.obstacles);

    const { x, z, speed, gait, still } = this.state;
    const swing = Math.sin(gait * Math.PI * 2) * Math.min(1, speed / 2) * 0.7;

    this.group.position.set(x, this.options.ground(x, z), z);
    this.group.rotation.y = this.state.yaw;

    // Đứng yên hơn một giây thì ngồi xuống; đi là đứng dậy ngay.
    this.sit += ((still > 1.2 ? 1 : 0) - this.sit) * Math.min(1, step * (still > 1.2 ? 3 : 10));

    // Chân trước/sau chéo pha nhau — dáng nước kiệu.
    this.legs[0].rotation.x = swing;
    this.legs[1].rotation.x = -swing;
    // Ngồi: chân sau gập ra trước dưới mông (khớp hạ thấp theo), không duỗi ra sau.
    this.legs[2].rotation.x = -swing - this.sit * 1.2;
    this.legs[3].rotation.x = swing - this.sit * 1.2;
    this.legs[2].position.y = this.legs[3].position.y = 0.24 - this.sit * 0.12;

    // Ngồi: chồm ngực lên, mông hạ xuống.
    this.body.rotation.x = -this.sit * 0.35;
    this.body.position.y = 0.32 - this.sit * 0.06 + Math.abs(swing) * 0.03;

    // Đầu luôn ngoái về phía chủ; đuôi vẫy nhanh khi đứng gần chủ.
    const toPlayer = Math.atan2(player.x - x, player.z - z);
    const near = Math.hypot(player.x - x, player.z - z) < 2.6;

    this.head.rotation.y = THREE.MathUtils.clamp(
      Math.atan2(Math.sin(toPlayer - this.state.yaw), Math.cos(toPlayer - this.state.yaw)),
      -1,
      1,
    );
    this.head.rotation.x = this.sit * 0.45;
    this.tail.rotation.y = Math.sin(elapsed * (near ? 16 : 6)) * (near ? 0.7 : 0.3);
  }

  /** Cửa nhà đóng/mở thì danh sách vật cản đổi — như `Character.setObstacles`. */
  setObstacles(obstacles: readonly Obstacle[]) {
    this.obstacles = obstacles;
  }

  private build() {
    const fur = new THREE.MeshStandardMaterial({ color: 0xd9a35a, roughness: 0.95 });
    const light = new THREE.MeshStandardMaterial({ color: 0xf3dcb4, roughness: 0.95 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a2a20, roughness: 0.5 });

    const ball = (
      radius: number,
      material: THREE.Material,
      at: [number, number, number],
      stretch: [number, number, number] = [1, 1, 1],
    ) => {
      const part = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12), material);

      part.position.set(...at);
      part.scale.set(...stretch);
      part.castShadow = true;

      return part;
    };

    // Thân xoay quanh hông sau, để "ngồi" là chỉ cần chồm phần trước lên.
    // Chó vàng ta: mình thon tròn, ngực và bụng màu kem.
    this.body.position.set(0, 0.32, -0.16);
    this.body.add(ball(0.15, fur, [0, 0, 0.2], [0.85, 0.85, 1.9]));
    this.body.add(ball(0.11, light, [0, -0.04, 0.34], [0.9, 0.95, 1.1]));

    this.head.position.set(0, 0.14, 0.5);
    this.head.add(ball(0.12, fur, [0, 0.02, 0], [1, 0.95, 1]));
    // Mõm thuôn, mũi đen bóng, hai mắt tròn.
    this.head.add(ball(0.065, light, [0, -0.03, 0.12], [0.95, 0.8, 1.3]));
    this.head.add(ball(0.025, dark, [0, -0.005, 0.2]));

    for (const side of [-1, 1]) {
      this.head.add(ball(0.018, dark, [side * 0.055, 0.05, 0.1]));

      // Tai cụp mềm — rủ xuống hai bên đầu.
      const ear = ball(0.05, fur, [side * 0.1, 0.06, -0.01], [0.45, 1.2, 0.8]);

      ear.rotation.z = side * 0.5;
      this.head.add(ear);
    }

    this.body.add(this.head);

    this.tail.position.set(0, 0.06, -0.06);
    this.tail.rotation.x = -0.7;

    const tailMesh = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.2, 4, 8), fur);

    tailMesh.rotation.x = Math.PI / 2;
    tailMesh.position.z = -0.12;
    tailMesh.castShadow = true;
    this.tail.add(tailMesh);
    this.body.add(this.tail);

    this.group.add(this.body);

    // Bốn chân: trước trái, trước phải, sau trái, sau phải. Khớp ở vai/hông.
    for (const [x, z] of [
      [-0.08, 0.22],
      [0.08, 0.22],
      [-0.08, -0.16],
      [0.08, -0.16],
    ] as const) {
      const leg = new THREE.Group();
      const shank = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.16, 4, 8), fur);

      shank.position.y = -0.11;
      shank.castShadow = true;
      leg.position.set(x, 0.24, z);
      leg.add(shank, ball(0.04, light, [0, -0.215, 0.015], [1, 0.6, 1.3]));

      this.legs.push(leg);
      this.group.add(leg);
    }
  }
}
