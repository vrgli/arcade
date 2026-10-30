/* ═══ Wallop — wiring ═══════════════════════════════════════════════════════
   The engine owns the minute and the match; the arena paints the fight; this
   file owns the player: picks, noise, teeth, the account, and the DOM. */
import { CYCLE, ROUNDS, ROUND_MS, COUNTDOWN_MS, BELL_AT, STEP_MS, STEPS, Clock, genMatch, battleNoOf,
         MARKETS, P_NOBODY, lockAt, outcome, NOISE_PER_TAP, NOISE_TAP_CAP, START_NOISE } from './engine.js';
import { Arena, WORLD_W, WORLD_H } from './arena.js';
import { setSkinPair, SKIN_LIBRARY, drawFighter, poseBounds } from './fighters.js';
import { Audio } from './audio.js';
import { $, $$, clamp, mmss } from './util.js';

const app=$('#app'), arenaEl=$('#arenaWrap');
const clock=new Clock();
const arena=new Arena($('#arena'),{wrap:arenaEl,tint:$('#tintLayer')});
const audio=new Audio(); audio.on=false;
arena.sfx={ impact:t=>audio.impact(t), ko:()=>audio.swell(1.4) };

/* ── the player ──────────────────────────────────────────────────────────── */
const LS={ get:k=>{try{return localStorage.getItem(k);}catch(e){return null;}}, set:(k,v)=>{try{localStorage.setItem(k,v);}catch(e){}} };
const me=Object.assign({ noise:START_NOISE, teeth:0, battles:0, bets:0, betsWon:0, signupSeen:false },
  (()=>{ try{ return JSON.parse(LS.get('wallop.wallet')||'{}'); }catch(e){ return {}; } })());
let account=null, providers={};
const save=()=>LS.set('wallop.wallet',JSON.stringify(me));

/* ── the current battle ──────────────────────────────────────────────────── */
let cur=null;                 /* {minute, match, no, resolved:Set, picks:{}, tapNoise:{}, results:{}} */
let prev=null;                /* last finished battle, for the card */
function startBattle(minute){
  const match=genMatch(minute);
  cur={ minute, match, no:battleNoOf(minute), resolved:new Set(), picks:{}, tapNoise:{}, results:{}, teethWon:0 };
  /* joined mid-fight: rounds already decided are marked, not replayed */
  for(const r of match.rounds) if(r.resolveAt<=clock.ct()) cur.resolved.add(r.i);
  arena.newMatch(); arena.setFraming('fight'); arena.setMode(clock.phase()==='FIGHT'?'shadow':'idle');
  $('#battleNo').textContent=cur.no;
  renderMarkets();
}

/* ── skins (a costume; the fight is the same for everyone) ─────────────── */
const SKIN_IDS=Object.keys(SKIN_LIBRARY); let skinId=LS.get('wallop.skin'); if(!SKIN_LIBRARY[skinId]) skinId=SKIN_IDS[0];
const faceURL={a:'',b:''};
function paintFaces(pair){
  for(const side of ['a','b']){
    const cv=document.createElement('canvas'); cv.width=cv.height=96; const x=cv.getContext('2d');
    const b=poseBounds(pair[side],'neutral'); const sc=(96/Math.max(1,b.y1-b.y0))*1.45;
    x.imageSmoothingEnabled=false; x.save(); x.translate(48-((b.x0+b.x1)/2)*sc, 6-b.y0*sc);
    drawFighter(x,pair[side],'neutral',{x:0,groundY:0,scale:sc}); x.restore();
    faceURL[side]=cv.toDataURL();
  }
}
function useSkin(id){
  skinId=id; const pair=setSkinPair(id); LS.set('wallop.skin',id); paintFaces(pair);
  for(const [sel,v] of [['#nameA',pair.a.name],['#nameB',pair.b.name],['#tapNameA',pair.a.name],['#tapNameB',pair.b.name],['#howA',pair.a.name],['#howB',pair.b.name]]) $(sel).textContent=v;
  $('#themeName').textContent=pair.a.name+' vs '+pair.b.name;
  renderMarkets();
}
$('#btnTheme').onclick=()=>{ useSkin(SKIN_IDS[(SKIN_IDS.indexOf(skinId)+1)%SKIN_IDS.length]); toast(SKIN_LIBRARY[skinId].a.name+'  vs  '+SKIN_LIBRARY[skinId].b.name); };

