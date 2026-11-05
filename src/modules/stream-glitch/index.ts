import type { Cleanup, ModuleContext } from "../../core/contracts.js";
import { UiStreamAnimation } from "../../core/stream-animation.js";
import type { StreamWord } from "../../core/stream-words.js";

const styleText = `
  ::highlight(codex-ui-glitch-word) { color: transparent !important; text-shadow: none !important; }
`;
const glitchGlyphs = ["░", "▒", "▓", "·", ":", "."];
const highlightName = "codex-ui-glitch-word";

class StreamGlitchModule extends UiStreamAnimation {
  private highlight!: Highlight;

  constructor() { super("stream-glitch"); }

  override activate(context: ModuleContext): Cleanup | void {
    if (!CSS.highlights || typeof Highlight === "undefined") return;
    this.highlight = new Highlight();
    CSS.highlights.set(highlightName, this.highlight);
    const style = context.document.createElement("style");
    style.dataset.codexUiStreamGlitch = "";
    style.textContent = styleText;
    context.document.head.append(style);
    const stopAnimation = super.activate(context);
    return () => {
      stopAnimation?.();
      CSS.highlights.delete(highlightName);
      style.remove();
    };
  }

  override animate(words: readonly StreamWord[], finished: () => void, context: ModuleContext): Cleanup | void {
    const cleanups: Array<() => void> = [];
    const prepared = words.filter(({ word }) => word.length >= 4).map(({ range, word }) => {
      const rect = range.getBoundingClientRect();
      const wordStyle = context.document.defaultView!.getComputedStyle(range.startContainer.parentElement!);
      return { range, word, rect, font: wordStyle.font, color: wordStyle.color };
    });
    for (const { range, word, rect, font, color } of prepared) {
      const glyph = context.document.createElement("span");
      glyph.dataset.codexUiStreamGlitch = "";
      glyph.setAttribute("aria-hidden", "true");
      const dither = () => Array.from(word, () => glitchGlyphs[Math.floor(Math.random() * glitchGlyphs.length)]).join("");
      glyph.textContent = dither();
      glyph.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;pointer-events:none;z-index:999999;white-space:pre;color:${color};font:${font}`;
      context.document.body.append(glyph);
      this.highlight.add(range);
      const animation = glyph.animate([
        { transform: "translate(-1px, 0)", opacity: 0.65 },
        { transform: "translate(1px, 0)", opacity: 0.85 },
        { transform: "translate(0, 0)", opacity: 1 },
      ], { duration: 420 + Math.random() * 220, easing: "steps(2, end)" });
      const ditherTimer = context.document.defaultView!.setTimeout(() => { glyph.textContent = dither(); }, 90);
      const restoreTimer = context.document.defaultView!.setTimeout(() => { glyph.textContent = word; }, 180);
      const cleanup = () => {
        context.document.defaultView?.clearTimeout(ditherTimer);
        context.document.defaultView?.clearTimeout(restoreTimer);
        animation.cancel();
        this.highlight.delete(range);
        glyph.remove();
      };
      cleanups.push(cleanup);
    }
    if (!cleanups.length) return;
    const cleanup = () => {
      context.document.defaultView?.clearTimeout(cleanupTimer);
      for (const clear of cleanups) clear();
    };
    const cleanupTimer = context.document.defaultView!.setTimeout(() => {
      cleanup();
      finished();
    }, 650);
    return cleanup;
  }
}

export const streamGlitchModule = new StreamGlitchModule();
