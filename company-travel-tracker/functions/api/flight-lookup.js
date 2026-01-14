import { requireAuth, ok, badRequest } from '../_lib/auth.js';

function ymd(dateStr){
  // normalize YYYY-MM-DD
  if(!dateStr) return null;
  return dateStr.slice(0,10);
}

function pickBestFlight(flights, flight_date){
  // choose flight whose scheduled departure date (UTC date portion) matches flight_date if possible,
  // else pick closest by absolute time difference.
  const target = new Date(flight_date + 'T12:00:00Z').getTime();
  let best = null;
  let bestScore = Infinity;

  for(const f of flights){
    const tStr = f.scheduled_out || f.scheduled_off || f.scheduled_departure || f.estimated_out || f.actual_out || f.filed_departure_time;
    const t = tStr ? new Date(tStr).getTime() : NaN;
    const d = tStr ? tStr.slice(0,10) : null;

    let score;
    if(d && d === flight_date) score = 0;
    else if(!Number.isNaN(t)) score = Math.abs(t - target) / 1000;
    else score = 1e12;

    if(score < bestScore){
      bestScore = score;
      best = f;
    }
  }
  return best;
}

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(request, env);
  if(!a.ok) return badRequest('Not authenticated', 401);

  const url = new URL(request.url);
  const flight_number = (url.searchParams.get('flight_number') || '').trim();
  const flight_date = ymd(url.searchParams.get('flight_date') || '');

  if(!flight_number || !flight_date) return badRequest('flight_number and flight_date are required');

  if(!env.FLIGHTAWARE_APIKEY) return badRequest('Server missing FLIGHTAWARE_APIKEY secret', 500);

  // Use GET /flights/{ident} and choose the flight nearest to that date
  // Base URL per AeroAPI OpenAPI spec: https://aeroapi.flightaware.com/aeroapi (server variable) and x-apikey header
  const ident = encodeURIComponent(flight_number);
  const apiUrl = `https://aeroapi.flightaware.com/aeroapi/flights/${ident}?max_pages=1`;

  const res = await fetch(apiUrl, {
    headers: {
      'x-apikey': env.FLIGHTAWARE_APIKEY,
      'Accept': 'application/json'
    }
  });

  if(!res.ok){
    const text = await res.text();
    return badRequest(`FlightAware lookup failed (${res.status}). ${text.slice(0,180)}`, 502);
  }

  const data = await res.json();
  const flights = data.flights || [];

  if(!flights.length){
    return badRequest('No flights returned for this ident. Try a different format (e.g. include airline code).', 404);
  }

  const best = pickBestFlight(flights, flight_date);
  if(!best) return badRequest('Could not match flight to that date', 404);

  const out = {
    flight_number,
    flight_date,
    origin: best.origin?.code_iata || best.origin?.code || null,
    destination: best.destination?.code_iata || best.destination?.code || null,
    sched_departure: best.scheduled_out || best.scheduled_off || null,
    sched_arrival: best.scheduled_in || best.scheduled_on || null,
    aircraft_type: best.aircraft_type || null,
    airline: best.operator || best.ident_icao?.slice(0,3) || null
  };

  return ok({ flight: out });
}
