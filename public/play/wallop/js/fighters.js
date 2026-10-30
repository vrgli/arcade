/* ═══════════════════════════════════════════════════════════════════════════
   PLACEHOLDER FIGHTER ART + THE SKIN LIBRARY.

   This file is the ONLY place character art and character identity are
   defined, and it exists to be deleted. Figures are drawn procedurally from
   boxes on a 5px grid so they read as pixel-art massing without anyone
   mistaking them for finished art.

   THE BOUNDARY THAT MATTERS (scope doc 6.1): nothing outside this file knows
   which skin is loaded. arena.js calls drawFighter(ctx, skin, pose, opts) and
   never looks inside; sim.js deals only in 'a' and 'b' and has no concept of a
   fighter at all. Swapping skins is therefore art + config and nothing else —
   setSkinPair() below mutates the live SKINS binding and the next frame draws
   the new characters. No reload, no touch to the fight logic.

   SWAPPING IN REAL ART (the five-pose sheets from scope 3.1):
     1. Load one image per fighter: 5 cells — neutral, attacking, defending,
        wins, loses.
     2. Replace the body of drawFighter() with one drawImage() per pose,
        registered on the declared anchor.
     3. Delete buildPoses / headgear / SKIN_LIBRARY art fields. Callers unchanged.

   Tinting is free here because the figures are filled shapes, which is why
   this mockup does not need a WebGL renderer. Real textured poses do.
   ═══════════════════════════════════════════════════════════════════════════ */

import { mix } from './util.js';

export const U  = 7;    // grid unit, logical px
export const FH = 37;   // figure height in units, feet at FH

/* box = [paletteKey, x, y, w, h] — x relative to feet-centre, y down from crown.
   cfg: { sh half-shoulder, hw half-head, hh head height,
          torso 'box'|'v', mid 'tie'|'belt'|null } */
