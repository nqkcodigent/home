import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { KITE_HEIGHT } from "../Kite";
import {
  autoShotMode,
  climbFov,
  kiteShot,
  nextShotMode,
  resolveShotMode,
  shakeAmount,
} from "../kiteCamera";

import type { KiteShotContext } from "../kiteCamera";

function context(overrides: Partial<KiteShotContext> = {}): KiteShotContext {
  return {
    frame: {
      origin: new THREE.Vector3(0, 0, 0),
      forward: new THREE.Vector3(1, 0, 0),
      right: new THREE.Vector3(0, 0, -1),
    },
    kite: new THREE.Vector3(30, 25, 0),
    velocity: new THREE.Vector3(),
    altitude: 25,
    climb: 0,
    tension: 0.4,
    snapTension: 1,
    t: 10,
    adrift: false,
    driftTime: 0,
    inThermal: false,
    ...overrides,
  };
}

/** Diều có nằm trong khung không — đo bằng toạ độ chuẩn hoá sau khi chiếu. */
function projected(ctx: KiteShotContext, mode: Parameters<typeof kiteShot>[0]) {
  const shot = kiteShot(mode, ctx);
  const camera = new THREE.PerspectiveCamera(shot.fov, 16 / 9, 0.1, 600);

  camera.position.copy(shot.position);
  camera.lookAt(shot.look);
  camera.updateMatrixWorld();

  return ctx.kite.clone().project(camera);
}

