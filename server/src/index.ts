import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import OpenAI from "openai";
import { toFile } from "openai/uploads";

dotenv.config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ALLOWED_TRANSCRIBE_MODELS = new Set([
  "gpt-4o-mini-transcribe",
  "gpt-4o-transcribe",
  "whisper-1",
]);
const configuredModel = (process.env.TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe").trim();
const TRANSCRIBE_MODEL = ALLOWED_TRANSCRIBE_MODELS.has(configuredModel)
  ? configuredModel
  : "gpt-4o-mini-transcribe";
const PORT = Number(process.env.PORT || 8787);

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_REQUESTS = 20;
const VALID_MIME_TYPES = new Set([
  "audio/webm",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/x-m4a",
  "audio/m4a",
  "audio/ogg",
]);
const VALID_EXTENSIONS = new Set([".webm", ".wav", ".mp3", ".m4a", ".ogg"]);

const openai = OPENAI_API_KEY ? new OpenAI({ apiKey: OPENAI_API_KEY }) : null;

type RateLimitBucket = {
  count: number;
  resetAt: number;
};

type TranscriptionSegment = {
  start: number;
  end: number;
  text: string;
  confidence?: number;
};

type TranscriptionPayload = {
  text: string;
  language?: string;
  duration?: number;
  segments?: TranscriptionSegment[];
  confidence?: number;
};

const rateLimitStore = new Map<string, RateLimitBucket>();

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_AUDIO_BYTES,
    files: 1,
  },
});

function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function cleanupRateLimitStore(now: number) {
  for (const [key, bucket] of rateLimitStore.entries()) {
    if (bucket.resetAt <= now) {
      rateLimitStore.delete(key);
    }
  }
}

function applyRateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  cleanupRateLimitStore(now);

  const key = getClientIp(req);
  const existing = rateLimitStore.get(key);
  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return next();
  }

  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({
      error: "Rate limit exceeded. Please retry shortly.",
    });
    return;
  }

  existing.count += 1;
  rateLimitStore.set(key, existing);
  next();
}

function hasAllowedExtension(fileName: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  return VALID_EXTENSIONS.has(ext);
}

function getLanguageHint(rawLanguage: unknown): string | undefined {
  if (typeof rawLanguage !== "string") return undefined;
  const normalized = rawLanguage.trim();
  if (!normalized) return undefined;
  return normalized;
}

function toNumber(rawValue: unknown): number | undefined {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) {
    return rawValue;
  }
  if (typeof rawValue === "string" && rawValue.trim()) {
    const value = Number(rawValue);
    return Number.isFinite(value) ? value : undefined;
  }
  return undefined;
}

function parseSegments(rawSegments: unknown): TranscriptionSegment[] | undefined {
  if (!Array.isArray(rawSegments)) return undefined;

  const segments: TranscriptionSegment[] = [];
  for (const rawSegment of rawSegments) {
    if (!rawSegment || typeof rawSegment !== "object") continue;
    const candidate = rawSegment as Record<string, unknown>;
    const start = toNumber(candidate.start);
    const end = toNumber(candidate.end);
    const text = typeof candidate.text === "string" ? candidate.text.trim() : "";
    if (start == null || end == null || !text) continue;
    if (end < start) continue;
    segments.push({
      start,
      end,
      text,
      confidence: toNumber(candidate.confidence),
    });
  }

  if (segments.length === 0) return undefined;
  return segments.sort((a, b) => a.start - b.start);
}

function parseAverageConfidence(raw: unknown): number | undefined {
  if (!Array.isArray(raw)) return undefined;
  let total = 0;
  let count = 0;
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const value = toNumber((item as Record<string, unknown>).logprob);
    if (value == null) continue;
    // Convert log probability to linear probability estimate.
    const probability = Math.exp(value);
    if (!Number.isFinite(probability)) continue;
    total += probability;
    count += 1;
  }
  if (count === 0) return undefined;
  return Math.max(0, Math.min(1, total / count));
}

