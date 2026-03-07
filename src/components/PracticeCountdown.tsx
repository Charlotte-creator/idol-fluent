import { Button } from "@/components/ui/button";

type PracticeCountdownProps = {
  seconds: number;
  title: string;
  subtitle?: string;
  cancelLabel?: string;
  onCancel?: () => void;
};

export function PracticeCountdown({
  seconds,
  title,
  subtitle,
  cancelLabel = "Cancel",
  onCancel,
}: PracticeCountdownProps) {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col items-center justify-center min-h-[60vh] text-center">
      <p className="text-sm text-muted-foreground mb-2">{subtitle}</p>
      <h2 className="text-2xl font-semibold text-foreground mb-6">{title}</h2>
      <div className="text-9xl font-bold text-primary animate-pulse">{seconds}</div>
      {onCancel && (
        <Button variant="outline" className="mt-8" onClick={onCancel}>
          {cancelLabel}
        </Button>
      )}
    </div>
  );
}
