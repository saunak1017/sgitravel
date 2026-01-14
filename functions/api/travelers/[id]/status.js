import { requireAuth, ok, badRequest } from '../../../../_lib/auth.js';

export async function onRequestPut({ request, env, params }) {
  const a = await requireAuth(request, env);
  if(!a.ok) return badRequest('Not authenticated', 401);

  const id = Number(params.id);
  if(!id) return badRequest('Bad id');

  const body = await request.json().catch(()=>null);
  const status = body?.status;
  if(status !== 'Active' && status !== 'Canceled') return badRequest('status must be Active or Canceled');

  const refund_method = (body?.refund_method || '').trim() || null;
  await env.DB.prepare('UPDATE traveler_bookings SET status=?, refund_method=? WHERE id=?').bind(status, refund_method, id).run();
  return ok({});
}
