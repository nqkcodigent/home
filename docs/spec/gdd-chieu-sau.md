# GDD — Chiều sâu cho "Hồi ký sân nhà" (cozy exploration)

Trạng thái: bản thiết kế để chốt. Kế thừa [nang-cap-game.md](nang-cap-game.md) và
[tickets-nang-cap-game.md](tickets-nang-cap-game.md) — hai tài liệu đó đã xong và đã
lên mã; tài liệu này nói về **bước tiếp theo**.

Vai trò tác giả: Lead Game Designer (cozy / open-world exploration) + kỹ sư three.js,
vì mọi đề xuất dưới đây phải cắm được vào mã đang có.

---

## 0. Đính chính hiện trạng — đọc trước khi thiết kế

Bản mô tả yêu cầu có một giả định sai, và nếu vẽ GDD trên giả định đó thì cả tài
liệu sẽ lạc. Kiểm lại bằng mã:

| Yêu cầu nói "đã có" | Thực tế trong mã | Hệ quả cho thiết kế |
|---|---|---|
| "Bay lượn (gliding) quanh khu vực nhà" | **Không tồn tại.** Không có trạng thái rời mặt đất: `Character.update()` luôn đặt `y` theo `groundHeight`, `resolveCollisions()` chỉ giải va chạm trên mặt phẳng XZ. Hai chữ "glide" trong mã là thứ khác: `GLIDE = 0.25` ([kiteSynth.ts](../../src/world/audio/kiteSynth.ts)) là hằng số làm mượt âm thanh, và `tuning.glide = 2.4` ([swim/model.ts](../../src/world/activities/swim/model.ts)) là tốc độ bơi tối đa. | Không thể "nâng cấp" thứ chưa có. Thay vào đó: **lượn bằng con diều** (mục 2.1) — dùng lại pha `adrift`, `kiteCamera`, `Creatures.skyFocus()`. Nếu vẫn muốn nhân vật tự lượn thì đó là dự án riêng, xem "Không làm" ở mục 7. |
| "Thả diều, bơi lội" | **Có thật**, đã có model thuần + lớp 3D + HUD: `activities/kite`, `activities/swim`, cộng thêm `activities/shuttlecock`. | Ba trò này là nơi gắn tiến trình; không cần thêm minigame mới để có chiều sâu. |
| "Open-world exploration" | Bản đồ `±72 m` ([childhoodYard.ts](../../src/world/locations/childhoodYard.ts), `bounds`) nhưng ngoài sân chỉ có cỏ, vành cây, gà, bướm. | "Vô hạn khám phá" hôm nay là **không gian rỗng**. Chiều sâu rẻ nhất không phải thêm đất, mà là làm cho đất đang có trở nên đáng đi (mục 2.4). |

Và ba sự thật quan trọng hơn cả bảng trên:

1. **Không có ký ức giữa các phiên.** `localStorage` không xuất hiện ở bất kỳ file
   nào. Kỷ lục đá cầu (`state.best`), điểm và độ cao diều, sen đã nhặt đều nằm
   trong bộ nhớ một ván và mất khi tải lại. *"Lý do quay lại ngày mai" hiện bằng
   không* — không phải vì thiếu cơ chế, mà vì không có gì được nhớ.
2. **Chưa có đồng hồ, chưa có ngày.** `SKY_PRESETS` có `goldenHour` **và** `night`
   ([Sky.ts](../../src/world/world/Sky.ts)) mà sân chỉ dựng `goldenHour`. Đêm, dế,
   đom đóm — dữ liệu đã có, chưa ai bật.
3. **Thời trang gần như miễn phí.** `AVATAR_LOOKS` đã có 4 biến thể với 4
   `hairStyle`, `accessory` gồm `cap`/`headband`/`nonLa`, khăn quàng có vật lý
   riêng — nhưng thế giới chỉ dựng `variant: "player"`. Cùng chỗ đó có sẵn
   "friend", "cousin", "adult" cho NPC.

**Kết luận thiết kế.** Game không thiếu minigame (đã ba). Game thiếu (a) ký ức
giữa các phiên, (b) lý do bước ra khỏi sân, (c) phần thưởng dùng được. GDD này
xoay quanh đúng ba chỗ đó.

### 0.1 Bốn luật không được vi phạm

Mọi đề xuất dưới đây đã được lọc qua bốn luật này. Đây là ràng buộc kỹ thuật của
mã đang có, không phải sở thích:

| # | Luật | Vì sao |
|---|---|---|
| L1 | **Luật chơi nằm ở model thuần và tất định.** Không RNG phi hạt, không đọc DOM, không đọc three trong `*/model.ts`. | Test hiện tại chạy vài phút mô phỏng trong vài ms và **so sánh hai lần chạy cho ra cùng kết quả** (sen trôi, cột khí nóng). Đưa tiến trình vào model là tự phá bộ test đó. Ranh giới hiện tại rất sạch và nên giữ: `Math.random()` chỉ có ở tầng trang trí ([Sky.ts](../../src/world/world/Sky.ts) — rải bụi, vẽ mây), không có ở bất kỳ `*/model.ts` nào; `Date.now()` cũng không xuất hiện trong `activities/` hay `world/`. |
| L2 | **Một ván một lúc, và luôn trả lái.** `WorldGame` là nơi giữ cương: `drivesCharacter` (bơi tự ghi vị trí), `skyFocus` (chim bám diều), `keepsMovement` (đá cầu cần đi lại), và `setControls(true)` sau mỗi `await`. | Đã từng có lỗi hai bên cùng ghi vị trí. Tiến trình không được thêm một bên ghi thứ ba. |
| L3 | **Không thêm thư viện, không tải asset ngoài.** Hình khối three.js + WebAudio; âm thanh nền sinh bằng `scripts/make-ambience.mjs`. | Ba dependency hiện tại là howler/react/three. `audioAssets.test.ts` còn khoá luật "mọi slot phải có file thật, >1 KB" — thêm slot là thêm ràng buộc test. |
| L4 | **Ngân sách khung hình.** Không dựng geometry trong `update()`; hiệu ứng phải là mesh tái dùng hoặc instanced. | Ba ván con + 874 dòng sinh vật đã chạy trên một draw-call budget của web. |

---

## 1. Trụ 1 — Tiến trình nhân vật

### 1.1 "Sổ hồi ký" — nguồn sự thật duy nhất

Một kho duy nhất, không phải ba hệ thống:

