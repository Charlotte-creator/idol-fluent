import type { TranscriptionSegment } from "@/lib/transcription";

const STRONG_FILLERS = [
  "um",
  "umm",
  "ummm",
  "uh",
  "uhh",
  "uhhh",
  "erm",
  "ah",
  "hmm",
  "hm",
  "er",
  "err",
  "eh",
  "ehm",
  "mm",
  "mhm",
  "mm-hmm",
  "uh-huh",
] as const;
const CONTEXTUAL_FILLERS = new Set([
  "like",
  "so",
  "well",
  "right",
  "okay",
  "actually",
  "basically",
  "literally",
]);
const MULTI_WORD_FILLERS = ["you know", "i mean", "kind of", "sort of"] as const;
const HESITATION_SOUNDS = ["hmm", "hm", "ah", "er", "oh", "mm", "uh huh"] as const;
const REPAIR_PHRASES = ["i mean", "sorry"] as const;
const CLAUSE_BOUNDARY_PUNCTUATION = new Set([",", ";", ":", "—", "-", "…", "..."]);
const COPULA_WORDS = new Set(["is", "am", "are", "was", "were", "be", "been", "being", "it's", "thats"]);

const DEFAULT_PAUSE_THRESHOLD_SECONDS = 0.6;
const DEFAULT_SHORT_PAUSE_SECONDS = 0.3;
const MIN_TIMESTAMPS_PAUSE_SECONDS = 0.2;

type Token = {
  kind: "word" | "punct";
  value: string;
};

type GapMetrics = {
  pauseMethod: "timestamps" | "text";
  allGapSeconds: number[];
  silentPauses: number[];
  choppyPauses: number[];
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

function countMatches(text: string, regex: RegExp): number {
  const matches = text.match(regex);
  return matches ? matches.length : 0;
}

function countNonOverlappingPhraseMatches(
  text: string,
  phrases: readonly string[],
): { count: number; details: Record<string, number> } {
  type Match = { start: number; end: number; phrase: string };
  const lower = text.toLowerCase();
  const candidates: Match[] = [];

  for (const phrase of phrases) {
    const regex = new RegExp(`\\b${escapeRegex(phrase)}\\b`, "gi");
    let match: RegExpExecArray | null;
    while ((match = regex.exec(lower)) !== null) {
      candidates.push({
        start: match.index,
        end: match.index + match[0].length,
        phrase,
      });
    }
  }

  candidates.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return (b.end - b.start) - (a.end - a.start);
  });

  const occupied = new Array<boolean>(lower.length).fill(false);
  const details: Record<string, number> = {};
  let count = 0;

  for (const candidate of candidates) {
    let overlaps = false;
    for (let i = candidate.start; i < candidate.end; i++) {
      if (occupied[i]) {
        overlaps = true;
        break;
      }
    }
    if (overlaps) continue;

    for (let i = candidate.start; i < candidate.end; i++) {
      occupied[i] = true;
    }
    details[candidate.phrase] = (details[candidate.phrase] || 0) + 1;
    count += 1;
  }

  return { count, details };
}

function percentile(values: number[], quantile: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(quantile * sorted.length) - 1));
  return sorted[index];
}

function normalizeSegments(segments: TranscriptionSegment[] | undefined): TranscriptionSegment[] {
  if (!segments || segments.length === 0) return [];
  return segments
    .filter((segment) => Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end >= segment.start)
    .sort((a, b) => a.start - b.start);
}

function collectGapsFromSegments(segments: TranscriptionSegment[]): number[] {
  if (segments.length < 2) return [];

  const gaps: number[] = [];
  for (let i = 1; i < segments.length; i++) {
    const gap = Math.round((segments[i].start - segments[i - 1].end) * 1000) / 1000;
    if (gap >= MIN_TIMESTAMPS_PAUSE_SECONDS) {
      gaps.push(gap);
    }
  }

  return gaps;
}

