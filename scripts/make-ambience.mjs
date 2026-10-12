/**
 * Sinh các "bed" âm thanh nền của trò chơi thành file WAV.
 *
 * Vì sao không tải file có sẵn: bàn thả diều cần một lớp gió + sáo rất riêng,
 * và mọi file tải về đều kèm câu hỏi giấy phép. Ở đây không có file nào để
 * hỏi: tất cả đều được tính bằng công thức, chạy lại lúc nào cũng ra đúng file
 * đó, và không phụ thuộc mạng.
 *
 * Vòng lặp liền mạch: mọi bed được sinh dài hơn thân bài một đoạn, rồi đoạn
 * đuôi được trộn ngược vào đầu (cross-fade). Không có bước này thì mỗi lần
 * Howler lặp lại sẽ nghe thấy một cái "tạch" ở mép nối.
 *
 *   node scripts/make-ambience.mjs
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "public", "assets", "audio", "ambience");

/** Bộ sinh số giả ngẫu nhiên có hạt giống — chạy lại phải ra đúng file cũ. */
function random(seed) {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;

    return state / 0x100000000;
  };
}

const TAU = Math.PI * 2;

/** Nhiễu trắng đã lọc một cực; `k` càng nhỏ thì càng trầm. */
function lowpassNoise(length, k, seed) {
  const next = random(seed);
  const out = new Float32Array(length);
  let state = 0;

  for (let i = 0; i < length; i += 1) {
    state += ((next() * 2 - 1) - state) * k;
    out[i] = state;
  }

  return out;
}

/**
 * Gió đồng cỏ: nhiễu trầm thở theo hai nhịp chậm, cộng tiếng lá sột soạt
 * (phần nhiễu bị lọc bỏ) chỉ trồi lên khi có cơn giật.
 */
function kiteFly(t, wind, rustle) {
  const swell = 0.42 + 0.3 * Math.sin((TAU * t) / 13) + 0.2 * Math.sin((TAU * t) / 5.5 + 1);
  const gust = Math.max(0, 0.5 + 0.5 * Math.sin((TAU * t) / 17 + 2)) ** 2;

  return wind * Math.max(0.06, swell) * 1.6 + rustle * gust * 0.55;
}

/**
 * Sáo diều: hai sóng sine cách nhau một quãng năm, rung nhẹ, và chỉ "kêu" theo
 * từng đợt gió — con diều ở xa nên nó lúc nào cũng mờ, không bao giờ là một
 * tiếng nhạc cụ đứng giữa khung.
 */
function kiteWhistle(t) {
  const breath = Math.max(0, 0.5 + 0.5 * Math.sin((TAU * t) / 9 - 1)) ** 2;
  const vibrato = 0.6 * Math.sin(TAU * 4.6 * t);
  const drift = 6 * Math.sin((TAU * t) / 21);

  const base = 392 + drift + vibrato;

  return breath * 0.05 * (Math.sin(TAU * base * t) + 0.4 * Math.sin(TAU * base * 1.5 * t));
}

/** Tiếng ồn nền trong nhà: ù trầm của máy móc + hơi ấm của điện. */
function roomTone(t, hum) {
  return (
    hum * 5 +
    0.02 * Math.sin(TAU * 60 * t) +
    0.012 * Math.sin(TAU * 120 * t + 0.7) +
    0.006 * Math.sin(TAU * 179 * t + 2.1)
  );
}

/** Trộn đuôi vào đầu để vòng lặp liền mạch. */
function makeLoopable(samples, fadeSeconds, samplerate) {
  const fade = Math.round(fadeSeconds * samplerate);
  const length = samples.length - fade;
  const out = new Float32Array(length);

  for (let i = 0; i < length; i += 1) out[i] = samples[i];

  for (let i = 0; i < fade; i += 1) {
    const weight = i / fade;

    out[i] = samples[i] * weight + samples[length + i] * (1 - weight);
  }

  return out;
}

function encodeWav(samples, samplerate) {
  const buffer = Buffer.alloc(44 + samples.length * 2);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(samplerate, 24);
  buffer.writeUInt32LE(samplerate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * 2, 40);

  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));

    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }

  return buffer;
}

/** Đưa đỉnh về đúng mức, để bốn bed nghe to nhỏ tương đương nhau. */
function normalise(samples, peak) {
  let max = 0;

  for (const sample of samples) max = Math.max(max, Math.abs(sample));

  if (max === 0) return samples;

  const gain = peak / max;

  for (let i = 0; i < samples.length; i += 1) samples[i] *= gain;

  return samples;
}

const SAMPLERATE = 16000;

function buildKiteFly() {
  const seconds = 20;
  const fade = 1.5;
  const length = Math.round((seconds + fade) * SAMPLERATE);

  const wind = lowpassNoise(length, 0.055, 20261);
  const rustle = lowpassNoise(length, 0.42, 7321);
  const samples = new Float32Array(length);

  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLERATE;

    samples[i] = kiteFly(t, wind[i], rustle[i]) + kiteWhistle(t);
  }

  return normalise(makeLoopable(samples, fade, SAMPLERATE), 0.62);
}

function buildCandleShop() {
  const seconds = 14;
  const fade = 1.2;
  const length = Math.round((seconds + fade) * SAMPLERATE);

  const hum = lowpassNoise(length, 0.02, 9147);
  const samples = new Float32Array(length);
  const next = random(551);
  const sparks = [];

  // Vài tiếng lách tách rải rác — ngọn nến không kêu đều, và cũng không im.
  for (let i = 0; i < 26; i += 1) {
    sparks.push({ at: next() * seconds, level: 0.05 + next() * 0.05 });
  }

  for (let i = 0; i < length; i += 1) {
    const t = i / SAMPLERATE;
    let value = roomTone(t, hum[i]) * 0.5;

    for (const spark of sparks) {
      const age = t - spark.at;

      if (age > 0 && age < 0.18) {
        value += spark.level * Math.exp(-age * 42) * Math.sin(TAU * 900 * age);
      }
    }

    samples[i] = value;
  }

  return normalise(makeLoopable(samples, fade, SAMPLERATE), 0.4);
}

const BEDS = {
  "kite-fly.wav": buildKiteFly,
  "candle-shop.wav": buildCandleShop,
};

mkdirSync(OUT_DIR, { recursive: true });

for (const [name, build] of Object.entries(BEDS)) {
  const samples = build();
  const file = join(OUT_DIR, name);

  writeFileSync(file, encodeWav(samples, SAMPLERATE));

  const kb = Math.round((samples.length * 2 + 44) / 1024);

  console.log(`${name} — ${(samples.length / SAMPLERATE).toFixed(1)}s, ${kb} KB`);
}
