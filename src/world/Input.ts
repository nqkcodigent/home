import type { MotionInput } from "./character/motion";

/**
 * Input — bàn phím, chuột và cần điều khiển cảm ứng, quy về một ảnh chụp
 * trạng thái duy nhất cho mỗi frame.
 *
 * So với bản gốc (character-threejs dùng nipplejs + gamepad riêng), ở đây
 * gộp lại: lớp này chỉ biết "đang giữ gì" và "vừa bấm gì", còn cần điều khiển
 * trên màn hình chỉ là một bộ nguồn nữa gọi vào `setStick()`.
 *
 * Ba thứ được tách bạch:
 *  - `snapshot()`   trạng thái giữ phím, cho chuyển động
 *  - `consume*()`   sự kiện một lần (tương tác), tự xoá sau khi đọc
 *  - `look()`       delta kéo chuột trong frame này, cho camera
 */

export type InputDevice = "keyboard" | "touch";

const FORWARD_KEYS = new Set(["KeyW", "ArrowUp"]);
const BACK_KEYS = new Set(["KeyS", "ArrowDown"]);
const LEFT_KEYS = new Set(["KeyA", "ArrowLeft"]);
const RIGHT_KEYS = new Set(["KeyD", "ArrowRight"]);
const RUN_KEYS = new Set(["ShiftLeft", "ShiftRight"]);

/** Phím vừa bấm mà hệ thống khác (dialog) cũng dùng — không nuốt của nhau. */
const INTERACT_KEYS = new Set(["KeyE", "Enter"]);
const PAUSE_KEYS = new Set(["KeyM"]);

export interface LookDelta {
  x: number;
  y: number;
  zoom: number;
}

export class Input {
  private readonly held = new Set<string>();

  private readonly element: HTMLElement;

  private readonly disposers: (() => void)[] = [];

  private interacted = false;

  private muted = false;

  private stick = { forward: 0, right: 0 };

  private lookX = 0;

  private lookY = 0;

  private zoom = 0;

  private interactQueued = false;

  private pauseQueued = false;

  private dragging = false;

  private activePointer: number | undefined;

  private lastPointer = { x: 0, y: 0 };

  private device: InputDevice;

  constructor(element: HTMLElement) {
    this.element = element;

    this.device =
      window.matchMedia?.("(pointer: coarse)").matches === true
        ? "touch"
        : "keyboard";

    this.listen(window, "keydown", (event) => this.onKeyDown(event as KeyboardEvent));
    this.listen(window, "keyup", (event) => this.onKeyUp(event as KeyboardEvent));
    this.listen(window, "blur", () => this.held.clear());

    // Kéo chuột (hoặc kéo một ngón ở nửa phải màn hình) để xoay camera.
    this.listen(this.element, "pointerdown", (event) =>
      this.onPointerDown(event as PointerEvent),
    );
    this.listen(window, "pointermove", (event) =>
      this.onPointerMove(event as PointerEvent),
    );
    this.listen(window, "pointerup", (event) => this.onPointerUp(event as PointerEvent));
    this.listen(window, "pointercancel", (event) =>
      this.onPointerUp(event as PointerEvent),
    );

    // Kéo chuột phải để ngắm cũng rất dễ; chặn menu chuột phải trong khung game.
    this.listen(this.element, "contextmenu", (event) => event.preventDefault());

    this.listen(
      this.element,
      "wheel",
      (event) => {
        const wheel = event as WheelEvent;
        this.zoom += Math.sign(wheel.deltaY) * 0.35;
      },
      { passive: true },
    );
  }

  get currentDevice(): InputDevice {
    return this.device;
  }

  /** Người chơi đã chạm vào game chưa — dùng để biết AudioContext được phép chạy. */
  get hasInteracted(): boolean {
    return this.interacted;
  }

  dispose() {
    for (const dispose of this.disposers) dispose();

    this.disposers.length = 0;
  }

  /**
   * Khoá nhận input (lúc đang đọc thoại): phím được nhả sạch để nhân vật
   * không chạy tiếp sau khi người chơi đóng dialog.
   */
  setMuted(muted: boolean) {
    this.muted = muted;

    if (muted) {
      this.held.clear();
      this.stick = { forward: 0, right: 0 };
    }
  }

