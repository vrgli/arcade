// Sign-in. Plain OAuth 2.0 authorization-code flow against Google, GitHub,
// Discord and Apple — no SDKs, just fetch + WebCrypto. A successful callback
// upserts the player in the Accounts DO and sets one signed cookie:
//   vg_s = <accountId>.<expiresMs>.<hmac-sha256 hex>      (180 days)
// The cookie is the whole session; nothing is stored server-side for it.
import { page } from './leaderboard-page.js';

const SESSION_MS = 180 * 86400_000;
const enc = new TextEncoder();
const hex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uStr = (s) => b64u(enc.encode(s));
const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const unb64uStr = (s) => new TextDecoder().decode(unb64u(s));
const rand = () => hex(crypto.getRandomValues(new Uint8Array(16)));
const cookies = (req) => Object.fromEntries((req.headers.get('Cookie') || '').split(/;\s*/).filter(Boolean).map((c) => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)]; }));
const safeEq = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };

// ---- Session cookie --------------------------------------------------------
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}
export async function sessionCookie(accountId, env) {
  const exp = Date.now() + SESSION_MS;
  const sig = await hmac(env.SESSION_SECRET, `${accountId}.${exp}`);
  return `vg_s=${accountId}.${exp}.${sig}; Max-Age=${SESSION_MS / 1000 | 0}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}
export const clearCookie = () => 'vg_s=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax';
// → { accountId } or null. Never throws.
export async function getSession(req, env) {
  try {
    if (!env.SESSION_SECRET) return null;
    const [id, exp, sig] = (cookies(req).vg_s || '').split('.');
    if (!/^[0-9a-f]{16}$/.test(id || '') || !(Number(exp) > Date.now()) || !sig) return null;
    return safeEq(sig, await hmac(env.SESSION_SECRET, `${id}.${exp}`)) ? { accountId: id } : null;
  } catch (e) { return null; }
}

// ---- Providers ---------------------------------------------------------------
// user(token, form) → { subject, name, avatar }. `form` is the callback's POST
// body (Apple only). Fetch errors propagate and become the 'failed' page.
const get = async (u, token, extra = {}) => {
  const r = await fetch(u, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'User-Agent': 'arcade.vrg.li', ...extra } });
  if (!r.ok) throw new Error(`${u} → ${r.status}`);
  return r.json();
};
const PROVIDERS = {
  google: {
    label: 'Google', env: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], scope: 'openid email profile',
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token',
    async user(tok) { const u = await get('https://openidconnect.googleapis.com/v1/userinfo', tok.access_token); return { subject: u.sub, name: u.name || u.given_name, avatar: u.picture }; },
  },
  github: {
    label: 'GitHub', env: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'], scope: 'read:user',
    authorize: 'https://github.com/login/oauth/authorize', token: 'https://github.com/login/oauth/access_token',
    async user(tok) { const u = await get('https://api.github.com/user', tok.access_token); return { subject: String(u.id), name: u.name || u.login, avatar: u.avatar_url }; },
  },
  discord: {
    label: 'Discord', env: ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'], scope: 'identify',
    authorize: 'https://discord.com/oauth2/authorize', token: 'https://discord.com/api/oauth2/token',
    async user(tok) { const u = await get('https://discord.com/api/users/@me', tok.access_token); return { subject: u.id, name: u.global_name || u.username, avatar: u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png` : null }; },
  },
  apple: {
    label: 'Apple', env: ['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'], scope: 'name email',
    authorize: 'https://appleid.apple.com/auth/authorize', token: 'https://appleid.apple.com/auth/token',
    extra: { response_type: 'code id_token', response_mode: 'form_post' }, // Apple POSTs the result back
    // The id_token came straight from Apple's token endpoint over TLS, so its
    // payload is trusted without a second signature check. The name arrives
    // only once, on first consent, in the POSTed `user` JSON.
    async user(tok, form) {
      const claims = JSON.parse(unb64uStr(String(tok.id_token || '').split('.')[1] || ''));
      let name = null;
      try { const u = JSON.parse(form.user || 'null'); name = u && u.name ? [u.name.firstName, u.name.lastName].filter(Boolean).join(' ') : null; } catch (e) {}
      return { subject: claims.sub, name, avatar: null };
    },
  },
};
const clientId = (env, p) => env[`${p.toUpperCase()}_CLIENT_ID`];
const live = (env, name) => PROVIDERS[name].env.every((k) => !!env[k]);

