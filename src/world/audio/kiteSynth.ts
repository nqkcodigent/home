import { Howler } from "howler";

/**
 * Tiếng gió và tiếng sáo diều, tổng hợp bằng Web Audio — không cần file.
 *
 * Gió là nhiễu trắng qua bộ lọc thông dải; sáo là hai sóng sine cách nhau một
 * quãng năm (sáo diều kêu "ù" kép), có rung nhẹ. Cả hai to/cao dần theo độ cao
 * và sức gió. Nối vào `Howler.masterGain` nên phím tắt tiếng vẫn tắt được nó.
 */

export interface KiteSoundInput {
  altitude: number;
  /** 0…1 */
  wind: number;
  /** 0…1+ */
  tension: number;
}

export interface KiteSoundParams {
  windGain: number;
  windFreq: number;
  fluteGain: number;
  fluteFreq: number;
}

/** Ánh xạ trạng thái diều sang tham số âm thanh — thuần, test được. */
export function kiteSoundParams({ altitude, wind, tension }: KiteSoundInput): KiteSoundParams {
  const height = clamp(altitude / 60, 0, 1);

  return {
    windGain: 0.04 + clamp(wind, 0, 1) * 0.12 + height * 0.06,
    windFreq: 400 + clamp(wind, 0, 1) * 500 + height * 600,
    // Sáo chỉ kêu khi diều đã lên khỏi ngọn tre — dưới thấp gió chưa lùa vào.
    fluteGain: clamp((height - 0.05) * 4, 0, 1) * (0.015 + clamp(wind, 0, 1) * 0.04),
    fluteFreq: 300 + height * 240 + clamp(tension, 0, 1) * 40,
  };
}

/** Thời hằng trượt tham số (giây) — đủ chậm để không lách tách. */
const GLIDE = 0.25;

export class KiteSynth {
  private readonly nodes: AudioNode[] = [];

  private readonly sources: AudioScheduledSourceNode[] = [];

  private windGain: GainNode | undefined;

  private windFilter: BiquadFilterNode | undefined;

  private fluteGain: GainNode | undefined;

  private flutes: OscillatorNode[] = [];

  private context: AudioContext | undefined;

  /** Không có AudioContext (jsdom, trình duyệt chặn) thì im lặng, không lỗi. */
  start() {
    const context = Howler.ctx as AudioContext | undefined;

    if (!context || this.context) return;

    this.context = context;

    const output: AudioNode = Howler.masterGain ?? context.destination;

    // ── Gió ──
    const noise = context.createBufferSource();
    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);

    for (let index = 0; index < data.length; index += 1) data[index] = Math.random() * 2 - 1;

    noise.buffer = buffer;
    noise.loop = true;

    this.windFilter = context.createBiquadFilter();
    this.windFilter.type = "bandpass";
    this.windFilter.Q.value = 0.8;

    this.windGain = context.createGain();
    this.windGain.gain.value = 0;

    noise.connect(this.windFilter).connect(this.windGain).connect(output);

    // ── Sáo ──
    this.fluteGain = context.createGain();
    this.fluteGain.gain.value = 0;
    this.fluteGain.connect(output);

    const vibrato = context.createOscillator();
    const vibratoDepth = context.createGain();

    vibrato.frequency.value = 5;
    vibratoDepth.gain.value = 4;
    vibrato.connect(vibratoDepth);

    this.flutes = [1, 1.5].map((ratio) => {
      const flute = context.createOscillator();

      flute.type = "sine";
      flute.frequency.value = 300 * ratio;
      vibratoDepth.connect(flute.frequency);
      flute.connect(this.fluteGain as GainNode);

      return flute;
    });

    this.sources.push(noise, vibrato, ...this.flutes);
    this.nodes.push(this.windFilter, this.windGain, this.fluteGain, vibratoDepth);

    for (const source of this.sources) source.start();
  }

  update(input: KiteSoundInput) {
    const context = this.context;

    if (!context || !this.windGain || !this.windFilter || !this.fluteGain) return;

    const params = kiteSoundParams(input);
    const now = context.currentTime;

    this.windGain.gain.setTargetAtTime(params.windGain, now, GLIDE);
    this.windFilter.frequency.setTargetAtTime(params.windFreq, now, GLIDE);
    this.fluteGain.gain.setTargetAtTime(params.fluteGain, now, GLIDE);

    this.flutes.forEach((flute, index) => {
      flute.frequency.setTargetAtTime(params.fluteFreq * (index === 0 ? 1 : 1.5), now, GLIDE);
    });
  }

  /** Tắt nhanh rồi tháo nút. Gọi được nhiều lần. */
  stop() {
    const context = this.context;

    if (!context) return;

    this.context = undefined;

    const now = context.currentTime;

    this.windGain?.gain.setTargetAtTime(0, now, 0.08);
    this.fluteGain?.gain.setTargetAtTime(0, now, 0.08);

    for (const source of this.sources) source.stop(now + 0.5);

    const sources = this.sources.splice(0);
    const nodes = this.nodes.splice(0);

    sources[0].onended = () => {
      for (const node of [...sources, ...nodes]) node.disconnect();
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
