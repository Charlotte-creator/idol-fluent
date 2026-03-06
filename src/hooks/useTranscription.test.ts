import { describe, expect, it } from "vitest";

import { normalizeLanguageHint } from "@/hooks/useTranscription";

describe("normalizeLanguageHint", () => {
  it("normalizes locale tags to whisper base language codes", () => {
    expect(normalizeLanguageHint("en-US")).toBe("en");
    expect(normalizeLanguageHint("fr_CA")).toBe("fr");
    expect(normalizeLanguageHint("ZH-cn")).toBe("zh");
  });

  it("returns lowercase codes and handles empty input", () => {
    expect(normalizeLanguageHint("EN")).toBe("en");
    expect(normalizeLanguageHint("   ")).toBe("");
  });
});
