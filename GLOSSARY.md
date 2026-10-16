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
- **Rig** — Camera góc nhìn thứ ba quanh nhân vật: yaw/pitch/khoảng cách có giảm xóc, kẹp theo địa hình, và RÚT NGẮN CẦN GẠT khi đoạn [tâm ngắm → camera] chạm một collider của bối cảnh (nhà, gốc cây) — thu vào ngay, nhả ra từ từ. Ba nhịp truyện tác động vào nó: `zoom` (dolly), `pan` (lệch tâm ngắm), `reveal` (trả tâm ngắm về nhân vật).
- **Cần gạt (boom)** — Vector từ tâm ngắm ra camera. Trần của nó là khoảng cách của preset; sàn là một phần nhỏ của tầm với, vì thà camera chạm tường còn hơn nằm trong đầu nhân vật.
- **Input ownership** — Lớp `Input` có ba chủ sở hữu luân phiên: đi dạo, đọc thoại, thả diều. Cú bấm một-lần (`E`, `C`, `M`) và quãng kéo chuột của chủ này KHÔNG được rơi sang chủ kia: mỗi lần `setMuted()` (tức mỗi lần đổi chủ) hàng đợi bị xoá, và trong lúc đi dạo thì phím tương tác được đọc mỗi frame để cú bấm ở chỗ trống tự hết hạn.
- **Slide/Heightfield** — Hàm độ cao `terrainHeight(x, z)` dùng chung cho lưới đất và bàn chân nhân vật; quanh sân (bán kính 26 m) được làm phẳng để đặt nhà, giếng, hàng rào.
- **Collider** — Vật cản là hình tròn trên mặt phẳng XZ; hàng rào là chuỗi hình tròn nhỏ. Không dùng engine vật lý WASM: thế giới này chỉ có cây, nhà, giếng.
- **Creatures** (`src/world/world/Creatures.ts`) — Chim trời, chim cành, gà, bướm. Bốn loài, một triết lý: dựng bằng hình khối, chuyển động tính bằng số từ `elapsed` (không AnimationClip), nên sân giống nhau ở mọi máy và test được. Hàm thuần quyết định "chim bay đâu, gà đi đâu" được tách khỏi phần dựng hình.
- **Sky focus** — Điểm trên trời mà hai con chim đầu đàn bám theo (con diều). `WorldGame` đẩy nó vào bối cảnh mỗi frame qua `LocationRuntime.setSkyFocus`; không có ván diều thì chim bay lộ trình vòng quanh sân.
- **Perch** (chỗ đậu) — Cột hàng rào, miệng giếng, dây phơi. Toạ độ tính TỪ `YARD` chứ không chép lại: chim phải đậu đúng trên mặt cột. Luôn để dành vài chỗ trống, vì bị hù bay đi rồi đậu lại đúng cột cũ thì chuyến bay vô nghĩa — và hai con đậu chung một cột thì nằm đè lên nhau (`nextFreePerch`).
- **Outer trees** (`OUTER_TREES`) — Vành cây ở rìa vùng đi được, cách sân chừng 65 m. Cùng một dãy cho hình khối lẫn vật cản: đây là bìa bản đồ, thứ nói "hết làng rồi" mà không cần hàng rào thứ hai.
- **Motion** — Động học thuần của nhân vật: đi theo hướng camera, xoay dần về hướng đi, tích luỹ `gaitPhase` cho lớp hình thể. Tách khỏi three.js nên test được bằng số.
- **Badge** — Nhãn phím nổi trên vật thể, chiếu từ toạ độ 3D sang DOM; nói "chỗ này bấm được" ngay tại vật thể.
- **Announce** — Chữ lớn giữa màn hình, tự tắt (thông báo tắt/bật tiếng…).

## Thả diều (kite)

