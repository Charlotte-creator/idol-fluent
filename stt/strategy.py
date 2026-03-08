"""Fallback heuristic and transcript chooser for STT passes."""

from __future__ import annotations

import re
from dataclasses import dataclass

FILLER_HINT_PATTERN = re.compile(
    r"\b(uh+|um+|erm|er|eh|ehm|ah+|hmm+|mm+|like|you know|i mean|uh-huh|mm-hmm)\b",
    re.IGNORECASE,
)
WORD_PATTERN = re.compile(r"[a-zA-Z]+(?:'[a-zA-Z]+)?")


@dataclass
class PassMetrics:
    text: str
    audio_duration_seconds: float
    speech_seconds_kept: float | None = None

    @property
    def transcript_word_count(self) -> int:
        return len(WORD_PATTERN.findall(self.text))

    @property
    def filler_count(self) -> int:
        return len(FILLER_HINT_PATTERN.findall(self.text))


@dataclass
class FallbackConfig:
    long_audio_seconds: float = 6.0
    min_words_long_audio: int = 3
    zero_fillers_seconds: float = 10.0
    min_speech_ratio: float = 0.25


def fallback_reasons(metrics: PassMetrics, config: FallbackConfig) -> list[str]:
    reasons: list[str] = []
    text = metrics.text.strip()
    if not text:
        reasons.append("empty_transcript")
        return reasons

    words = metrics.transcript_word_count
    if metrics.audio_duration_seconds >= config.long_audio_seconds and words < config.min_words_long_audio:
        reasons.append("long_audio_low_word_count")

    if metrics.audio_duration_seconds >= config.zero_fillers_seconds and words >= 3 and metrics.filler_count == 0:
        reasons.append("long_audio_zero_fillers")

    if metrics.speech_seconds_kept is not None and metrics.audio_duration_seconds > 0:
        speech_ratio = metrics.speech_seconds_kept / metrics.audio_duration_seconds
        if speech_ratio < config.min_speech_ratio:
            reasons.append("low_speech_ratio")

    return reasons


def should_retry_without_vad(metrics: PassMetrics, config: FallbackConfig) -> bool:
    return bool(fallback_reasons(metrics, config))


def choose_better_pass(pass_a: PassMetrics, pass_b: PassMetrics) -> str:
    """Return 'vad' or 'no_vad'."""
    text_a = pass_a.text.strip()
    text_b = pass_b.text.strip()
    if not text_b:
        return "vad"
    if not text_a:
        return "no_vad"

    words_a = pass_a.transcript_word_count
    words_b = pass_b.transcript_word_count
    fillers_a = pass_a.filler_count
    fillers_b = pass_b.filler_count

    if words_b >= words_a + 2:
        return "no_vad"
    if words_a >= words_b + 2:
        return "vad"

    if fillers_b > fillers_a:
        return "no_vad"
    if fillers_a > fillers_b:
        return "vad"

    return "vad"
