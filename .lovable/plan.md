

## Reorganize Results Page with Shadow + Retell Metrics Side by Side

### What Changes

The Retell results page will be reorganized into 3 metric categories. Each metric will display two numbers: the user's **Retell** score (large, primary) and their latest **Shadow** score for the same clip (smaller, secondary reference).

To make this possible, the Shadow page needs to start capturing speech metrics during practice rounds.

### 1. Add Speech Analysis to Shadow Page

**File: `src/pages/Shadow.tsx`**

- Import `useSpeechAnalysis` hook (already used in Retell).
- Call `startListening()` when recording starts (inside `onReady` callback).
- Call `stopAndAnalyze()` when recording stops.
- Save each shadow round as a session via `saveSession()` with `type: "shadow"`.
- This means every shadow round will produce stored metrics (WPM, fillers, elongations, vocabulary richness, total words, pause ratio).

### 2. Reorganize Retell Results Page into 3 Categories

**File: `src/pages/Retell.tsx`**

Fetch the latest shadow session for the same clip using `getSessionsForClip(clipId)` filtered by `type: "shadow"`, sorted by date descending.

Replace the current flat metric grid with 3 organized sections:

**Section 1 -- Voice Features**
| Metric | User (Retell) | Shadow Reference |
|--------|--------------|-----------------|
| Words Per Minute | Large number | Smaller shadow number |

(Pitch is not yet available -- will show a "Coming soon" placeholder.)

**Section 2 -- Speech Fluency**
| Metric | User (Retell) | Shadow Reference |
|--------|--------------|-----------------|
| Filler Words | Large number | Smaller shadow number |
| Elongations | Large number | Smaller shadow number |

Below this, show the filler word and elongation breakdown badges (kept from current design).

**Section 3 -- Content Strength**
| Metric | User (Retell) | Shadow Reference |
|--------|--------------|-----------------|
| Vocabulary Richness | Large percentage | Smaller shadow percentage |
| Total Words | Large number | Smaller shadow number |

Each metric card will show:
- The retell score as a large bold number
- The shadow score as a smaller muted number below, labeled "Shadow: X"
- If no shadow data exists, show "--" for the shadow reference

The "Room for Improvement", "Transcript", and audio playback sections remain at the bottom, unchanged.

### Technical Details

**Shadow.tsx changes:**
- Import `useSpeechAnalysis` and `saveSession` from their respective modules
- Wire `startListening()` into the recording start flow
- On recording stop, call `stopAndAnalyze(duration)` and `saveSession(...)` with `type: "shadow"`
- No UI changes needed on the Shadow page itself (metrics are saved silently)

**Retell.tsx changes:**
- Import `getSessionsForClip` from clipStore
- Use `useMemo` to find the latest shadow session: `getSessionsForClip(clipId).filter(s => s.type === "shadow").sort(by date).pop()`
- Restructure the results JSX into 3 `Card` sections with section headers
- Each metric displays two numbers side by side or stacked

**No changes needed to `clipStore.ts`** -- the Session interface already supports `type: "shadow" | "retell"` and all the required fields.

