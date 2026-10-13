'use strict';
if (require.main === module) {
 console.error('This synthetic version was replaced. Run: python scripts/import-door-audio.py');
 process.exitCode = 1;
 process.exit();
}
// Original, deterministic physical-style synthesis: dry hinges, stick/slip
// friction, a wooden latch and the short room response. No sampled recording.
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const RATE=44100,DURATION=2.72,TAU=2*Math.PI;
function generateDoorCue(){
 const samples=new Float64Array(Math.round(RATE*DURATION));
 let seed=0x5da38f12;
 const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/0x80000000-1;};
 const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
 // A moving rough hinge excites several irregular resonances; the pitch is
 // carried by friction rather than a clean musical oscillator.
 function creak(start,length,strength,base,bend){
  const offset=Math.round(start*RATE),count=Math.round(length*RATE);
  let phase=0,rough=0,body=0,high=0,lastRaw=0;
  const resonances=[1,1.87,2.73,4.13,5.43];
  const weights=[.43,.25,.15,.1,.055];
  for(let i=0;i<count&&offset+i<samples.length;i++){
   const t=i/RATE,u=t/length,raw=random();
   rough+=.041*(raw-rough);body+=.012*(raw-body);high=.65*high+raw-lastRaw;lastRaw=raw;
   const grain=.69+.19*Math.sin(TAU*7.7*t+.6)+.09*Math.sin(TAU*19.2*t)+.075*Math.sin(TAU*37.1*t);
   const irregular=.9+rough*.95+.06*Math.sin(TAU*23.4*t)+.03*Math.sin(TAU*61*t);
   const pitch=base+bend*smooth(u)+base*.073*Math.sin(TAU*1.61*t)+base*.043*Math.sin(TAU*4.47*t)+rough*32;
   phase+=TAU*pitch/RATE;
   let resonant=0;for(let n=0;n<resonances.length;n++)resonant+=weights[n]*Math.sin(phase*resonances[n]+rough*(n+1)*2.3);
   const stick=Math.tanh((resonant+high*.065)*2.15)/1.6;
   const envelope=smooth(t/.065)*(1-smooth((t-length+.21)/.21))*(.82+.18*Math.sin(Math.PI*u));
   samples[offset+i]+=strength*envelope*grain*(stick*irregular+rough*.52+body*.32+high*.016);
  }
 }
 function wood(at,strength,low=115){
  const offset=Math.round(at*RATE),length=.28,count=Math.round(length*RATE);
  let filtered=0;
  for(let i=0;i<count&&offset+i<samples.length;i++){
   const t=i/RATE;filtered+=.22*(random()-filtered);
   const edge=smooth(t/.002);
   const modes=Math.sin(TAU*low*t)*Math.exp(-t/ .055)+.38*Math.sin(TAU*(low*2.39)*t)*Math.exp(-t/.025)+.23*Math.sin(TAU*(low*4.7)*t)*Math.exp(-t/.009);
   samples[offset+i]+=strength*edge*(modes+filtered*.75)*Math.exp(-t/.15);
  }
 }
 function scrape(at,length,strength){
  const offset=Math.round(at*RATE),count=Math.round(length*RATE);let low=0,last=0;
  for(let i=0;i<count&&offset+i<samples.length;i++){
   const t=i/RATE,raw=random();low+=.09*(raw-low);const grain=raw-low;
   last=.81*last+.19*grain;
   const envelope=smooth(t/.025)*(1-smooth((t-length+.07)/.07));
   samples[offset+i]+=strength*envelope*last*(.65+.35*Math.sin(TAU*13.1*t)**2);
  }
 }
 // Handle takes the latch at 0.16 s; the main hinge catches at 0.31 s.
 wood(.16,.23,143);wood(.238,.11,212);scrape(.225,.25,.12);
 creak(.305,.61,.43,232,87);
 creak(.79,.87,.35,322,-171);
 creak(1.39,.53,.24,174,73);
 scrape(.335,1.57,.095);
 for(const [at,volume] of [[.49,.037],[.71,.047],[1.065,.04],[1.28,.032],[1.61,.027]])wood(at,volume,95+at*23);
 wood(1.875,.12,102);wood(2.055,.054,159);scrape(1.77,.28,.045);
 // Subtle reflections from the small corridor, no long reverberant tail.
 const dry=samples.slice();for(const [delay,gain] of [[.021,.12],[.047,.075],[.079,.039]]){
  const shift=Math.round(delay*RATE);for(let i=shift;i<samples.length;i++)samples[i]+=dry[i-shift]*gain;
 }
 let peak=0;for(let i=0;i<samples.length;i++){
  const edge=1-smooth((i/RATE-2.42)/.24);samples[i]*=edge;peak=Math.max(peak,Math.abs(samples[i]));
 }
 const scale=.73/peak;let sum=0;for(let i=0;i<samples.length;i++){samples[i]*=scale;sum+=samples[i]**2;}
 const wav=Buffer.alloc(44+samples.length*2);wav.write('RIFF');wav.writeUInt32LE(36+samples.length*2,4);wav.write('WAVE',8);wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(RATE,24);wav.writeUInt32LE(RATE*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples.length*2,40);
 for(let i=0;i<samples.length;i++)wav.writeInt16LE(Math.round(samples[i]*32767),44+i*2);
 const root=path.resolve(__dirname,'..'),target=path.join(root,'assets/resources/audio/door.wav');fs.writeFileSync(target,wav);
 const qa=path.join(root,'build/qa/ui-detail-v3/audio');fs.mkdirSync(qa,{recursive:true});
 const windows=[];for(let start=0;start<DURATION;start+=.1){let energy=0,max=0,n=0;for(let i=Math.round(start*RATE);i<Math.min(samples.length,Math.round((start+.1)*RATE));i++){energy+=samples[i]**2;max=Math.max(max,Math.abs(samples[i]));n++;}windows.push({seconds:Number(start.toFixed(1)),rms:Math.sqrt(energy/n),peak:max});}
 const report={source:'Original deterministic physical-style synthesis; no external sampled recording.',file:'assets/resources/audio/door.wav',rate:RATE,channels:1,seconds:DURATION,peak:.73,rms:Math.sqrt(sum/samples.length),runtimeGain:.48,sha256:crypto.createHash('sha256').update(wav).digest('hex'),timing:{handle:.16,mainHinge:.305,woodRelease:1.875,tailEnd:2.42},windows};
 fs.writeFileSync(path.join(qa,'door-audio.json'),JSON.stringify(report,null,2)+'\n');
 console.log('Generated original old wooden door cue: '+DURATION+' s, '+RATE+' Hz, mono PCM; kept existing asset meta/UUID.');return report;
}
if(require.main===module)generateDoorCue();
module.exports={generateDoorCue};
