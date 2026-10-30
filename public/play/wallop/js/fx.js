/* ═══ The tier ladder, as data ═══════════════════════════════════════════════
   This table IS the game's sense of impact (scope doc section 3.4). There is no
   tier-3 sprite — tier selects a row of numbers applied to the same five poses.
   An operator tuning gore edits these numbers; goreTierCeiling clamps which
   rows can be reached. Nothing here can touch damage, which arrives decided.
   ═══════════════════════════════════════════════════════════════════════════ */
import { rnd, ri, clamp, mix } from './util.js';

export const TIERS = {
  1:{ hitstop: 60, trauma:0.25, shakeAmp: 3, shakeDecay:2.5, zoom:1.02,
      flashA:0.35, flashMs: 80, tint:null,              particles: 18, pSpeed:120,
      decals:0, rings:1, ghosts:2, lunge:14, recoilPx: 8, recoilDeg: 3,
      slowmo:null,        letterbox:false, beat:[0.15,0.35,1.30,0.95], label:'T1' },
  2:{ hitstop:140, trauma:0.55, shakeAmp: 7, shakeDecay:1.8, zoom:1.05,
      flashA:0.60, flashMs:130, tint:['#3a0000',0.15],  particles: 55, pSpeed:260,
      decals:2, rings:2, ghosts:3, lunge:22, recoilPx:18, recoilDeg: 6,
      slowmo:[0.50,120], letterbox:false, beat:[0.15,0.35,1.60,1.05], label:'T2' },
  3:{ hitstop:260, trauma:1.00, shakeAmp:14, shakeDecay:1.2, zoom:1.10,
      flashA:0.95, flashMs:220, tint:['#6b0000',0.35],  particles:140, pSpeed:420,
      decals:6, rings:3, ghosts:5, lunge:34, recoilPx:30, recoilDeg:10,
      slowmo:[0.25,320], letterbox:true,  beat:[0.20,0.40,2.00,1.10], label:'T3' }
};
export const beatLen = t => TIERS[t].beat.reduce((a,b)=>a+b,0)*1000;

/* ─── particles ─── */
export class Particles{
  constructor(cap=600){ this.p=[]; this.cap=cap; }
  burst(x,y,n,spd,cols,opt={}){
    n=Math.min(n,this.cap-this.p.length);
    for(let i=0;i<n;i++){
      const a=rnd(-Math.PI,0.35), s=spd*rnd(.25,1);
      this.p.push({x,y,vx:Math.cos(a)*s*rnd(.5,1.4),vy:Math.sin(a)*s,
        life:0,max:rnd(.45,1.25),sz:opt.sz||rnd(2,5),
        col:cols[ri(0,cols.length-1)],grav:opt.grav??900,drag:opt.drag??0.88,
        stick:opt.stick||false});
    }
  }
  spark(x,y,n){ this.burst(x,y,n,180,['#ffe08a','#fff6d0'],{sz:2,grav:260}); }
  update(dt,groundY,decals,maxDecals){
    for(let i=this.p.length-1;i>=0;i--){
      const q=this.p[i]; q.life+=dt;
      q.vy+=q.grav*dt; q.vx*=Math.pow(q.drag,dt*60); q.x+=q.vx*dt; q.y+=q.vy*dt;
      if(q.stick && q.y>=groundY && maxDecals>0 && decals.length<maxDecals*14){
        decals.push({x:q.x,y:groundY-1,w:rnd(3,9),h:rnd(1,3),c:q.col}); this.p.splice(i,1); continue;
      }
      if(q.life>=q.max||q.y>groundY+40) this.p.splice(i,1);
    }
  }
  draw(ctx){
    ctx.save(); ctx.globalCompositeOperation='lighter';
    for(const q of this.p){
      ctx.globalAlpha=clamp(1-q.life/q.max,0,1);
      ctx.fillStyle=q.col;
      ctx.fillRect(Math.round(q.x),Math.round(q.y),q.sz,q.sz);
    }
    ctx.restore();
  }
  clear(){ this.p.length=0; }
}

/* ─── expanding impact rings ─── */
export class Rings{
  constructor(){ this.r=[]; }
  add(x,y,max,ms,col,w){ this.r.push({x,y,r:max*0.12,max,t:0,ms:ms/1000,col,w}); }
  update(dt){ for(let i=this.r.length-1;i>=0;i--){ const o=this.r[i]; o.t+=dt;
    if(o.t>=o.ms) this.r.splice(i,1); } }
  draw(ctx){
    ctx.save(); ctx.globalCompositeOperation='lighter';
    for(const o of this.r){ const k=o.t/o.ms;
      ctx.globalAlpha=(1-k)*0.8; ctx.strokeStyle=o.col; ctx.lineWidth=o.w*(1-k)+0.5;
      ctx.beginPath(); ctx.arc(o.x,o.y,o.r+(o.max-o.r)*k,0,Math.PI*2); ctx.stroke(); }
    ctx.restore();
  }
  clear(){ this.r.length=0; }
}

/* ─── trauma-squared screen shake. Squaring is what makes a big hit feel
       categorically different rather than merely bigger. ─── */
export class Shake{
  constructor(){ this.t=0; this.amp=0; this.decay=2; }
  kick(trauma,amp,decay){ this.t=Math.max(this.t,trauma); this.amp=amp; this.decay=decay; }
  update(dt){ this.t=Math.max(0,this.t-this.decay*dt); }
  offset(){ const k=this.t*this.t*this.amp;
    return [ (Math.random()*2-1)*k, (Math.random()*2-1)*k*0.7 ]; }
  clear(){ this.t=0; }
}

/* ─── presentation clock: carries hit-stop and slow-mo. The SCHEDULER never
       uses this (scope 3.3) — a dramatic effect must not be able to desync
       the fight from server time. ─── */
export class PClock{
  constructor(){ this.t=0; this.freeze=0; this.slow=1; this.slowLeft=0; this.rate=1; }
  hitstop(ms){ this.freeze=Math.max(this.freeze,ms/1000); }
  slowmo(f,ms){ this.slow=f; this.slowLeft=ms/1000; }
  step(dt){
    if(this.freeze>0){ this.freeze-=dt; return 0; }
    let s=1;
    if(this.slowLeft>0){ s=this.slow; this.slowLeft-=dt; if(this.slowLeft<=0) this.slow=1; }
    const d=dt*s*this.rate; this.t+=d; return d;
  }
  clear(){ this.freeze=0; this.slow=1; this.slowLeft=0; this.rate=1; }
}
