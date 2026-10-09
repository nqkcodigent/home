import type { BeatOfType, StoryData, StoryBeat, StoryBeatType } from "./types";

type DispatchableBeat = Extract<
  StoryBeat,
  { type: Exclude<StoryBeatType, "dialog" | "pause"> }
>;

export interface StoryClock {
  delay(ms: number): Promise<void>;
}

export interface StoryEmitter {
  emit(event: string, payload?: unknown): void;
  on(event: string, listener: (payload?: unknown) => void): void;
  off(event: string, listener: (payload?: unknown) => void): void;
}

export type StageHandlers = {
  [T in Exclude<StoryBeatType, "dialog" | "pause">]?: (
    beat: BeatOfType<T>,
  ) => void | Promise<void>;
};

export interface StoryStage {
  name: string;
  handlers: StageHandlers;
}

export interface StoryLine {
  id?: string;
  speaker?: string;
  text: string;
  emotion?: string;
  portrait?: string;
}

interface StoryDirectorDeps {
  scripts: StoryData;
  clock: StoryClock;
  emitter: StoryEmitter;
}

export class StoryDirector {
  private readonly deps: StoryDirectorDeps;

  private stage: StoryStage | undefined;

  private queue: Promise<void> = Promise.resolve();

  constructor(deps: StoryDirectorDeps) {
    this.deps = deps;
  }

  attachStage(stage: StoryStage) {
    this.stage = stage;
  }

  play(scriptName: string): Promise<void> {
    const script = this.deps.scripts[scriptName];

    if (!script) {
      return Promise.reject(
        new Error(`Story: unknown script "${scriptName}"`),
      );
    }

    return this.enqueue(async () => {
      for (const beat of script.scenes) {
        await this.run(beat);
      }
    });
  }

  say(line: StoryLine): Promise<void> {
    return this.enqueue(() =>
      this.run({
        type: "dialog",
        id: line.id,
        speaker: line.speaker,
        text: line.text,
        emotion: line.emotion,
        portrait: line.portrait,
      }),
    );
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const result = this.queue.then(task, task);

    this.queue = result.catch(() => undefined);

    return result;
  }

  private async run(beat: StoryBeat): Promise<void> {
    switch (beat.type) {
      case "dialog":
        return this.dialog(beat);

      case "pause":
        return this.deps.clock.delay(beat.duration);

      default:
        return this.dispatch(beat);
    }
  }

  private dialog(beat: BeatOfType<"dialog">): Promise<void> {
    return new Promise<void>((resolve) => {
      const handleNext = () => {
        this.deps.emitter.off("dialogNext", handleNext);

        resolve();
      };

      this.deps.emitter.on("dialogNext", handleNext);

      this.deps.emitter.emit("dialog", {
        id: beat.id,
        speaker: beat.speaker,
        text: beat.text,
        emotion: beat.emotion,
        portrait: beat.portrait,
      });
    });
  }

  private async dispatch(beat: DispatchableBeat): Promise<void> {
    const stage = this.stage;

    if (!stage) {
      throw new Error(`Story: no stage attached for beat "${beat.type}"`);
    }

    const missing = () =>
      new Error(`Story: stage "${stage.name}" has no handler for beat "${beat.type}"`);

    const { handlers } = stage;

    switch (beat.type) {
      case "walk":
        if (!handlers.walk) throw missing();
        return handlers.walk(beat);

      case "pan":
        if (!handlers.pan) throw missing();
        return handlers.pan(beat);

      case "zoom":
        if (!handlers.zoom) throw missing();
        return handlers.zoom(beat);

      case "reveal":
        if (!handlers.reveal) throw missing();
        return handlers.reveal(beat);

      case "audio":
        if (!handlers.audio) throw missing();
        return handlers.audio(beat);

      case "controls":
        if (!handlers.controls) throw missing();
        return handlers.controls(beat);

      case "transition":
        if (!handlers.transition) throw missing();
        return handlers.transition(beat);

      default: {
        const unreachable: never = beat;

        throw new Error(`Story: director cannot run beat ${JSON.stringify(unreachable)}`);
      }
    }
  }
}