describe("kiteCamera — góc máy", () => {
  it("phím đổi góc xoay vòng qua đủ bốn góc rồi quay lại", () => {
    expect(nextShotMode("drift")).toBe("wide");
    expect(nextShotMode("wide")).toBe("eyes");
    expect(nextShotMode("eyes")).toBe("auto");
    expect(nextShotMode("auto")).toBe("drift");
  });

  it("vào ván là bay theo diều ngay — không có màn mở đầu nào chen giữa", () => {
    const first = context({ t: 0.1 });

    expect(resolveShotMode("drift", first)).toBe("drift");
  });

  it("góc người chơi chọn được dùng ngay từ đầu ván", () => {
    const early = context({ t: 0.5 });

    expect(resolveShotMode("drift", early)).toBe("drift");
    expect(resolveShotMode("eyes", early)).toBe("eyes");
    expect(resolveShotMode("wide", early)).toBe("wide");
  });

  it("đứt dây rồi thì chỉ còn một cảnh: bay theo diều", () => {
    const adrift = context({ t: 24, adrift: true, driftTime: 6 });

    expect(resolveShotMode("eyes", adrift)).toBe("drift");
    expect(resolveShotMode("wide", adrift)).toBe("drift");
    expect(resolveShotMode("auto", adrift)).toBe("drift");
  });

  it("góc mắt nhân vật đặt ở tầm đầu và ngắm đúng con diều", () => {
    const ctx = context();
    const shot = kiteShot("eyes", ctx);

    expect(shot.position.y).toBeCloseTo(1.45, 2);
    expect(shot.look.equals(ctx.kite)).toBe(true);
  });

  it("bay theo diều: camera lùi NGƯỢC hướng bay và ở trên con diều", () => {
    const ctx = context({
      kite: new THREE.Vector3(30, 25, 0),
      velocity: new THREE.Vector3(4, -1, 0),
      altitude: 25,
    });

    const shot = kiteShot("drift", ctx);

    expect(shot.position.x).toBeLessThan(ctx.kite.x);
    expect(shot.position.y).toBeGreaterThan(ctx.kite.y);

    // Và nó đã BAY LÊN: camera ở đúng tầm cao của con diều, cách sân hàng
    // chục mét — đây là điều khác hẳn góc nhìn thứ ba đứng dưới đất.
    expect(shot.position.y).toBeGreaterThan(24);
    expect(Math.hypot(shot.position.x, shot.position.z)).toBeGreaterThan(10);

    // Camera ở SAU diều, nên theo phương ngang nó gần sân hơn con diều.
    expect(Math.hypot(shot.position.x, shot.position.z)).toBeLessThan(
      Math.hypot(ctx.kite.x, ctx.kite.z),
    );
  });

  it("bay theo diều: camera lượn theo hướng bay, không phải theo hướng thả", () => {
    // Diều bị gió đẩy trôi sang ngang: vận tốc gần như vuông góc với hướng
    // thả. Camera phải lùi về phía NGƯỢC LẠI của vận tốc đó.
    const ctx = context({
      kite: new THREE.Vector3(30, 25, 6),
      velocity: new THREE.Vector3(0, -1, 5),
    });

    const shot = kiteShot("drift", ctx);
    const toCamera = shot.position.clone().sub(ctx.kite);

    expect(toCamera.z).toBeLessThan(0);
    expect(toCamera.length()).toBeGreaterThan(8);
  });

  it("bay theo diều: diều luôn nằm TRONG khung, ở mọi độ cao và mọi lúc trôi", () => {
    for (const altitude of [8, 20, 40, 70]) {
      for (const driftTime of [0, 8, 30]) {
        const ctx = context({
          altitude,
          kite: new THREE.Vector3(30, altitude, 4),
          velocity: new THREE.Vector3(3, -1.4, 1),
          adrift: driftTime > 0,
          driftTime,
        });

        const projectedPoint = projected(ctx, "drift");

        expect(Math.abs(projectedPoint.x), `cao ${altitude} m`).toBeLessThan(0.9);
        expect(projectedPoint.y, `cao ${altitude} m`).toBeLessThan(0.8);
        expect(projectedPoint.y, `cao ${altitude} m`).toBeGreaterThan(-0.95);
      }
    }
  });

  it("bay theo diều: càng trôi lâu và càng cao thì khung càng rộng ra", () => {
    const near = kiteShot(
      "drift",
      context({ altitude: 10, kite: new THREE.Vector3(30, 10, 0) }),
    );

    const far = kiteShot(
      "drift",
      context({
        altitude: 60,
        kite: new THREE.Vector3(30, 60, 0),
        adrift: true,
        driftTime: 25,
      }),
    );

    // Ống kính rộng hơn, và tầm với cũng xa hơn — nhưng phải có trần, không
    // thì con diều lại chỉ còn là một điểm ảnh như cảnh "lùi theo độ cao".
    expect(far.fov).toBeGreaterThan(near.fov);
    expect(far.position.distanceTo(new THREE.Vector3(30, 60, 0))).toBeLessThan(32);
    expect(far.position.distanceTo(new THREE.Vector3(30, 60, 0))).toBeGreaterThan(
      near.position.distanceTo(new THREE.Vector3(30, 10, 0)),
    );
  });

  it("toàn cảnh đứng cùng phía người chơi và thấp hơn tâm ngắm để ngước lên", () => {
    const ctx = context();
    const shot = kiteShot("wide", ctx);

    expect(shot.position.x).toBeLessThan(ctx.kite.x);
    expect(shot.position.y).toBeLessThan(shot.look.y);
    expect(shot.position.y).toBeGreaterThanOrEqual(2);

    // Và luôn ở phía sau tâm ngắm: xa con diều hơn tâm ngắm, để con diều là
    // thứ ở trên khung chứ không phải thứ lao tới mặt camera.
    expect(shot.position.distanceTo(ctx.kite)).toBeGreaterThan(
      shot.look.distanceTo(ctx.kite),
    );
  });

  it("toàn cảnh giữ diều ở kích thước ĐỌC ĐƯỢC suốt cả ván", () => {
    // Ván diều chỉ có nghĩa nếu người chơi nhìn thấy con diều. Đo bằng phần
    // trăm chiều cao khung hình mà cả cánh lẫn đuôi chiếm — dưới 9% thì nó
    // là một đốm, trên 40% thì mất luôn cảnh quan.
    for (const altitude of [8, 20, 40, 57]) {
      const ctx = context({ altitude, kite: new THREE.Vector3(30, altitude, 0) });
      const shot = kiteShot("wide", ctx);
      const distance = shot.position.distanceTo(ctx.kite);
      const percent =
        (KITE_HEIGHT / (2 * Math.tan((shot.fov * Math.PI) / 360) * distance)) * 100;

      expect(percent).toBeGreaterThan(9);
      expect(percent).toBeLessThan(40);
    }
  });

  it("diều luôn nằm TRONG khung ở góc toàn cảnh, mọi độ cao", () => {
    // Lỗi thật đã xảy ra: ngắm vào điểm giữa dây, nên ở 40 m con diều vượt ra
    // ngoài mép trên — người chơi đang thả diều mà không nhìn thấy diều.
    for (const altitude of [8, 16, 28, 44, 57]) {
      const ctx = context({ altitude, kite: new THREE.Vector3(30, altitude, 0) });
      const projectedPoint = projected(ctx, "wide");

      expect(Math.abs(projectedPoint.x)).toBeLessThan(0.9);
      expect(Math.abs(projectedPoint.y)).toBeLessThan(0.9);
    }
  });

  it("chế độ tự động đổi góc theo nhịp và nhường cho sự kiện", () => {
    // `t` phải nằm sau màn mở đầu, nếu không luật "khung rộng ra" ghi đè hết.
    expect(autoShotMode(context({ t: 1 }))).toBe("wide");
    expect(autoShotMode(context({ t: 7 }))).toBe("eyes");
    expect(autoShotMode(context({ t: 13 }))).toBe("drift");

    expect(autoShotMode(context({ t: 1, tension: 0.9 }))).toBe("eyes");
    expect(autoShotMode(context({ t: 1, inThermal: true }))).toBe("drift");
    expect(autoShotMode(context({ t: 1, adrift: true }))).toBe("drift");
  });

  it("rung chỉ bắt đầu khi dây căng quá 70% và kịch ở ngưỡng đứt", () => {
    expect(shakeAmount(0.5, 1)).toBe(0);
    expect(shakeAmount(0.85, 1)).toBeCloseTo(0.5, 5);
    expect(shakeAmount(1.2, 1)).toBe(1);
  });

  it("ống kính nới theo tốc độ leo, có trần, không co khi diều rơi", () => {
    expect(climbFov(58, -5)).toBe(58);
    expect(climbFov(58, 4)).toBe(64);
    expect(climbFov(58, 50)).toBe(70);
  });
});
