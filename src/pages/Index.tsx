import { Card, CardContent } from "@/components/ui/card";
import { Play, Mic, BarChart3, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AspectRatio } from "@/components/ui/aspect-ratio";

const STEPS = [
  { icon: Play, title: "Select", desc: "Pick a clip from someone you admire" },
  { icon: Mic, title: "Shadow", desc: "Mimic their tone & expressions" },
  { icon: BarChart3, title: "Track", desc: "See your fluency improve over time" },
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

        {/* Default Video Card */}
        <section className="mb-14">
          <Card className="overflow-hidden border-2 border-accent shadow-lg">
            <CardContent className="p-0">
              <AspectRatio ratio={16 / 9}>
                <iframe
                  className="h-full w-full"
                  src="https://www.youtube.com/embed/b-m2DntVdQU?start=112&end=210&rel=0"
                  title="Example speech clip"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </AspectRatio>
            </CardContent>
          </Card>
          <p className="mt-4 text-center text-sm font-medium text-muted-foreground">
            🎙️ Start by shadowing this clip — or paste your own YouTube URL
          </p>
        </section>

        {/* 3-Step Overview */}
        <section className="mb-14">
          <div className="grid gap-6 sm:grid-cols-3">
            {STEPS.map((step) => (
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

        {/* CTA */}
        <section className="text-center">
          <Button size="lg" className="gap-2 text-base">
            Get Started <ArrowRight className="h-4 w-4" />
          </Button>
        </section>
      </main>
    </div>
  );
};

export default Index;
