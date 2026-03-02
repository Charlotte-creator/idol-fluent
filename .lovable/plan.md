

## Plan: Elongation Detection, Performance Metrics on Results, and Shadow Page Environment Check

### 1. Count Elongations in Speech Analysis

**File: `src/hooks/useSpeechAnalysis.ts`**

- Add elongation detection logic that identifies words with repeated vowels/consonants (e.g., "sooo", "ummmm", "yeahhh", "wellll") in the transcript.
- Use a regex pattern like `/\b\w*([a-z])\1{2,}\w*\b/gi` to catch words with 3+ repeated characters.
- Add `elongationCount` and `elongationDetails` (word -> count map) to the `AnalysisResult` interface.
- Compute elongations in both the `analyze` and `stopAndAnalyze` functions.

**Note:** Web Speech API often normalizes elongations (e.g., "sooo" becomes "so"), so detection may be limited. We'll still include the logic for cases where it does come through, and display it alongside filler words.

### 2. Show Performance Metrics on the Retell Results Page

**File: `src/pages/Retell.tsx`**

On the results phase, add a new card section titled something like "Room for Improvement" that shows:
- **Elongation count** (new metric from above)
- **Pause ratio** (already computed but not displayed) — shows how much silence vs. speaking
- **Filler words per minute** (already shown, but can be contextualized with a "target: 0" indicator)
- A brief qualitative summary (e.g., "Your pace is good" if WPM is 120-160, "Try to reduce filler words" if filler count > 5)

This gives users actionable feedback right after their retelling.

### 3. Shadow Page: Environment Check + Countdown + Auto-Play/Record

**File: `src/pages/Shadow.tsx`**

Replace the current immediate-load flow with a phased approach:

- **Phase 1 — Environment Check**: Show a card asking the user to confirm:
  - "Are you in a quiet environment?"
  - "Do you have headphones on?"
  - A single "I'm Ready" button (with checkboxes or just a confirmation button)
  
- **Phase 2 — Countdown**: After confirmation, show a 3-2-1 countdown overlay/animation.

- **Phase 3 — Practice**: After countdown hits 0:
  - Automatically play the video (`playerRef.current.playVideo()`)
  - Automatically start recording (`start()`)
  - The user sees the video + a "Stop" button
  - When the clip ends (detected by the existing interval), auto-stop recording too.

**State changes:**
- Add a `phase` state: `"env-check" | "countdown" | "practice"`
- Default to `"env-check"` instead of jumping straight to the video
- Countdown uses a `useEffect` with a 1-second interval for 3 ticks
- YouTube player is initialized during env-check but kept paused until countdown completes

---

### Technical Details

**`AnalysisResult` interface changes:**
```
elongationCount: number;
elongationDetails: Record<string, number>;
```

**Shadow.tsx phase flow:**
```text
[env-check] --> user clicks "I'm Ready" --> [countdown: 3..2..1] --> [practice: video plays + recording starts]
```

**Files modified:**
1. `src/hooks/useSpeechAnalysis.ts` — add elongation detection + new fields
2. `src/pages/Retell.tsx` — display elongations + improvement tips on results page
3. `src/pages/Shadow.tsx` — add environment check phase, countdown, auto-play + auto-record
4. `src/lib/clipStore.ts` — add `elongationCount` to `Session` interface
