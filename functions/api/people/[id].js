import { requireAuth, ok, badRequest } from '../../_lib/auth.js';

export async function onRequestPut({ request, env, params }) {
  const a = await requireAuth(request, env);
  if(!a.ok) return badRequest('Not authenticated', 401);

  const id = Number(params.id);
  if(!id) return badRequest('Bad id');

  const body = await request.json().catch(()=>null);
  const active = body?.active;
  if(active !== 0 && active !== 1) return badRequest('active must be 0 or 1');

  await env.DB.prepare('UPDATE people SET active=? WHERE id=?').bind(active, id).run();
  return ok({ id, active });
}
