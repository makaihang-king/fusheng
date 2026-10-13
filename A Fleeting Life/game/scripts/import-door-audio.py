"""Build the opening-door cue from Mixkit's single-opening recording."""
import hashlib
import json
import shutil
import wave
from pathlib import Path

import av
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'assets/audio-sources/mixkit-creaky-door-open-195.wav'
TARGET = ROOT / 'assets/resources/audio/door.wav'
QA = ROOT / 'build/qa/door-audio-v5'
RATE = 44100
DURATION = 2.72
CUE_IN_AT = 0.08
SOURCE_SECONDS = DURATION - CUE_IN_AT
FADE_IN_SECONDS = 0.012
TAIL_FADE_START = 2.38
TARGET_PEAK = 0.58


def decode_stereo(source):
    container = av.open(str(source))
    stream = container.streams.audio[0]
    resampler = av.AudioResampler(format='fltp', layout='stereo', rate=RATE)
    chunks = []
    for frame in container.decode(stream):
        chunks.extend(output.to_ndarray() for output in resampler.resample(frame))
    chunks.extend(output.to_ndarray() for output in resampler.resample(None))
    container.close()
    return np.concatenate(chunks, axis=1).astype(np.float64, copy=False)


def main():
    if not SOURCE.is_file():
        raise FileNotFoundError(SOURCE)
    QA.mkdir(parents=True, exist_ok=True)
    backup = QA / 'source-before/door.wav'
    if not backup.exists() and TARGET.exists():
        backup.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(TARGET, backup)

    source = decode_stereo(SOURCE)
    count = round(DURATION * RATE)
    cue_start = round(CUE_IN_AT * RATE)
    copy_count = min(round(SOURCE_SECONDS * RATE), source.shape[1], count - cue_start)
    samples = np.zeros((2, count), dtype=np.float64)
    samples[:, cue_start:cue_start + copy_count] = source[:, :copy_count]

    fade_in = min(round(FADE_IN_SECONDS * RATE), copy_count)
    samples[:, cue_start:cue_start + fade_in] *= np.linspace(0.0, 1.0, fade_in)[None, :]

    fade_at = round(TAIL_FADE_START * RATE)
    phase = np.linspace(0.0, 1.0, count - fade_at, endpoint=True)
    samples[:, fade_at:] *= (0.5 + 0.5 * np.cos(np.pi * phase))[None, :]

    peak_before_gain = float(np.max(np.abs(samples)))
    if peak_before_gain <= 0:
        raise ValueError('The source recording is silent')
    samples *= TARGET_PEAK / peak_before_gain
    pcm = np.rint(np.clip(samples.T, -1, 1) * 32767).astype('<i2')

    with wave.open(str(TARGET), 'wb') as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(pcm.tobytes())

    final_peak = float(np.max(np.abs(pcm.astype(np.float64) / 32768)))
    rms = float(np.sqrt(np.mean((pcm.astype(np.float64) / 32768) ** 2)))
    report = {
        'source': {
            'file': 'assets/audio-sources/mixkit-creaky-door-open-195.wav',
            'pageUrl': 'https://mixkit.co/free-sound-effects/doors/',
            'downloadUrl': 'https://mixkit.co/free-sound-effects/download/195/',
            'title': 'Creaky door open',
            'itemId': 195,
            'license': 'Mixkit Sound Effects Free License',
        },
        'transform': {
            'cueInSeconds': CUE_IN_AT,
            'fadeInSeconds': FADE_IN_SECONDS,
            'tailFadeStartsAtSeconds': TAIL_FADE_START,
            'trimSeconds': SOURCE_SECONDS,
            'peakNormalization': TARGET_PEAK,
        },
        'file': str(TARGET.relative_to(ROOT)).replace('\\', '/'),
        'sampleRate': RATE,
        'channels': 2,
        'seconds': len(pcm) / RATE,
        'peak': final_peak,
        'rms': rms,
        'sha256': hashlib.sha256(TARGET.read_bytes()).hexdigest(),
    }
    (QA / 'door-audio.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
