

## Session Detail Page with Transcript and Video

### Overview

Replace the current session detail dialog with a dedicated page at `/session/:sessionId`. When users click a row in the dashboard session history, they navigate to this page showing full metrics, their speech transcript, and the original YouTube clip side by side.

### Changes Required

#### 1. Add `transcript` field to Session (clipStore.ts)

Add `transcript?: string` to the `Session` interface so the user's speech text is persisted with the session.

#### 2. Save transcript in Shadow.tsx and Retell.tsx

- **Shadow.tsx**: In the `audioUrl` effect (~line 160), add `transcript: result.transcript` to the `saveSession` call.
- **Retell.tsx**: In `handleSave` (~line 101), add `transcript: analysisResult.transcript` to the `saveSession` call.

#### 3. Create SessionDetail page (new file: `src/pages/SessionDetail.tsx`)

A full page with a two-column layout:

**Left column:**
- Session type badge, clip name, date
- All metrics (WPM, total words, fillers, fillers/min, hesitations, vocabulary richness, pause ratio, duration, time limit) using Card components
- User's speech transcript
- Audio player (if available -- note: audio URLs from blob storage won't persist across page loads, so show transcript only for historical sessions)

**Right column:**
- YouTube embed via iframe: `https://www.youtube.com/embed/{videoId}?start={startTime}&end={endTime}`
- Back to Dashboard button

On mobile, columns stack vertically (video on top).

#### 4. Update Dashboard navigation (Dashboard.tsx)

- Replace `setSelectedSession(s)` with `navigate(`/session/${s.id}`)` on row click
- Remove `SessionDetailDialog` import and usage
- Remove `selectedSession` state

#### 5. Add route (App.tsx)

Add `<Route path="/session/:sessionId" element={<SessionDetail />} />` and import the new page.

### Technical Notes

- The page reads the session from `getSessions().find(s => s.id === sessionId)` and the clip from `getClip(session.clipId)`.
- If session or clip is not found, show a "not found" message with a link back to the dashboard.
- Existing sessions without a transcript field will simply show "No transcript available."
- The `SessionDetailDialog` component file is kept but no longer used from the dashboard (can be cleaned up later).

