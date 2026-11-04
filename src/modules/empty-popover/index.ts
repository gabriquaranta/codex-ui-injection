import type { UiModule, UiPopover } from "../../core/contracts.js";

const emptyPopover: UiPopover = {
  id: "empty-popover",
  toolbarLabel: "Empty popover",
  createIcon(document) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    const frame = document.createElementNS(svg.namespaceURI, "rect");
    frame.setAttribute("x", "3.5");
    frame.setAttribute("y", "5");
    frame.setAttribute("width", "17");
    frame.setAttribute("height", "14");
    frame.setAttribute("rx", "4");
    frame.setAttribute("stroke", "currentColor");
    frame.setAttribute("stroke-width", "1.6");
    svg.append(frame);
    return svg;
  },
  styles: `p { margin: 0; padding: 24px; color: var(--color-text-secondary, inherit); }`,
  mount(root) {
    const message = root.ownerDocument.createElement("p");
    message.textContent = "Your popover is empty.";
    root.append(message);
  },
};

export const emptyPopoverModule: UiModule = {
  id: emptyPopover.id,
  activate(context) {
    context.registerPopover(emptyPopover);
  },
};
