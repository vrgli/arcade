// Presina — real-player multiplayer client.
//
// Turns the browser into a thin terminal on the authoritative server match (see
// the arcade's multiplayer/ relay + presina-host.js). index.html renders purely
// from the per-seat-redacted snapshots that arrive on mp:state; each human input
// (a pledge or a card) is sent over the wire via the NetEngine below and the
// authoritative state comes back. Adapted from you-goat-magic/ui/mp-client.js —
// only NetEngine's move methods and GAME_ID differ; the lobby/session code is the
// same battle-tested, game-agnostic flow.
//
// The socket.io browser client is loaded as an ES module from ./vendor.

// Engine-shaped shim. Move methods OMIT the seat id — the SERVER stamps the
// sender's authoritative seat, so a client can never move as another.
export class NetEngine {
  constructor() { this._state = null; this._socket = null; }
  attach(socket) { this._socket = socket; }
  getState() { return this._state; }
  _send(type, args) {
    if (this._socket) this._socket.emit('mp:move', { type, args });
    return { ok: true, state: this._state }; // optimistic; real update via next mp:state
  }
  pledge(n) { return this._send('pledge', [n]); }
  playCard(card) { return this._send('playCard', [card]); }
}

// ---- Host-a-Game setup + lobby ---------------------------------------------
// The screens live in mp-lobby.js, shared byte-for-byte with the other online
// games. Everything below is what makes them Presina's: the table is ALWAYS
// four seats (the engine is written around four hands), so the host chooses how
// many of them are people — and, crucially, WHICH HAND LADDER, which the invite
// then carries. That setting used to be missed entirely: "Play a friend" sat
// below the mode rows and passed no mode, so every online table silently became
// the 19-hand Full game.
import { showHostSetup, renderLobby, hideLobby, showMessage } from './mp-lobby.js';

const GAME_ID = 'tariff-wars';

// Mirrors the mode rows on the start screen.
const MODES = [
  { value: 'full',    name: 'Full game',            seq: '1 → 10 → 1', hint: '19 rounds' },
  { value: 'asc',     name: 'Half ascending',       seq: '1 → 10',     hint: '10 rounds' },
  { value: 'desc',    name: 'Half descending',      seq: '10 → 1',     hint: '10 rounds' },
  { value: 'intense', name: 'Intense',              seq: '6 → 10 → 6', hint: '9 rounds' },
  { value: 'extreme', name: '🔥 Even more intense', seq: '8 → 10 → 8', hint: 'only 5 rounds' },
];
const MODE_BY_VALUE = Object.fromEntries(MODES.map((m) => [m.value, m]));

const SPEC = {
  title: 'Host a Game — Tariff Wars',
  accent: '#e8c15a',
  // Presina is a four-handed game: the seats are fixed, the split is not.
  seatRule: { fixed: 4 },
  fields: [
    { kind: 'choice', key: 'mode', label: 'How many rounds', options: MODES },
    { kind: 'seats', label: 'Who is at the table' },
  ],
  summary(room) {
    const m = room && MODE_BY_VALUE[room.mode || (room.config && room.config.mode)];
    const h = (room && room.humans) || 0;
    const a = (room && room.ai) || 0;
    return (m ? `<b>${m.name}</b><span>${m.seq}</span><span>${m.hint}</span>` : '')
      + `<span>${h} ${h === 1 ? 'person' : 'people'}${a ? ` + ${a} AI` : ''}</span>`;
  },
};

function shareLinkFor(code) {
  // In the arcade the game runs inside an iframe — the shareable link must be the
  // TOP-LEVEL /vs/<game>/<code> route (renders the arcade shell + auto-joins).
  // Standalone / testbed: same page + ?room= is the join entry.
  try {
    if (window.top !== window.self) return window.top.location.origin + '/vs/' + GAME_ID + '/' + code;
  } catch (e) { /* cross-origin top (shouldn't happen, same origin) — fall through */ }
  return window.location.origin + window.location.pathname + '?room=' + code;
}

