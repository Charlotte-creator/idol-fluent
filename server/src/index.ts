import fs from "node:fs";
import path from "node:path";

import dotenv from "dotenv";
import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";

dotenv.config();

const STT_URL = (process.env.STT_URL || "http://localhost:8000").replace(/\/+$/, "");
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

type RateLimitBucket = { count: number; resetAt: number };
const rateLimitStore = new Map<string, RateLimitBucket>();

const app = express();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1 },
});

function getClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || "unknown";
}

function cleanupRateLimitStore(now: number) {
  for (const [key, bucket] of rateLimitStore.entries()) {
    if (bucket.resetAt <= now) rateLimitStore.delete(key);
  }
}

function applyRateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  cleanupRateLimitStore(now);
  const key = getClientIp(req);
  const existing = rateLimitStore.get(key);

  if (!existing || existing.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    const retryAfter = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ error: "Rate limit exceeded. Please retry shortly." });
    return;
  }

  existing.count += 1;
  next();
}

function hasAllowedExtension(fileName: string): boolean {
  return VALID_EXTENSIONS.has(path.extname(fileName).toLowerCase());
}

// ── Health ──────────────────────────────────────────────────────────────────────

app.get("/api/health", async (_req, res) => {
  let sttStatus: { reachable: boolean; model?: string } = { reachable: false };
  try {
    const sttRes = await fetch(`${STT_URL}/health`, { signal: AbortSignal.timeout(3000) });
    if (sttRes.ok) {
      const data = (await sttRes.json()) as Record<string, unknown>;
      sttStatus = {
        reachable: true,
        model: typeof data.model === "string" ? data.model : undefined,
      };
    }
  } catch {
    // STT unreachable
  }
  res.json({ ok: true, stt: sttStatus });
});

// ── Transcribe (proxy to STT service) ───────────────────────────────────────────

app.post("/api/transcribe", applyRateLimit, upload.single("audio"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "Missing file field 'audio' in multipart/form-data." });
    return;
  }

  const mimeType = req.file.mimetype;
  const fileName = req.file.originalname || "recording.webm";
  if (!VALID_MIME_TYPES.has(mimeType) && !hasAllowedExtension(fileName)) {
    res.status(415).json({ error: "Unsupported audio format. Allowed: webm, wav, mp3, m4a, ogg." });
    return;
  }

  if (req.file.size > MAX_AUDIO_BYTES) {
    res.status(413).json({ error: "Audio file exceeds 25MB limit." });
    return;
  }

  const languageHint = typeof req.body.language === "string" ? req.body.language.trim() : "";

  try {
    const form = new FormData();
    form.append("file", new Blob([req.file.buffer], { type: mimeType }), fileName);
    if (languageHint) form.append("language", languageHint);

    const startedAt = Date.now();
    const sttRes = await fetch(`${STT_URL}/transcribe`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(120_000),
    });

    const payload = await sttRes.json().catch(() => null);
    const totalMs = Date.now() - startedAt;

    if (!sttRes.ok) {
      const status = sttRes.status === 429 ? 429 : 502;
      const msg =
        payload && typeof payload === "object" && "detail" in payload
          ? typeof payload.detail === "string"
            ? payload.detail
            : JSON.stringify(payload.detail)
          : `STT service returned ${sttRes.status}`;
      res.status(status).json({ error: msg });
      return;
    }

    if (!payload || typeof payload !== "object" || !payload.text) {
      res.status(502).json({ error: "STT service returned no text." });
      return;
    }

    res.setHeader("server-timing", `stt;dur=${totalMs}`);
    res.json(payload);
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.name === "TimeoutError"
          ? "STT service timed out. Try a shorter clip."
          : err.message.includes("ECONNREFUSED")
            ? "STT service is not running. Start it with: docker compose up stt"
            : err.message
        : "Transcription failed.";
    res.status(502).json({ error: message });
  }
});

// ── Error handler ───────────────────────────────────────────────────────────────

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "Audio file exceeds 25MB limit." });
      return;
    }
    res.status(400).json({ error: `Upload error: ${error.message}` });
    return;
  }
  res.status(500).json({ error: "Unexpected server error." });
});

// ── Static files ────────────────────────────────────────────────────────────────

const clientDistPath = path.resolve(process.cwd(), "dist");
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(clientDistPath, "index.html"));
  });
}

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`idol-fluent server listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`STT service URL: ${STT_URL}`);
});
