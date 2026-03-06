# Idol Fluent

Idol Fluent is a speaking-practice app for shadowing and retelling short YouTube clips.
Audio is recorded in the browser and transcribed server-side using a self-hosted Whisper model (via [faster-whisper](https://github.com/SYSTRAN/faster-whisper)).

It helps learners track:
- words per minute
- filler words and filler rate
- hesitation/elongation patterns
- pause ratio
- vocabulary richness

All clip and session data is stored locally in the browser (`localStorage`).

## Tech Stack

- Vite
- React 18 + TypeScript
- Express + TypeScript API server
- Python FastAPI STT microservice (faster-whisper)
- Tailwind CSS
- shadcn/ui
- Vitest + Testing Library

## Quickstart (Docker — recommended)

```bash
cp .env.example .env
docker compose up --build
```

Open `http://localhost:8787`.

The first run downloads the Whisper model (~150 MB for `base`). Subsequent starts are instant thanks to a persistent volume.

### Model options

Set in `.env` or `docker-compose.yml`:

| Variable | Default | Options |
|---|---|---|
| `WHISPER_MODEL` | `base` | `tiny`, `base`, `small`, `medium`, `large-v3` |
| `WHISPER_DEVICE` | `cpu` | `cpu`, `cuda`, `auto` |
| `WHISPER_COMPUTE_TYPE` | `int8` | `int8` (CPU), `float16` (GPU), `float32` |

Larger models are more accurate but slower and use more RAM/VRAM.

## Quickstart (manual / development)

### 1. Start the STT service

```bash
cd stt
pip install -r requirements.txt
# Requires ffmpeg installed on your system
uvicorn main:app --host 0.0.0.0 --port 8000
```

### 2. Start the web app

```bash
npm install
cp .env.example .env
npm run dev
```

Open `http://localhost:8080`.

## Available Scripts

```bash
npm run dev          # run client + API server in watch mode
npm run dev:client   # run Vite client only
npm run dev:server   # run Express API server only
npm run build        # build client and server
npm run build:client # build frontend bundle
npm run build:server # compile backend TypeScript
npm run start        # run built API server (serves dist/ when available)
npm run preview      # preview production build
npm run test         # run unit tests
npx playwright install chromium # one-time browser install for e2e
npm run test:e2e     # run deterministic e2e tests
npm run test:e2e:ui  # run e2e tests in Playwright UI mode
npm run eval:stt     # run transcription eval harness (WER/CER + latency)
npm run lint         # run eslint
```

Dev-only debug route:
- Set `VITE_DEBUG=1` and open `/debug/transcribe` to upload audio, inspect raw response JSON, and compute WER/CER against a pasted reference transcript.

## Browser Requirements

Recording requires:
- a modern browser with `MediaRecorder` support
- microphone permission

## Limitations

- Transcription quality depends on audio quality, noise level, accent, and chosen model size.
- Pause detection prefers timestamped segments and falls back to heuristic gaps otherwise.
- YouTube embedding requires network access and playable video IDs.
- Data is local to the current browser profile; no cloud sync is included.

## Project Structure

- `src/pages`: application screens (`Shadow`, `Retell`, `Dashboard`, etc.)
- `src/hooks`: recording and transcription hooks
- `src/lib`: local storage, transcript parsing, and metric utilities
- `src/components`: UI and reusable view components
- `server/src`: Express API proxy (`POST /api/transcribe`)
- `stt/`: Python FastAPI STT microservice (faster-whisper + ffmpeg)
- `tests/e2e`: Playwright deterministic end-to-end tests
- `eval`: transcription evaluation assets and references
