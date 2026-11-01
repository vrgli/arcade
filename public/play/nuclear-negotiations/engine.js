/* Nuclear Negotiations — table engine. No DOM, so the same rules can run on a server later.
 *
 * Two wheels of four seats. Positions go clockwise from top-left: 0,1,2,3.
 * Outer seats are lettered A B D C (A top-left, B top-right, D bottom-right, C bottom-left);
 * inner seats are numbered 1 2 4 3 the same way, so A faces 1, B faces 2, C faces 3, D faces 4.
 * Seat labels are fixed to the table; leaders move through them.
 *
 * Standard mode: a move swaps a rogue leader with the leader facing it on the other wheel,
 * then the outer wheel turns one seat clockwise. If that leaves the two rogues facing each
 * other, it is nuclear war and whoever made the move loses.
 */
(function (root) {
  'use strict';
  var LEADERS = [
    { id: 'don', nm: 'Don' }, { id: 'vlad', nm: 'Vlad' }, { id: 'ursula', nm: 'Ursula' }, { id: 'zel', nm: 'Zel' },
    { id: 'modi', nm: 'Modi' }, { id: 'bibi', nm: 'Bibi' }, { id: 'obama', nm: 'Obama' }, { id: 'mbs', nm: 'MBS' },
  ];
  var OUTER = ['A', 'B', 'D', 'C'], INNER = ['1', '2', '4', '3'];

  // Small seeded PRNG (mulberry32) so a game can be replayed from its seed.
  function rng(seed) { var a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function newGame(seed) {
    if (seed == null) seed = (Math.random() * 4294967296) >>> 0;
    var r = rng(seed), ids = LEADERS.map(function (l) { return l.id; });
    for (var i = ids.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
    var ro = Math.floor(r() * 4), ri = Math.floor(r() * 3); if (ri >= ro) ri++;   // never facing
    return { seed: seed, outer: ids.slice(0, 4), inner: ids.slice(4, 8), rogue: {}, rogueOuter: ro, rogueInner: ri, moves: 0, log: [], over: false, turns: 0 };
  }
  // Rogue reveal: fix which two leaders are rogue (the leaders carry it, not the seats).
  function reveal(g) { g.rogue[g.outer[g.rogueOuter]] = true; g.rogue[g.inner[g.rogueInner]] = true; g.log.push('reveal ' + rogues(g)); return g; }

  function rogues(g) {
    var s = [];
    for (var k = 0; k < 4; k++) { if (g.rogue[g.outer[k]]) s.push(OUTER[k] + '*'); if (g.rogue[g.inner[k]]) s.push(INNER[k] + '*'); }
    return s.join(' ');
  }
  function war(g) { for (var k = 0; k < 4; k++) if (g.rogue[g.outer[k]] && g.rogue[g.inner[k]]) return k; return -1; }
  // Legal moves: every position holding exactly one rogue (both would already be war).
  function legal(g) { var m = []; if (g.over) return m; for (var k = 0; k < 4; k++) if (g.rogue[g.outer[k]] || g.rogue[g.inner[k]]) m.push(k); return m; }
  function notation(g, k) { return OUTER[k] + (g.rogue[g.outer[k]] ? '*' : '') + '<->' + INNER[k] + (g.rogue[g.inner[k]] ? '*' : ''); }
  // Would playing position k end in war? (Lets a trainer or an AI tell a blunder from a safe move.)
  function fatal(g, k) { var c = clone(g); apply(c, k); return c.over; }

  function apply(g, k) {
    if (g.over || legal(g).indexOf(k) < 0) return null;
    var line = notation(g, k);
    var t = g.outer[k]; g.outer[k] = g.inner[k]; g.inner[k] = t;             // the swap
    g.outer = [g.outer[3], g.outer[0], g.outer[1], g.outer[2]];               // outer turns one seat clockwise
    g.turns++; g.moves++;
    var w = war(g); g.over = w >= 0;
    g.log.push(g.moves + '. ' + line + ' -> ' + (g.over ? 'NUCLEAR WAR at ' + OUTER[w] + '/' + INNER[w] : rogues(g)));
    return { move: line, war: w };
  }
  function clone(g) { return JSON.parse(JSON.stringify(g)); }
  function logText(g) { return ['Nuclear Negotiations · seed ' + g.seed, 'outer A ' + g.outer[0] + ' B ' + g.outer[1] + ' D ' + g.outer[2] + ' C ' + g.outer[3] + ' (now)', 'inner 1 ' + g.inner[0] + ' 2 ' + g.inner[1] + ' 4 ' + g.inner[2] + ' 3 ' + g.inner[3]].concat(g.log).join('\n'); }

  var NN = { LEADERS: LEADERS, OUTER: OUTER, INNER: INNER, newGame: newGame, reveal: reveal, legal: legal, apply: apply, fatal: fatal, war: war, rogues: rogues, notation: notation, logText: logText, name: function (id) { for (var i = 0; i < LEADERS.length; i++) if (LEADERS[i].id === id) return LEADERS[i].nm; return id; } };
  if (root.exports) root.exports = NN; else root.NN = NN;
})(typeof module !== 'undefined' ? module : window);
