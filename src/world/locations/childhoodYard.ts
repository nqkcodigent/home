import * as THREE from "three";

import { Character } from "../character/Character";
import { SKY_PRESETS, Sky } from "../world/Sky";
import { Terrain } from "../world/Terrain";
import { rotateObstacles } from "../physics/collide";
import { YARD } from "../world/layout";
import {
  BENCH_SEAT_HEIGHT,
  HOUSE,
  HOUSE_PARTS,
  WINDOW_SEAT,
  createBellTower,
  createBench,
  createBush,
  createClothesLine,
  createDoorObstacles,
  createFence,
  createHaystack,
  createHouse,
  createHouseObstacles,
  createPond,
  createRock,
  createTree,
  createWell,
  houseGroundHeight,
} from "../world/Props";
import { createKiteModel } from "../activities/kite/Kite";
import { damp } from "../character/motion";
import { terrainHeight } from "../terrain/heightfield";

import type { AudioSlot } from "../audio/HowlerAudio";
import type { Seat } from "../character/Character";
import type { Obstacle } from "../physics/collide";
import type { Spot } from "../interact/spots";
import type { LocationRuntime, WorldServices } from "./types";

/**
 * Thế giới của trò chơi — một ngôi nhà và khoảng sân vườn quanh nó.
 *
 * Không có cốt truyện: người chơi tỉnh dậy TRONG nhà, cửa đang đóng. Đi quanh
 * phòng, chạm vào đồ vật, rồi mở cửa là sân vườn hiện ra — cùng một scene,
 * không chuyển cảnh, không tải lại. Bố cục vẫn "kể chuyện" thay lời: nhà ở
 * phía bắc, cổng ở phía nam, lối đất nối hai đầu; giếng, gốc cây già, cái ao
 * và bãi cỏ thả diều nằm ở bốn hướng để người chơi tự đi tìm.
 */

/**
 * Độ nghiêng của ngôi nhà so với trục sân (radian).
 *
 * Nhỏ tới mức chỉ để ngôi nhà "ngồi" tự nhiên hơn một chút — nhưng nó là lý do
 * vật cản, mặt sàn và mọi điểm tương tác trong nhà PHẢI đi qua phép xoay này.
 *
 * Khai báo NGAY ĐẦU file: `INDOOR_SPOTS` gọi `housePoint()` lúc module khởi
 * tạo, mà đọc hằng số trước khi gán là lỗi TDZ — trắng màn hình khi vào game.
 */
export const HOUSE_ROTATION = 0.06;

/** Một điểm trong toạ độ CỤC BỘ của nhà → toạ độ sân.
 *
 * Cùng một phép biến đổi với `rotateObstacles` (đã có test đối chiếu với
 * three.js): nhà được đặt xuống sân rồi xoay `HOUSE_ROTATION`, nên đồ đạc
 * bên trong cũng phải đi qua phép xoay đó.
 */
function housePoint(localX: number, localZ: number): { x: number; z: number } {
  const cos = Math.cos(HOUSE_ROTATION);
  const sin = Math.sin(HOUSE_ROTATION);

  return {
    x: YARD.house.x + localX * cos + localZ * sin,
    z: YARD.house.z - localX * sin + localZ * cos,
  };
}

/** Ngược lại: toạ độ sân → toạ độ cục bộ của nhà. */
function houseLocal(x: number, z: number): { x: number; z: number } {
  const cos = Math.cos(HOUSE_ROTATION);
  const sin = Math.sin(HOUSE_ROTATION);
  const dx = x - YARD.house.x;
  const dz = z - YARD.house.z;

  return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
}

/**
 * Độ cao mặt nền ở bất kỳ đâu trong thế giới: sàn nhà, bó hè, bậc thềm, hoặc
 * mặt đất. Nhân vật đứng trên đúng hàm này — đây là chỗ sửa lỗi "mất chân".
 */
