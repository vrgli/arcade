/* ═══ Arena band renderer ══════════════════════════════════════════════════
   Canvas2D. The WORLD is a fixed 390x520 logical stage; the canvas element is
   whatever size the layout gives it, and resize() maps one onto the other. The
   world width always spans the full element width; how much of the world's
   height is visible is viewTop/VH. Nothing outside this file may assume the
   element is 390 wide — import WORLD_W and divide.

   Three states drive it:
     shadowbox  during the 10s countdown — bouncing and swinging, no contact
     blow       the real punch when the countdown hits 1
     clinch     price unchanged: locked up, nobody hits, not broken
   ═════════════════════════════════════════════════════════════════════════ */
import { SKINS, drawFighter, poseBounds, U, FH } from './fighters.js';
import { TIERS, beatLen, Particles, Rings, Shake, PClock } from './fx.js';
import { clamp, lerp, rnd, ri } from './util.js';

const W=390, H=520, GY=445;
export const WORLD_W=W, WORLD_H=H;
/* the painted world runs past the screen on every side, so the camera always
   has somewhere to pan even at zoom 1 and no background edge can appear */
/* painted margin either side of the 390-unit stage. This is also the hard
   limit on how far the camera may pan (see the clamps in _contain): at 140
   the clamp bound before containment did, and a fighter could hang a few px
   off the edge on a wide lunge. */
const BG=260;
/* The painted world runs well past the screen so the camera can pull back far
   enough to fit a tall victory pose into a short band on a small phone, and
   still never expose a background edge. ZMIN is derived from that margin. */
const ZMIN=W/(W+2*BG);
/* inset so a full lunge plus the defender's recoil still lands inside the
   frame at the fight camera, where z=1 leaves no room to pan */
const POS={ a:110, b:280 };
const easeOutBack=t=>1+2.2*Math.pow(t-1,3)+1.4*Math.pow(t-1,2);
const easeOut=t=>1-Math.pow(1-t,3);

export class Arena{
  constructor(canvas,dom){
    this.c=canvas; this.x=canvas.getContext('2d'); this.dom=dom;
    this.x.imageSmoothingEnabled=false;
    this.S=1; this.VH=H; this.cssW=W; this.cssH=H;
    this.p=new Particles(); this.rings=new Rings(); this.shake=new Shake(); this.pc=new PClock();
    this.decals=[]; this.toasts=[];
    this.pose={a:'neutral',b:'neutral'}; this.off={a:0,b:0}; this.rot={a:0,b:0};
    this.flash={a:0,b:0}; this.sc={a:1,b:1}; this.hurt={a:0,b:0};
    this.lead=null; this.glow=0; this.zoom=1; this.dir=0;
    this.blow=null; this.down=null; this.clinching=0; this.winCol=null;
    this.camZ=1; this.camX=0; this.camY=0;
    this.czT=1; this.cxT=0; this.cyT=0;
    this.framing='fight'; this.viewTop=0; this.pushing=false;
    this.mode='idle'; this.t=0; this.sbT={a:0,b:0};
    this.intensity=1; this.calm=1;
    this.sfx={impact(){},ko(){}};
    this.crowdSeed=Array.from({length:56},()=>Math.random()*6.28);
  }

  /* ── state in ── */
  reset(){
    this.pose={a:'neutral',b:'neutral'}; this.off={a:0,b:0}; this.rot={a:0,b:0};
    this.flash={a:0,b:0}; this.sc={a:1,b:1};
    this.p.clear(); this.rings.clear(); this.shake.clear(); this.pc.clear();
    this.blow=null; this.down=null; this.clinching=0; this.winCol=null;
    this.camZ=1; this.camX=0; this.camY=0;
    this.czT=1; this.cxT=0; this.cyT=0;
    this.framing='fight'; this.viewTop=0; this.pushing=false; this.zoom=1;
    this.dom.wrap.classList.remove('lb'); this.dom.tint.style.opacity=0;
  }
  newMatch(){ this.reset(); this.decals.length=0; this.hurt={a:0,b:0}; }
  setMode(m){
    if(this.mode===m) return;
    this.mode=m;
    if(m==='shadow'){ this.down=null; this.clinching=0; this.winCol=null;
      this.intensity=0; this.calm=0.92; this._camFight();
      this.pose={a:'neutral',b:'neutral'}; this.off={a:0,b:0}; this.rot={a:0,b:0}; }
  }
  setHurt(a,b){ this.hurt.a=a; this.hurt.b=b; }
  /* 0 at the top of the countdown, 1 at the decision. The opening must be
     calm enough to read the number and the price line; the fighters are
     background until they aren't. */
  setIntensity(v){ this.intensity=clamp(v,0,1); this.calm=0.92+0.08*this.intensity; }
  setLead(side,glow){ this.lead=side; this.glow=glow/2; }
  setDirection(d){ this.dir=lerp(this.dir,clamp(d,-1,1),0.06); }

