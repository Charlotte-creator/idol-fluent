

## Build Full Practice Flow with Timed Retelling

This plan builds the complete practice ecosystem: URL upload, shadowing, retelling (with a user-chosen 2-5 minute time limit), and a progress dashboard. All data persists in localStorage.

---

### Architecture

```text
/                  -> Landing (existing, wire buttons to new routes)
/clip/new          -> URL Upload + Clip Selector (30-60s segment)
/clip/:id/shadow   -> Shadowing Practice (tips + record)
/clip/:id/retell   -> Retelling Practice (timed, with analysis)
/dashboard         -> Progress Dashboard (charts + history)
```

---

### 1. Data Layer -- `src/lib/clipStore.ts`

localStorage-based store with helpers:

- **Clips**: `{ id, videoId, title, startTime, endTime, createdAt }`
- **Sessions**: `{ id, clipId, type, date, wordsPerMinute, fillerWordCount, fillerWordsPerMinute, expressionsUsed[], durationSeconds, totalWords, pauseRatio, vocabularyRichness, timeLimitMinutes }`

---

### 2. Shared Hooks

**`src/hooks/useAudioRecorder.ts`** -- Microphone-only recording via MediaRecorder. Returns start/stop/blob/duration.

**`src/hooks/useSpeechAnalysis.ts`** -- Uses Web Speech API (SpeechRecognition) for client-side transcription. Calculates:
- Words per minute (WPM)
- Filler words count and per-minute rate ("um", "uh", "like", "you know", "so", "basically", "actually")
- Expressions matched from clip
- Pause ratio, vocabulary richness

---

### 3. Clip Selector Page -- `src/pages/ClipNew.tsx`

- YouTube URL input with video ID parsing
- Embedded player preview
- Start/end time inputs enforcing 30-60 second range
- Preview selected segment, then save to localStorage and navigate to shadow page

---

### 4. Shadow Page -- `src/pages/Shadow.tsx`

- Load clip by ID from store
- Show tips card first: "Focus on mimicking the speaker's tone, rhythm, and expressions"
- Play clip segment via YouTube player, then record user audio
- Allow multiple practice rounds with playback of recordings
- "Continue to Retelling" button

---

### 5. Retell Page -- `src/pages/Retell.tsx`

- Load clip by ID
- **Time limit selector**: User picks 2, 3, 4, or 5 minutes before starting (radio group or select dropdown, default 3 min)
- Instructions: "Retell what the speaker said in your own words. Try to use the same expressions."
- Recording with a **visible countdown timer** showing remaining time
- **Auto-stop recording** when timer reaches zero, with a warning at 30 seconds remaining
- On stop (manual or auto), run speech analysis and display results:
  - WPM, filler word count, filler words/min, expressions matched, pause ratio, vocabulary richness
- Save session (including chosen time limit) and navigate to dashboard

---

### 6. Dashboard -- `src/pages/Dashboard.tsx`

- Summary cards: total sessions, avg WPM, avg filler words/min, clips practiced, practice streak
- WPM trend line chart (Recharts)
- Filler words/min trend line chart
- Session history table with date, clip, type, WPM, fillers, time limit

---

### 7. Navigation -- `src/components/Navbar.tsx`

Simple top nav with links to Home, New Clip, Dashboard.

---

### 8. Routing -- `src/App.tsx`

Add all new routes and wrap pages with Navbar.

---

### 9. Landing Page Updates -- `src/pages/Index.tsx`

- "Try Shadowing This Video" saves the default Eileen Gu clip to store and navigates to `/clip/:id/shadow`
- "Use My Own YouTube URL" navigates to `/clip/new`

---

### Files to Create
- `src/lib/clipStore.ts`
- `src/hooks/useAudioRecorder.ts`
- `src/hooks/useSpeechAnalysis.ts`
- `src/pages/ClipNew.tsx`
- `src/pages/Shadow.tsx`
- `src/pages/Retell.tsx`
- `src/pages/Dashboard.tsx`
- `src/components/Navbar.tsx`

### Files to Modify
- `src/App.tsx` -- add routes and navbar
- `src/pages/Index.tsx` -- wire CTA buttons to navigation