  /** Cần điều khiển trên màn hình; toạ độ đã chuẩn hoá về -1…1. */
  setStick(right: number, forward: number) {
    this.stick = { forward, right };
  }

  releaseStick() {
    this.stick = { forward: 0, right: 0 };
  }

  /** Nút tương tác trên màn hình: coi như vừa bấm phím tương tác. */
  queueInteract() {
    this.interactQueued = true;
    this.interacted = true;
  }

  /** Trạng thái di chuyển trong frame này. */
  snapshot(): MotionInput {
    if (this.muted) {
      return { forward: 0, right: 0, run: false };
    }

    let forward = 0;
    let right = 0;

    for (const code of this.held) {
      if (FORWARD_KEYS.has(code)) forward += 1;
      if (BACK_KEYS.has(code)) forward -= 1;
      if (RIGHT_KEYS.has(code)) right += 1;
      if (LEFT_KEYS.has(code)) right -= 1;
    }

    const run = [...this.held].some((code) => RUN_KEYS.has(code));

    // Cần điều khiển cộng thêm rồi kẹp lại: vừa đẩy cần vừa giữ phím vẫn êm.
    return {
      forward: clamp(forward + this.stick.forward),
      right: clamp(right + this.stick.right),
      run,
    };
  }

  /** Delta xoay camera trong frame này, đọc xong là hết. */
  look(): LookDelta {
    const delta = { x: this.lookX, y: this.lookY, zoom: this.zoom };

    this.lookX = 0;
    this.lookY = 0;
    this.zoom = 0;

    return delta;
  }

  /** true nếu trong frame này người chơi bấm phím tương tác. */
  consumeInteract(): boolean {
    const pressed = this.interactQueued;

    this.interactQueued = false;

    return pressed && !this.muted;
  }

  /** true nếu người chơi vừa bấm phím bật/tắt âm thanh. */
  consumePauseToggle(): boolean {
    const pressed = this.pauseQueued;

    this.pauseQueued = false;

    return pressed;
  }

  private listen(
    target: EventTarget,
    type: string,
    handler: (event: Event) => void,
    options?: AddEventListenerOptions,
  ) {
    target.addEventListener(type, handler, options);
    this.disposers.push(() => target.removeEventListener(type, handler, options));
  }

  private onKeyDown(event: KeyboardEvent) {
    const code = event.code;

    if (INTERACT_KEYS.has(code)) {
      this.interactQueued = true;
    }

    if (PAUSE_KEYS.has(code)) {
      this.pauseQueued = true;
    }

    // Space/Enter đang là "đọc tiếp" của dialog — không đánh dấu là di chuyển.
    if (FORWARD_KEYS.has(code) || BACK_KEYS.has(code) || LEFT_KEYS.has(code) || RIGHT_KEYS.has(code)) {
      event.preventDefault();
    }

    this.held.add(code);
    this.interacted = true;
  }

  private onKeyUp(event: KeyboardEvent) {
    this.held.delete(event.code);
  }

  private onPointerDown(event: PointerEvent) {
    this.interacted = true;
    this.dragging = true;
    this.activePointer = event.pointerId;

    if (this.device === "touch") {
      // Ngón ở nửa trái màn hình là của cần điều khiển.
      if (event.clientX < window.innerWidth * 0.45) {
        this.dragging = false;
        this.activePointer = undefined;

        return;
      }
    }

    this.lastPointer = { x: event.clientX, y: event.clientY };
  }

  private onPointerMove(event: PointerEvent) {
    if (!this.dragging || event.pointerId !== this.activePointer) return;

    this.lookX += event.clientX - this.lastPointer.x;
    this.lookY += event.clientY - this.lastPointer.y;

    this.lastPointer = { x: event.clientX, y: event.clientY };
  }

  private onPointerUp(event: PointerEvent) {
    if (event.pointerId !== this.activePointer) return;

    this.dragging = false;
    this.activePointer = undefined;
  }
}

function clamp(value: number): number {
  return Math.min(1, Math.max(-1, value));
}
