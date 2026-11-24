import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { next } from '@vercel/functions';

const cookieName = '__Host-assay_session';
const maxAge = 12 * 60 * 60;
const hash = value => createHash('sha256').update(value).digest();
const equal = (left, right) => timingSafeEqual(hash(left), hash(right));
const privateHeaders = {
  'Cache-Control': 'private, no-store',
  'X-Robots-Tag': 'noindex',
};

function loginPage(wrongPassword = false) {
  return new Response(`<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Emergence Labs · Assay Index</title>
<style>
  * { box-sizing: border-box }
  body { margin: 0; min-height: 100svh; display: grid; place-items: center; padding: 24px;
    background: #070d23; color: #192130; font: 16px system-ui, sans-serif }
  main { width: min(100%, 420px); padding: clamp(24px, 6vw, 40px); background: #f7f8fb;
    border: 1px solid #d8dee8; border-radius: 16px }
  p, h1 { margin: 0 }
  .brand { font-weight: 650; color: #2545b4 }
  h1 { margin-top: 6px; font: 400 44px Georgia, serif; letter-spacing: -.045em }
  form { display: grid; gap: 10px; margin: 26px 0 0 }
  label { font-weight: 600 }
  input, button { width: 100%; min-height: 46px; padding: 8px 12px; border-radius: 7px;
    font: inherit }
  input { border: 1px solid #818da4 }
  button { border: 1px solid #2545b4; background: #2545b4; color: white; cursor: pointer }
  :focus-visible { outline: 3px solid #5475e2; outline-offset: 3px }
  [role="alert"] { color: #972525 }
</style>
<main>
  <p class="brand">Emergence Labs</p>
  <h1>Assay Index</h1>
  <form method="post">
    <label for="password">Password</label>
    <input type="password" name="password" id="password" autocomplete="current-password" required>
    ${wrongPassword ? '<p role="alert">Incorrect password. Try again.</p>' : ''}
    <button type="submit">Open Assay Index</button>
  </form>
</main>
</html>`, {
    status: 401,
    headers: {
      ...privateHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    },
  });
}

export default async function proxy(request) {
  const password = process.env.ASSAY_SITE_PASSWORD;
  const key = process.env.ASSAY_SESSION_KEY;
  if (!password || !key) {
    return new Response('Authentication is unavailable.', { status: 503, headers: privateHeaders });
  }

  const sign = expiry => createHmac('sha256', key).update(expiry + ':' + password).digest('base64url');
  const cookie = request.headers.get('cookie')?.split(';').map(value => value.trim())
    .find(value => value.startsWith(cookieName + '='));
  const [expiry = '', signature = ''] = (cookie?.slice(cookieName.length + 1) ?? '').split('.');
  const now = Math.floor(Date.now() / 1000);
  if (/^\d+$/.test(expiry) && Number(expiry) > now && equal(signature, sign(expiry))) {
    return next();
  }

  if (request.method === 'POST') {
    const url = new URL(request.url);
    if (request.headers.get('origin') !== url.origin) {
      return new Response('Forbidden', { status: 403, headers: privateHeaders });
    }
    const type = request.headers.get('content-type')?.split(';', 1)[0];
    if (type !== 'application/x-www-form-urlencoded') {
      return new Response('Unsupported form format.', { status: 415, headers: privateHeaders });
    }
    const body = await request.text();
    const supplied = new URLSearchParams(body).get('password') ?? '';
    if (body.length > 2048 || !equal(supplied, password)) return loginPage(true);

    const expires = String(now + maxAge);
    const target = url.pathname.startsWith('//') ? '/' : url.pathname + url.search;
    return new Response(null, {
      status: 303,
      headers: {
        ...privateHeaders,
        Location: target,
        'Set-Cookie': `${cookieName}=${expires}.${sign(expires)}; Max-Age=${maxAge}; Path=/; Secure; HttpOnly; SameSite=Lax`,
      },
    });
  }

  if (request.method === 'GET' && request.headers.get('accept')?.includes('text/html')) {
    return loginPage();
  }
  return new Response('Authentication required.', { status: 401, headers: privateHeaders });
}
