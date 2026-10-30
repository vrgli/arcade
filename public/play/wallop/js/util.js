/* small helpers — no deps */
export const clamp=(v,a,b)=>v<a?a:v>b?b:v;
export const lerp=(a,b,t)=>a+(b-a)*t;
export const rnd=(a,b)=>a+Math.random()*(b-a);
export const ri=(a,b)=>Math.floor(rnd(a,b+1));
export const pick=a=>a[Math.floor(Math.random()*a.length)];
export const $=s=>document.querySelector(s);
export const $$=s=>[...document.querySelectorAll(s)];

export function hex2rgb(h){h=h.replace('#','');return[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)];}
export function mix(a,b,t){
  if(t<=0)return a; if(t>=1)return b;
  const A=hex2rgb(a),B=hex2rgb(b);
  return'#'+[0,1,2].map(i=>Math.round(lerp(A[i],B[i],t)).toString(16).padStart(2,'0')).join('');
}
export const fmt=n=>n.toLocaleString('en-US');
export function mmss(ms){
  ms=Math.max(0,ms); const s=Math.floor(ms/1000);
  return String(Math.floor(s/60))+':'+String(s%60).padStart(2,'0');
}
/* deterministic rng so a battle (and therefore its replay) is reproducible */
export function mulberry(seed){
  let t=seed>>>0;
  return function(){ t+=0x6D2B79F5; let x=t; x=Math.imul(x^x>>>15,x|1); x^=x+Math.imul(x^x>>>7,x|61);
    return((x^x>>>14)>>>0)/4294967296; };
}
