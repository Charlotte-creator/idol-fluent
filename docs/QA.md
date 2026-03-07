# QA Test Plan

This document defines manual QA coverage for the ShadowSpeak app after migrating transcription from browser `SpeechRecognition` to backend `/api/transcribe`.

## Step 0: Timestamp Capability Note

Current end-to-end transcription payloads include:
- `text`
- `duration` (legacy seconds field)
- `segments` with `{ start, end, text, confidence? }` when timestamp mode is enabled

Gaps found and addressed:
- No stable `durationSeconds` field contract across STT/frontend parser.
- No explicit timestamp mode control.

New behavior:
- STT now supports `STT_TIMESTAMPS=none|segments|words` (default `segments`).
- STT returns `durationSeconds` and keeps `duration` for backward compatibility.
- Frontend parser normalizes `durationSeconds`/`duration`/`durationMs` into a stable `durationSeconds`.

## 1) Critical Flows + Acceptance Criteria

### Flow: Create Clip
1. Navigate to `/clip/new`.
2. Paste a valid YouTube URL.
3. Set valid segment range (`30-90s` duration).
4. Click `Save & Start Shadowing`.

Acceptance criteria:
- URL is parsed into video ID successfully.
- Save button is enabled only for valid duration.
- App navigates to `/clip/:id/shadow`.
- New clip is persisted in localStorage key `shadowspeak_clips`.

### Flow: Shadow Session
1. Open `/clip/:id/shadow`.
2. Complete environment check.
3. Continue through `watch -> countdown -> practice`.
4. Record audio and stop.
5. Wait for transcription to complete.
6. Open Dashboard.

Acceptance criteria:
- Countdown appears before practice phase.
- While transcription is in flight, UI shows transcribing status text.
- After completion, recording appears in the round list.
- Session is persisted under `shadowspeak_sessions` with:
  - `type: "shadow"`
  - `transcript` (non-empty on successful transcription)
  - computed metrics (`wordsPerMinute`, `fillerWordCount`, `pauseRatio`, etc.)
- Session is visible on Dashboard.

### Flow: Retell Session
1. Open `/clip/:id/retell`.
2. Choose time limit.
3. Click `Start Retelling`.
4. Stop recording before or at timer end.
5. Wait on analyzing/transcribing state.
6. Review results and click `Save & View Dashboard`.

Acceptance criteria:
- Timer updates during recording.
- After stop, app enters analyzing/transcribing state.
- Results screen shows transcript + metrics.
- Saved session appears on Dashboard with `type: "retell"`.
- No existing sessions are lost/corrupted.

### Flow: Session Detail
1. Open `/dashboard`.
2. Click a session row.
3. Verify detail page content.

Acceptance criteria:
- Transcript and metrics render correctly.
- Original clip embed loads with expected start/end time params.
- Navigation back to dashboard works.

## 2) Error + Edge Case Expectations

### Mic permission denied / no mic device / mic unavailable
Expected:
- Recording does not start.
- Clear error message is shown (e.g., microphone access denied).
- No session is saved.

### Very short recording (<1s) or silence
Expected:
- Short recordings may produce empty or low-quality transcript.
- If backend returns empty/invalid transcript, user sees transcription error message.
- Session is not saved unless flow completes with valid transcript result.

### Network offline
Expected:
- `/api/transcribe` request fails fast with clear error in UI.
- App remains responsive and user can retry recording.

### Backend 4xx validation errors
Examples:
- missing file field
- unsupported MIME
- payload too large

Expected:
- User-facing error is displayed from backend message.
- No crash, no partial session save.

### Backend 5xx errors (OpenAI auth/provider)
Expected:
- Clear error text shown to user.
- Existing clip/session data remains intact.
- Retry is possible after fixing backend issue.

### Transcription timeout
Expected:
- Timeout message shown to user.
- UI exits loading state and allows retry.

### Large file rejected (size limit)
Expected:
- Backend responds with explicit size-limit error.
- UI displays error without freezing.

### Unsupported MIME type
Expected:
- Backend responds with unsupported-format error.
- UI displays error and user can retry with valid recording.

## 3) Browser Matrix

Mic APIs (`getUserMedia` / `MediaRecorder`) require secure contexts:
- `https://` or `http://localhost`

Target matrix:
- Chrome (latest): required pass target.
- Edge (latest): required pass target.
- Safari (latest stable): verify `MediaRecorder` compatibility and basic flow.
- Firefox (latest): verify basic recording + upload behavior; note codec differences.

Notes:
- Since transcription is server-side, browser variance mainly affects recording capabilities and MIME codecs.
- Validate at least one full Shadow + Retell cycle in each supported browser.

## 4) Manual End-to-End Checklist

Preconditions:
- `npm run dev` running.
- `.env` configured with valid local STT settings (`STT_URL`, `WHISPER_MODEL`, etc.).

### Checklist
1. Home page loads, nav links work.
2. Create a clip via `/clip/new`.
3. Verify `localStorage.shadowspeak_clips` includes new clip object:
   - `id`, `videoId`, `title`, `startTime`, `endTime`, `createdAt`.
4. Complete one Shadow recording and wait for transcription.
5. Verify `localStorage.shadowspeak_sessions` has a new `shadow` session with:
   - `transcript`
   - metric fields (`wordsPerMinute`, `fillerWordCount`, `pauseRatio`, `vocabularyRichness`, `elongationCount`)
   - `date`, `durationSeconds`, `clipId`.
6. Complete one Retell recording and save results.
7. Verify second session exists with `type: "retell"` and `timeLimitMinutes`.
8. Open Dashboard:
   - both sessions listed
   - list ordering newest-first
   - charts render with chronological x-axis labels.
9. Open each session detail and verify transcript + metrics + embedded clip.
10. Reload app and verify data persists.

### Regression checks
- Existing sessions from pre-migration builds still render on Dashboard and Session Detail.
- No localStorage schema reset occurs.
