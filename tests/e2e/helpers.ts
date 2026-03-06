import fs from "node:fs";
import path from "node:path";

import type { Page } from "@playwright/test";

import type { Clip, Session } from "../../src/lib/clipStore";

const fixtureBytes = fs.readFileSync(path.resolve(process.cwd(), "tests/fixtures/sample.wav"));
const fixtureBase64 = fixtureBytes.toString("base64");

export async function installBrowserStubs(page: Page) {
  await page.addInitScript(
    ({ base64Audio }) => {
      const decode = (input: string): Uint8Array => {
        const binary = atob(input);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        return bytes;
      };

      const audioBytes = decode(base64Audio);

      class MockMediaRecorder {
        stream: MediaStream;
        state: RecordingState;
        mimeType: string;
        ondataavailable: ((event: { data: Blob }) => void) | null;
        onstop: (() => void) | null;

        constructor(stream: MediaStream) {
          this.stream = stream;
          this.state = "inactive";
          this.mimeType = "audio/webm";
          this.ondataavailable = null;
          this.onstop = null;
        }

        start() {
          this.state = "recording";
        }

        stop() {
          if (this.state !== "recording") return;
          this.state = "inactive";
          const blob = new Blob([audioBytes], { type: "audio/webm" });
          setTimeout(() => {
            this.ondataavailable?.({ data: blob });
            this.onstop?.();
          }, 30);
        }
      }

      class MockTrack {
        stop() {
          return undefined;
        }
      }

      class MockStream {
        getTracks() {
          return [new MockTrack()] as unknown as MediaStreamTrack[];
        }
      }

      Object.defineProperty(navigator, "mediaDevices", {
        configurable: true,
        value: {
          getUserMedia: async () => new MockStream(),
        },
      });

      Object.defineProperty(window, "MediaRecorder", {
        configurable: true,
        writable: true,
        value: MockMediaRecorder,
      });

      class MockPlayer {
        currentTime = 0;
        options: any;

        constructor(_containerId: string, options: any) {
          this.options = options;
          setTimeout(() => {
            options?.events?.onReady?.({ target: this });
          }, 0);
        }

        destroy() {
          return undefined;
        }

        seekTo(time: number) {
          this.currentTime = time;
        }

        playVideo() {
          this.options?.events?.onStateChange?.({ data: 1 });
        }

        pauseVideo() {
          return undefined;
        }

        getCurrentTime() {
          return this.currentTime;
        }
      }

      (window as any).YT = {
        PlayerState: {
          PLAYING: 1,
        },
        Player: MockPlayer,
      };
      (window as any).onYouTubeIframeAPIReady = () => undefined;
    },
    { base64Audio: fixtureBase64 },
  );
}

export async function mockTranscribeApi(
  page: Page,
  options: {
    text: string;
    language?: string;
    duration?: number;
    delayMs?: number;
    segments?: Array<{ start: number; end: number; text: string; confidence?: number }>;
  },
) {
  await page.route("**/api/transcribe", async (route) => {
    if (options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-transcribe-model": "gpt-4o-mini-transcribe",
        "server-timing": "openai;dur=120,total;dur=160",
      },
      body: JSON.stringify({
        text: options.text,
        language: options.language || "en",
        duration: options.duration ?? 4.2,
        segments: options.segments,
        confidence: 0.91,
      }),
    });
  });
}

export async function seedLocalStorage(
  page: Page,
  payload: { clips?: Clip[]; sessions?: Session[] },
) {
  await page.addInitScript((input) => {
    window.localStorage.setItem("shadowspeak_clips", JSON.stringify(input.clips || []));
    window.localStorage.setItem("shadowspeak_sessions", JSON.stringify(input.sessions || []));
  }, payload);
}

export async function readSessions(page: Page): Promise<Session[]> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("shadowspeak_sessions");
    return raw ? JSON.parse(raw) : [];
  });
}

export async function readClips(page: Page): Promise<Clip[]> {
  return page.evaluate(() => {
    const raw = window.localStorage.getItem("shadowspeak_clips");
    return raw ? JSON.parse(raw) : [];
  });
}
