import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Play,
  Mic,
  MicOff,
  Volume2,
  ArrowRight,
  Headphones,
  VolumeX,
  CheckCircle2,
} from "lucide-react";
import { getClip } from "@/lib/clipStore";
import { useAudioRecorder } from "@/hooks/useAudioRecorder";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

const Shadow = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const clip = id ? getClip(id) : undefined;

  const [phase, setPhase] = useState<"env-check" | "countdown" | "practice">("env-check");
  const [quietConfirmed, setQuietConfirmed] = useState(false);
  const [headphonesConfirmed, setHeadphonesConfirmed] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [rounds, setRounds] = useState(0);
  const [recordings, setRecordings] = useState<string[]>([]);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const playerReadyRef = useRef(false);
  const isRecordingRef = useRef(false);
  const stopRef = useRef<() => void>(() => {});

  const { isRecording, audioUrl, duration, error, start, stop } = useAudioRecorder();

  // Keep refs in sync
  useEffect(() => { isRecordingRef.current = isRecording; }, [isRecording]);
  useEffect(() => { stopRef.current = stop; }, [stop]);

  const startRef = useRef(start);
  useEffect(() => { startRef.current = start; }, [start]);

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
          // Auto-play and auto-record on first load
          playerRef.current?.seekTo(clip.startTime, true);
          playerRef.current?.playVideo();
          startRef.current();
        },
        onStateChange: (event: any) => {
          if (event.data === window.YT.PlayerState.PLAYING) {
            intervalRef.current = setInterval(() => {
              const time = playerRef.current?.getCurrentTime?.();
              if (time && time >= clip.endTime) {
                playerRef.current.pauseVideo();
                playerRef.current.seekTo(clip.startTime, true);
                if (intervalRef.current) clearInterval(intervalRef.current);
                if (isRecordingRef.current) stopRef.current();
              }
            }, 500);
          } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
          }
        },
      },
    });
  }, [clip]);

  // Load YouTube API early (during env-check)
  useEffect(() => {
    if (!clip) return;
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

  // Init player when entering practice phase
  useEffect(() => {
    if (phase !== "practice" || !clip) return;
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

  // (Auto-play and recording are triggered by onReady in initPlayer)

  // Save recording when audioUrl changes
  useEffect(() => {
    if (audioUrl) {
      setRecordings((prev) => [...prev, audioUrl]);
      setRounds((prev) => prev + 1);
    }
  }, [audioUrl]);

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

            <Button
              className="w-full"
              size="lg"
              disabled={!quietConfirmed || !headphonesConfirmed}
              onClick={() => {
                setCountdown(3);
                setPhase("countdown");
              }}
            >
              I'm Ready <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Countdown phase
  if (phase === "countdown") {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-sm text-muted-foreground mb-4">Get ready to shadow...</p>
        <div className="text-9xl font-bold text-primary animate-pulse">
          {countdown}
        </div>
      </div>
    );
  }

  // Practice phase
  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

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
        onClick={() => {
          playerRef.current?.seekTo(clip.startTime, true);
          playerRef.current?.playVideo();
        }}
      >
        <Play className="mr-1 h-4 w-4" /> Play Clip Again
      </Button>

      {/* Recording Controls */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-foreground">Your Recording</h3>
              <p className="text-sm text-muted-foreground">
                {isRecording ? `Recording... ${formatTime(duration)}` : "Ready to record"}
              </p>
            </div>
            <Button
              variant={isRecording ? "destructive" : "default"}
              onClick={isRecording ? stop : start}
            >
              {isRecording ? (
                <>
                  <MicOff className="mr-1 h-4 w-4" /> Stop
                </>
              ) : (
                <>
                  <Mic className="mr-1 h-4 w-4" /> Record
                </>
              )}
            </Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
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
