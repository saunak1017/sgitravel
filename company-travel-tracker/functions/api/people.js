import { requireAuth, ok, badRequest } from '../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const a = await requireAuth(request, env);
  if(!a.ok) return badRequest('Not authenticated', 401);

  const { results } = await env.DB.prepare(
    'SELECT id, name, active FROM people ORDER BY active DESC, name ASC'
  ).all();
  return ok({ people: results });
}

export async function onRequestPost({ request, env }) {
  const a = await requireAuth(request, env);
  if(!a.ok) return badRequest('Not authenticated', 401);

  const body = await request.json().catch(()=>null);
  const name = (body?.name || '').trim();
  if(!name) return badRequest('Name required');

  try{
    const r = await env.DB.prepare('INSERT INTO people (name) VALUES (?)').bind(name).run();
    const person = { id: r.meta.last_row_id, name, active: 1 };
    return ok({ person });
  }catch(e){
    return badRequest('Could not add person (maybe duplicate name?)', 400);
  }
}
