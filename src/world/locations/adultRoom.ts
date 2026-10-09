import * as THREE from "three";

import { Character } from "../character/Character";
import { SKY_PRESETS, Sky } from "../world/Sky";
import { createRoom } from "../world/Room";

import type { LocationRuntime, WorldServices } from "./types";

/**
 * Căn hộ người lớn — chương 1, một tối mệt nhoài.
 *
 * Không có cỏ, không có cây: bối cảnh này chỉ có bốn bức tường và hai nguồn
 * sáng. Sự trống trải là chủ ý — chương 2 sẽ tương phản hoàn toàn.
 */
export function createAdultRoom(services: WorldServices): LocationRuntime {
  const group = new THREE.Group();

  group.name = "adult-room";

  // Đêm: trời tối, đèn đường xanh lạnh qua cửa sổ. Vòm trời bị tường che nên
  // gần như không thấy, nhưng vẫn cần để ánh sáng nền đúng tông.
  const sky = new Sky(SKY_PRESETS.night, 60);

  sky.applyFog(services.engine.scene);
  group.add(sky.group);

  const room = createRoom();

  group.add(room.group);

  const character = new Character({
    variant: "adult",
    x: room.spawn.x,
    z: room.spawn.z,
    yaw: room.spawn.yaw,
    obstacles: room.obstacles,
    bounds: room.bounds,
    radius: 0.34,
  });

  group.add(character.root);

  return {
    name: "AdultHomeScene",
    heading: {
      index: 1,
      title: "Một ngày dài",
      subtitle: "một tối mệt nhoài giữa thành phố",
      time: "23:12",
    },
    story: "intro",
    group,
    character,
    // Chương này không có điểm ký ức nào — chưa có gì để nhớ.
    spots: [],
    walkPoints: {
      hall: { x: room.points.hall.x, z: room.points.hall.z },
      bed: { x: room.points.bed.x, z: room.points.bed.z },
    },
    panPoints: {
      window: room.points.window,
      room: room.points.room,
      bed: { x: room.points.bed.x, y: 0.9, z: room.points.bed.z },
    },
    // Camera đứng sau lưng nhân vật (nhìn về phía cửa sổ và cửa hành lang).
    // Đứng bên kia là thấy mặt, nhưng không thấy được căn phòng.
    rig: { distance: 4.6, height: 1.05, pitch: 0.22, yaw: 0 },
    footstepSlot: "footsteps",
    update: (dt, elapsed) => {
      sky.update(dt, elapsed);
      sky.focusShadows(character.position.x, character.position.z);
    },
  };
}
