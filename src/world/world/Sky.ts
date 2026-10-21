import * as THREE from "three";

import { disposeObject } from "./dispose";

/**
 * Bầu trời, nắng, mây, sương và bụi nắng.
 *
 * Bản gốc dùng TSL/node material cho trời và mây. Ở đây chỉ cần một dải màu
 * dọc + quầng nắng, nên một shader nhỏ là đủ và nhẹ hơn nhiều — không kéo
 * theo WebGPURenderer chỉ để vẽ gradient.
 *
 * Hai preset: `goldenHour` (buổi chiều tuổi thơ — vàng mật ong) và `night`
 * (xanh đêm, trăng lạnh). `setDusk()` trôi dần từ preset dựng sang `night`:
 * trời ngả chiều theo tiến trình của người chơi, và bụi nắng hoá đom đóm.
 */

/** Màu đom đóm — bụi nắng đổi sang màu này khi trời tối. */
const FIREFLY = 0xd8ff7a;

/** Tốc độ trời trôi về mức chạng vạng mới (1/giây) — một buổi hoàng hôn, không phải công tắc. */
const DUSK_RATE = 0.35;

export interface SkyPreset {
  top: number;
  horizon: number;
  fog: number;
  fogDensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sun: number;
  sunIntensity: number;
  sunPosition: [number, number, number];
  /** Cường độ quầng sáng quanh mặt trời trên vòm trời */
  glow: number;
  cloud: number;
  cloudOpacity: number;
  dust: number;
}

