import { describe, expect, it, vi } from "vitest";

import { createShadowAutoRecorder } from "@/lib/shadowAutoRecorder";

describe("createShadowAutoRecorder", () => {
  it("starts recording on PLAYING and prevents duplicate starts while in-flight", async () => {
    let recording = false;
    let resolveStart: ((value: boolean) => void) | null = null;

    const startRecording = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveStart = resolve;
        }),
    );

    const stopRecording = vi.fn(() => {
      recording = false;
    });

    const controller = createShadowAutoRecorder({
      isPracticePhase: () => true,
      isRecording: () => recording,
      startRecording,
      stopRecording,
    });

    const first = controller.onPlayerPlaying();
    const second = controller.onPlayerPlaying();

    expect(startRecording).toHaveBeenCalledTimes(1);
    expect(await second).toBe("in-flight");

    recording = true;
    resolveStart?.(true);
    expect(await first).toBe("started");
  });

  it("stops recording on PAUSED and ENDED, and noops outside practice", () => {
    let practice = true;
    let recording = true;
    const stopRecording = vi.fn(() => {
      recording = false;
    });

    const controller = createShadowAutoRecorder({
      isPracticePhase: () => practice,
      isRecording: () => recording,
      startRecording: vi.fn(async () => true),
      stopRecording,
    });

    expect(controller.onPlayerPausedOrEnded()).toBe("stopped");
    expect(stopRecording).toHaveBeenCalledTimes(1);

    recording = true;
    practice = false;
    expect(controller.onPlayerPausedOrEnded()).toBe("noop");
    expect(stopRecording).toHaveBeenCalledTimes(1);
  });
});
