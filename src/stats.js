// Play statistics. One Durable Object with SQLite storage — the arcade's only
// database. Everything in here is pseudonymous: a random browser id, never an
// IP address, never a name. See /privacy for what is collected and why.
export class Stats {
  constructor(state) {
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts TEXT NOT NULL,
      ev TEXT NOT NULL,
      game TEXT, page TEXT, uid TEXT, sid TEXT,
      country TEXT, region TEXT, city TEXT, colo TEXT,
      device TEXT, os TEXT, browser TEXT, lang TEXT, screen TEXT, tz TEXT, ref TEXT,
      mode TEXT, duration INTEGER, score INTEGER, won INTEGER, turns INTEGER,
      room TEXT, humans INTEGER, ai INTEGER,
      extra TEXT
    )`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS ev_ts ON events(ts)`);
    this.sql.exec(`CREATE INDEX IF NOT EXISTS ev_game ON events(game, ev)`);
  }

  async fetch(req) {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/ingest') {
      const e = await req.json();
      const s = (v, n = 64) => (v == null ? null : String(v).slice(0, n));
      const i = (v) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : null);
      this.sql.exec(
        `INSERT INTO events (ts,ev,game,page,uid,sid,country,region,city,colo,device,os,browser,lang,screen,tz,ref,mode,duration,score,won,turns,room,humans,ai,extra)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        new Date().toISOString(), s(e.ev, 32), s(e.game, 48), s(e.page, 128), s(e.uid), s(e.sid),
        s(e.country, 8), s(e.region), s(e.city), s(e.colo, 8), s(e.device, 16), s(e.os, 32), s(e.browser, 32),
        s(e.lang, 16), s(e.screen, 24), s(e.tz, 48), s(e.ref, 256), s(e.mode, 32),
        i(e.duration), i(e.score), e.won == null ? null : (e.won ? 1 : 0), i(e.turns),
        s(e.room, 8), i(e.humans), i(e.ai), e.extra ? JSON.stringify(e.extra).slice(0, 1000) : null,
      );
      return new Response(null, { status: 204 });
    }
    if (url.pathname === '/summary') {
      const rows = (q, ...a) => this.sql.exec(q, ...a).toArray();
      const out = {
        generated: new Date().toISOString(),
        totals: rows(`SELECT ev, game, COUNT(*) n FROM events GROUP BY ev, game ORDER BY game, ev`),
        gamesPerDay: rows(`SELECT substr(ts,1,10) day, game, SUM(ev IN ('solo_end','mp_end')) finished, SUM(ev IN ('solo_start','mp_start')) started
                           FROM events WHERE game IS NOT NULL GROUP BY day, game ORDER BY day DESC LIMIT 90`),
        players: rows(`SELECT substr(ts,1,10) day, COUNT(DISTINCT uid) uids FROM events WHERE uid IS NOT NULL GROUP BY day ORDER BY day DESC LIMIT 30`),
        countries: rows(`SELECT country, COUNT(DISTINCT uid) uids, COUNT(*) events FROM events WHERE country IS NOT NULL GROUP BY country ORDER BY uids DESC LIMIT 30`),
        devices: rows(`SELECT device, os, browser, COUNT(DISTINCT uid) uids FROM events WHERE device IS NOT NULL GROUP BY device, os, browser ORDER BY uids DESC LIMIT 20`),
        modes: rows(`SELECT game, mode, COUNT(*) n FROM events WHERE ev IN ('solo_end','mp_end') GROUP BY game, mode ORDER BY n DESC`),
        watchTime: rows(`SELECT game, COUNT(*) sessions, ROUND(AVG(duration)) avgSeconds, SUM(duration) totalSeconds FROM events WHERE ev='end' AND duration IS NOT NULL GROUP BY game`),
        forks: rows(`SELECT game, ev, COUNT(*) n, COUNT(DISTINCT uid) uids FROM events WHERE ev IN ('fork_click','download') GROUP BY game, ev ORDER BY n DESC`),
        referrers: rows(`SELECT ref, COUNT(*) n FROM events WHERE ev='view' AND ref IS NOT NULL AND ref != '' GROUP BY ref ORDER BY n DESC LIMIT 20`),
        recent: rows(`SELECT ts, ev, game, mode, country, device, duration, score, won, humans, ai FROM events ORDER BY id DESC LIMIT 25`),
      };
      return Response.json(out);
    }
    return new Response('not found', { status: 404 });
  }
}
