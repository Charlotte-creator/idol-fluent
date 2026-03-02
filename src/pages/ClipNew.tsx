import { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { ArrowRight, Play, AlertCircle } from "lucide-react";
import { parseVideoId, saveClip } from "@/lib/clipStore";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

const ClipNew = () => {
  const navigate = useNavigate();
  const [url, setUrl] = useState("");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const playerRef = useRef<any>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleUrlChange = (value: string) => {
    setUrl(value);
    setError(null);
    const id = parseVideoId(value);
    if (id) {
      setVideoId(id);
    } else if (value.length > 5) {
      setError("Could not parse YouTube video ID from this URL.");
    }
  };

  const duration = endTime - startTime;
  const isValidDuration = duration >= 30 && duration <= 60;

  const initPlayer = useCallback(() => {
    if (!videoId || !window.YT?.Player) return;
    if (playerRef.current) {
      playerRef.current.destroy();
    }
    playerRef.current = new window.YT.Player("clip-preview-player", {
      videoId,
      playerVars: { rel: 0, cc_load_policy: 1, modestbranding: 1 },
    });
  }, [videoId]);

  useEffect(() => {
    if (!videoId) return;
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
  }, [videoId, initPlayer]);

  const handlePreview = () => {
    if (!playerRef.current) return;
    playerRef.current.seekTo(startTime, true);
    playerRef.current.playVideo();
    setIsPreviewing(true);

    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const time = playerRef.current?.getCurrentTime?.();
      if (time && time >= endTime) {
        playerRef.current.pauseVideo();
        setIsPreviewing(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    }, 500);
  };

  const handleSave = () => {
    if (!videoId || !isValidDuration) return;
    const clip = saveClip({
      videoId,
      title: title || `Clip from ${videoId}`,
      startTime,
      endTime,
    });
    navigate(`/clip/${clip.id}/shadow`);
  };

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Card>
        <CardHeader>
          <CardTitle>Add a YouTube Clip</CardTitle>
          <CardDescription>Paste a YouTube URL and select a 30–60 second segment to practice.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* URL Input */}
          <div className="space-y-2">
            <Label htmlFor="url">YouTube URL</Label>
            <Input
              id="url"
              placeholder="https://www.youtube.com/watch?v=..."
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
            />
            {error && (
              <p className="flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-3 w-3" /> {error}
              </p>
            )}
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label htmlFor="title">Clip Title (optional)</Label>
            <Input
              id="title"
              placeholder="e.g. Eileen Gu on sports"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Video Preview */}
          {videoId && (
            <div className="space-y-4">
              <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-lg border">
                <div id="clip-preview-player" className="h-full w-full" />
              </AspectRatio>

              {/* Time Selector */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="start">Start Time (seconds)</Label>
                  <Input
                    id="start"
                    type="number"
                    min={0}
                    value={startTime}
                    onChange={(e) => setStartTime(Math.max(0, Number(e.target.value)))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end">End Time (seconds)</Label>
                  <Input
                    id="end"
                    type="number"
                    min={0}
                    value={endTime}
                    onChange={(e) => setEndTime(Math.max(0, Number(e.target.value)))}
                  />
                </div>
              </div>

              <p className={`text-sm ${isValidDuration ? "text-muted-foreground" : "text-destructive"}`}>
                Segment duration: {duration}s {!isValidDuration && "(must be 30–60 seconds)"}
              </p>

              <div className="flex gap-3">
                <Button variant="outline" onClick={handlePreview} disabled={!isValidDuration || isPreviewing}>
                  <Play className="mr-1 h-4 w-4" /> Preview Segment
                </Button>
                <Button onClick={handleSave} disabled={!isValidDuration}>
                  Save & Start Shadowing <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ClipNew;
