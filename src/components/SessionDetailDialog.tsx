import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Gauge, MessageCircle, Repeat, Brain, BookOpen, Pause, Clock } from "lucide-react";
import { format } from "date-fns";
import type { Session } from "@/lib/clipStore";

interface SessionDetailDialogProps {
  session: Session | null;
  clipName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const MetricRow = ({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  unit?: string;
}) => (
  <div className="flex items-center gap-3 py-2">
    <div className="shrink-0">{icon}</div>
    <div className="flex-1">
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
    <p className="text-lg font-bold text-foreground">
      {value}
      {unit && <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span>}
    </p>
  </div>
);

export function SessionDetailDialog({ session, clipName, open, onOpenChange }: SessionDetailDialogProps) {
  if (!session) return null;

  const formatTime = (s: number) =>
    `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, "0")}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Session Details
            <Badge variant={session.type === "retell" ? "default" : "secondary"}>
              {session.type}
            </Badge>
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {clipName} · {format(new Date(session.date), "MMM d, yyyy h:mm a")}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Metrics */}
          <Card>
            <CardContent className="divide-y p-4">
              <MetricRow
                icon={<Gauge className="h-5 w-5 text-primary" />}
                label="Words per minute"
                value={session.wordsPerMinute}
                unit="WPM"
              />
              <MetricRow
                icon={<BookOpen className="h-5 w-5 text-primary" />}
                label="Total words"
                value={session.totalWords}
              />
              <MetricRow
                icon={<MessageCircle className="h-5 w-5 text-destructive" />}
                label="Filler words"
                value={session.fillerWordCount}
              />
              <MetricRow
                icon={<MessageCircle className="h-5 w-5 text-muted-foreground" />}
                label="Fillers / min"
                value={session.fillerWordsPerMinute}
              />
              <MetricRow
                icon={<Repeat className="h-5 w-5 text-primary" />}
                label="Hesitations"
                value={session.elongationCount}
              />
              <MetricRow
                icon={<Brain className="h-5 w-5 text-primary" />}
                label="Vocabulary richness"
                value={`${Math.round(session.vocabularyRichness * 100)}%`}
              />
              <MetricRow
                icon={<Pause className="h-5 w-5 text-muted-foreground" />}
                label="Pause ratio"
                value={`${Math.round(session.pauseRatio * 100)}%`}
              />
              <MetricRow
                icon={<Clock className="h-5 w-5 text-muted-foreground" />}
                label="Duration"
                value={formatTime(session.durationSeconds)}
              />
              {session.timeLimitMinutes && (
                <MetricRow
                  icon={<Clock className="h-5 w-5 text-muted-foreground" />}
                  label="Time limit"
                  value={`${session.timeLimitMinutes} min`}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}
