export type TranscriptionSegment = {
  start: number;
  end: number;
  text: string;
  confidence?: number;
};

export type TranscriptionResponse = {
  text: string;
  language?: string;
  duration?: number;
  segments?: TranscriptionSegment[];
  confidence?: number;
};

function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseSegments(raw: unknown): TranscriptionSegment[] | undefined {
  if (!Array.isArray(raw)) return undefined;

  const parsed = raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const segment = item as Record<string, unknown>;
      const start = toNumber(segment.start);
      const end = toNumber(segment.end);
      const text = typeof segment.text === "string" ? segment.text.trim() : "";
      if (start == null || end == null || !text || end < start) return null;
      return {
        start,
        end,
        text,
        confidence: toNumber(segment.confidence),
      };
    })
    .filter((segment): segment is NonNullable<typeof segment> => segment !== null)
    .sort((a, b) => a.start - b.start);

  return parsed.length > 0 ? parsed : undefined;
}

export function parseTranscriptionResponse(raw: unknown): TranscriptionResponse {
  if (!raw || typeof raw !== "object") {
    return { text: "" };
  }

  const payload = raw as Record<string, unknown>;
  return {
    text: typeof payload.text === "string" ? payload.text.trim() : "",
    language: typeof payload.language === "string" ? payload.language : undefined,
    duration: toNumber(payload.duration),
    segments: parseSegments(payload.segments),
    confidence: toNumber(payload.confidence),
  };
}