```
src/world/progress/store.ts     — kiểu dữ liệu + reducer thuần (không đụng localStorage)
src/world/progress/save.ts      — adapter localStorage ở RÌA (try/catch, versioned)
```

```ts
interface Journal {
  version: 1;
  threads: number;              // "sợi chỉ" — đơn vị tiền tệ DUY NHẤT
  skills: SkillId[];
  looks: string[];              // id look đã mở
  pet?: PetId;                  // một con, không phải bầy
  bests: Partial<Record<ActivityName, number>>;
  lotus: number;                // tổng sen đã nhặt
  entries: string[];            // trang hồi ký đã mở
}
```

Ba quyết định, có lý do:

- **Reducer thuần, adapter ở rìa.** `store.ts` không biết `window`, nên test chạy
  được trong node và tiến trình không lọt vào model.
- **Chịu được dữ liệu hỏng.** Chế độ riêng tư của trình duyệt ném lỗi khi ghi
  `localStorage`; JSON cũ do bản trước để lại có thể thiếu trường. Đọc hỏng → coi
  như sổ mới, chơi bình thường. *Test bắt buộc:* nạp JSON rác và JSON thiếu
  trường, không được ném.
- **Idempotent.** React StrictMode gọi effect hai lần; `store` chỉ ghi khi có thay
  đổi thật, không ghi đè bằng trạng thái rỗng lúc khởi động.

**Sổ không phải một popup giữa màn hình.** Yêu cầu gốc của dự án là trong lúc chơi
bình thường không có dialog nào che màn hình; Sổ chỉ mở khi người chơi tự mở. Và
nó nên mở bằng **một đồ vật trong thế giới**: `Rương gỗ` (`id: "chest"`) đã có sẵn
điểm tương tác trong nhà, đã có nhãn E, đã có `payload.sfx`. Đổi `label` thành
"Sổ hồi ký" và trỏ vào sổ là xong phần "vật lý hoá" của một bảng menu.

### 1.2 Kỹ năng = **delta tuning**, không phải hệ thống mới

Cả ba model đều đã nhận `tuning` làm tham số. Tiến trình vì thế chỉ là một hàm
thuần `applySkills(base, skills) → tuning`, và mọi con số đều là con số đang có:

| Kỹ năng | Hiệu ứng (trước → sau) | Trường thật | Mở khoá bằng |
|---|---|---|---|
| Diều · *Dây dài* I/II/III | trần dây 60 → 72 → 84 → 96 m | `KiteTuning.lineMax` | phá kỷ lục độ cao 30/55/80 m |
| Diều · *Dây bền* | ân hạn đứt 10 → 14 s; nguy cơ theo tải 0.12 → 0.095 | `snapGrace`, `snapLoad` | 3 ván bắt được ≥2 cột khí nóng |
| Bơi · *Sải tay* | tốc độ 2.4 → 2.75 m/s; nhịp quạt tay 5.5 → 6.2 rad/s | `glide`, `strokeRate` | nhặt hết 5 sen ba ván |
| Bơi · *Mắt nhặt* | tầm nhặt 0.85 → 1.05 m | `reach` | nhặt đủ 25 sen tích luỹ |
| Đá cầu · *Cầu dẻo* | cửa sổ đá 1.15 → 1.35 m | `ShuttleTuning.reach` | kỷ lục 10 cú liên tiếp |

Nguyên tắc cân bằng: **kỹ năng làm rộng cửa sổ, không làm mất luật.** *Dây bền*
không được biến "dây căng quá thì đứt" thành chuyện không xảy ra — nó chỉ dời
ngưỡng. Người chơi mới vẫn phải cảm nhận được rằng thả nhiều dây là liều.

`Character` **không** nhận tuning chuyển động (`Character.ts` đọc thẳng
`DEFAULT_MOTION`), nên "chạy nhanh hơn / dai sức hơn" không phải một delta — nó
cần thêm tuỳ chọn `motion` vào `CharacterOptions`. Việc nhỏ nhưng là **đổi
interface**, nên xếp P2 (mục 5). Xếp sai chỗ này là cách nhanh nhất để hỏng
animation ba trạng thái vừa làm.

### 1.3 Thời trang, và vì sao không có "trang bị"

Trang bị có chỉ số là sai genre: nó biến một buổi chiều quê thành bảng so sánh
DPS, và phá luôn luật "kỹ năng chỉ nới cửa sổ". Nên:

- **Thời trang thuần thị giác.** Mở bằng `threads` (sợi chỉ) hoặc bằng cột mốc
  hồi ký: kiểu tóc (`bowl`/`bob`/`short`/`pony`), phụ kiện (`nonLa` cho buổi
  chiều nắng, `cap`, `headband`), màu áo. Tất cả là dữ liệu **đã có** trong
  `AVATAR_LOOKS`; thay đổi duy nhất về interface: `createAvatar(variant)` cần nhận
  thêm look tuỳ biến (`createAvatar(look)`, giữ nguyên override mặc định theo
  variant để 4 biến thể cũ không đổi hành vi).
- **Một đuôi diều để sưu tầm.** `Kite.ts` đã dựng đuôi nơ nhiều đốt bằng mesh
  lặp lại; đổi màu/độ dài đuôi là tham số của đúng vòng lặp đó — phần thưởng
  "cosmetic" rẻ nhất trong cả game.
- **Thú cưng: một con, không phải bầy.** `Creatures` đã có gà bới quanh đống rơm
  (`WanderZone`), bướm lượn theo khóm hoa, chim cành đậu hàng rào. Thêm **một**
  chế độ `follow` cho đúng một con (gà con hoặc bướm) đi theo nhân vật là thay
  đổi nhỏ nhất có cảm giác "có bạn". Ràng buộc: chỉ một con; không nhân bản
  geometry mỗi frame; tắt khi vào ván bơi (dưới nước mà có bướm bay là lỗi hình).

### 1.4 Vì sao không có cây kỹ năng phân nhánh

Cây phân nhánh cần người chơi *đọc* nhiều, mà luật của dự án là giao diện không
chiếm màn hình. Ba nhánh × 3 cấp = 9 ô phải cân; trong khi đó chỉ có ba hoạt động
để nới. Thay vào đó: **mỗi hoạt động có đúng hai kỹ năng**, mở bằng thành tích
của chính hoạt động đó. Người chơi không phải chọn — họ chỉ phải chơi.

---

## 2. Trụ 2 — Đào sâu cơ chế

