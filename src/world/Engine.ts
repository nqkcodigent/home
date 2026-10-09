import * as THREE from "three";

/**
 * Engine — vòng đời của renderer, scene, camera và vòng lặp frame.
 *
 * Lấy ý tưởng từ `Experience` của character-threejs (Renderer + Sizes + Time +
 * Scene), nhưng gộp lại còn một lớp: ở đây chỉ có MỘT thế giới được render,
 * nên một singleton có `resize()` và `onUpdate()` là đủ, không cần hệ thống
 * event riêng.
 *
 * `dt` được kẹp trần: tab bị ẩn rồi quay lại sẽ trả về một delta vài giây, và
 * với delta đó nhân vật xuyên qua nhà.
 */

/** Không frame nào dài hơn 1/20 giây, kể cả sau khi tab bị treo. */
const MAX_DELTA = 0.05;

export interface FrameInfo {
  dt: number;
  elapsed: number;
}

export type FrameListener = (frame: FrameInfo) => void;

export class Engine {
  readonly renderer: THREE.WebGLRenderer;

  readonly scene: THREE.Scene;

  readonly camera: THREE.PerspectiveCamera;

  private readonly container: HTMLElement;

  private readonly listeners = new Set<FrameListener>();

  private readonly observer: ResizeObserver;

  private last = 0;

  private elapsed = 0;

  private running = false;

  constructor(container: HTMLElement) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });

    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.shadowMap.enabled = true;
    // PCFSoftShadowMap đã bị bỏ khỏi three 0.18x (nó tự hạ cấp kèm cảnh báo).
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";

    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();

    this.camera = new THREE.PerspectiveCamera(46, 1, 0.1, 600);

    this.observer = new ResizeObserver(() => this.resize());

    this.observer.observe(container);

    this.resize();
  }

  /** Kích thước hiện tại (CSS pixel) của khung nhìn. */
  get size(): { width: number; height: number } {
    const { clientWidth, clientHeight } = this.container;

    return {
      width: Math.max(1, clientWidth),
      height: Math.max(1, clientHeight),
    };
  }

  onUpdate(listener: FrameListener): () => void {
    this.listeners.add(listener);

    return () => this.listeners.delete(listener);
  }

  resize() {
    const { width, height } = this.size;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  start() {
    if (this.running) return;

    this.running = true;
    this.last = performance.now();

    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  stop() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
  }

  dispose() {
    this.stop();
    this.observer.disconnect();
    this.listeners.clear();
    this.renderer.domElement.remove();
    this.renderer.dispose();
  }

  private frame(time: number) {
    const dt = Math.min((time - this.last) / 1000, MAX_DELTA);

    this.last = time;
    this.elapsed += dt;

    const frame: FrameInfo = { dt, elapsed: this.elapsed };

    for (const listener of this.listeners) {
      listener(frame);
    }

    this.renderer.render(this.scene, this.camera);
  }
}
