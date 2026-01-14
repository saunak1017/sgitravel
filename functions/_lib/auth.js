export async function requireAuth(request, env) {
  const cookie = request.headers.get('Cookie') || '';
  const m = cookie.match(/(?:^|;\s*)auth=([^;]+)/);
  if (!m) return { ok: false, error: 'Not authenticated' };
  const token = decodeURIComponent(m[1]);
  const valid = await verifyToken(token, env.TOKEN_SECRET);
  if (!valid) return { ok: false, error: 'Invalid session' };
  return { ok: true };
}

function b64urlEncode(bytes){
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlDecode(str){
  str = str.replace(/-/g,'+').replace(/_/g,'/');
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const bin = atob(str + pad);
  return new Uint8Array([...bin].map(ch => ch.charCodeAt(0)));
}

async function hmac(secret, data){
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return new Uint8Array(sig);
}

export async function signToken(payloadObj, secret){
  const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify(payloadObj)));
  const sigBytes = await hmac(secret, payload);
  const sig = b64urlEncode(sigBytes);
  return payload + '.' + sig;
}

export async function verifyToken(token, secret){
  const parts = token.split('.');
  if(parts.length !== 2) return false;
  const [payload, sig] = parts;
  const sigBytes = b64urlDecode(sig);
  const expected = await hmac(secret, payload);
  const ok = await crypto.subtle.verify(
    'HMAC',
    await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), {name:'HMAC', hash:'SHA-256'}, false, ['verify']),
    sigBytes,
    new TextEncoder().encode(payload)
  );
  if(!ok) return false;
  let obj;
  try{
    obj = JSON.parse(new TextDecoder().decode(b64urlDecode(payload)));
  }catch{ return false; }
  if(obj.exp && Date.now() > obj.exp) return false;
  return true;
}

export function json(data, status=200, headers={}){
  return new Response(JSON.stringify(data), {
    status,
    headers: {'Content-Type':'application/json', ...headers}
  });
}

export function badRequest(msg, status=400){
  return json({ok:false, error: msg}, status);
}

export function ok(data={}, headers={}){
  return json({ok:true, ...data}, 200, headers);
}

export function setCookie(name, value, maxAgeSeconds){
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
  ];
  // Pages uses HTTPS in production. In preview/dev it may be http.
  attrs.push(`Secure`);
  if(maxAgeSeconds !== undefined){
    attrs.push(`Max-Age=${maxAgeSeconds}`);
  }
  return attrs.join('; ');
}
