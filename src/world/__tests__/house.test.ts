import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { HOUSE_ROTATION, worldGroundHeight } from "../locations/childhoodYard";
import { rotateObstacles, resolveCollisions } from "../physics/collide";
import {
  HOUSE,
  SIDE_WINDOW,
  WINDOW_SEAT,
  createDoorObstacles,
  createHouseObstacles,
  houseGroundHeight,
} from "../world/Props";
import { seatShot } from "../WorldGame";
import { terrainHeight } from "../terrain/heightfield";
import { YARD } from "../world/layout";

import type { Obstacle } from "../physics/collide";

/**
 * Ngôi nhà — bây giờ là chỗ ĐI VÀO ĐƯỢC, và đây là bộ test chứng minh điều đó
 * bằng số.
 *
 * Yêu cầu của người chơi có hai vế, và hai vế ấy chọi nhau: *đi lại tự do trong
 * nhà* và *không đi xuyên tường*. Một khối hộp đặc thì thoả vế thứ hai mà phá
 * vế thứ nhất; một cái nhà rỗng không có va chạm thì ngược lại. Bộ test này
 * chỉ kiểm tra đúng ranh giới đó — trong nhà thì tới được, tường thì chặn — và
 * kiểm tra nó ở TOẠ ĐỘ SÂN, qua đúng phép xoay mà bối cảnh dùng để đặt nhà.
 */

const CHAR_RADIUS = 0.36;

const obstacles: Obstacle[] = rotateObstacles(createHouseObstacles(), {
  x: YARD.house.x,
  z: YARD.house.z,
  rotation: HOUSE_ROTATION,
});

/** Một điểm trong toạ độ CỤC BỘ của nhà → toạ độ sân. */
function toWorld(localX: number, localZ: number) {
  const cos = Math.cos(HOUSE_ROTATION);
  const sin = Math.sin(HOUSE_ROTATION);

  return {
    x: YARD.house.x + localX * cos + localZ * sin,
    z: YARD.house.z - localX * sin + localZ * cos,
  };
}

/** Ngược lại: toạ độ sân → toạ độ cục bộ của nhà. */
function toLocal(worldX: number, worldZ: number) {
  const dx = worldX - YARD.house.x;
  const dz = worldZ - YARD.house.z;

  const cos = Math.cos(-HOUSE_ROTATION);
  const sin = Math.sin(-HOUSE_ROTATION);

  return { x: dx * cos + dz * sin, z: -dx * sin + dz * cos };
}

/**
 * Đi thẳng từ `from` tới `to`, mỗi bước đều bị giải va chạm như trong game.
 * Trả về chỗ dừng thật — chính là thứ người chơi cảm nhận được.
 */
function walk(from: { x: number; z: number }, to: { x: number; z: number }, steps = 600) {
  let x = from.x;
  let z = from.z;

  for (let index = 0; index < steps; index += 1) {
    x += (to.x - from.x) / steps;
    z += (to.z - from.z) / steps;

    const resolved = resolveCollisions(x, z, CHAR_RADIUS, obstacles);

    x = resolved.x;
    z = resolved.z;
  }

  return { x, z };
}

describe("nhà — vào được và không xuyên được", () => {
  it("khoảng cửa đủ rộng cho một người", () => {
    const gap = HOUSE.doorTo - HOUSE.doorFrom;

    expect(gap).toBeGreaterThan(CHAR_RADIUS * 2 + 0.3);
  });

  it("giữa nhà là chỗ ĐỨNG ĐƯỢC — không có vật cản nào đẩy người chơi ra", () => {
    const center = toWorld(0, 0);
    const resolved = resolveCollisions(center.x, center.z, CHAR_RADIUS, obstacles);

    expect(resolved.contacts).toBe(0);
    expect(resolved.x).toBeCloseTo(center.x, 6);
    expect(resolved.z).toBeCloseTo(center.z, 6);
  });

  it("đi từ ngoài sân qua cửa vào được trong nhà", () => {
    const start = toWorld((HOUSE.doorFrom + HOUSE.doorTo) / 2, HOUSE.depth / 2 + 4);
    const stop = walk(start, toWorld((HOUSE.doorFrom + HOUSE.doorTo) / 2, 0));

    const local = toLocal(stop.x, stop.z);

    // Đã vào hẳn bên trong: qua khỏi mặt tiền (z = 3,1) và tới gần giữa nhà.
    expect(local.z).toBeLessThan(HOUSE.depth / 2 - 0.8);
    expect(Math.hypot(local.x, local.z)).toBeLessThan(3);
  });

  it("tường hậu CHẶN — đi thẳng vào tường không ra được sau nhà", () => {
    const stop = walk(toWorld(-1.4, 0), toWorld(-1.4, -12));
    const local = toLocal(stop.x, stop.z);

    expect(local.z).toBeGreaterThan(-HOUSE.depth / 2);
  });

  it("mặt tiền ngoài khoảng cửa cũng chặn", () => {
    const stop = walk(toWorld(2, 6), toWorld(2, 0));
    const local = toLocal(stop.x, stop.z);

    expect(local.z).toBeGreaterThan(HOUSE.depth / 2);
  });

  it("hai tường hông chặn", () => {
    for (const direction of [-1, 1]) {
      const stop = walk(toWorld(0, 0), toWorld(direction * 12, 0), 900);

      expect(toLocal(stop.x, stop.z).x * direction).toBeLessThan(HOUSE.width / 2);
    }
  });

  it("vật cản của nhà khớp ĐÚNG phép biến đổi mà three.js dùng để đặt nhà", () => {
    // Chép tay toạ độ đã xoay là lỗi chờ sẵn — nên chỗ này đối chiếu với chính
    // three.js thay vì với công thức viết lại lần thứ hai.
    const house = new THREE.Object3D();

    house.position.set(YARD.house.x, 0, YARD.house.z);
    house.rotation.y = HOUSE_ROTATION;
    house.updateMatrixWorld();

    const sample: Obstacle[] = [
      { x: 1.2, z: -0.4, radius: 0.22 },
      { x: -3.6, z: 3.1, radius: 0.22 },
    ];

    const moved = rotateObstacles(sample, {
      x: house.position.x,
      z: house.position.z,
      rotation: house.rotation.y,
    });

    moved.forEach((circle, index) => {
      const expected = house.localToWorld(
        new THREE.Vector3(sample[index].x, 0, sample[index].z),
      );

      expect(circle.x).toBeCloseTo(expected.x, 6);
      expect(circle.z).toBeCloseTo(expected.z, 6);
      expect(circle.radius).toBe(sample[index].radius);
    });
  });
});

