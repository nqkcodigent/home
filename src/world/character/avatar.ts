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
 * Mọi bộ phận đều nằm trong một group xoay quanh khớp (hông/vai/khuỷu) để lớp
 * animation chỉ cần set `rotation.x`.
 *
 * Ba thứ làm nên "mặt có hồn" ở cỡ chibi — đều nằm trong hàm dựng, không có
 * texture nào:
 *  1. **Mắt có tròng**: cầu trắng + con ngươi + một điểm sáng. Hai chấm đen trên
 *     cầu da trông như búp bê gỗ; thêm tròng trắng là mắt biết nhìn.
 *  2. **Lông mày**: chỉ là hai thanh nhỏ, nhưng thiếu nó thì mặt trơ.
 *  3. **Miệng cười** (cung torus) và **tai** — hai chi tiết rẻ nhất để đầu
 *     không còn là một quả cầu.
 *
 * Nhóm mắt được trả về riêng (`eyes`) vì lớp animation cần `scale.y` để chớp.
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
  /** Màu phụ: đai áo, quai dép, dây buộc tóc. */
  accent: number;
  hairStyle: HairStyle;
  accessory: Accessory;
  /** Áo len tay dài, bo tay và hai sọc len ngang ngực */
  sweater?: boolean;
  /** Màu khăn quàng cổ — có thì đuôi khăn bay theo gió khi chạy */
  scarf?: number;
}