export function worldGroundHeight(x: number, z: number): number {
  const local = houseLocal(x, z);

  return houseGroundHeight(local.x, local.z) ?? terrainHeight(x, z);
}

/**
 * Chỗ ngồi kèm khung hình ngắm cảnh: camera đứng sau-chéo người ngồi (`back`,
 * `side`), cao `eye` trên mặt ghế, nhìn về phía trước `ahead` mét và cao
 * `lookUp` trên mặt ghế.
 */
export interface SeatView extends Seat {
  back: number;
  side: number;
  eye: number;
  ahead: number;
  lookUp: number;
  fov: number;
}

/** Dữ liệu đi kèm đồ vật: tiếng khi chạm, hoặc một chỗ để ngồi. */
export interface SpotData {
  sfx?: AudioSlot;
  seat?: SeatView;
}

const DOOR_CENTER = (HOUSE.doorFrom + HOUSE.doorTo) / 2;

/**
 * Đồ vật trong nhà — chạm vào thì chúng phản ứng, không có lời thoại nào.
 *
 * Cánh cửa với tới được từ cả hai phía (bán kính phủ qua tường), nên người
 * chơi đứng trong nhà mở ra, đứng ngoài sân cũng đóng lại được.
 */
const INDOOR_SPOTS: Spot<SpotData>[] = [
  {
    id: "door",
    ...housePoint(DOOR_CENTER, HOUSE.depth / 2),
    radius: 1.7,
    label: "Cánh cửa",
    payload: { sfx: "doorOpen" },
  },
  {
    id: "lamp",
    ...housePoint(-0.2, 0),
    radius: 1.5,
    label: "Đèn dầu",
  },
  {
    id: "chest",
    ...housePoint(2.5, -1.7),
    radius: 1.3,
    label: "Rương gỗ",
  },
  {
    id: "window",
    ...housePoint(WINDOW_SEAT.x, WINDOW_SEAT.z),
    radius: 1.1,
    label: "Ngồi bên cửa sổ",
    payload: {
      seat: {
        ...housePoint(WINDOW_SEAT.x, WINDOW_SEAT.z),
        // Quay mặt ra cửa sổ hông (+X cục bộ của nhà).
        yaw: Math.PI / 2 + HOUSE_ROTATION,
        height: WINDOW_SEAT.height,
        back: 1.15,
        side: 0.4,
        eye: 0.85,
        ahead: 9,
        lookUp: 1.05,
        fov: 52,
      },
    },
  },
];

/** Băng ghế ngoài sân, quay mặt về phía cái ao. */
const BENCH = { x: 12.6, z: -1.2, yaw: Math.atan2(YARD.pond.x - 12.6, YARD.pond.z + 1.2) };

const BENCH_SPOT: Spot<SpotData> = {
  id: "bench",
  x: BENCH.x,
  z: BENCH.z,
  radius: 1.6,
  label: "Ngồi ngắm ao",
  payload: {
    seat: {
      ...BENCH,
      height: BENCH_SEAT_HEIGHT,
      back: 2.4,
      side: 0.7,
      eye: 1.1,
      ahead: 14,
      lookUp: 0.3,
      fov: 56,
    },
  },
};

/** Chỗ nhân vật tỉnh dậy: giữa nhà, quay mặt về phía cửa. */
const SPAWN = housePoint(-0.9, 1.3);

/**
 * Bãi cỏ trống — chỗ thả diều.
 *
 * Điểm này KHÔNG phải điểm ký ức: nó mở một trò chơi con (`activity: "kite"`),
 * nên không tính vào số hồi ký và chơi lại lần nào cũng được. Chọn chỗ này vì
 * nó trống đúng bốn hướng cần thiết: không cây, không nhà, không dây phơi.
 */
const KITE_SPOT: Spot<SpotData> = {
  id: "kite",
  x: 6,
  z: 11,
  radius: 3.2,
  label: "Thả diều",
  activity: "kite",
};