  /* ── camera ──────────────────────────────────────────────────────────
     Expressed as a pan + zoom so the same three numbers serve the fight,
     the knockdown push-in and a box fit. A zoom z about a point p is
     cam = p*(1-z). */
  setFraming(m){ this.framing=m; if(m==='fight') this._camFight(); }

  /* Fit the world to whatever box the layout gives us. The world is always
     W wide; how much of its height is visible depends on the box, and that
     is what viewTop means. A zero or absurd box must never reach the camera
     maths — a NaN transform paints nothing and never recovers. */
  resize(cssW,cssH,dpr){
    if(!(cssW>0)||!(cssH>0)) return false;
    dpr=Math.min(dpr||1,2.5);
    const bw=Math.round(cssW*dpr), bh=Math.round(cssH*dpr);
    if(this.c.width!==bw||this.c.height!==bh){ this.c.width=bw; this.c.height=bh;
      this.x.imageSmoothingEnabled=false; }
    this.cssW=cssW; this.cssH=cssH; this.dpr=dpr;
    this.S=cssW/W;
    this.VH=cssH/this.S;
    this.viewTop=clamp(H-this.VH,-BG,H-40);
    return true;
  }
  _camFight(){ this.pushing=false; this.czT=1; this.cxT=0; this.cyT=0; }
  _camPush(){ this.pushing=true; }
  /* Fit whatever is actually drawn into the visible band. The victory pose is
     taller than the stance and the floored pose is far wider, so the frame is
     measured every frame rather than assumed — one routine serves both the
     betting view and the knockdown push-in. */
  /* world-space box of everything currently drawn, including the lunge */
  boundsOf(k){ const bb=poseBounds(SKINS[k],this.pose[k]), px=POS[k]+this.off[k];
    return {x0:px+bb.x0,x1:px+bb.x1,y0:GY+bb.y0,y1:GY+bb.y1}; }
  /* the same transform _draw applies, in CSS pixels relative to the canvas.
     Anything outside the canvas that needs to dodge the fighters asks here. */
  screenBoundsOf(k){
    const b=this.boundsOf(k), z=this.camZ, Z=this.zoom;
    const vcy=this.viewTop+this.VH/2;
    const wx=v=>{ const a0=this.camX+v*z; return (W/2)+(a0-W/2)*Z; };
    const wy=v=>{ const a0=this.camY+v*z; return vcy+(a0-vcy)*Z; };
    const S=this.S;
    return {x0:wx(b.x0)*S, x1:wx(b.x1)*S,
            y0:(wy(b.y0)-this.viewTop)*S, y1:(wy(b.y1)-this.viewTop)*S};
  }
  _contentBox(pad){
    let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9;
    for(const k of ['a','b']){
      const bb=poseBounds(SKINS[k],this.pose[k]);
      const px=POS[k]+this.off[k];
      x0=Math.min(x0,px+bb.x0); x1=Math.max(x1,px+bb.x1);
      y0=Math.min(y0,GY+bb.y0); y1=Math.max(y1,GY+bb.y1);
    }
    return {x0:x0-pad,y0:y0-pad,x1:x1+pad,y1:y1+pad};
  }
  /* The eased camera can lag a box that is still growing mid-lunge, so after
     easing the frame is corrected outright. This is what guarantees nothing
     is ever cropped, rather than hoping the target was right. */
  _contain(vy0){
    const vh=H-vy0, b=this._contentBox(4), bw=b.x1-b.x0, bh=b.y1-b.y0;
    if(!(vh>0&&bw>0&&bh>0)) return;
    /* _draw applies the push-in AFTER the camera, scaling about the view
       centre, so containment has to work against the viewport the push-in
       actually leaves. Ignoring it let a fighter hang 4.4px off the left
       edge during a hit. */
    const Z=(Number.isFinite(this.zoom)&&this.zoom>0)?this.zoom:1;
    const vcy=vy0+vh/2;
    const xLo=W/2-(W/2)/Z,  xHi=W/2+(W/2)/Z;
    const yLo=vcy-(vh/2)/Z, yHi=vcy+(vh/2)/Z;
    const availW=xHi-xLo, availH=yHi-yLo;
    const need=Math.min(availW/bw, availH/bh);
    if(this.camZ>need) this.camZ=Math.max(need,ZMIN);
    const z=this.camZ;
    if(bw*z<=availW){ const l=this.camX+b.x0*z, r=this.camX+b.x1*z;
      if(l<xLo) this.camX+=(xLo-l); else if(r>xHi) this.camX-=(r-xHi); }
    if(bh*z<=availH){ const t=this.camY+b.y0*z, d=this.camY+b.y1*z;
      if(t<yLo) this.camY+=(yLo-t); else if(d>yHi) this.camY-=(d-yHi); }
    this.camX=clamp(this.camX, W-(W+BG)*z, BG*z);
    this.camY=clamp(this.camY, H-(H+BG)*z, vy0+BG*z);
  }
  _camFitBox(vy0, minZ, maxZ){
    /* pad past the body box so the winner's rim glow (U*1.6) fits too */
    const vh=H-vy0, b=this._contentBox(this.down?U*1.8:8);
    const x0=b.x0,y0=b.y0,x1=b.x1,y1=b.y1;
    if(!(vh>0&&x1>x0&&y1>y0)){ this._camFight(); return; }
    const bw=x1-x0, bh=y1-y0;
    const fit=Math.min(W/bw, vh/bh);
    const z=clamp(Math.min(fit,maxZ), Math.min(minZ,fit), maxZ);
    const zz=Math.max(z,ZMIN);                    /* the painted margin is what
                                                     bounds how far we may pull back */
    this.czT=zz;
    this.cxT=clamp(((W-bw*zz)/2)-x0*zz, W-(W+BG)*zz, BG*zz);
    this.cyT=clamp(vy0+((vh-bh*zz)/2)-y0*zz, H-(H+BG)*zz, vy0+BG*zz);
  }