// Apple's "client secret" is a JWT we sign ourselves with the .p8 key (ES256).
async function appleSecret(env) {
  const pem = String(env.APPLE_PRIVATE_KEY).replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const key = await crypto.subtle.importKey('pkcs8', unb64u(pem), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000);
  const head = b64uStr(JSON.stringify({ alg: 'ES256', kid: env.APPLE_KEY_ID }));
  const body = b64uStr(JSON.stringify({ iss: env.APPLE_TEAM_ID, iat: now, exp: now + 86400, aud: 'https://appleid.apple.com', sub: env.APPLE_CLIENT_ID }));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${head}.${body}`));
  return `${head}.${body}.${b64u(new Uint8Array(sig))}`; // WebCrypto already emits raw r||s, which is JWS form
}
const clientSecret = (env, name) => (name === 'apple' ? appleSecret(env) : env[`${name.toUpperCase()}_CLIENT_SECRET`]);

// ---- Routes ------------------------------------------------------------------
const redirect = (to, setCookies = []) => { const h = new Headers({ Location: to }); for (const c of setCookies) h.append('Set-Cookie', c); return new Response(null, { status: 302, headers: h }); };
const html = (title, body, status = 200, setCookies = []) => { const h = new Headers({ 'Content-Type': 'text/html;charset=utf-8' }); for (const c of setCookies) h.append('Set-Cookie', c); return new Response(page(title, body), { status, headers: h }); };
const safeNext = (n) => (typeof n === 'string' && /^\/(?!\/)/.test(n) ? n.slice(0, 512) : '/');
// vg_oauth must survive Apple's cross-site POST back to us, hence SameSite=None.
const oauthCookie = (v) => `vg_oauth=${v}; Max-Age=600; Path=/auth/; HttpOnly; Secure; SameSite=None`;
const clearOauth = 'vg_oauth=; Max-Age=0; Path=/auth/; HttpOnly; Secure; SameSite=None';

export async function handleAuth(req, env, url) {
  const m = url.pathname.match(/^\/auth\/([a-z]+)(\/callback)?\/?$/);
  if (!m) return new Response('not found', { status: 404 });
  const [, name, isCallback] = m;

  if (name === 'providers') return Response.json(Object.fromEntries(Object.keys(PROVIDERS).map((k) => [k, !!env.SESSION_SECRET && live(env, k)])));
  if (!env.SESSION_SECRET) return html('Sign-in is not configured', '<p class="mute">The arcade has no session secret yet, so sign-in is switched off.</p>', 503);
  if (name === 'logout') return req.method === 'POST' ? redirect(url.origin + '/', [clearCookie()]) : new Response('POST only', { status: 405 });

  const prov = PROVIDERS[name];
  if (!prov) return new Response('not found', { status: 404 });
  if (!live(env, name)) return html(`Sign in with ${prov.label} is not switched on yet`, '<p class="mute">The keys for this provider have not been added. Try another way in from the <a href="/">arcade</a>.</p>');
  const callback = `${url.origin}/auth/${name}/callback`;

  // Step 1: remember state + where to go afterwards, send the player off.
  if (!isCallback) {
    const st = { state: rand(), next: safeNext(url.searchParams.get('next')), provider: name };
    const q = new URLSearchParams({ client_id: clientId(env, name), redirect_uri: callback, response_type: 'code', scope: prov.scope, state: st.state, ...(prov.extra || {}) });
    return redirect(`${prov.authorize}?${q}`, [oauthCookie(b64uStr(JSON.stringify(st)))]);
  }

  // Step 2: back from the provider (GET with query, or Apple's form POST).
  const form = req.method === 'POST' ? Object.fromEntries((await req.formData()).entries()) : Object.fromEntries(url.searchParams.entries());
  let st = null;
  try { st = JSON.parse(unb64uStr(cookies(req).vg_oauth || '')); } catch (e) {}
  const fail = (why) => html('Sign-in did not complete', `<p class="mute">${why}. <a href="/auth/${name}">Try again</a> or go back to the <a href="/">arcade</a>.</p>`, 400, [clearOauth]);
  if (form.error) return fail(form.error === 'access_denied' || form.error === 'user_cancelled_authorize' ? 'You cancelled' : 'The provider returned an error');
  if (!st || st.provider !== name || !form.state || !safeEq(String(form.state), st.state)) return fail('The sign-in link expired or did not match');
  if (!form.code) return fail('No code came back');

  try {
    const body = new URLSearchParams({ client_id: clientId(env, name), client_secret: await clientSecret(env, name), code: form.code, grant_type: 'authorization_code', redirect_uri: callback });
    const r = await fetch(prov.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json', 'User-Agent': 'arcade.vrg.li' }, body });
    const tok = await r.json();
    if (!r.ok || tok.error) throw new Error(tok.error_description || tok.error || `token ${r.status}`);
    const u = await prov.user(tok, form);
    if (!u.subject) throw new Error('no subject');
    const a = await env.ACCOUNTS.get(env.ACCOUNTS.idFromName('arcade')).fetch('https://accounts/upsert', {
      method: 'POST', body: JSON.stringify({ provider: name, subject: String(u.subject), name: u.name || 'Player', avatar: u.avatar || null }),
    }).then((x) => x.json());
    if (!a.account) throw new Error('upsert failed');
    return redirect(url.origin + st.next, [await sessionCookie(a.account.id, env), clearOauth]);
  } catch (e) {
    console.error('[auth]', name, e);
    return fail('The provider did not accept the sign-in');
  }
}