export const SKY_PRESETS: Record<"goldenHour" | "night", SkyPreset> = {
  goldenHour: {
    top: 0x7fc3ef,
    horizon: 0xffe6bd,
    fog: 0xf3ddb9,
    // Sương xa dày hơn một chút: đồi xa nhạt dần vào trời như tranh màu nước.
    fogDensity: 0.0095,
    hemiSky: 0xc4e2ff,
    // Ánh dội từ cỏ ấm lên: bóng đổ ngả xanh lục-ấm chứ không đen đặc.
    hemiGround: 0x8a9a5a,
    hemiIntensity: 1.05,
    sun: 0xffd9a0,
    sunIntensity: 1.95,
    sunPosition: [-26, 22, 30],
    glow: 0.85,
    cloud: 0xfff6ea,
    cloudOpacity: 0.9,
    dust: 0xfff0c4,
  },

  night: {
    top: 0x101a33,
    horizon: 0x2b3a5c,
    fog: 0x1a2440,
    fogDensity: 0.012,
    hemiSky: 0x3b5080,
    hemiGround: 0x232a38,
    // Ban đêm trong nhà: nếu để sáng như ngoài trời thì căn hộ hết trống trải,
    // nhưng để tối quá thì không nhìn ra được đồ đạc. 0,6 là mức đọc được hình.
    hemiIntensity: 0.6,
    sun: 0xa9c3ff,
    sunIntensity: 1.1,
    sunPosition: [18, 26, -20],
    glow: 0.5,
    cloud: 0x4a5a80,
    cloudOpacity: 0.55,
    dust: 0xbfd4ff,
  },
};

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDirection;

  void main() {
    vDirection = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 topColor;
  uniform vec3 horizonColor;
  uniform vec3 glowColor;
  uniform vec3 sunDirection;
  uniform float glowStrength;

  varying vec3 vDirection;

  void main() {
    // Bão hoà ở đường chân trời rồi tan dần lên đỉnh.
    float height = clamp(vDirection.y, -1.0, 1.0);
    float blend = smoothstep(-0.02, 0.55, height);

    vec3 color = mix(horizonColor, topColor, blend);

    // Quầng nắng: mũi nhọn quanh hướng mặt trời + một lớp mờ rộng.
    float alignment = max(dot(normalize(vDirection), normalize(sunDirection)), 0.0);
    color += glowColor * (pow(alignment, 48.0) * 0.9 + pow(alignment, 6.0) * 0.18) * glowStrength;

    gl_FragColor = vec4(color, 1.0);

    #include <colorspace_fragment>
  }
`;

export class Sky {
  readonly group = new THREE.Group();

  readonly sun: THREE.DirectionalLight;

  readonly hemi: THREE.HemisphereLight;

  private readonly clouds: THREE.Group;

  private readonly dust: THREE.Points;

  private readonly dustPositions: Float32Array;

  private readonly preset: SkyPreset;

  private readonly night = SKY_PRESETS.night;

  private readonly dome: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;

  private readonly cloudMaterial: THREE.MeshStandardMaterial;

  private fog: THREE.FogExp2 | undefined;

  /** Vị trí mặt trời hiện tại — trôi theo chạng vạng, bóng đổ bám theo nó. */
  private readonly sunPosition: THREE.Vector3;

  private dusk = 0;

  private duskTarget = 0;

  private readonly scratch = new THREE.Color();

  constructor(preset: SkyPreset, dustCount = 140) {
    this.preset = preset;
    this.sunPosition = new THREE.Vector3(...preset.sunPosition);

    this.group.name = "sky";

    // ── Vòm trời ───────────────────────────────────────────────────────────
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(280, 32, 20),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          topColor: { value: new THREE.Color(preset.top) },
          horizonColor: { value: new THREE.Color(preset.horizon) },
          glowColor: { value: new THREE.Color(preset.sun) },
          sunDirection: {
            value: new THREE.Vector3(...preset.sunPosition).normalize(),
          },
          glowStrength: { value: preset.glow },
        },
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
      }),
    );

    dome.frustumCulled = false;
    this.dome = dome;
    this.group.add(dome);

    // ── Ánh sáng ───────────────────────────────────────────────────────────
    this.hemi = new THREE.HemisphereLight(
      preset.hemiSky,
      preset.hemiGround,
      preset.hemiIntensity,
    );

    this.sun = new THREE.DirectionalLight(preset.sun, preset.sunIntensity);

    this.sun.position.set(...preset.sunPosition);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 120;
    this.sun.shadow.camera.left = -34;
    this.sun.shadow.camera.right = 34;
    this.sun.shadow.camera.top = 34;
    this.sun.shadow.camera.bottom = -34;
    // Chống "bóng răng cưa" trên mặt phẳng nghiêng (self-shadow acne).
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.03;
    // Viền bóng mềm — nét bóng của tranh vẽ, không phải nhát dao.
    this.sun.shadow.radius = 4;

    this.group.add(this.hemi, this.sun, this.sun.target);

    // ── Mây ────────────────────────────────────────────────────────────────
    this.cloudMaterial = new THREE.MeshStandardMaterial({
      color: preset.cloud,
      roughness: 1,
      metalness: 0,
      flatShading: true,
      transparent: true,
      opacity: preset.cloudOpacity,
    });
    this.clouds = this.createClouds();

    this.group.add(this.clouds);

    // ── Bụi nắng ───────────────────────────────────────────────────────────
    this.dustPositions = new Float32Array(dustCount * 3);

    const geometry = new THREE.BufferGeometry();

    for (let i = 0; i < dustCount; i += 1) {
      this.dustPositions[i * 3] = (Math.random() - 0.5) * 26;
      this.dustPositions[i * 3 + 1] = 0.4 + Math.random() * 5;
      this.dustPositions[i * 3 + 2] = (Math.random() - 0.5) * 26;
    }

    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(this.dustPositions, 3),
    );

    this.dust = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: preset.dust,
        size: 0.09,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        map: createDustTexture(),
      }),
    );

    this.dust.frustumCulled = false;
    this.group.add(this.dust);
  }

  /** Sương mù khớp màu chân trời — để đường chân trời không bị "cắt". */
  applyFog(scene: THREE.Scene) {
    this.fog = new THREE.FogExp2(this.preset.fog, this.preset.fogDensity);
    scene.fog = this.fog;
    scene.background = null;
    this.applyDusk(this.dusk);
  }

  /** Đặt mức chạng vạng đích (0 = preset dựng, 1 = đêm); trời trôi dần tới đó. */
  setDusk(level: number, instant = false) {
    this.duskTarget = Math.min(1, Math.max(0, level));

    if (instant) {
      this.dusk = this.duskTarget;
      this.applyDusk(this.dusk);
    }
  }

  /** Mức chạng vạng ĐANG hiện (đã làm mượt) — cho test. */
  get duskLevel(): number {
    return this.dusk;
  }

  /** Đặt lại tâm vùng đổ bóng về quanh người chơi. */
  focusShadows(x: number, z: number) {
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(
      x + this.sunPosition.x * 0.6,
      this.sunPosition.y,
      z + this.sunPosition.z * 0.6,
    );
  }

  update(dt: number, elapsed: number) {
    if (Math.abs(this.duskTarget - this.dusk) > 1e-4) {
      this.dusk += (this.duskTarget - this.dusk) * (1 - Math.exp(-DUSK_RATE * dt));
      this.applyDusk(this.dusk);
    }

    // Đom đóm chớp: cả đàn cùng một vật liệu nên chỉ "thở" chung một nhịp.
    // shortcut: chớp đồng loạt, không so le từng con — cần thì thêm attribute pha + shader.
    const dust = this.dust.material as THREE.PointsMaterial;

    dust.opacity = 0.6 * (1 - this.dusk) + this.dusk * (0.55 + Math.sin(elapsed * 2.2) * 0.35);
    for (const cloud of this.clouds.children) {
      cloud.position.x += dt * 0.35;

      if (cloud.position.x > 120) cloud.position.x = -120;
    }

    this.clouds.position.y = Math.sin(elapsed * 0.1) * 0.4;

    // Bụi trôi chậm lên rồi tái sinh ở đáy — rẻ hơn particle system thật.
    const positions = this.dustPositions;

    for (let i = 0; i < positions.length; i += 3) {
      // Đom đóm lững lờ hơn bụi nắng.
      positions[i + 1] += dt * 0.22 * (1 - this.dusk * 0.7);

      if (positions[i + 1] > 6) positions[i + 1] = 0.3;
    }

    (this.dust.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate =
      true;
  }

  dispose() {
    disposeObject(this.group);
  }

  /** Nội suy mọi thông số từ preset dựng sang đêm theo `t`. */
  private applyDusk(t: number) {
    const day = this.preset;
    const night = this.night;
    const mix = (from: number, to: number) => from + (to - from) * t;
    const color = (target: THREE.Color, from: number, to: number) =>
      target.set(from).lerp(this.scratch.set(to), t);

    const uniforms = this.dome.material.uniforms;

    color(uniforms.topColor.value, day.top, night.top);
    color(uniforms.horizonColor.value, day.horizon, night.horizon);
    color(uniforms.glowColor.value, day.sun, night.sun);
    uniforms.glowStrength.value = mix(day.glow, night.glow);

    this.sunPosition.set(
      mix(day.sunPosition[0], night.sunPosition[0]),
      mix(day.sunPosition[1], night.sunPosition[1]),
      mix(day.sunPosition[2], night.sunPosition[2]),
    );
    (uniforms.sunDirection.value as THREE.Vector3).copy(this.sunPosition).normalize();

    color(this.hemi.color, day.hemiSky, night.hemiSky);
    color(this.hemi.groundColor, day.hemiGround, night.hemiGround);
    this.hemi.intensity = mix(day.hemiIntensity, night.hemiIntensity);

    color(this.sun.color, day.sun, night.sun);
    this.sun.intensity = mix(day.sunIntensity, night.sunIntensity);

    if (this.fog) {
      color(this.fog.color, day.fog, night.fog);
      this.fog.density = mix(day.fogDensity, night.fogDensity);
    }

    color(this.cloudMaterial.color, day.cloud, night.cloud);
    this.cloudMaterial.opacity = mix(day.cloudOpacity, night.cloudOpacity);

    const dust = this.dust.material as THREE.PointsMaterial;

    color(dust.color, day.dust, FIREFLY);
    dust.size = mix(0.09, 0.17);
  }

  private createClouds(): THREE.Group {
    const clouds = new THREE.Group();

    const material = this.cloudMaterial;

    for (let index = 0; index < 9; index += 1) {
      const cloud = new THREE.Group();

      const puffs = 3 + Math.floor(Math.random() * 4);

      for (let puff = 0; puff < puffs; puff += 1) {
        const radius = 2.4 + Math.random() * 2.6;

        const sphere = new THREE.Mesh(
          new THREE.IcosahedronGeometry(radius, 0),
          material,
        );

        sphere.position.set(
          (puff - puffs / 2) * 2.8 + Math.random(),
          Math.random() * 1.2,
          (Math.random() - 0.5) * 3,
        );

        cloud.add(sphere);
      }

      cloud.position.set(
        -110 + index * 26 + Math.random() * 8,
        30 + Math.random() * 16,
        -70 + Math.random() * 120,
      );

      clouds.add(cloud);
    }

    return clouds;
  }
}

/** Chấm tròn mờ cho bụi nắng (points mặc định là hình vuông). */
export function createDustTexture(): THREE.Texture {
  const size = 32;
  const canvas = document.createElement("canvas");

  canvas.width = size;
  canvas.height = size;

  const context = canvas.getContext("2d");

  if (context) {
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );

    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.4, "rgba(255,255,255,0.5)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }

  const texture = new THREE.CanvasTexture(canvas);

  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}