function buildPoses(cfg){
  const {sh,hw,hh,torso,mid}=cfg;
  const nkY=4+hh, nkH=Math.max(1,13-nkY);
  const head=y=>['skin',-hw,y,hw*2,hh];

  /* torso: one box, a V (broad shoulders, narrow waist) for a bare build, a
     caped block, or a long coat. Silhouette is what reads at this size. */
  const trunk=(dx)=>{
    if(torso==='v') return [['suit',-sh-1+dx,13,(sh+1)*2,6],['suit',-sh+2+dx,19,(sh-2)*2,6],
                            ['pec',-sh+1+dx,15,sh*2-2,1]];
    /* a flat block reads as a block. Give every build a collar line and
       something on the chest so it reads as a costume. */
    if(torso==='cape') return [['suit',-sh+dx,13,sh*2,12],
                               ['capeHi',-sh+1+dx,13,sh*2-2,2],   /* yoke   */
                               ['tie',-1+dx,16,2,1],              /* emblem */
                               ['tie',-2+dx,17,4,1],
                               ['tie',-1+dx,18,2,1]];
    if(torso==='coat') return [['suit',-sh+dx,13,sh*2,12],
                               ['tie',-sh+1+dx,13,sh*2-2,2],      /* collar */
                               ['tie',-1+dx,15,2,9]];             /* lapel  */
    return [['suit',-sh+dx,13,sh*2,12]];
  };
  /* the cape needs a shape at the shoulders, not just width */
  const cape =(dx)=> torso==='cape' ? [['cape',-sh-3+dx,12,(sh+3)*2,5],
                                       ['cape',-sh-2+dx,17,(sh+2)*2,7],
                                       ['cape',-sh+dx,  24,sh*2,7]] : [];
  const coat =(dx)=> torso==='coat' ? [['suit',-sh+dx,24,sh*2,9],
                                       ['tie',-sh+dx,24,sh*2,1]] : [];

  /* mid detail: a tie down the chest, a belt across the waist, or nothing */
  const midbox=(dx)=> mid==='tie'  ? [['tie',-1+dx,14,2,8]]
                    : mid==='belt' ? [['tie',-sh+1+dx,22,(sh-1)*2,2]]
                    : [];

  return {
    neutral:{ head:[-hw,4,hw*2,hh], boxes:[
      ...cape(0), head(4),['skin',-2,nkY,4,nkH],
      ...trunk(0),...midbox(0),
      ['arm',-sh-3,14,3,9],['arm',sh,14,3,9],
      ['skin',-sh-3,23,3,3],['skin',sh,23,3,3],
      ['trou',-5,25,4,10],['trou',1,25,4,10],
      ['shoe',-6,35,5,2],['shoe',1,35,5,2],...coat(0) ]},

    attacking:{ head:[-hw+3,3,hw*2,hh], boxes:[
      ...cape(2),['skin',-hw+3,3,hw*2,hh],['skin',1,nkY-1,4,nkH+1],
      ...trunk(2),...midbox(2),
      ['arm',-sh-2,16,3,8],['skin',-sh-2,24,3,3],
      ['arm',sh+2,15,8,4],['skin',sh+9,14,5,5],            /* extended lead arm */
      ['trou',-7,25,4,10],['trou',3,25,4,10],
      ['shoe',-9,35,6,2],['shoe',3,35,6,2],...coat(2) ]},

    defending:{ head:[-hw-2,5,hw*2,hh], boxes:[
      ...cape(-2),['skin',-hw-2,5,hw*2,hh],['skin',-3,nkY+1,4,nkH],
      ...trunk(-2),...midbox(-2),
      /* the guard goes UP at the shoulder line, not across the face: at
         sh=8,hw=5 the old -sh+1 put the near arm at x -7..-3 inside a head
         box spanning -7..3, so the arm was drawn over the head */
      ['arm',-sh-5,8,3,9],['arm',sh-2,8,3,9],               /* guard up */
      ['skin',-sh-5,5,3,3],['skin',sh-2,5,3,3],             /* gloves    */
      ['trou',-6,25,4,10],['trou',0,25,4,10],
      ['shoe',-7,35,5,2],['shoe',0,35,5,2],...coat(-2) ]},

    wins:{ head:[-hw,4,hw*2,hh], boxes:[
      ...cape(0), head(4),['skin',-2,nkY,4,nkH],
      ...trunk(0),...midbox(0),
      ['arm',-sh-2,1,3,13],['arm',sh-1,1,3,13],             /* arms overhead */
      ['skin',-sh-2,-2,3,3],['skin',sh-1,-2,3,3],
      ['trou',-5,25,4,10],['trou',1,25,4,10],
      ['shoe',-6,35,5,2],['shoe',1,35,5,2],...coat(0) ]},

    /* ── TAKING IT ───────────────────────────────────────────────────────
       The defender used to absorb a tier-3 blow still in `defending`, guard
       up, and then teleport to `loses` on the floor. A punch reads as a
       punch because the thing being hit changes shape at the moment of
       contact, and `_impact()` already fires on exactly that frame.

       Three things make it read, and none of them is detail: the head is
       snapped back and UP (the only pose where it rises), the guard is
       GONE rather than merely moved, and the feet skid back a further two
       units past `defending`. The arena adds translation and rotation on
       top via recoilPx / recoilDeg, so this only has to break the
       silhouette — and it must break it differently from `loses`, which is
       horizontal, or a tier-2 hit will look like a knockdown. */
    hit:{ head:[-hw-4,2,hw*2,hh], boxes:[
      ...cape(-4),['skin',-hw-4,2,hw*2,hh],['skin',-3,nkY,4,nkH],
      ...trunk(-4),...midbox(-4),
      ['arm',-sh-7,17,3,8],['arm',sh-1,19,3,8],             /* guard broken */
      ['skin',-sh-7,25,3,3],['skin',sh-1,27,3,3],
      ['trou',-7,25,4,10],['trou',-1,25,4,10],              /* skidding back */
      ['shoe',-9,35,5,2],['shoe',-1,35,5,2],...coat(-4) ]},

    loses:{ head:[-12,29,7,6], boxes:[                      /* collapsed */
      ['trou',2,31,10,4],['shoe',11,30,3,5],['shoe',11,34,3,3],
      ['suit',-6,28,9,8],['tie',-2,30,6,2],
      ['skin',-12,29,7,6],
      ['arm',-4,24,3,5],['skin',-4,21,3,3],
      ['arm',-1,35,7,2] ]}
  };
}