- **Kite** (diều) — Trò chơi con của chương tuổi thơ. Luật chơi nằm ở `src/world/activities/kite/model.ts` (thuần số, test được), hình khối ở `Kite.ts`, đường dây nối hai bên ở `KiteActivity.ts`.
- **Activity registry** (`src/world/activities/index.ts`) — Chỗ duy nhất biết TÊN trò chơi con nào có thật (`ACTIVITIES`), trò nào giữ quyền đi lại cho người chơi (`keepsMovement`), và một ván con phải trông thế nào với `WorldGame` (`RunningActivity`). `WorldGame.buildActivity()` là chỗ duy nhất dựng lớp cài trò chơi.
- **RunningActivity** — Hợp đồng giữa vòng lặp chính và một ván con đang chạy: `play()`/`dispose()` cộng hai cờ. `drivesCharacter` = ván TỰ LÁI nhân vật (bơi ao), nên vòng lặp chính phải đứng ngoài; `skyFocus()` = điểm trên trời cho đàn chim bám theo (con diều).
- **Swim** (bơi ao) — Trò chơi con thứ hai: bơi vòng quanh ao nhặt sen. Luật ở `activities/swim/model.ts`, hình khối ở `SwimActivity.ts`. Đây là ván TỰ LÁI nhân vật, và vì thế nó dùng `Input.swimInput()` — phím bơi đọc được trong lúc lớp đi bộ đã bị khoá.
- **Shuttlecock** (đá cầu) — Trò chơi con thứ ba, và là ván DUY NHẤT giữ quyền đi lại: cả ván là cuộc chạy tới chỗ quả cầu rơi. Vì thế cú bấm `E` phải thuộc về VÁN chứ không phải đồ vật trong sân (`WorldGame.updateSpots` đứng ngoài khi có ván đang chạy).
- **Play panel** — Bảng số liệu dùng chung cho các ván con nhỏ (`PlayPanel` + sự kiện `play`): ván chỉ phát TÊN trò, mấy con số và một dòng nhắc, React trộn vào bảng cũ. Ván diều có bảng riêng vì nó có thanh lực căng và hướng gió.
- **Wind field** (trường gió) — Hàm sức gió theo thời gian, ba sóng sin lệch tần số. Tất định: cùng một giây thì mọi máy có cùng cơn gió, nên bảng điểm so được và test không cần gieo số ngẫu nhiên.
- **Thermal** (nhiệt lưu) — Cột khí nóng bốc lên ở một vị trí ngang, sống vài giây rồi tắt. Bay vào thì lên nhanh gấp đôi và được cộng điểm, nhưng cũng kéo căng dây thêm một chút.
- **Line tension** (lực căng dây) — 0…1, bằng *gió × độ dài dây*. Chạm 1 là đứt. Đây là chỉ báo chính của minigame, và cũng là thứ quyết định độ võng của sợi dây trong cảnh 3D.
- **Line ceiling** (trần độ cao) — 0,95 × độ dài dây đang thả: diều KHÔNG THỂ bay cao hơn sợi dây giữ nó. Muốn lên cao phải thả thêm dây, mà dây dài thì căng — đó là toàn bộ trò chơi.
- **Sky frame** — Khung toạ độ của vùng trời: gốc ở chân người chơi, `forward` là hướng diều bay ra (do bối cảnh khai báo qua `kiteForward`), `right` là trục lạng. Đây là chỗ duy nhất đổi (độ cao, lạng, độ dài dây) thành toạ độ ba chiều.
- **Follow / eyes / kite / auto** — Bốn góc máy của ván diều (`kiteCamera.ts`). **Follow** (toàn cảnh, mặc định) neo camera trên đường dây rồi NGẮM THẲNG VÀO DIỀU: ngắm vào một điểm giữa dây thì ở 40 m con diều đã ra ngoài mép trên khung, còn ống kính chỉ nới theo tốc độ leo chứ không theo độ cao — nếu không thì diều lên cao là mất hút.
- **Ambience tự sinh** — `scripts/make-ambience.mjs` sinh `kite-fly.wav` (gió + sáo diều) và `candle-shop.wav` bằng công thức, trộn đuôi vào đầu để lặp liền mạch. Không tải file nào về nên không có ràng buộc giấy phép; xem `public/assets/ASSET_LICENSES.md`.
- **Cinematic mode** — Chế độ camera khoá tâm ngắm vào một điểm và nới ống kính (FOV 58). Cần cho thả diều vì dây dài tới 60 m, mà góc nhìn thứ ba bám nhân vật thì không khung hình nào chứa nổi cả người chơi lẫn con diều.

