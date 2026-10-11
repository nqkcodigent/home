# Tickets — Nâng cấp "Hồi ký sân nhà"

Task graph, không phải danh sách bước. Mỗi ticket nêu rõ **blocked by**; ticket
nào không bị chặn thì nằm trên frontier.

```
T3 (nhân vật + animation) ──┐
                            ├─→ T5 (UI + HUD diều)
T1 (beat activity + event) ─┼─→ T4 (diều 3D + wiring) ─→ T6 (cốt truyện + điểm thả diều)
T2 (mô phỏng diều) ─────────┘
```

---

## T1 — Beat `activity` + kênh sự kiện minigame

**Blocked by:** —
**Mục tiêu:** cốt truyện gọi được một minigame bằng data, và minigame nói được
với UI React.

- `src/story/types.ts`: thêm beat `{ type: "activity"; activity: string; duration?: number }`.
- `src/story/StoryDirector.ts`: dispatch beat mới; thiếu handler → lỗi nêu tên
  stage + beat (giữ nguyên hành vi đang có).
- `src/events.ts`: thêm sự kiện `kite` (bảng HUD của minigame) và `kiteResult`.
- Test: beat `activity` chạy đúng handler; thiếu handler → throw.

**Done when:** test của StoryDirector phủ beat mới và vẫn xanh toàn bộ.

---

## T2 — Mô phỏng thả diều (thuần số)

**Blocked by:** —
**Mục tiêu:** luật chơi nằm ở một module không biết three.js, test được bằng số.

- `src/world/activities/kite/model.ts`: trạng thái diều (độ cao, khoảng cách
  ngang, lực căng dây, vận tốc), trường gió đổi theo thời gian, nhiệt lưu
  (thermal) để lấy cao, dây đứt khi lực căng vượt ngưỡng, điểm theo độ cao giữ
  được, đồng hồ đếm ngược.
- `update(dt, input)` thuần; không đọc DOM, không đọc three.
- Test: gió mạnh → lên cao; kéo căng liên tục → đứt dây; thả lỏng → tụt; điểm
  cộng khi ở trong vùng nhiệt lưu; hết giờ → kết thúc.

**Done when:** chạy được 60 giây mô phỏng trong test mà không NaN.

---

## T3 — Nhân vật đẹp hơn + animation mượt

**Blocked by:** —
**Mục tiêu:** mặt có biểu cảm, dáng đi có trọng lượng, không phụ thuộc fps.

- `src/world/character/avatar.ts`: mắt (tròng trắng + con ngươi + điểm sáng),
  lông mày, miệng, tai, tóc có mái theo kiểu, guốc/dép; rig thêm khuỷu tay và
  danh sách mắt để chớp.
- `src/world/character/Character.ts`: thay lerp thô bằng damping theo `exp`;
  ba trạng thái đứng/đi/chạy; hông phản xoay, thân nghiêng khi rẽ, đầu gật theo
  nhịp bước, chớp mắt ngẫu nhiên.
- Test: damping hội tụ độc lập bước thời gian; blend chạy được tới 1 khi chạy
  nhanh; mắt chớp trong khoảng thời gian dài.

**Done when:** nhân vật trong sân nhìn rõ mắt/lông mày/Miệng khi camera ở khoảng
cách mặc định, và test animation mới xanh.

---

## T4 — Diều trong thế giới 3D

**Blocked by:** T1, T2
**Mục tiêu:** minigame nhìn thấy được, chơi được, và không cướp quyền điều khiển.

- `src/world/activities/kite/Kite.ts`: diều giấy (khung tre, bao giấy, đuôi nơ
  nhiều đốt), dây nối từ tay nhân vật tới diều (đường cong mỗi frame), cờ gió
  và cột khí nóng bốc lên ở nhiệt lưu.
- `src/world/activities/kite/KiteActivity.ts`: nối `model` với three, phát sự
  kiện HUD, chạy bằng `tweens`/frame của `WorldGame`.
- `src/world/WorldGame.ts`: handler beat `activity`, bật/tắt chế độ điều khiển
  diều, đổi camera sang theo dõi diều, luôn trả quyền điều khiển khi xong.
- Test: không chơi được bằng test đầu-cuối, nhưng lớp model đã phủ ở T2; ở đây
  kiểm tra `KiteActivity` dựng và cập nhật được trong môi trường không WebGL
  (dùng `Tweens` giả).

**Done when:** bấm tương tác ở điểm "Thả diều" → diều bay lên, HUD hiện, hết
giờ hoặc đứt dây → về lại điều khiển nhân vật.

---

## T5 — UI: bảng điều khiển diều + dọn HUD/dialog

**Blocked by:** T1, T3
**Mục tiêu:** người chơi đọc được luật chơi mà không cần hướng dẫn ngoài.

- `src/components/KitePanel.tsx`: đồng hồ, điểm, độ cao, thanh lực căng (đổi
  màu khi gần đứt), hướng gió, banner kết quả.
- HUD: thêm chỉ báo hồi ký đã thu và chương có màu theo bối cảnh.
- Dialog: khung chân dung lớn hơn, tên người nói có gạch chân màu, chỉ báo "bỏ
  qua" rõ ràng.
- Cover: bổ sung bảng "cách chơi" và nút bật/tắt tiếng.
- CSS thuần, không thêm thư viện.

**Done when:** `npm run lint` sạch và bảng diều hiện đúng số khi minigame chạy.

---

## T6 — Cốt truyện

**Blocked by:** T1, T4
**Mục tiêu:** buổi chiều có cao trào và có đoạn dẫn về chương hồi ký.

- `src/data/story.json`: mở rộng `childhood` (bạn bè rủ rê, luật chơi, thắng
  thua khác nhau) và thêm script `kite` chạy beat `activity`.
- `src/world/locations/childhoodYard.ts`: thêm điểm tương tác "Thả diều" ở bãi
  cỏ trống, kèm walkPoints cho nhịp `walk`.
- `GLOSSARY.md`: bổ sung thuật ngữ mới (Activity beat, Kite, Wind field,
  Thermal, Line tension).
- Test: một test đọc `story.json` và xác nhận mọi beat đều thuộc vocabulary
  (không có beat lạ lọt vào data).

**Done when:** chơi hết chương childhood không gặp beat nào thiếu handler.
