import { useCallback, useEffect, useRef, useState } from "react";

import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { parseTranscriptionResponse, type TranscriptionResponse } from "@/lib/transcription";

const LANGUAGE_KEY = "shadowspeak_transcription_language";
const DEFAULT_TIMEOUT_MS = 45_000;
const BLOB_WAIT_TIMEOUT_MS = 10_000;

export interface StopAndTranscribeOptions {
  language?: string;
  timeoutMs?: number;
  durationSeconds?: number;
}

export interface TranscriptionDebugInfo {
  mimeType: string;
  fileBytes: number;
  languageHint?: string;
  durationHintSeconds?: number;
  latencyMs: number;
  confidence?: number;
  segmentCount: number;
}

type PendingBlobRequest = {
  resolve: (blob: Blob | null) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

function getDefaultLanguage(): string {
  const langFromDocument = document.documentElement.lang?.trim();
  if (langFromDocument) return langFromDocument;
  if (navigator.language?.trim()) return navigator.language;
  return "en-US";
}

function getFileExtension(blobType: string): string {
  if (blobType.includes("wav")) return "wav";
  if (blobType.includes("mpeg") || blobType.includes("mp3")) return "mp3";
  if (blobType.includes("m4a") || blobType.includes("mp4")) return "m4a";
  if (blobType.includes("ogg")) return "ogg";
  return "webm";
}

export function normalizeLanguageHint(rawLanguage: string): string {
  const cleaned = rawLanguage.trim();
  if (!cleaned) return "";

  const normalized = cleaned.replace(/_/g, "-");
  return normalized.split("-", 1)[0].toLowerCase();
}

function extractErrorMessage(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const payload = raw as Record<string, unknown>;
  return typeof payload.error === "string" ? payload.error : null;
}

export function getTranscriptionRequestErrorMessage(requestError: unknown): string {
  if (!(requestError instanceof Error)) {
    return "Transcription failed.";
  }

  if (requestError.name === "AbortError") {
    return "Transcription timed out. Please try a shorter clip.";
  }

  const normalized = requestError.message.trim().toLowerCase();
  if (
    normalized === "failed to fetch" ||
    normalized === "fetch failed" ||
    normalized.includes("networkerror")
  ) {
    return "Cannot reach the transcription service. Check your connection or server and try again.";
  }

  return requestError.message || "Transcription failed.";
}

export function useTranscription() {
  const {
    isRecording,
    audioBlob,
    audioUrl,
    duration,
    error: recorderError,
    start,
    stop,
  } = useAudioRecorder();

  const [isTranscribing, setIsTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState("");
  const [debugInfo, setDebugInfo] = useState<TranscriptionDebugInfo | null>(null);
  const [language, setLanguageState] = useState(
    () => localStorage.getItem(LANGUAGE_KEY) || getDefaultLanguage(),
  );

  const audioBlobRef = useRef<Blob | null>(audioBlob);
  const isRecordingRef = useRef(isRecording);
  const pendingBlobRef = useRef<PendingBlobRequest | null>(null);

  useEffect(() => {
    audioBlobRef.current = audioBlob;
    if (!audioBlob || !pendingBlobRef.current) return;
    clearTimeout(pendingBlobRef.current.timeoutId);
    pendingBlobRef.current.resolve(audioBlob);
    pendingBlobRef.current = null;
  }, [audioBlob]);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    if (recorderError) {
      setError(recorderError);
    }
  }, [recorderError]);

  useEffect(() => {
    return () => {
      if (!pendingBlobRef.current) return;
      clearTimeout(pendingBlobRef.current.timeoutId);
      pendingBlobRef.current.resolve(null);
      pendingBlobRef.current = null;
    };
  }, []);

  const setLanguage = useCallback((value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    setLanguageState(normalized);
    localStorage.setItem(LANGUAGE_KEY, normalized);
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    setError(null);
    setTranscript("");
    setDebugInfo(null);
    return start();
  }, [start]);

  const stopRecording = useCallback(() => {
    stop();
  }, [stop]);

  const waitForStoppedBlob = useCallback((): Promise<Blob | null> => {
    if (audioBlobRef.current) {
      return Promise.resolve(audioBlobRef.current);
    }

    return new Promise<Blob | null>((resolve) => {
      const timeoutId = setTimeout(() => {
        if (!pendingBlobRef.current) return;
        pendingBlobRef.current.resolve(null);
        pendingBlobRef.current = null;
      }, BLOB_WAIT_TIMEOUT_MS);

      pendingBlobRef.current = { resolve, timeoutId };
    });
  }, []);

  const stopAndTranscribe = useCallback(
    async (options: StopAndTranscribeOptions = {}): Promise<TranscriptionResponse | null> => {
      setError(null);

      const languageHint = normalizeLanguageHint(options.language || language);
      const durationHintSeconds = options.durationSeconds ?? duration;

      if (isRecordingRef.current) {
        stop();
      }

      const blob = await waitForStoppedBlob();
      if (!blob) {
        setError("No recording available to transcribe.");
        return null;
      }

      setIsTranscribing(true);
      const form = new FormData();
      const mimeType = blob.type || "audio/webm";
      const ext = getFileExtension(mimeType);
      form.append("audio", blob, `recording.${ext}`);
      if (languageHint) {
        form.append("language", languageHint);
      }
      if (typeof durationHintSeconds === "number" && Number.isFinite(durationHintSeconds)) {
        form.append("durationSeconds", String(durationHintSeconds));
      }

      const startedAt = performance.now();
      const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch("/api/transcribe", {
          method: "POST",
          body: form,
          signal: controller.signal,
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message =
            extractErrorMessage(payload) ||
            `Transcription request failed with status ${response.status}.`;
          throw new Error(message);
        }

        const parsed = parseTranscriptionResponse(payload);
        if (!parsed.text) {
          throw new Error("Transcription completed but returned empty text.");
        }

        setTranscript(parsed.text);
        setDebugInfo({
          mimeType,
          fileBytes: blob.size,
          languageHint: languageHint || undefined,
          durationHintSeconds,
          latencyMs: Math.round(performance.now() - startedAt),
          confidence: parsed.confidence,
          segmentCount: parsed.segments?.length ?? 0,
        });
        return parsed;
      } catch (requestError) {
        const message = getTranscriptionRequestErrorMessage(requestError);
        setError(message);
        return null;
      } finally {
        clearTimeout(timeoutId);
        setIsTranscribing(false);
      }
    },
    [duration, language, stop, waitForStoppedBlob],
  );

  return {
    isRecording,
    audioBlob,
    audioUrl,
    duration,
    isTranscribing,
    error,
    transcript,
    debugInfo,
    language,
    setLanguage,
    startRecording,
    stopRecording,
    stopAndTranscribe,
  };
}
