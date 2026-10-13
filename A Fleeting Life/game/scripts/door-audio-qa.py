"""Render amplitude and real PCM spectrum for the opening-door QA artifact."""
import json
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'build/qa/door-audio-v4'
OUT.mkdir(parents=True, exist_ok=True)
with wave.open(str(ROOT / 'assets/resources/audio/door.wav'), 'rb') as wav:
    rate = wav.getframerate()
    channels = wav.getnchannels()
    raw = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2').astype(np.float64) / 32768
    samples = raw.reshape(-1, channels).mean(axis=1)
duration = len(samples) / rate
image = Image.new('RGB', (1140, 720), '#101f22')
draw = ImageDraw.Draw(image)
font = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 17)
small = ImageFont.truetype('C:/Windows/Fonts/consola.ttf', 14)
draw.text((34, 22), 'FLEETING LIFE / RECORDED WOODEN DOOR CREAK', fill='#efe6cc', font=font)
draw.text((34, 52), 'PDSounds field recordings: handle contact / one hinge swing', fill='#9ab5a8', font=small)
draw.text((34, 76), f'{duration:.2f} s  |  stereo PCM downmixed for display  |  {rate:,} Hz  |  public domain recordings', fill='#9ab5a8', font=small)
x0, width = 65, 1025
wave_top, wave_height = 135, 174
draw.rectangle((x0, wave_top, x0 + width, wave_top + wave_height), fill='#192a2e')
mid = wave_top + wave_height // 2
draw.line((x0, mid, x0 + width, mid), fill='#3a5153')
for column in range(width):
    chunk = samples[int(column * len(samples) / width):int((column + 1) * len(samples) / width)]
    if not len(chunk):
        continue
    draw.line((x0 + column, mid - float(chunk.max()) * 100, x0 + column, mid - float(chunk.min()) * 100), fill='#bfd7b9')
draw.text((65, 111), 'AMPLITUDE', fill='#e5d7b1', font=small)
fft_size, hop = 2048, 256
frames = np.stack([samples[start:start + fft_size] * np.hanning(fft_size) for start in range(0, len(samples) - fft_size, hop)])
spectrum = np.abs(np.fft.rfft(frames, axis=1)).T
max_bin = int(4000 * fft_size / rate)
spectrum = spectrum[:max_bin]
db = 20 * np.log10(np.maximum(spectrum, 1e-6) / spectrum.max())
level = np.clip((db + 62) / 62, 0, 1)
rgb = np.stack([23 + level * 217, 39 + level ** 1.6 * 153, 44 + level ** 3.4 * 70], axis=-1).astype(np.uint8)
spec_image = Image.fromarray(rgb[::-1], 'RGB').resize((width, 245), Image.Resampling.BILINEAR)
spec_top = 355
image.paste(spec_image, (x0, spec_top))
draw.text((65, 329), 'SPECTRUM / 0-4 kHz / 62 dB range', fill='#e5d7b1', font=small)
for freq in [0, 1000, 2000, 3000, 4000]:
    y = spec_top + 245 - freq / 4000 * 245
    draw.text((14, int(y) - 6), f'{freq // 1000}k', fill='#9ab5a8', font=small)
for seconds in [0, .5, 1, 1.5, 2, 2.5]:
    x = int(x0 + seconds / duration * width)
    draw.text((x - 8, 614), f'{seconds:g}s', fill='#9ab5a8', font=small)
for seconds, label, label_x in [(.1, 'handle', 65), (.3, 'hinge', 275), (2.1, 'settle', 760)]:
    x = int(x0 + seconds / duration * width)
    draw.line((x, 135, x, 309), fill='#b39b5c')
    draw.text((label_x, 649), f'{label} {seconds:g}s', fill='#d2bc82', font=small)
draw.text((65, 681), 'One recorded opening swing, normalized gently and aligned to the door animation.', fill='#9ab5a8', font=small)
image.save(OUT / 'door-waveform-spectrum.png')
print(OUT / 'door-waveform-spectrum.png')