export const AVATAR_LOOKS: Record<AvatarVariant, AvatarLook> = {
  player: {
    height: 1.35,
    skin: 0xf6c9a4,
    hair: 0x3a2a20,
    // Bảng màu "cozy": áo len màu yến mạch, quần xanh lá xô thơm, khăn đỏ đất
    // nung — ấm mà dịu, vẫn nổi trên nền cỏ chiều mà không chói.
    shirt: 0xf0dcb4,
    shorts: 0x7f9c86,
    shoes: 0xf4efe6,
    accent: 0xc8664a,
    hairStyle: "bowl",
    accessory: "none",
    sweater: true,
    scarf: 0xd9785b,
  },

  friend: {
    height: 1.32,
    skin: 0xf1bd93,
    hair: 0x1f1a17,
    shirt: 0x57c88a,
    shorts: 0x8c5a3c,
    shoes: 0x2f3a44,
    accent: 0xffe066,
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
    accent: 0xff6b6b,
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
    accent: 0x6b7a9e,
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
  /** Cẳng tay — xoay quanh khuỷu, cho tay có khớp thay vì một thanh cứng. */
  elbowL: THREE.Group;
  elbowR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  /** Đầu gối — gập lại ở pha vung chân, cho dáng đi có trọng lượng. */
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  /** Hai mắt; lớp animation scale.y để chớp. */
  eyes: THREE.Group[];
  /** Đuôi khăn quàng — xoay quanh gáy, bay ra sau khi chạy (nếu có khăn). */
  scarfTail?: THREE.Group;
  /** Vật liệu để mờ dần khi "thức dậy" — dùng cho nhịp `reveal`. */
  materials: THREE.MeshStandardMaterial[];
}

const SHADOW_CASTERS = true;

const EYE_WHITE = 0xfffdf6;
const EYE_DARK = 0x2a1c14;
const MOUTH = 0x8f4a44;

function material(color: number, materials: THREE.MeshStandardMaterial[]) {
  const created = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.78,
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
  const accent = material(look.accent, materials);
  // Tròng trắng và điểm sáng phải sáng hơn hẳn vật liệu da, nên để roughness
  // thấp: mắt ướt thì mới "sống".
  const eyeWhite = material(EYE_WHITE, materials);
  const iris = material(EYE_DARK, materials);
  const mouth = material(MOUTH, materials);
  const blush = material(0xf59a9a, materials);

  eyeWhite.roughness = 0.35;
  iris.roughness = 0.3;

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

  // Đai lưng: một vòng mảnh màu phụ, cắt ngang thân áo — chi tiết rẻ nhất để
  // thân không còn là một khối trơn.
  const belt = mesh(
    new THREE.TorusGeometry(look.height * 0.136, look.height * 0.012, 8, 20),
    accent,
    [0, bodyHeight * 0.3, 0],
  );

  belt.rotation.x = Math.PI / 2;
  belt.scale.z = 0.86;
  body.add(belt);

  const collar = mesh(
    new THREE.TorusGeometry(look.height * 0.093, look.height * 0.013, 8, 18),
    accent,
    [0, bodyHeight * 0.8, 0],
  );

  collar.rotation.x = Math.PI / 2;
  collar.scale.z = 0.9;
  body.add(collar);

  if (look.sweater) {
    // Hai sọc len ngang ngực: chi tiết rẻ nhất để chiếc áo đọc ra là "áo len".
    for (const height of [0.56, 0.64]) {
      const stripe = mesh(
        new THREE.TorusGeometry(look.height * 0.139, look.height * 0.008, 6, 24),
        accent,
        [0, bodyHeight * height, 0],
      );

      stripe.rotation.x = Math.PI / 2;
      stripe.scale.z = 0.83;
      body.add(stripe);
    }
  }

  // ── Khăn quàng ──────────────────────────────────────────────────────────
  let scarfTail: THREE.Group | undefined;

  if (look.scarf !== undefined) {
    const scarf = material(look.scarf, materials);

    scarf.roughness = 0.95;

    const wrap = mesh(
      new THREE.TorusGeometry(look.height * 0.098, look.height * 0.034, 10, 22),
      scarf,
      [0, bodyHeight * 0.84, 0],
    );

    wrap.rotation.x = Math.PI / 2;
    wrap.scale.z = 0.92;
    body.add(wrap);

    // Đuôi khăn thả sau gáy, lệch trái; gốc nhóm là chỗ khăn vắt qua cổ để
    // xoay quanh đó.
    scarfTail = new THREE.Group();
    scarfTail.position.set(-look.height * 0.045, bodyHeight * 0.82, -look.height * 0.085);

    const tailLength = bodyHeight * 0.42;

    scarfTail.add(
      mesh(
        new THREE.BoxGeometry(look.height * 0.07, tailLength, look.height * 0.022),
        scarf,
        [0, -tailLength / 2, 0],
      ),
      // Tua rua ở mép khăn.
      mesh(
        new THREE.BoxGeometry(look.height * 0.072, look.height * 0.02, look.height * 0.026),
        accent,
        [0, -tailLength + look.height * 0.012, 0],
      ),
    );

    body.add(scarfTail);
  }

  root.add(body);

  // ── Chân — group xoay quanh hông ────────────────────────────────────────
  // Đùi (quần) tách khỏi cẳng chân (da): một capsule cùng màu quần cho cả ống
  // chân trông như bộ đồ liền thân, mà trẻ con thì mặc quần đùi.
  const thighGeometry = new THREE.CapsuleGeometry(
    look.height * 0.058,
    legLength * 0.34,
    4,
    12,
  );

  const shinGeometry = new THREE.CapsuleGeometry(
    look.height * 0.05,
    legLength * 0.3,
    4,
    12,
  );

  const soleGeometry = new THREE.BoxGeometry(
    look.height * 0.105,
    look.height * 0.035,
    look.height * 0.16,
  );

  const shoeGeometry = new THREE.BoxGeometry(
    look.height * 0.095,
    look.height * 0.05,
    look.height * 0.135,
  );

  const strapGeometry = new THREE.BoxGeometry(
    look.height * 0.1,
    look.height * 0.02,
    look.height * 0.05,
  );

  const legs: THREE.Group[] = [];
  const knees: THREE.Group[] = [];

  for (const side of [-1, 1]) {
    const hip = new THREE.Group();

    hip.position.set(side * look.height * 0.075, hipY, 0);

    hip.add(mesh(thighGeometry, shorts, [0, -legLength * 0.28, 0]));

    // Đầu gối nằm giữa ống chân; mọi bộ phận bên dưới tính theo gốc mới này.
    const knee = new THREE.Group();

    knee.position.y = -legLength * 0.5;

    knee.add(
      mesh(shinGeometry, skin, [0, -legLength * 0.18, 0]),
      mesh(soleGeometry, shoes, [0, -legLength * 0.435, look.height * 0.018]),
      mesh(shoeGeometry, accent, [0, -legLength * 0.385, look.height * 0.012]),
      mesh(strapGeometry, accent, [
        0,
        -legLength * 0.345,
        look.height * 0.026,
      ]),
    );

    hip.add(knee);
    root.add(hip);
    legs.push(hip);
    knees.push(knee);
  }

  // ── Tay — group xoay quanh vai, cẳng tay quanh khuỷu ────────────────────
  const upperArmGeometry = new THREE.CapsuleGeometry(
    look.height * 0.047,
    bodyHeight * 0.32,
    4,
    12,
  );

  const forearmGeometry = new THREE.CapsuleGeometry(
    look.height * 0.041,
    bodyHeight * 0.26,
    4,
    12,
  );

  const arms: THREE.Group[] = [];
  const elbows: THREE.Group[] = [];

  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();

    shoulder.position.set(side * look.height * 0.155, shoulderY, 0);

    shoulder.add(mesh(upperArmGeometry, shirt, [0, -bodyHeight * 0.2, 0]));

    const elbow = new THREE.Group();

    elbow.position.y = -bodyHeight * 0.42;

    elbow.add(
      mesh(forearmGeometry, look.sweater ? shirt : skin, [0, -bodyHeight * 0.16, 0]),
      mesh(
        new THREE.SphereGeometry(look.height * 0.052, 12, 10),
        skin,
        [0, -bodyHeight * 0.32, 0],
      ),
    );

    if (look.sweater) {
      // Bo tay áo len, ngay trên bàn tay.
      const cuff = mesh(
        new THREE.TorusGeometry(look.height * 0.042, look.height * 0.013, 6, 14),
        accent,
        [0, -bodyHeight * 0.27, 0],
      );

      cuff.rotation.x = Math.PI / 2;
      elbow.add(cuff);
    }

    shoulder.add(elbow);
    shoulder.rotation.z = side * 0.16;
    root.add(shoulder);
    arms.push(shoulder);
    elbows.push(elbow);
  }

  // ── Đầu ─────────────────────────────────────────────────────────────────
  const head = new THREE.Group();

  head.position.y = headY;
  head.scale.set(1, 0.96, 0.94);

  const skull = mesh(new THREE.SphereGeometry(headRadius, 24, 18), skin);

  head.add(skull);

  // Tai: hai cầu dẹt hai bên — thiếu tai thì đầu là quả bóng.
  for (const side of [-1, 1]) {
    const ear = mesh(
      new THREE.SphereGeometry(headRadius * 0.15, 10, 8),
      skin,
      [side * headRadius * 0.96, -headRadius * 0.06, 0],
    );

    ear.scale.set(0.5, 0.78, 0.55);
    head.add(ear);
  }

  const eyeRadius = headRadius * 0.155;
  const eyes: THREE.Group[] = [];

  for (const side of [-1, 1]) {
    const eye = new THREE.Group();

    eye.position.set(
      side * headRadius * 0.36,
      headRadius * 0.03,
      headRadius * 0.82,
    );

    const white = mesh(
      new THREE.SphereGeometry(eyeRadius, 14, 12),
      eyeWhite,
    );

    white.scale.set(1, 1.06, 0.72);

    const pupil = mesh(
      new THREE.SphereGeometry(eyeRadius * 0.6, 12, 10),
      iris,
      [0, 0, eyeRadius * 0.42],
    );

    pupil.scale.set(1, 1.05, 0.5);

    // Điểm sáng: cùng phía ở cả hai mắt (một nguồn sáng), như mắt thuỷ tinh.
    const glint = mesh(
      new THREE.SphereGeometry(eyeRadius * 0.26, 8, 8),
      eyeWhite,
      [-eyeRadius * 0.24, eyeRadius * 0.32, eyeRadius * 0.72],
    );

    glint.scale.set(1, 1, 0.5);

    eye.add(white, pupil, glint);
    head.add(eye);
    eyes.push(eye);
  }

  // Lông mày: nghiêng nhẹ ra ngoài — hơi cau mày vô tư của trẻ con.
  for (const side of [-1, 1]) {
    const brow = mesh(
      new THREE.BoxGeometry(headRadius * 0.3, headRadius * 0.045, headRadius * 0.06),
      hair,
      [side * headRadius * 0.36, headRadius * 0.42, headRadius * 0.84],
    );

    brow.rotation.z = side * -0.16;
    head.add(brow);
  }

  // Miệng: nửa vòng torus lật ngược thành nét cười (mặt phẳng miệng hơi ôm
  // theo cầu nên nghiêng vào trong một chút).
  const smile = mesh(
    new THREE.TorusGeometry(headRadius * 0.15, headRadius * 0.032, 8, 16, Math.PI),
    mouth,
    [0, -headRadius * 0.36, headRadius * 0.86],
  );

  smile.rotation.z = Math.PI;
  smile.rotation.x = -0.32;
  head.add(smile);

  // Mũi: một chấm nhỏ nhô ra, màu da sẫm hơn.
  const nose = mesh(
    new THREE.SphereGeometry(headRadius * 0.07, 8, 8),
    material(skinShadow(look.skin), materials),
    [0, -headRadius * 0.17, headRadius * 0.94],
  );

  head.add(nose);

  for (const side of [-1, 1]) {
    const cheek = mesh(
      new THREE.SphereGeometry(headRadius * 0.15, 10, 8),
      blush,
      [side * headRadius * 0.64, -headRadius * 0.24, headRadius * 0.68],
    );

    cheek.scale.set(1, 0.58, 0.32);
    head.add(cheek);
  }

  head.add(...buildHair(look, headRadius, hair, accent, materials));

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
    elbowL: elbows[0],
    elbowR: elbows[1],
    legL: legs[0],
    legR: legs[1],
    kneeL: knees[0],
    kneeR: knees[1],
    eyes,
    scarfTail,
    materials,
  };
}

