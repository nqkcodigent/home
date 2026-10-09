import * as THREE from "three";

import { Character } from "../character/Character";
import { SKY_PRESETS, Sky } from "../world/Sky";
import { Terrain } from "../world/Terrain";
import { YARD } from "../world/layout";
import {
  createBellTower,
  createBush,
  createClothesLine,
  createFence,
  createHaystack,
  createHouse,
  createPond,
  createRock,
  createTree,
  createWell,
} from "../world/Props";

import type { AudioSlot } from "../audio/HowlerAudio";
import type { LocationRuntime, WorldServices } from "./types";

/**
 * Sân nhà ngày ấy — bối cảnh chính của trò chơi.
 *
 * Đây là chỗ "kể chuyện bằng bố cục": nhà ở phía bắc, cổng ở phía nam, lối
 * đất nối thẳng hai đầu như trong một sân quê thật; giếng lệch sang phải,
 * gốc cây già bên trái, ao nhỏ xa hơn. Ba điểm ký ức nằm ở ba hướng khác nhau
 * nên người chơi phải đi một vòng quanh sân mới nhặt hết — cố ý, để chuyến
 * thăm kéo dài đúng bằng một buổi chiều.
 */

/** Ba điểm ký ức, giữ nguyên lời thoại của bản cũ. */
const MEMORY_SPOTS = [
  {
    id: "well",
    x: YARD.well.x,
    z: YARD.well.z,
    radius: 3.4,
    label: "Cái giếng",
    payload: {
      id: "memory-well",
      speaker: "Bạn",
      text: "Cái giếng này... hoá ra mình vẫn nhớ như in cái cảm giác mát rượi.",
      emotion: "nostalgic",
      portrait: "child",
    },
  },
  {
    id: "door",
    x: YARD.door.x,
    z: YARD.door.z,
    radius: 3.6,
    label: "Cửa nhà",
    payload: {
      id: "memory-door",
      speaker: "Bạn",
      text: "Mẹ vẫn hay đứng ở đúng cái cửa này gọi mình vào ăn cơm.",
      emotion: "warm",
      portrait: "child",
    },
  },
  {
    id: "tree",
    x: YARD.tree.x,
    z: YARD.tree.z,
    radius: 3.8,
    label: "Gốc cây",
    payload: {
      id: "memory-tree",
      speaker: "Bạn",
      text: "Cả lũ từng trèo lên đây, rồi bị mắng cho một trận.",
      emotion: "nostalgic",
      portrait: "friend",
    },
  },
];

export function createChildhoodYard(services: WorldServices): LocationRuntime {
  const group = new THREE.Group();

  group.name = "childhood-yard";

  // ── Trời chiều muộn ─────────────────────────────────────────────────────
  const sky = new Sky(SKY_PRESETS.goldenHour);

  sky.applyFog(services.engine.scene);
  group.add(sky.group);

  // ── Đất, cỏ, hoa ────────────────────────────────────────────────────────
  const terrain = new Terrain();

  group.add(terrain.group);

  // ── Nhà ─────────────────────────────────────────────────────────────────
  const house = createHouse();

  house.position.set(YARD.house.x, 0, YARD.house.z);
  house.rotation.y = 0.06;
  group.add(house);

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

  // ── Nhân vật ────────────────────────────────────────────────────────────
  const obstacles = buildColliders();

  const character = new Character({
    variant: "player",
    x: 0.5,
    z: 6.5,
    yaw: Math.PI,
    obstacles,
    bounds: { minX: -46, maxX: 46, minZ: -46, maxZ: 46 },
    radius: 0.36,
  });

  group.add(character.root);

  return {
    name: "ChildhoodScene",
    heading: {
      index: 2,
      title: "Ngày ấy",
      subtitle: "một chiều tuổi thơ chưa tắt nắng",
      time: "17:42",
    },
    story: "childhood",
    group,
    character,
    spots: MEMORY_SPOTS,
    walkPoints: {
      gate: { x: YARD.gate.x, z: YARD.gate.z },
      well: { x: YARD.well.x + 2.4, z: YARD.well.z + 1.6 },
      house: { x: YARD.door.x, z: YARD.door.z },
      yard: { x: 0.5, z: 6.5 },
    },
    panPoints: {
      house: { x: YARD.house.x, y: 2.2, z: YARD.house.z },
      well: { x: YARD.well.x, y: 1.6, z: YARD.well.z },
      sky: { x: 0, y: 14, z: 24 },
      yard: { x: 0, y: 1.2, z: 6 },
    },
    // Camera ở phía cổng (nam) nhìn vào nhà: cảnh mở đầu phải thấy mái ngói
    // trước khi thấy bất cứ thứ gì khác.
    rig: { distance: 7.4, height: 1.0, pitch: 0.36, yaw: 0 },
    // Gốc cây cao gần gấp đôi nhà nên nhãn phải nâng lên, nếu không nó nằm
    // trong thân cây.
    badgeHeight: { well: 2.9, door: 2.6, tree: 4.3 },
    footstepSlot: "childFootsteps" as AudioSlot,
    spatialSources: {
      // Tiếng trống trường phải đến TỪ trường, không phải từ trong đầu người chơi.
      schoolBell: { x: YARD.school.x, y: 12, z: YARD.school.z },
    },
    update: (dt, elapsed) => {
      sky.update(dt, elapsed);
      sky.focusShadows(character.position.x, character.position.z);

      for (const swayer of swayers) {
        swayer.object.rotation.z = Math.sin(elapsed * 0.75 + swayer.phase) * 0.014;
      }
    },
  };
}

/**
 * Vật cản: mỗi vật là một hình tròn trên mặt phẳng XZ.
 *
 * Hàng rào được rải nhiều hình tròn nhỏ dọc theo chiều dài — người chơi không
 * lách qua khe giữa hai cọc được, mà chi phí thì không đáng kể (chỉ là vài
 * phép hypot mỗi frame).
 */
function buildColliders() {
  const colliders: { x: number; z: number; radius: number }[] = [];

  for (const [x, z] of YARD.trees) {
    colliders.push({ x, z, radius: 0.55 });
  }

  colliders.push({ x: YARD.tree.x, z: YARD.tree.z, radius: 0.8 });
  colliders.push({ x: YARD.house.x, z: YARD.house.z, radius: 4.7 });
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

  return colliders;
}