Mục tiêu chung: biến mỗi ván từ "thao tác đúng" thành "đọc tình huống". Mỗi trò
nhận **một luật mới**, không nhận hệ thống mới.

### 2.1 Diều — từ "giữ dây" thành "đọc trời", và lượn bằng diều

Luật hiện tại đã tốt: nâng chỉ phụ thuộc gió, trần độ cao bằng dây đang thả, căng
= nguy cơ đứt, `strain` tích luỹ nên ván nào cũng khác nhau. Ba thứ thêm vào:

1. **Cột khí nóng phải nhìn thấy mà không cần cột sáng.**
   Đây là một ràng buộc đã bị khoá bằng test: `Kite.test.ts` khẳng định "không còn
   vật liệu cộng sáng nào" và "trên trời chỉ có con diều". Nên tuyệt đối không
   quay lại đèn hiệu phát sáng — sẽ đỏ test ngay.
   **Giải pháp:** đàn chim. `Creatures` đã có đàn chim bay vòng và đã có kênh
   `skyFocus()` để bám theo một điểm trên trời (hiện dùng cho con diều). Trỏ đàn
   chim vào cột khí nóng đang sống (`thermalsAt(t)` đã trả về vị trí và tuổi) là
   biến nhiệt lưu thành thứ **đọc được bằng mắt mà vẫn "tự nhiên"** — chim lượn
   thành cột chính là dấu hiệu nhiệt lưu ngoài đời. Chi phí: gần bằng 0, dùng lại
   đúng đường dây có sẵn.
2. **Nhịp gió giật.** `windStrength(t)` hiện là một hàm trơn của thời gian. Đổi
   thành hai pha ngắn–dài (gió phơn rồi lặng) để người chơi học được *lúc nào nên
   thả dây* thay vì thả đều tay. Thuần số, tất định, test được: "thả dây đúng lúc
   giật thì lên nhanh hơn thả đều".
3. **Pha `adrift` trở thành chuyến lượn (đây là "bay lượn" đúng nghĩa của game).**
   Hiện khi đứt dây người chơi chỉ bấm `R`; `resolveShotMode()` **buộc** cảnh
   `drift` (bay theo diều) và chim bám theo qua `skyFocus()`. Thêm vào chuyến trôi:
   mỗi chuyến ghi lại một "trang" — trôi qua bao xa, hạ ở đâu (`state.drift` và
   HUD đã có), thưởng **sợi chỉ** theo quãng đường. Như vậy muốn "lượn ngắm cảnh"
   thì phải chấp nhận mất con diều — cái giá đúng chất trò chơi.

   **Ràng buộc bị khoá bằng test:** `kiteCamera.test.ts` có đúng một test khẳng
   định *"đứt dây rồi thì chỉ còn một cảnh: bay theo diều"* — mọi chế độ
   (`wide`/`eyes`/`auto`) đều bị ép về `drift`, và `KiteActivity.test.ts` cũng
   khẳng định "bấm đổi góc máy: cảnh vẫn là cảnh bay theo diều". Nên thiết kế này
   **không** được mở lại quyền đổi góc máy khi đã đứt dây (làm vậy là phải sửa
   kỳ vọng của test, tức là đổi luật chứ không phải thêm tính năng). Cách đúng và
   rẻ hơn: giữ nguyên luật một-cảnh, chỉ cho người chơi **xoay ống kính trong
   chính cảnh đó** (thêm độ lệch yaw/pitch quanh con diều, giống `CameraRig` vẫn
   làm), để "lượn" là *nhìn quanh từ trên cao* chứ không phải *đổi kênh camera*.

### 2.2 Bơi — từ "nhặt sen" thành "lặn"

Luật hiện tại: đạp tới, nước cản, giới hạn trong lòng ao bán kính 2.75 m, 5 bông
sen trôi tất định, `reach` 0.85 m, không có hình phạt. Thêm **một trục chiều sâu**:

- **Lặn.** Giữ phím mới (hoặc nút cảm ứng) để chìm; `SwimState` nhận thêm `depth`,
  `SwimTuning` thêm `depthMax`, `diveRate`, `breath`. HUD thêm một con số "Hơi".
- **Luật đọc được trong năm giây:** *sen sâu thì ở dưới; càng xuống sâu càng ít
  hơi.* Ba bông nổi như hiện tại, thêm hai bông chìm ở đáy (0.6–1.2 m).
- **Không có hình phạt** — giữ đúng tinh thần cozy: hết hơi thì nhân vật tự nổi
  lên, mất đà, không mất mạng, không mất điểm. Test: "hết hơi thì `depth` về 0 và
  không bao giờ âm".
- **Chi phí đã biết:** `SwimActivity` là ván `drivesCharacter`, lớp 3D đang ghi
  `y = WATER_Y + floatY + bob`. Thêm trục dọc nghĩa là lớp 3D phải ghi `y` theo
  `depth` — một chỗ duy nhất, nhưng phải làm cùng lúc với model, không làm rời.
- **Phím mới phải đi đủ đường:** `InputAction` trong [glyph.ts](../../src/components/glyph.ts)
  chỉ có `interact | confirm | sprint | move | back`, và mọi phím đều có glyph +
  nút cảm ứng. Thêm hành động lặn mà quên glyph là người chơi điện thoại không
  lặn được. Đây là lý do "lặn" đứng sau "sổ" trong thứ tự ưu tiên.

### 2.3 Đá cầu — từ "bấm E" thành "nhịp"

- **Chấm điểm cú đá.** Cú đá đã là một hàm của khoảng cách và thời điểm
  (`model.ts` so `distance <= tuning.reach`). Nới thành ba mức: *hoàn hảo* (đúng
  tầm chân, gần tâm), *tốt*, *lỡ* — hoàn toàn thuần số, và hiện lên HUD dưới dạng
  một từ chứ không phải một thanh: người chơi học bằng mắt.
- **Người đá cùng.** `AVATAR_LOOKS` có sẵn `friend` mà chưa ai dựng trong sân.
  Một `Character({ variant: "friend" })` đứng bên kia, đưa cầu trả lại là biến
  trò này từ "tung rồi tự đá" thành "đối đánh nhẹ". Đây là ticket lớn nhất trong
  tài liệu (cần state machine cho NPC), nên xếp P2; bản P1 chỉ cần chấm điểm +
  lưu kỷ lục.

### 2.4 Khám phá — biến 144 × 144 m thành "có chỗ để đi"

