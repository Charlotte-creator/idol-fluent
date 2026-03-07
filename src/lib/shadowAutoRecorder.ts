export type AutoRecordStartResult =
  | "started"
  | "already-recording"
  | "in-flight"
  | "not-practice"
  | "failed";

export type ShadowPlayerLifecycleResult = AutoRecordStartResult | "stopped" | "noop";

type ShadowAutoRecorderDeps = {
  isPracticePhase: () => boolean;
  isRecording: () => boolean;
  startRecording: () => Promise<boolean>;
  stopRecording: () => void;
};

export function createShadowAutoRecorder(deps: ShadowAutoRecorderDeps) {
  let startInFlight = false;

  const ensureRecordingStarted = async (): Promise<AutoRecordStartResult> => {
    if (!deps.isPracticePhase()) return "not-practice";
    if (deps.isRecording()) return "already-recording";
    if (startInFlight) return "in-flight";

    startInFlight = true;
    try {
      const started = await deps.startRecording();
      return started ? "started" : "failed";
    } finally {
      startInFlight = false;
    }
  };

  const stopRecordingIfNeeded = (): ShadowPlayerLifecycleResult => {
    if (!deps.isPracticePhase()) return "noop";
    if (!deps.isRecording()) return "noop";
    deps.stopRecording();
    return "stopped";
  };

  const onPlayerPlaying = async (): Promise<ShadowPlayerLifecycleResult> => {
    return ensureRecordingStarted();
  };

  const onPlayerPausedOrEnded = (): ShadowPlayerLifecycleResult => {
    return stopRecordingIfNeeded();
  };

  return {
    ensureRecordingStarted,
    stopRecordingIfNeeded,
    onPlayerPlaying,
    onPlayerPausedOrEnded,
  };
}
