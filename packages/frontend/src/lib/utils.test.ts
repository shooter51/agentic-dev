import { describe, it, expect } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("returns a single class name unchanged", () => {
    expect(cn("foo")).toBe("foo");
  });

  it("merges multiple class names", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });

  it("deduplicates conflicting tailwind classes (last wins)", () => {
    expect(cn("text-red-500", "text-blue-500")).toBe("text-blue-500");
  });

  it("handles conditional classes via objects", () => {
    expect(cn({ "font-bold": true, italic: false })).toBe("font-bold");
  });

  it("handles arrays of class names", () => {
    expect(cn(["foo", "bar"])).toBe("foo bar");
  });

  it("ignores falsy values", () => {
    expect(cn(undefined, null, false, "", "bar")).toBe("bar");
  });

  it("merges padding utilities correctly", () => {
    expect(cn("p-4", "px-2")).toBe("p-4 px-2");
  });

  it("returns empty string when no arguments", () => {
    expect(cn()).toBe("");
  });
});