  setResultPose(w){ const l = w==='a'?'b':'a';
    this.down={loser:l,win:w}; this.pose[w]='wins'; this.pose[l]='loses';
    this.off={a:0,b:0}; this.rot={a:0,b:0};
    this.winCol = w==='a' ? '#44ef99' : '#ff6f61'; }
  busy(){ return !!this.blow || this.clinching>0; }
  toast(txt,col){ this.toasts.push({txt,col,t:0}); }
  tap(x,y){
    this.p.burst(x,y,5,110,['#ffe08a','#fff0bb','#ffffff'],{sz:2,grav:180});
    this.rings.add(x,y,16,260,'#ffd34d',1.5);
  }

  /* b = {atk, tier, up, crowdBump} */
  fire(b){
    const def=b.atk==='a'?'b':'a', cfg=TIERS[b.tier];
    this.mode='blow';
    this.blow={ atk:b.atk, def, tier:b.tier, cfg, t:0, impacted:false,
                up:!!b.up, raw:b };
    this.pose[b.atk]='attacking';
    if(b.crowdBump) this.toast('CROWD TURNED IT UP','#ffd34d');
    if(cfg.letterbox) this.dom.wrap.classList.add('lb');
  }
  /* price unchanged: nobody hits. Must look deliberate. */
  clinch(){
    this.mode='clinch'; this.clinching=2.2;
    this.pose.a='defending'; this.pose.b='defending';
    this.toast('NOBODY HITS','#9aa6ba');
  }

  /* ── per-frame ── */
  frame(dtReal){
    const dt=this.pc.step(dtReal);
    this.t+=dtReal;
    if(this.mode==='shadow') this._shadow(dtReal);
    this._blow(dt); this._clinch(dt);
    this.p.update(dt,GY,this.decals,this.blow?this.blow.cfg.decals:0);
    this.rings.update(dt); this.shake.update(dt);
    for(const k of ['a','b']) this.flash[k]=Math.max(0,this.flash[k]-dtReal*6.5);
    this.zoom=lerp(this.zoom,1,1-Math.pow(0.004,dt));
    /* sustained push-in on the knockdown — fills the frame and sells the hit */
    if(this.framing==='betting') this._camFitBox(this.viewTop,1.0,1.45);
    else if(this.pushing)       this._camFitBox(0,1.12,1.30);
    const e=1-Math.pow(0.006,dtReal);
    this.camZ=lerp(this.camZ,this.czT,e);
    this.camX=lerp(this.camX,this.cxT,e);
    this.camY=lerp(this.camY,this.cyT,e);
    this._contain(this.viewTop);
    for(let i=this.toasts.length-1;i>=0;i--){ const s=this.toasts[i]; s.t+=dtReal; if(s.t>1.6) this.toasts.splice(i,1); }
    const tl=this.dom.tint; if(+tl.style.opacity>0) tl.style.opacity=Math.max(0,+tl.style.opacity-dt*1.6);
    this._draw();
  }

