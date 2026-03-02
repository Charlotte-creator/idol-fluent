import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Mic, BarChart3, ArrowRight, Eye, MessageCircle, Repeat, Calendar, Link } from "lucide-react";
import { saveClip } from "@/lib/clipStore";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";

const CLIP_START = 0;
const CLIP_END = 89;
const VIDEO_ID = "XFtnidLC60Q";

const STEPS = [
  { icon: Eye, num: "1", title: "Watch & Listen", desc: "Play the clip with subtitles on. Just listen the first time." },
  { icon: MessageCircle, num: "2", title: "Start Shadowing", desc: "Try to repeat what the speaker says. If you can't keep up sentence by sentence, go word by word. That's completely okay." },
  { icon: Repeat, num: "3", title: "Repeat 3–5 Times", desc: "Keep practicing until the clip feels comfortable and natural." },
];

const DAYS = [
  { label: "Day 1–2", desc: "Focus on keeping up with the speed. Don't worry about sounding perfect.", color: "bg-primary/10 text-primary" },
  { label: "Day 3+", desc: "Start matching the speaker's tone, rhythm, and expressions.", color: "bg-accent text-accent-foreground" },
];

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

const useYouTubeClip = (containerId: string, shouldLoad: boolean) => {
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const initPlayer = useCallback(() => {
    if (!window.YT?.Player) return;
    playerRef.current = new window.YT.Player(containerId, {
      videoId: VIDEO_ID,
      playerVars: {
        start: CLIP_START,
        end: CLIP_END,
        rel: 0,
        cc_load_policy: 1,
        modestbranding: 1,
      },
      events: {
        onStateChange: (event: any) => {
          if (event.data === window.YT.PlayerState.PLAYING) {
            // Poll to enforce end time
            intervalRef.current = setInterval(() => {
              const time = playerRef.current?.getCurrentTime?.();
              if (time && time >= CLIP_END) {
                playerRef.current.pauseVideo();
                playerRef.current.seekTo(CLIP_START, true);
                if (intervalRef.current) clearInterval(intervalRef.current);
              }
            }, 500);
          } else {
            if (intervalRef.current) clearInterval(intervalRef.current);
          }
        },
      },
    });
  }, [containerId]);

  useEffect(() => {
    if (!shouldLoad) return;

    if (window.YT?.Player) {
      initPlayer();
      return;
    }

    // Load the API script if not yet loaded
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
  }, [shouldLoad, initPlayer]);
};

const Index = () => {
  const [showVideo, setShowVideo] = useState(false);
  const videoRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useYouTubeClip("yt-player", showVideo);

  const handleTryVideo = () => {
    const clip = saveClip({ videoId: VIDEO_ID, title: "Eileen Gu – Why Girls Should Try Sports", startTime: CLIP_START, endTime: CLIP_END });
    navigate(`/clip/${clip.id}/shadow`);
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-4xl px-4 py-12 sm:py-20">
        {/* Hero */}
        <section className="mb-12 text-center">
          <h1 className="mb-3 text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Speak like the people you admire
          </h1>
          <p className="mx-auto max-w-xl text-lg text-muted-foreground">
            Shadow great speakers, retell in your own words, and watch your fluency grow — one clip at a time.
          </p>
        </section>

        {/* Instruction Card */}
        <section className="mb-8">
          <Card className="border-2 border-accent bg-accent/20">
            <CardContent className="p-6 sm:p-8">
              <h2 className="mb-1 text-2xl font-bold text-foreground">How to Shadow a Clip</h2>
              <p className="mb-6 text-sm text-muted-foreground">Follow these steps — it's easier than you think!</p>

              <div className="space-y-4">
                {STEPS.map((step) => (
                  <div key={step.title} className="flex gap-4">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <step.icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground">{step.num}. {step.title}</h3>
                      <p className="text-sm text-muted-foreground">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Day-by-day progression */}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                {DAYS.map((day) => (
                  <div key={day.label} className="flex-1 rounded-lg bg-card p-4">
                    <div className="mb-1 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-primary" />
                      <Badge variant="secondary" className={day.color}>{day.label}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{day.desc}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Suggestion + CTA Buttons */}
        {!showVideo && (
          <section className="mb-14 text-center">
            <p className="mb-6 text-base text-muted-foreground">
              We suggest you start with <span className="font-semibold text-foreground">Eileen Gu's</span> video on why she encourages girls to try sports.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Button size="lg" className="gap-2 text-base" onClick={handleTryVideo}>
                Try Shadowing This Video <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" className="gap-2 text-base" onClick={() => navigate("/clip/new")}>
                <Link className="h-4 w-4" /> Use My Own YouTube URL
              </Button>
            </div>
          </section>
        )}

        {/* Video (shown after confirm) */}
        {showVideo && (
          <div ref={videoRef}>
            <section className="mb-8">
              <Card className="overflow-hidden border-2 border-accent shadow-lg">
                <CardContent className="p-0">
                  <AspectRatio ratio={16 / 9}>
                    <div id="yt-player" className="h-full w-full" />
                  </AspectRatio>
                </CardContent>
              </Card>
            </section>

            {/* 3-Step Overview */}
            <section className="mb-14">
              <div className="grid gap-6 sm:grid-cols-3">
                {[
                  { icon: Play, title: "Select", desc: "Pick a clip from someone you admire" },
                  { icon: Mic, title: "Shadow", desc: "Mimic their tone & expressions" },
                  { icon: BarChart3, title: "Track", desc: "See your fluency improve over time" },
                ].map((step) => (
                  <Card key={step.title} className="text-center">
                    <CardContent className="flex flex-col items-center gap-3 p-6">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                        <step.icon className="h-6 w-6 text-primary" />
                      </div>
                      <h3 className="text-lg font-semibold text-foreground">{step.title}</h3>
                      <p className="text-sm text-muted-foreground">{step.desc}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default Index;
