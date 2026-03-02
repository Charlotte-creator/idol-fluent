import { useState, useCallback, useRef } from "react";

const FILLER_WORDS = ["um", "uh", "like", "you know", "so", "basically", "actually", "literally", "right"];

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
}

export function useSpeechAnalysis() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  const analyze = useCallback(
    (durationSeconds: number, expressions: string[] = []): Promise<AnalysisResult> => {
      return new Promise((resolve, reject) => {
        const SpeechRecognition =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
          const msg = "Speech Recognition not supported in this browser. Try Chrome.";
          setError(msg);
          reject(new Error(msg));
          return;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = "en-US";

        let fullTranscript = "";
        const silenceGaps: number[] = [];
        let lastResultTime = Date.now();

        setIsAnalyzing(true);
        setError(null);

        recognition.onresult = (event: any) => {
          const now = Date.now();
          const gap = now - lastResultTime;
          if (gap > 1500) silenceGaps.push(gap);
          lastResultTime = now;

          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              fullTranscript += " " + event.results[i][0].transcript;
            }
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error !== "no-speech") {
            setError(`Recognition error: ${event.error}`);
          }
        };

        recognition.onend = () => {
          const text = fullTranscript.trim().toLowerCase();
          const words = text.split(/\s+/).filter(Boolean);
          const totalWords = words.length;
          const durationMin = durationSeconds / 60;
          const wpm = durationMin > 0 ? Math.round(totalWords / durationMin) : 0;

          // Filler words
          const fillerDetails: Record<string, number> = {};
          let fillerCount = 0;
          for (const filler of FILLER_WORDS) {
            const regex = new RegExp(`\\b${filler}\\b`, "gi");
            const matches = text.match(regex);
            const count = matches ? matches.length : 0;
            if (count > 0) fillerDetails[filler] = count;
            fillerCount += count;
          }
          const fillerPerMin = durationMin > 0 ? Math.round((fillerCount / durationMin) * 10) / 10 : 0;

          // Expressions matched
          const expressionsUsed = expressions.filter((expr) =>
            text.includes(expr.toLowerCase())
          );

          // Pause ratio
          const totalSilence = silenceGaps.reduce((a, b) => a + b, 0);
          const pauseRatio = durationSeconds > 0
            ? Math.round((totalSilence / 1000 / durationSeconds) * 100) / 100
            : 0;

          // Vocabulary richness
          const uniqueWords = new Set(words);
          const vocabularyRichness = totalWords > 0
            ? Math.round((uniqueWords.size / totalWords) * 100) / 100
            : 0;

          const analysisResult: AnalysisResult = {
            transcript: fullTranscript.trim(),
            totalWords,
            wordsPerMinute: wpm,
            fillerWordCount: fillerCount,
            fillerWordsPerMinute: fillerPerMin,
            fillerDetails,
            expressionsUsed,
            pauseRatio,
            vocabularyRichness,
          };

          setResult(analysisResult);
          setIsAnalyzing(false);
          resolve(analysisResult);
        };

        recognition.start();
      });
    },
    []
  );

  const stopAnalysis = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const startListening = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech Recognition not supported.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognitionRef.current = recognition;
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    let fullTranscript = "";
    const silenceGaps: number[] = [];
    let lastResultTime = Date.now();

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    recognition.onresult = (event: any) => {
      const now = Date.now();
      const gap = now - lastResultTime;
      if (gap > 1500) silenceGaps.push(gap);
      lastResultTime = now;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          fullTranscript += " " + event.results[i][0].transcript;
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== "no-speech") {
        setError(`Recognition error: ${event.error}`);
      }
    };

    // Store transcript builder on ref for later retrieval
    (recognition as any)._transcript = () => fullTranscript;
    (recognition as any)._silenceGaps = () => silenceGaps;

    recognition.start();
  }, []);

  const stopAndAnalyze = useCallback(
    (durationSeconds: number, expressions: string[] = []): AnalysisResult | null => {
      const recognition = recognitionRef.current;
      if (!recognition) return null;

      const text = ((recognition as any)._transcript?.() || "").trim().toLowerCase();
      const silenceGaps: number[] = (recognition as any)._silenceGaps?.() || [];

      recognition.stop();

      const words = text.split(/\s+/).filter(Boolean);
      const totalWords = words.length;
      const durationMin = durationSeconds / 60;
      const wpm = durationMin > 0 ? Math.round(totalWords / durationMin) : 0;

      const fillerDetails: Record<string, number> = {};
      let fillerCount = 0;
      for (const filler of FILLER_WORDS) {
        const regex = new RegExp(`\\b${filler}\\b`, "gi");
        const matches = text.match(regex);
        const count = matches ? matches.length : 0;
        if (count > 0) fillerDetails[filler] = count;
        fillerCount += count;
      }
      const fillerPerMin = durationMin > 0 ? Math.round((fillerCount / durationMin) * 10) / 10 : 0;

      const expressionsUsed = expressions.filter((expr) =>
        text.includes(expr.toLowerCase())
      );

      const totalSilence = silenceGaps.reduce((a, b) => a + b, 0);
      const pauseRatio = durationSeconds > 0
        ? Math.round((totalSilence / 1000 / durationSeconds) * 100) / 100
        : 0;

      const uniqueWords = new Set(words);
      const vocabularyRichness = totalWords > 0
        ? Math.round((uniqueWords.size / totalWords) * 100) / 100
        : 0;

      const analysisResult: AnalysisResult = {
        transcript: text,
        totalWords,
        wordsPerMinute: wpm,
        fillerWordCount: fillerCount,
        fillerWordsPerMinute: fillerPerMin,
        fillerDetails,
        expressionsUsed,
        pauseRatio,
        vocabularyRichness,
      };

      setResult(analysisResult);
      setIsAnalyzing(false);
      return analysisResult;
    },
    []
  );

  return { isAnalyzing, result, error, analyze, stopAnalysis, startListening, stopAndAnalyze };
}