/* headgear is what carries identity at pixel resolution — see change note:
   a bald man in a suit has the same silhouette as any man in a suit. */
function headgear(style, head){
  const [hx,hy,hw2]=head;
  /* an eye is 1x2 units. At this resolution four or five face pixels carry
     most of the identity, so every style gets one. */
  const eye=(dx,dy)=>['line',hx+hw2-dx,hy+dy,1,2];
  switch(style){
    case 'swoosh': return [['hair',hx-1,hy-2,hw2+2,3],['hair',hx+hw2-2,hy-4,4,3],eye(3,3),
                           ['line',hx+hw2-4,hy+5,3,1]];
    case 'crop':   return [['hair',hx,hy-2,hw2,2],eye(3,3),['line',hx+hw2-4,hy+5,3,1]];
    /* the face IS the brand mark, drawn in the same chunky pixel grid */
    case 'btc':    { const X=hx+3, Y=hy+2; return [
        ['logo',X,Y,1,5],   ['logo',X+1,Y,2,1],   ['logo',X+3,Y+1,1,1],
        ['logo',X+1,Y+2,2,1],['logo',X+3,Y+3,1,1],['logo',X+1,Y+4,2,1],
        ['logo',X+1,Y-1,1,1],['logo',X+1,Y+5,1,1]]; }
    case 'eth':    { const X=hx+2, Y=hy+1; return [
        ['logo',X+2,Y,1,1],  ['logo',X+1,Y+1,3,1],['logo',X,Y+2,5,1],
        ['logo',X+1,Y+3,3,1],['logo',X+2,Y+4,1,1],
        ['logo',X+1,Y+5,3,1],['logo',X+2,Y+6,1,1]]; }
    case 'horns':  return [['horn',hx-3,hy,3,2],['horn',hx-4,hy-3,2,3],
                           ['horn',hx+hw2,hy,3,2],['horn',hx+hw2+2,hy-3,2,3],
                           ['hair',hx+1,hy-2,hw2-2,2],
                           ['snout',hx+hw2-1,hy+3,4,4],['shoe',hx+hw2+2,hy+4,2,1],eye(4,2)];
    case 'ears':   return [['horn',hx-1,hy-3,3,3],['horn',hx+hw2-2,hy-3,3,3],
                           ['snout',hx+hw2-1,hy+3,4,4],['shoe',hx+hw2+2,hy+4,2,1],eye(4,2)];
    default:       return [];
  }
}

/* ─── the skin library. A skin is art + labels + colours. Nothing else. ─── */
/* ── the dollar: a big coin on spindly limbs. Comic, not menacing — a round
   mass against the Captain's broad caped one. ── */
