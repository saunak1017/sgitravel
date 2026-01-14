import { requireAuth, ok, badRequest } from '../../../_lib/auth.js';

export async function onRequestPut({ request, env, params }) {
  const a = await requireAuth(request, env);
  if(!a.ok) return badRequest('Not authenticated', 401);

  const id = Number(params.id);
  if(!id) return badRequest('Bad id');

  const body = await request.json().catch(()=>null);
  const pnr = (body?.pnr || '').trim();
  if(!pnr) return badRequest('PNR required');

  await env.DB.prepare(
    `UPDATE traveler_bookings SET pnr=?, category=?, reason=?, refund_method=?, refund_notes=? WHERE id=?`
  ).bind(
    pnr,
    (body?.category || '').trim() || null,
    (body?.reason || '').trim() || null,
    (body?.refund_method || '').trim() || null,
    (body?.refund_notes || '').trim() || null,
    id
  ).run();

  return ok({});
}
