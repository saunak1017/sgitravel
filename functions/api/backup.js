import { requireAuth, badRequest } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(request, env);
  if(!a.ok) return badRequest('Not authenticated', 401);

  const people = (await env.DB.prepare('SELECT * FROM people').all()).results;
  const bookings = (await env.DB.prepare('SELECT * FROM bookings').all()).results;
  const segments = (await env.DB.prepare('SELECT * FROM segments').all()).results;
  const traveler_bookings = (await env.DB.prepare('SELECT * FROM traveler_bookings').all()).results;

  const payload = { exported_at: new Date().toISOString(), people, bookings, segments, traveler_bookings };

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': 'attachment; filename="travel-backup.json"'
    }
  });
}
