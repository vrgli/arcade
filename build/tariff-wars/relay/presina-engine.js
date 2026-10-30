// Presina — headless, authoritative game engine (CommonJS, no DOM).
//
// Presina is a 4-handed Italian trick-taking bluff game. This module is the SAME
// referee the browser will render from, but here it runs server-side inside the
// multiplayer relay (see presina-host.js). The interactive/DOM version lives in
// games/presina/index.html; the pure rules there (window.KL) are re-implemented
// below so the server has a self-contained, git-committed, deterministic engine
// with a JSON-serialisable getState() and move methods taking PRIMITIVE args.
//
// Move methods (first arg is always the acting seat id, 0..3):
//   pledge(seat, n)          — phase 1: pledge how many tricks you'll take (0..size)
//   playCard(seat, card)     — phase 2: play a card {s,r} from your hand (must follow suit)
//   ackTrick()               — release the completed-trick REVEAL HOLD (host-only)
// All return { ok:true, state } or { ok:false, error, state }.
//
// COMPLETED-TRICK REVEAL HOLD: the 4th card used to resolve the trick and clear
// it in the same call, so the winning four cards were gone before any client
// could paint them — online players never saw who won a hand. Now the 4th card
// parks the finished trick in `pendingTrick` (all four cards + the winner) and
// the engine waits; the host acks it after a reveal beat, exactly as ygm-host
// does for the no-match Rush reveal. Every client therefore gets at least one
// snapshot showing the full trick with the winner marked.
//
// decide(state, seat) → { type, args:[seat, ...] } is the AI used for empty seats.

// ---- Pure rules (ported verbatim in spirit from games/presina/engine.js KL) ---
const SUIT_EMOJI = ['💎', '🐸', '🍄', '🌙'];
const N_SEATS = 4;
const DECK = 40; // 4 suits × ranks 1..10

// Rounds per mode. Ascend 1..10 then descend 9..1 = 19 hands for the full game.
function modeSizes(mode) {
  const s = [];
  const up = (a, b) => { for (let i = a; i <= b; i++) s.push(i); };
  const down = (a, b) => { for (let i = a; i >= b; i--) s.push(i); };
  if (mode === 'asc') up(1, 10);
  else if (mode === 'desc') down(10, 1);
  else if (mode === 'intense') { up(6, 10); down(9, 6); }
  else if (mode === 'extreme') { up(8, 10); down(9, 8); }
  else { up(1, 10); down(9, 1); } // full (default)
  return s;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeDeck() {
  const d = [];
  for (let s = 0; s < 4; s++) for (let r = 1; r <= 10; r++) d.push({ s, r });
  return d;
}
function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}
const sameCard = (a, b) => a.s === b.s && a.r === b.r;

function legalMoves(hand, led) {
  if (led === null || led === undefined) return hand.slice();
  const follow = hand.filter((c) => c.s === led);
  return follow.length ? follow : hand.slice();
}
function cardBeats(c, best, led, trump) {
  const cT = trump !== null && c.s === trump, bT = trump !== null && best.s === trump;
  if (cT && !bT) return true;
  if (!cT && bT) return false;
  if (cT && bT) return c.r > best.r;
  const cL = c.s === led, bL = best.s === led;
  if (cL && !bL) return true;
  if (!cL && bL) return false;
  if (cL && bL) return c.r > best.r;
  return false;
}
// Winner index into plays ([{seat,card}] in play order).
function trickWinner(plays, led, trump) {
  let best = 0;
  for (let i = 1; i < plays.length; i++)
    if (cardBeats(plays[i].card, plays[best].card, led, trump)) best = i;
  return best;
}
const val = (c, trump) => (trump !== null && c.s === trump ? 100 : 0) + c.r;
const lowest = (cards, trump) => cards.slice().sort((a, b) => val(a, trump) - val(b, trump))[0];
const highest = (cards, trump) => cards.slice().sort((a, b) => val(b, trump) - val(a, trump))[0];

