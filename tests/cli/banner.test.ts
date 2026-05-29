import { describe, it, expect, afterEach } from "vitest";
import {
  renderBanner,
  shouldShowHelpHeader,
  shouldUseBannerColors,
} from "../../src/cli/banner.js";
import { getVersion } from "../../src/core/version.js";

describe("banner", () => {
  const env = { ...process.env };

  afterEach(() => {
    process.env = { ...env };
  });

  it("renderBanner includes product name, version, and workflow", () => {
    const banner = renderBanner({ color: false });
    expect(banner).toContain("LeanHarness");
    expect(banner).toContain(`v${getVersion()}`);
    expect(banner).toContain("Specify → Discover → Build → Check");
  });

  it("shouldShowHelpHeader is false in CI and when json", () => {
    process.env.CI = "true";
    expect(shouldShowHelpHeader()).toBe(false);
    delete process.env.CI;
    expect(shouldShowHelpHeader({ json: true })).toBe(false);
    expect(shouldShowHelpHeader()).toBe(true);
  });

  it("shouldUseBannerColors respects NO_COLOR", () => {
    process.env.NO_COLOR = "1";
    expect(shouldUseBannerColors()).toBe(false);
    delete process.env.NO_COLOR;
  });
});
