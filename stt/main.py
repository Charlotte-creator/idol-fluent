"""Self-hosted STT microservice using faster-whisper."""

import asyncio
import os
import subprocess
import tempfile
import time
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

WHISPER_MODEL = os.getenv("WHISPER_MODEL", "base")
WHISPER_DEVICE = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
MAX_CONCURRENT = int(os.getenv("STT_MAX_CONCURRENT", "2"))

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
    # Pre-load model in background thread so first request isn't slow
    loop = asyncio.get_event_loop()
    await loop.run_in_executor(None, _get_model)


def _convert_to_wav(input_path: str) -> str:
    """Convert any audio to 16kHz mono WAV using ffmpeg."""
    wav_path = input_path + ".wav"
    result = subprocess.run(
        [
            "ffmpeg", "-y", "-i", input_path,
            "-ar", "16000", "-ac", "1", "-f", "wav", wav_path,
        ],
        capture_output=True,
        timeout=60,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {result.stderr.decode()[:500]}")
    return wav_path


def _transcribe_sync(audio_path: str, language: str | None):
    model = _get_model()
    kwargs: dict = {"beam_size": 5, "vad_filter": True}
    if language:
        kwargs["language"] = language
    segments_iter, info = model.transcribe(audio_path, **kwargs)
    segments = []
    full_text_parts = []
    for seg in segments_iter:
        segments.append({
            "start": round(seg.start, 3),
            "end": round(seg.end, 3),
            "text": seg.text.strip(),
            "confidence": round(1.0 - seg.no_speech_prob, 3) if seg.no_speech_prob is not None else None,
        })
        full_text_parts.append(seg.text.strip())

    return {
        "text": " ".join(full_text_parts),
        "language": info.language,
        "duration": round(info.duration, 3),
        "segments": segments if segments else None,
    }


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str | None = Form(None),
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
            with open(input_path, "wb") as f:
                content = await file.read()
                f.write(content)

            loop = asyncio.get_event_loop()
            wav_path = await loop.run_in_executor(None, _convert_to_wav, input_path)

            start_ms = time.monotonic_ns() // 1_000_000
            result = await loop.run_in_executor(
                None, _transcribe_sync, wav_path, language.strip() if language else None
            )
            elapsed_ms = (time.monotonic_ns() // 1_000_000) - start_ms
            result["processingMs"] = elapsed_ms

            return JSONResponse(content=result)
        except RuntimeError as e:
            raise HTTPException(status_code=422, detail=str(e))
        finally:
            import shutil
            shutil.rmtree(tmp_dir, ignore_errors=True)


@app.get("/health")
async def health():
    model_loaded = _model is not None
    return {"ok": True, "model": WHISPER_MODEL if model_loaded else None, "ready": model_loaded}