  /* bouncing on the spot, swinging without connecting */
  _shadow(dt){
    const v=this.intensity;
    const pSwing = 0.06+0.58*v;                 /* almost still, then busy  */
    const reach  = 3+v*12;                       /* small jabs, then lunges  */
    for(const k of ['a','b']){
      this.sbT[k]-=dt;
      if(this.sbT[k]<=0){
        if(this.pose[k]!=='neutral'){ this.pose[k]='neutral'; this.off[k]=0;
          this.sbT[k]=rnd(0.30,0.85)-v*rnd(0.1,0.4); }
        else{
          const r=Math.random();
          if(r<pSwing){ this.pose[k]='attacking';
            this.off[k]=SKINS[k].dir*rnd(reach*0.5,reach); this.sbT[k]=rnd(0.13,0.22); }
          else if(r<pSwing+0.14*v+0.04){ this.pose[k]='defending';
            this.off[k]=-SKINS[k].dir*3; this.sbT[k]=rnd(0.16,0.3); }
          else{ this.pose[k]='neutral'; this.off[k]=0; this.sbT[k]=rnd(0.3,0.75)-v*rnd(.1,.35); }
        }
      }
      this.off[k]=lerp(this.off[k],this.pose[k]==='attacking'?SKINS[k].dir*reach*0.8:0,
                       1-Math.pow(0.002,dt));
    }
  }

  _clinch(dt){
    if(this.clinching<=0) return;
    this.clinching-=dt;
    const k=1-Math.max(0,this.clinching)/2.2;
    const push=28*Math.sin(Math.min(1,k*3)*Math.PI*0.5);
    this.off.a=push; this.off.b=-push;
    const j=this.clinching>0.4?Math.sin(this.t*42)*1.4:0;
    this.off.a+=j; this.off.b-=j;
    if(this.clinching<=0){ this.off={a:0,b:0}; this.pose={a:'neutral',b:'neutral'}; this.mode='idle'; }
  }

  _blow(dt){
    const b=this.blow; if(!b) return;
    const [tel,lun,rec,res]=b.cfg.beat;
    b.t+=dt;
    const atk=b.atk, def=b.def, dir=SKINS[atk].dir;
    const m1=tel, m2=tel+lun, m3=m2+rec, m4=m3+res;

    if(b.t<m1){
      const k=b.t/Math.max(tel,.001);
      this.off[atk]=-5*k; this.sc[atk]=lerp(1,0.95,k);
      this.pose[def]='defending';
    }else if(b.t<m2){
      const k=(b.t-m1)/lun; this.sc[atk]=1;
      this.off[atk]=dir*b.cfg.lunge*easeOutBack(k);
    }else if(!b.impacted){
      b.impacted=true; this._impact(b);
    }else if(b.t<m3){
      const k=(b.t-m2)/rec;
      this.off[atk]=dir*b.cfg.lunge*(1-easeOut(k));
      if(!this.down){ this.off[def]=dir*b.cfg.recoilPx*(1-easeOut(k));
        this.rot[def]=dir*(b.cfg.recoilDeg*Math.PI/180)*(1-easeOut(k)); }
    }else if(b.t<m4){
      const k=(b.t-m3)/res;
      this.off[atk]*=(1-k);
      if(k>0.4) this.pose[atk]='wins';
    }else{
      this.off[atk]=0; this.sc[atk]=1;
      this.dom.wrap.classList.remove('lb');
      this.blow=null; this.mode='idle';
    }
  }