export function createChildhoodYard(services: WorldServices): LocationRuntime {
  const { engine } = services;

  const group = new THREE.Group();

  group.name = "childhood-yard";

  // ── Trời chiều muộn ─────────────────────────────────────────────────────
  const sky = new Sky(SKY_PRESETS.goldenHour);

  sky.applyFog(engine.scene);
  group.add(sky.group);

  // ── Đất, cỏ, hoa ────────────────────────────────────────────────────────
  const terrain = new Terrain();

  group.add(terrain.group);

  // ── Nhà ─────────────────────────────────────────────────────────────────
  const house = createHouse();

  house.position.set(YARD.house.x, 0, YARD.house.z);
  house.rotation.y = HOUSE_ROTATION;
  group.add(house);

  const door = house.getObjectByName(HOUSE_PARTS.door) as THREE.Object3D;
  const chestLid = house.getObjectByName(HOUSE_PARTS.chestLid) as THREE.Object3D;
  const lampLight = house.getObjectByName(HOUSE_PARTS.lampLight) as THREE.PointLight;
  const lampBulb = house.getObjectByName(HOUSE_PARTS.lampBulb) as THREE.Mesh<
    THREE.BufferGeometry,
    THREE.MeshStandardMaterial
  >;

  const lampPower = lampLight.intensity;
  const bulbGlow = lampBulb.material.emissiveIntensity;

  /** Trạng thái đồ vật — `update()` cho từng món trôi dần về đích. */
  const props = { doorOpen: false, chestOpen: false, lampOn: true };

  // ── Giếng ───────────────────────────────────────────────────────────────
  const well = createWell();

  well.position.set(YARD.well.x, 0, YARD.well.z);
  group.add(well);

  // ── Bóng cây đung đưa ───────────────────────────────────────────────────
  const swayers: { object: THREE.Object3D; phase: number }[] = [];

  YARD.trees.forEach(([x, z], index) => {
    const tree = createTree({ scale: 1 + (index % 3) * 0.16, seed: index * 137 + 5 });

    tree.position.set(x, 0, z);

    // Cây non nhỏ hơn ở vòng ngoài, cây già ở gần sân.
    group.add(tree);
    swayers.push({ object: tree, phase: index * 0.7 });
  });

  // Gốc cây ký ức: to hơn hẳn để nhìn là biết "chỗ này có gì đó".
  const memoryTree = createTree({ scale: 1.7, seed: 99 });

  memoryTree.position.set(YARD.tree.x, 0, YARD.tree.z);
  group.add(memoryTree);
  swayers.push({ object: memoryTree, phase: 1.1 });

  // ── Hàng rào + cổng ─────────────────────────────────────────────────────
  group.add(
    createFence(YARD.fence.from, YARD.fence.to, YARD.fence.z, {
      gapFrom: YARD.fence.gateFrom,
      gapTo: YARD.fence.gateTo,
    }),
  );

  // ── Ao, bụi, đá, rơm ────────────────────────────────────────────────────
  const pond = createPond();

  pond.position.set(YARD.pond.x, 0, YARD.pond.z);
  group.add(pond);

  for (const [x, z] of YARD.bushes) {
    const bush = createBush(1 + ((x + z) % 3) * 0.15);

    bush.position.set(x, 0, z);
    group.add(bush);
  }

  for (const [x, z] of YARD.rocks) {
    const rock = createRock(1.2);

    rock.position.set(x, 0.2, z);
    rock.rotation.y = x;
    group.add(rock);
  }

  for (const [x, z] of YARD.haystacks) {
    const stack = createHaystack();

    stack.position.set(x, 0, z);
    group.add(stack);
  }

  // ── Băng ghế ngắm ao ────────────────────────────────────────────────────
  const bench = createBench();

  bench.position.set(BENCH.x, terrainHeight(BENCH.x, BENCH.z), BENCH.z);
  bench.rotation.y = BENCH.yaw;
  group.add(bench);

  // ── Dây phơi ────────────────────────────────────────────────────────────
  const clothesLine = createClothesLine();

  clothesLine.position.set(YARD.clothesLine.x, 0, YARD.clothesLine.z);
  clothesLine.rotation.y = 0.4;
  group.add(clothesLine);

  // ── Trường làng xa xa ───────────────────────────────────────────────────
  const school = createBellTower();

  school.position.set(YARD.school.x, 0, YARD.school.z);
  school.scale.setScalar(1.6);
  group.add(school);

  // ── Con diều nằm chờ trên cỏ ────────────────────────────────────────────
  //
  // Yêu cầu "thoát ra thì diều phải được reset lại vị trí ban đầu trong sân"
  // chỉ có nghĩa nếu trong sân CÓ một con diều để nhìn thấy. Nên nó nằm đây,
  // đúng chỗ điểm tương tác, và `WorldGame` giấu nó đi trong lúc người chơi
  // đang thả — rồi hiện lại khi ván kết thúc.
  const kite = createKiteModel();

  kite.group.position.set(KITE_SPOT.x, 0.07, KITE_SPOT.z);
  // Nằm sấp trên cỏ, hơi xoay: đúng dáng một con diều vừa được đặt xuống.
  kite.group.rotation.set(-1.32, 0.55, 0.16);
  group.add(kite.group);

  // ── Nhân vật ────────────────────────────────────────────────────────────
  const obstacles = buildColliders(house);

  // Cửa đóng thì khoảng cửa cũng là tường; mở ra thì lối đi thông.
  const doorObstacles = rotateObstacles(createDoorObstacles(), {
    x: house.position.x,
    z: house.position.z,
    rotation: house.rotation.y,
  });

  const bounds = { minX: -46, maxX: 46, minZ: -46, maxZ: 46 };

  const character = new Character({
    variant: "player",
    x: SPAWN.x,
    z: SPAWN.z,
    // Quay mặt ra cửa (mặt tiền nhà là hướng +Z cục bộ).
    yaw: HOUSE_ROTATION,
    obstacles: [...obstacles, ...doorObstacles],
    bounds,
    radius: 0.36,
    groundHeight: worldGroundHeight,
  });

  group.add(character.root);

  const interact = (id: string) => {
    if (id === "door") {
      props.doorOpen = !props.doorOpen;
      character.setObstacles(
        props.doorOpen ? obstacles : [...obstacles, ...doorObstacles],
        bounds,
      );
    } else if (id === "chest") {
      props.chestOpen = !props.chestOpen;
    } else if (id === "lamp") {
      props.lampOn = !props.lampOn;
    }
  };

  return {
    group,
    character,
    // Con diều nằm trong sân — bối cảnh đưa nó ra để `WorldGame` giấu/hiện.
    kite: kite.group,
    spots: [...INDOOR_SPOTS, BENCH_SPOT, KITE_SPOT],
    interact,
    // Diều bay ra đằng sau hàng rào, về phía đông nam — hướng duy nhất trong
    // sân không có mái nhà che khuất tầm nhìn.
    kiteForward: { x: 0.34, z: 0.94 },
    // Cần gạt của camera không bay xuyên nhà: cùng danh sách vật cản với
    // nhân vật, nên hai thứ không bao giờ "thấy" hai thế giới khác nhau.
    colliders: obstacles,
    // Camera sau lưng nhân vật (đang quay mặt ra cửa), đủ gần để không chọc
    // qua tường hậu của căn phòng.
    rig: { distance: 4.2, height: 1.0, pitch: 0.3, yaw: HOUSE_ROTATION + Math.PI },
    badgeHeight: { door: 2.7, lamp: 2.9, chest: 1.6, window: 2.2, bench: 1.8, kite: 2.6 },
    footstepSlot: "childFootsteps",
    update: (dt, elapsed) => {
      sky.update(dt, elapsed);
      sky.focusShadows(character.position.x, character.position.z);

      for (const swayer of swayers) {
        swayer.object.rotation.z = Math.sin(elapsed * 0.75 + swayer.phase) * 0.014;
      }

      // Đồ vật trôi về trạng thái mới theo hàm mũ: cửa quay trên bản lề, nắp
      // rương bật lên, đèn tắt dần — không món nào nhảy trạng thái.
      door.rotation.y = damp(door.rotation.y, props.doorOpen ? -1.95 : 0, 5, dt);
      chestLid.rotation.x = damp(chestLid.rotation.x, props.chestOpen ? -1.1 : 0, 7, dt);
      lampLight.intensity = damp(lampLight.intensity, props.lampOn ? lampPower : 0, 6, dt);
      lampBulb.material.emissiveIntensity = damp(
        lampBulb.material.emissiveIntensity,
        props.lampOn ? bulbGlow : 0,
        6,
        dt,
      );
    },
  };
}

