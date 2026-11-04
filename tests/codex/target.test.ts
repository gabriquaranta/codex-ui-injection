import { describe, expect, it } from "vitest";
import { isMainCodexTarget, type CodexTarget } from "../../src/codex/target.js";

function target(url: string, type = "page"): CodexTarget {
  return { id: "target", type, title: "Codex", url, webSocketDebuggerUrl: "ws://127.0.0.1:9335/devtools/page/target" };
}

describe("isMainCodexTarget", () => {
  it("selects the app shell and excludes auxiliary routes", () => {
    expect(isMainCodexTarget(target("app://-/index.html"))).toBe(true);
    expect(isMainCodexTarget(target("app://-/index.html?initialRoute=%2Fspotlight"))).toBe(false);
    expect(isMainCodexTarget(target("app://-/detached-window.html"))).toBe(false);
    expect(isMainCodexTarget(target("https://example.test/"))).toBe(false);
    expect(isMainCodexTarget(target("app://-/index.html", "worker"))).toBe(false);
  });
});
