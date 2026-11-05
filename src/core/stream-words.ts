import type { Cleanup } from "./contracts.js";

export interface StreamWord {
  readonly word: string;
  readonly range: Range;
}

/** Observe newly rendered words without modifying the response DOM. */
export function observeStreamWords(root: HTMLElement, onWords: (words: StreamWord[]) => void): Cleanup {
  let snapshot = root.textContent ?? "";
  let pending = "";
  let pendingStart = snapshot.length;
  let idleTimer: number | undefined;

  const processPending = (includeTrailingWord: boolean) => {
    const trailingWord = /[\p{L}\p{N}]+$/u.exec(pending);
    const processLength = trailingWord && !includeTrailingWord ? trailingWord.index : pending.length;
    const ready = pending.slice(0, processLength);
    const matches = Array.from(ready.matchAll(/[\p{L}\p{N}]+/gu), (match) => ({
      start: pendingStart + match.index, word: match[0],
    }));
    const words: StreamWord[] = [];
    const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let index = 0;
    while (index < matches.length && walker.nextNode()) {
      const node = walker.currentNode as Text;
      const end = offset + node.length;
      while (index < matches.length && matches[index].start < end) {
        const { start, word } = matches[index++];
        if (start < offset || start + word.length > end
          || node.parentElement?.closest("code, pre, button, [aria-hidden='true']")) continue;
        const range = root.ownerDocument.createRange();
        range.setStart(node, start - offset);
        range.setEnd(node, start - offset + word.length);
        words.push({ range, word });
      }
      offset = end;
    }
    if (words.length) onWords(words);
    pending = pending.slice(processLength);
    pendingStart += processLength;
  };

  const observer = new MutationObserver(() => {
    const current = root.textContent ?? "";
    let commonPrefix = current.startsWith(snapshot) ? snapshot.length : 0;
    if (commonPrefix === 0) {
      while (commonPrefix < snapshot.length && commonPrefix < current.length
        && snapshot[commonPrefix] === current[commonPrefix]) commonPrefix++;
    }
    if (commonPrefix < snapshot.length) {
      pending = current.slice(commonPrefix);
      pendingStart = commonPrefix;
    } else {
      if (!pending) pendingStart = snapshot.length;
      pending += current.slice(snapshot.length);
    }
    snapshot = current;
    processPending(false);
    if (idleTimer !== undefined) root.ownerDocument.defaultView?.clearTimeout(idleTimer);
    idleTimer = root.ownerDocument.defaultView?.setTimeout(() => {
      processPending(true);
      idleTimer = undefined;
    }, 180);
  });
  observer.observe(root, { childList: true, characterData: true, subtree: true });
  return () => {
    observer.disconnect();
    if (idleTimer !== undefined) root.ownerDocument.defaultView?.clearTimeout(idleTimer);
  };
}
