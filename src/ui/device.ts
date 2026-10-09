/**
 * Thiết bị nhập hiện tại — một ô nhớ nhỏ mà cả lớp 3D và lớp UI cùng đọc.
 *
 * Nhãn phím phải nói đúng thứ người chơi đang cầm: "E" trên bàn phím, hình
 * ngón tay trên điện thoại. Bản gốc để trong `window.experience.input.device`
 * và mọi widget tự đi hỏi; ở đây là một module có `subscribe()` — không có
 * biến toàn cục, và component React cập nhật lại khi đổi thiết bị giữa chừng
 * (xem trước trên desktop rồi mở trên điện thoại).
 */

export type InputDevice = "keyboard" | "touch";

let current: InputDevice =
  typeof window !== "undefined" &&
  window.matchMedia?.("(pointer: coarse)").matches === true
    ? "touch"
    : "keyboard";

const listeners = new Set<(device: InputDevice) => void>();

export function getInputDevice(): InputDevice {
  return current;
}

export function setInputDevice(device: InputDevice) {
  if (device === current) return;

  current = device;

  for (const listener of listeners) listener(device);
}

export function subscribeInputDevice(
  listener: (device: InputDevice) => void,
): () => void {
  listeners.add(listener);

  return () => listeners.delete(listener);
}
