import { requireAuth, ok, badRequest } from '../_lib/auth.js';

function summarizeSegments(segs){
  const parts = segs.map(s=>`${s.flight_number} ${s.origin||''}→${s.destination||''}`.trim());
  return parts.join(' • ');
}

function normalizeSegmentDateTime(seg){
  if(!seg) return null;
  const sched = seg.sched_departure;
  if(sched && /^\d{4}-\d{2}-\d{2}T/.test(sched)) return sched;
  if(sched && /^\d{1,2}:\d{2}/.test(sched) && seg.flight_date){
    return `${seg.flight_date}T${sched}:00`;
  }
  return seg.flight_date || sched || null;
}

function segmentSortKey(seg){
  const dt = normalizeSegmentDateTime(seg);
  if(!dt) return 0;
  const t = new Date(dt).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(request, env);
  if(!a.ok) return badRequest('Not authenticated', 401);

  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const status = (url.searchParams.get('status') || '').trim();

  // basic list: bookings + first/last segment airports + traveler names
  const { results: bookings } = await env.DB.prepare('SELECT * FROM bookings ORDER BY id DESC LIMIT 200').all();

  const out = [];
  for (const b of bookings){
    const { results: segs } = await env.DB.prepare(
      'SELECT flight_number, flight_date, origin, destination, sched_departure, sched_arrival, airline FROM segments WHERE booking_id=?'
    ).bind(b.id).all();
    const { results: trav } = await env.DB.prepare(
      `SELECT tb.status, tb.pnr, tb.reason, p.name FROM traveler_bookings tb
       JOIN people p ON p.id = tb.person_id
       WHERE tb.booking_id=? ORDER BY p.name ASC`
    ).bind(b.id).all();

    const sortedSegs = segs.slice().sort((a,b)=>segmentSortKey(a) - segmentSortKey(b));
    const firstSeg = sortedSegs[0] || null;
    const lastSeg = sortedSegs[sortedSegs.length - 1] || null;
    const travelers = trav.map(x=>x.name).join(', ');
    const any_canceled = trav.some(x=>x.status==='Canceled');
    const route = sortedSegs.length ? `${firstSeg?.origin||'—'} → ${lastSeg?.destination||'—'}` : '—';
    const first_departure = sortedSegs.length ? normalizeSegmentDateTime(firstSeg) : null;

    const row = {
      id: b.id,
      booking_type: b.booking_type,
      payment_type: b.payment_type,
      cost_cash: b.cost_cash ?? 'N/A',
      cost_miles: b.cost_miles ?? 'N/A',
      fees: b.fees ?? 'N/A',
      currency: b.currency || 'USD',
      route,
      segment_summary: summarizeSegments(segs),
      travelers,
      traveler_details: trav,
      first_segment: firstSeg ? {
        origin: firstSeg.origin || null,
        destination: firstSeg.destination || null,
        flight_number: firstSeg.flight_number || null,
        airline: firstSeg.airline || null
      } : null,
      first_departure,
      any_canceled
    };

    if(status === 'Active' && any_canceled) continue;
    if(status === 'Canceled' && !any_canceled) continue;

    if(q){
      const travelerBlob = trav.map(t=>`${t.name} ${t.pnr || ''} ${t.reason || ''}`).join(' ');
      const segmentBlob = segs.map(s=>`${s.flight_number} ${s.origin || ''} ${s.destination || ''} ${s.airline || ''}`).join(' ');
      const blob = `${row.id} ${row.route} ${row.segment_summary} ${row.travelers} ${travelerBlob} ${segmentBlob}`.toLowerCase();
      if(!blob.includes(q)) continue;
    }

    out.push(row);
  }

  return ok({ bookings: out });
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(request, env);
  if(!a.ok) return badRequest('Not authenticated', 401);

  const body = await request.json().catch(()=>null);
  const booking = body?.booking;
  const segments = body?.segments || [];
  const travelers = body?.travelers || [];

  if(!booking || !segments.length || !travelers.length) return badRequest('Missing booking/segments/travelers');

  const payment_type = booking.payment_type;
  if(payment_type !== 'Cash' && payment_type !== 'Miles') return badRequest('payment_type must be Cash or Miles');
  if(payment_type === 'Cash' && (booking.cost_cash === null || booking.cost_cash === undefined || booking.cost_cash === '')) return badRequest('Cash requires cost_cash');
  if(payment_type === 'Miles' && (!booking.cost_miles || !booking.fees)) return badRequest('Miles requires cost_miles + fees');

  // Create booking
  const r = await env.DB.prepare(
    `INSERT INTO bookings (booking_type, payment_type, cost_cash, cost_miles, fees, currency, class, secondary_class, ticket_end, issued_on)
     VALUES (?,?,?,?,?,?,?,?,?,?)`
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
    booking.issued_on || null
  ).run();

  const booking_id = r.meta.last_row_id;

  // Segments
  for(const s of segments){
    await env.DB.prepare(
      `INSERT INTO segments (booking_id, flight_number, flight_date, origin, destination, sched_departure, sched_arrival, airline, aircraft_type, fetched_json)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).bind(
      booking_id,
      s.flight_number,
      s.flight_date,
      s.origin || null,
      s.destination || null,
      s.sched_departure || null,
      s.sched_arrival || null,
      s.airline || null,
      s.aircraft_type || null,
      s.fetched_json ? JSON.stringify(s.fetched_json) : null
    ).run();
  }

  // Travelers (per person PNR)
  for(const t of travelers){
    if(!t.pnr) return badRequest('PNR required for each traveler');
    await env.DB.prepare(
      `INSERT INTO traveler_bookings (booking_id, person_id, pnr, category, reason)
       VALUES (?,?,?,?,?)`
    ).bind(booking_id, t.person_id, t.pnr, t.category || null, t.reason || null).run();
  }

  return ok({ id: booking_id });
}