  _impact(b){
    const c=b.cfg, atk=b.atk, def=b.def, dir=SKINS[atk].dir;
    const ix=POS[def]-dir*34, iy=GY-162;
    this.sfx.impact(b.tier,b);
    /* THE DEFENDER CHANGES SHAPE ON THE CONTACT FRAME. It used to absorb a
       tier-3 blow still in `defending`, guard up, and then teleport to
       `loses`; the recoil, the hitstop and the shake were all already here
       and all landed on a figure that had not reacted. This is the single
       frame that makes a punch read as a punch. */
    this.pose[def]='hit';
    this.pc.hitstop(c.hitstop);
    if(c.slowmo) this.pc.slowmo(c.slowmo[0],c.slowmo[1]);
    this.shake.kick(c.trauma,c.shakeAmp,c.shakeDecay);
    this.zoom=c.zoom;
    this.flash[atk]=c.flashA*0.55; this.flash[def]=c.flashA;
    const dc=b.up?'#44ef99':'#ff6f61', dc2=b.up?'#c9ffe4':'#ffd6d0';
    this.p.burst(ix,iy,c.particles,c.pSpeed,['#b4202a','#8f1b16','#d8384a'],{sz:3,stick:c.decals>0});
    this.p.burst(ix,iy,Math.round(c.particles*0.4),c.pSpeed*1.1,[dc,dc2],{sz:2,grav:260});
    if(c.particles>40) this.p.burst(ix,iy+26,Math.round(c.particles*0.22),c.pSpeed*0.6,['#6b5a46','#4a3f31'],{sz:3});
    for(let i=0;i<c.rings;i++) this.rings.add(ix,iy,44+i*30,260+i*120,i?dc:'#ffffff',3-i*0.6);
    if(c.tint){ this.dom.tint.style.background=c.tint[0]; this.dom.tint.style.opacity=c.tint[1]; }
    /* one knockdown per round — the loser goes to the ground and stays there
       until the next round card */
    this.winCol=dc;
    setTimeout(()=>this._knockdown(def,atk),Math.max(110,c.hitstop));
  }
  _knockdown(loser,win){
    this.down={loser,win};
    this.pose[loser]='loses'; this.off[loser]=0; this.rot[loser]=0;
    this.flash.a=this.flash.b=0;          /* the card must not be a white frame */
    this.shake.kick(0.7,11,1.4);
    this.p.burst(POS[loser],GY-50,56,300,['#b4202a','#8f1b16','#6b2a22'],{sz:3,stick:true});
    this._camPush();                      /* push in on the pair */
    this.sfx.ko();
  }

  /* ── draw ── */
  _draw(){
    const x=this.x;
    /* backstop: if anything upstream ever produced a non-finite camera, draw
       an identity frame rather than nothing at all */
    if(!Number.isFinite(this.camZ)||!Number.isFinite(this.camX)||
       !Number.isFinite(this.camY)||!(this.camZ>0)){ this.camZ=1; this.camX=0; this.camY=0; }
    if(!Number.isFinite(this.viewTop)) this.viewTop=0;
    const k=this.S*(this.dpr||1);
    if(!(k>0)) return;
    x.setTransform(k,0,0,k,0,-this.viewTop*k);
    x.clearRect(-BG,this.viewTop-BG,W+BG*2,this.VH+BG*2);
    const [sx,sy]=this.shake.offset();
    x.save();
    const vcy=this.viewTop+this.VH/2;
    x.translate(W/2+sx,vcy+sy); x.scale(this.zoom,this.zoom); x.translate(-W/2,-vcy);
    x.translate(this.camX,this.camY); x.scale(this.camZ,this.camZ);

    this._bg(x);
    for(const d of this.decals){ x.fillStyle=d.c; x.globalAlpha=.75; x.fillRect(d.x|0,d.y|0,d.w,d.h); }
    x.globalAlpha=1;

    const order = this.down ? [this.down.loser,this.down.win] : ['a','b'];
    for(const k of order){
      const bob = (this.mode==='shadow')
        ? Math.sin(this.t*(4.2+3*this.intensity)+(k==='a'?0:1.7))*(1.3+2.1*this.intensity)
        : (this.pose[k]==='neutral'&&!this.down ? Math.sin(this.t*3.4+(k==='a'?0:1.9))*1.6 : 0);
      const isLoser = this.down && this.down.loser===k;
      const isWin   = this.down && this.down.win===k;
      drawFighter(x,SKINS[k],this.pose[k],{
        x:POS[k]+this.off[k], groundY:GY+bob,
        flash:this.flash[k], hurt:this.hurt[k],
        dim: isLoser ? 0.40 : 0,
        glow: isWin ? 1 : ((this.lead===k&&this.mode==='shadow')?this.glow:0),
        glowCol: isWin ? this.winCol : null,
        rot:this.rot[k], scale:this.sc[k]*(this.mode==='shadow'?this.calm:1)
      });
    }
    this.rings.draw(x); this.p.draw(x);
    x.restore();

    for(let i=0;i<this.toasts.length;i++){
      const s=this.toasts[i], k=s.t/1.6;
      x.save(); x.globalAlpha=clamp(1-k*k,0,1);
      x.font='800 16px ui-monospace,monospace'; x.textAlign='center';
      x.fillStyle=s.col; x.shadowColor='#000'; x.shadowBlur=8;
      x.fillText(s.txt,W/2,360+i*22-k*10); x.restore();
    }
  }