Không mở thêm vùng đất mới (đó là ticket địa hình, đắt và không giải quyết vấn đề
"vì sao phải đi"). Ba việc rẻ mà đổi cảm giác:

1. **Đồi gió.** `terrainHeight()` đã có ba lớp đồi; đồi cao nhất nằm ngoài sân.
   Thêm một hệ số gió theo vị trí (`windBase` × hệ số của đồi) và **một điểm tương
   tác mới ở sườn đồi** (`Spot` + `activity: "kite"` — cơ chế đã có, chỉ thêm dữ
   liệu). Thả diều trên đồi khác hẳn thả diều ở sân, mà không cần địa hình mới.
2. **Chỗ để ngồi rải rác.** Hệ thống ghế đã có: `SeatView` nằm trong `SpotData.seat`
   ([childhoodYard.ts](../../src/world/locations/childhoodYard.ts)) và `Character.sit()`
   tự đi tới ghế rồi ngồi (pha `approach`), nhãn `Badges` cũng đã có sẵn. Rải 6–8
   "chỗ ngồi" mới (gốc cây, bờ cỏ, bậc đá) quanh bản đồ; mỗi chỗ ngồi đủ lâu mở
   **một dòng hồi ký** vào Sổ. Đây là nội dung khám phá mà chi phí đúng bằng dữ
   liệu — không cần cơ chế mới nào.
3. **Chạng vạng theo tiến trình, không theo đồng hồ thật.** Đếm số trang hồi ký
   đã mở; đủ ngưỡng thì sân chuyển từ `SKY_PRESETS.goldenHour` sang `night`, kèm
   đổi ambience (`crickets.mp3` **đã có trên đĩa**, hiện chưa ai gọi) và bật đom
   đóm. Dùng tiến trình thay vì giờ hệ thống vì (a) không lệch múi giờ, (b) không
   cần `Date.now()` trong model, (c) người chơi thấy mình *đã làm gì đó* mà trời
   đổi. Đêm cũng là "bản đồ thứ hai" rẻ nhất có thể: cùng địa hình, khác ánh sáng
   và khác con vật.

---

## 3. Trụ 3 — Vòng lặp & động lực

### 3.1 Mười phút đầu (kịch bản theo phút)

Không có màn hướng dẫn, không có popup: dạy bằng **nhãn + một câu `notice`**. Ba
ván con phải nối nhau thành một buổi chiều, không phải ba menu.

| Thời gian | Người chơi làm gì | Hệ thống dạy bằng gì |
|---|---|---|
| 0:00–0:30 | Thức dậy trong nhà, cửa sổ sáng, tiếng chim (`childhoodBirds` đã phát) | Nhãn `Cánh cửa` (E) — thứ duy nhất trên màn hình |
| 0:30–1:30 | Ra sân; gà chạy ngang; gió nổi (`kiteSynth`) | Nhãn `Thả diều`; một câu `notice` ngắn: "Lại gần rồi bấm E" |
| 1:30–4:00 | Ván diều đầu, mục tiêu mềm "lên 20 m" | HUD diều (đã có) + lần đầu bắt nhiệt lưu → thông báo + `thermalBonus` |
| 4:00–6:30 | Ao: nhặt 5 sen | Nhãn `Xuống ao bơi`; HUD hiện "Sen 0/5" (đã có) |
| 6:30–9:00 | Đá cầu, cố phá kỷ lục | Nhãn `Đá cầu`; HUD hiện "Liên tiếp / Kỷ lục" (đã có) |
| 9:00–10:00 | Vào nhà, mở `Rương gỗ` → **Sổ hồi ký** | Sổ hiện 3 trang đã có dấu + 1 ô trống "?" — câu hỏi mở cho ngày mai |

Điểm cốt tử: phút thứ 10 kết thúc bằng **một ô trống**, chứ không bằng một bảng
"chúc mừng hoàn thành". Đó là toàn bộ động lực quay lại.

### 3.2 Ba tầng mục tiêu

- **30 giây:** bắt một nhiệt lưu · nhặt một bông sen · ba cú liên tiếp · một cú
  đá *hoàn hảo*.
- **Một phiên (~10 phút):** ba mục "Buổi chiều hôm nay" + một trang hồi ký.
- **Dài hạn:** Album hè — kỹ năng, look, đuôi diều, thú cưng, chạng vạng.

### 3.3 Lý do quay lại ngày mai — "Buổi chiều hôm nay"

Ba mục mỗi ngày, sinh từ chuỗi ngày (`YYYY-MM-DD`) bằng chính PRNG có hạt giống
`mulberry` mà `Props`/`swim/model` đang dùng. Tất định, không cần server, không
có số ngẫu nhiên nào lọt vào model (việc sinh mục nằm ở `progress/`, không nằm ở
`model.ts` — luật L1).

Ví dụ mục: *"Bắt hai cột khí nóng trong một ván"* · *"Nhặt năm sen trước khi mặt
trời lặn"* · *"Ngồi băng ghế, không làm gì, một phút"* · *"Đá mười cú"* · *"Để
dây đứt ở phía đông"*.

Phần thưởng: **sợi chỉ** — một loại tiền duy nhất, dùng cho look/đuôi diều/thú
cưng. Không có chuỗi ngày (streak) và không có hình phạt bỏ lỡ: hôm nay không
chơi thì chỉ là hôm nay không có mục mới. Cozy game không được phạt người chơi
vì đi làm.

### 3.4 Nhiệm vụ ẩn — không có bảng nhiệm vụ

Bốn ví dụ, mỗi cái cắm vào một thứ đã tồn tại:

| Ẩn | Điều kiện | Cắm vào |
|---|---|---|
| *Một phút không làm gì* | ngồi yên + chế độ ngắm cảnh (H) đủ 60 s | `scenic` + `seated` trong `WorldGame` |
| *Chạm trần trời* | `altitude` ≥ 85 m trong một ván diều | `state.altitude`, `maxAltitude: 90` |
| *Ba lần tiễn diều* | đứt dây ba lần ở ba hướng khác nhau | `KiteOutcome.snapped` + `state.drift` |
| *Khách không mời* | đến sát chim cành cho nó bay mất, rồi quay lại đúng chỗ đó sau 60 s | đã có hành vi "tới gần là bay mất" |

Phần thưởng ẩn = một dòng trong Sổ + thông báo `Announce` + tiếng riêng. Không
hiện checklist: bảng nhiệm vụ ẩn mà nhìn thấy thì không còn ẩn.