function coinPoses(){
  const disc=(dx)=>[
    ['suit',-5+dx,6,10,2],  ['suit',-8+dx,8,16,2],  ['suit',-10+dx,10,20,3],
    ['suit',-11+dx,13,22,9],['suit',-10+dx,22,20,3],['suit',-8+dx,25,16,2],
    ['suit',-5+dx,27,10,2],
    ['pec',-7+dx,9,14,2],   ['pec',-9+dx,11,18,13], ['pec',-7+dx,24,14,2] ];
  const buck=(dx)=>[
    ['logo',-1+dx,11,2,2],  ['logo',-2+dx,13,4,1],  ['logo',-3+dx,14,1,2],
    ['logo',-2+dx,16,4,1],  ['logo',2+dx,17,1,2],   ['logo',-2+dx,19,4,1],
    ['logo',-1+dx,20,2,2] ];
  const legs=(dx,sp)=>[
    ['arm',-4+dx-sp,28,2,7],['arm',2+dx+sp,28,2,7],
    ['shoe',-6+dx-sp,35,5,2],['shoe',2+dx+sp,35,5,2] ];
  /* arms sit clear of the rim or the disc swallows them */
  const armDown=(dx,sgn)=>[['arm',sgn>0?12+dx:-14+dx,15,2,10],
                           ['skin',sgn>0?11+dx:-15+dx,24,4,3]];
  const armUp  =(dx,sgn)=>[['arm',sgn>0?12+dx:-14+dx,4,2,12],
                           ['skin',sgn>0?11+dx:-15+dx,1,4,3]];
  const armOut =(dx)=>[['arm',12+dx,17,9,2],['skin',20+dx,16,4,4]];
  const B=(dx,arms,sp)=>({ head:[-3+dx,12,6,8],
    boxes:[...arms,...disc(dx),...buck(dx),...legs(dx,sp||0)] });
  return {
    neutral:   B(0,[...armDown(0,-1),...armDown(0,1)]),
    attacking: B(2,[...armDown(2,-1),...armOut(2)],1),
    defending: B(-2,[...armUp(-2,-1),...armUp(-2,1)]),
    wins:      B(0,[...armUp(0,-1),...armUp(0,1)]),
    /* knocked back but still a coin: driven 5 units away, one arm thrown
       up and one dropped — asymmetry is what tells it apart from
       `defending`, where both are up — and the legs splayed wider than
       the lunge. Built from the same helpers so the $ cannot slide off. */
    hit:       B(-5,[...armUp(-5,-1),...armDown(-5,1)],2),
    /* DOWN, but still a coin. The old pose redrew the body as a 26x12 slab
       with a four-box scribble for the glyph — at 15 seconds on screen that
       read as a wooden crate. A round thing on its side is still round, so
       the disc and the $ are reused verbatim and only the CHARACTER topples:
       the legs come out sideways at floor level and the arms flop. */
    loses:(()=>{
      /* y-only translate: a logo box is never x-mirrored (see drawFighter),
         so shifting the disc sideways would slide the $ clean off the coin */
      const T=b=>[b[0],b[1],b[2]+8,b[3],b[4]];
      return { head:[-3,20,6,8], boxes:[
        ...disc(0).map(T), ...buck(0).map(T),
        ['arm',11,24,10,2],['shoe',20,23,4,4],     /* near leg, out flat   */
        ['arm',11,30,10,2],['shoe',20,29,4,4],     /* far leg              */
        ['arm',10,17,8,2],['skin',17,16,4,4],      /* arm over the rim     */
        ['arm',-16,34,5,2],['skin',-20,33,4,4] ]   /* arm flat on the floor*/
      }; })()
  };
}

const BUILD_SUIT   = {sh:7,hw:4,hh:7,torso:'box',mid:'tie'};
const BUILD_BARE   = {sh:8,hw:4,hh:7,torso:'v',  mid:'belt'};
const BUILD_BEAST  = {sh:8,hw:5,hh:8,torso:'box',mid:null};

const BUILD_CAPE  = {sh:8,hw:5,hh:8,torso:'cape',mid:'belt'};
const BUILD_COAT  = {sh:5,hw:5,hh:8,torso:'coat',mid:null};

