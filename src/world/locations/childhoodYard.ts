import * as THREE from "three";

import { Character } from "../character/Character";
import { SKY_PRESETS, Sky } from "../world/Sky";
import { Terrain } from "../world/Terrain";
import { rotateObstacles } from "../physics/collide";
import { GROVE_TREES, OUTER_TREES, YARD } from "../world/layout";
import {
  BENCH_SEAT_HEIGHT,
  HOUSE,
  CHIMNEY_TOP,
  HOUSE_PARTS,
  STUMP_HEIGHT,
  WINDOW_SEAT,
  createBellTower,
  createBench,
  createBamboo,
  createBanana,
  createBush,
  createClothesLine,
  createDoorObstacles,
  createFence,
  createHaystack,
  createHouse,
  createHouseObstacles,
  createPond,
  createRock,
  createStump,
  createTree,
  createWell,
  houseGroundHeight,
  POND_RADIUS,
} from "../world/Props";
import { createKiteModel } from "../activities/kite/Kite";
import { createShuttlecock } from "../activities/shuttlecock/Shuttlecock";
import { Creatures } from "../world/Creatures";
import { Pet } from "../world/Pet";
import { Landmarks } from "../world/Landmarks";
import { damp } from "../character/motion";
import { terrainHeight } from "../terrain/heightfield";
import { nookItem } from "../progress/nooks";
import { KEEPSAKE_LIST } from "../progress/keepsakes";

import type { AudioSlot } from "../audio/HowlerAudio";
import type { KiteTuning } from "../activities/kite/model";
import type { Seat } from "../character/Character";
import type { Vec3 } from "../world/Creatures";
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
/** Trong nhà là sàn gỗ (tiếng giày cộp), ngoài sân là cỏ (bước chân trẻ con). */
export function footstepAt(x: number, z: number): AudioSlot {
  const local = houseLocal(x, z);

  return houseGroundHeight(local.x, local.z) === undefined ? "childFootsteps" : "footsteps";
}

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
  /** Chỗ ngắm cảnh trong Sổ (`NOOK_LIST`) — ngồi đủ lâu thì ghi một dòng */
  nook?: string;
  back: number;
  side: number;
  eye: number;
  ahead: number;
  lookUp: number;
  fov: number;
}

/** Dữ liệu đi kèm đồ vật: tiếng khi chạm, một chỗ để ngồi, hoặc Sổ hồi ký. */
export interface SpotData {
  sfx?: AudioSlot;
  seat?: SeatView;
  /**
   * Chạm vào thì mở Sổ hồi ký (Rương gỗ trong nhà).
   *
   * Cờ này KHÔNG phải "mở một bảng menu": nó nói rằng đồ vật này là chỗ để
   * đọc sổ. Nhờ nó mà sổ vẫn là một thứ trong thế giới — phải đi tới mới mở
   * được — chứ không phải một nút trên HUD.
   */
  journal?: boolean;
  /** Bãi thả diều riêng: hướng bay ra chỗ trống, và gió của chỗ đó */
  kite?: {
    forward: { x: number; z: number };
    wind: Pick<KiteTuning, "windBase" | "windSwing">;
  };
}

const DOOR_CENTER = (HOUSE.doorFrom + HOUSE.doorTo) / 2;

/**
 * Chỗ đặt HÔNG khi ngồi: lùi từ mép trước mặt ghế vào 0,1 m. Chân chibi rất
 * ngắn (đùi 0,135 m), nên hông đặt giữa ghế là đầu gối còn nằm trong lòng ghế
 * — ống chân đâm xuyên mặt ghế, trông như quỳ. Đặt thế này thì gối vừa nhô
 * qua mép và cẳng chân buông thõng xuống trước ghế.
 */
function hipOnSeat(x: number, z: number, yaw: number, frontEdge: number) {
  const ahead = frontEdge - 0.1;

  return { x: x + Math.sin(yaw) * ahead, z: z + Math.cos(yaw) * ahead };
}

// Ngồi chếch ~17° về phía cái ao: nhìn thẳng ra cửa sổ thì chỉ thấy tán cây.
const WINDOW_YAW = Math.PI / 2 + HOUSE_ROTATION - 0.3;

