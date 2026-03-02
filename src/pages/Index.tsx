import { Card, CardContent } from "@/components/ui/card";
import { Play, Mic, BarChart3, ArrowRight, Eye, MessageCircle, Repeat, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Badge } from "@/components/ui/badge";

const STEPS = [
  { icon: Eye, num: "1", title: "Watch & Listen", desc: "Play the clip with subtitles on. Just listen the first time." },
  { icon: MessageCircle, num: "2", title: "Start Shadowing", desc: "Try to repeat what the speaker says. If you can't keep up sentence by sentence, go word by word. That's completely okay." },
  { icon: Repeat, num: "3", title: "Repeat 3–5 Times", desc: "Keep practicing until the clip feels comfortable and natural." },
];

const DAYS = [
  { label: "Day 1–2", desc: "Focus on keeping up with the speed. Don't worry about sounding perfect.", color: "bg-primary/10 text-primary" },
  { label: "Day 3+", desc: "Start matching the speaker's tone, rhythm, and expressions.", color: "bg-accent text-accent-foreground" },
];

const Index = () => {
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
              <h2 className="mb-1 text-2xl font-bold text-foreground">How to Shadow This Clip</h2>
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

        {/* Video */}
        <section className="mb-8">
          <Card className="overflow-hidden border-2 border-accent shadow-lg">
            <CardContent className="p-0">
              <AspectRatio ratio={16 / 9}>
                <iframe
                  className="h-full w-full"
                  src="https://www.youtube.com/embed/b-m2DntVdQU?start=112&end=210&rel=0&cc_load_policy=1"
                  title="Example speech clip"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </AspectRatio>
            </CardContent>
          </Card>
        </section>

        {/* CTA */}
        <section className="mb-14 text-center">
          <Button size="lg" className="gap-2 text-base">
            Start Shadowing <ArrowRight className="h-4 w-4" />
          </Button>
          <p className="mt-3 text-sm text-muted-foreground">
            Or paste your own YouTube URL
          </p>
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
      </main>
    </div>
  );
};

export default Index;
