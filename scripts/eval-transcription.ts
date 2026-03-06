import fs from "node:fs/promises";
import path from "node:path";

import OpenAI from "openai";
import { toFile } from "openai/uploads";

import { parseTranscriptionResponse } from "../src/lib/transcription.ts";

type EvalResult = {
  file: string;
  source: "endpoint" | "openai";
  refWords: number;
  hypWords: number;
  wer: number;
  cer: number;
  latencyMs: number;
  error?: string;
};

const AUDIO_DIR = path.resolve(process.cwd(), "eval/audio");
const REF_DIR = path.resolve(process.cwd(), "eval/refs");
const RESULT_CSV_PATH = path.resolve(process.cwd(), "eval/results.csv");
const ENDPOINT_URL = process.env.EVAL_TRANSCRIBE_URL || "http://localhost:8787/api/transcribe";
const MODEL = process.env.TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe";
const LANGUAGE = process.env.EVAL_LANGUAGE || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const AUDIO_EXTENSIONS = new Set([".wav", ".webm", ".mp3", ".m4a", ".ogg"]);

function normalizeForWords(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\r\n]+/g, " ")
    .replace(/[^\w\s']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeForChars(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshteinDistance<T>(a: T[], b: T[]): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp: number[][] = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let i = 0; i < rows; i++) dp[i][0] = i;
  for (let j = 0; j < cols; j++) dp[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }

  return dp[rows - 1][cols - 1];
}

function computeWer(reference: string, hypothesis: string): { wer: number; refWords: number; hypWords: number } {
  const refWords = normalizeForWords(reference).split(" ").filter(Boolean);
  const hypWords = normalizeForWords(hypothesis).split(" ").filter(Boolean);
  const distance = levenshteinDistance(refWords, hypWords);
  const wer = refWords.length === 0 ? (hypWords.length === 0 ? 0 : 1) : distance / refWords.length;
  return { wer, refWords: refWords.length, hypWords: hypWords.length };
}

function computeCer(reference: string, hypothesis: string): number {
  const refChars = Array.from(normalizeForChars(reference));
  const hypChars = Array.from(normalizeForChars(hypothesis));
  const distance = levenshteinDistance(refChars, hypChars);
  return refChars.length === 0 ? (hypChars.length === 0 ? 0 : 1) : distance / refChars.length;
}

function p90(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(0.9 * sorted.length) - 1));
  return sorted[idx];
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function toCsv(rows: EvalResult[]): string {
  const headers = [
    "file",
    "source",
    "refWords",
    "hypWords",
    "wer",
    "cer",
    "latencyMs",
    "error",
  ];

  const escapeCell = (value: string) => `"${value.replaceAll("\"", "\"\"")}"`;
  const lines = [headers.join(",")];

  for (const row of rows) {
    lines.push([
      escapeCell(row.file),
      row.source,
      String(row.refWords),
      String(row.hypWords),
      row.wer.toFixed(4),
      row.cer.toFixed(4),
      String(row.latencyMs),
      escapeCell(row.error || ""),
    ].join(","));
  }

  return `${lines.join("\n")}\n`;
}

function mimeFromPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".wav":
      return "audio/wav";
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".ogg":
      return "audio/ogg";
    default:
      return "audio/webm";
  }
}

async function transcribeViaEndpoint(filePath: string): Promise<{ text: string; latencyMs: number }> {
  const fileBuffer = await fs.readFile(filePath);
  const fileName = path.basename(filePath);
  const mimeType = mimeFromPath(filePath);
  const formData = new FormData();
  formData.append("audio", new Blob([fileBuffer], { type: mimeType }), fileName);
  if (LANGUAGE) {
    formData.append("language", LANGUAGE);
  }

  const startedAt = Date.now();
  const response = await fetch(ENDPOINT_URL, {
    method: "POST",
    body: formData,
  });
  const latencyMs = Date.now() - startedAt;

  const json = await response.json().catch(() => null);
  if (!response.ok) {
    const errorMessage =
      json && typeof json === "object" && typeof (json as { error?: unknown }).error === "string"
        ? (json as { error: string }).error
        : `HTTP ${response.status}`;
    throw new Error(errorMessage);
  }

  const parsed = parseTranscriptionResponse(json);
  if (!parsed.text) {
    throw new Error("Endpoint returned empty text.");
  }

  return { text: parsed.text, latencyMs };
}