describe("nhà — cánh cửa đóng/mở", () => {
  const doorObstacles = rotateObstacles(createDoorObstacles(), {
    x: YARD.house.x,
    z: YARD.house.z,
    rotation: HOUSE_ROTATION,
  });

  const doorCenter = (HOUSE.doorFrom + HOUSE.doorTo) / 2;

  /** Như `walk`, nhưng với một danh sách vật cản cho trước. */
  function walkWith(list: Obstacle[], from: { x: number; z: number }, to: { x: number; z: number }) {
    let { x, z } = from;

    for (let index = 0; index < 600; index += 1) {
      x += (to.x - from.x) / 600;
      z += (to.z - from.z) / 600;

      const resolved = resolveCollisions(x, z, CHAR_RADIUS, list);

      x = resolved.x;
      z = resolved.z;
    }

    return toLocal(x, z);
  }

  it("cửa ĐÓNG thì trong nhà không ra được sân", () => {
    const stop = walkWith(
      [...obstacles, ...doorObstacles],
      toWorld(doorCenter, 0),
      toWorld(doorCenter, HOUSE.depth / 2 + 4),
    );

    expect(stop.z).toBeLessThan(HOUSE.depth / 2);
  });

  it("cửa MỞ thì đi thẳng ra sân", () => {
    const stop = walkWith(
      obstacles,
      toWorld(doorCenter, 0),
      toWorld(doorCenter, HOUSE.depth / 2 + 4),
    );

    expect(stop.z).toBeGreaterThan(HOUSE.depth / 2 + 2);
  });
});

describe("nhà — mặt nền (lỗi mất chân)", () => {
  it("trong nhà, chân đứng trên MẶT SÀN chứ không phải mặt đất", () => {
    const center = toWorld(0, 0);

    expect(worldGroundHeight(center.x, center.z)).toBe(HOUSE.floorY);
    expect(HOUSE.floorY).toBeGreaterThan(terrainHeight(center.x, center.z) + 0.2);
  });

  it("sàn gỗ nằm TRÊN bó hè — mặt nhìn thấy trong nhà đúng là mặt chân đứng", () => {
    expect(HOUSE.floorY).toBeGreaterThanOrEqual(HOUSE.plinthY);
  });

  it("đi từ sân vào nhà: đất → bậc thềm → bó hè → sàn, mỗi bậc không quá 0,25 m", () => {
    let previous = 0;

    for (let z = HOUSE.depth / 2 + 2; z >= 0; z -= 0.05) {
      const local = houseGroundHeight(doorCenterLocal(), z) ?? 0;

      expect(Math.abs(local - previous)).toBeLessThanOrEqual(0.25);
      previous = local;
    }

    expect(previous).toBe(HOUSE.floorY);
  });

  it("ra xa nhà thì trả về mặt đất", () => {
    const far = toWorld(0, HOUSE.depth / 2 + 6);

    expect(worldGroundHeight(far.x, far.z)).toBe(terrainHeight(far.x, far.z));
  });

  function doorCenterLocal() {
    return (HOUSE.doorFrom + HOUSE.doorTo) / 2;
  }
});

describe("nhà — ngồi bên cửa sổ", () => {
  it("khung ngắm cảnh nhìn XUYÊN ô cửa sổ hông, không đâm vào tường", () => {
    const seat = {
      ...toWorld(WINDOW_SEAT.x, WINDOW_SEAT.z),
      yaw: Math.PI / 2 + HOUSE_ROTATION,
      height: WINDOW_SEAT.height,
      back: 1.15,
      side: 0.4,
      eye: 0.85,
      ahead: 9,
      lookUp: 1.05,
      fov: 52,
    };

    const shot = seatShot(seat);

    // Tia nhìn từ camera tới điểm ngắm cắt mặt tường hông (x = rộng/2 cục bộ)
    // ở đúng trong khung ô cửa sổ.
    const from = toLocal(shot.position.x, shot.position.z);
    const to = toLocal(shot.look.x, shot.look.z);
    const wallX = HOUSE.width / 2;
    const t = (wallX - from.x) / (to.x - from.x);

    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);

    const z = from.z + (to.z - from.z) * t;
    const y = shot.position.y + (shot.look.y - shot.position.y) * t;

    expect(Math.abs(z - SIDE_WINDOW.z)).toBeLessThan(SIDE_WINDOW.width / 2);
    expect(Math.abs(y - SIDE_WINDOW.y)).toBeLessThan(SIDE_WINDOW.height / 2);
  });
});
