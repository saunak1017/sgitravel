import { ok, setCookie } from '../_lib/auth.js';
export async function onRequestPost() {
  return ok({}, { 'Set-Cookie': setCookie('auth','',0) });
}
