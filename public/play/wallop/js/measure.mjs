// node measure.mjs — frequencies behind P_NOBODY in engine.js
import { genMatch } from './engine.js';
let draws=0, flat=0, n=100000;
for(let s=1;s<=n;s++){ const m=genMatch(s*7919); if(!m.winner) draws++; flat+=m.score.draws; }
console.log('battle nobody (draw):', (draws/n).toFixed(4), ' round nobody (flat):', (flat/(n*3)).toFixed(4));
