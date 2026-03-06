# Transcription Eval Harness

This folder contains assets for evaluating speech-to-text quality against references.

## Layout

- `eval/audio/*.wav|*.webm|*.mp3|*.m4a|*.ogg`: short evaluation clips.
- `eval/refs/*.txt`: reference transcript files.
- Matching is by basename:
  - `eval/audio/example.wav`
  - `eval/refs/example.txt`

## Included Sample

- `sample.wav` and `sample.txt` are lightweight placeholders for pipeline verification.
- Replace them with your own representative recordings for meaningful WER/CER results.

## Safety / Content Guidance

- Do not commit large files.
- Do not commit copyrighted third-party content without permission.
- Prefer short, original recordings (10-30s) and sanitized transcripts.

## Running Eval

1. Start backend API (recommended):
   - `npm run dev:server`
2. Run eval:
   - `npm run eval:stt`

Optional environment variables:
- `EVAL_TRANSCRIBE_URL` (default: `http://localhost:8787/api/transcribe`)
- `EVAL_LANGUAGE` (language hint)
- `TRANSCRIBE_MODEL` (same models as app server)

If endpoint is unavailable, script falls back to direct OpenAI transcription when `OPENAI_API_KEY` is set.

## Output

- CSV output: `eval/results.csv`
- Console summary:
  - mean / median WER
  - p90 latency
  - worst 5 examples
