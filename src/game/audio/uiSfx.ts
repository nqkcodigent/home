/**
 * Âm thanh giao diện (gõ chữ, xác nhận, chime ký ức).
 *
 * Dùng HTMLAudio thay vì hệ thống sound của Phaser vì đây là âm thanh của
 * lớp UI (dialog, HUD) — không thuộc bối cảnh scene nào, và cần độ trễ thấp.
 * World ambience (chim, làng, dế) vẫn đi qua AudioManager của Phaser.
 */
const SOURCES = {
  type: [
    "/assets/audio/sfx/ui-type-1.wav",
    "/assets/audio/sfx/ui-type-2.wav",
    "/assets/audio/sfx/ui-type-3.wav",
  ],

  confirm: ["/assets/audio/sfx/ui-confirm.mp3"],

  chime: ["/assets/audio/sfx/ui-chime.mp3"],
} as const;

export type SfxKey = keyof typeof SOURCES;

const VOLUMES: Record<SfxKey, number> = {
  type: 0.16,

  confirm: 0.28,

  chime: 0.4,
};

const pools = new Map<string, { nodes: HTMLAudioElement[]; next: number }>();

function pool(src: string) {
  let entry = pools.get(src);

  if (!entry) {
    entry = { nodes: [], next: 0 };

    pools.set(src, entry);
  }

  return entry;
}

/** Phát một sfx UI; an toàn khi browser còn chặn autoplay (lặng, không lỗi) */
export function playSfx(key: SfxKey) {
  const sources = SOURCES[key];

  const entry = pool(sources[0]);

  if (entry.nodes.length < sources.length) {
    const src = sources[entry.nodes.length];

    const node = new Audio(src);

    node.preload = "auto";

    entry.nodes.push(node);
  }

  const node = entry.nodes[entry.next % entry.nodes.length];

  entry.next += 1;

  node.volume = VOLUMES[key];

  node.currentTime = 0;

  const played = node.play();

  if (played && typeof played.catch === "function") {
    void played.catch(() => undefined);
  }
}
