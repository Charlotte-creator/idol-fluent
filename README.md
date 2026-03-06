# Idol Fluent

Idol Fluent is a speaking-practice app for shadowing and retelling short YouTube clips.

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
- Tailwind CSS
- shadcn/ui
- Vitest + Testing Library

## Quickstart

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Available Scripts

```bash
npm run dev        # start dev server
npm run build      # production build
npm run preview    # preview production build
npm run test       # run unit tests
npm run lint       # run eslint
```

## Browser Requirements

Speech analysis depends on the Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`):

- Recommended: latest Chrome or Edge desktop
- Firefox/Safari support is limited or unavailable for this API
- Microphone permission must be granted

On-device recognition and contextual phrase biasing are experimental browser features and may not be available in all environments.

## Limitations

- Speech metrics are heuristic and may vary by accent, background noise, and mic quality.
- Transcript punctuation comes from browser recognition output and can affect filler classification.
- YouTube embedding requires network access and playable video IDs.
- Data is local to the current browser profile; no cloud sync is included.

## Project Structure

- `src/pages`: application screens (`Shadow`, `Retell`, `Dashboard`, etc.)
- `src/hooks`: recording and speech-analysis hooks
- `src/lib`: local storage and transcript metric utilities
- `src/components`: UI and reusable view components
