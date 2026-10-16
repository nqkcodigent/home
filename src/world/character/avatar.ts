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

export type HairStyle = "bowl" | "bob" | "short" | "pony" | "messy";

export type Accessory = "none" | "cap" | "headband" | "nonLa" | "goggles";

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
  /** Màu tròng mắt — có thì mắt to hơn, có tròng màu + con ngươi sẫm */
  eyes?: number;
  /**
   * Bộ đồ dã ngoại: `shirt` thành áo khoác gió mở vạt (lộ áo thun sọc), mũ
   * trùm sau gáy; `accent` là màu viền cát; quần đùi túi hộp; tất cao + giày
   * leo núi màu `shoes`; balo có diều gấp, cánh lượn cuộn và móc khoá.
   */
  adventurer?: boolean;
  /**
   * Dáng bé nhanh nhẹn: vẫn đầu to mắt to kiểu chibi, nhưng người thon hơn,
   * chân và tay dài hơn chibi một chút — đủ cho bộ đồ dã ngoại có chỗ hiện ra.
   */
  kid?: boolean;
}

export const AVATAR_LOOKS: Record<AvatarVariant, AvatarLook> = {
  player: {
    height: 1.3,
    skin: 0xf6c9a4,
    // Tóc nâu hạt dẻ, mắt nâu ấm. Áo khoác xanh rừng viền vàng mù tạt, quần
    // đùi xám than, giày da nâu — tông đất, nổi trên nền cỏ mà không chói.
    hair: 0x6e3f22,
    shirt: 0x4a6640,
    shorts: 0x3a3c40,
    shoes: 0x7a5234,
    accent: 0xe0c25c,
    hairStyle: "messy",
    accessory: "goggles",
    eyes: 0x8a5530,
    adventurer: true,
    kid: true,
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
  /**
   * Những thứ treo lủng lẳng — đuôi khăn, lọn tóc, móc khoá, túi phụ. Mỗi
   * group xoay quanh chỗ treo; `userData.sway` (0…1) là độ bay theo đà.
   */
  trailing: THREE.Group[];
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

/**
 * @param patch  Trang phục đè lên dáng mặc định của biến thể (kiểu tóc, nón,
 *   màu áo). Không truyền thì bốn biến thể giữ nguyên hình như cũ.
 */
export function createAvatar(variant: AvatarVariant, patch: Partial<AvatarLook> = {}): AvatarRig {
  const look: AvatarLook = { ...AVATAR_LOOKS[variant], ...patch };
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

  const trailing: THREE.Group[] = [];

  // Tỉ lệ: chân 0.22, thân 0.34, đầu ~0.34 của chiều cao — đầu to là điểm
  // nhấn dễ thương, và cũng để nhìn rõ biểu cảm từ xa.
  // Dáng bé: đầu ~1/3 chiều cao (cute), chân chỉ dài hơn chibi một chút.
  const legLength = look.height * (look.kid ? 0.26 : 0.2);
  const bodyHeight = look.height * (look.kid ? 0.31 : 0.34);
  const headRadius = look.height * (look.kid ? 0.175 : 0.19);
  // Bề ngang thân/tay/chân: thiếu niên mảnh hơn chibi cùng chiều cao.
  const girth = look.height * (look.kid ? 0.88 : 1);
  // Tay chibi ngắn theo thân; tay dáng bé buông tới hông.
  const armLength = bodyHeight * (look.kid ? 1.12 : 1);

  const hipY = legLength;
  const shoulderY = hipY + bodyHeight * 0.82;
  const headY = hipY + bodyHeight + headRadius * 0.86;

  // ── Thân ────────────────────────────────────────────────────────────────
  const body = new THREE.Group();

  body.position.y = hipY;

  const torso = mesh(
    new THREE.CapsuleGeometry(girth * 0.135, bodyHeight * 0.55, 6, 16),
    shirt,
    [0, bodyHeight * 0.46, 0],
  );

  torso.scale.z = 0.82;
  body.add(torso);

  // Vạt áo dưới: một vòng hơi loe, đủ để thân không giống cái que.
  const hem = mesh(
    new THREE.CylinderGeometry(
      girth * 0.152,
      girth * 0.168,
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
    new THREE.TorusGeometry(girth * 0.136, girth * 0.012, 8, 20),
    accent,
    [0, bodyHeight * 0.3, 0],
  );

  belt.rotation.x = Math.PI / 2;
  belt.scale.z = 0.86;
  body.add(belt);

  const collar = mesh(
    new THREE.TorusGeometry(girth * 0.093, girth * 0.013, 8, 18),
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
        new THREE.TorusGeometry(girth * 0.139, girth * 0.008, 6, 24),
        accent,
        [0, bodyHeight * height, 0],
      );

      stripe.rotation.x = Math.PI / 2;
      stripe.scale.z = 0.83;
      body.add(stripe);
    }
  }

  if (look.adventurer) {
    trailing.push(...buildAdventurer(girth, bodyHeight, body, shirt, accent, materials));
  }

  // ── Khăn quàng ──────────────────────────────────────────────────────────
  if (look.scarf !== undefined) {
    const scarf = material(look.scarf, materials);

    scarf.roughness = 0.95;

    const wrap = mesh(
      new THREE.TorusGeometry(girth * 0.098, girth * 0.034, 10, 22),
      scarf,
      [0, bodyHeight * 0.84, 0],
    );

    wrap.rotation.x = Math.PI / 2;
    wrap.scale.z = 0.92;
    body.add(wrap);

    // Đuôi khăn thả sau gáy, lệch trái; gốc nhóm là chỗ khăn vắt qua cổ để
    // xoay quanh đó.
    const scarfTail = swinging(1);

    scarfTail.position.set(-girth * 0.045, bodyHeight * 0.82, -girth * 0.085);

    const tailLength = bodyHeight * 0.42;

    scarfTail.add(
      mesh(
        new THREE.BoxGeometry(girth * 0.07, tailLength, girth * 0.022),
        scarf,
        [0, -tailLength / 2, 0],
      ),
      // Tua rua ở mép khăn.
      mesh(
        new THREE.BoxGeometry(girth * 0.072, girth * 0.02, girth * 0.026),
        accent,
        [0, -tailLength + girth * 0.012, 0],
      ),
    );

    body.add(scarfTail);
    trailing.push(scarfTail);
  }

  root.add(body);

  // ── Chân — group xoay quanh hông ────────────────────────────────────────
  // Đùi (quần) tách khỏi cẳng chân (da): một capsule cùng màu quần cho cả ống
  // chân trông như bộ đồ liền thân, mà trẻ con thì mặc quần đùi.
  const thighGeometry = new THREE.CapsuleGeometry(
    girth * 0.058,
    legLength * 0.34,
    4,
    12,
  );

  const shinGeometry = new THREE.CapsuleGeometry(
    girth * 0.05,
    legLength * 0.3,
    4,
    12,
  );

  const soleGeometry = new THREE.BoxGeometry(
    girth * 0.105,
    girth * 0.035,
    girth * 0.16,
  );

  const shoeGeometry = new THREE.BoxGeometry(
    girth * 0.095,
    girth * 0.05,
    girth * 0.135,
  );

  const strapGeometry = new THREE.BoxGeometry(
    girth * 0.1,
    girth * 0.02,
    girth * 0.05,
  );

  const bootCollarGeometry = new THREE.CylinderGeometry(
    girth * 0.056,
    girth * 0.06,
    legLength * 0.16,
    12,
  );

  const sockGeometry = new THREE.CylinderGeometry(
    girth * 0.053,
    girth * 0.053,
    legLength * 0.12,
    12,
  );

  const laceGeometry = new THREE.BoxGeometry(
    girth * 0.05,
    girth * 0.008,
    girth * 0.012,
  );

  const legs: THREE.Group[] = [];
  const knees: THREE.Group[] = [];

  for (const side of [-1, 1]) {
    const hip = new THREE.Group();

    hip.position.set(side * girth * 0.075, hipY, 0);

    hip.add(mesh(thighGeometry, shorts, [0, -legLength * 0.28, 0]));

    if (look.adventurer) {
      // Túi hộp bên ngoài ống quần.
      hip.add(
        mesh(
          new THREE.BoxGeometry(girth * 0.022, legLength * 0.24, girth * 0.065),
          shorts,
          [side * girth * 0.058, -legLength * 0.34, 0],
        ),
      );
    }

    // Đầu gối nằm giữa ống chân; mọi bộ phận bên dưới tính theo gốc mới này.
    const knee = new THREE.Group();

    knee.position.y = -legLength * 0.5;

    if (look.adventurer) {
      // Tất cao cổ + giày leo núi cổ lửng: đế sẫm, thân da, viền cổ màu cát,
      // hai nấc dây buộc. Phần tử [1] vẫn là đế — test bám vào đó.
      knee.add(
        mesh(shinGeometry, skin, [0, -legLength * 0.18, 0]),
        mesh(soleGeometry, material(BOOT_SOLE, materials), [0, -legLength * 0.435, girth * 0.018]),
        mesh(shoeGeometry, shoes, [0, -legLength * 0.385, girth * 0.012]),
        mesh(bootCollarGeometry, shoes, [0, -legLength * 0.31, 0]),
        mesh(sockGeometry, material(SOCK, materials), [0, -legLength * 0.2, 0]),
        mesh(laceGeometry, accent, [0, -legLength * 0.33, girth * 0.05]),
        mesh(laceGeometry, accent, [0, -legLength * 0.27, girth * 0.05]),
      );
    } else {
      knee.add(
        mesh(shinGeometry, skin, [0, -legLength * 0.18, 0]),
        mesh(soleGeometry, shoes, [0, -legLength * 0.435, girth * 0.018]),
        mesh(shoeGeometry, accent, [0, -legLength * 0.385, girth * 0.012]),
        mesh(strapGeometry, accent, [
          0,
          -legLength * 0.345,
          girth * 0.026,
        ]),
      );
    }

    hip.add(knee);
    root.add(hip);
    legs.push(hip);
    knees.push(knee);
  }

  // ── Tay — group xoay quanh vai, cẳng tay quanh khuỷu ────────────────────
  const upperArmGeometry = new THREE.CapsuleGeometry(
    girth * 0.047,
    armLength * 0.32,
    4,
    12,
  );

  const forearmGeometry = new THREE.CapsuleGeometry(
    girth * 0.041,
    armLength * 0.26,
    4,
    12,
  );

  const arms: THREE.Group[] = [];
  const elbows: THREE.Group[] = [];
  const longSleeves = look.sweater || look.adventurer;

  for (const side of [-1, 1]) {
    const shoulder = new THREE.Group();

    shoulder.position.set(side * girth * 0.155, shoulderY, 0);

    shoulder.add(mesh(upperArmGeometry, shirt, [0, -armLength * 0.2, 0]));

    const elbow = new THREE.Group();

    elbow.position.y = -armLength * 0.42;

    elbow.add(
      mesh(forearmGeometry, longSleeves ? shirt : skin, [0, -armLength * 0.16, 0]),
      mesh(
        new THREE.SphereGeometry(girth * 0.052, 12, 10),
        skin,
        [0, -armLength * 0.32, 0],
      ),
    );

    if (longSleeves) {
      // Bo tay áo, ngay trên bàn tay.
      const cuff = mesh(
        new THREE.TorusGeometry(girth * 0.042, girth * 0.013, 6, 14),
        accent,
        [0, -armLength * 0.27, 0],
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

  // Mắt có tròng màu thì to tròn hơn — nét "cute" nằm ở đôi mắt.
  const eyeRadius = headRadius * (look.eyes === undefined ? 0.155 : 0.2);
  const irisMaterial = look.eyes === undefined ? iris : material(look.eyes, materials);

  irisMaterial.roughness = 0.3;
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
      irisMaterial,
      // Nhô hơn mặt tròng trắng một chút — trùng mặt thì hai lớp nhấp nháy.
      [0, 0, eyeRadius * 0.48],
    );

    pupil.scale.set(1, 1.05, 0.5);

    // Điểm sáng: cùng phía ở cả hai mắt (một nguồn sáng), như mắt thuỷ tinh.
    const glint = mesh(
      new THREE.SphereGeometry(eyeRadius * 0.26, 8, 8),
      eyeWhite,
      [-eyeRadius * 0.24, eyeRadius * 0.32, eyeRadius * 0.8],
    );

    glint.scale.set(1, 1, 0.5);

    eye.add(white, pupil, glint);

    if (look.eyes !== undefined) {
      // Tròng có màu thì cần con ngươi sẫm ở giữa, không thì mắt "đục".
      const core = mesh(
        new THREE.SphereGeometry(eyeRadius * 0.3, 10, 8),
        iris,
        [0, -eyeRadius * 0.02, eyeRadius * 0.7],
      );

      core.scale.set(1, 1.1, 0.5);
      eye.add(core);
    }
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

  head.add(...buildHair(look, headRadius, hair, accent, materials, trailing));

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
    trailing,
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
  trailing: THREE.Group[],
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

  const cap = mesh(capGeometry, hair);

  parts.push(cap);

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

  if (look.hairStyle === "messy") {
    // Chỏm nền ngả ra sau: lộ trán và mắt (mặt biết cười), phủ kín gáy.
    cap.rotation.x = -0.6;
    parts.push(fringe(Math.PI * 0.9, Math.PI * 0.27));

    // Độ bồng: những búi cầu nhô lệch nhau trên đỉnh và sau gáy. Đội mũ lưỡi
    // trai thì búi đỉnh xuyên qua chóp mũ, nên bỏ.
    if (look.accessory !== "cap") {
      for (const [x, y, z, size] of MESSY_TUFTS) {
        parts.push(
          mesh(
            new THREE.SphereGeometry(headRadius * size, 12, 10),
            hair,
            direction(x, y, z).multiplyScalar(headRadius * 0.86).toArray(),
          ),
        );
      }
    }

    // Lọn tóc tự do: trước trán, cạnh tai, sau gáy — bay theo đà chạy.
    for (const [px, py, pz, dx, dy, dz, length, sway] of MESSY_LOCKS) {
      const lock = swinging(sway);

      lock.position.set(px * headRadius, py * headRadius, pz * headRadius);

      const along = direction(dx, dy, dz);
      const cone = mesh(new THREE.ConeGeometry(headRadius * 0.11, headRadius * length, 8), hair);

      // Nón mặc định chĩa +Y; lật cho mũi chĩa theo hướng lọn tóc rủ.
      cone.quaternion.setFromUnitVectors(UP, along);
      cone.position.copy(along).multiplyScalar((headRadius * length) / 2);
      lock.add(cone);
      parts.push(lock);
      trailing.push(lock);
    }
  }

  if (look.accessory === "goggles") {
    // Kính dã ngoại đẩy ngược lên tóc: quai vòng quanh đầu nghiêng (trước
    // cao, sau thấp), hai mắt kính tựa trên mái trước.
    const strap = material(GOGGLE_STRAP, materials);
    const glass = material(GOGGLE_GLASS, materials);
    const metal = material(GOGGLE_RIM, materials);

    glass.roughness = 0.12;
    glass.metalness = 0.35;
    metal.roughness = 0.4;
    metal.metalness = 0.55;

    const tilt = direction(0, 0.95, -0.3);
    const center = new THREE.Vector3(0, headRadius * 0.52, -headRadius * 0.06);
    const ringRadius = headRadius * 0.93;
    const band = mesh(new THREE.TorusGeometry(ringRadius, headRadius * 0.045, 6, 28), strap, center.toArray());

    band.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tilt);
    parts.push(band);

    const ahead = direction(0, 0.37, 0.93);

    for (const side of [-1, 1]) {
      const at = center
        .clone()
        .addScaledVector(ahead, ringRadius * Math.cos(0.45))
        .addScaledVector(new THREE.Vector3(1, 0, 0), side * ringRadius * Math.sin(0.45));
      const out = at.clone().normalize();
      const rim = mesh(new THREE.CylinderGeometry(headRadius * 0.24, headRadius * 0.24, headRadius * 0.14, 18), metal, at.toArray());
      const lens = mesh(
        new THREE.CylinderGeometry(headRadius * 0.19, headRadius * 0.19, headRadius * 0.05, 18),
        glass,
        at.clone().addScaledVector(out, headRadius * 0.07).toArray(),
      );

      rim.quaternion.setFromUnitVectors(UP, out);
      lens.quaternion.copy(rim.quaternion);
      parts.push(rim, lens);
    }
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

/**
 * Áo khoác gió mở vạt + balo + túi đeo chéo. Gắn vào `body` để lắc theo thân;
 * trả về những group lủng lẳng (móc khoá, túi đeo chéo).
 */
function buildAdventurer(
  girth: number,
  bodyHeight: number,
  body: THREE.Group,
  jacket: THREE.Material,
  trim: THREE.Material,
  materials: THREE.MeshStandardMaterial[],
): THREE.Group[] {
  const h = girth;
  // Mặt trước/sau thân áo (bán kính capsule 0.135h, ép dẹt 0.82).
  const front = h * 0.113;
  const leather = material(LEATHER, materials);

  // Vạt áo mở lộ áo thun trắng sọc xám, hai nẹp lót vàng hai bên vạt.
  body.add(
    mesh(new THREE.BoxGeometry(h * 0.1, bodyHeight * 0.62, h * 0.02), material(TEE, materials), [0, bodyHeight * 0.48, front]),
  );

  const stripe = material(TEE_STRIPE, materials);

  for (const height of [0.28, 0.36, 0.44, 0.52, 0.6, 0.68]) {
    body.add(mesh(new THREE.BoxGeometry(h * 0.101, h * 0.01, h * 0.022), stripe, [0, bodyHeight * height, front]));
  }

  for (const side of [-1, 1]) {
    body.add(
      mesh(new THREE.BoxGeometry(h * 0.022, bodyHeight * 0.66, h * 0.03), trim, [side * h * 0.061, bodyHeight * 0.47, front]),
      // Túi dưới: thân xanh, nắp vàng.
      mesh(new THREE.BoxGeometry(h * 0.065, bodyHeight * 0.14, h * 0.02), jacket, [side * h * 0.1, bodyHeight * 0.22, h * 0.13]),
      mesh(new THREE.BoxGeometry(h * 0.068, bodyHeight * 0.05, h * 0.024), trim, [side * h * 0.1, bodyHeight * 0.3, h * 0.13]),
    );
  }

  // Mũ trùm lớn rủ sau gáy, lót vàng lộ ra quanh cổ.
  const hood = mesh(new THREE.SphereGeometry(h * 0.075, 14, 10), jacket, [0, bodyHeight * 0.9, -h * 0.09]);

  hood.scale.set(1.6, 0.85, 0.9);
  body.add(hood);

  const lining = mesh(new THREE.TorusGeometry(h * 0.088, h * 0.02, 8, 20), trim, [0, bodyHeight * 0.88, -h * 0.01]);

  lining.rotation.x = Math.PI / 2 + 0.25;
  body.add(lining);

  // ── Balo da nâu ──────────────────────────────────────────────────────────
  const back = -h * 0.16;

  body.add(
    mesh(new THREE.BoxGeometry(h * 0.19, bodyHeight * 0.55, h * 0.09), leather, [0, bodyHeight * 0.5, back]),
    mesh(new THREE.BoxGeometry(h * 0.195, bodyHeight * 0.16, h * 0.095), material(LEATHER_DARK, materials), [0, bodyHeight * 0.72, back - h * 0.004]),
  );

  // Quai đeo qua vai xuống ngực.
  for (const side of [-1, 1]) {
    body.add(mesh(new THREE.BoxGeometry(h * 0.026, bodyHeight * 0.5, h * 0.012), leather, [side * h * 0.085, bodyHeight * 0.58, front + h * 0.006]));
  }

  // Diều vải xanh ngọc giắt sau balo, ló lên khỏi vai phải.
  const kite = mesh(new THREE.BoxGeometry(h * 0.1, h * 0.1, h * 0.006), material(KITE_CLOTH, materials), [-h * 0.085, bodyHeight * 0.92, back - h * 0.03]);

  kite.rotation.z = Math.PI / 4 + 0.25;
  body.add(kite);

  // Cánh lượn gấp cuộn ngang dưới đáy balo, hai đai buộc.
  const glider = mesh(new THREE.CylinderGeometry(h * 0.035, h * 0.035, h * 0.22, 12), material(GLIDER, materials), [0, bodyHeight * 0.17, back]);

  glider.rotation.z = Math.PI / 2;
  body.add(glider);

  for (const side of [-1, 1]) {
    const tie = mesh(new THREE.TorusGeometry(h * 0.037, h * 0.006, 6, 14), leather, [side * h * 0.06, bodyHeight * 0.17, back]);

    tie.rotation.y = Math.PI / 2;
    body.add(tie);
  }

  // Dây đeo chéo từ vai trái (+x) xuống túi da bên hông phải (−x).
  const sling = mesh(new THREE.BoxGeometry(h * 0.016, bodyHeight * 0.95, h * 0.01), leather, [-h * 0.01, bodyHeight * 0.5, front + h * 0.016]);

  sling.rotation.z = -0.62;
  body.add(sling);

  const satchel = swinging(0.35);

  satchel.position.set(-h * 0.13, bodyHeight * 0.2, h * 0.1);
  satchel.add(
    mesh(new THREE.BoxGeometry(h * 0.075, h * 0.07, h * 0.035), leather, [0, -h * 0.04, 0]),
    mesh(new THREE.BoxGeometry(h * 0.077, h * 0.03, h * 0.038), material(LEATHER_DARK, materials), [0, -h * 0.018, 0.001]),
  );

  // Móc khoá đồng treo ở khoá kéo ngực — lắc theo bước chân.
  const charm = swinging(1);

  charm.position.set(-h * 0.05, bodyHeight * 0.66, front + h * 0.02);
  charm.add(
    mesh(new THREE.CylinderGeometry(h * 0.003, h * 0.003, h * 0.04, 4), leather, [0, -h * 0.02, 0]),
    mesh(new THREE.BoxGeometry(h * 0.016, h * 0.03, h * 0.006), material(CHARM, materials), [0, -h * 0.05, 0]),
  );

  body.add(satchel, charm);

  return [charm, satchel];
}

/** Group treo lủng lẳng; `sway` là độ bay theo đà (lớp animation đọc). */
function swinging(sway: number): THREE.Group {
  const group = new THREE.Group();

  group.userData.sway = sway;

  return group;
}

function direction(x: number, y: number, z: number): THREE.Vector3 {
  return new THREE.Vector3(x, y, z).normalize();
}

const UP = new THREE.Vector3(0, 1, 0);

/** Búi tóc rối: hướng từ tâm đầu + cỡ (theo bán kính đầu). */
const MESSY_TUFTS: readonly [number, number, number, number][] = [
  [0, 1, 0.25, 0.32],
  [0.5, 0.82, 0.15, 0.27],
  [-0.48, 0.84, 0.2, 0.29],
  [0.25, 0.78, -0.55, 0.3],
  [-0.32, 0.72, -0.6, 0.28],
  [0.66, 0.5, -0.4, 0.24],
  [-0.66, 0.52, -0.32, 0.25],
  [0, 0.45, -0.88, 0.27],
];

/** Lọn tóc: chỗ treo [x,y,z] · hướng rủ [x,y,z] · dài · độ bay. */
const MESSY_LOCKS: readonly [number, number, number, number, number, number, number, number][] = [
  [-0.2, 0.74, 0.72, -0.2, -0.75, 0.6, 0.42, 0.25],
  [0.12, 0.78, 0.7, 0.15, -0.7, 0.65, 0.36, 0.25],
  [0.38, 0.7, 0.66, 0.35, -0.8, 0.45, 0.3, 0.25],
  [-0.9, 0.35, 0.15, -0.15, -1, 0.1, 0.46, 0.8],
  [0.9, 0.35, 0.15, 0.15, -1, 0.1, 0.46, 0.8],
  [-0.3, 0.1, -0.96, -0.3, -0.6, -0.7, 0.4, 0.5],
  [0.3, 0.15, -0.96, 0.3, -0.6, -0.7, 0.4, 0.5],
];

const BOOT_SOLE = 0x3a2e26;
const SOCK = 0xf4f1ea;
const TEE = 0xf3ecdc;
const TEE_STRIPE = 0x8d929a;
const LEATHER = 0x7a4e2e;
const LEATHER_DARK = 0x5a3820;
const KITE_CLOTH = 0x5fb3b0;
const GLIDER = 0xe9dcc0;
const CHARM = 0xc9a14a;
const GOGGLE_RIM = 0x9aa0a6;
const GOGGLE_STRAP = 0x5a3a26;
const GOGGLE_GLASS = 0x9fd6e2;

/** Màu da sẫm hơn cho mũi — cùng tông, không phải màu mới. */
function skinShadow(skin: number): number {
  const color = new THREE.Color(skin);

  color.multiplyScalar(0.88);

  return color.getHex();
}
