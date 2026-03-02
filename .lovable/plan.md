

## Update Landing Page with Detailed Shadowing Instructions

### What Changes
Replace the current vague video caption with a structured, encouraging instruction panel that guides users through a multi-day shadowing practice.

### Changes to `src/pages/Index.tsx`

**Add an instruction card above or below the video** with the following content:

**Heading**: "How to Shadow This Clip"

**Instructions (warm, encouraging tone):**
1. **Watch & Listen** — Play the clip with subtitles on. Just listen the first time.
2. **Start Shadowing** — Try to repeat what the speaker says. If you can't keep up sentence by sentence, go word by word. That's completely okay.
3. **Repeat 3-5 Times** — Keep practicing until the clip feels comfortable and natural.

**Day-by-day progression tips (styled as a small timeline or badges):**
- **Day 1-2**: Focus on keeping up with the speed. Don't worry about sounding perfect.
- **Day 3+**: Start matching the speaker's tone, rhythm, and expressions.

**Also:**
- Enable subtitles by default on the YouTube embed (`cc_load_policy=1`)
- Add a "Start Shadowing" button below the instructions as the primary CTA
- Keep secondary text: "Or paste your own YouTube URL"

### Visual Treatment
- Instructions displayed in a warm-toned callout card with a soft background
- Day progression shown as a subtle mini-timeline with gentle color gradients
- Reassuring micro-copy throughout ("It's okay if you can't keep up at first")

### Files Modified
- `src/pages/Index.tsx` — restructure the video section with instruction panel

