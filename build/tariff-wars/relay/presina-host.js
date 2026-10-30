// Authoritative server-side host for a Presina multiplayer match.
//
// Mirrors ygm-host.js: the SAME engine that (will) render in the browser runs
// here as the single source of truth. Human seats send moves over the wire; this
// host validates turn order + legality, applies them to the one real engine, and
// hands back a per-seat REDACTED view (opponents' hand cards blanked — the only
// hidden info in Presina; pledges are public, the deck is a count). Empty seats
// are driven by the engine's own decide() AI, so a table with AI fill "just works".
import { Presina, decide } from './presina-engine.js';

// Only these engine methods may be invoked from a wire message. The first
// argument is always forced to the sender's authoritative seat id — a client can
// never act as another seat.
const HUMAN_METHODS = new Set(['pledge', 'playCard']);

// The hand ladder the host chose on the start screen. Validated here because it
// arrives over the wire: an unknown string would silently fall through to the
// 19-hand 'full' ladder inside modeSizes(), which is exactly the "it assumed I
// wanted 1-10-1" surprise this is meant to prevent.
const MODES = new Set(['full', 'asc', 'desc', 'intense', 'extreme']);
const cleanMode = (m) => (MODES.has(m) ? m : null);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class PresinaHost {
  // seatMeta: [{ seat, name, avatar, isAI }] indexed by seat id (0..3).
  static create({ seatMeta, seed, pacing, mode, config }) {
    return Promise.resolve(new PresinaHost({ seatMeta, seed, pacing, mode, config }));
  }

  constructor({ seatMeta, seed, pacing, mode, config }) {
    this.seatMeta = seatMeta;
    const players = seatMeta.map((s) => ({
      name: s.name || `Player ${(s.seat != null ? s.seat + 1 : '?')}`,
      isAI: !!s.isAI,
      avatar: s.avatar || (s.isAI ? '🤖' : '🧑'),
    }));
    this.engine = new Presina({
      seed, players,
      // The host's chosen hand ladder, from the setup screen. `config.mode` is
              // the current shape; `mode` is the earlier top-level form.
      mode: cleanMode(config && config.mode) || cleanMode(mode)
        || 'full',
    });
    this.pacing = { aiStepMs: 900, revealMs: 1900, ...(pacing || {}) };
    this._driving = false;
    this.onUpdate = null;   // (host) => void — set by the relay; called after every applied step
    this.onFinished = null; // (host, result) => void
  }

  // ---- Views ---------------------------------------------------------------
  rawState() { return this.engine.getState(); }

  // Per-seat view: every OTHER player's hand cards are stripped (handCount, the
  // only thing a renderer shows for opponents, survives). Nothing else in Presina
  // is hidden — pledges are announced, the deck is already a count.
  stateFor(seat) {
    const st = this.engine.getState();
    st.you = seat;
    st.players = st.players.map((p) => (p.id === seat ? p : { ...p, hand: [] }));
    return st;
  }

  isFinished() { return this.engine.status !== 'playing'; }
  // The engine's own result, decorated with the arcade's reporting contract
  // (see index.js): `turnsTaken` and `endedAt`.
  //
  // Presina's winner is NOT decided on a turn. The ladder runs a fixed number of
  // hands and the highest total wins, so "Turn N · Action M" would be a lie —
  // its solo bridge writes "<place> place · <n> hands" instead. An online win is
  // always 1st place, so both paths land in one column that reads the same.
  result() {
    const r = this.engine.getState().result;
    if (!r) return r;
    return {
      ...r,
      turnsTaken: r.hands,
      endedAt: `1st place · ${r.hands} hands`,
    };
  }

  // Which seat the engine is waiting on, and what kind of action. A completed
  // trick held for the reveal beat is an 'ack' step that only the host resolves —
  // no seat may act until the table has SEEN who won (mirrors ygm-host's
  // no-match-reveal ack).
  nextStep() {
    if (this.engine.status !== 'playing') return null; // game over
    if (this.engine.pendingTrick) {
      return { kind: 'ack', seat: this.engine.pendingTrick.winner, auto: true };
    }
    if (this.engine.phase === 1) return { kind: 'pledge', seat: this.engine.current };
    return { kind: 'turn', seat: this.engine.current };
  }

  isAiSeat(seat) { return !!(this.seatMeta[seat] && this.seatMeta[seat].isAI); }

  // A human move: { type, args } where args OMITS the seat id — the host injects
  // the sender's authoritative seat as the first argument.
  applyHumanMove(seat, type, args) {
    if (!HUMAN_METHODS.has(type)) return { ok: false, error: 'illegal_action' };
    const step = this.nextStep();
    if (!step) return { ok: false, error: 'game_over' };
    if (step.kind === 'ack') return { ok: false, error: 'busy' }; // reveal beat auto-resolves
    if (step.seat !== seat) return { ok: false, error: 'not_your_turn' };
    const res = this.engine[type](seat, ...(Array.isArray(args) ? args : []));
    if (!res || !res.ok) return { ok: false, error: (res && res.error) || 'rejected' };
    return { ok: true };
  }

  _emit() { if (this.onUpdate) this.onUpdate(this); }

  // Drive the engine forward through every step that does NOT require a connected
  // human: AI seats. Pauses between AI actions (and a beat when a trick just
  // resolved) so clients can animate. Stops as soon as the next action belongs to
  // a human seat or the game ends. Guarded so only one drive loop runs at a time.
  async drive() {
    if (this._driving) return;
    this._driving = true;
    try {
      for (let guard = 0; guard < 100000; guard++) {
        const step = this.nextStep();
        if (!step) {
          if (this.onFinished) this.onFinished(this, this.result());
          return;
        }
        if (step.kind === 'ack') {
          // The four cards of a finished trick are on the table with the winner
          // marked. HOLD here so every client can paint them — this is the fix
          // for "I could not see the cards who won the hand, they go away too
          // fast" — then release and carry on.
          await sleep(this.pacing.revealMs);
          this.engine.ackTrick();
          this._emit();
          continue;
        }
        if (!this.isAiSeat(step.seat)) return; // a human seat — wait for their message
        await sleep(this.pacing.aiStepMs);
        const intent = decide(this.engine.getState(), step.seat);
        let res;
        if (intent && HUMAN_METHODS.has(intent.type)) res = this.engine[intent.type](...intent.args);
        if (!res || !res.ok) {
          // Safety net: a correct AI never lands here. Fail loudly rather than spin.
          console.error('[mp] presina AI intent rejected', intent && intent.type, res && res.error);
          return;
        }
        this._emit();
      }
    } finally {
      this._driving = false;
    }
  }
}

export { PresinaHost };
