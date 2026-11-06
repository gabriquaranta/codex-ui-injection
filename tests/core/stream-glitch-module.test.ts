import { afterEach, describe, expect, it, vi } from "vitest";
import type { ModuleContext } from "../../src/core/contracts.js";
import { streamGlitchModule } from "../../src/modules/stream-glitch/index.js";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("stream glitch module", () => {
  it("animates the latest response block after text changes", async () => {
    vi.useFakeTimers();
    const highlights = new Map<string, unknown>();
    vi.stubGlobal("CSS", { highlights });
    vi.stubGlobal("Highlight", class { add() {} delete() {} });
    vi.spyOn(Range.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 8, 16));
    const root = document.createElement("div");
    const paragraph = document.createElement("p");
    paragraph.textContent = "First";
    root.append(paragraph);
    const animate = vi.fn();
    animate.mockReturnValue({ cancel: vi.fn() } as unknown as Animation);
    vi.spyOn(HTMLElement.prototype, "animate").mockImplementation(animate);
    let handleResponse: ((response: HTMLElement) => void | (() => void)) | undefined;
    const context: ModuleContext = {
      document,
      registerPanel: vi.fn(),
      registerPopover: vi.fn(),
      registerResponseRootHandler: (handler) => { handleResponse = handler; },
      setChatBackground: vi.fn(),
      setWorkspaceBackground: vi.fn(),
    };
    const cleanupModule = streamGlitchModule.activate(context);
    const cleanupResponse = handleResponse?.(root);

    paragraph.firstChild!.textContent = "Updated,";
    await vi.advanceTimersByTimeAsync(70);

    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ duration: expect.any(Number), easing: "steps(2, end)" }));
    expect(highlights.has("codex-ui-glitch-word")).toBe(true);
    expect(document.querySelector("span[data-codex-ui-stream-glitch]")).not.toBeNull();
    document.dispatchEvent(new Event("scroll"));
    expect(document.querySelector("span[data-codex-ui-stream-glitch]")).toBeNull();
    paragraph.firstChild!.textContent += " Another,";
    await vi.advanceTimersByTimeAsync(0);
    expect(document.querySelector("span[data-codex-ui-stream-glitch]")).not.toBeNull();
    cleanupResponse?.();
    expect(document.querySelector("span[data-codex-ui-stream-glitch]")).toBeNull();
    cleanupModule?.();
  });
});
