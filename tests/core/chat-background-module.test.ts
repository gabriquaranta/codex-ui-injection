import { afterEach, describe, expect, it, vi } from "vitest";
import { chatBackgroundModule } from "../../src/modules/chat-background/index.js";

afterEach(() => vi.unstubAllGlobals());

describe("chat background module", () => {
  it("ignores an image that loads after the module is disposed", async () => {
    const imageRequest = { result: new Blob(["image"]), onsuccess: () => {} };
    const transaction = { objectStore: () => ({ get: () => imageRequest }) };
    const openRequest = { result: { transaction: () => transaction }, onsuccess: () => {} };
    vi.stubGlobal("indexedDB", { open: () => openRequest });
    const setChatBackground = vi.fn();
    const cleanup = chatBackgroundModule.activate({ document, registerPanel: vi.fn(), registerPopover: vi.fn(), setChatBackground });

    openRequest.onsuccess();
    cleanup?.();
    imageRequest.onsuccess();
    await Promise.resolve();

    expect(setChatBackground).toHaveBeenCalledTimes(1);
    expect(setChatBackground).toHaveBeenCalledWith(null, 30);
  });
});
