import { expect } from "vitest";

export function expectFileExists(result: string[], fileName: string): void {
  expect(result).toContain(fileName);
}

export function expectContains(text: string, substring: string): void {
  expect(text).toContain(substring);
}

export function expectJsonParsable(text: string): unknown {
  const parsed = JSON.parse(text);
  expect(parsed).toBeDefined();
  return parsed;
}
