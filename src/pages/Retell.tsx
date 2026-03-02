import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  Mic,
  MicOff,
  Clock,
  AlertTriangle,
  BarChart3,
  ArrowRight,
  MessageCircle,
  Brain,
  Gauge,
  BookOpen,
  TrendingUp,
  Pause,
  Repeat,
} from "lucide-react";
import { getClip, saveSession } from "@/lib/clipStore";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";
import { useSpeechAnalysis, type AnalysisResult } from "@/hooks/useSpeechAnalysis";

const TIME_OPTIONS = [2, 3, 4, 5];

const Retell = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const clip = id ? getClip(id) : undefined;

  const [timeLimit, setTimeLimit] = useState(3);
  const [phase, setPhase] = useState<"setup" | "recording" | "results">("setup");
  const [remaining, setRemaining] = useState(0);
  const [warning, setWarning] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { isRecording, audioUrl, duration, error, start, stop } = useAudioRecorder();
  const { startListening, stopAndAnalyze, error: speechError } = useSpeechAnalysis();

  const handleStart = useCallback(async () => {
    setPhase("recording");
    setRemaining(timeLimit * 60);
    setWarning(false);
    startListening();
    await start();

    timerRef.current = setInterval(() => {
      setRemaining((prev) => {
        const next = prev - 1;
        if (next <= 30 && next > 0) setWarning(true);
        if (next <= 0) {
          // Auto-stop
          stop();
          if (timerRef.current) clearInterval(timerRef.current);
          return 0;
        }
        return next;
      });
    }, 1000);
  }, [timeLimit, start, stop, startListening]);

  const handleStop = useCallback(() => {
    stop();
    if (timerRef.current) clearInterval(timerRef.current);
  }, [stop]);

  // When recording stops, analyze
  useEffect(() => {
    if (phase === "recording" && !isRecording && duration > 0) {
      const result = stopAndAnalyze(duration);
      if (result) {
        setAnalysisResult(result);
      }
      setPhase("results");
    }
  }, [isRecording, phase, duration, stopAndAnalyze]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const handleSave = () => {
    if (!clip || !analysisResult) return;
    saveSession({
      clipId: clip.id,
      type: "retell",
      wordsPerMinute: analysisResult.wordsPerMinute,
      fillerWordCount: analysisResult.fillerWordCount,
      fillerWordsPerMinute: analysisResult.fillerWordsPerMinute,
      expressionsUsed: analysisResult.expressionsUsed,
      durationSeconds: duration,
      totalWords: analysisResult.totalWords,
      pauseRatio: analysisResult.pauseRatio,
      vocabularyRichness: analysisResult.vocabularyRichness,
      elongationCount: analysisResult.elongationCount,
      timeLimitMinutes: timeLimit,
    });
    navigate("/dashboard");
  };

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  if (!clip) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h2 className="text-xl font-semibold text-foreground">Clip not found</h2>
        <Button className="mt-4" onClick={() => navigate("/clip/new")}>
          Add a new clip
        </Button>
      </div>
    );
  }

  // Setup phase
  if (phase === "setup") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Retell: {clip.title}</h1>
          <p className="text-sm text-muted-foreground">
            Retell what the speaker said in your own words. Try to use the same expressions.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" /> Choose Your Time Limit
            </CardTitle>
            <CardDescription>How long do you want to speak?</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={String(timeLimit)}
              onValueChange={(v) => setTimeLimit(Number(v))}
              className="flex gap-4"
            >
              {TIME_OPTIONS.map((t) => (
                <div key={t} className="flex items-center gap-2">
                  <RadioGroupItem value={String(t)} id={`time-${t}`} />
                  <Label htmlFor={`time-${t}`} className="cursor-pointer">
                    {t} min
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </CardContent>
        </Card>

        <Button size="lg" className="w-full" onClick={handleStart}>
          <Mic className="mr-1 h-4 w-4" /> Start Retelling ({timeLimit} min)
        </Button>
      </div>
    );
  }

  // Recording phase
  if (phase === "recording") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground">Retelling...</h1>
          <p className="text-sm text-muted-foreground">Speak naturally. Use expressions from the clip.</p>
        </div>

        {/* Timer */}
        <Card className={`text-center ${warning ? "border-destructive" : ""}`}>
          <CardContent className="py-8">
            <div
              className={`text-6xl font-mono font-bold ${
                warning ? "text-destructive animate-pulse" : "text-foreground"
              }`}
            >
              {formatTime(remaining)}
            </div>
            {warning && (
              <div className="mt-3 flex items-center justify-center gap-2 text-destructive">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-medium">Less than 30 seconds remaining!</span>
              </div>
            )}
            <p className="mt-2 text-sm text-muted-foreground">
              Elapsed: {formatTime(duration)}
            </p>
          </CardContent>
        </Card>

        <Button
          variant="destructive"
          size="lg"
          className="w-full"
          onClick={handleStop}
        >
          <MicOff className="mr-1 h-4 w-4" /> Stop Recording
        </Button>

        {error && <p className="text-sm text-destructive text-center">{error}</p>}
        {speechError && <p className="text-sm text-destructive text-center">{speechError}</p>}
      </div>
    );
  }

  // Results phase
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Your Results</h1>
        <p className="text-sm text-muted-foreground">
          {clip.title} · {formatTime(duration)} recorded
        </p>
      </div>

      {/* Playback */}
      {audioUrl && (
        <Card>
          <CardContent className="p-4">
            <audio src={audioUrl} controls className="w-full" />
          </CardContent>
        </Card>
      )}

      {/* Metrics */}
      {analysisResult && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <Gauge className="h-8 w-8 text-primary shrink-0" />
              <div>
                <p className="text-2xl font-bold text-foreground">{analysisResult.wordsPerMinute}</p>
                <p className="text-sm text-muted-foreground">Words per minute</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <MessageCircle className="h-8 w-8 text-destructive shrink-0" />
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {analysisResult.fillerWordCount}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({analysisResult.fillerWordsPerMinute}/min)
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">Filler words</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <Brain className="h-8 w-8 text-primary shrink-0" />
              <div>
                <p className="text-2xl font-bold text-foreground">
                  {Math.round(analysisResult.vocabularyRichness * 100)}%
                </p>
                <p className="text-sm text-muted-foreground">Vocabulary richness</p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <BookOpen className="h-8 w-8 text-primary shrink-0" />
              <div>
                <p className="text-2xl font-bold text-foreground">{analysisResult.totalWords}</p>
                <p className="text-sm text-muted-foreground">Total words spoken</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filler word breakdown */}
      {analysisResult && Object.keys(analysisResult.fillerDetails).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Filler Word Breakdown</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(analysisResult.fillerDetails).map(([word, count]) => (
              <Badge key={word} variant="secondary">
                "{word}" × {count}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Elongation breakdown */}
      {analysisResult && Object.keys(analysisResult.elongationDetails).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Repeat className="h-5 w-5 text-primary" /> Elongations Detected
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(analysisResult.elongationDetails).map(([word, count]) => (
              <Badge key={word} variant="secondary">
                "{word}" × {count}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Room for Improvement */}
      {analysisResult && (
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" /> Room for Improvement
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {analysisResult.wordsPerMinute > 0 && analysisResult.wordsPerMinute < 120 && (
              <div className="flex items-start gap-2 text-sm">
                <Gauge className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-muted-foreground">Your pace ({analysisResult.wordsPerMinute} WPM) is a bit slow. Aim for 120–160 WPM for natural conversation.</p>
              </div>
            )}
            {analysisResult.wordsPerMinute > 160 && (
              <div className="flex items-start gap-2 text-sm">
                <Gauge className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-muted-foreground">Your pace ({analysisResult.wordsPerMinute} WPM) is quite fast. Try slowing down for clarity.</p>
              </div>
            )}
            {analysisResult.wordsPerMinute >= 120 && analysisResult.wordsPerMinute <= 160 && (
              <div className="flex items-start gap-2 text-sm">
                <Gauge className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <p className="text-muted-foreground">Great pace! {analysisResult.wordsPerMinute} WPM is in the natural conversation range.</p>
              </div>
            )}
            {analysisResult.fillerWordCount > 5 && (
              <div className="flex items-start gap-2 text-sm">
                <MessageCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                <p className="text-muted-foreground">Try to reduce filler words — you used {analysisResult.fillerWordCount}. Target: as few as possible.</p>
              </div>
            )}
            {analysisResult.pauseRatio > 0.3 && (
              <div className="flex items-start gap-2 text-sm">
                <Pause className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-muted-foreground">You paused for {Math.round(analysisResult.pauseRatio * 100)}% of the time. Try to keep your flow steady.</p>
              </div>
            )}
            {analysisResult.elongationCount > 0 && (
              <div className="flex items-start gap-2 text-sm">
                <Repeat className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-muted-foreground">You elongated {analysisResult.elongationCount} word(s). Keep words crisp for clarity.</p>
              </div>
            )}
            {analysisResult.fillerWordCount <= 5 && analysisResult.pauseRatio <= 0.3 && analysisResult.elongationCount === 0 && (
              <p className="text-sm text-primary font-medium">Looking good! Keep practicing to maintain this quality.</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Transcript */}
      {analysisResult?.transcript && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Transcript</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {analysisResult.transcript}
            </p>
          </CardContent>
        </Card>
      )}

      <Button size="lg" className="w-full" onClick={handleSave}>
        <BarChart3 className="mr-1 h-4 w-4" /> Save & View Dashboard <ArrowRight className="ml-1 h-4 w-4" />
      </Button>
    </div>
  );
};

export default Retell;
