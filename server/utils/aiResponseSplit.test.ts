import { describe, it, expect } from "vitest";
import { splitAiResponse } from "./aiResponseSplit";

describe("splitAiResponse", () => {
  it("splits by double newline only", () => {
    const text = "Hello\n\nWorld";
    expect(splitAiResponse(text)).toEqual(["Hello", "World"]);
  });

  it("does NOT split URLs containing slashes", () => {
    const text = "Check this out: https://example.com/path/to/page";
    expect(splitAiResponse(text)).toEqual([text]);
  });

  it("does NOT split dates with slashes", () => {
    const text = "Today is 2024/01/15";
    expect(splitAiResponse(text)).toEqual([text]);
  });

  it("does NOT split backslash-separated content incorrectly", () => {
    const text = "Option A\\Option B";
    expect(splitAiResponse(text)).toEqual([text]);
  });

  it("trims and filters empty parts", () => {
    const text = "  First  \n\n  \n\n  Second  ";
    expect(splitAiResponse(text)).toEqual(["First", "Second"]);
  });

  it("returns single part for no paragraph breaks", () => {
    const text = "One line response";
    expect(splitAiResponse(text)).toEqual(["One line response"]);
  });

  it("returns empty array for empty or whitespace-only input", () => {
    expect(splitAiResponse("")).toEqual([]);
    expect(splitAiResponse("   \n\n   ")).toEqual([]);
  });
});