function parseTranscriptionResult(raw: unknown): TranscriptionPayload {
  if (typeof raw === "string") {
    return { text: raw.trim() };
  }

  if (!raw || typeof raw !== "object") {
    return { text: "" };
  }

  const data = raw as Record<string, unknown>;
  const text = typeof data.text === "string" ? data.text.trim() : "";
  return {
    text,
    language: typeof data.language === "string" ? data.language : undefined,
    duration: toNumber(data.duration),
    segments: parseSegments(data.segments),
    confidence: toNumber(data.confidence) ?? parseAverageConfidence(data.logprobs),
  };
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/transcribe", applyRateLimit, upload.single("audio"), async (req, res) => {
  const requestStartedAt = Date.now();
  if (!openai) {
    res.status(500).json({
      error: "Missing OPENAI_API_KEY. Set it in your environment before transcribing.",
    });
    return;
  }

  if (!req.file) {
    res.status(400).json({ error: "Missing file field 'audio' in multipart/form-data." });
    return;
  }

  const mimeType = req.file.mimetype;
  const fileName = req.file.originalname || "recording.webm";
  if (!VALID_MIME_TYPES.has(mimeType) && !hasAllowedExtension(fileName)) {
    res.status(415).json({
      error: "Unsupported audio format. Allowed: webm, wav, mp3, m4a, ogg.",
    });
    return;
  }

  if (req.file.size > MAX_AUDIO_BYTES) {
    res.status(413).json({
      error: "Audio file exceeds 25MB limit.",
    });
    return;
  }

  const languageHint = getLanguageHint(req.body.language);
  const useWhisperTimestamps = TRANSCRIBE_MODEL === "whisper-1";

  try {
    const file = await toFile(req.file.buffer, fileName, { type: mimeType });
    const requestBody: Record<string, unknown> = {
      file,
      model: TRANSCRIBE_MODEL,
      response_format: useWhisperTimestamps ? "verbose_json" : "json",
    };

    if (languageHint) {
      requestBody.language = languageHint;
    }

    if (useWhisperTimestamps) {
      requestBody.timestamp_granularities = ["segment"];
    }

    const openAiStartedAt = Date.now();
    const response = await openai.audio.transcriptions.create(requestBody as any);
    const openAiDurationMs = Date.now() - openAiStartedAt;
    const totalDurationMs = Date.now() - requestStartedAt;
    const parsed = parseTranscriptionResult(response);
    if (!parsed.text) {
      res.status(502).json({
        error: "Transcription provider returned no text.",
      });
      return;
    }

    res.setHeader("x-transcribe-model", TRANSCRIBE_MODEL);
    res.setHeader(
      "server-timing",
      `openai;dur=${openAiDurationMs}, total;dur=${totalDurationMs}`,
    );
    res.json(parsed);
  } catch (error: unknown) {
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Transcription failed due to an unknown error.";

    const isAuthError = message.includes("401") || message.toLowerCase().includes("api key");
    const status = isAuthError ? 401 : 502;

    res.status(status).json({
      error: isAuthError
        ? "OpenAI authentication failed. Verify OPENAI_API_KEY."
        : `Transcription failed: ${message}`,
    });
  }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({
        error: "Audio file exceeds 25MB limit.",
      });
      return;
    }
    res.status(400).json({
      error: `Upload error: ${error.message}`,
    });
    return;
  }

  res.status(500).json({
    error: "Unexpected server error.",
  });
});

const clientDistPath = path.resolve(process.cwd(), "dist");
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) {
      next();
      return;
    }
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

app.listen(PORT, () => {
  if (!ALLOWED_TRANSCRIBE_MODELS.has(configuredModel)) {
    // eslint-disable-next-line no-console
    console.warn(
      `Unsupported TRANSCRIBE_MODEL="${configuredModel}". Falling back to gpt-4o-mini-transcribe.`,
    );
  }
  // eslint-disable-next-line no-console
  console.log(`idol-fluent server listening on http://localhost:${PORT}`);
});
