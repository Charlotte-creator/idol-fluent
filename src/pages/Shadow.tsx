import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";
import { Play, Mic, MicOff, Volume2, ArrowRight, Lightbulb } from "lucide-react";
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
  const [showTips, setShowTips] = useState(true);
  const [rounds, setRounds] = useState(0);
  const [recordings, setRecordings] = useState<string[]>([]);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const { isRecording, audioUrl, duration, error, start, stop } = useAudioRecorder();

  const initPlayer = useCallback(() => {
    if (!clip || !window.YT?.Player) return;
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
        onStateChange: (event: any) => {
          if (event.data === window.YT.PlayerState.PLAYING) {
            intervalRef.current = setInterval(() => {
              const time = playerRef.current?.getCurrentTime?.();
              if (time && time >= clip.endTime) {
                playerRef.current.pauseVideo();
                playerRef.current.seekTo(clip.startTime, true);
                if (intervalRef.current) clearInterval(intervalRef.current);
              }
            }, 500);
          } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
          }
        },
      },
    });
  }, [clip]);

  useEffect(() => {
    if (!clip || showTips) return;
    if (window.YT?.Player) {
      initPlayer();
      return;
    }
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(tag);
    }
    window.onYouTubeIframeAPIReady = initPlayer;
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      playerRef.current?.destroy?.();
    };
  }, [clip, showTips, initPlayer]);

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

  if (showTips) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-8">
        <Card className="border-2 border-primary/20">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              <CardTitle>Before You Start Shadowing</CardTitle>
            </div>
            <CardDescription>Tips to get the most out of your practice</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {[
                "Focus on mimicking the speaker's tone, rhythm, and expressions.",
                "Don't worry about being perfect — just try to keep up.",
                "If you can't follow sentence by sentence, go word by word.",
                "Pay attention to stressed words and intonation patterns.",
                "Practice 3–5 rounds for best results.",
              ].map((tip, i) => (
                <div key={i} className="flex items-start gap-3">
                  <Badge variant="secondary" className="mt-0.5 shrink-0">
                    {i + 1}
                  </Badge>
                  <p className="text-sm text-muted-foreground">{tip}</p>
                </div>
              ))}
            </div>
            <Button className="w-full" onClick={() => setShowTips(false)}>
              Got it, let's start! <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

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
      {rounds >= 1 && (
        <Button className="w-full" size="lg" onClick={() => navigate(`/clip/${id}/retell`)}>
          Continue to Retelling <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      )}
    </div>
  );
};

export default Shadow;
