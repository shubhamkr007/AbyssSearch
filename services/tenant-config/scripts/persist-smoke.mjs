/**
 * Smoke test: create a tenant via HTTP, restart is done externally, then
 * re-list and confirm the same id still exists (Postgres persistence).
 *
 * Usage:
 *   node --env-file=.env scripts/persist-smoke.mjs create
 *   node --env-file=.env scripts/persist-smoke.mjs check <tenantId>
 */
const base = process.env.S4_URL ?? 'http://127.0.0.1:8001';
const token = process.env.ADMIN_TOKEN ?? 'dev-admin-token';
const [cmd, arg] = process.argv.slice(2);

async function req(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!res.ok) {
    throw new Error(`${method} ${path} -> ${res.status}: ${text}`);
  }
  return data;
}

if (cmd === 'create') {
  const prefix = `pg${Date.now().toString(36).slice(-6)}`;
  const tenant = await req('POST', '/tenants', { name: 'Persist Smoke', prefix });
  console.log(JSON.stringify({ id: tenant.id, prefix: tenant.prefix }));
} else if (cmd === 'check') {
  if (!arg) throw new Error('usage: check <tenantId>');
  const tenants = await req('GET', '/tenants');
  const found = tenants.find((t) => t.id === arg);
  if (!found) {
    console.error('MISSING', arg);
    process.exit(1);
  }
  console.log('FOUND', found.id, found.prefix, found.name);
} else if (cmd === 'ready') {
  const res = await fetch(`${base}/readyz`);
  const body = await res.json();
  console.log(res.status, JSON.stringify(body));
  if (res.status !== 200) process.exit(1);
} else {
  throw new Error('usage: create | check <id> | ready');
}
