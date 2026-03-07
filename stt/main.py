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

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
MAX_CONCURRENT = int(os.getenv("STT_MAX_CONCURRENT", "2"))
STT_TIMESTAMPS = (os.getenv("STT_TIMESTAMPS", "segments") or "segments").strip().lower()
VALID_TIMESTAMP_MODES = {"none", "segments", "words"}
STT_DISFLUENCY_PROMPT = (
    os.getenv(
        "STT_DISFLUENCY_PROMPT",
        "Transcribe verbatim. Keep disfluencies such as um, uh, er, hmm, like, and you know.",
    )
    .strip()
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
FILLER_HINT_REGEX = re.compile(r"\b(um+|uh+|erm|er|ah+|hmm+|mm+|like|you know|i mean)\b", re.IGNORECASE)

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


def _count_filler_hints(text: str) -> int:
    return len(FILLER_HINT_REGEX.findall(text))


def _word_count(text: str) -> int:
    return len(re.findall(r"\b[a-zA-Z']+\b", text))


def _transcribe_sync(audio_path: str, language: str | None, prompt_phrases: list[str]):
    model = _get_model()
    base_kwargs: dict[str, Any] = {"beam_size": 5}

    if language:
        base_kwargs["language"] = language

    initial_prompt_parts = []
    if STT_DISFLUENCY_PROMPT:
        initial_prompt_parts.append(STT_DISFLUENCY_PROMPT)
    if prompt_phrases:
        initial_prompt_parts.append(", ".join(prompt_phrases))
    if initial_prompt_parts:
        base_kwargs["initial_prompt"] = " ".join(initial_prompt_parts)

    if _timestamp_mode == "words":
        base_kwargs["word_timestamps"] = True

    def run_pass(vad_filter: bool) -> dict[str, Any]:
        kwargs = {**base_kwargs, "vad_filter": vad_filter}
        segments_iter, info = model.transcribe(audio_path, **kwargs)
        full_text_parts: list[str] = []
        segments: list[dict[str, Any]] = []

        for segment in segments_iter:
            text = segment.text.strip()
            if not text:
                continue

            full_text_parts.append(text)

            if _timestamp_mode == "none":
                continue

            segment_payload: dict[str, Any] = {
                "start": round(float(segment.start), 3),
                "end": round(float(segment.end), 3),
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
        return {
            "text": " ".join(full_text_parts).strip(),
            "language": getattr(info, "language", None) or language,
            "durationSeconds": duration_seconds,
            # Keep legacy field for backward compatibility.
            "duration": duration_seconds,
            "segments": segments if segments else None,
        }

    # First pass uses VAD for cleaner segmentation.
    result = run_pass(vad_filter=True)
    primary_text = str(result.get("text", "")).strip()
    if primary_text:
        primary_fillers = _count_filler_hints(primary_text)
        primary_words = _word_count(primary_text)
        duration_seconds = float(result.get("durationSeconds") or 0)
        # If transcript is substantial but has zero disfluency tokens, run a second pass
        # without VAD to recover low-energy fillers that VAD can clip.
        if not (
            primary_fillers == 0 and
            primary_words >= 8 and
            duration_seconds >= 3
        ):
            return result
    else:
        primary_fillers = 0

    # Fallback pass without VAD recovers low-volume/short utterances and disfluencies.
    fallback = run_pass(vad_filter=False)
    fallback_text = str(fallback.get("text", "")).strip()
    if not fallback_text:
        return result

    fallback_fillers = _count_filler_hints(fallback_text)
    if not primary_text or fallback_fillers > primary_fillers:
        fallback["vadFallback"] = "disabled-vad"
        return fallback
    return result


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
