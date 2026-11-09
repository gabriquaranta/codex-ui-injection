import type { UiModule, UiPopover } from "../../core/contracts.js";
import type { MusicAction, MusicRequest, MusicResponse, MusicState } from "../../music/protocol.js";

let requestSequence = 0;

function createIcon(document: Document): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  const note = document.createElementNS(svg.namespaceURI, "path");
  note.setAttribute("d", "M10 18V5l10-2v13M10 9l10-2");
  note.setAttribute("stroke", "currentColor");
  note.setAttribute("stroke-width", "1.7");
  note.setAttribute("stroke-linecap", "round");
  note.setAttribute("stroke-linejoin", "round");
  const first = document.createElementNS(svg.namespaceURI, "ellipse");
  first.setAttribute("cx", "7");
  first.setAttribute("cy", "18");
  first.setAttribute("rx", "3");
  first.setAttribute("ry", "2");
  first.setAttribute("fill", "currentColor");
  const second = document.createElementNS(svg.namespaceURI, "ellipse");
  second.setAttribute("cx", "17");
  second.setAttribute("cy", "16");
  second.setAttribute("rx", "3");
  second.setAttribute("ry", "2");
  second.setAttribute("fill", "currentColor");
  svg.append(note, first, second);
  return svg;
}

function createControlIcon(document: Document, kind: "previous" | "play" | "pause" | "next"): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svg.namespaceURI, "path");
  const shapes: Record<typeof kind, string> = {
    previous: "M6 5h2v14H6zM19 5v14L9 12z",
    play: "M7 4v16l13-8z",
    pause: "M6 5h4v14H6zM14 5h4v14h-4z",
    next: "M16 5h2v14h-2zM5 5v14l10-7z",
  };
  path.setAttribute("d", shapes[kind]);
  svg.append(path);
  return svg;
}

