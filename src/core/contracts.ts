export type Cleanup = () => void;

export interface ModuleContext {
  readonly document: Document;
  readonly registerPanel: (panel: UiPanel) => void;
  readonly setChatBackground: (image: Blob | null, opacity: number) => void;
}

export interface UiModule {
  readonly id: string;
  readonly activate: (context: ModuleContext) => void | Cleanup;
}

export interface UiPanel {
  readonly id: string;
  readonly toolbarLabel: string;
  readonly drawerTitle: string;
  readonly createIcon: (document: Document) => SVGSVGElement;
  readonly styles?: string;
  readonly mount: (root: ShadowRoot) => void | Cleanup;
}