---

## 4. Trụ 4 — Game feel

| Cảm giác cần có | Thêm gì | Chỗ cắm (đã có sẵn) | Ghi chú |
|---|---|---|---|
| Diều căng như dây đàn | dây rung theo `tension`; cao độ tiếng sáo lên khi gần đứt | `KiteSynth` đã nhận `{ altitude, wind, tension }` | thêm `gust` vào params, không thêm asset |
| Gió hiện ra thành hình | 3–5 dải gió mảnh uốn theo `windDirection`, chỉ hiện khi giật | `wind`/`windDirection` đã có trong HUD | một `InstancedMesh`, không dựng lại mỗi frame (L4) |
| Chuyến trôi có sức nặng | rung camera nhẹ khi căng; camera bám vận tốc khi trôi | `CameraRig` vốn nhận `Tweens`; `kiteCamera` đã bám vận tốc | dùng `Tweens`, không tự đếm thời gian |
| Nước có trọng lượng | vệt nước sau lưng khi bơi nhanh, bọt khi lặn/ngoi, tối dần khi xuống sâu | `spawnRipple` đã có; `Sky.applyFog` đổi được sương | âm nước sinh bằng WebAudio |
| Bước chân đúng mặt nền | cỏ / sàn gỗ / nước nghe khác nhau | `location.footstepSlot` hiện là **một** slot | đổi thành tra theo bề mặt; file sinh bằng `scripts/make-ambience.mjs`, và **phải thêm vào `AUDIO_SLOTS`** nếu không `audioAssets.test.ts` sẽ đỏ |
| Nhân vật sống hơn | thở (đã có), chớp mắt (đã có), đầu quay theo con diều, vuốt tóc khi đứng lâu | `Character` đã có `perform`, `skyFocus()` đã cho toạ độ diều | nhìn theo diều là **miễn phí nhất**: dữ liệu đã chạy sẵn |
| Bướm biết đậu | đứng yên 15 s thì bướm đậu lên vai | `Creatures` vùng lượn bướm (`butterflyZones`) | khoảng cách + thời gian, thuần số |
| Bớt "dính" ở mép | đi dọc tường không bị hút; chạy qua cửa không kẹt | `resolveCollisions` + chuỗi tường nhà | **lỗi đã đo được**: lối qua cửa còn 0,08 m hiệu dụng, đi bộ thì lọt, chạy thì kẹt — xem mục 7 |

---

## 5. Thứ tự làm & chi phí

| Ưu tiên | Việc | File chạm | Vì sao đứng ở đây |
|---|---|---|---|
| **P0** | `progress/store.ts` + `save.ts` + test JSON hỏng | mới; `WorldGame`, `App.tsx` | Không có cái này thì mọi thứ dưới đây reset mỗi lần tải lại — kể cả khi làm xong vẫn không có lý do quay lại |
| **P0** | Rương gỗ mở Sổ hồi ký (3 tab: Kỹ năng / Trang / Trang phục) | `childhoodYard.ts`, `components/` | Biến tiến trình thành thứ nhìn thấy được, không cần popup giữa màn hình |
| **P0** | Lưu kỷ lục 3 trò + cộng `threads` | `KiteActivity`, `SwimActivity`, `ShuttlecockActivity` | Sửa ở chỗ phát `play`/`kiteResult`, **không** sửa model (L1) |
| **P0** | "Buổi chiều hôm nay" (3 mục/ngày) | `progress/` + Sổ | Đây chính là câu trả lời cho "vì sao ngày mai quay lại" |
| **P1** | Đàn chim lượn theo cột khí nóng | `Creatures`, `KiteActivity` | Làm nhiệt lưu nhìn thấy được **mà không** vi phạm test "không cột sáng" |
| **P1** | Nhịp gió giật + điểm theo nhiệt lưu | [kite/model.ts](../../src/world/activities/kite/model.ts) + test | Thuần số, test được, đổi hẳn chiều sâu ván diều |
| **P1** | Chuyến trôi = chuyến lượn + xoay ống kính | `kite/KiteActivity`, `kiteCamera`, HUD | "Bay lượn" đúng nghĩa, không cần thêm trục chuyển động cho nhân vật; **giữ nguyên** luật một-cảnh-khi-đứt-dây |
| **P1** | Look + đuôi diều mở bằng `threads` | `avatar.ts`, sổ, `Kite.ts` | Dữ liệu đã có; phần thưởng phải *nhìn thấy* được |
| **P1** | Chạng vạng + dế + đom đóm | `Sky`, `childhoodYard`, `HowlerAudio` | `SKY_PRESETS.night` và `crickets.mp3` đã nằm sẵn trên đĩa |
| **P2** | Lặn ở ao (trục chiều sâu) | [swim/model.ts](../../src/world/activities/swim/model.ts), [SwimActivity.ts](../../src/world/activities/swim/SwimActivity.ts), [Input.ts](../../src/world/Input.ts), [glyph.ts](../../src/components/glyph.ts) | Cần phím mới ⇒ phải làm cả glyph + nút cảm ứng |
| **P2** | Chấm cú đá + bạn đá cùng | [shuttlecock/model.ts](../../src/world/activities/shuttlecock/model.ts), NPC `friend` | NPC cần state machine riêng; đây là ticket to nhất |
| **P2** | Thú cưng đi theo | `Creatures` | Rẻ về mã, nhưng phải xử lý trường hợp xuống nước |
| **P2** | Kỹ năng đi/chạy | `CharacterOptions.motion` | Đổi interface `Character` — đụng vào animation vừa xong |
| **P2** | Đồi gió + 6–8 chỗ ngồi mới | `layout.ts`, `childhoodYard.ts` | Nội dung thuần dữ liệu, làm được bất cứ lúc nào |

**Nếu chỉ được làm ba việc:** P0 · P0 · P0. Ba việc đầu là ba việc duy nhất biến
"một buổi chiều chơi thử" thành "một game để quay lại".

> **Trạng thái 2026-10-16:** bốn việc P0 cộng §1.2 (kỹ năng = delta tuning) đã
> lên mã — xem §8 để biết cái gì nằm ở đâu và đã kiểm bằng gì.

---

## 6. Tiêu chí nghiệm thu

