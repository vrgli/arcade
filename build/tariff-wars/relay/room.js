// One Durable Object per table. A faithful port of the arcade relay
// (multiplayer/index.js + rooms.js) for a single game — Tariff Wars — over plain
// WebSockets instead of Socket.IO. Wire frames are JSON:
//   client → server  { ev, data, ack? }     server → client  { ev, data } | { ack, data }
// State is in memory only: when the last player leaves a finished table the DO
// forgets it, exactly as the Node relay dropped idle rooms.
import { PresinaHost } from './presina-host.js';
import { getSession } from './auth.js';

const GAME = 'tariff-wars';
const SEATS = 4;                                  // Presina is a four-handed game
const AI_NAMES = [null, 'Ursula', 'Modi', 'Xi'];  // the seat IS the leader
const AI_AVATARS = [null, '🇪🇺', '🇮🇳', '🇨🇳'];
const MODES = new Set(['full', 'asc', 'desc', 'intense', 'extreme']);
const HUMAN_METHODS = new Set(['pledge', 'playCard']);

const aiIdentity = (seat) => ({ name: AI_NAMES[seat] || `Player ${seat + 1}`, avatar: AI_AVATARS[seat] || '🤖' });

export class Room {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.room = null;            // the table, once created
    this.conns = new Map();      // connection id -> { id, ws, user }
  }

  // ---- Connection ----------------------------------------------------------
  async fetch(req) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    const url = new URL(req.url);
    const user = {
      id: String(url.searchParams.get('uid') || crypto.randomUUID()).slice(0, 64),
      display_name: String(url.searchParams.get('name') || 'Player').replace(/[<>]/g, '').trim().slice(0, 24) || 'Player',
    };
    const code = req.headers.get('X-Room-Code');
    // Signed-in players carry their account on the upgrade request's cookie.
    const sess = await getSession(req, this.env).catch(() => null);
    user.accountId = sess ? sess.accountId : null;
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();
    const conn = { id: crypto.randomUUID(), ws: server, user, code };
    this.conns.set(conn.id, conn);
    server.addEventListener('message', (e) => { try { this.onMessage(conn, JSON.parse(e.data)); } catch (err) { console.error('[mp] bad frame', err); } });
    server.addEventListener('close', () => this.onClose(conn));
    server.addEventListener('error', () => this.onClose(conn));
    return new Response(null, { status: 101, webSocket: client });
  }

  send(conn, ev, data) { try { conn.ws.send(JSON.stringify({ ev, data })); } catch (e) {} }
  ack(conn, id, data) { if (id != null) try { conn.ws.send(JSON.stringify({ ack: id, data })); } catch (e) {} }
  toSeat(seat, ev, data) { const c = seat.socketId && this.conns.get(seat.socketId); if (c) this.send(c, ev, data); }

  onMessage(conn, frame) {
    const { ev, data, ack } = frame || {};
    const reply = (d) => this.ack(conn, ack, d);
    switch (ev) {
      case 'mp:create': return this.create(conn, data, reply);
      case 'mp:join': return this.join(conn, data, reply);
      case 'mp:seatcfg': return reply({ ok: true, amulets: 0 });
      case 'mp:ready': return this.ready(conn, data, reply);
      case 'mp:rematch': return this.rematch(conn, reply);
      case 'mp:start': return this.startAnyway(conn);
      case 'mp:move': return this.move(conn, data);
      default: return reply({ error: 'unknown_event' });
    }
  }

  onClose(conn) {
    if (!this.conns.delete(conn.id)) return;
    const room = this.room;
    if (!room) return;
    const s = room.seats.find((x) => x.socketId === conn.id);
    if (s) {
      s.connected = false; s.socketId = null;
      if (room.status === 'lobby') s.ready = false;   // walked away → not ready
      this.broadcastLobby();
    }
    // Nobody left at a table that already played: forget it.
    if (room.status !== 'lobby' && !room.seats.some((x) => x.connected)) this.room = null;
  }

  // ---- Table (rooms.js, single room) ----------------------------------------
  create(conn, payload, reply) {
    if (this.room) return reply({ error: 'room_exists' });
    const asked = payload || {};
    if (asked.game && asked.game !== GAME) return reply({ error: 'unsupported_game' });
    let humans = Number.isFinite(Number(asked.humans)) ? Math.trunc(Number(asked.humans)) : (Number(asked.capacity) || 1);
    humans = Math.max(1, Math.min(SEATS, humans));
    const ai = SEATS - humans;
    const cfg = (asked.config && typeof asked.config === 'object') ? asked.config : {};
    const mode = MODES.has(cfg.mode) ? cfg.mode : 'full';
    const seats = [];
    for (let i = 0; i < SEATS; i++) {
      const bot = i >= humans ? aiIdentity(i) : null;
      seats.push({ seat: i, userId: null, name: bot ? bot.name : null, avatar: bot ? bot.avatar : null, rank: null,
        isAI: i >= humans, ready: false, playerConfig: null, connected: false, socketId: null });
    }
    this.room = {
      code: conn.code, game: GAME, config: { mode }, mode, humans, ai, plan: { humans, ai },
      hostUserId: conn.user.id, capacity: SEATS, seats, status: 'lobby', host: null, createdAt: Date.now(), startedAt: null,
    };
    const r = this.seatUser(conn);
    reply({ code: this.room.code, seat: r.seat, room: this.publicRoom() });
    this.broadcastLobby();
  }

  seatUser(conn) {
    const room = this.room, user = conn.user;
    const existing = room.seats.find((s) => s.userId === user.id);
    if (existing) { existing.connected = true; existing.socketId = conn.id; return { seat: existing.seat, rejoined: true }; }
    if (room.status !== 'lobby') return { error: 'in_progress' };
    const free = room.seats.find((s) => !s.userId && !s.isAI);
    if (!free) return { error: 'full' };
    free.userId = user.id; free.accountId = user.accountId || null; free.name = user.display_name; free.avatar = null;
    free.connected = true; free.socketId = conn.id;
    return { seat: free.seat, rejoined: false };
  }

  join(conn, payload, reply) {
    const room = this.room;
    if (!room) return reply({ error: 'no_such_room' });
    const r = this.seatUser(conn);
    if (r.error) return reply({ error: r.error });
    reply({ seat: r.seat, capacity: room.capacity, status: room.status, mode: room.mode, config: room.config, room: this.publicRoom() });
    this.broadcastLobby();
    if (room.status === 'playing') {
      // Reconnect mid-game: tell the client which seat it holds, then the position.
      this.send(conn, 'mp:started', { seat: r.seat, capacity: room.capacity, mode: room.mode });
      this.broadcastState();
    }
  }

  seatOf(conn) { return this.room && this.room.seats.find((s) => s.socketId === conn.id); }
  humanSeats() { return this.room.seats.filter((s) => !s.isAI); }
  allHumansReady() { const hs = this.humanSeats(); return hs.length > 0 && hs.every((s) => s.userId && s.ready); }

  ready(conn, payload, reply) {
    const room = this.room;
    if (!room) return reply({ error: 'no_such_room' });
    if (room.status !== 'lobby') return reply({ error: 'in_progress' });
    const seat = room.seats.find((s) => s.userId === conn.user.id);
    if (!seat) return reply({ error: 'not_seated' });
    seat.ready = !(payload && payload.ready === false);
    reply({ ok: true, ready: seat.ready });
    this.broadcastLobby();
    if (this.allHumansReady()) this.beginMatch();
  }

  startAnyway(conn) {
    const room = this.room;
    if (!room || room.hostUserId !== conn.user.id) return;
    this.beginMatch();
  }

  rematch(conn, reply) {
    const room = this.room;
    if (!room) return reply({ error: 'no_such_room' });
    if (!this.seatOf(conn)) return reply({ error: 'not_seated' });
    if (room.status === 'playing') return reply({ error: 'in_progress' });
    if (room.status === 'finished') this.resetForRematch();
    reply({ ok: true, room: this.publicRoom() });
    for (const s of room.seats) if (!s.isAI) this.toSeat(s, 'mp:rematch', { room: this.publicRoom() });
    this.broadcastLobby();
  }

  resetForRematch() {
    const room = this.room, plan = room.plan;
    room.host = null; room.status = 'lobby'; room.startedAt = null;
    room.seats.forEach((s) => {
      if (s.seat >= plan.humans) {
        const id = aiIdentity(s.seat);
        s.isAI = true; s.ready = true; s.userId = null; s.playerConfig = null; s.name = id.name; s.avatar = id.avatar; s.rank = null;
        return;
      }
      s.isAI = false; s.ready = false;
      if (!s.socketId || !s.connected) { s.userId = null; s.name = null; s.avatar = null; s.rank = null; s.connected = false; s.socketId = null; }
    });
    room.humans = plan.humans; room.ai = plan.ai;
  }

  fillEmptyWithAI() {
    const room = this.room;
    room.seats.forEach((s) => {
      if (!s.userId) { const id = aiIdentity(s.seat); s.isAI = true; s.ready = true; s.name = s.name || id.name; s.avatar = s.avatar || id.avatar; }
    });
    room.humans = room.seats.filter((s) => !s.isAI).length;
    room.ai = room.seats.filter((s) => s.isAI).length;
  }

  move(conn, payload) {
    const room = this.room;
    if (!room || !room.host || room.status !== 'playing') return;
    const seat = this.seatOf(conn);
    if (!seat) return;
    const type = payload && payload.type;
    if (!HUMAN_METHODS.has(type)) return this.send(conn, 'mp:error', { error: 'illegal_action' });
    const res = room.host.applyHumanMove(seat.seat, type, payload && payload.args);
    if (!res.ok) return this.send(conn, 'mp:error', { error: res.error });
    this.broadcastState();
    room.host.drive();
  }

  // ---- Match ----------------------------------------------------------------
  beginMatch() {
    const room = this.room;
    if (!room || room.status !== 'lobby') return;
    this.fillEmptyWithAI();
    const seatMeta = room.seats.map((s) => ({ seat: s.seat, name: s.name, avatar: s.avatar, isAI: s.isAI, rank: null }));
    PresinaHost.create({ seatMeta, seed: undefined, pacing: {}, mode: room.mode, config: room.config }).then((host) => {
      room.host = host; room.status = 'playing'; room.startedAt = Date.now();
      this.stat('mp_start', {});
      host.onUpdate = () => this.broadcastState();
      host.onFinished = (h, result) => {
        room.status = 'finished';
        const w = room.seats[result && result.winner];
        this.tallyTw(result);
        this.stat('mp_end', { duration: Math.round((Date.now() - room.startedAt) / 1000), turns: result && result.turnsTaken, won: w ? !w.isAI : null, score: w && result.players ? (result.players.find((p) => p.playerId === w.seat) || {}).finalScore : null });
        for (const s of room.seats) if (!s.isAI) this.toSeat(s, 'mp:finished', { result });
      };
      for (const s of room.seats) if (!s.isAI) this.toSeat(s, 'mp:started', { seat: s.seat, capacity: room.capacity, mode: room.mode });
      this.broadcastState();
      host.drive();
    }).catch((err) => {
      console.error('[mp] host init failed', err);
      for (const s of room.seats) this.toSeat(s, 'mp:error', { error: 'host_init_failed' });
    });
  }

  // One row per table event in the Stats object; the humans' browser ids ride
  // along in `extra` so a table counts as its players, not as one anonymous hit.
  stat(ev, fields) {
    const room = this.room; if (!room || !this.env.STATS) return;
    const uids = room.seats.filter((s) => !s.isAI && s.userId).map((s) => s.userId);
    const body = { ev, game: GAME, room: room.code, mode: room.mode, humans: room.humans, ai: room.ai, uid: uids[0] || null, extra: { uids }, ...fields };
    try { this.env.STATS.get(this.env.STATS.idFromName('arcade')).fetch('https://stats/ingest', { method: 'POST', body: JSON.stringify(body) }).catch(() => {}); } catch (e) {}
  }

  // Leaderboard tallies for signed-in seats: games played, won, and the winner's
  // lead over the runner-up.
  tallyTw(result) {
    const room = this.room; if (!room || !this.env.ACCOUNTS || !result) return;
    const scores = (result.players || []).map((p) => Number(p.finalScore) || 0).sort((a, b) => b - a);
    const margin = scores.length > 1 ? Math.max(0, scores[0] - scores[1]) : 0;
    const stub = this.env.ACCOUNTS.get(this.env.ACCOUNTS.idFromName('arcade'));
    for (const s of room.seats) {
      if (s.isAI || !s.accountId) continue;
      const won = result.winner === s.seat;
      stub.fetch('https://accounts/tw/result', { method: 'POST', body: JSON.stringify({ accountId: s.accountId, won, margin: won ? margin : 0 }) }).catch(() => {});
    }
  }

  broadcastState() {
    const room = this.room;
    if (!room || !room.host) return;
    for (const s of room.seats) if (!s.isAI && s.socketId) this.toSeat(s, 'mp:state', { state: room.host.stateFor(s.seat) });
  }
  broadcastLobby() {
    const room = this.room;
    if (!room) return;
    const pub = this.publicRoom();
    for (const s of room.seats) if (s.socketId) this.toSeat(s, 'mp:lobby', { room: pub });
  }

  publicRoom() {
    const room = this.room;
    return {
      code: room.code, game: room.game, mode: room.mode, config: room.config,
      humans: room.humans, ai: room.ai, capacity: room.capacity, status: room.status,
      hostUserId: room.hostUserId, allReady: this.allHumansReady(),
      seats: room.seats.map((s) => ({ seat: s.seat, name: s.name, avatar: s.avatar, rank: null, isAI: s.isAI,
        taken: !!s.userId, connected: s.connected, ready: s.isAI ? true : !!s.ready, amulets: 0 })),
    };
  }
}