// ---- Session controller -----------------------------------------------------
// api: { onStarted(seat), onState(state), onFinished(result), onError(err) }
export async function startMultiplayer(api) {
  let io;
  try { ({ io } = await import('./ws-io.js')); }
  catch (e) { showMessage('Host a Game', 'Could not load the multiplayer client.<br>Is the server running?', SPEC.accent); throw e; }

  const net = new NetEngine();
  const socket = io({ path: '/mp-socket', transports: ['websocket', 'polling'], withCredentials: true });
  net.attach(socket);

  let myCode = null;
  let amHost = false;
  let started = false;
  let mySeat = null;
  let lastRoom = null;

  const paintLobby = () => {
    if (started || !myCode) return;
    renderLobby(SPEC, {
      code: myCode, room: lastRoom, isHost: amHost, mySeat,
      link: shareLinkFor(myCode),
      handlers: {
        onReady: (want) => socket.emit('mp:ready', { ready: want }),
        onStartAnyway: () => socket.emit('mp:start'),
        onSeatCfg: () => {},          // Presina has no per-player setting
      },
    });
  };

  socket.on('connect_error', (err) => showMessage('Host a Game', `Connection error: ${err.message}.<br>Please sign in and retry.`, SPEC.accent));
  socket.on('mp:lobby', ({ room }) => { lastRoom = room; paintLobby(); });
  socket.on('mp:started', ({ seat }) => { started = true; mySeat = seat; hideLobby(); api.onStarted(seat); });
  socket.on('mp:state', ({ state }) => { net._state = state; api.onState(state); });
  socket.on('mp:finished', ({ result }) => {
    if (net._state) net._state = { ...net._state, result: result || net._state.result };
    api.onFinished(result);
  });
  // PLAY AGAIN: the table went back to being a lobby. Drop out of "in a match"
  // so the lobby paints again, and let the game clear its result screen.
  socket.on('mp:rematch', ({ room }) => {
    started = false;
    if (room) lastRoom = room;
    api.onRematch && api.onRematch();
    paintLobby();
  });
  socket.on('mp:error', ({ error }) => api.onError && api.onError(error));

  const ctl = {
    net,
    // HOST A GAME: the host picks the hand ladder and how many of the four seats
    // are people, THEN the table exists and a link can go out.
    host() {
      showHostSetup(SPEC, ({ humans, ai, config }) => {
        amHost = true;
        showMessage('Host a Game', 'Creating your table…', SPEC.accent);
        socket.emit('mp:create', { game: GAME_ID, humans, ai, config }, (resp) => {
          if (!resp || resp.error) {
            return showMessage('Host a Game', `Could not create a table (${resp && resp.error || 'error'}).`, SPEC.accent);
          }
          myCode = resp.code;
          mySeat = resp.seat;
          lastRoom = resp.room || null;
          paintLobby();
        });
      });
    },
    // Offered on the result screen. Puts this table back into its lobby for
    // everyone at it — same people, same settings, everyone presses Ready again.
    rematch() {
      return new Promise((resolve) => {
        socket.emit('mp:rematch', {}, (resp) => {
          if (!resp || resp.error) {
            showMessage('Play again', `Could not restart this table (${(resp && resp.error) || 'error'}).`, SPEC.accent);
            return resolve(false);
          }
          resolve(true);
        });
      });
    },
    join(code) {
      amHost = false;
      myCode = String(code).toUpperCase();
      showMessage('Your table', 'Joining table ' + myCode + '…', SPEC.accent);
      socket.emit('mp:join', { code: myCode }, (resp) => {
        if (!resp || resp.error) {
          return showMessage('Your table', `Could not join table ${myCode} (${resp && resp.error || 'error'}).`, SPEC.accent);
        }
        mySeat = resp.seat;
        lastRoom = resp.room || null;
        if (resp.status !== 'playing') paintLobby();
      });
    },
  };
  return ctl;
}