/* ── markets ─────────────────────────────────────────────────────────────── */
const pair=()=>SKIN_LIBRARY[skinId];
const pct=p=>(p*100).toFixed(p<0.1?1:0)+'%';
function marketState(m){
  if(!cur) return 'open';
  if(cur.results[m.key]) return cur.results[m.key].won?'won':'lost';
  return clock.ct()>=lockAt(m)?'locked':'open';
}
function renderMarkets(){
  if(!cur) return;
  const P=pair(), ct=clock.ct();
  $('#markets').innerHTML=MARKETS.map(m=>{
    const st=marketState(m), pick=cur.picks[m.key], res=cur.results[m.key];
    const left=Math.max(0,lockAt(m)-ct);
    const state = st==='won' ? `WON · +${res.teeth} TEETH` : st==='lost' ? (res.out==='nobody'?'NOBODY LANDED':'LOST')
                : st==='locked' ? (pick?'LOCKED · PICKED':'LOCKED') : `LOCKS IN ${mmss(left)}`;
    const opt=(k,label,sub,img)=>`<button class="opt ${k}${pick===k?' on':''}${res&&res.out===k?' result':''}" data-m="${m.key}" data-k="${k}">${img?`<img src="${img}" alt="">`:''}${label}<small>${sub}</small></button>`;
    return `<div class="mkt ${m.key==='battle'?'battle':''} ${st}">
      <div class="m-head"><b>${m.label}</b><span>${m.cost} NOISE · PAYS ${m.pay.a}${m.key==='battle'?' / 10':' / 4'} TEETH</span><span class="state">${state}</span></div>
      <div class="m-opts">
        ${opt('a',P.a.name,'BTC UP',faceURL.a)}
        ${opt('nobody','NOBODY',(m.key==='battle'?'DRAW · ':'FLAT · ')+pct(m.key==='battle'?P_NOBODY.battle:P_NOBODY.round),null)}
        ${opt('b',P.b.name,'BTC DOWN',faceURL.b)}
      </div></div>`;
  }).join('');
}
$('#markets').addEventListener('click',e=>{
  const b=e.target.closest('.opt'); if(!b||!cur) return;
  const m=MARKETS.find(x=>x.key===b.dataset.m), k=b.dataset.k;
  if(clock.ct()>=lockAt(m)) return;
  audio.unlock();
  const had=cur.picks[m.key];
  if(had){ me.noise+=m.cost; me.bets--; cur.picks[m.key]=null; }       /* refund, then maybe re-pick */
  if(had!==k){
    if(me.noise<m.cost){ toast('NOT ENOUGH NOISE · TAP THE FIGHTER WHO IS AHEAD'); audio.blip(false); }
    else { me.noise-=m.cost; me.bets++; cur.picks[m.key]=k; audio.blip(true); }
  } else audio.blip(false);
  save(); paintWallet(); renderMarkets(); track('pick',{mode:m.key,extra:{k,on:!!cur.picks[m.key]}});
});
function settle(m){
  const out=outcome(cur.match,m,clock.ct()); if(out===undefined||cur.results[m.key]) return;
  const pick=cur.picks[m.key]; const won=!!pick&&pick===out; const teeth=won?m.pay[out]:0;
  cur.results[m.key]={out,won,teeth,pick};
  if(pick){ if(won){ me.teeth+=teeth; me.betsWon++; cur.teethWon+=teeth; toast(`+${teeth} TEETH · ${m.label}`); audio.swell(1.2); } }
  save(); paintWallet(); renderMarkets();
}

