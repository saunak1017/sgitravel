import { ok, badRequest, signToken, setCookie } from '../_lib/auth.js';

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(()=>null);
  const password = body?.password || '';
  if(!password) return badRequest('Password required');
  if(password !== env.AUTH_PASSWORD) return badRequest('Wrong password', 401);

  const token = await signToken({ exp: Date.now() + 1000*60*60*24*7 }, env.TOKEN_SECRET); // 7 days
  return ok({}, { 'Set-Cookie': setCookie('auth', token, 60*60*24*7) });
}
