import { describe, it, expect, vi, beforeEach } from "vitest";
import { CLIError } from "../../src/core/errors.js";

// Mock child_process before importing the module under test
const { mockSpawnSync, mockExecSync } = vi.hoisted(() => ({
  mockSpawnSync: vi.fn(),
  mockExecSync: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  spawnSync: mockSpawnSync,
  execSync: mockExecSync,
}));

import { legacyHostToSelection } from "../../src/cli/init-hosts.js";
import {
  checkPythonVersion,
  checkGraphifyInstalled,
  runGraphifyInstall,
} from "../../src/commands/init.js";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkPythonVersion", () => {
  it("returns ok=true for Python 3.10", () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "Python 3.10.0\n", stderr: "", error: undefined });
    const result = checkPythonVersion();
    expect(result.ok).toBe(true);
    expect(result.version).toBe("3.10");
  });

  it("returns ok=true for Python 3.11", () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "Python 3.11.2\n", stderr: "", error: undefined });
    expect(checkPythonVersion().ok).toBe(true);
  });

  it("returns ok=false for Python 3.9", () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "Python 3.9.7\n", stderr: "", error: undefined });
    const result = checkPythonVersion();
    expect(result.ok).toBe(false);
    expect(result.version).toBe("3.9");
  });

  it("returns ok=false when python3 is not found", () => {
    mockSpawnSync.mockReturnValue({ status: 1, stdout: "", stderr: "", error: new Error("not found") });
    expect(checkPythonVersion().ok).toBe(false);
  });
});

describe("checkGraphifyInstalled", () => {
  it("returns true when graphify --version exits 0", () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "graphify 1.2.0\n", stderr: "", error: undefined });
    expect(checkGraphifyInstalled()).toBe(true);
  });

  it("returns false when graphify --version exits non-zero", () => {
    mockSpawnSync.mockReturnValue({ status: 127, stdout: "", stderr: "", error: undefined });
    expect(checkGraphifyInstalled()).toBe(false);
  });

  it("returns false when graphify command throws", () => {
    mockSpawnSync.mockReturnValue({ status: 1, error: new Error("ENOENT") });
    expect(checkGraphifyInstalled()).toBe(false);
  });
});

describe("runGraphifyInstall", () => {
  const mockLog = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
    colors: { bold: (s: string) => s },
  } as any;

  it("throws CLIError when Python version is too old", async () => {
    mockSpawnSync.mockReturnValue({ status: 0, stdout: "Python 3.9.0\n", stderr: "", error: undefined });
    await expect(runGraphifyInstall(legacyHostToSelection("claude-code"), mockLog, false)).rejects.toThrow(CLIError);
  });

  it("throws CLIError when Python is not found", async () => {
    mockSpawnSync.mockReturnValue({ status: 1, stdout: "", stderr: "", error: new Error("not found") });
    await expect(runGraphifyInstall(legacyHostToSelection("claude-code"), mockLog, false)).rejects.toThrow(CLIError);
  });

  it("skips pip install when graphify is already installed", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: "Python 3.11.0\n", stderr: "", error: undefined }) // python check
      .mockReturnValueOnce({ status: 0, stdout: "graphify 1.0\n", stderr: "", error: undefined }); // graphify check
    await runGraphifyInstall(legacyHostToSelection("claude-code"), mockLog, false);
    expect(mockExecSync).not.toHaveBeenCalled();
  });

  it("runs pip install when graphify is not installed", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: "Python 3.11.0\n", stderr: "", error: undefined }) // python check
      .mockReturnValueOnce({ status: 1, error: new Error("not found") }); // graphify not found
    await runGraphifyInstall(legacyHostToSelection("claude-code"), mockLog, false);
    expect(mockExecSync).toHaveBeenCalledWith(
      "pip install graphifyy && graphify install",
      expect.any(Object),
    );
  });

  it("runs graphify opencode install for opencode host", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: "Python 3.11.0\n", stderr: "", error: undefined })
      .mockReturnValueOnce({ status: 0, stdout: "graphify 1.0\n", stderr: "", error: undefined }); // already installed
    await runGraphifyInstall(legacyHostToSelection("opencode"), mockLog, false);
    expect(mockExecSync).toHaveBeenCalledWith(
      "graphify opencode install",
      expect.any(Object),
    );
  });

  it("runs graphify opencode install for all host", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: "Python 3.11.0\n", stderr: "", error: undefined })
      .mockReturnValueOnce({ status: 0, stdout: "graphify 1.0\n", stderr: "", error: undefined });
    await runGraphifyInstall(legacyHostToSelection("all"), mockLog, false);
    expect(mockExecSync).toHaveBeenCalledWith(
      "graphify opencode install",
      expect.any(Object),
    );
  });

  it("does not run graphify opencode install for claude-code host", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: "Python 3.11.0\n", stderr: "", error: undefined })
      .mockReturnValueOnce({ status: 0, stdout: "graphify 1.0\n", stderr: "", error: undefined });
    await runGraphifyInstall(legacyHostToSelection("claude-code"), mockLog, false);
    expect(mockExecSync).not.toHaveBeenCalledWith(
      "graphify opencode install",
      expect.any(Object),
    );
  });

  it("throws CLIError when pip install fails", async () => {
    mockSpawnSync
      .mockReturnValueOnce({ status: 0, stdout: "Python 3.11.0\n", stderr: "", error: undefined })
      .mockReturnValueOnce({ status: 1, error: new Error("not found") });
    mockExecSync.mockImplementation(() => { throw new Error("pip failed"); });
    await expect(runGraphifyInstall(legacyHostToSelection("claude-code"), mockLog, false)).rejects.toThrow(CLIError);
  });
});
