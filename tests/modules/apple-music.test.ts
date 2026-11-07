import { describe, expect, it } from "vitest";
import type { UiPopover } from "../../src/core/contracts.js";
import { appleMusicModule } from "../../src/modules/apple-music/index.js";
import type { MusicRequest, MusicResponse, MusicState } from "../../src/music/protocol.js";

describe("Apple Music artwork", () => {
  it("keeps the current image until new artwork loads and retains it when none arrives", async () => {
    const view = document.defaultView!;
    const previousImageDescriptor = Object.getOwnPropertyDescriptor(view, "Image");
    const previousBridge = view.__codexMusicBridge;
    const requests: MusicRequest[] = [];
    let loadedImageCount = 0;
    Object.defineProperty(view, "Image", {
      configurable: true,
      value: function () {
        const image = document.createElement("img");
        loadedImageCount += 1;
        let source = "";
        Object.defineProperty(image, "src", {
          configurable: true,
          get: () => source,
          set: (value: string) => {
            source = value;
            image.setAttribute("src", value);
            queueMicrotask(() => image.dispatchEvent(new view.Event("load")));
          },
        });
        return image;
      },
    });
    view.__codexMusicBridge = (payload) => {
      const request = JSON.parse(payload) as MusicRequest;
      if (request.action === "artwork" && request.trackId === "4") throw new Error("Artwork request failed.");
      requests.push(request);
    };

    let popover: UiPopover | undefined;
    appleMusicModule.activate({
      document,
      registerPopover: (value) => { popover = value; },
      registerPanel: () => {},
      registerResponseRootHandler: () => {},
      setChatBackground: () => {},
      setWorkspaceBackground: () => {},
    });
    const root = document.createElement("div").attachShadow({ mode: "open" });
    const cleanup = popover!.mount(root);
    const artwork = root.querySelector<HTMLElement>(".artwork")!;

    const settle = async (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));
    const respond = (request: MusicRequest, response: Omit<MusicResponse, "requestId">): void => {
      view.dispatchEvent(new view.CustomEvent("codex-music-response", {
        detail: { requestId: request.requestId, ...response },
      }));
    };
    const latest = (action: MusicRequest["action"], trackId?: string): MusicRequest => {
      const request = requests.filter((item) => item.action === action && item.trackId === trackId).at(-1);
      if (!request) throw new Error(`Missing ${action} request.`);
      return request;
    };
    const state = (id: string): MusicState => ({
      playback: "paused",
      track: { id, title: `Track ${id}`, artist: "Test artist", album: "Test album" },
    });
    const advanceTo = async (id: string): Promise<void> => {
      root.querySelector<HTMLButtonElement>('[aria-label="Next track"]')!.click();
      respond(latest("next"), { ok: true, state: state(id) });
      await settle();
    };

    try {
      respond(latest("state"), { ok: true, state: state("1") });
      await settle();
      const firstArtworkRequest = latest("artwork", "1");
      respond(firstArtworkRequest, { ok: true, trackId: "1", artworkDataUrl: "data:image/png;base64,QQ==" });
      await settle();
      expect(artwork.classList.contains("has-image")).toBe(true);
      expect(loadedImageCount).toBe(1);

      await advanceTo("2");
      expect(artwork.classList.contains("has-image")).toBe(true);
      expect(loadedImageCount).toBe(1);
      respond(latest("artwork", "2"), { ok: true, trackId: "2", artworkDataUrl: "data:image/png;base64,Qg==" });
      await settle();
      expect(artwork.classList.contains("has-image")).toBe(true);
      expect(loadedImageCount).toBe(2);

      await advanceTo("3");
      expect(artwork.classList.contains("has-image")).toBe(true);
      expect(loadedImageCount).toBe(2);
      respond(latest("artwork", "3"), { ok: true, trackId: "3", artworkDataUrl: null });
      await settle();
      expect(artwork.classList.contains("has-image")).toBe(true);
      expect(loadedImageCount).toBe(2);

      await advanceTo("4");
      expect(artwork.classList.contains("has-image")).toBe(true);
      expect(loadedImageCount).toBe(2);
    } finally {
      cleanup?.();
      view.__codexMusicBridge = previousBridge;
      if (previousImageDescriptor) Object.defineProperty(view, "Image", previousImageDescriptor);
      else Reflect.deleteProperty(view, "Image");
    }
  });
});
