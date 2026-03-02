import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { getSessions, getClips } from "@/lib/clipStore";
import { BarChart3, Mic, Gauge, Flame, Plus } from "lucide-react";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { LineChart, Line, XAxis, YAxis, CartesianGrid } from "recharts";
import { format } from "date-fns";

const Dashboard = () => {
  const navigate = useNavigate();
  const sessions = getSessions();
  const clips = getClips();

  const clipMap = useMemo(() => {
    const map: Record<string, string> = {};
    clips.forEach((c) => (map[c.id] = c.title));
    return map;
  }, [clips]);

  const stats = useMemo(() => {
    if (sessions.length === 0) return null;
    const avgWpm = Math.round(sessions.reduce((a, s) => a + s.wordsPerMinute, 0) / sessions.length);
    const avgFillers = Math.round(
      (sessions.reduce((a, s) => a + s.fillerWordsPerMinute, 0) / sessions.length) * 10
    ) / 10;
    const uniqueClips = new Set(sessions.map((s) => s.clipId)).size;

    // Streak: consecutive days with sessions
    const dates = [...new Set(sessions.map((s) => format(new Date(s.date), "yyyy-MM-dd")))].sort().reverse();
    let streak = 0;
    const today = format(new Date(), "yyyy-MM-dd");
    let checkDate = new Date();
    for (const d of dates) {
      const expected = format(checkDate, "yyyy-MM-dd");
      if (d === expected) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else if (d < expected) {
        break;
      }
    }

    return { total: sessions.length, avgWpm, avgFillers, uniqueClips, streak };
  }, [sessions]);

  const chartData = useMemo(() => {
    // Filter out outliers (e.g. race condition producing 1300 WPM)
    const valid = sessions.filter((s) => s.wordsPerMinute <= 300);
    const grouped: Record<string, { retellWpm: number[]; shadowWpm: number[]; retellFillers: number[]; shadowFillers: number[] }> = {};
    for (const s of valid) {
      const key = format(new Date(s.date), "MMM d");
      if (!grouped[key]) grouped[key] = { retellWpm: [], shadowWpm: [], retellFillers: [], shadowFillers: [] };
      if (s.type === "retell") {
        grouped[key].retellWpm.push(s.wordsPerMinute);
        grouped[key].retellFillers.push(s.fillerWordsPerMinute);
      } else {
        grouped[key].shadowWpm.push(s.wordsPerMinute);
        grouped[key].shadowFillers.push(s.fillerWordsPerMinute);
      }
    }
    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : undefined;
    return Object.entries(grouped).map(([date, g]) => ({
      date,
      retellWpm: avg(g.retellWpm),
      shadowWpm: avg(g.shadowWpm),
      retellFillers: avg(g.retellFillers),
      shadowFillers: avg(g.shadowFillers),
    }));
  }, [sessions]);

  if (sessions.length === 0) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 text-center">
        <BarChart3 className="mx-auto h-12 w-12 text-muted-foreground" />
        <h2 className="mt-4 text-xl font-semibold text-foreground">No sessions yet</h2>
        <p className="mt-2 text-muted-foreground">
          Complete a retelling practice to see your progress here.
        </p>
        <Button className="mt-6" onClick={() => navigate("/clip/new")}>
          <Plus className="mr-1 h-4 w-4" /> Add Your First Clip
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Your Progress</h1>

      {/* Summary Cards */}
      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <Mic className="h-8 w-8 text-primary shrink-0" />
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Sessions</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <Gauge className="h-8 w-8 text-primary shrink-0" />
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.avgWpm}</p>
                <p className="text-sm text-muted-foreground">Avg WPM</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <BarChart3 className="h-8 w-8 text-destructive shrink-0" />
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.avgFillers}</p>
                <p className="text-sm text-muted-foreground">Avg Fillers/min</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <Flame className="h-8 w-8 text-primary shrink-0" />
              <div>
                <p className="text-2xl font-bold text-foreground">{stats.streak}</p>
                <p className="text-sm text-muted-foreground">Day Streak</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Charts */}
      {chartData.length >= 2 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Words Per Minute</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  retellWpm: { label: "Retell WPM", color: "hsl(var(--primary))" },
                  shadowWpm: { label: "Shadow WPM", color: "hsl(var(--muted-foreground))" },
                }}
                className="h-[200px]"
              >
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="retellWpm" stroke="var(--color-retellWpm)" strokeWidth={2} dot connectNulls />
                  <Line type="monotone" dataKey="shadowWpm" stroke="var(--color-shadowWpm)" strokeWidth={2} dot strokeDasharray="5 5" connectNulls />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Filler Words / Minute</CardTitle>
            </CardHeader>
            <CardContent>
              <ChartContainer
                config={{
                  retellFillers: { label: "Retell Fillers/min", color: "hsl(var(--destructive))" },
                  shadowFillers: { label: "Shadow Fillers/min", color: "hsl(var(--muted-foreground))" },
                }}
                className="h-[200px]"
              >
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line type="monotone" dataKey="retellFillers" stroke="var(--color-retellFillers)" strokeWidth={2} dot connectNulls />
                  <Line type="monotone" dataKey="shadowFillers" stroke="var(--color-shadowFillers)" strokeWidth={2} dot strokeDasharray="5 5" connectNulls />
                </LineChart>
              </ChartContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Session History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Session History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Clip</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>WPM</TableHead>
                <TableHead>Fillers</TableHead>
                <TableHead>Time Limit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...sessions].reverse().map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(s.date), "MMM d, yyyy")}
                  </TableCell>
                  <TableCell>{clipMap[s.clipId] || "Unknown"}</TableCell>
                  <TableCell>
                    <Badge variant={s.type === "retell" ? "default" : "secondary"}>
                      {s.type}
                    </Badge>
                  </TableCell>
                  <TableCell>{s.wordsPerMinute}</TableCell>
                  <TableCell>{s.fillerWordCount}</TableCell>
                  <TableCell>
                    {s.timeLimitMinutes ? `${s.timeLimitMinutes} min` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
