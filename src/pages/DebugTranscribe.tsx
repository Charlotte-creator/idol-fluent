import { useMemo, useState } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { parseTranscriptionResponse, type TranscriptionResponse } from "@/lib/transcription";
import { computeCer, computeWer } from "@/lib/errorRates";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const DebugTranscribe = () => {
  const [file, setFile] = useState<File | null>(null);
  const [language, setLanguage] = useState(navigator.language || "en-US");
  const [reference, setReference] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [responseJson, setResponseJson] = useState<TranscriptionResponse | null>(null);
  const [rawJson, setRawJson] = useState<unknown>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [serverTiming, setServerTiming] = useState<string | null>(null);
  const [modelHeader, setModelHeader] = useState<string | null>(null);

  const score = useMemo(() => {
    if (!reference.trim() || !responseJson?.text) return null;
    return {
      wer: computeWer(reference, responseJson.text),
      cer: computeCer(reference, responseJson.text),
    };
  }, [reference, responseJson]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!file) return;

    setIsSubmitting(true);
    setError(null);
    setResponseJson(null);
    setRawJson(null);
    setLatencyMs(null);
    setServerTiming(null);
    setModelHeader(null);

    const formData = new FormData();
    formData.append("audio", file);
    formData.append("language", language.trim());

    const startedAt = performance.now();
    try {
      const response = await fetch("/api/transcribe", {
        method: "POST",
        body: formData,
      });
      const parsedRaw = await response.json().catch(() => null);
      const latency = Math.round(performance.now() - startedAt);
      setLatencyMs(latency);
      setServerTiming(response.headers.get("server-timing"));
      setModelHeader(response.headers.get("x-transcribe-model"));

      if (!response.ok) {
        const message =
          parsedRaw && typeof parsedRaw === "object" && typeof (parsedRaw as { error?: unknown }).error === "string"
            ? (parsedRaw as { error: string }).error
            : `Request failed (${response.status})`;
        setError(message);
        setRawJson(parsedRaw);
        return;
      }

      setRawJson(parsedRaw);
      const parsed = parseTranscriptionResponse(parsedRaw);
      setResponseJson(parsed);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unknown request error.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Debug Transcription</CardTitle>
          <CardDescription>
            Dev-only route for inspecting `/api/transcribe` output and evaluating WER/CER.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="debug-file">Audio File</Label>
              <Input
                id="debug-file"
                type="file"
                accept="audio/*"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
              />
              {file && (
                <p className="text-xs text-muted-foreground">
                  {file.name} · {formatBytes(file.size)}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="debug-lang">Language Hint</Label>
              <Input
                id="debug-lang"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="en-US"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="debug-ref">Reference Transcript (optional)</Label>
              <Textarea
                id="debug-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                rows={4}
                placeholder="Paste reference transcript to compute WER/CER."
              />
            </div>

            <Button type="submit" disabled={!file || isSubmitting}>
              {isSubmitting ? "Transcribing..." : "Transcribe"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {(latencyMs != null || modelHeader || serverTiming) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Runtime Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            {modelHeader && <p>Model: {modelHeader}</p>}
            {latencyMs != null && <p>Client latency: {latencyMs} ms</p>}
            {file && <p>Request size: {formatBytes(file.size)}</p>}
            {responseJson?.duration != null && <p>Audio duration: {responseJson.duration}s</p>}
            {serverTiming && <p>Server-Timing: {serverTiming}</p>}
          </CardContent>
        </Card>
      )}

      {score && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Accuracy Scores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>WER: {(score.wer * 100).toFixed(2)}%</p>
            <p>CER: {(score.cer * 100).toFixed(2)}%</p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Response JSON</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="whitespace-pre-wrap rounded-md bg-muted p-3 text-xs">
            {JSON.stringify(rawJson, null, 2) || "No response yet."}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
};

export default DebugTranscribe;