/**
 * Đồ vật trong nhà — chạm vào thì chúng phản ứng, không có lời thoại nào.
 *
 * Cánh cửa với tới được từ cả hai phía (bán kính phủ qua tường), nên người
 * chơi đứng trong nhà mở ra, đứng ngoài sân cũng đóng lại được.
 */
/**
 * Khung ngắm cảnh bên cửa sổ: lùi ra sau và cao hơn đầu, chếch qua vai, để
 * đứa trẻ chỉ là một dáng lưng nhỏ ở góc khung còn ô cửa sổ (và cái ao sau
 * nó) chiếm giữa khung. Bản cũ đặt camera sát gáy — cái đầu che nửa màn hình.
 */
export const WINDOW_VIEW = {
  back: 2.2,
  side: 0.5,
  eye: 1.6,
  ahead: 12,
  lookUp: 0.9,
  fov: 50,
} as const;

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
    // Nhãn nói việc người chơi SẮP làm, không nói tên món đồ: "Rương gỗ" là
    // một câu đố, còn "Sổ hồi ký" là chỗ để đọc lại buổi chiều của mình.
    label: "Sổ hồi ký",
    payload: { journal: true },
  },
  {
    id: "window",
    ...housePoint(WINDOW_SEAT.x, WINDOW_SEAT.z),
    radius: 1.1,
    label: "Ngồi bên cửa sổ",
    payload: {
      seat: {
        // Ghế đẩu mặt 0,34 m: mép trước cách tâm 0,17 m.
        ...hipOnSeat(
          housePoint(WINDOW_SEAT.x, WINDOW_SEAT.z).x,
          housePoint(WINDOW_SEAT.x, WINDOW_SEAT.z).z,
          WINDOW_YAW,
          0.17,
        ),
        // Quay mặt ra cửa sổ hông (+X cục bộ của nhà), chếch về phía ao.
        yaw: WINDOW_YAW,
        height: WINDOW_SEAT.height,
        nook: "window",
        ...WINDOW_VIEW,
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
      // Mặt ghế băng: nan trước nhô tới +0,2 m.
      ...hipOnSeat(BENCH.x, BENCH.z, BENCH.yaw, 0.2),
      height: BENCH_SEAT_HEIGHT,
      nook: "bench",
      back: 2.4,
      side: 0.7,
      eye: 1.1,
      ahead: 14,
      lookUp: 0.3,
      fov: 56,
    },
  },
};

/**
 * Gốc cây cụt rải quanh làng — mỗi gốc là một chỗ ngắm cảnh trong Sổ (xem
 * `NOOK_LIST`). Không gốc nào có vật cản: ngồi xong đứng dậy không bị đẩy giật.
 * `yaw` là hướng mặt khi ngồi — chỗ nào cũng quay về một khung cảnh đáng xem.
 */
const NOOK_SEATS = [
  // Tựa lưng vào gốc đa, nhìn ra giữa sân.
  { id: "banyan", x: -12.2, z: 6.5, yaw: Math.PI / 2 },
  { id: "haystack", x: -9.5, z: -11.3, yaw: 0.35 },
  // Ngoài cổng, nhìn ra con đường làng.
  { id: "gate", x: 3.2, z: 19.4, yaw: 0.2 },
  // Bên kia ao, nhìn ngang mặt nước về phía nhà.
  { id: "pond-east", x: 21.5, z: -5.5, yaw: -Math.PI / 2 - 0.25 },
  { id: "slope", x: -30, z: 32, yaw: Math.atan2(30, -32) },
  { id: "tower", x: 38.5, z: -32.5, yaw: Math.atan2(-38.5, 32.5) },
  // Đỉnh đồi gió: cả làng ở dưới chân.
  { id: "hill", x: 16, z: -45.5, yaw: Math.atan2(-16, 45.5) },
] as const;

const NOOK_SPOTS: Spot<SpotData>[] = NOOK_SEATS.map(({ id, x, z, yaw }) => ({
  id: `nook-${id}`,
  x,
  z,
  radius: 1.4,
  label: `Ngồi · ${nookItem(id)?.label ?? id}`,
  payload: {
    seat: {
      // Mặt gốc cây bán kính 0,27 m.
      ...hipOnSeat(x, z, yaw, 0.27),
      yaw,
      height: terrainHeight(x, z) + STUMP_HEIGHT,
      nook: id,
      back: 2.3,
      side: 0.6,
      eye: 1.0,
      ahead: 18,
      lookUp: 0.4,
      fov: 58,
    },
  },
}));

