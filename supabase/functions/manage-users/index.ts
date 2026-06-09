// Edge Function : gestion des comptes (création / édition / suppression).
// Tourne avec la clé service_role et vérifie que l'appelant a la permission
// `manage_accounts`. Déploiement : supabase functions deploy manage-users
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const authHeader = req.headers.get('Authorization') ?? '';

    // Vérifie l'identité + la permission manage_accounts de l'appelant.
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: uErr } = await caller.auth.getUser();
    if (uErr || !user) return json({ error: 'unauthorized' }, 401);

    const { data: canManage } = await caller.rpc('has_perm', { perm: 'manage_accounts' });
    if (canManage !== true) return json({ error: 'forbidden' }, 403);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (action === 'list') {
      const { data, error } = await admin
        .from('profiles')
        .select('id,email,role,permissions,created_at')
        .order('created_at', { ascending: true });
      if (error) return json({ error: error.message }, 400);
      return json({ users: data ?? [] });
    }

    if (action === 'create') {
      const { email, password, permissions } = body;
      if (!email || !password) return json({ error: 'Email et mot de passe requis' }, 400);
      const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) return json({ error: error.message }, 400);
      await admin.from('profiles').upsert({ id: created.user.id, email, role: 'agent', permissions: permissions ?? {} });
      return json({ ok: true, id: created.user.id });
    }

    if (action === 'update') {
      const { id, permissions, password } = body;
      if (!id) return json({ error: 'id requis' }, 400);
      if (permissions) {
        const { error } = await admin.from('profiles').update({ permissions }).eq('id', id);
        if (error) return json({ error: error.message }, 400);
      }
      if (password) {
        const { error } = await admin.auth.admin.updateUserById(id, { password });
        if (error) return json({ error: error.message }, 400);
      }
      return json({ ok: true });
    }

    if (action === 'delete') {
      const { id } = body;
      if (!id) return json({ error: 'id requis' }, 400);
      if (id === user.id) return json({ error: 'Impossible de supprimer votre propre compte' }, 400);
      const { error } = await admin.auth.admin.deleteUser(id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Action inconnue' }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