export const SKIN_LIBRARY = {
  /* default pair: the two assets as rival characters. Captain takes the UP
     side and the Professor the DOWN side, which is the right way round — ETH
     gains on BTC precisely when BTC falls. The market labels stay BTC UP and
     BTC DOWN so this can never read as a BTC-versus-ETH market. */
  cb_v1:{
    id:'cb_v1', label:'CAPTAIN / BUCK',
    a:{ id:'a', name:'CAPT BTC', asset:'BTC UP', dir:+1, gear:'btc', glow:'#ffb45c',
        poses:buildPoses(BUILD_CAPE),
        pal:{ suit:'#16223c', arm:'#3d5a99', pec:'#16223c', tie:'#ffc266',
              cape:'#f7931a', capeHi:'#ffc266', skin:'#f7931a', logo:'#fff6e8',
              hair:'#f7931a', trou:'#1b2a4a', shoe:'#0d1320',
              horn:'#f7931a', snout:'#f7931a', line:'#07090f' } },
    b:{ id:'b', name:'BUCK', asset:'BTC DOWN', dir:-1, gear:'none', glow:'#ffd96b',
        poses:coinPoses(),
        pal:{ suit:'#9a6f10', arm:'#e0b23f', pec:'#ffd34d', tie:'#9a6f10',
              cape:'#9a6f10', capeHi:'#ffe9a3', skin:'#f3dc92', logo:'#5a3f06',
              hair:'#e0b23f', trou:'#e0b23f', shoe:'#6b4e0a',
              horn:'#ffd34d', snout:'#ffd34d', line:'#241904' } }
  },
  /* launch skin — political caricature stand-ins */
  tp_v1:{
    id:'tp_v1', label:'DON / VLAD',
    a:{ id:'a', name:'DON', asset:'BTC UP', dir:+1, gear:'swoosh', glow:'#ff8a52',
        poses:buildPoses(BUILD_SUIT),
        pal:{ suit:'#2a4486', arm:'#1e3368', pec:'#1e3368', tie:'#e8392c', cape:'#1e3368', capeHi:'#3d5a99', logo:'#fff',
              skin:'#f0b682', hair:'#ffd95e', trou:'#20306b', shoe:'#141926',
              horn:'#e8c66a', snout:'#dfa877', line:'#070910' } },
    /* bare-chested: a completely different body silhouette from a suit, which
       is the only thing that reads at this resolution */
    b:{ id:'b', name:'VLAD', asset:'BTC DOWN', dir:-1, gear:'crop', glow:'#6cc3ff',
        poses:buildPoses(BUILD_BARE),
        pal:{ suit:'#e8a87a', arm:'#d4926a', pec:'#c47f58', tie:'#333b4a', cape:'#d4926a', capeHi:'#e8a87a', logo:'#fff',
              skin:'#f0b68a', hair:'#cdd2d8', trou:'#364052', shoe:'#141926',
              horn:'#b9bcc0', snout:'#d8ab86', line:'#070910' } }
  },

  /* second skin — same engine, no logic changes, green up / red down */
  bb_v1:{
    id:'bb_v1', label:'BULL / BEAR',
    a:{ id:'a', name:'BULL', asset:'BTC UP', dir:+1, gear:'horns', glow:'#7bf0a8',
        poses:buildPoses(BUILD_BEAST),
        pal:{ suit:'#2f7d52', arm:'#276844', pec:'#276844', tie:'#1d4f33', cape:'#276844', capeHi:'#3f9e6a', logo:'#fff',
              skin:'#399360', hair:'#276844', trou:'#245f3f',
              shoe:'#0f1a14', horn:'#ece3c6', snout:'#9fd8b4', line:'#061009' } },
    b:{ id:'b', name:'BEAR', asset:'BTC DOWN', dir:-1, gear:'ears', glow:'#ff8d7e',
        poses:buildPoses(BUILD_BEAST),
        pal:{ suit:'#8e3a2f', arm:'#732d25', pec:'#732d25', tie:'#5a221c', cape:'#732d25', capeHi:'#a8493c', logo:'#fff',
              skin:'#9c4336', hair:'#732d25', trou:'#6d2b22',
              shoe:'#1a0d0a', horn:'#5c231c', snout:'#7d4034', line:'#0d0605' } }
  }
};

/* Live binding. setSkinPair() mutates it; every draw reads it fresh, so the
   swap lands on the next frame with no reload and no state to migrate. */
