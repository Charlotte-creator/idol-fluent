import { useState, useCallback, useRef, useMemo } from "react";

import { computeTranscriptMetrics } from "@/lib/speechMetrics";

const DEFAULT_LANGUAGE = "en-US";
const LANGUAGE_KEY = "shadowspeak_speech_language";
const ON_DEVICE_KEY = "shadowspeak_speech_on_device";
const CONTEXT_PHRASES_KEY = "shadowspeak_context_phrases";
const MAX_ALTERNATIVES = 3;

type SpeechRecognitionAlternativeLike = {
  transcript: string;
  confidence?: number;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionResultListLike = {
  length: number;
  [index: number]: SpeechRecognitionResultLike;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultListLike;
};

type SpeechRecognitionErrorLike = {
  error: string;
  message?: string;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives?: number;
  phrases?: unknown[];
  processLocally?: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort?: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

interface ListeningSession {
  transcriptParts: string[];
  silenceGapsMs: number[];
  lastResultTime: number;
  stoppedByUser: boolean;
}

export interface AnalysisResult {
  transcript: string;
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

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const win = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return win.SpeechRecognition || win.webkitSpeechRecognition || null;
}

function getDefaultLanguage(): string {
  const langFromDocument = document.documentElement.lang?.trim();
  if (langFromDocument) return langFromDocument;
  if (navigator.language?.trim()) return navigator.language;
  return DEFAULT_LANGUAGE;
}

function readStoredLanguage(): string {
  const stored = localStorage.getItem(LANGUAGE_KEY)?.trim();
  return stored || getDefaultLanguage();
}

function readStoredOnDevicePreference(): boolean {
  return localStorage.getItem(ON_DEVICE_KEY) === "true";
}

function readStoredContextPhrases(): string[] {
  const raw = localStorage.getItem(CONTEXT_PHRASES_KEY);
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function sanitizeContextPhrases(phrases: string[]): string[] {
  return [...new Set(phrases.map((phrase) => phrase.trim()).filter(Boolean))].slice(0, 50);
}

function pickBestAlternative(result: SpeechRecognitionResultLike): string {
  if (result.length <= 0) return "";

  let bestTranscript = result[0].transcript?.trim() || "";
  let bestConfidence = Number.isFinite(result[0].confidence ?? NaN)
    ? (result[0].confidence as number)
    : -1;

  for (let i = 1; i < result.length; i++) {
    const alt = result[i];
    const confidence = Number.isFinite(alt.confidence ?? NaN) ? (alt.confidence as number) : -1;
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      bestTranscript = alt.transcript?.trim() || bestTranscript;
    }
  }

  return bestTranscript.trim();
}

function mapRecognitionError(error: string, usingOnDevice: boolean): string | null {
  switch (error) {
    case "no-speech":
      return "No speech detected. Speak clearly and try again.";
    case "aborted":
      return null;
    case "audio-capture":
      return "No microphone input detected. Check your mic connection and permissions.";
    case "not-allowed":
      return "Microphone permission was denied. Allow access and try again.";
    case "language-not-supported":
      return usingOnDevice
        ? "On-device recognition is unavailable for this language. Disable on-device mode or install the language pack."
        : "This language is not supported by your browser's speech recognition service.";
    case "service-not-allowed":
      return "Speech recognition service is blocked by your browser or system settings.";
    case "network":
      return "Speech recognition lost network connectivity. Try again.";
    default:
      return `Recognition error: ${error}`;
  }
}

function shouldTreatAsFatal(error: string): boolean {
  return [
    "audio-capture",
    "not-allowed",
    "language-not-supported",
    "service-not-allowed",
    "network",
  ].includes(error);
}

export function useSpeechAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguageState] = useState(readStoredLanguage);
  const [preferOnDevice, setPreferOnDeviceState] = useState(readStoredOnDevicePreference);
  const [contextPhrases, setContextPhrasesState] = useState<string[]>(readStoredContextPhrases);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const sessionRef = useRef<ListeningSession | null>(null);

  const support = useMemo(() => {
    const ctor = getRecognitionCtor();
    if (!ctor) {
      return {
        supported: false,
        supportsContextualPhrases: false,
        supportsOnDevice: false,
      };
    }

    try {
      const probe = new ctor();
      return {
        supported: true,
        supportsContextualPhrases: "phrases" in probe,
        supportsOnDevice: "processLocally" in probe,
      };
    } catch {
      return {
        supported: true,
        supportsContextualPhrases: false,
        supportsOnDevice: false,
      };
    }
  }, []);

  const stopRecognition = useCallback((abort = false) => {
    const current = recognitionRef.current;
    if (!current) return;

    try {
      if (abort && current.abort) {
        current.abort();
      } else {
        current.stop();
      }
    } catch {
      // Avoid propagating browser-specific stop/abort exceptions.
    } finally {
      recognitionRef.current = null;
    }
  }, []);

  const setLanguage = useCallback((value: string) => {
    const normalized = value.trim();
    if (!normalized) return;
    setLanguageState(normalized);
    localStorage.setItem(LANGUAGE_KEY, normalized);
  }, []);

  const setPreferOnDevice = useCallback((value: boolean) => {
    setPreferOnDeviceState(value);
    localStorage.setItem(ON_DEVICE_KEY, String(value));
  }, []);

  const setContextPhrases = useCallback((phrases: string[]) => {
    const sanitized = sanitizeContextPhrases(phrases);
    setContextPhrasesState(sanitized);
    localStorage.setItem(CONTEXT_PHRASES_KEY, sanitized.join(", "));
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition = getRecognitionCtor();
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in this browser. Try Chrome.");
      return;
    }

    if (recognitionRef.current) {
      if (sessionRef.current) {
        sessionRef.current.stoppedByUser = true;
      }
      stopRecognition(true);
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = language;

    if ("maxAlternatives" in recognition) {
      recognition.maxAlternatives = MAX_ALTERNATIVES;
    }

    let startupError: string | null = null;
    if ("processLocally" in recognition) {
      recognition.processLocally = preferOnDevice;
    } else if (preferOnDevice) {
      startupError = "On-device speech recognition is not supported in this browser.";
    }

    if ("phrases" in recognition) {
      const phraseCtor = (window as Window & { SpeechRecognitionPhrase?: new (...args: unknown[]) => unknown })
        .SpeechRecognitionPhrase;
      const sanitized = sanitizeContextPhrases(contextPhrases);
      const phraseEntries = sanitized.map((phrase) => {
        if (!phraseCtor) return { phrase, boost: 5 };
        try {
          return new phraseCtor(phrase, 5);
        } catch {
          try {
            return new phraseCtor({ phrase, boost: 5 });
          } catch {
            return { phrase, boost: 5 };
          }
        }
      });
      recognition.phrases = phraseEntries;
    }

    const session: ListeningSession = {
      transcriptParts: [],
      silenceGapsMs: [],
      lastResultTime: Date.now(),
      stoppedByUser: false,
    };

    sessionRef.current = session;
    recognitionRef.current = recognition;

    setIsAnalyzing(true);
    setError(startupError);
    setResult(null);

    recognition.onresult = (event) => {
      if (sessionRef.current !== session) return;

      const now = Date.now();
      const gap = now - session.lastResultTime;
      if (gap > 1500) session.silenceGapsMs.push(gap);
      session.lastResultTime = now;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const resultItem = event.results[i];
        if (!resultItem?.isFinal) continue;
        const best = pickBestAlternative(resultItem);
        if (best) session.transcriptParts.push(best);
      }
    };

    recognition.onerror = (event) => {
      if (sessionRef.current !== session) return;
      const message = mapRecognitionError(event.error, preferOnDevice);

      if (event.error === "aborted" && session.stoppedByUser) {
        return;
      }

      if (message) {
        setError(message);
      }

      if (shouldTreatAsFatal(event.error)) {
        setIsAnalyzing(false);
      }
    };

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null;
      }
      if (sessionRef.current !== session) return;
      setIsAnalyzing(false);
    };

    try {
      recognition.start();
    } catch {
      setIsAnalyzing(false);
      setError("Unable to start speech recognition. Please try again.");
      recognitionRef.current = null;
    }
  }, [contextPhrases, language, preferOnDevice, stopRecognition]);

  const stopAndAnalyze = useCallback(
    (durationSeconds: number, expressions: string[] = []): AnalysisResult | null => {
      const session = sessionRef.current;
      if (!session) {
        setIsAnalyzing(false);
        return null;
      }

      session.stoppedByUser = true;
      stopRecognition(false);

      const transcript = session.transcriptParts.join(" ").replace(/\s+/g, " ").trim();
      const metrics = computeTranscriptMetrics(
        transcript,
        durationSeconds,
        expressions,
        session.silenceGapsMs,
      );

      const analysisResult: AnalysisResult = {
        transcript,
        ...metrics,
      };

      setResult(analysisResult);
      setIsAnalyzing(false);
      sessionRef.current = null;
      return analysisResult;
    },
    [stopRecognition],
  );

  const stopAnalysis = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.stoppedByUser = true;
    }
    stopRecognition(false);
    setIsAnalyzing(false);
  }, [stopRecognition]);

  return {
    isAnalyzing,
    result,
    error,
    startListening,
    stopAndAnalyze,
    stopAnalysis,
    language,
    setLanguage,
    preferOnDevice,
    setPreferOnDevice,
    contextPhrases,
    setContextPhrases,
    supportsSpeechRecognition: support.supported,
    supportsContextualPhrases: support.supportsContextualPhrases,
    supportsOnDevice: support.supportsOnDevice,
  };
}