| # | Tiêu chí |
|---|---|
| B1 | `npm test`, `npm run build`, `npm run lint` sạch — và **toàn bộ test hiện có vẫn xanh mà không bị sửa kỳ vọng**. |
| B2 | Tắt tab rồi mở lại: kỷ lục ba trò, số `threads`, look đã mở vẫn còn. Xoá `localStorage` → chơi được như máy mới, không ném lỗi. |
| B3 | Dữ liệu hỏng (JSON rác, thiếu trường, `version` lạ) → không ném, mở sổ mới. |
| B4 | Ba mục "Buổi chiều hôm nay" tất định theo ngày: cùng ngày → cùng mục; sinh ở tầng `progress/`, không có `Math.random` trong `*/model.ts`. |
| B5 | Kỹ năng chỉ *delta tuning*: test nạp `applySkills` rồi chạy mô phỏng, khẳng định luật cũ vẫn giữ (dây quá căng vẫn đứt; hết hơi vẫn nổi lên). |
| B6 | Không có popup/dialog nào tự hiện trong lúc chơi; Sổ chỉ mở từ `Rương gỗ` (hoặc nút người chơi chủ động bấm). |
| B7 | Trên trời vẫn **chỉ có con diều**: `Kite.test.ts` (không vật liệu cộng sáng, không cột sáng) vẫn xanh sau khi thêm dấu hiệu nhiệt lưu. |
| B8 | Mọi slot âm thanh mới đều có file thật >1 KB và nằm trong `AUDIO_SLOTS` (`audioAssets.test.ts` xanh). |
| B9 | Mọi hành động bấm mới đều có glyph bàn phím **và** nút cảm ứng (kiểm bằng mắt trên khổ hẹp). |
| B10 | Vào/ra ba ván liên tiếp, kể cả khi đứt dây giữa ván: quyền điều khiển luôn trả lại, không có nhãn nào kẹt, không rò rỉ mesh (số con trong scene không tăng sau mỗi ván). |

---

## 7. Rủi ro, và những thứ cố ý KHÔNG làm

### Rủi ro có thật trong mã (không phải giả định)

| Rủi ro | Vì sao có thật | Cách chặn |
|---|---|---|
| Tiến trình làm hỏng tính tất định của model | test hiện tại so hai lần chạy phải ra cùng kết quả | Luật L1: không RNG, không đọc storage trong `model.ts`; tiến trình đi vào qua **tham số tuning** đã có |
| Thêm người ghi thứ ba vào vị trí nhân vật | bơi đã là ván `drivesCharacter`; có tiền lệ "hai bên cùng ghi là nhân vật giật" | Tiến trình không được chạm vị trí; mọi ghi vị trí vẫn chỉ ở `WorldGame`/ván con |
| Rò rỉ vật thể khi vào/ra ván | đã từng có lỗi `dispose()` bỏ quên con diều trong scene | B10: đếm con trong scene trước/sau mỗi ván |
| StrictMode gọi `start()` hai lần | có ghi chú ngay trong `WorldGame.start()` | `store` idempotent, chỉ ghi khi có delta |
| `localStorage` bị chặn (chế độ riêng tư) | ghi là thao tác có thể ném | try/catch ở adapter, chơi được, chỉ là không lưu |
| Phím mới bỏ quên bản cảm ứng | `InputAction` là danh sách đóng, có glyph cho từng phím | B9 |
| VFX ăn hết khung hình | ba ván con + sinh vật đã chạy trên web | Luật L4; dải gió phải là instanced, không dựng geometry trong `update()` |
| Thêm slot âm thanh nhưng thiếu file | `audioAssets.test.ts` sinh ra từ đúng cái bẫy `kiteFly` | B8 |

### Đã đo được nhưng chưa xử lý

**Lối qua cửa nhà chỉ còn ~0,08 m hiệu dụng** (tường nhà là chuỗi hình tròn):
đi bộ lọt, **chạy (Shift) thì kẹt**. Đây là lỗi người chơi gặp được, nhưng sửa nó
là đụng vào hình khối nhà hoặc `resolveCollisions`; chưa chứng minh được lợi ích
đủ để đổi bán kính va chạm của cả căn nhà. Đề xuất: đưa vào P2 như một mục "bớt
dính ở mép" có test riêng (đi và chạy qua cửa, đo bằng bước chân thật), **không**
sửa mò trong lúc làm tiến trình.

### Cố ý không làm (kèm lý do)

- **Nhân vật tự bay/lượn (gliding) như một hệ thống.** Cần trạng thái rời mặt đất
  trong `Character` (hiện luôn bám `groundHeight`), luật va chạm ba chiều, camera
  riêng, và một vùng trời để lượn. Đó là một dự án, không phải một tính năng — và
  bản "lượn bằng diều" ở mục 2.1 cho **cùng cảm giác** với chi phí gần bằng 0.
- **Mở rộng địa hình / thêm bản đồ mới.** Đắt, và không giải quyết vấn đề "vì sao
  phải đi". Chạng vạng + đồi gió + chỗ ngồi cho nhiều cảm giác mới hơn trên cùng
  một bản đồ.
- **Trang bị có chỉ số, tiền tệ nhiều loại, bảng nhiệm vụ, chuỗi ngày.** Bốn thứ
  này biến cozy thành công việc.
- **Nhiều người chơi / chia sẻ trực tuyến.** Cần server; ngoài phạm vi một web
  game tĩnh.

---

## 8. Trạng thái — P0 đã lên mã

Bốn việc P0 ở §5 đã xong, cộng §1.2 (kỹ năng = delta tuning) đi kèm: trang Kỹ
năng không có gì để nói nếu bộ số của ba ván không thật sự đổi theo.

| Việc P0 | Ở đâu |
|---|---|
| Sổ + lưu trữ | [store.ts](../../src/world/progress/store.ts), [save.ts](../../src/world/progress/save.ts), [index.ts](../../src/world/progress/index.ts) |
| Danh mục: kỹ năng, trang, mục trong ngày | [skills.ts](../../src/world/progress/skills.ts), [pages.ts](../../src/world/progress/pages.ts), [daily.ts](../../src/world/progress/daily.ts) |
| Rương gỗ mở Sổ (Hôm nay / Kỹ năng / Trang) | [childhoodYard.ts](../../src/world/locations/childhoodYard.ts) (`chest` → `payload.journal`), `WorldGame.openJournal()`, [Journal.tsx](../../src/components/Journal.tsx), [journal.css](../../src/styles/journal.css) |
| Ghi kỷ lục ba trò + cộng sợi chỉ | `summary()` của ba ván con, `WorldGame.recordRun()`, `progress.record()` |
| "Buổi chiều hôm nay" | `daily.ts` + trang đầu của Sổ |

