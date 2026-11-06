import { afterEach, expect, it, vi } from "vitest";
import type { ModuleContext } from "../../src/core/contracts.js";
import { UiStreamAnimation } from "../../src/core/stream-animation.js";
import type { StreamWord } from "../../src/core/stream-words.js";

afterEach(() => vi.useRealTimers());

it("runs an inherited effect and cancels it when its response closes", async () => {
  vi.useFakeTimers();
  const cancel = vi.fn();
  class Example extends UiStreamAnimation {
    constructor() { super("example"); }
    override animate(words: readonly StreamWord[]) {
      expect(words.map(({ word }) => word)).toEqual(["hello"]);
      return cancel;
    }
  }
  let attach: ((root: HTMLElement) => void | (() => void)) | undefined;
  const context: ModuleContext = {
    document, registerPanel: vi.fn(), registerPopover: vi.fn(),
    registerResponseRootHandler: (handler) => { attach = handler; },
    setChatBackground: vi.fn(),
    setWorkspaceBackground: vi.fn(),
  };
  const root = document.createElement("div");
  const text = document.createTextNode("");
  root.append(text);
  const dispose = new Example().activate(context);
  const detach = attach?.(root);
  text.data = "hello ";
  await vi.advanceTimersByTimeAsync(0);
  detach?.();
  expect(cancel).toHaveBeenCalledOnce();
  dispose?.();
  expect(cancel).toHaveBeenCalledOnce();
  expect(new UiStreamAnimation("empty").animate([], () => {}, context)).toBeUndefined();
});
