import type { Cleanup, ModuleContext, UiModule } from "./contracts.js";
import { observeStreamWords, type StreamWord } from "./stream-words.js";

/** Base module for effects applied to newly rendered response words. */
export class UiStreamAnimation implements UiModule {
  constructor(readonly id: string) {}

  /** Start an effect and call finished after releasing its resources. */
  animate(_words: readonly StreamWord[], _finished: () => void, _context: ModuleContext): Cleanup | void {}

  activate(context: ModuleContext): Cleanup | void {
    const roots = new Set<Cleanup>();
    const effects = new Set<Cleanup>();
    const clearEffects = () => { for (const cleanup of effects) cleanup(); };
    context.document.addEventListener("scroll", clearEffects, true);
    context.registerResponseRootHandler((root) => {
      const rootEffects = new Set<Cleanup>();
      const stop = observeStreamWords(root, (words) => {
        let cleanupEffect: Cleanup | void;
        let complete = false;
        const finished = () => {
          complete = true;
          if (cleanupEffect) {
            effects.delete(cleanupEffect);
            rootEffects.delete(cleanupEffect);
          }
        };
        const cancel = this.animate(words, finished, context);
        if (!cancel || complete) return;
        cleanupEffect = () => {
          if (complete) return;
          finished();
          cancel();
        };
        effects.add(cleanupEffect);
        rootEffects.add(cleanupEffect);
      });
      const cleanup = () => {
        stop();
        for (const effect of rootEffects) effect();
        roots.delete(cleanup);
      };
      roots.add(cleanup);
      return cleanup;
    });
    return () => {
      for (const cleanup of roots) cleanup();
      context.document.removeEventListener("scroll", clearEffects, true);
      clearEffects();
    };
}
}