  _bg(x){
    const g=x.createLinearGradient(0,0,0,H);
    g.addColorStop(0,'#131b2e'); g.addColorStop(.62,'#1d2639'); g.addColorStop(1,'#0e1320');
    x.fillStyle=g; x.fillRect(-BG,-BG,W+BG*2,H+BG*2);

    const sp=x.createRadialGradient(W/2,60,10,W/2,250,320);
    sp.addColorStop(0,'rgba(255,243,214,.16)'); sp.addColorStop(1,'rgba(255,243,214,0)');
    x.fillStyle=sp; x.fillRect(-BG,-BG,W+BG*2,H+BG*2);

    /* direction wash — the room is green while the price climbs, red while it
       falls, so the screen says which way the money is going before you read
       a single number */
    const dd=Math.abs(this.dir);
    if(dd>0.02){
      const c0=this.dir>0?'23,196,108':'232,56,43';
      const dw=x.createLinearGradient(0,0,0,H);
      dw.addColorStop(0,`rgba(${c0},${(0.13*dd).toFixed(3)})`);
      dw.addColorStop(.38,'rgba(0,0,0,0)');
      x.fillStyle=dw; x.fillRect(-BG,-BG,W+BG*2,H+BG*2);
      const fw=x.createLinearGradient(0,H-54,0,H);
      fw.addColorStop(0,'rgba(0,0,0,0)');
      fw.addColorStop(1,`rgba(${c0},${(0.13*dd).toFixed(3)})`);
      x.fillStyle=fw; x.fillRect(-BG,H-54,W+BG*2,54+BG);
    }

    for(let i=0;i<112;i++){
      const cx=-144+i*7.2, sd=this.crowdSeed[i];
      const h=9+((i*13)%7)+((i*5)%4), yb=Math.sin(this.t*1.5+sd)*2.1;
      x.fillStyle=['#0f1420','#151b29','#1a2133'][i%3];
      x.fillRect(Math.round(cx),Math.round(371-h+yb),7,h+19);
      x.fillRect(Math.round(cx+1),Math.round(367-h+yb),5,5);
      if(i%9===3){ x.fillStyle='rgba(255,230,160,.5)'; x.fillRect(Math.round(cx+4),Math.round(373-h+yb),2,2); }
    }
    const cz=x.createLinearGradient(0,334,0,390);
    cz.addColorStop(0,'rgba(7,9,14,.55)'); cz.addColorStop(1,'rgba(7,9,14,0)');
    x.fillStyle=cz; x.fillRect(-BG,334,W+BG*2,56);
    x.fillStyle='#0d121c'; x.fillRect(-BG,383,W+BG*2,6);

    const f=x.createLinearGradient(0,389,0,H);
    f.addColorStop(0,'#1d2433'); f.addColorStop(1,'#0e1219');
    x.fillStyle=f; x.fillRect(-BG,389,W+BG*2,H-389+BG);
    x.strokeStyle='#283142'; x.lineWidth=1;
    for(let i=1;i<6;i++){ const yy=398+i*18; x.globalAlpha=.5-i*.06;
      x.beginPath(); x.moveTo(-BG,yy); x.lineTo(W+BG,yy); x.stroke(); }
    x.globalAlpha=1;
    x.fillStyle='rgba(0,0,0,.35)';
    for(const k of ['a','b']) x.fillRect(POS[k]-36,GY-4,72,7);

    x.strokeStyle='#39445c'; x.lineWidth=2; x.globalAlpha=.85;
    for(const yy of [472,498]){ x.beginPath(); x.moveTo(-BG,yy); x.lineTo(W+BG,yy); x.stroke(); }
    x.globalAlpha=1;
    x.fillStyle='#2b3448'; x.fillRect(12,451,8,69); x.fillRect(W-19,451,8,69);
  }
}
