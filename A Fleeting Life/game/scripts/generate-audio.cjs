const fs=require('fs'),path=require('path');const out=path.resolve(__dirname,'../assets/resources/audio');fs.mkdirSync(out,{recursive:true});const tones={jump:460,land:140,break:180,confirm:660,click:520,collect:880,fall:90,bell:1046,rumble:60,crack:180,step:100,choice:660,reverse:220,shutter:920,ending:440,hit:80,dive:150,slide:110,chalk:260,item:700,piano:523,fragment:880,life:1046,candy:784,ui:520};for(const [name,f] of Object.entries(tones)){const rate=22050,n=Math.floor(rate*.18),b=Buffer.alloc(44+n*2);b.write('RIFF');b.writeUInt32LE(36+n*2,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++){const t=i/rate,v=Math.sin(2*Math.PI*f*(t-t*t))*Math.exp(-t*30)*.18;b.writeInt16LE(Math.round(v*32767),44+i*2);}fs.writeFileSync(path.join(out,name+'.wav'),b);}console.log('Generated '+Object.keys(tones).length+' placeholder WAV cues.');
require('./generate-door-audio.cjs').generateDoorCue();

const crypto = require('crypto');
const MEMORY_RATE = 22050;
const memoryDurations = {
  memoryGate: 1.75, memoryRain: 2.35, memoryPaper: 1.55,
  memoryCorridor: 1.85, memoryBench: 1.8,
  memoryLamp: 2.15, memoryPhoto: 1.55
};

function synthMemoryCue(name, duration) {
  const samples = new Float64Array(Math.round(MEMORY_RATE * duration));
  let seed = crypto.createHash('sha256').update(name).digest().readUInt32LE(0);
  const random = () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return (seed >>> 0) / 0x80000000 - 1;
  };
  const tau = 2 * Math.PI;
  function tone(start, length, amp, from, to = from, decay = length) {
    const offset = Math.round(start * MEMORY_RATE);
    const count = Math.min(Math.round(length * MEMORY_RATE), samples.length - offset);
    let phase = 0;
    for (let i = 0; i < count; i++) {
      const t = i / MEMORY_RATE;
      phase += tau * (from + (to - from) * t / length) / MEMORY_RATE;
      const edge = Math.min(1, t / 0.006, (length - t) / 0.045);
      samples[offset + i] += amp * edge * Math.exp(-t / decay)
        * (Math.sin(phase) + 0.17 * Math.sin(phase * 2));
    }
  }
  function noise(start, length, amp, cutoff, high = false, decay = false) {
    const offset = Math.round(start * MEMORY_RATE);
    const count = Math.min(Math.round(length * MEMORY_RATE), samples.length - offset);
    const alpha = 1 - Math.exp(-tau * cutoff / MEMORY_RATE);
    let low = 0;
    for (let i = 0; i < count; i++) {
      const t = i / MEMORY_RATE, raw = random();
      low += alpha * (raw - low);
      const edge = Math.min(1, t / 0.009, (length - t) / 0.06);
      const envelope = decay
        ? Math.exp(-t / Math.max(0.018, length * 0.23))
        : Math.sin(Math.PI * t / length);
      samples[offset + i] += amp * edge * envelope * (high ? raw - low : low);
    }
  }
  function wood(at, strength = 1) {
    tone(at, 0.29, 0.050 * strength, 185, 105, 0.09);
    noise(at, 0.11, 0.042 * strength, 850, false, true);
  }
  function drop(at, strength = 1) {
    tone(at, 0.2, 0.049 * strength, 720, 390, 0.085);
    noise(at, 0.07, 0.027 * strength, 1800, true, true);
  }
  switch (name) {
    case 'memoryGate':
      wood(0.13); wood(0.48, 0.72);
      tone(0.54, 0.84, 0.023, 260, 172, 0.44);
      tone(1.06, 0.58, 0.016, 880, 720, 0.33);
      break;
    case 'memoryRain':
      noise(0.03, 2.25, 0.020, 1150);
      for (const [at, strength] of [[0.24, 0.70], [0.68, 1], [1.29, 0.78], [1.84, 0.95]]) drop(at, strength);
      break;
    case 'memoryPaper':
      noise(0.10, 0.48, 0.052, 950, true);
      noise(0.60, 0.59, 0.059, 1120, true);
      tone(0.22, 0.25, 0.017, 230, 165, 0.10);
      tone(1.08, 0.30, 0.020, 190, 130, 0.12);
      break;
    case 'memoryCorridor':
      noise(0.03, 1.72, 0.009, 330);
      wood(0.18, 0.93); wood(0.78, 0.77);
      tone(0.46, 0.39, 0.018, 180, 100, 0.17);
      tone(1.05, 0.42, 0.014, 180, 100, 0.19);
      break;
    case 'memoryBench':
      wood(0.23, 0.72);
      tone(0.37, 0.93, 0.051, 290, 165, 0.59);
      tone(0.46, 0.76, 0.019, 415, 255, 0.43);
      wood(1.21, 0.48);
      break;
    case 'memoryLamp': {
      noise(0.16, 0.085, 0.065, 2300, true, true);
      tone(0.18, 0.18, 0.021, 150, 85, 0.06);
      const start = Math.round(0.35 * MEMORY_RATE);
      const count = Math.round(1.66 * MEMORY_RATE);
      for (let i = 0; i < count; i++) {
        const t = i / MEMORY_RATE;
        const edge = Math.min(1, t / 0.22, (1.66 - t) / 0.27);
        const flutter = 0.92 + 0.08 * Math.sin(tau * 4.1 * t);
        samples[start + i] += edge * flutter * (
          0.020 * Math.sin(tau * 120 * t)
          + 0.008 * Math.sin(tau * 240 * t)
          + 0.004 * Math.sin(tau * 356 * t));
      }
      break;
    }
    case 'memoryPhoto':
      wood(0.15, 0.66);
      noise(0.20, 0.10, 0.073, 1700, true, true);
      wood(0.35, 1.08);
      noise(0.37, 0.095, 0.052, 2100, true, true);
      tone(0.51, 0.67, 0.025, 300, 155, 0.31);
      break;
    default: throw new Error('Unknown memory cue: ' + name);
  }
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const edge = Math.min(1, i / (MEMORY_RATE * 0.01),
      (samples.length - i - 1) / (MEMORY_RATE * 0.11));
    samples[i] *= Math.max(0, edge);
    peak = Math.max(peak, Math.abs(samples[i]));
  }
  if (peak < 0.001) throw new Error(name + ' is silent');
  const scale = 0.12 / peak;
  for (let i = 0; i < samples.length; i++) samples[i] *= scale;
  return samples;
}

