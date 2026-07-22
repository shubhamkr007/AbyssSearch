/**
 * Prove the Docker named volume keeps S4 data across container restarts.
 * Uses Prisma directly (no Nest).
 *
 *   node --env-file=.env scripts/volume-persist-test.mjs
 */
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';

const prefix = `vol${Date.now().toString(36).slice(-6)}`;
const id = randomUUID();

function sh(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitDb(client, timeoutSec = 60) {
  const start = Date.now();
  while ((Date.now() - start) / 1000 < timeoutSec) {
    try {
      await client.$queryRaw`SELECT 1`;
      return;
    } catch {
      await sleep(1000);
    }
  }
  throw new Error('database not reachable in time');
}

function waitHealthy(timeoutSec = 60) {
  const start = Date.now();
  while ((Date.now() - start) / 1000 < timeoutSec) {
    try {
      const h = sh('wsl -e docker inspect -f "{{.State.Health.Status}}" es-postgres');
      if (h === 'healthy') return;
    } catch {
      /* still starting */
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1000);
  }
  throw new Error('postgres not healthy in time');
}

const prisma = new PrismaClient();
try {
  await waitDb(prisma);
  await prisma.tenant.create({
    data: { id, name: 'Volume Persist Test', prefix },
  });
  console.log('created', id, prefix);

  console.log('restarting es-postgres container…');
  sh('wsl -e docker restart es-postgres');
  waitHealthy();
  await prisma.$disconnect();

  const prisma2 = new PrismaClient();
  await waitDb(prisma2);
  const found = await prisma2.tenant.findUnique({ where: { id } });
  if (!found || found.prefix !== prefix) {
    console.error('MISSING after container restart', { id, found });
    process.exitCode = 1;
  } else {
    console.log('VOLUME PERSISTENCE OK', found.id, found.prefix);
  }
  await prisma2.$disconnect();
} catch (err) {
  console.error(err);
  process.exitCode = 1;
  await prisma.$disconnect().catch(() => undefined);
}
