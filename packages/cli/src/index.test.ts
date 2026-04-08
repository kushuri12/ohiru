import { describe, it, expect } from "vitest";
import { getProvider } from "./providers/index.js";
import { internalTools } from "./tools/index.js";

describe("ProviderRegistry", () => {
  it("should return anthropic provider", () => {
    const p = getProvider("anthropic");
    expect(p).toBeDefined();
    expect(p.id).toBe("anthropic");
  });

  it("should throw on unknown provider", () => {
    expect(() => getProvider("unknown")).toThrowError(/Unknown provider/);
  });
});

describe("Tools", () => {
  it("should register basic tools", () => {
    expect(internalTools.read_file).toBeDefined();
    expect(internalTools.write_file).toBeDefined();
    expect(internalTools.run_shell).toBeDefined();
  });
});
