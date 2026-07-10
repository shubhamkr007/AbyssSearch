import { PrismaClient } from '@prisma/client';

import { generateApiKey, hashApiKey } from '../src/keys/api-key.util';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const prefix = 'acme';

  const tenant =
    (await prisma.tenant.findUnique({ where: { prefix } })) ??
    (await prisma.tenant.create({ data: { name: 'ACME Corp', prefix } }));

  await prisma.searchConfig.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      synonyms: [{ input: ['k8s', 'kubernetes'] }],
      boosts: { title: 2, recency: 1 },
      facets: ['type', 'source'],
      suggestConfig: { fuzziness: 'AUTO', size: 5 },
    },
    update: {},
  });

  await prisma.tabConfig.deleteMany({ where: { tenantId: tenant.id } });
  await prisma.tabConfig.createMany({
    data: [
      { tenantId: tenant.id, tabKey: 'all', label: 'All', position: 0 },
      { tenantId: tenant.id, tabKey: 'documents', label: 'Documents', position: 1 },
      { tenantId: tenant.id, tabKey: 'news', label: 'News', position: 2 },
      { tenantId: tenant.id, tabKey: 'images', label: 'Images', position: 3 },
    ],
  });

  const existingSource = await prisma.source.findFirst({
    where: { tenantId: tenant.id, name: 'Demo Wiki' },
  });
  if (!existingSource) {
    await prisma.source.create({
      data: {
        tenantId: tenant.id,
        type: 'document',
        name: 'Demo Wiki',
        connectorConfig: { root: '/docs' },
        enabled: true,
      },
    });
  }

  const { plaintext, keyPrefix } = generateApiKey();
  const keyHash = await hashApiKey(plaintext);
  await prisma.apiKey.create({
    data: {
      tenantId: tenant.id,
      keyPrefix,
      keyHash,
      scopes: ['search', 'suggest'],
      originAllowlist: ['http://localhost:3000'],
      rateLimit: 120,
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded tenant ${tenant.id} (prefix="${prefix}")`);
  // eslint-disable-next-line no-console
  console.log(`Demo API key (shown once, save it): ${plaintext}`);
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