Kiểm bằng: **295 test** (47 test mới, trong đó có JSON hỏng, `localStorage` bị
chặn, tất định theo ngày, và "dây quá căng vẫn đứt kể cả khi có *Dây bền*");
`tsc -b`, `eslint`, `npm run build` đều sạch, không test cũ nào bị sửa kỳ vọng;
và một lượt chơi thật trong trình duyệt — mở rương thì sổ hiện và thế giới đứng
im, một ván diều thật ghi được kỷ lục + trang + sợi chỉ vào `localStorage`, tải
lại trang thì sổ còn nguyên và không cộng thừa sợi chỉ nào, gấp sổ rồi tháo ván
thì quyền điều khiển trả lại và số vật thể trong scene về đúng như trước.

Còn lại nguyên như §5: P1 (đàn chim theo cột khí nóng, nhịp gió giật, chuyến
trôi + xoay ống kính, look/đuôi diều, chạng vạng + dế) và P2. Một hệ quả cần
nói rõ: **trong P0, sợi chỉ chưa có chỗ tiêu** — chỗ tiêu là look và đuôi diều,
thuộc P1. Sổ đếm và hiện đúng số đang giữ, chứ không bịa ra một cửa hàng.

Hai chỗ đi khác §5, và cả hai đều là bỏ bớt chứ không phải thêm:

- Ba phần của sổ là **Hôm nay / Kỹ năng / Trang**, không phải "Kỹ năng / Trang /
  Trang phục": mục trong ngày là thứ mở sổ ra để xem trước tiên, còn Trang phục
  hoãn sang P1 — chưa có `createAvatar(look)` thì nó chỉ là một cửa hàng không
  bán gì.
- Nhãn của điểm tương tác đổi từ "Rương gỗ" thành **"Sổ hồi ký"**: nhãn nói việc
  người chơi sắp làm, không nói tên món đồ. Rương vẫn là chiếc rương cũ, và nắp
  rương vẫn bật lên như trước.

## 9. Trạng thái — P1 đã lên mã

| Việc P1 | Ở đâu | Kiểm bằng |
|---|---|---|
| ① Đàn chim lượn theo cột khí nóng | `SkyFocus.thermal`, `birdThermalSpiral()` ([Creatures.ts](../../src/world/world/Creatures.ts)), `KiteActivity.updateThermalFocus()` | chim ở trong bán kính cột và trải dọc cột; ván diều chỉ được chim tới cột gần nhất. `Kite.test.ts` (trên trời chỉ có con diều) vẫn xanh. |
| ② Nhịp gió giật | `gustEnvelope()`, `windGust` ([kite/model.ts](../../src/world/activities/kite/model.ts)); HUD "gió giật · thả dây!" | "thả dây đúng lúc giật thì lên cao hơn thả lúc lặng"; mọi test cũ của mô hình xanh, không sửa kỳ vọng. |
| ③ Chuyến trôi = chuyến lượn | `SessionReport.drift`, `driftThreads()` (15 m = 1 sợi, trần 6); xoay ống kính quanh diều đã có ở `CameraRig` | test sợi chỉ theo quãng trôi, dữ liệu lạ không sinh chỉ. Luật một-cảnh-khi-đứt-dây giữ nguyên. |
| ④ Trang phục + đuôi diều | [looks.ts](../../src/world/progress/looks.ts), `buyLook`/`wearLook` ([store.ts](../../src/world/progress/store.ts)), `createAvatar(variant, patch)`, `Character.dress()`, `KiteModel.setTailColor()`, tab "Trang phục" của Sổ | đổi/mặc/cởi, mỗi ô một món, sổ cũ thiếu trường vẫn đọc được, dữ liệu sửa tay bị lọc; thay đồ giữ nguyên vị trí và đi tiếp được. |
| ⑤ Chạng vạng + dế + đom đóm | `duskLevel()` (từ trang thứ 3, trần 0,8), `Sky.setDusk()`, `WorldGame.applyDusk()` | trời trôi dần chứ không bật công tắc; vào game thì đặt ngay mức đã lưu. |

Đi khác §5 một chỗ: chạng vạng có **trần 0,8** — hoàng hôn tím chứ không phải đêm
đen. Preset `night` được làm cho căn phòng; dùng hết ở ngoài sân thì không còn
thả diều hay bơi được. Đom đóm là chính bụi nắng đổi màu (cùng một `Points`,
luật L4), nên cả đàn chớp chung một nhịp — ghi `shortcut:` trong `Sky.ts`.

Mở Sổ giờ tự trả con trỏ chuột (nếu đang khoá) để bấm được nút trong Sổ.


## 10. Trạng thái — va chạm + P2 đã lên mã

| Việc | Ở đâu | Khoá bằng test |
|---|---|---|
| Va chạm êm: tường/cửa là **đoạn có độ dày** (`Obstacle.toX/toZ`) thay chuỗi hình tròn; tốc độ dáng chân = quãng đi thật sau va chạm (bỏ `speed × 0.4` mỗi frame chạm); đâm thẳng vào tường thì hai tay chống ra | [collide.ts](../../src/world/physics/collide.ts), [Character.ts](../../src/world/character/Character.ts), [Props.ts](../../src/world/world/Props.ts) | `collide.test`, `Character.test` (trượt xiên giữ ~1,55 m/s, không lắc) |
| **Lỗi kẹt cửa khi chạy** (§7) — nguyên nhân thật là tốc độ sụp khi sượt mép cửa, cộng đầu tường lấn 0,22 m vào lối | như trên | `house.test`: nhân vật thật chạy Shift qua cửa ở 5 độ lệch (bản cũ kẹt ở z = 3,34) |
| Lặn ở ao: giữ Shift (cùng phím chạy) để chìm, `depth`/`air`/`gasping`, 2 sen chìm 0,6–1,2 m, HUD "Hơi"; mặt đất khoét lỗ tròn bằng shader + lòng ao bùn | [swim/model.ts](../../src/world/activities/swim/model.ts), [Terrain.ts](../../src/world/world/Terrain.ts), nút ⇧ cảm ứng trong [Joystick.tsx](../../src/components/Joystick.tsx) | `swim/model.test` (hết hơi tự nổi, `depth` không âm) |
| Đá cầu: chấm *hoàn hảo/tốt/hụt*; bạn (`friend`) đứng bên kia, chạy đón chỗ cầu sắp rơi rồi đá trả | [shuttlecock/model.ts](../../src/world/activities/shuttlecock/model.ts), [ShuttlecockActivity.ts](../../src/world/activities/shuttlecock/ShuttlecockActivity.ts) | `shuttlecock/model.test` (lượt đối đánh 6 cú không rơi) |
| Thú cưng: chó vàng đi theo, vướng ao/tường thì ngồi đợi, lạc xa thì về sau lưng chủ | [Pet.ts](../../src/world/world/Pet.ts) | `pet.test` |
| 7 gốc cây ngắm cảnh + cửa sổ + băng ghế = 9 chỗ; ngồi 4 giây ghi một dòng vào Sổ (+1 chỉ) | [nooks.ts](../../src/world/progress/nooks.ts), `NOOK_SEATS` trong [childhoodYard.ts](../../src/world/locations/childhoodYard.ts) | `store.test` |
| Kỹ năng đi/chạy: *Bước nhẹ* (3 chỗ) đi 2.2 → 2.5; *Chân sáo* (7 chỗ) chạy 4.5 → 5.3 | `CharacterOptions.motion`, `motionTuning` | `store.test` |
| Đồi gió (16, −46, cao ~3,5 m): bãi diều riêng `windBase` 0.72 / `windSwing` 0.2, diều bay về phía bắc | `HILL_KITE_SPOT` | — (dữ liệu) |

