import { describe, expect, it } from "vitest";
import { resolveColour } from "./resolveColour";

describe("resolveColour", () => {
  it("passes plain colours straight through", () => {
    expect(resolveColour("#123456")).toBe("#123456");
  });

  it("resolves a var() through the browser and cleans up its probe", () => {
    document.documentElement.style.setProperty("--test-colour", "rgb(1, 2, 3)");
    const before = document.documentElement.childElementCount;

    const resolved = resolveColour("var(--test-colour)");

    expect(resolved).not.toBe("");
    expect(document.documentElement.childElementCount).toBe(before);
  });
});
