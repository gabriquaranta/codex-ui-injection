export type Cleanup = () => void;

export interface UiModule {
  readonly id: string;
  readonly toolbarLabel: string;
  readonly drawerTitle: string;
  readonly createIcon: (document: Document) => SVGSVGElement;
  readonly styles?: string;
  readonly mount: (root: ShadowRoot) => void | Cleanup;
}
