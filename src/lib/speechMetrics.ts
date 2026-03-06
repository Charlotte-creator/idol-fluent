import type { TranscriptionSegment } from "@/lib/transcription";

const ALWAYS_FILLERS = ["um", "uh", "you know", "basically", "actually", "literally"] as const;
const CONTEXTUAL_FILLERS = new Set(["like", "so", "right"]);
const HESITATION_SOUNDS = ["hmm", "hm", "ah", "er", "oh", "mm", "uh huh"] as const;

type Token = {
  kind: "word" | "punct";
  value: string;
};

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tokenize(text: string): Token[] {
  const tokens = text.toLowerCase().match(/[a-z]+(?:'[a-z]+)?|[.,!?;:]/g) ?? [];
  return tokens.map((value): Token => ({
    value,
    kind: /[.,!?;:]/.test(value) ? "punct" as const : "word" as const,
  }));
}

export function detectElongations(text: string): { count: number; details: Record<string, number> } {
  const details: Record<string, number> = {};
  let count = 0;

  const normalizedText = text.toLowerCase();
  const repeatedWordRegex = /\b(\w+)(\s+\1){1,}\b/gi;
  let match: RegExpExecArray | null;

  while ((match = repeatedWordRegex.exec(normalizedText)) !== null) {
    const label = match[0].toLowerCase();
    details[label] = (details[label] || 0) + 1;
    count++;
  }

  for (const sound of HESITATION_SOUNDS) {
    const regex = new RegExp(`\\b${escapeRegex(sound)}\\b`, "gi");
    const matches = normalizedText.match(regex);
    if (!matches) continue;
    details[sound] = (details[sound] || 0) + matches.length;
    count += matches.length;
  }

  const charRepeatRegex = /\b\w*([a-z])\1{2,}\w*\b/gi;
  while ((match = charRepeatRegex.exec(normalizedText)) !== null) {
    const word = match[0].toLowerCase();
    if (HESITATION_SOUNDS.includes(word as (typeof HESITATION_SOUNDS)[number])) continue;
    details[word] = (details[word] || 0) + 1;
    count++;
  }

  return { count, details };
}

export function countFillerWords(text: string): { count: number; details: Record<string, number> } {
  const normalizedText = text.toLowerCase();
  const details: Record<string, number> = {};
  let count = 0;

  for (const filler of ALWAYS_FILLERS) {
    const regex = new RegExp(`\\b${escapeRegex(filler)}\\b`, "gi");
    const matches = normalizedText.match(regex);
    if (!matches) continue;
    details[filler] = (details[filler] || 0) + matches.length;
    count += matches.length;
  }

  const tokens = tokenize(normalizedText);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind !== "word" || !CONTEXTUAL_FILLERS.has(token.value)) continue;

    const prevToken = i > 0 ? tokens[i - 1] : null;
    const nextToken = i < tokens.length - 1 ? tokens[i + 1] : null;
    const atStart = i === 0;

    const prevIsPunctuation = prevToken?.kind === "punct";
    const prevIsHesitation =
      prevToken?.kind === "word" &&
      HESITATION_SOUNDS.includes(prevToken.value as (typeof HESITATION_SOUNDS)[number]);
    const nextIsPunctuation = nextToken?.kind === "punct";

    const isDiscourseMarker = atStart
      ? nextIsPunctuation
      : prevIsPunctuation || prevIsHesitation || nextIsPunctuation;

    if (!isDiscourseMarker) continue;

    details[token.value] = (details[token.value] || 0) + 1;
    count++;
  }

  return { count, details };
}

export interface TranscriptMetrics {
  totalWords: number;
  wordsPerMinute: number;
  fillerWordCount: number;
  fillerWordsPerMinute: number;
  fillerDetails: Record<string, number>;
  expressionsUsed: string[];
  pauseRatio: number;
  vocabularyRichness: number;
  elongationCount: number;
  elongationDetails: Record<string, number>;
}

export type AnalysisResult = TranscriptMetrics & {
  transcript: string;
};

type PauseInput = {
  silenceGapsMs?: number[];
  segments?: TranscriptionSegment[];
};

function calculateSilenceFromSegments(
  durationSeconds: number,
  segments: TranscriptionSegment[] | undefined,
): number | null {
  if (!segments || segments.length === 0 || durationSeconds <= 0) return null;

  const MIN_PAUSE_SECONDS = 0.2;
  const ordered = segments
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end >= segment.start)
    .sort((a, b) => a.start - b.start);

  if (ordered.length === 0) return null;

  let totalSilenceMs = 0;
  let previousEnd = 0;

  for (const segment of ordered) {
    const gapSeconds = Math.max(0, segment.start - previousEnd);
    if (gapSeconds >= MIN_PAUSE_SECONDS) {
      totalSilenceMs += gapSeconds * 1000;
    }
    previousEnd = Math.max(previousEnd, segment.end);
  }

  const trailingGapSeconds = Math.max(0, durationSeconds - previousEnd);
  if (trailingGapSeconds >= MIN_PAUSE_SECONDS) {
    totalSilenceMs += trailingGapSeconds * 1000;
  }

  return totalSilenceMs;
}

export function computeTranscriptMetrics(
  transcript: string,
  durationSeconds: number,
  expressions: string[] = [],
  pauseInput: PauseInput = {},
): TranscriptMetrics {
  const normalized = transcript.trim().toLowerCase();
  const words = normalized.split(/\s+/).filter(Boolean);
  const totalWords = words.length;
  const durationMin = durationSeconds / 60;
  const wordsPerMinute = durationMin > 0 ? Math.round(totalWords / durationMin) : 0;

  const fillers = countFillerWords(normalized);
  const fillerWordsPerMinute =
    durationMin > 0 ? Math.round((fillers.count / durationMin) * 10) / 10 : 0;

  const expressionsUsed = expressions.filter((expr) =>
    normalized.includes(expr.toLowerCase()),
  );

  const silenceFromSegments = calculateSilenceFromSegments(durationSeconds, pauseInput.segments);
  const totalSilence =
    silenceFromSegments ?? (pauseInput.silenceGapsMs || []).reduce((sum, gap) => sum + gap, 0);
  const pauseRatio =
    durationSeconds > 0 ? Math.round((totalSilence / 1000 / durationSeconds) * 100) / 100 : 0;

  const uniqueWords = new Set(words);
  const vocabularyRichness =
    totalWords > 0 ? Math.round((uniqueWords.size / totalWords) * 100) / 100 : 0;

  const elongations = detectElongations(normalized);

  return {
    totalWords,
    wordsPerMinute,
    fillerWordCount: fillers.count,
    fillerWordsPerMinute,
    fillerDetails: fillers.details,
    expressionsUsed,
    pauseRatio,
    vocabularyRichness,
    elongationCount: elongations.count,
    elongationDetails: elongations.details,
  };
}