/**
 * Tóc — một chỏm cầu phủ đỉnh đầu, cộng phần mái/miểng riêng cho từng kiểu.
 *
 * Phần "mái" là một mảng cầu cụt (chỉ một khoảng kinh tuyến quanh mặt trước),
 * dày hơn chỏm nền một chút. Nhờ vậy bốn kiểu tóc khác nhau ở đúng chỗ người
 * chơi nhìn: đường chân tóc.
 */
function buildHair(
  look: AvatarLook,
  headRadius: number,
  hair: THREE.Material,
  accent: THREE.Material,
  materials: THREE.MeshStandardMaterial[],
): THREE.Object3D[] {
  const parts: THREE.Object3D[] = [];

  // FRONT là +Z, tức kinh tuyến π/2 của cầu three.js.
  const FRONT = Math.PI / 2;

  const capGeometry = new THREE.SphereGeometry(
    headRadius * 1.03,
    24,
    14,
    0,
    Math.PI * 2,
    0,
    Math.PI * 0.53,
  );

  parts.push(mesh(capGeometry, hair));

  /** Mảng tóc hình cầu cụt: `width` = độ rộng kinh tuyến (radian), `drop` = độ dài cung. */
  const fringe = (width: number, drop: number, offset = 0, tilt = 0) => {
    const piece = mesh(
      new THREE.SphereGeometry(
        headRadius * 1.09,
        20,
        12,
        FRONT - width / 2 + offset,
        width,
        0,
        drop,
      ),
      hair,
    );

    piece.rotation.z = tilt;

    return piece;
  };

  if (look.hairStyle === "bowl") {
    // Mái bằng: phủ gần hết nửa trước đầu, cắt ngang ngay trên lông mày.
    parts.push(fringe(Math.PI * 1.05, Math.PI * 0.34));
  }

  if (look.hairStyle === "bob") {
    parts.push(fringe(Math.PI * 0.95, Math.PI * 0.26));

    for (const side of [-1, 1]) {
      const sidePiece = mesh(
        new THREE.SphereGeometry(headRadius * 0.4, 14, 12),
        hair,
        [side * headRadius * 0.86, -headRadius * 0.24, -headRadius * 0.04],
      );

      sidePiece.scale.set(0.72, 1, 0.9);
      parts.push(sidePiece);
    }
  }

  if (look.hairStyle === "short") {
    // Rẽ ngôi lệch: mảng tóc dồn về một bên, bên kia hở trán.
    parts.push(fringe(Math.PI * 0.62, Math.PI * 0.32, Math.PI * 0.24, -0.12));
    parts.push(fringe(Math.PI * 0.5, Math.PI * 0.2, -Math.PI * 0.26, 0.18));
  }

  if (look.hairStyle === "pony") {
    parts.push(fringe(Math.PI * 0.9, Math.PI * 0.28));

    const tail = mesh(
      new THREE.CapsuleGeometry(headRadius * 0.17, headRadius * 0.85, 4, 12),
      hair,
      [0, -headRadius * 0.2, -headRadius * 1.02],
    );

    tail.rotation.x = -0.3;
    parts.push(tail);

    const tie = mesh(
      new THREE.TorusGeometry(headRadius * 0.22, headRadius * 0.06, 8, 14),
      accent,
      [0, headRadius * 0.28, -headRadius * 0.95],
    );

    tie.rotation.x = Math.PI / 2;
    parts.push(tie);
  }

  if (look.accessory === "cap") {
    const crown = mesh(
      new THREE.SphereGeometry(headRadius * 1.06, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42),
      material(look.accent, materials),
    );

    const brim = mesh(
      new THREE.BoxGeometry(headRadius * 1.75, headRadius * 0.1, headRadius * 0.9),
      material(look.accent, materials),
      [0, headRadius * 0.2, headRadius * 0.66],
    );

    parts.push(crown, brim);
  }

  if (look.accessory === "headband") {
    const band = mesh(
      new THREE.TorusGeometry(headRadius * 1.0, headRadius * 0.07, 8, 24),
      accent,
    );

    band.rotation.x = Math.PI / 2;
    band.position.y = headRadius * 0.3;
    parts.push(band);
  }

  if (look.accessory === "nonLa") {
    // Nón lá: hình nón vành rộng — chi tiết Việt Nam, thay cho mũ lưỡi trai.
    const cone = mesh(
      new THREE.ConeGeometry(headRadius * 1.5, headRadius * 0.8, 20, 1, true),
      material(0xe4c98f, materials),
      [0, headRadius * 0.95, 0],
    );

    parts.push(cone);
  }

  return parts;
}

/** Màu da sẫm hơn cho mũi — cùng tông, không phải màu mới. */
function skinShadow(skin: number): number {
  const color = new THREE.Color(skin);

  color.multiplyScalar(0.88);

  return color.getHex();
}
