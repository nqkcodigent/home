import { useEffect, useRef, useState } from "react";

import { getInputDevice, subscribeInputDevice } from "../ui/device";
import { worldGame } from "../world/WorldGame";

/** Bán kính vùng kéo (px) — khớp với kích thước trong CSS. */
const RADIUS = 58;
const KNOB_TRAVEL = 34;

/**
 * Cần điều khiển cho cảm ứng, chỉ hiện trên thiết bị cảm ứng.
 *
 * Tự viết thay vì dùng nipplejs: nhu cầu chỉ là một vector 2 chiều, và cần này
 * nói thẳng vào `Input` của game — không cần một thư viện có hệ sự kiện riêng
 * chỉ để tính khoảng cách từ tâm.
 */
export function Joystick() {
  const [device, setDevice] = useState(getInputDevice);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);

  const baseRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | undefined>(undefined);

  useEffect(() => subscribeInputDevice(setDevice), []);

  // Rời màn hình giữa chừng mà không nhả tay thì nhân vật chạy mãi một hướng.
  useEffect(() => () => worldGame.releaseStick(), []);

  if (device !== "touch") return null;

  const apply = (clientX: number, clientY: number) => {
    const base = baseRef.current;

    if (!base) return;

    const rect = base.getBoundingClientRect();

    const dx = (clientX - (rect.left + rect.width / 2)) / RADIUS;
    const dy = (clientY - (rect.top + rect.height / 2)) / RADIUS;

    const length = Math.hypot(dx, dy);
    const scale = length > 1 ? 1 / length : 1;

    const x = dx * scale;
    const y = dy * scale;

    setKnob({ x: x * KNOB_TRAVEL, y: y * KNOB_TRAVEL });
    worldGame.setStick(x, -y);
  };

  const release = () => {
    pointerId.current = undefined;
    setActive(false);
    setKnob({ x: 0, y: 0 });
    worldGame.releaseStick();
  };

  return (
    <div className="touch">
      <div
        ref={baseRef}
        className={`stick${active ? " is-active" : ""}`}
        onPointerDown={(event) => {
          pointerId.current = event.pointerId;
          setActive(true);

          event.currentTarget.setPointerCapture(event.pointerId);
          apply(event.clientX, event.clientY);
        }}
        onPointerMove={(event) => {
          if (pointerId.current !== event.pointerId) return;

          apply(event.clientX, event.clientY);
        }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <span
          className="stick__knob"
          style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
        />
      </div>

      <button
        type="button"
        className="touch-action"
        onPointerDown={() => worldGame.interact()}
      >
        E
      </button>
    </div>
  );
}
