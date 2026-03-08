"""Self-hosted STT microservice using faster-whisper."""

import asyncio
import json
import os
import re
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

from strategy import (
    FallbackConfig,
    PassMetrics,
    choose_better_pass,
    fallback_reasons,
    should_retry_without_vad,
)

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
MAX_CONCURRENT = int(os.getenv("STT_MAX_CONCURRENT", "2"))
STT_TIMESTAMPS = (os.getenv("STT_TIMESTAMPS", "segments") or "segments").strip().lower()
VALID_TIMESTAMP_MODES = {"none", "segments", "words"}


def _parse_bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _parse_float_env(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = float(raw)
        if value > 0:
            return value
    except ValueError:
        pass
    return default


def _parse_int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
        if value > 0:
            return value
    except ValueError:
        pass
    return default


STT_VERBATIM = _parse_bool_env("STT_VERBATIM", True)
STT_FALLBACK_NO_VAD = _parse_bool_env("STT_FALLBACK_NO_VAD", True)
STT_DISFLUENCY_PROMPT = (
    os.getenv(
        "STT_DISFLUENCY_PROMPT",
        "Transcribe verbatim. Keep filler words and disfluencies (um, uh, er, eh, erm), "
        "repetitions, and false starts. Do not rewrite into fluent text.",
    )
    .strip()
)
FALLBACK_CONFIG = FallbackConfig(
    long_audio_seconds=_parse_float_env("STT_FALLBACK_LONG_AUDIO_SECONDS", 6.0),
    min_words_long_audio=_parse_int_env("STT_FALLBACK_MIN_WORDS_LONG_AUDIO", 3),
    zero_fillers_seconds=_parse_float_env("STT_FALLBACK_ZERO_FILLERS_SECONDS", 10.0),
    min_speech_ratio=_parse_float_env("STT_FALLBACK_MIN_SPEECH_RATIO", 0.25),
)

WHISPER_LANGUAGE_CODES = {
    "af", "am", "ar", "as", "az", "ba", "be", "bg", "bn", "bo", "br", "bs", "ca", "cs",
    "cy", "da", "de", "el", "en", "es", "et", "eu", "fa", "fi", "fo", "fr", "gl", "gu",
    "ha", "haw", "he", "hi", "hr", "ht", "hu", "hy", "id", "is", "it", "ja", "jw", "ka",
    "kk", "km", "kn", "ko", "la", "lb", "ln", "lo", "lt", "lv", "mg", "mi", "mk", "ml",
    "mn", "mr", "ms", "mt", "my", "ne", "nl", "nn", "no", "oc", "pa", "pl", "ps", "pt",
    "ro", "ru", "sa", "sd", "si", "sk", "sl", "sn", "so", "sq", "sr", "su", "sv", "sw",
    "ta", "te", "tg", "th", "tk", "tl", "tr", "tt", "uk", "ur", "uz", "vi", "yi", "yo",
    "zh", "yue",
}

_timestamp_mode = STT_TIMESTAMPS if STT_TIMESTAMPS in VALID_TIMESTAMP_MODES else "segments"

app = FastAPI(title="stt-service")
_semaphore = asyncio.Semaphore(MAX_CONCURRENT)
_model = None


def _get_model():
    global _model
    if _model is None:
        from faster_whisper import WhisperModel

        print(f"Loading whisper model={WHISPER_MODEL} device={WHISPER_DEVICE} compute={WHISPER_COMPUTE_TYPE}")
        _model = WhisperModel(
            WHISPER_MODEL,
            device=WHISPER_DEVICE,
            compute_type=WHISPER_COMPUTE_TYPE,
        )
        print("Model loaded.")
    return _model


@app.on_event("startup")
async def startup():
    # Pre-load model in background thread so first request isn't slow.
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _get_model)


def _convert_to_wav(input_path: str) -> str:
    """Convert any audio to 16kHz mono WAV using ffmpeg."""
    wav_path = input_path + ".wav"
    result = subprocess.run(
        [
            "ffmpeg",
            "-y",
            "-i",
            input_path,
            "-ar",
            "16000",
            "-ac",
            "1",
            "-f",
            "wav",
            wav_path,
        ],
        capture_output=True,
        timeout=60,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr.decode()[:500]}")
    return wav_path