/* ── taps: NOISE for backing the fighter who is ahead ───────────────────── */
let lead=null;
function tap(side,e){
  if(!cur||!clock.inCountdown()) return;
  audio.unlock();
  const ri=clock.roundIndex(); cur.tapNoise[ri]=cur.tapNoise[ri]||0;
  const r=arenaEl.getBoundingClientRect();
  const px=(e.clientX||r.left+r.width*(side==='a'?.3:.7))-r.left, py=(e.clientY||r.top+r.height*.6)-r.top;
  arena.tap(px*(WORLD_W/r.width), py*(WORLD_W/r.width)+arena.viewTop);
  let gain=0;
  if(lead===side && cur.tapNoise[ri]<NOISE_TAP_CAP){ gain=NOISE_PER_TAP; cur.tapNoise[ri]+=gain; me.noise+=gain; audio.tap(); }
  const d=document.createElement('span'); d.className='plus'+(gain?'':' zero'); d.textContent=gain?'+'+gain:(lead?'NOT AHEAD':'FLAT');
  d.style.left=(px-14)+'px'; d.style.top=(py-20)+'px'; $('#tapFx').appendChild(d); setTimeout(()=>d.remove(),850);
  const z=$(side==='a'?'#tapL':'#tapR'); z.classList.add('hit'); setTimeout(()=>z.classList.remove('hit'),120);
  save(); paintWallet();
}
$('#tapL').addEventListener('pointerdown',e=>tap('a',e)); $('#tapR').addEventListener('pointerdown',e=>tap('b',e));

/* ── DOM helpers ─────────────────────────────────────────────────────────── */
let toastT=null;
function toast(t){ const el=$('#toast'); el.innerHTML='<span>'+t+'</span>'; el.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(()=>el.classList.remove('on'),1600); }
function paintWallet(){ $('#teeth').textContent=me.teeth.toLocaleString('en-US'); $('#noise').textContent=me.noise.toLocaleString('en-US'); }
function paintPips(){
  const s={a:0,b:0}; let html='';
  for(const r of cur.match.rounds){ const done=cur.resolved.has(r.i); const k=done?(r.clinch?'x':r.winner):''; if(done&&!r.clinch) s[r.winner]++; html+=`<i class="${k}"></i>`; }
  $('#pips').innerHTML=html; return s;
}
function track(ev,extra){ if(window.vgTrack) window.vgTrack(ev,extra||{}); }

/* ── the card after the bell ─────────────────────────────────────────────── */
function showCard(b){
  const P=pair(), w=b.match.winner, s=b.match.score;
  $('#cKicker').textContent='BATTLE '+b.no+(w?'':' · DRAW');
  $('#cTitle').textContent= w ? `${P[w].name} WINS ${Math.max(s.a,s.b)}–${Math.min(s.a,s.b)}` : `NOBODY WINS ${s.a}–${s.b}`;
  const lines=MARKETS.map(m=>{ const r=b.results[m.key]; if(!r||!r.pick) return '';
    const who=r.out==='nobody'?'NOBODY':P[r.out].name, mine=r.pick==='nobody'?'NOBODY':P[r.pick].name;
    return `<li class="${r.won?'w':'l'}"><span>${m.label} · you said ${mine}</span><span>${r.won?'+'+r.teeth+' TEETH':who}</span></li>`; }).join('');
  $('#cLines').innerHTML=lines||'<li class="l"><span>No picks this battle.</span><span>Pick before the bell.</span></li>';
  $('#cTotal').textContent= b.teethWon?`+${b.teethWon} TEETH THIS BATTLE`:'';
  $('#card').hidden=false;
}

/* ── account ─────────────────────────────────────────────────────────────── */
const PROVIDERS=[['google','Google'],['apple','Apple'],['discord','Discord'],['github','GitHub']];
function paintProviders(){
  $('#providers').innerHTML=PROVIDERS.map(([k,n])=>providers[k]
    ? `<a href="/auth/${k}?next=${encodeURIComponent(location.pathname)}">${n}</a>`
    : `<span title="not switched on yet">${n} · soon</span>`).join('');
}
async function loadAccount(){
  try{
    const r=await fetch('/api/me',{credentials:'same-origin'}); if(!r.ok) throw 0;
    const d=await r.json(); providers=d.providers||{}; account=d.account||null;
    if(account){
      const a=$('#btnAccount'); a.innerHTML=(account.avatar?`<img src="${account.avatar}" alt="">`:'')+(account.name||'YOU').toUpperCase(); a.href='/leaderboard'; a.title='Leaderboard';
      if(d.wallop && LS.get('wallop.synced')===account.id){ me.noise=d.wallop.noise; me.teeth=d.wallop.teeth; me.battles=d.wallop.battles; me.bets=d.wallop.bets; me.betsWon=d.wallop.bets_won; save(); paintWallet(); }
      else await sync(true);
    }
  }catch(e){ providers={}; account=null; }
  paintProviders();
}
async function sync(first){
  if(!account) return;
  try{
    const r=await fetch('/api/wallop/sync',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
      body:JSON.stringify({noise:me.noise,teeth:me.teeth,battles:me.battles,bets:me.bets,bets_won:me.betsWon})});
    if(!r.ok) return; const d=await r.json();
    if(d.wallop){ me.noise=d.wallop.noise; me.teeth=d.wallop.teeth; save(); paintWallet(); }
    if(d.bonusApplied) toast('+250 NOISE · SIGN-UP BONUS');
    if(first) LS.set('wallop.synced',account.id);
  }catch(e){}
}
$('#btnAccount').addEventListener('click',e=>{ if(!account){ e.preventDefault(); openSheet('#signup'); } });

