/**
 * Tải font UI (bo tròn, có tiếng Việt) về máy và sinh `src/styles/fonts.css`.
 *
 * Vì sao tải sẵn: game phải chạy được offline, và tiếng Việt cần subset
 * `vietnamese` (U+1EA0-1EF9) — thiếu subset là dấu bị tofu ngay.
 *
 * Cách làm: gọi Google Fonts CSS2 API bằng User-Agent của Chrome hiện đại để
 * nhận về woff2 (thay vì ttf), giữ nguyên từng khối @font-face kèm
 * `unicode-range`, chỉ đổi URL sang file nội bộ.
 *
 *   node scripts/fetch-ui-fonts.mjs
 */
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";

const FAMILIES = [
  // Tiêu đề: bo tròn, dày, hợp không khí "vườn tuổi thơ".
  { css: "Baloo+2:wght@400..800", slug: "baloo2" },
  // Nội dung: dễ đọc ở cỡ nhỏ, family dự phòng khi Baloo thiếu tiếng Việt.
  { css: "Nunito:wght@400..800", slug: "nunito" },
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const OUT_DIR = path.join("public", "assets", "ui", "fonts");
const OUT_CSS = path.join("src", "styles", "fonts.css");

/** @returns {Promise<string>} nội dung CSS của Google Fonts */
async function fetchCss(query) {
  const url = `https://fonts.googleapis.com/css2?family=${query}&display=swap`;
  const response = await fetch(url, { headers: { "User-Agent": UA } });

  if (!response.ok) {
    throw new Error(`Google Fonts ${query} → HTTP ${response.status}`);
  }

  return response.text();
}

/** Tách CSS thành các khối @font-face thô. */
function splitFaces(css) {
  return [...css.matchAll(/@font-face\s*\{([\s\S]*?)\}/g)].map((m) => m[1]);
}

function prop(face, name) {
  return new RegExp(`${name}:\\s*([^;]+);`).exec(face)?.[1].trim();
}

const jobs = [];

for (const family of FAMILIES) {
  const css = await fetchCss(family.css);

  for (const face of splitFaces(css)) {
    const src = prop(face, "src");
    const url = /url\((https:[^)]+\.woff2)\)/.exec(src ?? "")?.[1];

    if (!url) continue;

    const range = prop(face, "unicode-range") ?? "";
    // Chỉ giữ latin / latin-ext / vietnamese — bỏ cyrillic, greek... cho nhẹ.
    const wanted =
      !range.includes("U+") ||
      range.includes("U+1EA0") ||
      range.includes("U+0000") ||
      range.includes("U+0102");

    if (!wanted) continue;

    const isVietnamese = range.includes("U+1EA0");
    const hash = createHash("sha1").update(url).digest("hex").slice(0, 6);
    const file = `${family.slug}-${isVietnamese ? "vietnamese" : "latin"}-${hash}.woff2`;

    jobs.push({ family, face, range, url, file });
  }
}

await mkdir(OUT_DIR, { recursive: true });

const rules = [];
let downloaded = 0;
let failed = 0;

for (const job of jobs) {
  try {
    const response = await fetch(job.url, { headers: { "User-Agent": UA } });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const buffer = Buffer.from(await response.arrayBuffer());

    await writeFile(path.join(OUT_DIR, job.file), buffer);
    downloaded += 1;
  } catch (error) {
    failed += 1;
    console.error(`✗ ${job.url} → ${error.message}`);
    continue;
  }

  const style = prop(job.face, "font-style") ?? "normal";
  const weight = prop(job.face, "font-weight") ?? "400";

  rules.push(
    [
      "@font-face {",
      `  font-family: "${job.family.slug === "baloo2" ? "Baloo 2" : "Nunito"}";`,
      `  font-style: ${style};`,
      `  font-weight: ${weight};`,
      "  font-display: swap;",
      `  src: url("/assets/ui/fonts/${job.file}") format("woff2");`,
      job.range ? `  unicode-range: ${job.range};` : undefined,
      "}",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

const header = `/*
 * SINH TỰ ĐỘNG bởi scripts/fetch-ui-fonts.mjs — đừng sửa tay.
 *
 * Baloo 2 (tiêu đề) + Nunito (nội dung), cả hai đều có subset tiếng Việt:
 * "Baloo 2" phủ vietnamese + latin, nên dấu tiếng Việt không rơi về font hệ
 * thống giữa câu. Giấy phép OFL 1.1.
 *
 * Tải lại: node scripts/fetch-ui-fonts.mjs
 */
`;

await writeFile(OUT_CSS, `${header}\n${rules.join("\n\n")}\n`);

console.log(
  `Đã tải ${downloaded} file woff2 (lỗi ${failed}) → ${OUT_DIR}, sinh ${OUT_CSS}`,
);
