import { describe, it, expect } from "vitest";
import {
  renderManagedCompressionBlock,
  replaceManagedCompressionBlock,
} from "../../src/cavebus/compress.js";

describe("renderManagedCompressionBlock", () => {
  it("wraps content with BEGIN/END markers", () => {
    const result = renderManagedCompressionBlock({
      source: "all",
      mode: "full",
      generatedAt: "2025-01-01T00:00:00Z",
      content: "REQ F001 status:draft\ngoal:\n- test",
    });
    expect(result).toContain("# LH-COMPRESS-BEGIN");
    expect(result).toContain("source:all");
    expect(result).toContain("mode:full");
    expect(result).toContain("# LH-COMPRESS-END");
    expect(result).toContain("REQ F001 status:draft");
  });

  it("includes the generated timestamp", () => {
    const result = renderManagedCompressionBlock({
      source: "discovery",
      mode: "lite",
      generatedAt: "2025-06-15T12:00:00Z",
      content: "DISC F001 conf:med",
    });
    expect(result).toContain("generated:2025-06-15T12:00:00Z");
  });
});

describe("replaceManagedCompressionBlock", () => {
  it("replaces existing block for same source", () => {
    const existing = [
      "# LH-COMPRESS-BEGIN source:all mode:full generated:2025-01-01",
      "REQ F001 status:draft",
      "goal:",
      "- old content",
      "# LH-COMPRESS-END",
    ].join("\n");

    const newBlock = renderManagedCompressionBlock({
      source: "all",
      mode: "full",
      generatedAt: "2025-02-01T00:00:00Z",
      content: "REQ F001 status:done\ngoal:\n- new content",
    });

    const result = replaceManagedCompressionBlock(existing, "all", newBlock);
    expect(result).toContain("new content");
    expect(result).not.toContain("old content");
  });

  it("appends block if no existing block for that source", () => {
    const existing = "Some manual content here";
    const newBlock = renderManagedCompressionBlock({
      source: "discovery",
      mode: "full",
      generatedAt: "2025-01-01T00:00:00Z",
      content: "DISC F001 conf:med",
    });

    const result = replaceManagedCompressionBlock(existing, "discovery", newBlock);
    expect(result).toContain("Some manual content here");
    expect(result).toContain("# LH-COMPRESS-BEGIN");
    expect(result).toContain("DISC F001 conf:med");
  });
});