function aiBid(hand, trump, size) {
  let pts = 0;
  hand.forEach((c) => {
    if (trump !== null && c.s === trump) pts += c.r >= 9 ? 1 : c.r >= 7 ? 0.72 : c.r >= 5 ? 0.42 : 0.16;
    else pts += c.r === 10 ? 0.72 : c.r === 9 ? 0.46 : c.r === 8 ? 0.24 : 0.05;
  });
  let b = Math.round(pts);
  if (b < 0) b = 0; if (b > size) b = size;
  return b;
}
// ctx: { hand, trick:[{seat,card}], led, trump, need }
function aiPlay(ctx) {
  const legal = legalMoves(ctx.hand, ctx.led), trump = ctx.trump;
  if (ctx.trick.length === 0) return ctx.need > 0 ? highest(legal, trump) : lowest(legal, trump);
  let best = ctx.trick[0].card;
  for (let i = 1; i < ctx.trick.length; i++)
    if (cardBeats(ctx.trick[i].card, best, ctx.led, trump)) best = ctx.trick[i].card;
  const winners = legal.filter((c) => cardBeats(c, best, ctx.led, trump));
  const losers = legal.filter((c) => !cardBeats(c, best, ctx.led, trump));
  if (ctx.need > 0) return winners.length ? lowest(winners, trump) : lowest(losers.length ? losers : legal, trump);
  return losers.length ? highest(losers, trump) : lowest(legal, trump);
}
const roundScore = (bid, won) => (bid === won ? 10 + 2 * won : -2 * Math.abs(bid - won));

// ---------------------------------------------------------------------------

class Presina {
  // opts: { seed, players:[{name,isAI,avatar}]×4, mode }
  constructor({ seed, players, mode } = {}) {
    const s = (seed == null ? 0x9e3779b9 : seed) >>> 0;
    this._rng = mulberry32(s);
    this.seed = s;
    this.mode = mode || 'full';
    this.sizes = modeSizes(this.mode);
    this.players = (players || []).slice(0, N_SEATS).map((p, i) => ({
      id: i,
      name: (p && p.name) || `Player ${i + 1}`,
      isAI: !!(p && p.isAI),
      avatar: (p && p.avatar) || ((p && p.isAI) ? '🤖' : '🧑'),
    }));
    while (this.players.length < N_SEATS) {
      const i = this.players.length;
      this.players.push({ id: i, name: `Player ${i + 1}`, isAI: true, avatar: '🤖' });
    }

    this.ri = 0;                       // round index into sizes
    this.totals = [0, 0, 0, 0];
    this.history = [];
    // Public play-by-play, mirroring the solo game's own log rows so the LOG
    // sheet reads the same online as offline: { who, msg } or { round:true, msg }.
    // Online this is the ONLY source for the log — the browser has no local
    // engine to narrate from, which is why the LOG sheet came up empty.
    this.log = [];
    this.trickSeq = 0;                 // monotonic id per completed trick
    this.status = 'playing';
    this.result = null;
    // Opening "roulette": a random seat leads the first hand (seeded → deterministic).
    this.start = Math.floor(this._rng() * N_SEATS);
    this.firstStarter = this.start;
    this._startRound();
  }

  _startRound() {
    const size = this.sizes[this.ri];
    this.size = size;
    const deck = shuffle(makeDeck(), this._rng);
    const hands = [[], [], [], []];
    let k = 0;
    for (let i = 0; i < size; i++) for (let p = 0; p < N_SEATS; p++) hands[p].push(deck[k++]);
    this.trumpCard = size < 10 ? deck[k++] : null;
    this.trump = this.trumpCard ? this.trumpCard.s : null;
    for (let q = 0; q < N_SEATS; q++) hands[q].sort((a, b) => a.s - b.s || b.r - a.r);
    this.hands = hands;

    this.bids = [null, null, null, null];
    this.won = [0, 0, 0, 0];
    this.pledgeCount = 0;
    this.tricksPlayed = 0;
    this.trick = [];               // [{seat, card}] in play order this trick
    // Every completed trick, kept per seat for THIS hand: the four cards with the
    // winning one flagged. This is what the 👀 eye beside a player's "N won"
    // stack reveals — it used to be faked client-side as a single placeholder
    // card, which is why the eye only ever showed one blank 🍄 0.
    this.wonPiles = [[], [], [], []];
    this.pendingTrick = null;      // completed trick held for the reveal beat
    this.led = null;               // led suit index, or null
    this.leader = this.start;      // who leads the first trick this hand
    this.phase = 1;                // 1 pledge · 2 play · (3 settle handled inline)
    this.current = this.start;     // first pledger == the opener
    this._logRound(`Round ${this.ri + 1}/${this.sizes.length} · ${size}-card · `
      + `${this._nm(this.start)} opens the hand`
      + (this.trumpCard ? ` · trump ${SUIT_EMOJI[this.trumpCard.s]}` : ' · no trump'));
  }

