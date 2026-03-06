import { describe, expect, it } from "vitest";

import { parseVideoId } from "@/lib/clipStore";

describe("parseVideoId", () => {
  it("parses a standard youtube watch url", () => {
    expect(parseVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("parses a short youtu.be url", () => {
    expect(parseVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("parses an embed url", () => {
    expect(parseVideoId("https://www.youtube.com/embed/dQw4w9WgXcQ?start=35")).toBe(
      "dQw4w9WgXcQ",
    );
  });

  it("accepts a direct video id", () => {
    expect(parseVideoId("dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
  });

  it("returns null for invalid values", () => {
    expect(parseVideoId("https://example.com/video")).toBeNull();
    expect(parseVideoId("not-an-id")).toBeNull();
  });
});