function writeMemoryWav(name, samples) {
  const pcm = Buffer.alloc(44 + samples.length * 2);
  pcm.write('RIFF'); pcm.writeUInt32LE(36 + samples.length * 2, 4);
  pcm.write('WAVE', 8); pcm.write('fmt ', 12);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20);
  pcm.writeUInt16LE(1, 22); pcm.writeUInt32LE(MEMORY_RATE, 24);
  pcm.writeUInt32LE(MEMORY_RATE * 2, 28);
  pcm.writeUInt16LE(2, 32); pcm.writeUInt16LE(16, 34);
  pcm.write('data', 36); pcm.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    const value = Math.max(-1, Math.min(1, samples[i]));
    pcm.writeInt16LE(Math.round(value * 32767), 44 + i * 2);
  }
  fs.writeFileSync(path.join(out, name + '.wav'), pcm);
}

function ensureMemoryMeta(name) {
  const target = path.join(out, name + '.wav.meta');
  if (fs.existsSync(target)) return;
  const hash = crypto.createHash('sha256').update('fleeting-life-memory/' + name).digest('hex');
  const uuid = hash.slice(0, 8) + '-' + hash.slice(8, 12)
    + '-4' + hash.slice(13, 16) + '-8' + hash.slice(17, 20) + '-' + hash.slice(20, 32);
  fs.writeFileSync(target, JSON.stringify({
    ver: '1.0.0', importer: 'audio-clip', imported: true, uuid,
    files: ['.json', '.wav'], subMetas: {}, userData: { downloadMode: 0 }
  }, null, 2) + '\n');
}

for (const [name, duration] of Object.entries(memoryDurations)) {
  writeMemoryWav(name, synthMemoryCue(name, duration));
  ensureMemoryMeta(name);
}
console.log('Generated ' + Object.keys(memoryDurations).length + ' original memory WAV cues.');
