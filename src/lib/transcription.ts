export type TranscriptionSegment = {
  start: number;
  end: number;
  text: string;
  confidence?: number;
};

export type TranscriptionPassDiagnostics = {
  transcriptWordCount: number;
  fillerCount: number;
  speechSecondsKept?: number;
};

export type SttDiagnostics = {
  vadUsed: boolean;
  retryWithoutVad: boolean;
  chosenPass: "vad" | "no_vad";
  timestampsMode?: "none" | "segments" | "words";
  promptStrategy?: "verbatim_disfluencies" | "default";
  audioDurationSeconds?: number;
  speechSecondsKept?: number;
  fallbackReasons?: string[];
  passA?: TranscriptionPassDiagnostics;
  passB?: TranscriptionPassDiagnostics;
};

export type TranscriptionResponse = {
  text: string;
  language?: string;
  durationSeconds?: number;
  duration?: number;
  segments?: TranscriptionSegment[];
  confidence?: number;
  sttDiagnostics?: SttDiagnostics;
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

function parsePassDiagnostics(raw: unknown): TranscriptionPassDiagnostics | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const payload = raw as Record<string, unknown>;
  const transcriptWordCount = toNumber(payload.transcriptWordCount);
  const fillerCount = toNumber(payload.fillerCount);
  if (transcriptWordCount == null || fillerCount == null) return undefined;

  return {
    transcriptWordCount: Math.max(0, Math.floor(transcriptWordCount)),
    fillerCount: Math.max(0, Math.floor(fillerCount)),
    speechSecondsKept: toNumber(payload.speechSecondsKept),
  };
}

function parseSttDiagnostics(raw: unknown): SttDiagnostics | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const payload = raw as Record<string, unknown>;

  const vadUsed = payload.vadUsed;
  const retryWithoutVad = payload.retryWithoutVad;
  const chosenPass = payload.chosenPass;

  if (
    typeof vadUsed !== "boolean" ||
    typeof retryWithoutVad !== "boolean" ||
    (chosenPass !== "vad" && chosenPass !== "no_vad")
  ) {
    return undefined;
  }

  const timestampsMode = payload.timestampsMode;
  const promptStrategy = payload.promptStrategy;
  const fallbackReasons = Array.isArray(payload.fallbackReasons)
    ? payload.fallbackReasons.filter((reason): reason is string => typeof reason === "string")
    : undefined;

  return {
    vadUsed,
    retryWithoutVad,
    chosenPass,
    timestampsMode:
      timestampsMode === "none" || timestampsMode === "segments" || timestampsMode === "words"
        ? timestampsMode
        : undefined,
    promptStrategy:
      promptStrategy === "verbatim_disfluencies" || promptStrategy === "default"
        ? promptStrategy
        : undefined,
    audioDurationSeconds: toNumber(payload.audioDurationSeconds),
    speechSecondsKept: toNumber(payload.speechSecondsKept),
    fallbackReasons: fallbackReasons && fallbackReasons.length > 0 ? fallbackReasons : undefined,
    passA: parsePassDiagnostics(payload.passA),
    passB: parsePassDiagnostics(payload.passB),
  };
}

export function parseTranscriptionResponse(raw: unknown): TranscriptionResponse {
  if (!raw || typeof raw !== "object") {
    return { text: "" };
  }

  const payload = raw as Record<string, unknown>;
  const durationSeconds =
    toNumber(payload.durationSeconds) ??
    toNumber(payload.duration) ??
    (() => {
      const durationMs = toNumber(payload.durationMs);
      return durationMs != null ? durationMs / 1000 : undefined;
    })();

  return {
    text: typeof payload.text === "string" ? payload.text.trim() : "",
    language: typeof payload.language === "string" ? payload.language : undefined,
    durationSeconds,
    // Keep legacy `duration` for backward compatibility with existing UI code.
    duration: durationSeconds,
    segments: parseSegments(payload.segments),
    confidence: toNumber(payload.confidence),
    sttDiagnostics: parseSttDiagnostics(payload.sttDiagnostics),
  };
}
