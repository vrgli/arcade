/* Presina — pure rules engine.
   Works in the browser (window.KL) and in Node (module.exports) for testing.
   Suits index 0..3 = Grain, Wine, Cars, Chips (artwork in goods.js).
   Ranks 1..10 (10 highest). Display % = rank*10. 4 players, 40-card deck. */
(function (root) {
  'use strict';

  var SUIT_EMOJI = ['🌾', '🍷', '🚗', '💾'];
  var SUIT_NAME  = ['Grain', 'Wine', 'Cars', 'Chips'];
  // Rounds ascend 1..10 then descend 9..1  → 19 rounds.
  var ROUND_SIZES = (function () {
    var a = []; for (var i = 1; i <= 10; i++) a.push(i); for (var j = 9; j >= 1; j--) a.push(j); return a;
  })();

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeDeck() {
    var d = [];
    for (var s = 0; s < 4; s++) for (var r = 1; r <= 10; r++) d.push({ s: s, r: r });
    return d;
  }

  function shuffle(arr, rng) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  // Deal a round: hands[4], and a trump card (null on the 10-card round).
  function dealRound(size, rng) {
    var deck = shuffle(makeDeck(), rng);
    var hands = [[], [], [], []], k = 0;
    for (var i = 0; i < size; i++) for (var p = 0; p < 4; p++) hands[p].push(deck[k++]);
    var trumpCard = size < 10 ? deck[k++] : null;
    // sort each hand by suit then rank for tidy display
    for (var q = 0; q < 4; q++) hands[q].sort(function (a, b) { return a.s - b.s || b.r - a.r; });
    return { hands: hands, trumpCard: trumpCard, trump: trumpCard ? trumpCard.s : null };
  }

  var sameCard = function (a, b) { return a.s === b.s && a.r === b.r; };

  // Legal moves: must follow the led suit if able; otherwise anything.
  function legalMoves(hand, led) {
    if (led === null || led === undefined) return hand.slice();
    var follow = hand.filter(function (c) { return c.s === led; });
    return follow.length ? follow : hand.slice();
  }

  // Does card `c` beat the current best, given led suit + trump (trump may be null)?
  function cardBeats(c, best, led, trump) {
    var cT = trump !== null && c.s === trump, bT = trump !== null && best.s === trump;
    if (cT && !bT) return true;
    if (!cT && bT) return false;
    if (cT && bT) return c.r > best.r;
    var cL = c.s === led, bL = best.s === led;
    if (cL && !bL) return true;
    if (!cL && bL) return false;
    if (cL && bL) return c.r > best.r;
    return false; // both off-suit, non-trump — cannot win
  }

  // Winner index into `plays` ([{player,card}] in play order).
  function trickWinner(plays, led, trump) {
    var best = 0;
    for (var i = 1; i < plays.length; i++)
      if (cardBeats(plays[i].card, plays[best].card, led, trump)) best = i;
    return best;
  }

  var val = function (c, trump) { return (trump !== null && c.s === trump ? 100 : 0) + c.r; };
  function lowest(cards, trump) { return cards.slice().sort(function (a, b) { return val(a, trump) - val(b, trump); })[0]; }
  function highest(cards, trump) { return cards.slice().sort(function (a, b) { return val(b, trump) - val(a, trump); })[0]; }

  // Heuristic bid: expected tricks from raw hand strength.
  function aiBid(hand, trump, size) {
    var pts = 0;
    hand.forEach(function (c) {
      if (trump !== null && c.s === trump) pts += c.r >= 9 ? 1 : c.r >= 7 ? 0.72 : c.r >= 5 ? 0.42 : 0.16;
      else pts += c.r === 10 ? 0.72 : c.r === 9 ? 0.46 : c.r === 8 ? 0.24 : 0.05;
    });
    var b = Math.round(pts);
    if (b < 0) b = 0; if (b > size) b = size;
    return b;
  }

  // Heuristic play. ctx: {hand, trick:[{player,card}], led, trump, need}
  function aiPlay(ctx) {
    var legal = legalMoves(ctx.hand, ctx.led), trump = ctx.trump;
    if (ctx.trick.length === 0) { // leading
      return ctx.need > 0 ? highest(legal, trump) : lowest(legal, trump);
    }
    var best = ctx.trick[0].card;
    for (var i = 1; i < ctx.trick.length; i++)
      if (cardBeats(ctx.trick[i].card, best, ctx.led, trump)) best = ctx.trick[i].card;
    var winners = legal.filter(function (c) { return cardBeats(c, best, ctx.led, trump); });
    var losers  = legal.filter(function (c) { return !cardBeats(c, best, ctx.led, trump); });
    if (ctx.need > 0) return winners.length ? lowest(winners, trump) : lowest(losers.length ? losers : legal, trump);
    return losers.length ? highest(losers, trump) : lowest(legal, trump); // avoid winning; if forced, minimise
  }

  // ---- Scoring: Deal Points + the GRAMS bribe pot --------------------------
  // Guess right: +1 Deal Point per deal closed (a right 0 is worth 0).
  // Guess wrong: -1 Deal Point per deal off, and GRAMS_FEE GRAMS into the pot.
  // At the end the pot pays POT_SPLIT by final place; the house keeps the rest.
  var GRAMS_FEE = 5, POT_SPLIT = [0.5, 0.3, 0.15, 0], HOUSE_CUT = 0.05, TIEBREAK_CAP = 19;
  function roundDeal(bid, won) {
    return bid === won ? { dp: won, fee: 0, hit: true } : { dp: -Math.abs(bid - won), fee: GRAMS_FEE, hit: false };
  }
  function roundScore(bid, won) { return roundDeal(bid, won).dp; }
  // True when two or more leaders share the top score.
  function leaderTied(totals) {
    var m = Math.max.apply(null, totals);
    return totals.filter(function (t) { return t === m; }).length > 1;
  }
  // Tie break: the ladder keeps bouncing between its smallest and largest round.
  // Full 1..10..1 continues 2, 3, 4…; Extreme 8-9-10-9-8 continues 9, 10, 9, 8…
  function nextTiebreakSize(sizes) {
    var mn = Math.min.apply(null, sizes), mx = Math.max.apply(null, sizes), n = sizes.length;
    var last = sizes[n - 1], prev = n > 1 ? sizes[n - 2] : last;
    if (mn === mx) return last;
    var dir = last < prev ? -1 : 1, next = last + dir;
    if (next > mx || next < mn) next = last - dir;
    return next;
  }
  var r2 = function (x) { return Math.round(x * 100) / 100; };
  // Split the pot by final place. Tied leaders share their places' prizes equally.
  // Returns { pay:[GRAMS per seat], place:[0-based place per seat, ties equal], house }.
  function settlePot(totals, pot) {
    var order = [0, 1, 2, 3].sort(function (a, b) { return totals[b] - totals[a] || a - b; });
    var pay = [0, 0, 0, 0], place = [0, 0, 0, 0], i = 0, k;
    while (i < 4) {
      var j = i; while (j + 1 < 4 && totals[order[j + 1]] === totals[order[i]]) j++;
      var share = 0; for (k = i; k <= j; k++) share += POT_SPLIT[k];
      for (k = i; k <= j; k++) { pay[order[k]] = r2(pot * share / (j - i + 1)); place[order[k]] = i; }
      i = j + 1;
    }
    return { pay: pay, place: place, house: r2(pot - pay[0] - pay[1] - pay[2] - pay[3]) };
  }

  // Full AI-vs-AI match, used by tests. Returns {totals, ok}.
  function simulateMatch(seed) {
    var rng = mulberry32(seed), totals = [0, 0, 0, 0], start = 0;
    for (var ri = 0; ri < ROUND_SIZES.length; ri++) {
      var size = ROUND_SIZES[ri];
      var d = dealRound(size, rng), hands = d.hands, trump = d.trump;
      var bids = [0, 0, 0, 0], won = [0, 0, 0, 0], n, p;
      for (n = 0; n < 4; n++) { p = (start + n) % 4; bids[p] = aiBid(hands[p], trump, size); }
      var leader = start;
      for (var t = 0; t < size; t++) {
        var trick = [], led = null;
        for (n = 0; n < 4; n++) {
          p = (leader + n) % 4;
          var card = aiPlay({ hand: hands[p], trick: trick, led: led, trump: trump, need: bids[p] - won[p] });
          var legal = legalMoves(hands[p], led);
          if (!legal.some(function (c) { return sameCard(c, card); })) throw new Error('illegal move r' + size);
          var idx = hands[p].findIndex(function (c) { return sameCard(c, card); });
          hands[p].splice(idx, 1);
          if (led === null) led = card.s;
          trick.push({ player: p, card: card });
        }
        var w = trick[trickWinner(trick, led, trump)].player;
        won[w]++; leader = w;
      }
      if (won[0] + won[1] + won[2] + won[3] !== size) throw new Error('trick count r' + size);
      for (p = 0; p < 4; p++) totals[p] += roundScore(bids[p], won[p]);
      start = (start + 1) % 4;
    }
    return { totals: totals, ok: true };
  }

  var API = {
    SUIT_EMOJI: SUIT_EMOJI, SUIT_NAME: SUIT_NAME, ROUND_SIZES: ROUND_SIZES,
    mulberry32: mulberry32, makeDeck: makeDeck, shuffle: shuffle, dealRound: dealRound,
    legalMoves: legalMoves, cardBeats: cardBeats, trickWinner: trickWinner,
    aiBid: aiBid, aiPlay: aiPlay, roundScore: roundScore, simulateMatch: simulateMatch,
    roundDeal: roundDeal, leaderTied: leaderTied, nextTiebreakSize: nextTiebreakSize, settlePot: settlePot,
    GRAMS_FEE: GRAMS_FEE, POT_SPLIT: POT_SPLIT, HOUSE_CUT: HOUSE_CUT, TIEBREAK_CAP: TIEBREAK_CAP,
    sameCard: sameCard
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.KL = API;
})(typeof window !== 'undefined' ? window : this);