## Sổ hồi ký (progress)

- **Sổ hồi ký (journal)** — `src/world/progress`. Nguồn sự thật duy nhất SỐNG QUA NHIỀU PHIÊN: sợi chỉ, kỹ năng, kỷ lục, sen, cột khí nóng, số ván, trang đã mở, mục trong ngày. Ba lớp, ba việc: `store.ts` là reducer THUẦN (không biết `window`), `save.ts` là adapter `localStorage` ở rìa (nuốt mọi lỗi, kể cả JSON hỏng và chế độ riêng tư), `index.ts` là bản sống (`progress`) — nạp một lần, ghi đĩa khi có thay đổi thật, phát `journal` cho giao diện và `notice` cho người chơi.
- **Sợi chỉ (threads)** — đơn vị tiền tệ DUY NHẤT. Nhận từ trang hồi ký và mục trong ngày; kỹ năng không mua được, và cũng không có loại tiền thứ hai.
- **Trang hồi ký (memory page)** — cột mốc mở bằng con số mà sổ đã đếm (kỷ lục, tổng sen, tổng cột khí nóng). Trang chưa mở hiện ra như một ô `?` kèm một dòng mách nước — một câu hỏi để ngày mai trả lời, không phải một ô trong danh sách việc.
- **Buổi chiều hôm nay (daily)** — ba mục mỗi ngày, mỗi chỗ chơi đúng một mục, sinh từ CHUỖI NGÀY bằng PRNG có hạt giống nên tất định (cùng ngày → cùng buổi chiều, ở mọi máy). Không chuỗi ngày, không hình phạt: hôm nay không chơi thì chỉ là hôm nay không có mục mới.
- **Kỹ năng (skill)** — DELTA TUNING, không phải một hệ thống: `kiteTuning`/`swimTuning`/`shuttleTuning` trả về `DEFAULT_*` đã sửa vài trường. Nới cửa sổ, không phá luật — `snapTension` và `kickLow`/`kickHigh` không bao giờ bị kỹ năng chạm vào.
- **SessionReport** — đúng ba con số một ván báo lại: `name`, `score` (thứ so kỷ lục của trò đó) và `thermals`. `WorldGame.recordRun()` là chỗ DUY NHẤT ghi vào sổ, nên kỷ lục chỉ có một định nghĩa.
- **`Rương gỗ` → Sổ** — Sổ là một ĐỒ VẬT trước khi là một giao diện: mở từ điểm tương tác `chest` (nhãn "Sổ hồi ký", `payload.journal`), khoá điều khiển trong lúc mở, đóng bằng `Esc` hoặc nút. Không có bảng nào tự hiện lên giữa lúc chơi.

## Thế giới game

- **intro** — "Một ngày dài": buổi tối của người lớn, kết bằng giấc ngủ.
- **childhood** — "Ngày ấy": thế giới hồi tưởng, đánh thức bằng câu thoại và quyền điều khiển bật từ data (không soft-lock). Chương này đi qua bốn hồi ký, một ván thả diều, và khép lại bằng epilogue khi sân đã nhặt hết.
- **hồi ký (memory)** — Chương tương lai: scene hồi ký và trò chơi Oảnçán, cắm vào seam `activity`/`transition` sẵn có.
