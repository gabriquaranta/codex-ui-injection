import type { UiModule } from "../../core/contracts.js";

function createPanelIcon(document: Document): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  const frame = document.createElementNS(svg.namespaceURI, "rect");
  frame.setAttribute("x", "3.5");
  frame.setAttribute("y", "4");
  frame.setAttribute("width", "17");
  frame.setAttribute("height", "16");
  frame.setAttribute("rx", "3");
  frame.setAttribute("stroke", "currentColor");
  frame.setAttribute("stroke-width", "1.6");
  const divider = document.createElementNS(svg.namespaceURI, "path");
  divider.setAttribute("d", "M15 4.5v15M7.5 8h4M7.5 12h4M7.5 16h4");
  divider.setAttribute("stroke", "currentColor");
  divider.setAttribute("stroke-width", "1.4");
  divider.setAttribute("stroke-linecap", "round");
  svg.append(frame, divider);
  return svg;
}

export const emptyPanelModule: UiModule = {
  id: "empty-panel",
  toolbarLabel: "Empty panel",
  drawerTitle: "Side panel",
  createIcon: createPanelIcon,
  styles: `
    p { display: grid; min-height: 180px; place-items: center; margin: 0; color: var(--color-text-secondary, inherit); }
  `,
  mount(root) {
    const message = root.ownerDocument.createElement("p");
    message.textContent = "Your panel is empty.";
    root.append(message);
  },
};
