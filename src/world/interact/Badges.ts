import * as THREE from "three";

import { getInputDevice } from "../../ui/device";
import { inputGlyphMarkup } from "../../components/glyph";

import type { InputAction } from "../../components/glyph";

/**
 * Nhãn tương tác — DOM nổi phía trên vật thể, chiếu từ toạ độ 3D.
 *
 * Lấy thẳng ý tưởng `InteractBadge` của character-threejs: một phím tắt nhỏ
 * ngay trên vật thể, không panel, không logo. Đây là thứ nói "ở đây bấm được",
 * chứ không phải một khung thoại dưới đáy màn hình cách xa vật thể ba mét.
 *
 * Dựng bằng DOM (không phải sprite) vì chữ phải sắc trên mọi màn hình và đi
 * theo bố cục chung của UI; mỗi frame chỉ làm một phép chiếu và một translate.
 */

export interface BadgeOptions {
  id: string;
  label: string;
  position: THREE.Vector3;
  /** Hành động để vẽ glyph tương ứng (mặc định: tương tác) */
  action?: InputAction;
}

interface BadgeEntry extends BadgeOptions {
  element: HTMLDivElement;
  shown: boolean;
}

const HIDE_BEHIND = -1;

export class Badges {
  private readonly entries = new Map<string, BadgeEntry>();

  private readonly container: HTMLDivElement;

  constructor(container: HTMLElement) {
    this.container = document.createElement("div");

    this.container.className = "world-badges";
    this.container.setAttribute("aria-hidden", "true");

    container.appendChild(this.container);
  }

  add(options: BadgeOptions) {
    const element = document.createElement("div");

    element.className = "world-badge";
    element.innerHTML = `${inputGlyphMarkup(
      options.action ?? "interact",
      getInputDevice(),
    )}<span class="world-badge__label"></span>`;

    const label = element.querySelector(".world-badge__label");

    if (label) label.textContent = options.label;

    this.container.appendChild(element);

    this.entries.set(options.id, { ...options, element, shown: false });
  }

  /** Bật/tắt một nhãn; tự ẩn những nhãn khác cùng lúc. */
  show(id: string) {
    for (const [key, entry] of this.entries) {
      const visible = key === id;

      if (visible === entry.shown) continue;

      entry.shown = visible;
      entry.element.classList.toggle("is-visible", visible);
    }
  }

  hideAll() {
    this.show("");
  }

  /** Dỡ hết nhãn — dùng khi đổi bối cảnh. */
  clear() {
    for (const entry of this.entries.values()) entry.element.remove();

    this.entries.clear();
  }

  /** Chiếu toạ độ thế giới sang màn hình; nhãn khuất sau lưng thì ẩn. */
  update(camera: THREE.PerspectiveCamera) {
    for (const entry of this.entries.values()) {
      if (!entry.shown) continue;

      const projected = entry.position.clone().project(camera);

      if (projected.z > 1 || projected.z < HIDE_BEHIND) {
        entry.element.style.opacity = "0";

        continue;
      }

      const x = (projected.x * 0.5 + 0.5) * 100;
      const y = (-projected.y * 0.5 + 0.5) * 100;
      // Xa thì nhãn nhỏ lại và mờ đi — nhãn ở rìa sân không nên to bằng nhãn
      // ngay trước mũi.
      const scale = THREE.MathUtils.clamp(1.15 - projected.z * 0.5, 0.72, 1.1);

      entry.element.style.opacity = "1";
      entry.element.style.transform = `translate(-50%, -100%) translate(${x}%, ${y}%) scale(${scale})`;
    }
  }

  dispose() {
    this.container.remove();
    this.entries.clear();
  }
}
