import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config/index.js";

describe("config loader", () => {
  it("returns defaults when no env is provided", () => {
    const config = loadConfig();
    expect(config.sshProfiles).toEqual({});
    expect(config.training.defaultTimeoutMs).toBeGreaterThan(0);
  });
});