Ghi chú: tháp chuông trước đây đặt ở y = 0 nên bị chôn ~2,6 m dưới đồi — nay đặt theo `terrainHeight`.
Nhãn tương tác giờ tính từ mặt đất (cần cho chỗ ngồi trên đồi).

## 11. Trạng thái — P3–P6 (từ §3.4 và §4) đã lên mã

GDD gốc chỉ xếp tới P2; P3–P6 là phần còn lại của §3.4 và §4, xếp theo thứ tự
đã chốt với người chơi thử.

| Ưu tiên | Việc | Ở đâu | Khoá bằng test |
|---|---|---|---|
| **P3** | Bốn nhiệm vụ ẩn: *Một phút không làm gì* (ngồi + H 60 s), *Chạm trần trời* (≥ 85 m), *Ba lần tiễn diều* (đứt dây ở trái/giữa/phải), *Khách không mời* (hù chim, đi khỏi > 8 m, quay lại sau 60 s). +3 chỉ mỗi cái; Sổ chỉ in cái đã tìm ra + "còn n điều chưa ai kể" | [secrets.ts](../../src/world/progress/secrets.ts), `recordSecret`/`recordSession` trong [store.ts](../../src/world/progress/store.ts), `watchSecrets` trong [WorldGame.ts](../../src/world/WorldGame.ts) | `store.test` (ba bí mật qua reducer), `KiteActivity.test` (`snapSide`) |
| **P4** | Dây rung khi căng > 0,7; sáo vút +120 Hz khi gần đứt, gió rít to hơn lúc giật; vệt gió `WindStreaks` chỉ hiện lúc giật (ngoài `KiteField`, nét 1 px trong suốt); rung camera theo căng đã có từ trước (`shakeAmount`) | [Kite.ts](../../src/world/activities/kite/Kite.ts), [WindStreaks.ts](../../src/world/activities/kite/WindStreaks.ts), [kiteSynth.ts](../../src/world/audio/kiteSynth.ts) | `kiteSynth.test`, `KiteActivity.test` |
| **P5** | Vệt sóng sau lưng (dày theo tốc độ; sửa luôn lỗi cũ: vòng sóng bám theo người bơi thay vì đứng yên); mặt ao đục dần khi lặn sâu; bước chân sàn gỗ / cỏ khác tiếng | [SwimActivity.ts](../../src/world/activities/swim/SwimActivity.ts), `footstepAt` trong [childhoodYard.ts](../../src/world/locations/childhoodYard.ts) | `SwimActivity.test`, `house.test` |
| **P6** | Đầu ngoái theo con diều và theo món đồ đang đứng gần (`Character.setGaze`); đứng yên 15 s thì một con bướm trong 12 m bay tới đậu lên vai, bước đi là bay mất | [Character.ts](../../src/world/character/Character.ts), [Creatures.ts](../../src/world/world/Creatures.ts) | `Character.test`, `creatures.test` |

Chưa làm từ §4: tiếng nước khi bơi bằng WebAudio (vệt sóng + đục nước đã đủ
"trọng lượng" mà không thêm nguồn âm), bước chân trên mặt nước (không đi bộ
trên nước được), nhân vật vuốt tóc khi đứng lâu.

## 12. Thế giới mở — lực kéo đi xa (sau P6)

Chẩn đoán: bản đồ ~140 × 140 m nhưng không có gì **gọi** người chơi rời lối đi,
đi xa không **nhặt** được gì, và không có gì **ghi lại** hành trình. Ba việc,
mỗi việc vá đúng một chỗ:

| Việc | Ở đâu | Khoá bằng test |
|---|---|---|
| Cột mốc nhìn thấy từ sân: cây đa cô đơn trên đỉnh đồi gió (có va chạm), con diều của đứa trẻ khác lượn trên tháp chuông (có dây), khói bếp từ ống khói nhà | [Landmarks.ts](../../src/world/world/Landmarks.ts), `YARD.hillTree`, `CHIMNEY_TOP` | `creatures.test` (`smokePuff`) |
| 8 kỷ vật tuổi thơ lấp lánh rải xa sân; đi ngang qua là nhặt (≤ 1,1 m), +1 chỉ, một dòng hồi ký; nhặt rồi thì lần sau không còn trên cỏ | [keepsakes.ts](../../src/world/progress/keepsakes.ts), `watchExploration` trong [WorldGame.ts](../../src/world/WorldGame.ts) | `store.test` |
| Tab "Bản đồ" trong Sổ: bản đồ vẽ tay, chỉ hiện 13 địa danh đã đặt chân tới (bước vào bán kính là ghi), sao vàng ở chỗ kỷ vật đã nhặt | [places.ts](../../src/world/progress/places.ts), `MapTab` trong [Journal.tsx](../../src/components/Journal.tsx) | `Journal.test`, `store.test` |

Cố ý không làm: la bàn / mũi tên chỉ đường trên HUD (phá cảm giác tự tìm), dấu
"?" cho nơi chưa tới trên bản đồ (bản đồ trống chỗ nào thì chỗ đó là câu hỏi).