  // ---- Log ------------------------------------------------------------------
  // Seat NAMES (not "You") — the log is broadcast to every seat, and each client
  // re-labels its own seat when it renders. Keeping absolute names here means one
  // shared, unambiguous transcript.
  _nm(seat) {
    const p = this.players[seat];
    return (p && p.name) || `Player ${seat + 1}`;
  }
  _log(seat, msg) { this.log.push({ seat, who: this._nm(seat), msg }); this._capLog(); }
  _logRound(msg) { this.log.push({ round: true, msg }); this._capLog(); }
  _logSys(msg) { this.log.push({ who: 'Presina', msg }); this._capLog(); }
  _capLog() { if (this.log.length > 400) this.log.shift(); }

  // ---- Views ---------------------------------------------------------------
  // Full authoritative state. Redaction (blank other hands) is done by the host.
  getState() {
    return {
      status: this.status,
      phase: this.phase,
      mode: this.mode,
      current: this.current,
      leader: this.leader,
      opener: this.start,
      firstStarter: this.firstStarter,
      round: { ri: this.ri, size: this.size, total: this.sizes.length },
      trump: this.trump,
      trumpCard: this.trumpCard ? { ...this.trumpCard } : null,
      trumpEmoji: this.trump != null ? SUIT_EMOJI[this.trump] : null,
      led: this.led,
      trick: this.trick.map((t) => ({ seat: t.seat, card: { ...t.card } })),
      // A completed trick held for the reveal beat: the four cards in play order,
      // the winning seat, and the led suit/trump that decided it. Clients paint
      // this face-up with the winner marked, then it clears on ackTrick().
      pendingTrick: this.pendingTrick ? {
        seq: this.pendingTrick.seq,
        winner: this.pendingTrick.winner,
        led: this.pendingTrick.led,
        trump: this.pendingTrick.trump,
        plays: this.pendingTrick.plays.map((t) => ({ seat: t.seat, card: { ...t.card } })),
      } : null,
      trickSeq: this.trickSeq,
      // Tricks each seat has won THIS hand, four cards apiece, winner flagged.
      wonPiles: this.wonPiles.map((piles) =>
        piles.map((pile) => pile.map((x) => ({ card: { ...x.card }, seat: x.seat, win: !!x.win })))),
      log: this.log.map((e) => ({ ...e })),
      deckRemaining: DECK - N_SEATS * this.size - (this.trumpCard ? 1 : 0),
      players: this.players.map((p) => ({
        id: p.id, name: p.name, isAI: p.isAI, avatar: p.avatar,
        hand: this.hands[p.id].map((c) => ({ ...c })),
        handCount: this.hands[p.id].length,
        bid: this.bids[p.id],
        won: this.won[p.id],
      })),
      totals: this.totals.slice(),
      history: this.history.map((h) => ({ ...h, deltas: h.deltas.slice(), totals: h.totals.slice(), bids: h.bids.slice(), won: h.won.slice() })),
      result: this.result ? JSON.parse(JSON.stringify(this.result)) : null,
    };
  }

  _ok(extra = {}) { return { ok: true, ...extra, state: this.getState() }; }
  _fail(error) { return { ok: false, error, state: this.getState() }; }

  // ---- Moves ---------------------------------------------------------------
  pledge(seat, n) {
    if (this.status !== 'playing') return this._fail('game_over');
    if (this.pendingTrick) return this._fail('trick_reveal');
    if (this.phase !== 1) return this._fail('not_pledging');
    if (seat !== this.current) return this._fail('not_your_turn');
    n = Number(n);
    if (!Number.isInteger(n) || n < 0 || n > this.size) return this._fail('bad_pledge');
    this.bids[seat] = n;
    this.pledgeCount += 1;
    this._log(seat, `pledges ${n} trick${n === 1 ? '' : 's'}.`);
    if (this.pledgeCount >= N_SEATS) {
      this.phase = 2;                 // everyone pledged → play begins
      this.current = this.leader;     // opener leads the first trick
      this.led = null;
    } else {
      this.current = (this.current + 1) % N_SEATS; // next pledger, in seat order from opener
    }
    return this._ok();
  }

