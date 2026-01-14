import { requireAuth, ok, badRequest } from '../../_lib/auth.js';

export async function onRequestGet({ request, env, params }) {
  const a = await requireAuth(request, env);
  if(!a.ok) return badRequest('Not authenticated', 401);

  const id = Number(params.id);
  if(!id) return badRequest('Bad id');

  const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id=?').bind(id).first();
  if(!booking) return badRequest('Not found', 404);

  const { results: segments } = await env.DB.prepare(
    'SELECT id, flight_number, flight_date, origin, destination, sched_departure, sched_arrival, airline, aircraft_type FROM segments WHERE booking_id=? ORDER BY COALESCE(sched_departure, flight_date) ASC'
  ).bind(id).all();

  const { results: travelers } = await env.DB.prepare(
    `SELECT tb.id, tb.person_id, p.name, tb.pnr, tb.category, tb.reason, tb.status, tb.refund_method, tb.refund_notes
     FROM traveler_bookings tb JOIN people p ON p.id = tb.person_id
     WHERE tb.booking_id=? ORDER BY p.name ASC`
  ).bind(id).all();

  return ok({ booking, segments, travelers });
}

export async function onRequestDelete({ request, env, params }) {
  const a = await requireAuth(request, env);
  if(!a.ok) return badRequest('Not authenticated', 401);

  const id = Number(params.id);
  if(!id) return badRequest('Bad id');

  await env.DB.prepare('DELETE FROM bookings WHERE id=?').bind(id).run();
  return ok({});
}
