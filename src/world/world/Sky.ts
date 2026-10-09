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
 * (căn hộ người lớn — xanh đêm, trăng lạnh).
 */

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
    fogDensity: 0.0072,
    hemiSky: 0xbfe4ff,
    hemiGround: 0x6f8a4a,
    hemiIntensity: 0.72,
    sun: 0xffd9a0,
    sunIntensity: 2.15,
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

  constructor(preset: SkyPreset, dustCount = 140) {
    this.preset = preset;

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

    this.group.add(this.hemi, this.sun, this.sun.target);

    // ── Mây ────────────────────────────────────────────────────────────────
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
    scene.fog = new THREE.FogExp2(this.preset.fog, this.preset.fogDensity);
    scene.background = null;
  }

  /** Đặt lại tâm vùng đổ bóng về quanh người chơi. */
  focusShadows(x: number, z: number) {
    this.sun.target.position.set(x, 0, z);
    this.sun.position.set(
      x + this.preset.sunPosition[0] * 0.6,
      this.preset.sunPosition[1],
      z + this.preset.sunPosition[2] * 0.6,
    );
  }

  update(dt: number, elapsed: number) {
    for (const cloud of this.clouds.children) {
      cloud.position.x += dt * 0.35;

      if (cloud.position.x > 120) cloud.position.x = -120;
    }

    this.clouds.position.y = Math.sin(elapsed * 0.1) * 0.4;

    // Bụi trôi chậm lên rồi tái sinh ở đáy — rẻ hơn particle system thật.
    const positions = this.dustPositions;

    for (let i = 0; i < positions.length; i += 3) {
      positions[i + 1] += dt * 0.22;

      if (positions[i + 1] > 6) positions[i + 1] = 0.3;
    }

    (this.dust.geometry.getAttribute("position") as THREE.BufferAttribute).needsUpdate =
      true;
  }

  dispose() {
    disposeObject(this.group);
  }

  private createClouds(): THREE.Group {
    const clouds = new THREE.Group();

    const material = new THREE.MeshStandardMaterial({
      color: this.preset.cloud,
      roughness: 1,
      metalness: 0,
      flatShading: true,
      transparent: true,
      opacity: this.preset.cloudOpacity,
    });

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
