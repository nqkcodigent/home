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
- **Activity beat** — Beat `activity` giao quyền cho một trò chơi con (thả diều). Nhịp này CHỜ trò chơi kết thúc rồi mới đi tiếp, nên thứ tự nhịp sau nó vẫn đọc được từ data; cốt truyện chỉ biết TÊN trò chơi, trò chơi không biết gì về cốt truyện. Danh sách tên có thật nằm ở `src/world/activities/index.ts`.
- **Epilogue** — Lời kết của bối cảnh, đọc MỘT lần khi người chơi đã nhặt hết hồi ký. Không phải nhịp truyện: nó phụ thuộc vào việc người chơi đã đi hết sân hay chưa.

## Thế giới 3D

- **Location (bối cảnh)** — Một chương nhìn được: sân tuổi thơ, căn hộ người lớn. Khai báo dữ liệu (nhóm vật thể, điểm ký ức, điểm kịch bản, preset camera, slot tiếng bước chân); không chứa logic nhịp truyện.
- **Rig** — Camera góc nhìn thứ ba quanh nhân vật: yaw/pitch/khoảng cách có giảm xóc, kẹp theo địa hình. Ba nhịp truyện tác động vào nó: `zoom` (dolly), `pan` (lệch tâm ngắm), `reveal` (trả tâm ngắm về nhân vật).
- **Slide/Heightfield** — Hàm độ cao `terrainHeight(x, z)` dùng chung cho lưới đất và bàn chân nhân vật; quanh sân (bán kính 26 m) được làm phẳng để đặt nhà, giếng, hàng rào.
- **Collider** — Vật cản là hình tròn trên mặt phẳng XZ; hàng rào là chuỗi hình tròn nhỏ. Không dùng engine vật lý WASM: thế giới này chỉ có cây, nhà, giếng.
- **Motion** — Động học thuần của nhân vật: đi theo hướng camera, xoay dần về hướng đi, tích luỹ `gaitPhase` cho lớp hình thể. Tách khỏi three.js nên test được bằng số.
- **Badge** — Nhãn phím nổi trên vật thể, chiếu từ toạ độ 3D sang DOM; nói "chỗ này bấm được" ngay tại vật thể.
- **Announce** — Chữ lớn giữa màn hình, tự tắt (thông báo tắt/bật tiếng…).

## Thả diều (kite)

- **Kite** (diều) — Trò chơi con của chương tuổi thơ. Luật chơi nằm ở `src/world/activities/kite/model.ts` (thuần số, test được), hình khối ở `Kite.ts`, đường dây nối hai bên ở `KiteActivity.ts`.
- **Wind field** (trường gió) — Hàm sức gió theo thời gian, ba sóng sin lệch tần số. Tất định: cùng một giây thì mọi máy có cùng cơn gió, nên bảng điểm so được và test không cần gieo số ngẫu nhiên.
- **Thermal** (nhiệt lưu) — Cột khí nóng bốc lên ở một vị trí ngang, sống vài giây rồi tắt. Bay vào thì lên nhanh gấp đôi và được cộng điểm, nhưng cũng kéo căng dây thêm một chút.
- **Line tension** (lực căng dây) — 0…1, bằng *gió × độ dài dây*. Chạm 1 là đứt. Đây là chỉ báo chính của minigame, và cũng là thứ quyết định độ võng của sợi dây trong cảnh 3D.
- **Line ceiling** (trần độ cao) — 0,95 × độ dài dây đang thả: diều KHÔNG THỂ bay cao hơn sợi dây giữ nó. Muốn lên cao phải thả thêm dây, mà dây dài thì căng — đó là toàn bộ trò chơi.
- **Sky frame** — Khung toạ độ của vùng trời: gốc ở chân người chơi, `forward` là hướng diều bay ra (do bối cảnh khai báo qua `kiteForward`), `right` là trục lạng. Đây là chỗ duy nhất đổi (độ cao, lạng, độ dài dây) thành toạ độ ba chiều.
- **Cinematic mode** — Chế độ camera khoá tâm ngắm vào một điểm và nới ống kính (FOV 58). Cần cho thả diều vì dây dài tới 60 m, mà góc nhìn thứ ba bám nhân vật thì không khung hình nào chứa nổi cả người chơi lẫn con diều.

## Thế giới game

- **intro** — "Một ngày dài": buổi tối của người lớn, kết bằng giấc ngủ.
- **childhood** — "Ngày ấy": thế giới hồi tưởng, đánh thức bằng câu thoại và quyền điều khiển bật từ data (không soft-lock). Chương này đi qua bốn hồi ký, một ván thả diều, và khép lại bằng epilogue khi sân đã nhặt hết.
- **hồi ký (memory)** — Chương tương lai: scene hồi ký và trò chơi Oảnçán, cắm vào seam `activity`/`transition` sẵn có.
