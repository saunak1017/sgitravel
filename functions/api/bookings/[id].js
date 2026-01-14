import { requireAuth, ok, badRequest } from '../../_lib/auth.js';

export async function onRequestGet({ request, env, params }) {
  const a = await requireAuth(request, env);
  if(!a.ok) return badRequest('Not authenticated', 401);

  const id = Number(params.id);
  if(!id) return badRequest('Bad id');

  const booking = await env.DB.prepare('SELECT * FROM bookings WHERE id=?').bind(id).first();
  if(!booking) return badRequest('Not found', 404);

  const { results: segments } = await env.DB.prepare(
    'SELECT id, flight_number, flight_date, origin, destination, sched_departure, sched_arrival, airline, aircraft_type, segment_group FROM segments WHERE booking_id=? ORDER BY COALESCE(sched_departure, flight_date) ASC'
  ).bind(id).all();

  const { results: travelers } = await env.DB.prepare(
    `SELECT tb.id, tb.person_id, p.name, tb.pnr, tb.category, tb.reason, tb.status, tb.refund_method, tb.refund_notes
     FROM traveler_bookings tb JOIN people p ON p.id = tb.person_id
     WHERE tb.booking_id=? ORDER BY p.name ASC`
  ).bind(id).all();

  return ok({ booking, segments, travelers });
}

export async function onRequestPut({ request, env, params }) {
  const a = await requireAuth(request, env);
  if(!a.ok) return badRequest('Not authenticated', 401);

  const id = Number(params.id);
  if(!id) return badRequest('Bad id');

  const body = await request.json().catch(()=>null);
  const booking = body?.booking;
  const segments = body?.segments || [];

  if(!booking || !segments.length) return badRequest('Missing booking/segments');

  const payment_type = booking.payment_type;
  if(payment_type !== 'Cash' && payment_type !== 'Miles') return badRequest('payment_type must be Cash or Miles');
  if(payment_type === 'Cash' && (booking.cost_cash === null || booking.cost_cash === undefined || booking.cost_cash === '')) return badRequest('Cash requires cost_cash');
  if(payment_type === 'Miles' && (!booking.cost_miles || !booking.fees)) return badRequest('Miles requires cost_miles + fees');

  const existing = await env.DB.prepare('SELECT id FROM bookings WHERE id=?').bind(id).first();
  if(!existing) return badRequest('Not found', 404);

  await env.DB.prepare(
    `UPDATE bookings SET booking_type=?, payment_type=?, cost_cash=?, cost_miles=?, fees=?, currency=?, class=?, secondary_class=?, ticket_end=?, issued_on=? WHERE id=?`
  ).bind(
    booking.booking_type || 'Booking',
    payment_type,
    booking.cost_cash || null,
    booking.cost_miles || null,
    booking.fees || null,
    (booking.currency || 'USD').toUpperCase(),
    booking.class || null,
    booking.secondary_class || null,
    booking.ticket_end || null,
    booking.issued_on || null,
    id
  ).run();

  await env.DB.prepare('DELETE FROM segments WHERE booking_id=?').bind(id).run();

  for(const s of segments){
    await env.DB.prepare(
      `INSERT INTO segments (booking_id, flight_number, flight_date, origin, destination, sched_departure, sched_arrival, airline, aircraft_type, fetched_json, segment_group)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      id,
      s.flight_number,
      s.flight_date,
      s.origin || null,
      s.destination || null,
      s.sched_departure || null,
      s.sched_arrival || null,
      s.airline || null,
      s.aircraft_type || null,
      s.fetched_json ? JSON.stringify(s.fetched_json) : null,
      s.segment_group || 'Outbound'
    ).run();
  }

  return ok({});
}

export async function onRequestDelete({ request, env, params }) {
  const a = await requireAuth(request, env);
  if(!a.ok) return badRequest('Not authenticated', 401);

  const id = Number(params.id);
  if(!id) return badRequest('Bad id');

  await env.DB.prepare('DELETE FROM bookings WHERE id=?').bind(id).run();
  return ok({});
}
