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
const CAMERA_KEYS = new Set(["KeyC"]);

/**
 * Phím THOÁT ván con — lối ra duy nhất khỏi mọi trò chơi con (thả diều, bơi
 * ao, đá cầu).
 *
 * `R` không trùng phím nào khác của các ván, nên `A`/`D` vẫn là lạng — một
 * phím hai nghĩa là chỗ chắc chắn sẽ có người bấm nhầm.
 */
const EXIT_KEYS = new Set(["KeyR"]);

/** Trục lạng của diều — cùng cặp phím trái/phải với lúc đi bộ. */
const KITE_STEER_LEFT = LEFT_KEYS;
const KITE_STEER_RIGHT = RIGHT_KEYS;

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

  /** Quãng kéo chuột theo trục dọc, giữ riêng cho việc kéo/thả dây diều. */
  private dragY = 0;

  private interactQueued = false;

  private pauseQueued = false;

  private cameraQueued = false;

  private lockListener: ((locked: boolean, quiet: boolean) => void) | undefined;

  /** Lần nhả khoá kế tiếp là do game chủ động (mở Sổ), không phải người chơi bấm Esc. */
  private quietUnlock = false;

  private exitQueued = false;

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

    // Chuột: bấm vào khung game là KHOÁ con trỏ (pointer lock) — từ đó chỉ cần
    // di chuột là xoay góc nhìn, không phải giữ nút. Esc là trình duyệt tự
    // nhả khoá. Cảm ứng: kéo một ngón ở nửa phải màn hình như cũ.
    this.listen(document, "pointerlockchange", () => {
      const quiet = this.quietUnlock;

      this.quietUnlock = false;
      this.lockListener?.(this.pointerLocked, quiet);
    });

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

  /** Con trỏ chuột đang bị khoá vào khung game (đang nhìn bằng chuột). */
  get pointerLocked(): boolean {
    return document.pointerLockElement === this.element;
  }

  /** Nghe lúc khoá/nhả con trỏ — để UI báo cho người chơi biết. */
  onPointerLock(listener: ((locked: boolean, quiet: boolean) => void) | undefined) {
    this.lockListener = listener;
  }

  /** Trả con trỏ chuột cho giao diện (bảng cần bấm) — không báo như bấm Esc. */
  releasePointer() {
    if (!this.pointerLocked) return;

    this.quietUnlock = true;
    document.exitPointerLock?.();
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
   *
   * Cũng xoá luôn mọi cú bấm đang chờ: đổi chủ sở hữu input (đi dạo ↔ thoại ↔
   * thả diều) là lúc cú bấm chưa ai đọc phải bị bỏ đi, không được rơi sang
   * chủ mới.
   */
  setMuted(muted: boolean) {
    this.muted = muted;

    this.clearPending();

    if (muted) {
      this.held.clear();
      this.stick = { forward: 0, right: 0 };
    }
  }

  /**
   * Quên hết cú bấm một-lần và quãng kéo chuột dở dang.
   *
   * Vì sao cần: `consume*()` chỉ được đọc khi có thứ đang cần chúng, nên một
   * phím bấm lúc không ai đọc sẽ nằm lại trong hàng đợi VÔ THỜI HẠN. Người
   * chơi bấm C trong lúc đọc thoại, vài phút sau vào thả diều — ván diều mở ra
   * ở góc máy đã bị xoay, trong khi `follow` (toàn cảnh) mới là góc mở màn.
   * Cùng cách đó, phím E bấm dở ở chỗ này có thể kích hoạt điểm hồi ký ở chỗ
   * khác mà người chơi không hề bấm gì.
   */
  clearPending() {
    this.interactQueued = false;
    this.pauseQueued = false;
    this.cameraQueued = false;
    this.exitQueued = false;
    this.dragY = 0;
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

  /**
   * Trục di chuyển cho ván con TỰ LÁI nhân vật (bơi ao): giống `snapshot()` ở
   * mọi mặt, trừ việc đọc được cả khi input đang bị khoá.
   *
   * Lý do tồn tại: `snapshot()` trả về rỗng khi muted — đúng với ván diều
   * (người chơi đứng một chỗ mà kéo dây), nhưng ván bơi lại khoá lớp đi bộ để
   * chính nó lái nhân vật, mà người chơi thì vẫn phải bơi bằng `W` `A` `S` `D`.
   * Ván đá cầu ngược lại: nó giữ nguyên quyền đi lại nên dùng `snapshot()`.
   */
  swimInput(): { forward: number; turn: number } {
    let forward = 0;
    let turn = 0;

    for (const code of this.held) {
      if (FORWARD_KEYS.has(code)) forward += 1;
      if (BACK_KEYS.has(code)) forward -= 1;
      if (RIGHT_KEYS.has(code)) turn += 1;
      if (LEFT_KEYS.has(code)) turn -= 1;
    }

    // Trong nước thì `A` `D` là QUAY người, không phải bước ngang — chèo ngang
    // giữa ao thì trông như con cua.
    return {
      forward: clamp(forward + this.stick.forward),
      turn: clamp(turn + this.stick.right),
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

  /**
   * Trục điều khiển diều: kéo/thả dây và lạng ngang.
   *
   * Tách hẳn khỏi `snapshot()` vì lúc thả diều thì `snapshot()` đã bị khoá
   * (`setMuted`) — người chơi không đi lại nữa, nhưng vẫn phải kéo dây.
   *
   *  - `W`/`S` (và cần điều khiển, và kéo chuột dọc) — thả/thu dây;
   *  - `A`/`D`, `←`/`→` (và cần điều khiển) — lạng ngang.
   */
  kiteInput(): { reel: number; steer: number } {
    let forward = 0;
    let right = 0;

    for (const code of this.held) {
      if (FORWARD_KEYS.has(code)) forward += 1;
      if (BACK_KEYS.has(code)) forward -= 1;
      if (KITE_STEER_RIGHT.has(code)) right += 1;
      if (KITE_STEER_LEFT.has(code)) right -= 1;
    }

    const drag = this.dragY * 0.02;

    this.dragY = 0;

    return {
      // Kéo chuột xuống (hoặc đẩy cần xuống) là thu dây vào.
      reel: clamp(-forward - this.stick.forward + drag),
      steer: clamp(right + this.stick.right),
    };
  }

  /**
   * Nút "thoát trò chơi" trên bảng điều khiển — bản cảm ứng của phím `R`.
   *
   * Gộp vào đúng hàng đợi của `consumeExit()` để mỗi ván con chỉ có một đường
   * thoát duy nhất, thay vì phải phân biệt bàn phím hay cảm ứng.
   */
  queueExit() {
    this.exitQueued = true;
  }

  /**
   * true nếu trong frame này người chơi vừa bấm phím thoát ván con (`R`).
   *
   * Đọc xong là xoá, và chỉ nhận cú bấm MỚI — giữ phím `R` suốt ván không
   * làm gì cả cho tới khi người chơi thật sự bấm lại.
   */
  consumeExit(): boolean {
    const pressed = this.exitQueued;

    this.exitQueued = false;

    return pressed;
  }

  /** true nếu trong frame này người chơi bấm phím tương tác. */
  consumeInteract(): boolean {
    const pressed = this.interactQueued;

    this.interactQueued = false;

    return pressed && !this.muted;
  }

  /** true nếu người chơi vừa bấm phím đổi góc máy. */
  consumeCameraToggle(): boolean {
    const pressed = this.cameraQueued;

    this.cameraQueued = false;

    return pressed;
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

    if (CAMERA_KEYS.has(code) && !event.repeat) {
      this.cameraQueued = true;
    }

    if (EXIT_KEYS.has(code) && !event.repeat) {
      this.exitQueued = true;
    }

    // Space/Enter đang là "đọc tiếp" của dialog — không đánh dấu là di chuyển.
    if (
      FORWARD_KEYS.has(code) ||
      BACK_KEYS.has(code) ||
      LEFT_KEYS.has(code) ||
      RIGHT_KEYS.has(code)
    ) {
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

    if (this.device !== "touch" && event.pointerType !== "touch" && !this.pointerLocked) {
      this.requestLock();
    }

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

  /**
   * Xin khoá con trỏ. Chrome trả về promise và từ chối nếu xin lại quá sớm sau
   * khi vừa bấm Esc — lần bấm sau sẽ xin lại, nên lỗi đó bỏ qua được.
   */
  private requestLock() {
    try {
      const pending = this.element.requestPointerLock?.() as unknown;

      if (pending instanceof Promise) pending.catch(() => undefined);
    } catch {
      // Trình duyệt không hỗ trợ: vẫn còn cách kéo chuột như cũ.
    }
  }

  private onPointerMove(event: PointerEvent) {
    if (this.pointerLocked) {
      // Đã khoá: mỗi lần di chuột là một lần xoay, không cần giữ nút. Riêng
      // quãng kéo dây diều vẫn chỉ tính khi đang GIỮ nút — nếu không thì chỉ
      // lướt chuột để nhìn quanh cũng thành thu/thả dây.
      this.lookX += event.movementX;
      this.lookY += event.movementY;

      if (event.buttons !== 0) this.dragY += event.movementY;

      return;
    }

    if (!this.dragging || event.pointerId !== this.activePointer) return;

    this.lookX += event.clientX - this.lastPointer.x;
    this.lookY += event.clientY - this.lastPointer.y;
    this.dragY += event.clientY - this.lastPointer.y;

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