export const SKINS = { a:null, b:null, pair:null };
export function setSkinPair(id){
  const s = SKIN_LIBRARY[id] || SKIN_LIBRARY.tp_v1;
  SKINS.a = s.a; SKINS.b = s.b; SKINS.pair = s;
  return s;
}
setSkinPair('cb_v1');

/* The drawn extent of a pose, in logical px relative to (x, groundY).
   The victory pose reaches well above the fighting stance and the floored
   pose reaches sideways, so any camera that frames the pair has to measure
   what is actually on screen rather than assume a fixed box. */
export function poseBounds(skin, poseName){
  const pose  = skin.poses[poseName] || skin.poses.neutral;
  const boxes = pose.boxes.concat(headgear(skin.gear, pose.head));
  const dir = skin.dir;
  let x0=1e9, y0=1e9, x1=-1e9, y1=-1e9;
  for(const b of boxes){
    const [, bx, by, bw, bh] = b;
    const lx = dir>0 ? bx : -(bx+bw);
    x0=Math.min(x0,lx*U);           x1=Math.max(x1,(lx+bw)*U);
    y0=Math.min(y0,-(FH-by)*U);     y1=Math.max(y1,-(FH-by-bh)*U);
  }
  return { x0:x0-U, y0:y0-U, x1:x1+U, y1:y1+U };   /* +1 unit for the outline */
}

/* opts: x, groundY, pose, flash 0..1, hurt 0..1, glow 0..1, rot, scale, alpha */
export function drawFighter(ctx, skin, poseName, opts){
  const o = Object.assign({ x:0, groundY:0, flash:0, hurt:0, glow:0, rot:0, scale:1, alpha:1,
                            dim:0, glowCol:null }, opts);
  const pose  = skin.poses[poseName] || skin.poses.neutral;
  const boxes = pose.boxes.concat(headgear(skin.gear, pose.head));
  const dir = skin.dir, pal = skin.pal;

  ctx.save();
  ctx.globalAlpha = o.alpha;
  ctx.translate(o.x, o.groundY);
  if (o.rot)       ctx.rotate(o.rot);
  if (o.scale!==1) ctx.scale(o.scale, o.scale);

  const rect = (b, inflate) => {
    const [, bx, by, bw, bh] = b;
    /* a brand mark is never mirrored — flipping the fighter would reverse
       the $ and the B along with the body */
    const lx = (dir > 0 || b[0]==='logo') ? bx : -(bx + bw);
    return [ Math.round(lx*U)-inflate, Math.round(-(FH-by)*U)-inflate,
             Math.round(bw*U)+inflate*2, Math.round(bh*U)+inflate*2 ];
  };

  if (o.glow > 0.01){                                   /* additive rim glow */
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=o.alpha*0.30*o.glow; ctx.fillStyle=o.glowCol||skin.glow;
    for(const b of boxes){ const r=rect(b,U*1.6); ctx.fillRect(r[0],r[1],r[2],r[3]); }
    ctx.globalCompositeOperation='source-over'; ctx.globalAlpha=o.alpha;
  }

  ctx.fillStyle = pal.line;                             /* 1-unit dark outline */
  for(const b of boxes){ const r=rect(b,U); ctx.fillRect(r[0],r[1],r[2],r[3]); }

  for(const b of boxes){                                /* body */
    let c = pal[b[0]] || '#ff00ff';
    if (o.hurt  > 0.01) c = mix(c,'#9c2018',o.hurt*0.34);
    /* a beaten fighter is DARKENED, never bleached — losing should drain the
       light out of them, not the colour */
    if (o.dim   > 0.01) c = mix(c,'#05070c',o.dim);
    if (o.flash > 0.01) c = mix(c,'#ffffff',o.flash);
    ctx.fillStyle=c; const r=rect(b,0); ctx.fillRect(r[0],r[1],r[2],r[3]);
  }
  ctx.restore();
}
