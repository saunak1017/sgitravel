import { requireAuth, badRequest } from '../_lib/auth.js';

function toCsv(rows){
  const esc = (v)=>(''+(v??'')).replace(/"/g,'""');
  const header = ['person','route','first_departure','booking_id','reason','category','payment_type','cost_cash','cost_miles','fees','status'];
  const lines = [header.join(',')];
  for(const r of rows){
    lines.push(header.map(k=>`"${esc(r[k])}"`).join(','));
  }
  return lines.join('\n');
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

async function build(env, params){
  // reuse logic by calling internal /api/report would cost extra; so duplicate minimal here
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const person_id = params.get('person_id') || '';
  const category = (params.get('category') || '').trim().toLowerCase();
  const status = (params.get('status') || '').trim();

  let sql = `
    SELECT tb.status, tb.category, tb.reason, tb.booking_id,
           p.name as person,
           b.payment_type, b.cost_cash, b.cost_miles, b.fees
    FROM traveler_bookings tb
    JOIN people p ON p.id = tb.person_id
    JOIN bookings b ON b.id = tb.booking_id
    WHERE 1=1
  `;
  const binds = [];
  if(person_id){ sql += ' AND tb.person_id=?'; binds.push(Number(person_id)); }
  if(status){ sql += ' AND tb.status=?'; binds.push(status); }
  if(category){ sql += ' AND lower(tb.category) LIKE ?'; binds.push('%'+category+'%'); }
  sql += ' ORDER BY tb.booking_id DESC';

  const { results: base } = await env.DB.prepare(sql).bind(...binds).all();

  const rows = [];
  for(const r of base){
    const { results: segs } = await env.DB.prepare(
      'SELECT origin, destination, sched_departure, flight_date FROM segments WHERE booking_id=?'
    ).bind(r.booking_id).all();
    const sortedSegs = segs.slice().sort((a,b)=>segmentSortKey(a) - segmentSortKey(b));
    const firstSeg = sortedSegs[0] || null;
    const lastSeg = sortedSegs[sortedSegs.length - 1] || null;
    const route = sortedSegs.length ? `${firstSeg?.origin||'—'} → ${lastSeg?.destination||'—'}` : '—';
    const first_departure = sortedSegs.length ? normalizeSegmentDateTime(firstSeg) : null;
    if(from){
      const d = (first_departure||'').slice(0,10);
      if(d && d < from) continue;
    }
    if(to){
      const d = (first_departure||'').slice(0,10);
      if(d && d > to) continue;
    }
    rows.push({
      person: r.person,
      route,
      first_departure,
      booking_id: r.booking_id,
      reason: r.reason,
      category: r.category,
      payment_type: r.payment_type,
      cost_cash: r.cost_cash ?? 'N/A',
      cost_miles: r.cost_miles ?? 'N/A',
      fees: r.fees ?? 'N/A',
      status: r.status
    });
  }
  return rows;
}

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(request, env);
  if(!a.ok) return badRequest('Not authenticated', 401);

  const url = new URL(request.url);
  const rows = await build(env, url.searchParams);
  const csv = toCsv(rows);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="travel-report.csv"'
    }
  });
}
