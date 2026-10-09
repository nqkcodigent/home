import * as THREE from "three";

/**
 * Nhân vật — dựng từ hình khối cơ bản theo tỉ lệ "chibi" đầu to (kiểu Animal
 * Crossing, đúng tinh thần character-threejs).
 *
 * Vì sao không dùng model glTF: bản gốc tải .glb nặng vài MB và cần Draco.
 * Ở đây chỉ có bốn nhân vật, tỉ lệ cố định và cần đổi màu theo biến thể — dựng
 * bằng hình khối cho ra đúng dáng mong muốn, không phụ thuộc file ngoài, và
 * đổi màu áo chỉ là đổi một tham số.
 *
 * Mọi bộ phận đều nằm trong một group xoay quanh khớp (hông/vai) để lớp
 * animation chỉ cần set `rotation.x`.
 */

export type AvatarVariant = "player" | "friend" | "cousin" | "adult";

export type HairStyle = "bowl" | "bob" | "short" | "pony";

export type Accessory = "none" | "cap" | "headband" | "nonLa";

export interface AvatarLook {
  /** Chiều cao tổng thể (mét). Trẻ con ~1.35, người lớn ~1.6. */
  height: number;
  skin: number;
  hair: number;
  shirt: number;
  shorts: number;
  shoes: number;
  hairStyle: HairStyle;
  accessory: Accessory;
}

export const AVATAR_LOOKS: Record<AvatarVariant, AvatarLook> = {
  player: {
    height: 1.35,
    skin: 0xf6c9a4,
    hair: 0x2b1d16,
    // Áo vàng nhạt như nắng chiều — nhân vật chính nổi bật trên nền cỏ.
    shirt: 0xffd45f,
    shorts: 0x3f6ea8,
    shoes: 0xe8e4dc,
    hairStyle: "bowl",
    accessory: "none",
  },

  friend: {
    height: 1.32,
    skin: 0xf1bd93,
    hair: 0x1f1a17,
    shirt: 0x57c88a,
    shorts: 0x8c5a3c,
    shoes: 0x2f3a44,
    hairStyle: "bob",
    accessory: "cap",
  },

  cousin: {
    height: 1.4,
    skin: 0xe7b088,
    hair: 0x3a2016,
    shirt: 0xff9a5a,
    shorts: 0x40506b,
    shoes: 0xd8d2c8,
    hairStyle: "pony",
    accessory: "headband",
  },

  adult: {
    height: 1.68,
    skin: 0xf3c39c,
    hair: 0x241b18,
    // Người lớn: áo xám, quần sẫm — cố ý nhạt nhoà so với tuổi thơ.
    shirt: 0xb9bcc4,
    shorts: 0x39404d,
    shoes: 0x1f242b,
    hairStyle: "short",
    accessory: "none",
  },
};

export interface AvatarRig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  /** Vật liệu để mờ dần khi "thức dậy" — dùng cho nhịp `reveal`. */
  materials: THREE.MeshStandardMaterial[];
}

const SHADOW_CASTERS = true;

function material(color: number, materials: THREE.MeshStandardMaterial[]) {
  const created = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.82,
    metalness: 0,
  });

  created.name = `avatar-${color.toString(16)}`;
  materials.push(created);

  return created;
}

function mesh(
  geometry: THREE.BufferGeometry,
  material3: THREE.Material,
  position?: [number, number, number],
) {
  const created = new THREE.Mesh(geometry, material3);

  if (position) created.position.set(...position);

  created.castShadow = SHADOW_CASTERS;
  created.receiveShadow = false;

  return created;
}

