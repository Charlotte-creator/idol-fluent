

## Four Changes: Shadow Reminder, Elongation Detection, Dashboard Fixes, Retell Tips

### 1. Add Slow Playback Speed Reminder (Shadow.tsx)

Add an informational tip in the environment check phase, between the headphones checkbox and the "I'm Ready" button:

> "Tip: You can use the YouTube player's settings gear icon to slow down the playback speed if the speaker is too fast."

Uses an `Info` icon from lucide-react. Styled as a subtle muted text block, not a checkbox.

### 2. Improve Elongation/Hesitation Detection (useSpeechAnalysis.ts)

The current `detectElongations` regex looks for 3+ repeated characters (e.g., "soooo"), but the Web Speech API normalizes text, so this almost never matches. Replace with detection of:

- **Repeated consecutive words** (stuttering): "I I I", "the the" using regex `/\b(\w+)(\s+\1){1,}\b/gi`
- **Hesitation sounds**: "hmm", "hm", "ah", "er", "oh", "uh huh" counted via word matching
- **Keep original regex** as fallback

The field names (`elongationCount`, `elongationDetails`) stay the same to avoid breaking changes. The label on the results page will say "Hesitations" instead of "Elongations".

### 3. Fix Dashboard WPM Bug + Split Charts by Type

**WPM Bug**: The 1300 WPM entry is caused by a race condition in Shadow.tsx. When `audioUrl` changes, the `useEffect` reads `duration` from React state, but due to batching, `duration` may still be 0 or 1 second when the effect fires. Fix: compute duration directly from `startTimeRef.current` at analysis time instead of relying on the state variable. Also add a guard: if `durationSeconds < 3`, skip saving the session (too short to be meaningful).

**Split Charts**: Currently the line charts plot all sessions (shadow + retell) on a single line each. Change each chart (WPM and Fillers/min) to show two lines:
- A primary-colored line for **retell** sessions
- A secondary/muted line for **shadow** sessions

Chart data will be restructured to group by date and include `retellWpm`, `shadowWpm`, `retellFillers`, `shadowFillers`. The chart config will define both series with distinct colors.

### 4. Add Retelling Tips to Retell Setup Page (Retell.tsx)

Add a tips card in the **setup phase** (before the user starts recording) with structured speaking advice:

**Structure Tips:**
- "Start with a clear main idea or thesis"
- "Support with 2-3 key arguments or examples"
- "End with a brief conclusion or summary"

**Useful Phrases to Practice:**
Display as badges/chips the user can mentally rehearse:
- "The speaker argued that..."
- "One key point was..."
- "In contrast to..."
- "To summarize..."
- "Another important aspect is..."
- "This suggests that..."

This appears as a collapsible or always-visible card between the time limit selector and the "Start Retelling" button.

---

### Technical Details

**Shadow.tsx**
- Add `Info` icon import
- Add tip JSX in env-check phase (lines 228-229 area)
- Fix duration bug: use `Date.now() - startTimeRef` to compute actual duration in the `audioUrl` effect, add `durationSeconds < 3` guard before `saveSession`
- Need to expose `startTimeRef` or compute inline

**useSpeechAnalysis.ts**
- Rewrite `detectElongations` function (lines 19-30) to include repeated words, hesitation sounds, and original fallback
- No interface changes needed

**Dashboard.tsx**
- Restructure `chartData` useMemo to produce objects with `retellWpm`, `shadowWpm`, `retellFillers`, `shadowFillers` grouped by date
- Add second `Line` to each `LineChart` with different color
- Update `ChartContainer` config to include both series
- Optionally filter out sessions with WPM > 300 as outliers (sanity cap)

**Retell.tsx**
- Add a tips `Card` in the setup phase JSX with structure advice and phrase badges
- Import `Lightbulb` icon from lucide-react