def _normalize_language_code(raw_language: str | None) -> str | None:
    if not raw_language:
        return None

    cleaned = raw_language.strip().lower().replace("_", "-")
    if not cleaned:
        return None

    if cleaned in {"auto", "auto-detect", "detect"}:
        return None

    base_code = cleaned.split("-", maxsplit=1)[0]
    if base_code in WHISPER_LANGUAGE_CODES:
        return base_code
    return None


def _parse_prompt_phrases(raw_prompt_phrases: str | None) -> list[str]:
    if not raw_prompt_phrases:
        return []

    normalized = raw_prompt_phrases.strip()
    if not normalized:
        return []

    if normalized.startswith("["):
        try:
            parsed = json.loads(normalized)
            if isinstance(parsed, list):
                return [str(item).strip() for item in parsed if str(item).strip()]
        except json.JSONDecodeError:
            pass

    return [item.strip() for item in normalized.split(",") if item.strip()]


def _segment_confidence(segment: Any) -> float | None:
    no_speech_prob = getattr(segment, "no_speech_prob", None)
    if no_speech_prob is None:
        return None
    try:
        value = round(1.0 - float(no_speech_prob), 3)
        return min(1.0, max(0.0, value))
    except (TypeError, ValueError):
        return None


def _serialize_words(segment: Any) -> list[dict[str, Any]] | None:
    words = getattr(segment, "words", None)
    if not words:
        return None

    serialized: list[dict[str, Any]] = []
    for word in words:
        start = getattr(word, "start", None)
        end = getattr(word, "end", None)
        token = getattr(word, "word", None)
        if start is None or end is None or token is None:
            continue

        entry: dict[str, Any] = {
            "start": round(float(start), 3),
            "end": round(float(end), 3),
            "word": str(token).strip(),
        }
        probability = getattr(word, "probability", None)
        if probability is not None:
            entry["confidence"] = round(float(probability), 3)
        serialized.append(entry)

    return serialized or None


def _cleanup_transcript_text(text: str) -> str:
    # Keep content verbatim; only normalize whitespace and trim.
    return re.sub(r"\s+", " ", text).strip()


