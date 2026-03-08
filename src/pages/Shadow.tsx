import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertCircle,
  Play,
  Mic,
  MicOff,
  Volume2,
  ArrowRight,
  Headphones,
  VolumeX,
  CheckCircle2,
  Info,
} from "lucide-react";
import { getClip, saveSession } from "@/lib/clipStore";
import { useTranscription } from "@/hooks/useTranscription";
import { usePauseSensitivity } from "@/hooks/usePauseSensitivity";
import { SpeechRecognitionSettings } from "@/components/SpeechRecognitionSettings";
import { computeTranscriptMetrics } from "@/lib/speechMetrics";
import { PracticeCountdown } from "@/components/PracticeCountdown";
import { createShadowAutoRecorder } from "@/lib/shadowAutoRecorder";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

const Shadow = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const clipRaw = id ? getClip(id) : undefined;
  const clip = useMemo(() => clipRaw, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [phase, setPhase] = useState<"env-check" | "watch" | "countdown" | "practice">("env-check");
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);
  const [quietConfirmed, setQuietConfirmed] = useState(false);
  const [headphonesConfirmed, setHeadphonesConfirmed] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [rounds, setRounds] = useState(0);
  const [recordings, setRecordings] = useState<string[]>([]);
  const [playbackStatus, setPlaybackStatus] = useState<"recording" | "paused" | "analyzing">("paused");
  const [autoRecordError, setAutoRecordError] = useState<string | null>(null);
  const { pauseSensitivity, pauseThresholdSeconds, setPauseSensitivity } = usePauseSensitivity();
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerReadyRef = useRef(false);
  const isRecordingRef = useRef(false);
  const pendingPlayIntentRef = useRef(false);
  const stopRef = useRef<() => void>(() => {});

  const {
    isRecording,
    audioUrl,
    duration,
    error: transcriptionError,
    isTranscribing,
    language,
    setLanguage,
    startRecording,
    stopRecording,
    stopAndTranscribe,
  } = useTranscription();

  // Keep refs in sync
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { stopRef.current = stopRecording; }, [stopRecording]);

  const stopAndTranscribeRef = useRef(stopAndTranscribe);
  useEffect(() => { stopAndTranscribeRef.current = stopAndTranscribe; }, [stopAndTranscribe]);
  const languageRef = useRef(language);
  useEffect(() => { languageRef.current = language; }, [language]);

  const startRef = useRef(startRecording);
  useEffect(() => { startRef.current = startRecording; }, [startRecording]);

  const autoRecorderRef = useRef(
    createShadowAutoRecorder({
      isPracticePhase: () => phaseRef.current === "practice",
      isRecording: () => isRecordingRef.current,
      startRecording: () => startRef.current(),
      stopRecording: () => stopRef.current(),
    }),
  );

  const ensureRecordingForPlayback = useCallback(async () => {
    const outcome = await autoRecorderRef.current.onPlayerPlaying();
    if (outcome === "started") {
      setAutoRecordError(null);
      setPlaybackStatus("recording");
    } else if (outcome === "failed") {
      setAutoRecordError(
        "Microphone unavailable. Playback is still running. Retry microphone to record this take.",
      );
      setPlaybackStatus("paused");
    }
  }, []);

  const requestPlay = useCallback(() => {
    pendingPlayIntentRef.current = true;
    if (phaseRef.current === "countdown") return;
    if (!playerReadyRef.current) return;
    playerRef.current?.seekTo(clip?.startTime ?? 0, true);
    playerRef.current?.playVideo();
  }, [clip?.startTime]);

  const retryMicrophone = useCallback(() => {
    setAutoRecordError(null);
    requestPlay();
  }, [requestPlay]);

  const initPlayer = useCallback(() => {
    if (!clip || !window.YT?.Player) return;
    // Destroy previous player if exists
    if (playerRef.current?.destroy) {
      playerRef.current.destroy();
      playerRef.current = null;
    }
    playerReadyRef.current = false;
    playerRef.current = new window.YT.Player("shadow-player", {
      videoId: clip.videoId,
      playerVars: {
        start: clip.startTime,
        end: clip.endTime,
        rel: 0,
        cc_load_policy: 1,
        modestbranding: 1,
      },
      events: {
        onReady: () => {
          playerReadyRef.current = true;
          if (phaseRef.current === "watch") {
            playerRef.current?.seekTo(clip.startTime, true);
            playerRef.current?.playVideo();
            return;
          }
          if (phaseRef.current === "practice" && pendingPlayIntentRef.current) {
            pendingPlayIntentRef.current = false;
            playerRef.current?.seekTo(clip.startTime, true);
            playerRef.current?.playVideo();
          }
        },
        onStateChange: (event: any) => {
          const state = event.data;
          if (state === window.YT.PlayerState.PLAYING) {
            if (phaseRef.current === "practice") {
              void ensureRecordingForPlayback();
            }
            if (intervalRef.current) clearInterval(intervalRef.current);
            intervalRef.current = setInterval(() => {
              const time = playerRef.current?.getCurrentTime?.();
              if (time && time >= clip.endTime) {
                playerRef.current.pauseVideo();
                playerRef.current.seekTo(clip.startTime, true);
                if (intervalRef.current) clearInterval(intervalRef.current);
                if (phaseRef.current === "practice") {
                  autoRecorderRef.current.onPlayerPausedOrEnded();
                  setPlaybackStatus("paused");
                }
              }
            }, 500);
            return;
          }

          if (
            state === window.YT.PlayerState.PAUSED ||
            state === window.YT.PlayerState.ENDED
          ) {
            if (phaseRef.current === "practice") {
              autoRecorderRef.current.onPlayerPausedOrEnded();
              setPlaybackStatus("paused");
            }
          }

          if (
            state === window.YT.PlayerState.PAUSED ||
            state === window.YT.PlayerState.ENDED ||
            state === window.YT.PlayerState.BUFFERING
          ) {
            if (intervalRef.current) clearInterval(intervalRef.current);
          }
        },
      },
    });
  }, [clip, ensureRecordingForPlayback]);

  // Load YouTube API early (during env-check)
  useEffect(() => {
    if (!clip) return;
    if (window.YT?.Player) {
      return;
    }
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      playerRef.current?.destroy?.();
    };
  }, [clip]);

  // Init player when entering watch or practice phase
  useEffect(() => {
    if ((phase !== "watch" && phase !== "practice") || !clip) return;
    if (window.YT?.Player) {
      initPlayer();
    } else {
      window.onYouTubeIframeAPIReady = initPlayer;
    }
  }, [phase, clip, initPlayer]);

  // Countdown logic
  useEffect(() => {
    if (phase !== "countdown") return;
    if (countdown <= 0) {
      setPhase("practice");
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [phase, countdown]);

  useEffect(() => {
    if (phase !== "practice") return;
    if (isTranscribing) {
      setPlaybackStatus("analyzing");
      return;
    }
    setPlaybackStatus(isRecording ? "recording" : "paused");
  }, [phase, isRecording, isTranscribing]);

  // Save recording and speech metrics when audioUrl changes
  useEffect(() => {
    if (audioUrl && clip) {
      setRecordings((prev) => [...prev, audioUrl]);
      setRounds((prev) => prev + 1);
      // Compute actual duration from recording (duration state may be stale)
      const durationSeconds = duration;
      if (durationSeconds < 3) return;
      void (async () => {
        const transcription = await stopAndTranscribeRef.current({
          language: languageRef.current,
          durationSeconds,
        });
        if (!transcription) return;

        const metrics = computeTranscriptMetrics(
          transcription.text,
          transcription.durationSeconds ?? transcription.duration ?? durationSeconds,
          [],
          {
            segments: transcription.segments,
            pauseThresholdSeconds,
          },
        );
        saveSession({
          clipId: clip.id,
          type: "shadow",
          wordsPerMinute: metrics.wordsPerMinute,
          fillerWordCount: metrics.fillerWordCount,
          fillerWordsPerMinute: metrics.fillerWordsPerMinute,
          fillerRatePerMinute: metrics.fillerRatePerMinute,
          fillerCountStrong: metrics.fillerCountStrong,
          fillerCountContextual: metrics.fillerCountContextual,
          expressionsUsed: metrics.expressionsUsed,
          durationSeconds,
          totalWords: metrics.totalWords,
          pauseRatio: metrics.pauseRatio,
          pauseMethod: metrics.pauseMethod,
          silentPauseCount: metrics.silentPauseCount,
          silentPauseTotalSeconds: metrics.silentPauseTotalSeconds,
          silentPauseRatePerMinute: metrics.silentPauseRatePerMinute,
          silentPauseAvgSeconds: metrics.silentPauseAvgSeconds,
          silentPauseP95Seconds: metrics.silentPauseP95Seconds,
          longestSilentPauseSeconds: metrics.longestSilentPauseSeconds,
          silentPauseHistogram: metrics.silentPauseHistogram,
          choppinessCount: metrics.choppinessCount,
          vocabularyRichness: metrics.vocabularyRichness,
          elongationCount: metrics.elongationCount,
          repetitionCount: metrics.repetitionCount,
          repairCount: metrics.repairCount,
          transcript: transcription.text,
          sttDiagnostics: transcription.sttDiagnostics,
        });
      })();
    }
  }, [audioUrl, pauseThresholdSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Environment check phase
  if (phase === "env-check") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Shadow: {clip.title}</h1>
          <p className="text-sm text-muted-foreground">
            Clip: {clip.startTime}s – {clip.endTime}s
          </p>
        </div>

        <Card className="border-2 border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              Environment Check
            </CardTitle>
            <CardDescription>Make sure you're set up for the best practice experience.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-start gap-3">
              <Checkbox
                id="quiet"
                checked={quietConfirmed}
                onCheckedChange={(v) => setQuietConfirmed(v === true)}
              />
              <label htmlFor="quiet" className="cursor-pointer space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <VolumeX className="h-4 w-4" /> I'm in a quiet environment
                </div>
                <p className="text-xs text-muted-foreground">Background noise can affect speech recognition accuracy.</p>
              </label>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="headphones"
                checked={headphonesConfirmed}
                onCheckedChange={(v) => setHeadphonesConfirmed(v === true)}
              />
              <label htmlFor="headphones" className="cursor-pointer space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  <Headphones className="h-4 w-4" /> I have headphones on
                </div>
                <p className="text-xs text-muted-foreground">Headphones prevent the video audio from being picked up by your mic.</p>
              </label>
            </div>

            <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3">
              <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground">
                Tip: You can use the YouTube player's settings gear icon to slow down the playback speed if the speaker is too fast.
              </p>
            </div>

            <Button
              className="w-full"
              size="lg"
              disabled={!quietConfirmed || !headphonesConfirmed}
              onClick={() => {
                setPhase("watch");
              }}
            >
              I'm Ready <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>

        <SpeechRecognitionSettings
          language={language}
          onLanguageChange={setLanguage}
          pauseSensitivity={pauseSensitivity}
          onPauseSensitivityChange={setPauseSensitivity}
        />
      </div>
    );
  }

  // Watch phase
  if (phase === "watch") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Watch: {clip.title}</h1>
          <p className="text-sm text-muted-foreground">
            Clip: {clip.startTime}s – {clip.endTime}s
          </p>
        </div>

        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <AspectRatio ratio={16 / 9}>
              <div id="shadow-player" className="h-full w-full" />
            </AspectRatio>
          </CardContent>
        </Card>

        <Button
          variant="outline"
          className="w-full"
          onClick={requestPlay}
        >
          <Play className="mr-1 h-4 w-4" /> Play Clip Again
        </Button>

        <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <p className="text-xs text-muted-foreground">
            Watch the clip as many times as you need. When you're ready, hit Start Shadowing.
          </p>
        </div>

        <Button
          className="w-full"
          size="lg"
          onClick={() => {
            // Destroy watch player before transitioning
            if (playerRef.current?.destroy) {
              playerRef.current.destroy();
              playerRef.current = null;
              playerReadyRef.current = false;
            }
            pendingPlayIntentRef.current = true;
            setAutoRecordError(null);
            setCountdown(3);
            setPhase("countdown");
          }}
        >
          Start Shadowing <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    );
  }

  // Countdown phase
  if (phase === "countdown") {
    return (
      <PracticeCountdown
        seconds={countdown}
        title="Get ready to shadow"
        subtitle="Playback and recording will start automatically."
        cancelLabel="Play when countdown ends"
        onCancel={() => {
          pendingPlayIntentRef.current = true;
        }}
      />
    );
  }

  // Practice phase
  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const isLikelyMicrophoneError = (message: string) =>
    /(microphone|permission|device|audio capture|getusermedia)/i.test(message);
  const micError =
    autoRecordError ||
    (transcriptionError && isLikelyMicrophoneError(transcriptionError) ? transcriptionError : null);
  const transcriptionIssue =
    transcriptionError && !isLikelyMicrophoneError(transcriptionError) ? transcriptionError : null;

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Shadow: {clip.title}</h1>
        <p className="text-sm text-muted-foreground">
          Clip: {clip.startTime}s – {clip.endTime}s · Round {rounds + 1}
        </p>
      </div>

      {/* Video Player */}
      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <AspectRatio ratio={16 / 9}>
            <div id="shadow-player" className="h-full w-full" />
          </AspectRatio>
        </CardContent>
      </Card>

      {/* Play Clip */}
      <Button
        variant="outline"
        className="w-full"
        onClick={requestPlay}
      >
        <Play className="mr-1 h-4 w-4" /> Play Clip (Auto Record)
      </Button>

      {/* Recording Controls */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">Your Recording</h3>
              <p className="text-sm text-muted-foreground">
                {playbackStatus === "recording"
                  ? `Recording... ${formatTime(duration)}`
                  : playbackStatus === "analyzing"
                    ? "Analyzing..."
                    : "Paused"}
              </p>
            </div>
            <Button
              variant={isRecording ? "destructive" : "outline"}
              onClick={isRecording ? stopRecording : (micError ? retryMicrophone : requestPlay)}
            >
              {isRecording ? (
                <>
                  <MicOff className="mr-1 h-4 w-4" /> Stop
                </>
              ) : (
                <>
                  {micError ? (
                    <>
                      <Mic className="mr-1 h-4 w-4" /> Retry microphone
                    </>
                  ) : (
                    <>
                      <Play className="mr-1 h-4 w-4" /> Play clip
                    </>
                  )}
                </>
              )}
            </Button>
          </div>
          {micError && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-2">
                  <p>{micError}</p>
                  <Button variant="outline" size="sm" onClick={retryMicrophone}>
                    Retry microphone
                  </Button>
                </div>
              </div>
            </div>
          )}
          {transcriptionIssue && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="space-y-2">
                  <p>{transcriptionIssue}</p>
                  <Button variant="outline" size="sm" onClick={requestPlay}>
                    Retry take
                  </Button>
                </div>
              </div>
            </div>
          )}
          {isTranscribing && (
            <p className="text-xs text-muted-foreground">Transcribing latest recording...</p>
          )}
        </CardContent>
      </Card>

      {/* Past Recordings */}
      {recordings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your Recordings ({recordings.length})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recordings.map((rec, i) => (
              <div key={i} className="flex items-center gap-3">
                <Volume2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground">Round {i + 1}</span>
                <audio src={rec} controls className="h-8 flex-1" />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Continue */}
      {rounds < 3 && rounds > 0 && (
        <p className="text-sm text-muted-foreground text-center">
          {3 - rounds} more round{3 - rounds > 1 ? "s" : ""} to unlock retelling
        </p>
      )}
      {rounds >= 3 && (
        <Button className="w-full" size="lg" onClick={() => navigate(`/clip/${id}/retell`)}>
          Continue to Retelling <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

export default Shadow;