async function transcribeViaOpenAI(filePath: string): Promise<{ text: string; latencyMs: number }> {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for direct OpenAI fallback.");
  }

  const fileBuffer = await fs.readFile(filePath);
  const fileName = path.basename(filePath);
  const mimeType = mimeFromPath(filePath);
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const file = await toFile(fileBuffer, fileName, { type: mimeType });

  const startedAt = Date.now();
  const response = await openai.audio.transcriptions.create({
    file,
    model: MODEL,
    response_format: MODEL === "whisper-1" ? "verbose_json" : "json",
    ...(LANGUAGE ? { language: LANGUAGE } : {}),
    ...(MODEL === "whisper-1" ? { timestamp_granularities: ["segment"] } : {}),
  } as any);
  const latencyMs = Date.now() - startedAt;

  const parsed = parseTranscriptionResponse(response);
  if (!parsed.text) {
    throw new Error("OpenAI returned empty text.");
  }

  return { text: parsed.text, latencyMs };
}

async function findEvalPairs(): Promise<Array<{ audioPath: string; refPath: string }>> {
  const entries = await fs.readdir(AUDIO_DIR, { withFileTypes: true }).catch(() => []);
  const pairs: Array<{ audioPath: string; refPath: string }> = [];

  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const ext = path.extname(entry.name).toLowerCase();
    if (!AUDIO_EXTENSIONS.has(ext)) continue;

    const base = path.basename(entry.name, ext);
    const refPath = path.join(REF_DIR, `${base}.txt`);

    try {
      await fs.access(refPath);
      pairs.push({
        audioPath: path.join(AUDIO_DIR, entry.name),
        refPath,
      });
    } catch {
      // eslint-disable-next-line no-console
      console.warn(`Skipping ${entry.name}: missing reference ${base}.txt`);
    }
  }

  return pairs;
}

async function main() {
  const pairs = await findEvalPairs();
  if (pairs.length === 0) {
    // eslint-disable-next-line no-console
    console.log("No eval pairs found in eval/audio + eval/refs.");
    return;
  }

  const results: EvalResult[] = [];

  for (const pair of pairs) {
    const fileName = path.basename(pair.audioPath);
    const reference = (await fs.readFile(pair.refPath, "utf8")).trim();

    try {
      const endpointResult = await transcribeViaEndpoint(pair.audioPath);
      const werStats = computeWer(reference, endpointResult.text);
      const cer = computeCer(reference, endpointResult.text);
      results.push({
        file: fileName,
        source: "endpoint",
        refWords: werStats.refWords,
        hypWords: werStats.hypWords,
        wer: werStats.wer,
        cer,
        latencyMs: endpointResult.latencyMs,
      });
      continue;
    } catch (endpointError) {
      try {
        const directResult = await transcribeViaOpenAI(pair.audioPath);
        const werStats = computeWer(reference, directResult.text);
        const cer = computeCer(reference, directResult.text);
        results.push({
          file: fileName,
          source: "openai",
          refWords: werStats.refWords,
          hypWords: werStats.hypWords,
          wer: werStats.wer,
          cer,
          latencyMs: directResult.latencyMs,
        });
      } catch (fallbackError) {
        const message =
          fallbackError instanceof Error
            ? fallbackError.message
            : endpointError instanceof Error
              ? endpointError.message
              : "Unknown eval error";
        results.push({
          file: fileName,
          source: "endpoint",
          refWords: 0,
          hypWords: 0,
          wer: 1,
          cer: 1,
          latencyMs: 0,
          error: message,
        });
      }
    }
  }

  await fs.writeFile(RESULT_CSV_PATH, toCsv(results), "utf8");

  const successful = results.filter((result) => !result.error);
  const werValues = successful.map((result) => result.wer);
  const latencyValues = successful.map((result) => result.latencyMs);

  const meanWer = werValues.length === 0 ? 0 : werValues.reduce((a, b) => a + b, 0) / werValues.length;
  const medianWer = median(werValues);
  const p90Latency = p90(latencyValues);
  const worst = [...successful].sort((a, b) => b.wer - a.wer).slice(0, 5);

  // eslint-disable-next-line no-console
  console.log(`Wrote ${RESULT_CSV_PATH}`);
  // eslint-disable-next-line no-console
  console.log(
    `Summary: mean WER=${meanWer.toFixed(4)}, median WER=${medianWer.toFixed(4)}, p90 latency=${Math.round(p90Latency)}ms`,
  );
  // eslint-disable-next-line no-console
  console.log("Worst 5 examples by WER:");
  for (const row of worst) {
    // eslint-disable-next-line no-console
    console.log(
      `- ${row.file}: WER=${row.wer.toFixed(4)} CER=${row.cer.toFixed(4)} latency=${row.latencyMs}ms source=${row.source}`,
    );
  }

  const failed = results.filter((result) => result.error);
  if (failed.length > 0) {
    // eslint-disable-next-line no-console
    console.log("Failed examples:");
    for (const row of failed) {
      // eslint-disable-next-line no-console
      console.log(`- ${row.file}: ${row.error}`);
    }
  }
}

void main();
