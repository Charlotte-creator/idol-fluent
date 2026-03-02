export interface Clip {
  id: string;
  videoId: string;
  title: string;
  startTime: number;
  endTime: number;
  createdAt: string;
}

export interface Session {
  id: string;
  clipId: string;
  type: "shadow" | "retell";
  date: string;
  wordsPerMinute: number;
  fillerWordCount: number;
  fillerWordsPerMinute: number;
  expressionsUsed: string[];
  durationSeconds: number;
  totalWords: number;
  pauseRatio: number;
  vocabularyRichness: number;
  elongationCount: number;
  timeLimitMinutes?: number;
}

const CLIPS_KEY = "shadowspeak_clips";
const SESSIONS_KEY = "shadowspeak_sessions";

function read<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}

function write<T>(key: string, data: T[]) {
  localStorage.setItem(key, JSON.stringify(data));
}

export function getClips(): Clip[] {
  return read<Clip>(CLIPS_KEY);
}

export function getClip(id: string): Clip | undefined {
  return getClips().find((c) => c.id === id);
}

export function saveClip(clip: Omit<Clip, "id" | "createdAt">): Clip {
  const clips = getClips();
  const newClip: Clip = {
    ...clip,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  clips.push(newClip);
  write(CLIPS_KEY, clips);
  return newClip;
}

export function getSessions(): Session[] {
  return read<Session>(SESSIONS_KEY);
}

export function getSessionsForClip(clipId: string): Session[] {
  return getSessions().filter((s) => s.clipId === clipId);
}

export function saveSession(session: Omit<Session, "id" | "date">): Session {
  const sessions = getSessions();
  const newSession: Session = {
    ...session,
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
  };
  sessions.push(newSession);
  write(SESSIONS_KEY, sessions);
  return newSession;
}

export function parseVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}
