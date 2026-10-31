/* ═══ Wallop engine — the shared minute, the match, the markets ═══════════
   One battle every minute, for everyone at once. The match for minute M is
   genMatch(M): a seeded price path, so every browser (and the server, when it
   settles) sees the identical fight without talking to each other. Rounds are
   DERIVED from the path — direction over the 10-second countdown decides who
   lands — exactly as in the original mockup; only the clock changed.

   Minute layout (ms from the top of the minute):
     0      – BELL_AT   betting: pick the battle and the rounds, watch the clock
     BELL_AT– +ROUND_MS round 1 (10s shadowboxing countdown, blow at 1, 5s beat)
     …                  rounds 2 and 3
     end                the card, then the next minute's bell
   ═══════════════════════════════════════════════════════════════════════ */
import { mulberry } from './util.js';

export const CYCLE=60000, ROUNDS=3, ROUND_MS=15000, COUNTDOWN_MS=10000;
export const BELL_AT=CYCLE-ROUNDS*ROUND_MS;          /* 15 000: the bell */
export const FIGHT_MS=ROUNDS*ROUND_MS;
export const STEP_MS=100, STEPS=FIGHT_MS/STEP_MS;
/* battle numbers: minute index since the epoch, offset so the first battle on
   launch day read 1500 and the number keeps counting from there */
const BATTLE_BASE=29889298-1500;
export const battleNoOf = minute => minute-BATTLE_BASE;

/* the price path and the rounds it decides (ported from the mockup's sim.js) */
export function genMatch(seed){
  const r=mulberry(seed>>>0);
  const path=new Float64Array(STEPS+1);
  /* REAL SCALE. Path units are fractions of price (0.0004 = 0.04%). One 10-second
     countdown typically moves BTC/USD by a few hundredths of a percent, a wild
     one by a few tenths — so the step size is 1/100 of the mockup's. The round
     decision is z = |move| / sigma, both scaled together, so which rounds land
     and the measured NOBODY frequencies are untouched. */
  const K=0.01;
  const drift=(r()*2-1)*0.0006*K;
  let p=0;
  for(let i=1;i<=STEPS;i++){ p+=drift+(r()*2-1)*0.0065*K; path[i]=p; }
  const sigma=0.048*K*(0.8+r()*0.4);
  const DEAD=0.08;
  const per=ROUND_MS/STEP_MS, cd=COUNTDOWN_MS/STEP_MS;
  const rounds=[]; const score={a:0,b:0,draws:0};
  for(let i=0;i<ROUNDS;i++){
    const d=path[i*per+cd]-path[i*per], z=Math.abs(d)/sigma;
    const clinch=z<DEAD;
    const winner=clinch?null:(d>0?'a':'b');
    const tier=z<0.75?1:z<1.68?2:3;
    if(clinch) score.draws++; else score[winner]++;
    rounds.push({ i, delta:d, z, tier, clinch, winner,
                  start:BELL_AT+i*ROUND_MS, resolveAt:BELL_AT+i*ROUND_MS+COUNTDOWN_MS });
  }
  const winner=score.a>score.b?'a':score.b>score.a?'b':null;   /* null = nobody */
  return {seed,path,sigma,rounds,score,winner};
}

/* ═══ MARKETS ═══════════════════════════════════════════════════════════════
   Four of them, three options each: the left fighter (BTC/USD up over the
   countdown), NOBODY (flat, or a drawn battle), the right fighter (down).
   Costs are NOISE, wins pay TEETH. "Nobody" pays more because it is rare —
   its chance is shown on the button, from the measured frequencies below
   (tools: node measure.mjs), never typed by hand. */
export const MARKETS=[
  { key:'battle', label:'THE BATTLE', cost:50, pay:{a:3,b:3,nobody:10} },
  { key:'r1',     label:'ROUND 1',    cost:25, pay:{a:1,b:1,nobody:4},  round:0 },
  { key:'r2',     label:'ROUND 2',    cost:25, pay:{a:1,b:1,nobody:4},  round:1 },
  { key:'r3',     label:'ROUND 3',    cost:25, pay:{a:1,b:1,nobody:4},  round:2 },
];
/* measured over 100 000 seeded battles — see measure.mjs; re-run after any
   change to genMatch */
export const P_NOBODY={ battle:0.0521, round:0.0564 };

/* when a market stops taking picks, in ms from the top of the minute */
export const lockAt = m => m.round==null ? BELL_AT : BELL_AT+m.round*ROUND_MS;
/* what actually happened, once it has: 'a' | 'b' | 'nobody' | undefined */
export function outcome(match, m, t){
  if(m.round==null) return t>=CYCLE-1 ? (match.winner||'nobody') : undefined;
  const r=match.rounds[m.round];
  return t>=r.resolveAt ? (r.clinch?'nobody':r.winner) : undefined;
}

/* NOISE from tapping the fighter who is ahead during a countdown */
export const NOISE_PER_TAP=2, NOISE_TAP_CAP=80;      /* per round */
export const START_NOISE=100, SIGNUP_BONUS=250;

/* ═══ THE CLOCK ═══════════════════════════════════════════════════════════
   Wall clock, not page clock: ct() is the millisecond inside the current
   minute, so a tab opened mid-fight joins the fight everyone else is in. */
export class Clock{
  constructor(now=Date.now){ this.nowFn=now; this.offset=0; }
  now(){ return this.nowFn()+this.offset; }
  minute(){ return Math.floor(this.now()/CYCLE); }
  ct(){ return this.now()-this.minute()*CYCLE; }
  phase(){ return this.ct()<BELL_AT?'BETTING':'FIGHT'; }
  toBell(){ return Math.max(0,BELL_AT-this.ct()); }
  roundIndex(){ const t=this.ct()-BELL_AT; return t<0?-1:Math.min(ROUNDS-1,Math.floor(t/ROUND_MS)); }
  roundT(){ const t=this.ct()-BELL_AT; return t<0?0:t%ROUND_MS; }
  inCountdown(){ return this.phase()==='FIGHT' && this.roundT()<COUNTDOWN_MS; }
  countdownLeft(){ return Math.max(1,Math.ceil((COUNTDOWN_MS-this.roundT())/1000)); }
}
