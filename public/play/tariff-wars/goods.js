/* Tariff Wars — the four goods, drawn as chunky pixel tiles on canvas (no image files).
   Each good is a small grid map. Every cell is one rounded tile with a light outline;
   'O' starts a 2x2 tile (wheels) and 'o' marks the cells it covers.
   The tariff (rank 1..10) heats the colour: 10% reads dark, 100% reads bright. */
(function (root) {
  'use strict';
  var TILE = 32;
  var DARK = '#1f2329', LIGHT = '#ece6d8', GOLD = '#e8c15a', BROWN = '#8a5a2b', LAMP = '#ffe27a', EDGE = '#d4d6db';
  // suit index 0..3, same order as the engine
  var GOODS = [
    { n: 'Grain', c: 'g-grain', dim: '#4d3d10', hot: '#ffd451', edge: '#f3cf63',
      map: ['.R...R.', 'RR.R.RR', 'RR.R.RR', '.R.R.R.', '..RRR..', '..BBB..', '.S.S.S.', 'S..S..S'] },
    { n: 'Wine', c: 'g-wine', dim: '#3f1c46', hot: '#e08fe8', edge: '#c06ec0',
      map: ['.B.....', '.S.....', 'RRR.L.L', 'RLR.RRR', 'RLR.RRR', 'RRR..L.', 'RRR..L.', 'RRR.LLL'] },
    { n: 'Cars', c: 'g-cars', dim: '#4f2222', hot: '#ff7f7f', edge: '#f07070',
      map: ['..RRRR...', '.RDDRDDR.', 'RRRRRRRRH', 'SOoRRROoR', '.oo...oo.'] },
    { n: 'Chips', c: 'g-chips', dim: '#1b3150', hot: '#7fb6ff', edge: '#7fb0f0',
      map: ['.L.L.L.', 'LRRRRRL', '.RYYYR.', 'LRYDYRL', '.RYYYR.', 'LRRRRRL', '.L.L.L.'] }
  ];
  function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function mix(a, b, t) { var x = hex(a), y = hex(b); return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(x[i] + (y[i] - x[i]) * t); }).join(',') + ')'; }
  // Tariff heat 0..1 for rank 1..10.
  function heat(r) { return Math.max(0, Math.min(1, (r - 1) / 9)); }
  function barColor(s, r) { var g = GOODS[s]; return mix(g.dim, g.hot, 0.15 + 0.85 * heat(r)); }
  function rr(g, x, y, w, h, rad) {
    g.beginPath(); g.moveTo(x + rad, y); g.arcTo(x + w, y, x + w, y + h, rad); g.arcTo(x + w, y + h, x, y + h, rad);
    g.arcTo(x, y + h, x, y, rad); g.arcTo(x, y, x + w, y, rad); g.closePath();
  }
  var cache = {};
  // Data URL of good `s` at tariff rank `r` (r = 0 → neutral mid tone, used for icons).
  function art(s, r) {
    var key = s + ':' + r; if (cache[key]) return cache[key];
    var gd = GOODS[s], t = r ? 0.3 + 0.7 * heat(r) : 0.75;
    var main = mix(gd.dim, gd.hot, t), shade = mix(gd.dim, gd.hot, t * 0.55);
    var pal = { R: main, S: shade, D: DARK, O: DARK, L: LIGHT, Y: GOLD, B: BROWN, H: LAMP };
    var map = gd.map, w = map[0].length, h = map.length, pad = TILE * 0.1;
    var c = document.createElement('canvas'); c.width = w * TILE + 2 * pad; c.height = h * TILE + 2 * pad;
    var g = c.getContext('2d'), ox = pad, oy = pad;
    var gap = TILE * 0.09, lw = TILE * 0.075;
    map.forEach(function (row, y) {
      for (var x = 0; x < row.length; x++) {
        var k = row[x]; if (k === '.' || k === 'o') continue;
        var span = k === 'O' ? 2 : 1, sz = span * TILE - 2 * gap;
        rr(g, ox + x * TILE + gap, oy + y * TILE + gap, sz, sz, sz * 0.26);
        g.fillStyle = pal[k] || '#f0f'; g.fill();
        g.lineWidth = lw; g.strokeStyle = EDGE; g.stroke();
      }
    });
    return (cache[key] = c.toDataURL());
  }
  function icon(s) { return '<img class="gi" src="' + art(s, 0) + '" alt="' + GOODS[s].n + '">'; }
  root.TWG = { GOODS: GOODS, art: art, icon: icon, barColor: barColor, heat: heat };
})(window);
