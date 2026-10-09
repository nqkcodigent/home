# Glossary — childhood-game

Domain language cho pipeline kịch bản và vertical slice hồi tưởng tuổi thơ.
Terminology này sống trong code: dùng đúng tên, đừng dịch nghĩa khác.

## Story pipeline

- **Script** — Chuỗi beat có tên, có thứ tự trong `story.json` (vd: `intro`, `childhood`). Script sở hữu pacing và lời thoại; không chứa code.
- **Beat** — Bước nhỏ nhất khai báo được của một script. Vocabulary: `dialog`, `pause`, `walk`, `pan`, `zoom`, `reveal`, `audio`, `controls`, `transition`. Beat `walk`/`pan`/`audio` dùng **tên điểm & slot** (vd: `to: "bed"`, `slot: "city"`) — layout và asset nằm ở stage, pacing nằm ở data.
- **Cinematic beat** — Beat di chuyển camera / player / audio (`walk`, `pan`, `zoom`, `audio`) thay vì nói; được thực thi bởi stage handler, được viết trong data.
- **Stage** — Nơi beat handler được thực thi. Từ khi chuyển sang 3D chỉ còn ĐÚNG MỘT stage (`WorldGame`): mọi nhịp đều viết một lần, bối cảnh chỉ khai báo dữ liệu. Beat chưa có handler là lỗi rõ ràng (định danh stage + beat), không im lặng.
- **Story director** — Module cấp game sở hữu arc (intro → dream → childhood → hồi ký → Oảnçán), chạy script beat-by-beat, và queue thoại lẻ. Thuần TS, không biết three.js; clock & stage được inject.
- **say()** — Entry point cho thoại lẻ ngoài script (vd: giếng, thoại mồi); queue FIFO sau script đang chạy để mọi dialog đi cùng một đường.
- **Controls beat** — Beat `controls` trong data bật/tắt quyền điều khiển người chơi; mọi transition input đều nằm trong script nên không còn soft-lock.

## Thế giới 3D

- **Location (bối cảnh)** — Một chương nhìn được: sân tuổi thơ, căn hộ người lớn. Khai báo dữ liệu (nhóm vật thể, điểm ký ức, điểm kịch bản, preset camera, slot tiếng bước chân); không chứa logic nhịp truyện.
- **Rig** — Camera góc nhìn thứ ba quanh nhân vật: yaw/pitch/khoảng cách có giảm xóc, kẹp theo địa hình. Ba nhịp truyện tác động vào nó: `zoom` (dolly), `pan` (lệch tâm ngắm), `reveal` (trả tâm ngắm về nhân vật).
- **Slide/Heightfield** — Hàm độ cao `terrainHeight(x, z)` dùng chung cho lưới đất và bàn chân nhân vật; quanh sân (bán kính 26 m) được làm phẳng để đặt nhà, giếng, hàng rào.
- **Collider** — Vật cản là hình tròn trên mặt phẳng XZ; hàng rào là chuỗi hình tròn nhỏ. Không dùng engine vật lý WASM: thế giới này chỉ có cây, nhà, giếng.
- **Motion** — Động học thuần của nhân vật: đi theo hướng camera, xoay dần về hướng đi, tích luỹ `gaitPhase` cho lớp hình thể. Tách khỏi three.js nên test được bằng số.
- **Badge** — Nhãn phím nổi trên vật thể, chiếu từ toạ độ 3D sang DOM; nói "chỗ này bấm được" ngay tại vật thể.
- **Announce** — Chữ lớn giữa màn hình, tự tắt (thông báo tắt/bật tiếng…).

## Thế giới game

- **intro** — "Một ngày dài": buổi tối của người lớn, kết bằng giấc ngủ.
- **childhood** — "Ngày ấy": thế giới hồi tưởng, đánh thức bằng câu thoại và quyền điều khiển bật từ data (không soft-lock).
- **hồi ký (memory)** — Chương tương lai: scene hồi ký và trò chơi Oảnçán, cắm vào seam `action`/`transition` sẵn có.