/* ── sheets ──────────────────────────────────────────────────────────────── */
function openSheet(sel){ $('#scrim').hidden=false; $(sel).hidden=false; }
function closeSheets(){ $('#scrim').hidden=true; $$('.sheet').forEach(s=>s.hidden=true); }
$$('[data-close]').forEach(b=>b.onclick=closeSheets); $('#scrim').onclick=closeSheets;
$('#btnHow').onclick=()=>openSheet('#how');
$('#btnSound').onclick=()=>{ audio.unlock(); audio.setOn(!audio.on); $('#btnSound').textContent=audio.on?'🔊':'🔇'; };

/* ── the loop ────────────────────────────────────────────────────────────── */
let last=performance.now(), lastTick=-1, cardUntil=0;
function roundDelta(){
  const i=clock.roundIndex(); if(i<0) return 0;
  const per=ROUND_MS/STEP_MS, cd=COUNTDOWN_MS/STEP_MS;
  const k=clamp(Math.floor((clock.ct()-BELL_AT)/STEP_MS), i*per, i*per+cd);
  return cur.match.path[k]-cur.match.path[i*per];
}
function frame(now){
  const dt=Math.min(0.05,(now-last)/1000); last=now;
  const minute=clock.minute();
  if(!cur) startBattle(minute);
  else if(cur.minute!==minute){
    /* the bell of the next minute: settle the battle, keep the card up a while */
    for(const m of MARKETS) if(!cur.results[m.key]){ const out=cur.match.winner||'nobody'; const pick=cur.picks[m.key]; const won=!!pick&&pick===out; const teeth=won?m.pay[out]:0;
      cur.results[m.key]={out,won,teeth,pick}; if(won){ me.teeth+=teeth; me.betsWon++; cur.teethWon+=teeth; } }
    me.battles++; save(); paintWallet();
    prev=cur; showCard(prev); cardUntil=BELL_AT-2000;
    if(prev.match.winner){ arena.setMode('idle'); arena.setFraming('betting'); arena.setResultPose(prev.match.winner); } else arena.reset();
    track('battle_end',{score:prev.teethWon,won:prev.teethWon>0,extra:{picks:Object.values(prev.picks).filter(Boolean).length}});
    sync(false);
    if(!account && !me.signupSeen){ me.signupSeen=true; save(); setTimeout(()=>openSheet('#signup'),900); }
    startBattle(minute);
    if(prev.match.winner){ arena.setMode('idle'); arena.setFraming('betting'); arena.setResultPose(prev.match.winner); }
  }
  const ct=clock.ct(), ph=clock.phase(), ri=clock.roundIndex();
  const ar=arenaEl.getBoundingClientRect(); arena.resize(ar.width,ar.height,window.devicePixelRatio||1);

  /* rounds resolve on the shared clock */
  if(ph==='FIGHT'){
    if(ct<BELL_AT+300 && arena.framing!=='fight'){ arena.newMatch(); arena.setFraming('fight'); arena.setMode('shadow'); }
    for(const r of cur.match.rounds) if(r.resolveAt<=ct && !cur.resolved.has(r.i)){
      cur.resolved.add(r.i);
      if(ct-r.resolveAt<1500){ if(r.clinch){ arena.clinch(); audio.thud(); } else arena.fire({atk:r.winner,tier:r.tier,up:r.delta>0}); }
    }
    for(const m of MARKETS) if(m.round!=null) settle(m);
  }
  if(ct>=cardUntil && !$('#card').hidden) $('#card').hidden=true;
  if(ph==='BETTING' && $('#card').hidden && arena.framing!=='betting' && prev && cur.resolved.size===0){ /* idle shadowboxing while waiting */ }

  /* arena state */
  const d=roundDelta(), sg=cur.match.sigma;
  if(ph==='FIGHT'&&clock.inCountdown()&&!arena.busy()){ arena.setMode('shadow'); arena.setIntensity(clamp((clock.roundT()/COUNTDOWN_MS-0.35)/0.5,0,1)); }
  if(ph==='FIGHT'&&clock.inCountdown()){ lead=Math.abs(d)<sg*0.08?null:(d>0?'a':'b'); arena.setLead(lead,Math.min(2,Math.floor(Math.abs(d)/(sg*0.55)))); }
  else { lead=null; arena.setLead(null,0); }
  arena.setDirection(ph==='FIGHT'?d/(sg*1.1):0);
  const sc=paintPips(); arena.setHurt(sc.b/ROUNDS*0.5, sc.a/ROUNDS*0.5);
  arena.frame(dt);
  audio.crowd(ph==='FIGHT'?0.35+0.5*clamp(Math.abs(d)/sg,0,1):0.12,dt);

  /* DOM */
  app.dataset.phase=ph; app.classList.toggle('countdown',ph==='FIGHT'&&clock.inCountdown()&&!arena.busy());
  const cd=$('#countdown');
  if(ph==='FIGHT'&&clock.inCountdown()){
    const n=clock.countdownLeft(); cd.classList.add('on'); $('#cdRound').textContent='ROUND '+(ri+1); $('#cdNum').textContent=n;
    cd.classList.toggle('up',lead==='a'); cd.classList.toggle('dn',lead==='b');
    for(const k of [1,2,3]) cd.classList.toggle('beat'+k,n===k);
    if(n!==lastTick){ lastTick=n; cd.classList.remove('tick'); void cd.offsetWidth; cd.classList.add('tick'); audio.tick(n); }
    const L=$('#lead'); L.classList.add('on'); L.classList.toggle('up',lead==='a'); L.classList.toggle('dn',lead==='b');
    $('#leadPct').textContent=(d>=0?'▲ +':'▼ ')+(d*100).toFixed(3)+'%'; $('#leadTxt').textContent=lead?`${pair()[lead].name} IS AHEAD · PRICE DECIDES AT 1`:'FLAT · PRICE DECIDES AT 1';
  } else { cd.classList.remove('on'); $('#lead').classList.remove('on'); lastTick=-1; }
  const toBell=clock.toBell();
  $('#clockLabel').textContent= ph==='BETTING'?'BELL IN':(clock.inCountdown()?'ROUND '+(ri+1):'ROUND '+(ri+1)+' · DONE');
  $('#clock').textContent= ph==='BETTING'?mmss(toBell):mmss(CYCLE-ct);
  $('#betsTitle').innerHTML= ph==='BETTING'?`Bell in <b>${mmss(toBell)}</b>`:`Round ${ri+1} of ${ROUNDS} · <b>${mmss(CYCLE-ct)}</b> left`;
  if(!$('#card').hidden) $('#cNext').textContent=mmss(toBell);
  if(Math.floor(ct/1000)!==frame.sec){ frame.sec=Math.floor(ct/1000); renderMarkets(); }
  requestAnimationFrame(frame);
}

useSkin(skinId); paintWallet(); paintProviders(); loadAccount();
startBattle(clock.minute());
requestAnimationFrame(frame);
addEventListener('keydown',e=>{ if(e.key==='Escape') closeSheets(); if(e.key==='ArrowLeft') tap('a',{}); if(e.key==='ArrowRight') tap('b',{}); });
if(!LS.get('wallop.seenHow')){ LS.set('wallop.seenHow','1'); setTimeout(()=>openSheet('#how'),600); }
window.__wallop={clock,me,get cur(){return cur;},arena};
