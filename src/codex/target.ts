export interface CodexTarget {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly url: string;
  readonly webSocketDebuggerUrl: string;
}

export function isMainCodexTarget(target: CodexTarget): boolean {
  if (target.type !== "page") return false;
  try {
    const url = new URL(target.url);
    return url.protocol === "app:" && url.pathname === "/index.html" && !url.searchParams.has("initialRoute");
  } catch {
    return false;
  }
}
