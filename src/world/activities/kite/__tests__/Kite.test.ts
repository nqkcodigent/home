import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { KiteField, createKiteModel, kiteWorldPosition } from "../Kite";
import { describeKiteResult } from "../KiteActivity";
import { createKiteState, DEFAULT_KITE } from "../model";

import type { SkyFrame } from "../Kite";
import type { KiteState } from "../model";

function makeFrame(): SkyFrame {
  const forward = new THREE.Vector3(1, 0, 0).normalize();

  return {
    origin: new THREE.Vector3(2, 0, 5),
    forward,
    right: new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize(),
  };
}

describe("kiteWorldPosition", () => {
  it("độ cao đi thẳng lên: y = mặt đất + độ cao", () => {
    const frame = makeFrame();
    const state = { ...createKiteState(), altitude: 21.5 };

    const position = kiteWorldPosition(frame, state);

    expect(position.y).toBeCloseTo(21.5, 6);
  });

  it("dây càng dài thì diều càng bay xa theo hướng đã khai báo", () => {
    const frame = makeFrame();
    const base = { ...createKiteState(), altitude: 10 };

    const near = kiteWorldPosition(frame, { ...base, lineLength: 20 });
    const far = kiteWorldPosition(frame, { ...base, lineLength: 55 });

    expect(far.x).toBeGreaterThan(near.x);
  });

  it("lạng ngang đẩy diều theo trục ngang của vùng trời", () => {
    const frame = makeFrame();
    const base = { ...createKiteState(), altitude: 12, lineLength: 40 };

    const left = kiteWorldPosition(frame, { ...base, lateral: -6 });
    const right = kiteWorldPosition(frame, { ...base, lateral: 6 });

    expect(left.distanceTo(right)).toBeCloseTo(12, 6);
  });

  it("ở trần độ cao (0,95·dây) vẫn ra toạ độ thật, không NaN", () => {
    const frame = makeFrame();

    const atCeiling: KiteState = {
      ...createKiteState(),
      lineLength: DEFAULT_KITE.lineMax,
      altitude: DEFAULT_KITE.lineMax * DEFAULT_KITE.lineCeiling,
    };

    const position = kiteWorldPosition(frame, atCeiling);

    expect(Number.isFinite(position.x)).toBe(true);
    expect(Number.isFinite(position.y)).toBe(true);
    expect(Number.isFinite(position.z)).toBe(true);
  });

  it("không sửa vector truyền vào của khung trời", () => {
    const frame = makeFrame();
    const originBefore = frame.origin.clone();

    kiteWorldPosition(frame, createKiteState());

    expect(frame.origin.equals(originBefore)).toBe(true);
  });
});

describe("createKiteModel", () => {
  it("mỗi lần gọi là một con diều RIÊNG — sân và ván diều không dùng chung hình", () => {
    const onGrass = createKiteModel();
    const flying = createKiteModel();

    expect(onGrass.group).not.toBe(flying.group);
    expect(onGrass.tail.length).toBeGreaterThan(0);

    // Cả hai đều là hình khối thật, không phải một nhóm rỗng.
    let meshes = 0;

    onGrass.group.traverse((child) => {
      if (child instanceof THREE.Mesh) meshes += 1;
    });

    expect(meshes).toBeGreaterThan(3);

    onGrass.dispose();
    flying.dispose();
  });
});

describe("KiteField — bầu trời trong", () => {
  function materials(field: KiteField): THREE.Material[] {
    const found: THREE.Material[] = [];

    field.group.traverse((child) => {
      if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Line)) return;

      const list = Array.isArray(child.material) ? child.material : [child.material];

      found.push(...(list as THREE.Material[]));
    });

    return found;
  }

  it("không còn vật liệu cộng sáng nào — đó là thứ tạo ra cột sáng", () => {
    const field = new KiteField();

    for (const material of materials(field)) {
      expect(material.blending).not.toBe(THREE.AdditiveBlending);
    }

    field.dispose();
  });

  it("trên trời chỉ có con diều — không cột sáng, không dấu vết che tầm nhìn", () => {
    const field = new KiteField();

    // Ngoài con diều và sợi dây, nhóm không còn gì khác.
    expect(field.group.children).toHaveLength(2);

    field.dispose();
  });
});

describe("describeKiteResult", () => {
  const base: KiteState = { ...createKiteState(), score: 412.6, best: 38.4 };

  it("hai cách kết thúc cho hai lời khác nhau", () => {
    const titles = (["snapped", "stowed"] as const).map(
      (outcome) => describeKiteResult({ ...base, over: true, outcome }).title,
    );

    expect(new Set(titles).size).toBe(2);
  });

  it("giữ nguyên điểm và độ cao cao nhất, đã làm tròn", () => {
    const result = describeKiteResult({ ...base, over: true, outcome: "stowed" });

    expect(result.score).toBe(413);
    expect(result.bestAltitude).toBe(38);
    expect(result.outcome).toBe("stowed");
  });

  it("dây đứt rồi mà người chơi cất diều thì nhắc tới chuyện đi lạc", () => {
    const result = describeKiteResult({
      ...base,
      over: true,
      outcome: "snapped",
      snapAt: 22,
    });

    expect(result.title).toBe("Đứt dây");
    expect(result.detail).toContain("trôi");
  });

  it("chưa có kết quả thì coi như cất diều — không bao giờ trả về undefined", () => {
    const result = describeKiteResult(base);

    expect(result.outcome).toBe("stowed");
    expect(result.detail.length).toBeGreaterThan(0);
  });
});
