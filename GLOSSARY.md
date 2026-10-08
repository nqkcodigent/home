# Glossary — childhood-game

Domain language cho pipeline kịch bản và vertical slice hồi tưởng tuổi thơ.
Terminology này sống trong code: dùng đúng tên, đừng dịch nghĩa khác.

## Story pipeline

- **Script** — Chuỗi beat có tên, có thứ tự trong `story.json` (vd: `intro`, `childhood`). Script sở hữu pacing và lời thoại; không chứa code.
- **Beat** — Bước nhỏ nhất khai báo được của một script. Vocabulary: `dialog`, `pause`, `walk`, `pan`, `zoom`, `reveal`, `audio`, `controls`, `transition`. Beat `walk`/`pan`/`audio` dùng **tên điểm & slot** (vd: `to: "bed"`, `slot: "city"`) — layout và asset nằm ở stage, pacing nằm ở data.
- **Cinematic beat** — Beat di chuyển camera / player / audio (`walk`, `pan`, `zoom`, `audio`) thay vì nói; được thực thi bởi stage handler, được viết trong data.
- **Stage** — Scene đang hoạt động. Stage đăng ký beat handler cho các beat nó biết thực thi; stage không kể chuyện. Beat chưa có handler là lỗi rõ ràng (định danh stage + beat), không im lặng.
- **Story director** — Module cấp game sở hữu arc (intro → dream → childhood → hồi ký → Oảnçán), chạy script beat-by-beat, và queue thoại lẻ. Thuần TS, không biết Phaser; clock & stage được inject.
- **say()** — Entry point cho thoại lẻ ngoài script (vd: giếng, thoại mồi); queue FIFO sau script đang chạy để mọi dialog đi cùng một đường.
- **Controls beat** — Beat `controls` trong data bật/tắt quyền điều khiển người chơi; mọi transition input đều nằm trong script nên không còn soft-lock.

## Thế giới game

- **intro** — "Một ngày dài": buổi tối của người lớn, kết bằng giấc ngủ.
- **childhood** — "Ngày ấy": thế giới hồi tưởng, đánh thức bằng câu thoại và quyền điều khiển bật từ data (không soft-lock).
- **hồi ký (memory)** — Chương tương lai: scene hồi ký và trò chơi Oảnçán, cắm vào seam `action`/`transition` sẵn có.