/**
 * Bãi diều trên đồi gió — đồi cao nhất trong vùng đi được (~3,5 m). Gió ở
 * đây mạnh và đều hơn ở sân (`windBase` 0.55 → 0.72, `windSwing` 0.3 → 0.2),
 * và diều bay về phía bắc, ra khỏi làng: thả diều trên đồi khác hẳn trong sân.
 */
const HILL_KITE_SPOT: Spot<SpotData> = {
  id: "hill-kite",
  x: 19,
  z: -49,
  radius: 3,
  label: "Thả diều trên đồi",
  activity: "kite",
  payload: {
    kite: {
      forward: { x: 0.3, z: -0.954 },
      wind: { windBase: 0.72, windSwing: 0.2 },
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

/**
 * Bờ ao phía tây — điểm duy nhất bấm E được để xuống nước.
 *
 * Phải nằm NGOÀI vật cản của ao (bán kính `POND_RADIUS` + một chút), vì người
 * chơi không đi trên mặt nước được: đứng ngoài mép rồi bấm E, ván bơi trượt
 * người xuống từ đúng chỗ này.
 */
const SWIM_SPOT: Spot<SpotData> = {
  id: "swim",
  x: YARD.pond.x - (POND_RADIUS + 0.7),
  z: YARD.pond.z,
  radius: 2.2,
  label: "Xuống ao bơi",
  activity: "swim",
};

/**
 * Bãi đá cầu — khoảng cỏ trống phía tây sân.
 *
 * Cả ván là một cuộc chạy tới chỗ quả cầu rơi, nên chỗ này phải rộng: không
 * bụi nào trong hai mét, không đá nào trong ba mét, và cách lối đi đủ xa để
 * quả cầu đừng rơi xuống đường.
 */
const SHUTTLE_SPOT: Spot<SpotData> = {
  id: "shuttlecock",
  x: -6,
  z: 6,
  // Phủ tới chỗ cậu bạn đứng: đi lại gần bạn là thấy nhãn rủ đá cầu.
  radius: 3.2,
  label: "Đá cầu với bạn",
  activity: "shuttlecock",
};

/**
 * Chỗ đậu của chim cành: cột hàng rào, miệng giếng, dây phơi.
 *
 * Tính bằng công thức từ chính toạ độ của `YARD` chứ không chép lại số: chim
 * phải đậu ĐÚNG trên mặt cột (cao 0,95 m) và ĐÚNG trên sợi dây phơi (cao 1,85
 * m). Lệch nửa mét là con chim lơ lửng giữa không trung, và mắt người chơi
 * nhận ra ngay.
 */
const PERCHES: Vec3[] = (() => {
  const perches: Vec3[] = [];
  const postHeight = 0.95;
  // Cách hai cột một (bước 1,7 m của `createFence`) — mỗi cột một con thì hàng
  // rào trông như bị dán chim.
  const step = 3.4;

  for (let x = YARD.fence.from; x <= YARD.fence.to; x += step) {
    const inGate =
      x > YARD.fence.gateFrom - 0.9 && x < YARD.fence.gateTo + 0.9;

    if (inGate) continue;

    perches.push({
      x,
      y: terrainHeight(x, YARD.fence.z) + postHeight + 0.12,
      z: YARD.fence.z,
    });
  }

  // Miệng giếng: vành đá cao 0,75 m, hai con đậu hai bên.
  for (const side of [-1, 1]) {
    perches.push({ x: YARD.well.x + side * 0.95, y: 0.87, z: YARD.well.z });
  }

  // Dây phơi: sợi dây cao 1,85 m, nghiêng 0,4 radian so với trục sân — chim
  // đậu trên dây cũng phải đi qua đúng phép xoay đó.
  for (const local of [-1.4, 1.4]) {
    perches.push({
      x: YARD.clothesLine.x + local * Math.cos(0.4),
      y: 1.97,
      z: YARD.clothesLine.z - local * Math.sin(0.4),
    });
  }

  return perches;
})();

/** Vector tạm cho điểm vai — bướm đậu ở đây (không cấp phát mỗi frame). */
const SHOULDER = new THREE.Vector3();

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
    const tree = createTree({
      scale: 1 + (index % 3) * 0.16,
      seed: index * 137 + 5,
      blossom: index === YARD.blossomTree,
    });

    tree.position.set(x, terrainHeight(x, z), z);

    // Cây non nhỏ hơn ở vòng ngoài, cây già ở gần sân.
    group.add(tree);
    swayers.push({ object: tree, phase: index * 0.7 });
  });

  // Gốc cây ký ức: to hơn hẳn để nhìn là biết "chỗ này có gì đó".
  const memoryTree = createTree({ scale: 1.7, seed: 99 });

  memoryTree.position.set(YARD.tree.x, 0, YARD.tree.z);
  group.add(memoryTree);
  swayers.push({ object: memoryTree, phase: 1.1 });

  // Vành cây vòng ngoài — xem `OUTER_TREES`. Đây là bìa của vùng đi được, nên
  // cây phải dày và to hơn cây trong sân: chúng che đường chân trời, và không
  // ai muốn nhìn thấy mép của tấm lưới đất.
  OUTER_TREES.forEach(([x, z], index) => {
    const tree = createTree({ scale: 1.35 + (index % 3) * 0.22, seed: 400 + index * 53 });

    tree.position.set(x, terrainHeight(x, z), z);
    group.add(tree);
    swayers.push({ object: tree, phase: index * 0.9 });
  });

  GROVE_TREES.forEach(([x, z], index) => {
    const tree = createTree({ scale: 1.1 + (index % 4) * 0.18, seed: 900 + index * 71 });

    tree.position.set(x, terrainHeight(x, z), z);
    group.add(tree);
    swayers.push({ object: tree, phase: index * 0.6 });
  });

  // Lũy tre và cây chuối — dáng cây của làng quê, không phải công viên.
  YARD.bamboo.forEach(([x, z], index) => {
    const clump = createBamboo(11 + index * 17);

    clump.position.set(x, terrainHeight(x, z), z);
    group.add(clump);
    swayers.push({ object: clump, phase: index * 1.3 });
  });

  YARD.bananas.forEach(([x, z], index) => {
    const plant = createBanana(5 + index * 13);

    plant.position.set(x, terrainHeight(x, z), z);
    plant.rotation.y = index * 1.9;
    group.add(plant);
  });

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

  school.position.set(YARD.school.x, terrainHeight(YARD.school.x, YARD.school.z), YARD.school.z);
  school.scale.setScalar(1.6);
  group.add(school);

  // ── Sinh vật ────────────────────────────────────────────────────────────
  //
  // Sân không có chim thì sân là một tấm ảnh. Bốn loài ở đây sống theo cùng
  // một luật: chuyển động tính bằng số từ `elapsed`, không AnimationClip — nên
  // sân giống nhau ở mọi máy, và `WorldGame` chỉ cần đẩy vị trí con diều vào
  // `setSkyFocus` là hai con chim đầu đàn rời lộ trình bám theo nó (xem
  // `Creatures`).
  const creatures = new Creatures({
    perches: PERCHES,
    // Gà bới quanh hai đống rơm, không bước vào đống rơm.
    chickenZone: {
      homeX: -11.5,
      homeZ: -11,
      radius: 4,
      avoid: YARD.haystacks.map(([x, z]) => ({ x, z, radius: 1.1 })),
    },
    // Bướm lượn quanh mấy khóm hoa — mỗi khóm một con.
    butterflyZones: YARD.bushes.slice(0, 4).map(([x, z]) => ({ x, z, radius: 3.4 })),
  });

  group.add(creatures.group);

  // ── Cột mốc: cây đa đỉnh đồi, con diều trên tháp chuông, khói bếp ───────
  // Lúc dựng cảnh chưa có frame nào render: ma trận thế giới phải tự cập nhật.
  house.updateMatrixWorld();

  const chimney = house.localToWorld(new THREE.Vector3(CHIMNEY_TOP.x, CHIMNEY_TOP.y, CHIMNEY_TOP.z));
  const landmarks = new Landmarks({
    hillTree: YARD.hillTree,
    farKite: { x: YARD.school.x - 3, z: YARD.school.z + 5 },
    chimney,
  });

  group.add(landmarks.group);

  // ── Kỷ vật: lấp lánh trên cỏ, xa sân — phần thưởng của việc đi xa ───────
  const keepsakes = new Map(
    KEEPSAKE_LIST.map((item, index) => {
      const glint = createGlint(index);

      glint.position.set(item.x, terrainHeight(item.x, item.z), item.z);
      group.add(glint);

      return [item.id, glint] as const;
    }),
  );

  for (const { x, z, yaw } of NOOK_SEATS) {
    const stump = createStump();

    stump.position.set(x, terrainHeight(x, z), z);
    stump.rotation.y = yaw;
    group.add(stump);
  }

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

  // ── Bãi đá cầu: quả cầu nằm chờ, và một người bạn đứng đợi ──────────────
  //
  // Không có gì để nhìn thì không ai biết ở đây có trò chơi: quả cầu nằm trên
  // cỏ (cất đi lúc đang đá, như con diều) và cậu bạn đứng cách gần ba mét, quay
  // mặt về phía quả cầu — từ xa đã thấy có người đang rủ đá cầu.
  const shuttle = createShuttlecock();

  shuttle.place(SHUTTLE_SPOT.x, 0, SHUTTLE_SPOT.z, 0, 0, 0);
  group.add(shuttle.group);

  const friend = new Character({
    variant: "friend",
    x: SHUTTLE_SPOT.x,
    z: SHUTTLE_SPOT.z + 2.8,
    yaw: Math.PI,
  });

  group.add(friend.root);

  // ── Nhân vật ────────────────────────────────────────────────────────────
  // Camera chỉ né vật đứng (nhà, cây, giếng). Mặt ao phẳng: tính nó là vật cản
  // thì lúc bơi tâm ngắm nằm TRONG vật cản và cần gạt sập về mức ngắn nhất.
  const cameraColliders = buildColliders(house);
  // Mép ao: bán kính nước cộng một chút da — vừa đủ để đứng trên bờ bấm E
  // xuống nước (xem `SWIM_SPOT`), mà không lội vào giữa ao bằng chân.
  const obstacles = [
    ...cameraColliders,
    { x: YARD.pond.x, z: YARD.pond.z, radius: POND_RADIUS + 0.1 },
  ];

  // Cửa đóng thì khoảng cửa cũng là tường; mở ra thì lối đi thông.
  const doorObstacles = rotateObstacles(createDoorObstacles(), {
    x: house.position.x,
    z: house.position.z,
    rotation: house.rotation.y,
  });

  // Vùng đi được: tới tận vành cây vòng ngoài, không phải dừng ở hàng rào.
  // Qua cổng là cả cánh đồng (tháp chuông trường làng ở xa), nên con số này
  // rộng hơn sân cũ gấp rưỡi — và vẫn nằm gọn trong tấm lưới đất 220 m.
  const bounds = { minX: -72, maxX: 72, minZ: -72, maxZ: 72 };

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

  // Con chó vàng nằm đợi ngoài hiên, rồi đi theo chủ khắp sân (xem `Pet`).
  const petStart = housePoint(-1.4, HOUSE.depth / 2 + 1.6);
  const pet = new Pet({
    x: petStart.x,
    z: petStart.z,
    obstacles: [...obstacles, ...doorObstacles],
    ground: worldGroundHeight,
  });

  group.add(pet.group);

  const interact = (id: string) => {
    if (id === "door") {
      props.doorOpen = !props.doorOpen;
      const blocking = props.doorOpen ? obstacles : [...obstacles, ...doorObstacles];

      character.setObstacles(blocking, bounds);
      pet.setObstacles(blocking);
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
    shuttle: shuttle.group,
    friend,
    kiteTail: (color) => kite.setTailColor(color),
    setDusk: (level, instant) => sky.setDusk(level, instant),
    spots: [
      ...INDOOR_SPOTS,
      BENCH_SPOT,
      KITE_SPOT,
      SWIM_SPOT,
      SHUTTLE_SPOT,
      ...NOOK_SPOTS,
      HILL_KITE_SPOT,
    ],
    interact,
    // Tâm và bán kính THẬT của mặt ao — ván bơi cần con số này, không suy ra
    // từ hình khối.
    pond: { x: YARD.pond.x, z: YARD.pond.z, radius: POND_RADIUS },
    // `WorldGame` đẩy vị trí con diều vào đây mỗi frame trong lúc thả.
    setSkyFocus: (focus) => creatures.setFocus(focus),
    lastScare: () => creatures.lastScare,
    hideKeepsake: (id) => {
      const glint = keepsakes.get(id);

      if (glint) glint.visible = false;
    },
    // Diều bay ra đằng sau hàng rào, về phía đông nam — hướng duy nhất trong
    // sân không có mái nhà che khuất tầm nhìn.
    kiteForward: { x: 0.34, z: 0.94 },
    // Cần gạt của camera không bay xuyên nhà: cùng danh sách vật cản với
    // nhân vật, nên hai thứ không bao giờ "thấy" hai thế giới khác nhau.
    colliders: cameraColliders,
    // Camera sau lưng nhân vật (đang quay mặt ra cửa), đủ gần để không chọc
    // qua tường hậu của căn phòng.
    rig: { distance: 4.2, height: 1.0, pitch: 0.3, yaw: HOUSE_ROTATION + Math.PI },
    badgeHeight: {
      door: 2.7,
      lamp: 2.9,
      chest: 1.6,
      window: 2.2,
      bench: 1.8,
      kite: 2.6,
      swim: 2.4,
      shuttlecock: 2.2,
    },
    footstepSlot: footstepAt,
    update: (dt, elapsed) => {
      sky.update(dt, elapsed);
      sky.focusShadows(character.position.x, character.position.z);

      // Sinh vật sống cả khi người chơi đứng yên ngắm cảnh: chim bay vòng,
      // chim cành bay mất khi tới gần, gà bới, bướm lượn.
      creatures.update(dt, elapsed, character.position, character.rig.armR.getWorldPosition(SHOULDER));
      landmarks.update(elapsed);

      // Kỷ vật nhấp nháy so le, xoay chậm — đủ bắt mắt từ mười mấy mét.
      let index = 0;

      for (const glint of keepsakes.values()) {
        const pulse = 1 + Math.max(0, Math.sin(elapsed * 2.4 + index * 1.7)) * 0.6;

        glint.children[1].scale.setScalar(pulse);
        glint.children[1].rotation.y = elapsed * 1.5 + index;
        index += 1;
      }
      pet.update(dt, elapsed, character.position);

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
 * Ngôi nhà thì KHÔNG còn là một khối đặc: bốn bức tường là bốn đoạn thẳng có
 * độ dày (`Obstacle.toX`), mặt tiền chừa khoảng cửa, nên
 * người chơi vừa không xuyên được tường, vừa đi vào nhà được.
 */
function buildColliders(house: THREE.Group): Obstacle[] {
  const colliders: Obstacle[] = [];

  for (const [x, z] of YARD.trees) {
    colliders.push({ x, z, radius: 0.55 });
  }

  colliders.push({ x: YARD.tree.x, z: YARD.tree.z, radius: 0.8 });
  colliders.push({ x: YARD.hillTree.x, z: YARD.hillTree.z, radius: 1.1 });

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

  // Vành cây vòng ngoài: cùng dãy với hình khối, nên người chơi không đi
  // xuyên qua thân cây ở rìa bản đồ.
  for (const [x, z] of OUTER_TREES) colliders.push({ x, z, radius: 0.6 });
  for (const [x, z] of GROVE_TREES) colliders.push({ x, z, radius: 0.6 });
  for (const [x, z] of YARD.bamboo) colliders.push({ x, z, radius: 0.9 });
  for (const [x, z] of YARD.bananas) colliders.push({ x, z, radius: 0.35 });

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

/**
 * Một kỷ vật trên cỏ: món đồ nhỏ (con thứ nhất) + ánh lấp lánh hình kim cương
 * phát sáng (con thứ hai) — thứ người chơi thấy từ xa trước khi thấy món đồ.
 */
function createGlint(index: number): THREE.Group {
  const glint = new THREE.Group();
  const colors = [0x6fb7e0, 0xe0705a, 0xf2c14e, 0xf4efe6, 0xffffff, 0x8a5a3a, 0xf3d6c6, 0xb5763f];

  const item = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.09, 0),
    new THREE.MeshStandardMaterial({ color: colors[index % colors.length], roughness: 0.4 }),
  );

  item.position.y = 0.09;
  glint.add(item);

  const sparkle = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.12, 0),
    new THREE.MeshStandardMaterial({
      color: 0xfff6c8,
      emissive: 0xffe58a,
      emissiveIntensity: 1.4,
      transparent: true,
      opacity: 0.85,
    }),
  );

  sparkle.position.y = 0.55;
  glint.add(sparkle);

  return glint;
}
