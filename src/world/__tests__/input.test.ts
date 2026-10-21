// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { Input } from "../Input";

/**
 * Input — chỗ duy nhất chuyển sự kiện DOM thành trạng thái cho vòng lặp frame.
 *
 * Bộ test này khoá đúng một tính chất, và nó là tính chất dễ hỏng nhất của
 * lớp này: **cú bấm một-lần phải thuộc về đúng chủ sở hữu input**. Các
 * `consume*()` chỉ được đọc khi có thứ đang cần chúng (lúc đứng cạnh điểm hồi
 * ký, lúc ván diều đang chạy), nên một cú bấm ở chỗ không ai đọc sẽ nằm lại
 * trong hàng đợi vô thời hạn — rồi nổ ra ở một cảnh khác, vài phút sau.
 */

function setup() {
  const element = document.createElement("div");

  document.body.appendChild(element);

  return { element, input: new Input(element) };
}

function key(code: string) {
  window.dispatchEvent(new KeyboardEvent("keydown", { code }));
  window.dispatchEvent(new KeyboardEvent("keyup", { code }));
}

function hold(code: string) {
  window.dispatchEvent(new KeyboardEvent("keydown", { code }));
}

function release(code: string) {
  window.dispatchEvent(new KeyboardEvent("keyup", { code }));
}

/**
 * Sự kiện con trỏ.
 *
 * Dựng từ `MouseEvent` rồi tự gắn `pointerId` thay vì dùng `PointerEvent`:
 * jsdom không phải bản nào cũng có `PointerEvent`, còn lớp `Input` chỉ đọc
 * đúng ba trường (id, x, y) nên cách này kiểm tra được cùng một đường mã.
 */
function pointer(type: string, x: number, y: number) {
  const event = new MouseEvent(type, {
    clientX: x,
    clientY: y,
    bubbles: true,
  });

  Object.defineProperty(event, "pointerId", { value: 1 });

  return event;
}

/** Kéo chuột từ `y1` xuống `y2` trên khung game. */
function drag(element: HTMLElement, y1: number, y2: number) {
  element.dispatchEvent(pointer("pointerdown", 10, y1));
  window.dispatchEvent(pointer("pointermove", 10, y2));
  window.dispatchEvent(pointer("pointerup", 10, y2));
}

