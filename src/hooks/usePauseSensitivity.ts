import { useCallback, useState } from "react";

export type PauseSensitivity = "strict" | "normal" | "lenient";

const PAUSE_SENSITIVITY_KEY = "shadowspeak_pause_sensitivity";

const THRESHOLDS: Record<PauseSensitivity, number> = {
  strict: 0.4,
  normal: 0.6,
  lenient: 0.9,
};

function isPauseSensitivity(value: string): value is PauseSensitivity {
  return value === "strict" || value === "normal" || value === "lenient";
}

export function getPauseThresholdSeconds(sensitivity: PauseSensitivity): number {
  return THRESHOLDS[sensitivity];
}

export function usePauseSensitivity() {
  const [pauseSensitivity, setPauseSensitivityState] = useState<PauseSensitivity>(() => {
    const saved = localStorage.getItem(PAUSE_SENSITIVITY_KEY);
    return saved && isPauseSensitivity(saved) ? saved : "normal";
  });

  const setPauseSensitivity = useCallback((value: PauseSensitivity) => {
    setPauseSensitivityState(value);
    localStorage.setItem(PAUSE_SENSITIVITY_KEY, value);
  }, []);

  return {
    pauseSensitivity,
    pauseThresholdSeconds: getPauseThresholdSeconds(pauseSensitivity),
    setPauseSensitivity,
  };
}