const appleMusicPopover: UiPopover = {
  id: "apple-music",
  toolbarLabel: "Apple Music",
  createIcon,
  styles: `
    :host { display: block; box-sizing: border-box; width: min(300px, var(--codex-ui-popover-width, 300px)); height: min(300px, var(--codex-ui-popover-width, 300px)); overflow: hidden; border: 0 !important; border-radius: 12px !important; background: transparent !important; }
    .music-card { box-sizing: border-box; position: relative; width: 100%; height: 100%; overflow: hidden; border-radius: 12px; background: #202020; isolation: isolate; }
    .music-card::after { content: ""; position: absolute; z-index: 1; inset: 30% 0 0; opacity: 0; pointer-events: none; background: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, .18) 28%, rgba(0, 0, 0, .78) 100%); transition: opacity 140ms ease; }
    .music-card:hover::after, .music-card:focus-within::after { opacity: 1; }
    .artwork { position: absolute; z-index: 0; inset: 0; overflow: hidden; background: #202020; }
    .artwork img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .artwork img[hidden] { display: none; }
    .artwork-placeholder { position: absolute; inset: 0; display: grid; place-items: center; color: rgba(255, 255, 255, .9); }
    .artwork-placeholder svg { width: 42px; height: 42px; }
    .artwork.has-image .artwork-placeholder { display: none; }
    .track { position: absolute; z-index: 2; right: 112px; bottom: 18px; left: 18px; min-width: 0; line-height: 1.25; color: #fff; opacity: 0; pointer-events: none; text-shadow: 0 1px 6px rgba(0, 0, 0, .72); transition: opacity 140ms ease; }
    .title, .artist { overflow: hidden; color: inherit; text-overflow: ellipsis; white-space: nowrap; }
    .title { font-size: 14px; font-weight: 650; }
    .artist { color: rgba(255, 255, 255, .88); font-size: 12px; }
    .controls { position: absolute; z-index: 2; right: 12px; bottom: 14px; display: flex; align-items: center; gap: 4px; color: #fff; opacity: 0; pointer-events: none; transition: opacity 140ms ease; }
    .music-card:hover .track, .music-card:focus-within .track, .music-card:hover .controls, .music-card:focus-within .controls { opacity: 1; }
    .music-card:hover .controls, .music-card:focus-within .controls { pointer-events: auto; }
    .control { width: 28px; height: 28px; padding: 0; display: grid; place-items: center; border: 0; border-radius: 50%; color: inherit; background: transparent; filter: drop-shadow(0 1px 3px rgba(0, 0, 0, .7)); cursor: pointer; }
    .control:hover:not(:disabled) { background: rgba(255, 255, 255, .18); }
    .control:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    .control:disabled { opacity: .42; cursor: default; }
    .control svg { width: 16px; height: 16px; }
    .control-primary { width: 32px; height: 32px; background: #fff; color: #161616; filter: none; }
    .control-primary svg { width: 17px; height: 17px; }
    .status { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
  `,
  mount(root) {
    root.host.classList.remove("extension:border", "extension:border-default", "bg-surface-elevated-secondary");
    const document = root.ownerDocument;
    const card = document.createElement("section");
    card.className = "music-card";
    card.setAttribute("aria-label", "Apple Music player");

    const artwork = document.createElement("div");
    artwork.className = "artwork";
    let image = document.createElement("img");
    image.alt = "";
    image.hidden = true;
    const placeholder = document.createElement("div");
    placeholder.className = "artwork-placeholder";
    placeholder.append(createIcon(document));
    artwork.append(image, placeholder);

    const track = document.createElement("div");
    track.className = "track";
    const title = document.createElement("div");
    title.className = "title";
    title.textContent = "Apple Music";
    const artist = document.createElement("div");
    artist.className = "artist";
    artist.textContent = "Connects to Music on this Mac";
    track.append(title, artist);

    const controls = document.createElement("div");
    controls.className = "controls";
    const previous = document.createElement("button");
    previous.className = "control";
    previous.type = "button";
    previous.setAttribute("aria-label", "Previous track");
    previous.title = "Previous track";
    previous.append(createControlIcon(document, "previous"));
    const toggle = document.createElement("button");
    toggle.className = "control control-primary";
    toggle.type = "button";
    toggle.setAttribute("aria-label", "Play");
    toggle.title = "Play";
    const next = document.createElement("button");
    next.className = "control";
    next.type = "button";
    next.setAttribute("aria-label", "Next track");
    next.title = "Next track";
    next.append(createControlIcon(document, "next"));
    controls.append(previous, toggle, next);

    const status = document.createElement("div");
    status.className = "status";
    status.setAttribute("aria-live", "polite");
    card.append(artwork, track, controls, status);
    root.append(card);

    const pending = new Map<string, { resolve: (response: MusicResponse) => void; timer: number }>();
    const view = document.defaultView;
    if (!view) throw new Error("Apple Music popover requires a browser window.");
    let currentState: MusicState | null = null;
    let artworkRequestTrackId: string | null = null;
    let stateRequestActive = false;
    let commandActive = false;
    let disposed = false;

    const sendRequest = (action: MusicAction, trackId?: string): Promise<MusicResponse> => new Promise((resolve, reject) => {
      const bridge = view.__codexMusicBridge;
      if (!bridge) {
        reject(new Error("Music bridge is starting."));
        return;
      }
      const requestId = `${Date.now()}-${++requestSequence}`;
      const request: MusicRequest = trackId === undefined ? { requestId, action } : { requestId, action, trackId };
      const timer = view.setTimeout(() => {
        pending.delete(requestId);
        reject(new Error("Music did not respond."));
      }, 6_000);
      pending.set(requestId, { resolve, timer });
      try {
        bridge(JSON.stringify(request));
      } catch (error) {
        view.clearTimeout(timer);
        pending.delete(requestId);
        reject(error);
      }
    });

    const onResponse = (event: Event): void => {
      const response = (event as CustomEvent<MusicResponse>).detail;
      if (!response || typeof response.requestId !== "string") return;
      const request = pending.get(response.requestId);
      if (!request) return;
      view.clearTimeout(request.timer);
      pending.delete(response.requestId);
      request.resolve(response);
    };

    const setControls = (): void => {
      const hasTrack = currentState?.track !== null && currentState?.track !== undefined;
      previous.disabled = !hasTrack || commandActive;
      next.disabled = !hasTrack || commandActive;
      toggle.disabled = !hasTrack || commandActive;
      const playing = currentState?.playback === "playing";
      toggle.setAttribute("aria-label", playing ? "Pause" : "Play");
      toggle.title = playing ? "Pause" : "Play";
      toggle.replaceChildren(createControlIcon(document, playing ? "pause" : "play"));
    };

    const setState = (state: MusicState): void => {
      currentState = state;
      const nextTrackId = state.track?.id ?? null;
      if (nextTrackId !== artworkRequestTrackId) {
        artworkRequestTrackId = nextTrackId;
        if (nextTrackId) {
          void sendRequest("artwork", nextTrackId).then((response) => {
            if (disposed || response.trackId !== artworkRequestTrackId || !response.artworkDataUrl) return;
            const nextImage = new view.Image();
            nextImage.onload = () => {
              if (disposed || response.trackId !== artworkRequestTrackId) return;
              image.replaceWith(nextImage);
              image = nextImage;
              artwork.classList.add("has-image");
            };
            nextImage.src = response.artworkDataUrl;
          }).catch(() => undefined);
        }
      }
      title.textContent = state.track?.title || "Apple Music";
      artist.textContent = state.track?.artist || "Play something in Music";
      status.textContent = state.playback === "playing" ? "Playing" : state.playback === "paused" ? "Paused" : "Not playing";
      setControls();
    };

    const readState = (): void => {
      if (stateRequestActive || disposed) return;
      stateRequestActive = true;
      void sendRequest("state").then((response) => {
        if (response.ok && response.state) setState(response.state);
        else status.textContent = response.error || "Music is unavailable";
      }).catch(() => {
        if (!view.__codexMusicBridge) status.textContent = "Waiting for Music bridge";
        else status.textContent = "Music is not responding";
      }).finally(() => {
        stateRequestActive = false;
      });
    };

    const command = (action: "play" | "pause" | "next" | "previous"): void => {
      if (commandActive || disposed) return;
      commandActive = true;
      setControls();
      void sendRequest(action).then((response) => {
        if (response.ok && response.state) setState(response.state);
        else status.textContent = response.error || "Music is unavailable";
      }).catch(() => {
        status.textContent = "Music is not responding";
      }).finally(() => {
        commandActive = false;
        setControls();
      });
    };

    const onToggle = (): void => command(currentState?.playback === "playing" ? "pause" : "play");
    const onPrevious = (): void => command("previous");
    const onNext = (): void => command("next");
    view.addEventListener("codex-music-response", onResponse);
    toggle.addEventListener("click", onToggle);
    previous.addEventListener("click", onPrevious);
    next.addEventListener("click", onNext);
    setControls();
    readState();
    const interval = view.setInterval(readState, 1_500);

    return () => {
      disposed = true;
      view.clearInterval(interval);
      view.removeEventListener("codex-music-response", onResponse);
      toggle.removeEventListener("click", onToggle);
      previous.removeEventListener("click", onPrevious);
      next.removeEventListener("click", onNext);
      for (const request of pending.values()) view.clearTimeout(request.timer);
      pending.clear();
    };
  },
};

export const appleMusicModule: UiModule = {
  id: appleMusicPopover.id,
  activate(context) {
    context.registerPopover(appleMusicPopover);
  },
};
