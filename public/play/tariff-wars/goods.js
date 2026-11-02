/* Tariff Wars — the four goods as shaded pixel-art sprites, drawn on canvas (no image files).
   Each sprite is painted on a small pixel grid with simple shapes, then given a dark outline,
   so it sits with the 16-bit leader portraits. The tariff bar under each card carries the value. */
(function (root) {
  'use strict';
  var OUT = '#120e18';
  function Grid(w, h) { this.w = w; this.h = h; this.p = new Array(w * h).fill(null); }
  Grid.prototype.set = function (x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.p[y * this.w + x] = c; };
  Grid.prototype.get = function (x, y) { return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? this.p[y * this.w + x] : null; };
  Grid.prototype.rect = function (x, y, w, h, c) { for (var j = y; j < y + h; j++) for (var i = x; i < x + w; i++) this.set(i, j, c); return this; };
  // filled ellipse, tested at pixel centres; `only` limits painting to pixels already of that colour
  Grid.prototype.ell = function (cx, cy, rx, ry, c, only) {
    for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) {
      var dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1 && (only === undefined || this.get(x, y) === only)) this.set(x, y, c);
    }
    return this;
  };
  Grid.prototype.poly = function (pts, c, only) {
    for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) {
      var px = x + 0.5, py = y + 0.5, inside = false;
      for (var i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        var xi = pts[i][0], yi = pts[i][1], xj = pts[j][0], yj = pts[j][1];
        if ((yi > py) !== (yj > py) && px < (xj - xi) * (py - yi) / (yj - yi) + xi) inside = !inside;
      }
      if (inside && (only === undefined || this.get(x, y) === only)) this.set(x, y, c);
    }
    return this;
  };
  Grid.prototype.line = function (x0, y0, x1, y1, c) {
    var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2 + 1;
    for (var k = 0; k <= n; k++) this.set(x0 + (x1 - x0) * k / n + 0.5, y0 + (y1 - y0) * k / n + 0.5, c);
    return this;
  };
  // recolour every pixel of colour `from` that satisfies test(x,y)
  Grid.prototype.tint = function (from, to, test) {
    for (var y = 0; y < this.h; y++) for (var x = 0; x < this.w; x++) if (this.get(x, y) === from && test(x, y)) this.set(x, y, to);
    return this;
  };
  // Returns a copy one pixel larger on every side, with a 1px outline around every shape.
  Grid.prototype.outline = function (c) {
    var o = new Grid(this.w + 2, this.h + 2), x, y;
    for (y = 0; y < this.h; y++) for (x = 0; x < this.w; x++) o.set(x + 1, y + 1, this.get(x, y));
    var add = [];
    for (y = 0; y < o.h; y++) for (x = 0; x < o.w; x++) {
      if (o.get(x, y)) continue;
      if (o.get(x - 1, y) || o.get(x + 1, y) || o.get(x, y - 1) || o.get(x, y + 1)) add.push([x, y]);
    }
    add.forEach(function (a) { o.set(a[0], a[1], c); });
    return o;
  };

  // ---- the sprites ---------------------------------------------------------
  function car() {
    var R = '#e0443e', r = '#a52a2f', rd = '#6e1b24', hl = '#ff8a7a', G = '#9fd8ff', g = '#4f86c6', gw = '#e8f7ff',
        T = '#25222c', M = '#c9cdd6', m = '#7d8290', Y = '#ffe27a', O = '#ff6a3d', C = '#b7bcc6';
    var q = new Grid(34, 19);
    q.poly([[1, 9], [3, 7.5], [9, 7], [12.5, 2.5], [22, 2.5], [26.5, 7], [31, 7.6], [33, 9.5], [33, 15], [1, 15]], R);
    // glass, split by a pillar
    q.poly([[11, 7.5], [13.6, 3.6], [17.4, 3.6], [17.4, 7.5]], G);
    q.poly([[18.6, 7.5], [18.6, 3.6], [21.5, 3.6], [25, 7.5]], G);
    q.tint(G, g, function (x, y) { return y >= 6; });
    q.set(14, 4, gw); q.set(14, 5, gw); q.set(13, 6, gw); q.set(19, 4, gw); q.set(20, 4, gw);
    // body shading: shine line along the shoulder, darker sill
    q.tint(R, hl, function (x, y) { return y === 8 && x > 2 && x < 31; });
    q.tint(R, r, function (x, y) { return y >= 12; });
    q.tint(R, hl, function (x, y) { return y === 3 && x > 13 && x < 21; });
    // door seam + handle
    q.line(18, 8, 18, 13, rd); q.rect(15, 9, 2, 1, rd); q.rect(20, 9, 2, 1, rd);
    // lights and bumpers
    q.rect(31, 9, 2, 2, Y); q.rect(1, 9, 2, 2, O); q.rect(29, 13, 4, 2, C); q.rect(1, 13, 3, 2, C);
    // wheel arches cut out, then wheels
    [[8.5, 14.5], [25.5, 14.5]].forEach(function (w) {
      q.ell(w[0], w[1], 4.6, 4.6, null);
      q.ell(w[0], w[1], 3.9, 3.9, T); q.ell(w[0], w[1], 2.1, 2.1, M); q.ell(w[0] + 0.5, w[1] + 0.5, 1.2, 1.2, m, M);
      q.set(w[0] - 1, w[1] - 1, '#ffffff');
    });
    return q.outline(OUT);
  }
  function wine() {
    var B = '#2f7a4f', b = '#1c4a31', bh = '#7cc79a', F = '#8e2b4a', f = '#5c1830', L = '#f1e6c8', l = '#c7b68a', P = '#7a2f6b',
        V = '#9c1f40', v = '#5e0f24', vw = '#d24a6a', Q = '#cfe8f2', q2 = '#7fa6b8', S = '#dbeef5';
    var g = new Grid(28, 30);
    // bottle
    g.rect(5, 1, 4, 10, B); g.ell(7, 13, 5.2, 4.2, B); g.rect(2, 13, 10, 16, B);
    g.rect(5, 0, 4, 5, F); g.tint(F, f, function (x) { return x >= 8; });
    g.tint(B, b, function (x) { return x >= 10 || (x >= 8 && x < 9 && x > 7); });
    g.tint(B, bh, function (x, y) { return x === 3 && y > 13 && y < 27; });
    g.tint(B, bh, function (x, y) { return x === 6 && y > 4 && y < 10; });
    g.rect(2, 17, 10, 7, L); g.tint(L, l, function (x) { return x >= 10; });
    g.rect(5, 19, 4, 3, P); g.rect(6, 18, 2, 1, P);
    // glass: bowl of wine, empty glass above it, stem and foot
    g.ell(20.5, 12, 6, 7, Q);
    g.rect(14, 4, 14, 8, null);                  // flat top: keep the lower part of the bowl
    g.rect(15, 8, 11, 4, q2);                    // the glass wall, see-through
    g.ell(20.5, 12, 6, 7, q2, null);
    g.ell(20.5, 12, 5, 6, V, Q); g.ell(20.5, 12, 5, 6, V, q2);
    g.tint(V, q2, function (x, y) { return y < 12; });
    g.tint(V, v, function (x, y) { return x >= 23 || y >= 17; });
    g.tint(V, vw, function (x, y) { return y === 12 && x < 21; });
    g.tint(q2, Q, function (x, y) { return x === 15 || x === 25 || y === 8; });
    g.set(16, 10, '#ffffff'); g.set(16, 11, '#ffffff');
    g.rect(20, 19, 2, 8, S); g.ell(21, 28, 5, 1.6, S); g.set(20, 18, Q); g.set(21, 18, Q);
    return g.outline(OUT);
  }
  function chips() {
    var N = '#2f63b8', n = '#1d3f7c', nh = '#6f9ff0', A = '#d5dbe6', a = '#8d97ab', aw = '#ffffff', Y = '#f0c64e', y = '#a8842f', K = '#0f1a33';
    var g = new Grid(28, 28);
    for (var i = 0; i < 6; i++) {
      var p = 5 + i * 3.2;
      g.rect(p, 1, 2, 4, Y); g.rect(p, 23, 2, 4, Y); g.rect(1, p, 4, 2, Y); g.rect(23, p, 4, 2, Y);
    }
    g.tint(Y, y, function (x, yy) { return yy >= 23 || x >= 23 || (x % 1 === 0 && (Math.floor(x) % 3.2 > 1.6)); });
    g.rect(4, 4, 20, 20, N);
    g.tint(N, nh, function (x, yy) { return x === 4 || yy === 4; });
    g.tint(N, n, function (x, yy) { return x === 23 || yy === 23; });
    g.rect(9, 9, 10, 10, A);
    g.tint(A, a, function (x, yy) { return x === 18 || yy === 18; });
    g.tint(A, aw, function (x, yy) { return (x === 9 || yy === 9) && x < 18 && yy < 18; });
    g.rect(6, 6, 2, 2, K);
    g.rect(11, 12, 6, 1, a); g.rect(11, 14, 4, 1, a);
    // traces from the die to the pins
    g.rect(13, 5, 2, 3, n); g.rect(13, 20, 2, 3, n); g.rect(5, 13, 3, 2, n); g.rect(20, 13, 3, 2, n);
    return g.outline(OUT);
  }
  function grain() {
    var Y = '#f4c44f', y = '#b07a22', yh = '#fff2b8', sp = '#8f6420', A = '#efd78f', S = '#d8b05a', s = '#9c7630', Bn = '#9a5530', bn = '#5f311d', bh = '#c97a45';
    var g = new Grid(28, 32);
    // stalks: a tight bundle under the band, fanning a little towards the ground
    for (var i = 0; i < 6; i++) g.line(11.5 + i, 21, 8 + i * 2.4, 31, i % 2 ? s : S);
    // a kernel: small oval, lit on top, shaded on the lower half
    function kernel(cx, cy) {
      g.ell(cx, cy, 1.25, 1.75, Y);
      g.tint(Y, y, function (x, yy) { return yy + 0.5 > cy + 0.4 && Math.abs(x + 0.5 - cx) < 1.4 && Math.abs(yy + 0.5 - cy) < 2; });
      g.set(cx - 0.4, cy - 1.1, yh);
    }
    // three ears, each on its own spine from the band (bx,by) to the tip (tx,ty)
    [[9.5, 19, 4.5, 3.5], [14, 18.5, 14, 2], [18.5, 19, 23.5, 3.5]].forEach(function (e) {
      var bx = e[0], by = e[1], tx = e[2], ty = e[3];
      g.line(bx, by, tx, ty, sp);
      var len = Math.hypot(tx - bx, ty - by), nx = -(ty - by) / len, ny = (tx - bx) / len;
      for (var k = 0; k < 5; k++) {
        var t = 0.22 + k * 0.17, cx = bx + (tx - bx) * t, cy = by + (ty - by) * t;
        kernel(cx + nx * 1.3, cy + ny * 1.3); kernel(cx - nx * 1.3, cy - ny * 1.3 - 0.9);
      }
      kernel(bx + (tx - bx) * 1.04, by + (ty - by) * 1.04);
      // awns: thin whiskers off the tip
      var ax = bx + (tx - bx) * 1.1, ay = by + (ty - by) * 1.1;
      g.line(ax - 1, ay, ax - 2.5 + (tx - bx) * 0.08, ay - 3, A); g.line(ax + 1, ay, ax + 2.5 + (tx - bx) * 0.08, ay - 3, A);
    });
    // twine band
    g.rect(10, 19, 9, 3, Bn); g.tint(Bn, bn, function (x, yy) { return yy === 21; }); g.tint(Bn, bh, function (x, yy) { return yy === 19 && x % 2 === 0; });
    return g.outline(OUT);
  }

  var GOODS = [
    { n: 'Grain', c: 'g-grain', dim: '#4d3d10', hot: '#ffd451', draw: grain },
    { n: 'Wine', c: 'g-wine', dim: '#3f1c46', hot: '#e08fe8', draw: wine },
    { n: 'Cars', c: 'g-cars', dim: '#4f2222', hot: '#ff7f7f', draw: car },
    { n: 'Chips', c: 'g-chips', dim: '#1b3150', hot: '#7fb6ff', draw: chips }
  ];
  function hex(h) { return [parseInt(h.substr(1, 2), 16), parseInt(h.substr(3, 2), 16), parseInt(h.substr(5, 2), 16)]; }
  function mix(a, b, t) { var x = hex(a), y = hex(b); return 'rgb(' + [0, 1, 2].map(function (i) { return Math.round(x[i] + (y[i] - x[i]) * t); }).join(',') + ')'; }
  function heat(r) { return Math.max(0, Math.min(1, (r - 1) / 9)); }
  function barColor(s, r) { var g = GOODS[s]; return mix(g.dim, g.hot, 0.15 + 0.85 * heat(r)); }
  var cache = {}, SCALE = 8;
  // Data URL of good `s`. The art is the same at every tariff; `r` is accepted for older callers.
  function art(s) {
    if (cache[s]) return cache[s];
    var q = GOODS[s].draw(), c = document.createElement('canvas');
    c.width = q.w * SCALE; c.height = q.h * SCALE;
    var g = c.getContext('2d');
    for (var y = 0; y < q.h; y++) for (var x = 0; x < q.w; x++) { var k = q.get(x, y); if (k) { g.fillStyle = k; g.fillRect(x * SCALE, y * SCALE, SCALE, SCALE); } }
    return (cache[s] = c.toDataURL());
  }
  function icon(s) { return '<img class="gi" src="' + art(s) + '" alt="' + GOODS[s].n + '">'; }
  root.TWG = { GOODS: GOODS, art: art, icon: icon, barColor: barColor, heat: heat };
})(window);