describe("Input — hàng đợi cú bấm một-lần", () => {
  it("bấm C ở chỗ không ai đọc thì cú bấm NẰM LẠI — và đổi chủ sở hữu là phải quên", () => {
    const { element, input } = setup();

    // Người chơi bấm C trong lúc đọc thoại: chưa có ván diều nào để đổi góc máy.
    key("KeyC");
    key("Enter");

    expect(input.consumeCameraToggle()).toBe(true);

    key("KeyC");

    // …rồi quyền điều khiển đổi chủ (thoại ↔ đi dạo ↔ thả diều).
    input.setMuted(true);
    input.setMuted(false);

    expect(input.consumeCameraToggle()).toBe(false);
    expect(input.consumeInteract()).toBe(false);

    // Và cú bấm MỚI, sau khi đã đổi chủ, thì vẫn phải ăn.
    key("KeyC");

    expect(input.consumeCameraToggle()).toBe(true);

    element.remove();
  });

  it("quãng kéo chuột lúc xoay camera đi dạo không rơi sang ván diều", () => {
    const { element, input } = setup();

    // Kéo chuột xuống để ngước camera lên — thao tác bình thường nhất khi đi
    // dạo, và nó tích vào `dragY` dù chưa có ván diều nào đọc.
    drag(element, 10, 120);

    input.setMuted(false);

    expect(input.kiteInput().reel).toBe(0);

    element.remove();
  });

  it("trong ván diều: kéo chuột xuống là thu dây, kéo lên là thả dây", () => {
    const { element, input } = setup();

    drag(element, 10, 120);

    expect(input.kiteInput().reel).toBe(1);

    drag(element, 120, 10);

    expect(input.kiteInput().reel).toBe(-1);

    // Đọc xong là hết: quãng kéo không được cộng dồn sang frame sau.
    expect(input.kiteInput().reel).toBe(0);

    element.remove();
  });

  it("khoá input thì nhả sạch phím — nhân vật không chạy tiếp sau khi đóng thoại", () => {
    const { element, input } = setup();

    window.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyW" }));

    expect(input.snapshot().forward).toBe(1);

    input.setMuted(true);
    input.setMuted(false);

    expect(input.snapshot().forward).toBe(0);

    element.remove();
  });

  it("ván diều: `R` là phím THOÁT, `A`/`D` và mũi tên là lạng", () => {
    const { element, input } = setup();

    hold("KeyR");

    expect(input.kiteInput().steer).toBe(0);
    expect(input.consumeExit()).toBe(true);

    // Đọc xong là hết: giữ nguyên phím `R` suốt ván không làm gì thêm.
    expect(input.consumeExit()).toBe(false);

    release("KeyR");

    for (const [code, steer] of [
      ["KeyD", 1],
      ["ArrowRight", 1],
      ["KeyA", -1],
      ["ArrowLeft", -1],
    ] as const) {
      hold(code);

      expect(input.kiteInput().steer).toBe(steer);
      // Lạng diều không bao giờ là thoát ván.
      expect(input.consumeExit()).toBe(false);

      release(code);
    }

    // Thả/thu dây vẫn nằm ở `W`/`S` — `W` cũng là tiến, nên phím này đọc
    // theo hai nghĩa tuỳ trò chơi đang chạy.
    hold("KeyW");

    expect(input.kiteInput().reel).toBe(-1);

    release("KeyW");

    element.remove();
  });

  it("cú bấm thoát ván lúc đọc thoại không rơi sang ván diều", () => {
    const { element, input } = setup();

    key("KeyR");

    // Đổi chủ sở hữu input (thoại ↔ đi dạo ↔ thả diều) là lúc mọi cú bấm chưa
    // ai đọc phải bị bỏ đi.
    input.setMuted(true);
    input.setMuted(false);

    expect(input.consumeExit()).toBe(false);

    key("KeyR");

    expect(input.consumeExit()).toBe(true);

    element.remove();
  });

  it("`swimInput()` vẫn nghe được phím TRONG NƯỚC — ván bơi khoá lớp đi bộ mà người chơi vẫn phải bơi", () => {
    const { element, input } = setup();

    // Đang đi dạo: `W` đạp tới trước, chưa quay về đâu cả.
    hold("KeyW");

    expect(input.snapshot().forward).toBe(1);
    expect(input.swimInput().forward).toBe(1);
    expect(input.swimInput().turn).toBe(0);

    // Vào ván bơi: lớp đi bộ bị khoá, và phím ĐANG GIỮ bị nhả sạch — không ai
    // muốn nhân vật lao xuống nước chỉ vì lúc bấm E tay còn trên phím W.
    input.setMuted(true);

    expect(input.snapshot().forward).toBe(0);
    expect(input.swimInput().forward).toBe(0);

    release("KeyW");

    // Bơi: phím bấm TRONG nước thì lớp đi bộ vẫn im lặng, còn `swimInput`
    // nói thật — đó là toàn bộ lý do nó tồn tại.
    hold("KeyW");

    expect(input.snapshot().forward).toBe(0);
    expect(input.swimInput().forward).toBe(1);

    release("KeyW");

    expect(input.swimInput().forward).toBe(0);

    // Quay: `D` là quay phải, `A` là quay trái — và hai phím cùng lúc thì
    // triệt tiêu nhau, không được cộng dồn thành một cú quay gấp đôi.
    hold("KeyD");

    expect(input.swimInput().turn).toBe(1);

    hold("KeyA");

    expect(input.swimInput().turn).toBe(0);

    release("KeyD");

    expect(input.swimInput().turn).toBe(-1);

    release("KeyA");

    element.remove();
  });

  it("đọc xong một lần là cú bấm biến mất — không tự lặp", () => {
    const { element, input } = setup();

    key("KeyE");
    key("KeyM");

    expect(input.consumeInteract()).toBe(true);
    expect(input.consumeInteract()).toBe(false);
    expect(input.consumePauseToggle()).toBe(true);
    expect(input.consumePauseToggle()).toBe(false);

    element.remove();
  });

  it("khoá chuột: di chuột KHÔNG cần giữ nút vẫn xoay góc nhìn, nhưng không kéo dây diều", () => {
    const { element, input } = setup();

    const locked = { value: element as Element | null };

    Object.defineProperty(document, "pointerLockElement", {
      configurable: true,
      get: () => locked.value,
    });

    const move = (dx: number, dy: number, buttons = 0) => {
      const event = new MouseEvent("pointermove", { bubbles: true });

      Object.defineProperty(event, "movementX", { value: dx });
      Object.defineProperty(event, "movementY", { value: dy });
      Object.defineProperty(event, "buttons", { value: buttons });
      window.dispatchEvent(event);
    };

    expect(input.pointerLocked).toBe(true);

    move(30, -12);

    const look = input.look();

    expect(look.x).toBe(30);
    expect(look.y).toBe(-12);
    // Lướt chuột để nhìn không phải là thu/thả dây.
    expect(input.kiteInput().reel).toBe(0);

    // Giữ nút rồi kéo xuống thì vẫn là thu dây như cũ.
    move(0, 120, 1);

    expect(input.kiteInput().reel).toBe(1);

    let reported: boolean | undefined;

    input.onPointerLock((value) => {
      reported = value;
    });

    // Bấm Esc: trình duyệt nhả khoá và báo `pointerlockchange`.
    locked.value = null;
    document.dispatchEvent(new Event("pointerlockchange"));

    expect(reported).toBe(false);
    expect(input.pointerLocked).toBe(false);

    delete (document as unknown as Record<string, unknown>).pointerLockElement;
    element.remove();
  });
});
