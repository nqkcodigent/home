import type { InputDevice } from "../ui/device";

/**
 * Glyph phím — dựng markup thuần (không React) để cả component React lẫn nhãn
 * tương tác trong thế giới 3D dùng chung một cách vẽ.
 *
 * Theo đúng ý tưởng `InputGlyph` của character-threejs: hành động ngữ nghĩa
 * ("tương tác", "đi tiếp") được dịch sang phím thật của thiết bị đang dùng,
 * nên không có chỗ nào hard-code chữ "E" rồi quên đổi khi thêm cảm ứng.
 */

export type InputAction = "interact" | "confirm" | "sprint" | "move" | "back";

const KEYBOARD_LABELS: Record<InputAction, string> = {
  interact: "E",
  confirm: "Space",
  sprint: "Shift",
  move: "WASD",
  back: "Esc",
};

const TOUCH_ICON = `
<svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
  <path d="M9 11V6.5a1.6 1.6 0 0 1 3.2 0V11" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <path d="M12.2 11V9.4a1.5 1.5 0 0 1 3 0V11M15.2 11v-.6a1.5 1.5 0 0 1 3 0V15a4.5 4.5 0 0 1-4.5 4.5h-1.6a4.5 4.5 0 0 1-3.6-1.8l-2-2.6a1.5 1.5 0 0 1 2.3-1.9l1 1.1" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const STICK_ICON = `
<svg viewBox="0 0 24 24" width="15" height="15" fill="none" aria-hidden="true">
  <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"/>
  <circle cx="12" cy="12" r="3.4" fill="currentColor"/>
</svg>`;

/** Nhãn chữ cho một hành động (rỗng nếu là biểu tượng). */
export function glyphLabel(
  action: InputAction,
  device: InputDevice,
): string {
  if (device === "touch") return "";

  return KEYBOARD_LABELS[action];
}

/** Markup một phím tắt (`<span class="glyph …">`). */
export function inputGlyphMarkup(
  action: InputAction,
  device: InputDevice = "keyboard",
): string {
  if (device === "touch") {
    const icon = action === "move" ? STICK_ICON : TOUCH_ICON;

    return `<span class="glyph glyph--touch">${icon}</span>`;
  }

  const label = glyphLabel(action, device);

  return `<span class="glyph glyph--key${label.length > 1 ? " glyph--wide" : ""}">${label}</span>`;
}

/** Danh sách phím rời cho hành động `move` (W A S D). */
export function moveKeys(device: InputDevice): string[] {
  return device === "touch" ? [] : ["W", "A", "S", "D"];
}
