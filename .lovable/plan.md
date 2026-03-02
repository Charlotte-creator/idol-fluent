

## Add a "Watch First" Phase to the Shadow Flow

### What Changes

A new **"watch" phase** is inserted between the environment check and the countdown/practice phases. This lets users watch the clip once (or multiple times) before committing to shadowing with recording.

### Updated Flow

```text
env-check --> watch --> countdown --> practice
```

### Implementation (Shadow.tsx only)

**1. Update the phase state type**

Add `"watch"` to the phase union:
```
useState<"env-check" | "watch" | "countdown" | "practice">("env-check")
```

The "I'm Ready" button in env-check will now transition to `"watch"` instead of `"countdown"`.

**2. Load the YouTube player during the watch phase**

Update the player init `useEffect` to trigger on both `"watch"` and `"practice"` phases. During the watch phase, the `onReady` callback will NOT auto-start recording -- it will just play the video normally.

To distinguish behavior, use a ref or check the current phase: in `"watch"` mode, `onReady` plays the video but skips `startRef.current()` and `startListeningRef.current()`.

The player container `<div id="shadow-player">` will be rendered in both the watch and practice phases (or use separate IDs like `"watch-player"` and `"shadow-player"` to avoid conflicts when transitioning).

**3. Render the watch phase UI**

Between env-check and countdown, show:

- The clip title and time range
- The YouTube player (embedded, playable, with controls)
- A "Play Clip" button to replay the segment
- A prominent "Start Shadowing" button that transitions to the countdown phase
- A helpful note: "Watch the clip as many times as you need. When you're ready, hit Start Shadowing."

**4. Transition from watch to practice**

When the user clicks "Start Shadowing":
- Destroy the watch player instance
- Set phase to `"countdown"` (which triggers the 3-second countdown, then practice as before)
- The practice phase creates a fresh player with auto-record behavior

### Technical Details

- The `initPlayer` callback needs a parameter or ref to know whether to auto-record. Simplest approach: add a `phaseRef` that tracks the current phase, and in `onReady`, check `phaseRef.current === "practice"` before calling `startRef` and `startListeningRef`.
- Player cleanup between watch and practice: destroy the player when leaving the watch phase (in the "Start Shadowing" click handler or via an effect), so the practice phase can create a fresh one.
- The watch phase player uses the same `id="shadow-player"` div, but the effect that initializes it will now fire for both `"watch"` and `"practice"` phases. The existing cleanup in the effect handles destroying the old player before creating a new one.
- No changes to clipStore, hooks, or other pages.
