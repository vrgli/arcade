/* ═══ Procedural audio. Zero asset files, zero licensing. ══════════════════
   Every sound is synthesised from oscillators and a noise buffer, and the
   impact sounds are derived from the SAME FX table row the visuals use
   (fx.js TIERS) — so retuning gore in that table retunes the audio with it,
   and an operator who clamps goreTierCeiling gets a quieter game for free.

   Browsers will not start an AudioContext without a gesture. unlock() is
   called from the first pointerdown anywhere and from the sound button.
   ═══════════════════════════════════════════════════════════════════════════ */
import { TIERS } from './fx.js';
import { clamp } from './util.js';

export class Audio{
  constructor(){ this.ctx=null; this.on=true; this.ready=false; this.crowdLvl=0; }

  unlock(){
    if(this.ctx){ if(this.ctx.state==='suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if(!AC) return;
    const c = this.ctx = new AC();

    this.master = c.createGain(); this.master.gain.value = this.on?0.9:0;
    this.master.connect(c.destination);

    /* a little room, so hits are not bone dry */
    this.verb = c.createConvolver();
    const L=Math.floor(c.sampleRate*0.6), buf=c.createBuffer(2,L,c.sampleRate);
    for(let ch=0;ch<2;ch++){ const d=buf.getChannelData(ch);
      for(let i=0;i<L;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/L,3.2); }
    this.verb.buffer=buf;
    this.verbGain=c.createGain(); this.verbGain.gain.value=0.22;
    this.verb.connect(this.verbGain); this.verbGain.connect(this.master);

    /* one shared noise buffer for every percussive element */
    const N=Math.floor(c.sampleRate*2), nb=c.createBuffer(1,N,c.sampleRate);
    const nd=nb.getChannelData(0); for(let i=0;i<N;i++) nd[i]=Math.random()*2-1;
    this.noiseBuf=nb;

    /* ── crowd bed ──────────────────────────────────────────────────────
       A single bandpass on steady noise at a fixed gain is, by construction,
       hiss: nothing in the signal moves, so the ear reads "broken device"
       rather than "people". This bed instead uses three overlapping bands
       weighted toward the low end, an irregular random-walk envelope per
       band, a lowpass that removes the frequencies hiss lives in, and
       occasional individual voices poking above the bed. */
    const src=c.createBufferSource(); src.buffer=nb; src.loop=true;
    src.playbackRate.value=0.82;                       /* heavier, less sibilant */
    const hp=c.createBiquadFilter(); hp.type='highpass'; hp.frequency.value=95;
    const lp=c.createBiquadFilter(); lp.type='lowpass';
    lp.frequency.value=1650; lp.Q.value=0.5;           /* kills the hiss band  */
    this.crowdSum=c.createGain(); this.crowdSum.gain.value=0;
    src.connect(hp);
    this.bands=[{f:165,q:1.2,w:1.00},{f:410,q:1.0,w:0.70},{f:1000,q:1.5,w:0.30}]
      .map(bd=>{
        const bp=c.createBiquadFilter(); bp.type='bandpass';
        bp.frequency.value=bd.f; bp.Q.value=bd.q;
        const g=c.createGain(); g.gain.value=bd.w*0.5;
        hp.connect(bp); bp.connect(g); g.connect(lp);
        return { g, w:bd.w, rw:0.5+Math.random()*0.4 };
      });
    lp.connect(this.crowdSum); this.crowdSum.connect(this.master);
    src.start();
    this.modT=0; this.nextVoice=0;

    this.ready=true;
  }

  setOn(v){ this.on=v; if(this.master) this.master.gain.value=v?0.9:0;
    if(this.crowdSum) this.crowdSum.gain.value=v?this.crowdSum.gain.value:0; }
  get t(){ return this.ctx.currentTime; }

  _noise(dur,type,f0,f1,gain,q=1,dest){
    const c=this.ctx, s=c.createBufferSource(); s.buffer=this.noiseBuf;
    s.playbackRate.value=0.8+Math.random()*0.4;
    const bp=c.createBiquadFilter(); bp.type=type; bp.Q.value=q;
    bp.frequency.setValueAtTime(f0,this.t);
    bp.frequency.exponentialRampToValueAtTime(Math.max(40,f1),this.t+dur);
    const g=c.createGain();
    g.gain.setValueAtTime(gain,this.t);
    g.gain.exponentialRampToValueAtTime(0.0001,this.t+dur);
    s.connect(bp); bp.connect(g); g.connect(dest||this.master); g.connect(this.verb);
    s.start(); s.stop(this.t+dur+0.02);
  }
  _tone(wave,f0,f1,dur,gain,dest){
    const c=this.ctx, o=c.createOscillator(), g=c.createGain();
    o.type=wave; o.frequency.setValueAtTime(f0,this.t);
    o.frequency.exponentialRampToValueAtTime(Math.max(18,f1),this.t+dur);
    g.gain.setValueAtTime(gain,this.t);
    g.gain.exponentialRampToValueAtTime(0.0001,this.t+dur);
    o.connect(g); g.connect(dest||this.master); g.connect(this.verb);
    o.start(); o.stop(this.t+dur+0.02);
  }

  /* ── impact: thud → crack → bone-crunch, every parameter read off TIERS ── */
  impact(tier){
    if(!this.ready||!this.on) return;
    const T=TIERS[tier]||TIERS[1];
    const tr=T.trauma, dur=0.10+(T.hitstop/1000)*1.3, gain=0.22+tr*0.45;
    this._tone('sine', 170-tr*85, (170-tr*85)*0.32, dur, gain);          /* body  */
    this._tone('triangle', 300-tr*120, 70, dur*0.55, gain*0.5);          /* snap  */
    this._noise(0.04+tr*0.20,'bandpass', 2600-tr*900, 300, gain*0.8, 1.2);
    this._noise(0.012,'highpass', 4200, 3000, gain*0.45, 0.7);           /* click */
    if(tier>=3) this._tone('sine',52,30,0.55,gain*0.8);                  /* sub   */
    /* the crunch: one gated noise burst per impact ring */
    for(let i=1;i<T.rings;i++) setTimeout(()=>{
      if(this.ready&&this.on) this._noise(0.05,'bandpass',1500-i*300,200,gain*0.5,3);
    }, 38*i);
  }

  ko(){
    if(!this.ready||!this.on) return;
    this._tone('sawtooth',320,42,1.3,0.42);
    this._tone('sine',70,28,1.6,0.38);
    this._noise(0.9,'lowpass',1800,180,0.3,0.7);
    setTimeout(()=>{ if(this.ready&&this.on){
      this._tone('square',180,90,0.5,0.14); this.swell(1.6); } },240);
  }

  /* crowd bed tracks the meter; swell() is a one-off roar on top */
  crowd(level, dt=0.016){
    if(!this.ready) return;
    const v=clamp(level,0,1); this.crowdLvl=v; const t=this.t;
    this.crowdSum.gain.setTargetAtTime((this.on?1:0)*(0.007+v*0.07), t, 0.35);

    /* irregular breathing: each band random-walks on its own, re-targeted at
       uneven intervals so nothing in the bed is periodic */
    this.modT-=dt;
    if(this.modT<=0){
      this.modT=0.17+Math.random()*0.36;
      for(const b of this.bands){
        b.rw=clamp(b.rw+(Math.random()-0.5)*0.55,0.22,1.0);
        b.g.gain.setTargetAtTime(b.w*b.rw*(0.4+v*0.8), t, 0.24);
      }
    }

    /* individual voices above the bed — the part that actually reads as
       people rather than as noise. Rate rises with the meter. */
    if(t>this.nextVoice){
      this.nextVoice = t + 0.45 + Math.random()*(2.8 - v*2.2);
      if(v>0.03 && this.on) this._voice(v);
    }
  }
  _voice(v){
    const dur=0.09+Math.random()*0.24, f=600+Math.random()*1000;
    this._noise(dur,'bandpass',f,f*0.5,(0.018+v*0.05)*(0.6+Math.random()*0.8),7);
  }
  swell(mult=1){
    if(!this.ready||!this.on) return;
    const g=this.crowdSum.gain, t=this.t;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value,t);
    g.linearRampToValueAtTime(Math.min(0.26,0.09*mult+this.crowdLvl*0.1), t+0.12);
    g.setTargetAtTime(0.007+this.crowdLvl*0.07, t+0.3, 0.5);
    for(let i=0;i<3+Math.round(mult*3);i++)
      setTimeout(()=>{ if(this.ready&&this.on) this._voice(0.9); }, 40+Math.random()*420);
  }

  /* The countdown is silent from 10 to 4 — the crowd carries that stretch,
     and a per-second tick the whole way down was competing with it. Three
     rising tones at 3, 2 and 1, each higher and louder than the last, then
     the impact. `n` is the beat; anything above 3 makes no sound. */
  tick(n){
    if(!this.ready||!this.on) return;
    if(!(n>=1&&n<=3)) return;
    const step = 4-n;                      /* 1, 2, 3 as the beats arrive */
    const f    = [0,880,1180,1560][step];
    const gain = [0,0.085,0.115,0.155][step];
    const len  = [0,0.055,0.065,0.085][step];
    this._tone('square', f, f*1.04, len, gain);
  }
  /* the flat, unresolved sound: a clinch, or a vote that did not come in.
     It used to borrow the countdown tick, which now means something else. */
  thud(){
    if(!this.ready||!this.on) return;
    this._tone('triangle', 240, 150, 0.14, 0.07);
  }
  blip(big){                                    /* a bet lands */
    if(!this.ready||!this.on) return;
    this._tone('sine',620,big?1180:880,big?0.16:0.09,big?0.13:0.08);
  }
  tap(){
    if(!this.ready||!this.on) return;
    this._tone('triangle',900+Math.random()*420,1600,0.035,0.045);
  }
  lock(){
    if(!this.ready||!this.on) return;
    this._tone('sawtooth',150,60,0.45,0.3); this._noise(0.3,'lowpass',900,200,0.2);
  }
}