/**
 * Vật cản: mỗi vật là một hình tròn trên mặt phẳng XZ.
 *
 * Hàng rào được rải nhiều hình tròn nhỏ dọc theo chiều dài — người chơi không
 * lách qua khe giữa hai cọc được, mà chi phí thì không đáng kể (chỉ là vài
 * phép hypot mỗi frame).
 *
 * Ngôi nhà cũng theo đúng cách đó, nhưng vì một lý do khác hẳn: nó KHÔNG còn
 * là một khối đặc. Bốn bức tường là bốn dãy cọc, mặt tiền chừa khoảng cửa, nên
 * người chơi vừa không xuyên được tường, vừa đi vào nhà được.
 */
function buildColliders(house: THREE.Group): Obstacle[] {
  const colliders: Obstacle[] = [];

  for (const [x, z] of YARD.trees) {
    colliders.push({ x, z, radius: 0.55 });
  }

  colliders.push({ x: YARD.tree.x, z: YARD.tree.z, radius: 0.8 });

  // Tường nhà: toạ độ cục bộ của `Props`, đưa sang toạ độ sân bằng đúng phép
  // biến đổi đã dùng để ĐẶT ngôi nhà.
  colliders.push(
    ...rotateObstacles(createHouseObstacles(), {
      x: house.position.x,
      z: house.position.z,
      rotation: house.rotation.y,
    }),
  );

  colliders.push({ x: YARD.well.x, z: YARD.well.z, radius: 1.15 });
  colliders.push({ x: YARD.pond.x, z: YARD.pond.z, radius: 3.3 });

  for (const [x, z] of YARD.bushes) colliders.push({ x, z, radius: 0.6 });
  for (const [x, z] of YARD.rocks) colliders.push({ x, z, radius: 0.7 });
  for (const [x, z] of YARD.haystacks) colliders.push({ x, z, radius: 1.1 });

  // Hàng rào: rải cọc chặn dọc theo đường rào, chừa khoảng cổng.
  for (let x = YARD.fence.from; x <= YARD.fence.to; x += 0.55) {
    const inGate =
      x > YARD.fence.gateFrom - 0.4 && x < YARD.fence.gateTo + 0.4;

    if (inGate) continue;

    colliders.push({ x, z: YARD.fence.z, radius: 0.32 });
  }

  colliders.push({
    x: YARD.clothesLine.x,
    z: YARD.clothesLine.z,
    radius: 0.5,
  });

  // Băng ghế: chỉ hai đầu ghế chặn, khoảng giữa chừa cho người ngồi — đứng
  // dậy khỏi ghế thì không bị đẩy văng ra.
  for (const end of [-0.72, 0.72]) {
    colliders.push({
      x: BENCH.x + Math.cos(BENCH.yaw) * end,
      z: BENCH.z - Math.sin(BENCH.yaw) * end,
      radius: 0.26,
    });
  }

  return colliders;
}