function deriveGapMetrics(
  pauseThresholdSeconds: number,
  shortPauseThresholdSeconds: number,
  pauseInput: PauseInput,
): GapMetrics {
  const normalizedSegments = normalizeSegments(pauseInput.segments);
  if (normalizedSegments.length >= 2) {
    const allGapSeconds = collectGapsFromSegments(normalizedSegments);
    const silentPauses = allGapSeconds.filter((gap) => gap >= pauseThresholdSeconds);
    const choppyPauses = allGapSeconds.filter(
      (gap) => gap >= shortPauseThresholdSeconds && gap < pauseThresholdSeconds,
    );
    return {
      pauseMethod: "timestamps",
      allGapSeconds,
      silentPauses,
      choppyPauses,
    };
  }

  const fallbackGaps = (pauseInput.silenceGapsMs || [])
    .map((gapMs) => gapMs / 1000)
    .filter((gap) => Number.isFinite(gap) && gap > 0);
  const silentPauses = fallbackGaps.filter((gap) => gap >= pauseThresholdSeconds);
  const choppyPauses = fallbackGaps.filter(
    (gap) => gap >= shortPauseThresholdSeconds && gap < pauseThresholdSeconds,
  );

  return {
    pauseMethod: "text",
    allGapSeconds: fallbackGaps,
    silentPauses,
    choppyPauses,
  };
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

export function detectRepetitions(text: string): { count: number; details: Record<string, number> } {
  const details: Record<string, number> = {};
  let count = 0;

  const repeatedWordRegex = /\b([a-z]+(?:'[a-z]+)?)\s+\1\b/gi;
  let match: RegExpExecArray | null;
  while ((match = repeatedWordRegex.exec(text.toLowerCase())) !== null) {
    const label = match[0].toLowerCase();
    details[label] = (details[label] || 0) + 1;
    count += 1;
  }

  return { count, details };
}

export function detectRepairs(text: string): { count: number; details: Record<string, number> } {
  const normalized = text.toLowerCase();
  const details: Record<string, number> = {};
  let count = 0;

  for (const phrase of REPAIR_PHRASES) {
    const regex = new RegExp(`\\b${escapeRegex(phrase)}\\b`, "gi");
    const matches = normalized.match(regex);
    if (!matches) continue;
    details[phrase] = (details[phrase] || 0) + matches.length;
    count += matches.length;
  }

  const restartRegex = /\b[a-z]+(?:'[a-z]+)?\s*(?:—|-|…|\.\.\.)\s*[a-z]+(?:'[a-z]+)?\b/gi;
  const restarts = normalized.match(restartRegex);
  if (restarts) {
    details.restarts = (details.restarts || 0) + restarts.length;
    count += restarts.length;
  }

  return { count, details };
}

export function countFillerWords(text: string): {
  count: number;
  details: Record<string, number>;
  strongCount: number;
  contextualCount: number;
} {
  const normalizedText = text.toLowerCase();
  const details: Record<string, number> = {};
  const strongPhrases = [...STRONG_FILLERS, ...MULTI_WORD_FILLERS];
  const strongMatches = countNonOverlappingPhraseMatches(normalizedText, strongPhrases);
  const strongCount = strongMatches.count;
  let contextualCount = 0;

  for (const [phrase, matchCount] of Object.entries(strongMatches.details)) {
    details[phrase] = (details[phrase] || 0) + matchCount;
  }

  const tokens = tokenize(normalizedText);
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token.kind !== "word" || !CONTEXTUAL_FILLERS.has(token.value)) continue;

    const prevToken = i > 0 ? tokens[i - 1] : null;
    const nextToken = i < tokens.length - 1 ? tokens[i + 1] : null;

    const prevIsBoundary = !prevToken || prevToken.kind === "punct";
    const prevIsHesitation =
      prevToken?.kind === "word" &&
      HESITATION_SOUNDS.includes(prevToken.value as (typeof HESITATION_SOUNDS)[number]);
    const nextIsClauseBoundary =
      nextToken?.kind === "punct" && CLAUSE_BOUNDARY_PUNCTUATION.has(nextToken.value);
    const likeCopulaPattern =
      token.value === "like" &&
      prevToken?.kind === "word" &&
      COPULA_WORDS.has(prevToken.value) &&
      nextToken?.kind === "word";

    // Count contextual fillers mostly when they appear as discourse markers at clause boundaries.
    const isDiscourseMarker = prevIsBoundary || prevIsHesitation || nextIsClauseBoundary || likeCopulaPattern;
    if (!isDiscourseMarker) continue;

    details[token.value] = (details[token.value] || 0) + 1;
    contextualCount += 1;
  }

  return {
    count: strongCount + contextualCount,
    details,
    strongCount,
    contextualCount,
  };
}

export interface TranscriptMetrics {
  totalWords: number;
  wordsPerMinute: number;
  fillerWordCount: number;
  fillerWordsPerMinute: number;
  fillerRatePerMinute: number;
  fillerCountStrong: number;
  fillerCountContextual: number;
  fillerDetails: Record<string, number>;
  expressionsUsed: string[];
  pauseRatio: number;
  pauseMethod: "timestamps" | "text";
  silentPauseCount: number;
  silentPauseTotalSeconds: number;
  silentPauseRatePerMinute: number;
  silentPauseAvgSeconds: number;
  silentPauseP95Seconds: number;
  longestSilentPauseSeconds: number;
  silentPauseHistogram: {
    short: number;
    medium: number;
    long: number;
  };
  choppinessCount: number;
  vocabularyRichness: number;
  elongationCount: number;
  elongationDetails: Record<string, number>;
  repetitionCount: number;
  repairCount: number;
}

export type AnalysisResult = TranscriptMetrics & {
  transcript: string;
};

type PauseInput = {
  silenceGapsMs?: number[];
  segments?: TranscriptionSegment[];
  pauseThresholdSeconds?: number;
  shortPauseThresholdSeconds?: number;
};

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
  const fillerWordsPerMinute = durationMin > 0 ? Math.round((fillers.count / durationMin) * 10) / 10 : 0;

  const expressionsUsed = expressions.filter((expr) => normalized.includes(expr.toLowerCase()));

  const pauseThresholdSeconds =
    pauseInput.pauseThresholdSeconds && pauseInput.pauseThresholdSeconds > 0
      ? pauseInput.pauseThresholdSeconds
      : DEFAULT_PAUSE_THRESHOLD_SECONDS;
  const shortPauseThresholdSeconds =
    pauseInput.shortPauseThresholdSeconds && pauseInput.shortPauseThresholdSeconds > 0
      ? pauseInput.shortPauseThresholdSeconds
      : DEFAULT_SHORT_PAUSE_SECONDS;

  const gaps = deriveGapMetrics(pauseThresholdSeconds, shortPauseThresholdSeconds, pauseInput);
  const totalSilenceSeconds = gaps.allGapSeconds.reduce((sum, gap) => sum + gap, 0);
  const pauseRatio = durationSeconds > 0 ? Math.round((totalSilenceSeconds / durationSeconds) * 100) / 100 : 0;

  const silentPauseCount = gaps.silentPauses.length;
  const silentPauseTotalSeconds = Math.round(gaps.silentPauses.reduce((sum, gap) => sum + gap, 0) * 100) / 100;
  const silentPauseAvgSeconds =
    silentPauseCount > 0 ? Math.round((silentPauseTotalSeconds / silentPauseCount) * 100) / 100 : 0;
  const silentPauseRatePerMinute =
    durationMin > 0 ? Math.round((silentPauseCount / durationMin) * 10) / 10 : 0;
  const longestSilentPauseSeconds =
    silentPauseCount > 0 ? Math.round(Math.max(...gaps.silentPauses) * 100) / 100 : 0;
  const silentPauseP95Seconds =
    silentPauseCount > 0 ? Math.round(percentile(gaps.silentPauses, 0.95) * 100) / 100 : 0;

  const silentPauseHistogram = {
    short: gaps.silentPauses.filter((gap) => gap >= pauseThresholdSeconds && gap < 1).length,
    medium: gaps.silentPauses.filter((gap) => gap >= 1 && gap < 2).length,
    long: gaps.silentPauses.filter((gap) => gap >= 2).length,
  };

  const uniqueWords = new Set(words);
  const vocabularyRichness = totalWords > 0 ? Math.round((uniqueWords.size / totalWords) * 100) / 100 : 0;

  const elongations = detectElongations(normalized);
  const repetitions = detectRepetitions(normalized);
  const repairs = detectRepairs(normalized);

  return {
    totalWords,
    wordsPerMinute,
    fillerWordCount: fillers.count,
    fillerWordsPerMinute,
    fillerRatePerMinute: fillerWordsPerMinute,
    fillerCountStrong: fillers.strongCount,
    fillerCountContextual: fillers.contextualCount,
    fillerDetails: fillers.details,
    expressionsUsed,
    pauseRatio,
    pauseMethod: gaps.pauseMethod,
    silentPauseCount,
    silentPauseTotalSeconds,
    silentPauseRatePerMinute,
    silentPauseAvgSeconds,
    silentPauseP95Seconds,
    longestSilentPauseSeconds,
    silentPauseHistogram,
    choppinessCount: gaps.choppyPauses.length,
    vocabularyRichness,
    elongationCount: elongations.count,
    elongationDetails: elongations.details,
    repetitionCount: repetitions.count,
    repairCount: repairs.count,
  };
}