def _transcribe_sync(audio_path: str, language: str | None, prompt_phrases: list[str]):
    model = _get_model()
    base_kwargs: dict[str, Any] = {"beam_size": 5}

    if language:
        base_kwargs["language"] = language

    initial_prompt_parts: list[str] = []
    if STT_VERBATIM and STT_DISFLUENCY_PROMPT:
        initial_prompt_parts.append(STT_DISFLUENCY_PROMPT)
    if prompt_phrases:
        initial_prompt_parts.append(
            "Focus phrases: " + ", ".join(prompt_phrases)
        )
    if initial_prompt_parts:
        base_kwargs["initial_prompt"] = " ".join(initial_prompt_parts)

    if _timestamp_mode == "words":
        base_kwargs["word_timestamps"] = True

    def run_pass(vad_filter: bool) -> dict[str, Any]:
        kwargs = {**base_kwargs, "vad_filter": vad_filter}
        segments_iter, info = model.transcribe(audio_path, **kwargs)
        full_text_parts: list[str] = []
        segments: list[dict[str, Any]] = []
        speech_seconds_kept = 0.0

        for segment in segments_iter:
            text = _cleanup_transcript_text(str(getattr(segment, "text", "")))
            if not text:
                continue

            full_text_parts.append(text)

            start = float(getattr(segment, "start", 0.0) or 0.0)
            end = float(getattr(segment, "end", 0.0) or 0.0)
            if end >= start:
                speech_seconds_kept += end - start

            if _timestamp_mode == "none":
                continue

            segment_payload: dict[str, Any] = {
                "start": round(start, 3),
                "end": round(end, 3),
                "text": text,
            }

            confidence = _segment_confidence(segment)
            if confidence is not None:
                segment_payload["confidence"] = confidence

            if _timestamp_mode == "words":
                words = _serialize_words(segment)
                if words:
                    segment_payload["words"] = words

            segments.append(segment_payload)

        duration_seconds = round(float(getattr(info, "duration", 0.0) or 0.0), 3)
        text_output = _cleanup_transcript_text(" ".join(full_text_parts))
        pass_metrics = PassMetrics(
            text=text_output,
            audio_duration_seconds=duration_seconds,
            speech_seconds_kept=round(speech_seconds_kept, 3) if speech_seconds_kept > 0 else None,
        )

        return {
            "text": text_output,
            "language": getattr(info, "language", None) or language,
            "durationSeconds": duration_seconds,
            # Keep legacy field for backward compatibility.
            "duration": duration_seconds,
            "segments": segments if segments else None,
            "speechSecondsKept": pass_metrics.speech_seconds_kept,
            "metrics": pass_metrics,
        }

    pass_a = run_pass(vad_filter=True)
    pass_a_metrics: PassMetrics = pass_a["metrics"]

    pass_b: dict[str, Any] | None = None
    reasons: list[str] = []

    if STT_FALLBACK_NO_VAD:
        reasons = fallback_reasons(pass_a_metrics, FALLBACK_CONFIG)
        if should_retry_without_vad(pass_a_metrics, FALLBACK_CONFIG):
            pass_b = run_pass(vad_filter=False)

    chosen_pass = "vad"
    chosen_result = pass_a

    if pass_b is not None:
        pass_b_metrics: PassMetrics = pass_b["metrics"]
        chosen_pass = choose_better_pass(pass_a_metrics, pass_b_metrics)
        if chosen_pass == "no_vad":
            chosen_result = pass_b

    chosen_metrics: PassMetrics = chosen_result["metrics"]
    diagnostics: dict[str, Any] = {
        "vadUsed": chosen_pass == "vad",
        "retryWithoutVad": pass_b is not None,
        "chosenPass": chosen_pass,
        "timestampsMode": _timestamp_mode,
        "promptStrategy": "verbatim_disfluencies" if (STT_VERBATIM and STT_DISFLUENCY_PROMPT) else "default",
        "audioDurationSeconds": chosen_metrics.audio_duration_seconds,
        "speechSecondsKept": chosen_result.get("speechSecondsKept"),
        "passA": {
            "transcriptWordCount": pass_a_metrics.transcript_word_count,
            "fillerCount": pass_a_metrics.filler_count,
            "speechSecondsKept": pass_a_metrics.speech_seconds_kept,
        },
    }

    if reasons:
        diagnostics["fallbackReasons"] = reasons

    if pass_b is not None:
        pass_b_metrics = pass_b["metrics"]
        diagnostics["passB"] = {
            "transcriptWordCount": pass_b_metrics.transcript_word_count,
            "fillerCount": pass_b_metrics.filler_count,
            "speechSecondsKept": pass_b_metrics.speech_seconds_kept,
        }

    response = {
        "text": chosen_result["text"],
        "language": chosen_result["language"],
        "durationSeconds": chosen_result["durationSeconds"],
        "duration": chosen_result["duration"],
        "segments": chosen_result["segments"],
        "sttDiagnostics": diagnostics,
    }
    return response


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str | None = Form(None),
    promptPhrases: str | None = Form(None),
):
    if not _semaphore._value:
        raise HTTPException(
            status_code=429,
            detail={"code": "BUSY", "message": "Server is busy, please retry shortly."},
        )

    async with _semaphore:
        tmp_dir = tempfile.mkdtemp()
        try:
            suffix = Path(file.filename or "audio.webm").suffix or ".webm"
            input_path = os.path.join(tmp_dir, f"input{suffix}")
            with open(input_path, "wb") as stream:
                content = await file.read()
                stream.write(content)

            loop = asyncio.get_event_loop()
            wav_path = await loop.run_in_executor(None, _convert_to_wav, input_path)

            start_ms = time.monotonic_ns() // 1_000_000
            normalized_language = _normalize_language_code(language)
            prompt_phrases = _parse_prompt_phrases(promptPhrases)
            result = await loop.run_in_executor(
                None,
                _transcribe_sync,
                wav_path,
                normalized_language,
                prompt_phrases,
            )
            elapsed_ms = (time.monotonic_ns() // 1_000_000) - start_ms
            result["processingMs"] = elapsed_ms

            if not str(result.get("text", "")).strip():
                raise HTTPException(
                    status_code=422,
                    detail="No speech detected. Please try again and speak clearly.",
                )

            return JSONResponse(content=result)
        except RuntimeError as error:
            raise HTTPException(status_code=422, detail=str(error)) from error
        finally:
            import shutil

            shutil.rmtree(tmp_dir, ignore_errors=True)


@app.get("/health")
async def health():
    model_loaded = _model is not None
    return {
        "ok": True,
        "model": WHISPER_MODEL if model_loaded else None,
        "ready": model_loaded,
        "timestamps": _timestamp_mode,
    }
