// arcade.vrg.li → play.vrg.li. Page visits get a tiny page that carries the
// browser's saved settings (localStorage is per address) over in the fragment;
// the new host's /env.js reads them back. Everything else, and every visit
// after the first, is a plain permanent redirect.
const page = (to) => `<!doctype html><meta charset="utf-8"><title>Moved to play.vrg.li</title>
<meta name="robots" content="noindex"><link rel="canonical" href="${to}">
<noscript><meta http-equiv="refresh" content="0;url=${to}"></noscript>
<p style="font:16px system-ui;margin:40px">The arcade moved to <a href="${to}">play.vrg.li</a>.</p>
<script>(function(){var to=${JSON.stringify(to)},h=location.hash;try{if(!localStorage.getItem('vg_moved')&&localStorage.length){var d={};for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);d[k]=localStorage.getItem(k);}
var b=btoa(unescape(encodeURIComponent(JSON.stringify(d)))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');h=(h?h+'&':'#')+'vgcarry='+b;localStorage.setItem('vg_moved','1');}}catch(e){}location.replace(to+h);})();</script>`;

export default {
  fetch(req, env) {
    const url = new URL(req.url);
    const to = env.TARGET + url.pathname + url.search;
    const wantsPage = req.method === 'GET' && (req.headers.get('Accept') || '').includes('text/html');
    if (url.pathname === '/robots.txt') return new Response('User-agent: *\nDisallow:\n', { headers: { 'Content-Type': 'text/plain' } });
    if (!wantsPage || (req.headers.get('Cookie') || '').includes('vg_moved=1')) return Response.redirect(to, 301);
    return new Response(page(to), { headers: { 'Content-Type': 'text/html;charset=utf-8', 'Cache-Control': 'no-store', 'Set-Cookie': 'vg_moved=1; Max-Age=31536000; Path=/; Secure; SameSite=Lax' } });
  },
};
