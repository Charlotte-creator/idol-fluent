import { useParams, useNavigate } from "react-router-dom";
import { getSessions, getClip } from "@/lib/clipStore";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import {
  ArrowLeft,
  Gauge,
  MessageSquare,
  Clock,
  Brain,
  Pause,
  BookOpen,
  AlertTriangle,
  Timer,
} from "lucide-react";
import { format } from "date-fns";

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.round(s % 60);
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
};

const MetricCard = ({ icon: Icon, label, value, unit }: { icon: any; label: string; value: string | number; unit?: string }) => (
  <Card>
    <CardContent className="flex items-center gap-3 p-4">
      <Icon className="h-5 w-5 text-primary shrink-0" />
      <div>
        <p className="text-lg font-bold text-foreground">{value}{unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </CardContent>
  </Card>
);

const SessionDetail = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const session = getSessions().find((s) => s.id === sessionId);
  const clip = session ? getClip(session.clipId) : undefined;

  if (!session) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12 text-center">
        <h2 className="text-xl font-semibold text-foreground">Session not found</h2>
        <Button className="mt-4" onClick={() => navigate("/dashboard")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to Dashboard
        </Button>
      </div>
    );
  }

  const pauseMethodLabel =
    session.pauseMethod === "timestamps"
      ? "timestamp gaps from STT segments"
      : session.pauseMethod === "text"
        ? "text fallback estimates"
        : "legacy session metric (no pause method metadata)";

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 space-y-6">
      <Button variant="ghost" size="sm" onClick={() => navigate("/dashboard")}>
        <ArrowLeft className="mr-1 h-4 w-4" /> Dashboard
      </Button>

      <div className="flex items-center gap-3">
        <Badge variant={session.type === "retell" ? "default" : "secondary"}>
          {session.type}
        </Badge>
        <h1 className="text-2xl font-bold text-foreground">{clip?.title || "Unknown Clip"}</h1>
      </div>
      <p className="text-sm text-muted-foreground">
        {format(new Date(session.date), "MMMM d, yyyy 'at' h:mm a")}
      </p>

      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        {/* Left column – metrics & transcript */}
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <MetricCard icon={Gauge} label="Words Per Minute" value={session.wordsPerMinute} unit="WPM" />
            <MetricCard icon={MessageSquare} label="Total Words" value={session.totalWords} />
            <MetricCard icon={AlertTriangle} label="Filler Words" value={session.fillerWordCount} />
            <MetricCard icon={AlertTriangle} label="Fillers / Minute" value={Math.round(session.fillerWordsPerMinute * 10) / 10} unit="/min" />
            <MetricCard icon={AlertTriangle} label="Strong Fillers" value={session.fillerCountStrong ?? "—"} />
            <MetricCard icon={AlertTriangle} label="Contextual Fillers" value={session.fillerCountContextual ?? "—"} />
            <MetricCard icon={Pause} label="Hesitations" value={session.elongationCount} />
            <MetricCard icon={Pause} label="Silent Pauses / Minute" value={session.silentPauseRatePerMinute ?? "—"} unit="/min" />
            <MetricCard icon={Pause} label="Longest Silent Pause" value={session.longestSilentPauseSeconds != null ? session.longestSilentPauseSeconds : "—"} unit={session.longestSilentPauseSeconds != null ? "s" : undefined} />
            <MetricCard icon={Pause} label="Total Silent Pause" value={session.silentPauseTotalSeconds != null ? session.silentPauseTotalSeconds : "—"} unit={session.silentPauseTotalSeconds != null ? "s" : undefined} />
            <MetricCard icon={Brain} label="Vocabulary Richness" value={`${Math.round(session.vocabularyRichness * 100)}%`} />
            <MetricCard icon={BookOpen} label="Pause Ratio" value={`${Math.round(session.pauseRatio * 100)}%`} />
            <MetricCard icon={Clock} label="Duration" value={formatTime(session.durationSeconds)} />
            <MetricCard icon={MessageSquare} label="Repetitions" value={session.repetitionCount ?? "—"} />
            <MetricCard icon={MessageSquare} label="Repairs" value={session.repairCount ?? "—"} />
            {session.timeLimitMinutes && (
              <MetricCard icon={Timer} label="Time Limit" value={`${session.timeLimitMinutes} min`} />
            )}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">How It's Measured</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Pause metrics are calculated via {pauseMethodLabel}.
              </p>
            </CardContent>
          </Card>

          {session.expressionsUsed.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Expressions Used</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {session.expressionsUsed.map((e, i) => (
                  <Badge key={i} variant="outline">{e}</Badge>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Your Transcript</CardTitle>
            </CardHeader>
            <CardContent>
              {session.transcript ? (
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{session.transcript}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No transcript available for this session.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column – video */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          {clip ? (
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="text-lg">Original Clip</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <AspectRatio ratio={16 / 9}>
                  <iframe
                    className="h-full w-full"
                    src={`https://www.youtube.com/embed/${clip.videoId}?start=${Math.floor(clip.startTime)}&end=${Math.floor(clip.endTime)}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    title="Original clip"
                  />
                </AspectRatio>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-6 text-center text-sm text-muted-foreground">
                Original clip not found.
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};

export default SessionDetail;
