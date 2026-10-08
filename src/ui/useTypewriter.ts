import { useCallback, useEffect, useRef, useState } from "react";

import { Typewriter } from "./typewriter";

import type { TypewriterOptions } from "./typewriter";

interface UseTypewriterResult {
  visible: string;

  isComplete: boolean;

  isFastForwarding: boolean;

  fastForward: () => void;
}

interface UseTypewriterOptions extends TypewriterOptions {
  /** Gọi mỗi khi số ký tự đã hiện thay đổi (để phát tiếng gõ) */
  onReveal?: (index: number) => void;
}

interface MachineState {
  text: string;

  index: number;

  fast: boolean;
}

export function useTypewriter(
  text: string,
  options: UseTypewriterOptions = {},
): UseTypewriterResult {
  const [state, setState] = useState<MachineState>({
    text,

    index: 0,

    fast: false,
  });

  const machineRef = useRef<Typewriter | undefined>(undefined);

  const revealRef = useRef(options.onReveal);

  const { charsPerSecond, fastForwardMultiplier, punctuationPauseMs } = options;

  // câu thoại mới → máy gõ mới (reset trong lúc render, pattern của React)
  if (state.text !== text) {
    setState({ text, index: 0, fast: false });
  }

  useEffect(() => {
    revealRef.current = options.onReveal;
  });

  useEffect(() => {
    const machine = new Typewriter(text, {
      charsPerSecond,
      fastForwardMultiplier,
      punctuationPauseMs,
    });

    machineRef.current = machine;

    if (machine.isComplete) {
      return undefined;
    }

    let frame = 0;

    let last = 0;

    let previous = performance.now();

    const tick = (now: number) => {
      const dt = now - previous;

      previous = now;

      const next = machine.advance(dt);

      if (next !== last) {
        last = next;

        setState((current) =>
          current.text === text && current.index !== next
            ? { ...current, index: next }
            : current,
        );

        revealRef.current?.(next);
      }

      if (!machine.isComplete) {
        frame = requestAnimationFrame(tick);
      }
    };

    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [text, charsPerSecond, fastForwardMultiplier, punctuationPauseMs]);

  const fastForward = useCallback(() => {
    machineRef.current?.fastForward();

    setState((current) => ({ ...current, fast: true }));
  }, []);

  return {
    visible: text.slice(0, state.index),

    isComplete: state.index >= text.length,

    isFastForwarding: state.fast,

    fastForward,
  };
}