export function createAvatar(variant: AvatarVariant): AvatarRig {
  const look = AVATAR_LOOKS[variant];
  const materials: THREE.MeshStandardMaterial[] = [];

  const skin = material(look.skin, materials);
  const hair = material(look.hair, materials);
  const shirt = material(look.shirt, materials);
  const shorts = material(look.shorts, materials);
  const shoes = material(look.shoes, materials);
  const eye = material(0x241a16, materials);
  const blush = material(0xf59a9a, materials);

  const root = new THREE.Group();
  root.name = `avatar-${variant}`;

  // Tỉ lệ: chân 0.22, thân 0.34, đầu ~0.34 của chiều cao — đầu to là điểm
  // nhấn dễ thương, và cũng để nhìn rõ biểu cảm từ xa.
  const legLength = look.height * 0.2;
  const bodyHeight = look.height * 0.34;
  const headRadius = look.height * 0.19;

  const hipY = legLength;
  const shoulderY = hipY + bodyHeight * 0.82;
  const headY = hipY + bodyHeight + headRadius * 0.86;

  // ── Thân ────────────────────────────────────────────────────────────────
  const body = new THREE.Group();

  body.position.y = hipY;

  const torso = mesh(
    new THREE.CapsuleGeometry(look.height * 0.135, bodyHeight * 0.55, 6, 16),
    shirt,
    [0, bodyHeight * 0.46, 0],
  );

  torso.scale.z = 0.82;
  body.add(torso);

  // Vạt áo dưới: một vòng hơi loe, đủ để thân không giống cái que.
  const hem = mesh(
    new THREE.CylinderGeometry(
      look.height * 0.152,
      look.height * 0.168,
      bodyHeight * 0.24,
      16,
    ),
    shirt,
    [0, bodyHeight * 0.16, 0],
  );

  hem.scale.z = 0.86;
  body.add(hem);

  root.add(body);

  // ── Chân — group xoay quanh hông ────────────────────────────────────────
  const legGeometry = new THREE.CapsuleGeometry(
    look.height * 0.055,
    legLength * 0.55,
    4,
    12,
  );

  const shoeGeometry = new THREE.BoxGeometry(
    look.height * 0.11,
    look.height * 0.05,
    look.height * 0.15,
  );

  const legs: THREE.Group[] = [];

  for (const side of [-1, 1]) {
    const hip = new THREE.Group();

    hip.position.set(side * look.height * 0.075, hipY, 0);

    const leg = mesh(legGeometry, shorts, [0, -legLength * 0.45, 0]);

    const shoe = mesh(shoeGeometry, shoes, [
      0,
      -legLength * 0.92,
      look.height * 0.02,
    ]);

    hip.add(leg, shoe);
    root.add(hip);
    legs.push(hip);
  }

  // ── Tay — group xoay quanh vai ──────────────────────────────────────────
  const armGeometry = new THREE.CapsuleGeometry(
    look.height * 0.045,
    bodyHeight * 0.6,
    4,
    12,
  );

  const arms: THREE.Group[] = [];

  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();

    shoulder.position.set(side * look.height * 0.16, shoulderY, 0);

    const arm = mesh(armGeometry, shirt, [0, -bodyHeight * 0.3, 0]);

    const hand = mesh(
      new THREE.SphereGeometry(look.height * 0.05, 12, 10),
      skin,
      [0, -bodyHeight * 0.62, 0],
    );

    shoulder.add(arm, hand);
    shoulder.rotation.z = side * 0.16;
    root.add(shoulder);
    arms.push(shoulder);
  }

  // ── Đầu ─────────────────────────────────────────────────────────────────
  const head = new THREE.Group();

  head.position.y = headY;
  head.scale.set(1, 0.96, 0.94);

  const skull = mesh(new THREE.SphereGeometry(headRadius, 20, 16), skin);

  head.add(skull);

  const eyeRadius = headRadius * 0.115;
  const eyeGeometry = new THREE.SphereGeometry(eyeRadius, 10, 8);

  for (const side of [-1, 1]) {
    head.add(
      mesh(eyeGeometry, eye, [
        side * headRadius * 0.38,
        headRadius * 0.06,
        headRadius * 0.9,
      ]),
    );

    const cheek = mesh(
      new THREE.SphereGeometry(headRadius * 0.16, 10, 8),
      blush,
      [side * headRadius * 0.62, -headRadius * 0.22, headRadius * 0.72],
    );

    cheek.scale.set(1, 0.6, 0.35);
    head.add(cheek);
  }

  head.add(
    mesh(
      new THREE.SphereGeometry(headRadius * 0.09, 8, 6),
      eye,
      [0, -headRadius * 0.35, headRadius * 0.94],
    ),
  );

  // Tóc: nửa trên của hình cầu, thêm vài kiểu để phân biệt nhân vật.
  const capGeometry = new THREE.SphereGeometry(
    headRadius * 1.03,
    20,
    12,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.52,
  );

  head.add(mesh(capGeometry, hair));

  if (look.hairStyle === "bob") {
    for (const side of [-1, 1]) {
      head.add(
        mesh(
          new THREE.SphereGeometry(headRadius * 0.38, 12, 10),
          hair,
          [side * headRadius * 0.88, -headRadius * 0.28, -headRadius * 0.1],
        ),
      );
    }
  }

  if (look.hairStyle === "pony") {
    head.add(
      mesh(
        new THREE.CapsuleGeometry(headRadius * 0.16, headRadius * 0.7, 4, 10),
        hair,
        [0, -headRadius * 0.22, -headRadius * 1.0],
      ),
    );
  }

  if (look.accessory === "cap") {
    const brim = mesh(new THREE.BoxGeometry(headRadius * 1.7, headRadius * 0.1, headRadius * 0.85), shirt, [
      0,
      headRadius * 0.28,
      headRadius * 0.62,
    ]);

    head.add(brim);
  }

  if (look.accessory === "headband") {
    const band = mesh(
      new THREE.TorusGeometry(headRadius * 1.0, headRadius * 0.07, 8, 24),
      shirtsForAccent(look, materials),
    );

    band.rotation.x = Math.PI / 2;
    band.position.y = headRadius * 0.3;
    head.add(band);
  }

  if (look.accessory === "nonLa") {
    // Nón lá: hình nón vành rộng — chi tiết Việt Nam, thay cho mũ lưỡi trai.
    const cone = mesh(
      new THREE.ConeGeometry(headRadius * 1.5, headRadius * 0.8, 20, 1, true),
      material(0xe4c98f, materials),
      [0, headRadius * 0.95, 0],
    );

    head.add(cone);
  }

  root.add(head);

  root.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.frustumCulled = false;
    }
  });

  return {
    root,
    body,
    head,
    armL: arms[0],
    armR: arms[1],
    legL: legs[0],
    legR: legs[1],
    materials,
  };
}

function shirtsForAccent(
  look: AvatarLook,
  materials: THREE.MeshStandardMaterial[],
) {
  return material(look.shoes === 0x2f3a44 ? 0xff6b6b : 0xffe066, materials);
}