  playCard(seat, card) {
    if (this.status !== 'playing') return this._fail('game_over');
    if (this.pendingTrick) return this._fail('trick_reveal');
    if (this.phase !== 2) return this._fail('not_playing');
    if (seat !== this.current) return this._fail('not_your_turn');
    if (!card || typeof card.s !== 'number' || typeof card.r !== 'number') return this._fail('bad_card');
    const hand = this.hands[seat];
    const idx = hand.findIndex((c) => sameCard(c, card));
    if (idx < 0) return this._fail('not_in_hand');
    const legal = legalMoves(hand, this.led);
    if (!legal.some((c) => sameCard(c, card))) return this._fail('must_follow_suit');

    const played = hand.splice(idx, 1)[0];
    if (this.led === null) this.led = played.s;
    this.trick.push({ seat, card: played });
    this._log(seat, `plays ${SUIT_EMOJI[played.s]} ${played.r}`
      + (this.trump !== null && played.s === this.trump ? ' (trump).' : '.'));

    if (this.trick.length < N_SEATS) {
      this.current = (this.current + 1) % N_SEATS; // next player in the trick
      return this._ok();
    }

    // Trick complete → PARK it for the reveal beat. Nothing about the hand moves
    // on until ackTrick(): the four cards stay face-up on the table (in `trick`
    // AND in `pendingTrick`, with the winner named) so every client gets at
    // least one snapshot showing who took it. `_resolveTrick` does the actual
    // book-keeping when the beat is over.
    const w = this.trick[trickWinner(this.trick, this.led, this.trump)].seat;
    this.trickSeq += 1;
    this.pendingTrick = {
      seq: this.trickSeq,
      winner: w,
      led: this.led,
      trump: this.trump,
      plays: this.trick.map((t) => ({ seat: t.seat, card: { ...t.card } })),
    };
    this._log(w, 'wins the trick.');
    return this._ok();
  }

  // Release the completed-trick reveal hold and settle the trick. Called by the
  // host after the reveal beat (never by a client). Idempotent: acking when
  // nothing is held is a harmless no-op, so a duplicate/late ack cannot skip a
  // trick or double-count a win.
  ackTrick() {
    if (!this.pendingTrick) return this._ok({ acked: false });
    const pt = this.pendingTrick;
    const w = pt.winner;
    this.pendingTrick = null;
    this.won[w] += 1;
    this.tricksPlayed += 1;
    // Keep the trick for this player's 👀 review pile before clearing the table.
    this.wonPiles[w].push(pt.plays.map((t) => ({
      card: { ...t.card }, seat: t.seat, win: t.seat === w,
    })));
    this.trick = [];
    this.led = null;
    this.leader = w;
    this.current = w;                 // winner leads the next trick

    if (this.tricksPlayed >= this.size) this._settleRound();
    return this._ok({ acked: true });
  }

  _settleRound() {
    const deltas = [0, 0, 0, 0];
    for (let p = 0; p < N_SEATS; p++) { deltas[p] = roundScore(this.bids[p], this.won[p]); this.totals[p] += deltas[p]; }
    this.history.push({ ri: this.ri, size: this.size, deltas, totals: this.totals.slice(), bids: this.bids.slice(), won: this.won.slice() });
    for (let p = 0; p < N_SEATS; p++) {
      const hit = this.bids[p] === this.won[p];
      this._log(p, `pledged ${this.bids[p]}, won ${this.won[p]} — `
        + `${hit ? 'hit' : 'missed'} ${deltas[p] >= 0 ? '+' : ''}${deltas[p]} (total ${this.totals[p]}).`);
    }
    this.ri += 1;
    this.start = (this.start + 1) % N_SEATS; // lead passes to the next seat each hand
    if (this.ri >= this.sizes.length) this._finish();
    else this._startRound();
  }

  _finish() {
    this.status = 'finished';
    // _settleRound has already stepped past the last hand. Step back onto it, or
    // the closing screen behind the result reads "Round 6/5 · -1 rounds left".
    this.ri = this.sizes.length - 1;
    this.size = this.sizes[this.ri];
    let winner = 0;
    for (let p = 1; p < N_SEATS; p++) if (this.totals[p] > this.totals[winner]) winner = p;
    this._logSys(`${this._nm(winner)} wins the game with ${this.totals[winner]} points.`);
    this.result = {
      winner,
      seed: this.seed,
      mode: this.mode,
      hands: this.sizes.length,   // ladder length — the arcade's turns_taken signal
      players: this.players.map((p) => ({ playerId: p.id, name: p.name, isAI: p.isAI, finalScore: this.totals[p.id] })),
    };
  }
}

// ---- AI ---------------------------------------------------------------------
// decide(state, seat) → { type, args:[seat, ...] }. Mirrors the browser AI.
function decide(state, seat) {
  const me = state.players[seat];
  if (!me || state.status !== 'playing') return null;
  if (state.phase === 1) {
    const n = aiBid(me.hand, state.trump, state.round.size);
    return { type: 'pledge', args: [seat, n] };
  }
  const card = aiPlay({
    hand: me.hand,
    trick: state.trick,
    led: state.led,
    trump: state.trump,
    need: (me.bid == null ? 0 : me.bid) - me.won,
  });
  return { type: 'playCard', args: [seat, card] };
}

export { Presina, decide, modeSizes };
