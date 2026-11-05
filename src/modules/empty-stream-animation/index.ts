import { UiStreamAnimation } from "../../core/stream-animation.js";
import type { ModuleContext } from "../../core/contracts.js";
import type { StreamWord } from "../../core/stream-words.js";

class EmptyStreamAnimation extends UiStreamAnimation {
  constructor() { super("empty-stream-animation"); }

  override animate(_words: readonly StreamWord[], _finished: () => void, _context: ModuleContext): void {
    // Add an effect here; return a cleanup and call finished when it ends.
  }
}

export const emptyStreamAnimationModule = new EmptyStreamAnimation();
