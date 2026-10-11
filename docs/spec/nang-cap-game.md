# Spec — Nâng cấp "Hồi ký sân nhà"

Trạng thái: đã chốt (kế thừa yêu cầu người chơi, không có issue tracker riêng —
spec + ticket graph nằm cùng thư mục này).

## Vấn đề

Bản hiện tại chạy đúng nhưng nhìn "máy móc":

- **Nhân vật** dựng bằng capsule + cầu, mắt là hai chấm đen, không có lông mày,
  miệng, tai, gấu áo. Ở cỡ chibi thì thiếu mắt trắng/lông mày làm mặt mất biểu
  cảm — đúng thứ người chơi nhìn suốt buổi chơi.
- **Animation** dùng lerp theo `dt` trong `Character.animate()`. Ba hệ quả: (1)
  độ mượt phụ thuộc tần số khung hình, máy 30 fps thấy khác máy 144 fps; (2)
  chuyển đứng↔đi chỉ có một `walkBlend` nên không phân biệt đi/chạy; (3) tay
  chân là một khúc cứng, không có khuỷu, không có phản xoay hông nên dáng đi
  giống con lắc.
- **UI** mới chỉ có HUD + dialog cơ bản; chưa có chỗ cho một minigame (đồng hồ,
  điểm, hướng gió).
- **Cốt truyện** dừng ở `childhood` với bốn câu thoại của đứa bạn; chưa có cao
  trào nào, và chưa có trò chơi nào để người chơi *làm* thay vì *đọc*.
- **Thả diều** — linh hồn của một buổi chiều quê — chưa tồn tại trong game.

## Mục tiêu

1. Nhân vật trông có hồn ở cỡ chibi mà vẫn dựng bằng hình khối (không kéo asset
   ngoài): mắt có tròng + điểm sáng, lông mày, miệng, tai, tóc có mái, guốc dép.
2. Animation mượt độc lập tần số khung hình, có ba trạng thái (đứng/đi/chạy)
   chuyển mượt, tay có khuỷu, hông phản xoay, thân nghiêng khi ôm cua, mắt biết
   chớp.
3. Một **minigame thả diều** thật: có mô phỏng (gió, lực căng dây, nhiệt lưu,
   độ cao, điểm), có hình 3D trong thế giới, có bảng điều khiển trên HUD, và
   được cắm vào cốt truyện bằng một loại beat mới.
4. Cốt truyện dài hơn và có cao trào: thêm chương thả diều, thêm lời thoại cho
   bạn bè, và một đoạn kết nối về chương hồi ký tương lai.

## Không làm

- Không thay engine (giữ three.js + React wall đang có).
- Không thêm asset ngoài: diều, dây, guốc đều dựng bằng hình khối.
- Không dựng hệ vật lý WASM; mô phỏng diều là số học thuần, test được.

## Tiêu chí nghiệm thu

| # | Tiêu chí |
|---|---|
| A1 | `npm test` xanh; có test cho mô phỏng diều (gió, lực nâng, độ cao, điểm) và cho phần animation mới (damping, blend). |
| A2 | `npm run build` và `npm run lint` sạch. |
| A3 | Trong sân, người chơi bấm tương tác ở một điểm mới "Thả diều" và vào được minigame; điều khiển bằng WASD/mũi tên, chuột kéo dây để chỉnh sức căng. |
| A4 | Minigame có thắng/thua rõ ràng (hết giờ hoặc dây đứt), có điểm, và trả quyền điều khiển cho người chơi khi kết thúc; không soft-lock. |
| A5 | Có chương cốt truyện mới chạy được trọn vẹn qua beat mới, không có beat nào thiếu handler. |
| A6 | Nhân vật có mắt/lông mày/miệng/tai; animation dùng damping theo `exp`, không còn lerp phụ thuộc `dt` thô. |

## Rủi ro & giảm thiểu

- **Beat mới làm vỡ story cũ** → handler `activity` được khai báo trong stage của
  `WorldGame`; beat thiếu handler vẫn nổ lỗi có tên như trước (đã có test).
- **Minigame giữ quyền điều khiển mãi** → `activity` chạy trong `await`, và
  `WorldGame` luôn `setControls()` lại sau khi beat xong, kể cả khi lỗi.
- **Hình khối mới làm nặng** → nhân vật chỉ 4 bản và mỗi bản vài chục mesh; diều
  là một nhóm ~10 mesh tái sử dụng; không thêm geometry mỗi frame.
