import { requireAuth, ok, badRequest } from '../_lib/auth.js';
export async function onRequestGet({ request, env }) {
  const a = await requireAuth(request, env);
  if(!a.ok) return badRequest('Not authenticated', 401);
  return ok({ user: { role: 'admin' } });
}
