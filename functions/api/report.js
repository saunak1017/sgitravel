import { requireAuth, ok, badRequest } from '../_lib/auth.js';

function toCsv(rows){
  const esc = (v)=>(''+(v??'')).replace(/"/g,'""');
  const header = ['person','route','first_departure','booking_id','reason','category','payment_type','cost_cash','cost_miles','fees','status'];
  const lines = [header.join(',')];
  for(const r of rows){
    lines.push(header.map(k=>`"${esc(r[k])}"`).join(','));
  }
  return lines.join('\n');
}

async function buildReport(env, params){
  const from = params.get('from') || '';
  const to = params.get('to') || '';
  const person_id = params.get('person_id') || '';
  const category = (params.get('category') || '').trim().toLowerCase();
  const status = (params.get('status') || '').trim();

  // Pull traveler rows then join booking + segments
  let sql = `
    SELECT tb.id as traveler_booking_id, tb.status, tb.category, tb.reason, tb.booking_id,
           p.name as person,
           b.payment_type, b.cost_cash, b.cost_miles, b.fees, b.currency
    FROM traveler_bookings tb
    JOIN people p ON p.id = tb.person_id
    JOIN bookings b ON b.id = tb.booking_id
    WHERE 1=1
  `;
  const binds = [];

  if(person_id){
    sql += ' AND tb.person_id=?';
    binds.push(Number(person_id));
  }
  if(status){
    sql += ' AND tb.status=?';
    binds.push(status);
  }
  if(category){
    sql += ' AND lower(tb.category) LIKE ?';
    binds.push('%'+category+'%');
  }

  sql += ' ORDER BY tb.booking_id DESC';

  const { results: base } = await env.DB.prepare(sql).bind(...binds).all();

  const rows = [];
  let cash_spend = 0;
  let miles_used = 0;
  let award_fees = 0;

  for(const r of base){
    const { results: segs } = await env.DB.prepare(
      'SELECT origin, destination, sched_departure, flight_date FROM segments WHERE booking_id=? ORDER BY COALESCE(sched_departure, flight_date) ASC'
    ).bind(r.booking_id).all();

    const route = segs.length ? `${segs[0].origin||'—'} → ${segs[segs.length-1].destination||'—'}` : '—';
    const first_departure = segs.length ? (segs[0].sched_departure || segs[0].flight_date) : null;

    // date filter applies to first_departure date
    if(from){
      const d = (first_departure||'').slice(0,10);
      if(d && d < from) continue;
    }
    if(to){
      const d = (first_departure||'').slice(0,10);
      if(d && d > to) continue;
    }

    if(r.payment_type === 'Cash'){
      cash_spend += Number(r.cost_cash || 0);
    }else{
      miles_used += Number(r.cost_miles || 0);
      award_fees += Number(r.fees || 0);
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

  return { rows, totals: { cash_spend, miles_used, award_fees } };
}

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(request, env);
  if(!a.ok) return badRequest('Not authenticated', 401);
  const url = new URL(request.url);
  const report = await buildReport(env, url.searchParams);
  return ok(report);
}
