import { gameEvents } from "../events";

import type { PlayHudPayload } from "../events";

interface Props {
  /** Số liệu đang chạy (patch đã trộn ở App) */
  data?: PlayHudPayload;
}

/**
 * Bảng điều khiển chung cho các trò chơi con nhỏ — bơi ao, đá cầu.
 *
 * Cố ý không phải bảng diều: bảng diều có những chỉ số riêng (thanh lực căng,
 * hướng gió) và đáng để viết riêng, còn đây chỉ là TÊN TRÒ + vài con số + một
 * dòng nhắc việc. Trò chơi con mới thêm sau này chỉ cần phát sự kiện `play`
 * là có bảng, không phải viết component.
 *
 * Nút thoát gộp đúng một cửa: gửi `exitActivity` — cùng hàng đợi với phím `R`,
 * nên ván con không cần biết người chơi bấm bàn phím hay chạm màn hình.
 */
export function PlayPanel({ data }: Props) {
  if (!data?.visible) return null;

  return (
    <div className="play" role="status" aria-label={`Bảng ${data.title}`}>
      <span className="play__title">{data.title}</span>

      <div className="play__stats">
        {data.stats.map((stat) => (
          <span key={stat.label} className="play__pill">
            {stat.label}
            <b>{stat.value}</b>
          </span>
        ))}
      </div>

      {data.hint && <p className="play__hint">{data.hint}</p>}

      <button
        type="button"
        className="play__exit"
        // Không để cú bấm lọt xuống khung game.
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() => gameEvents.emit("exitActivity", undefined)}
        aria-label="Kết thúc trò chơi và quay lại đi dạo"
      >
        <kbd>R</kbd> kết thúc, quay lại đi dạo
      </button>
    </div>
  );
}
