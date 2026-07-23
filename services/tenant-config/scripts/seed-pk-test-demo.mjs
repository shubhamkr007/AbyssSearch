import { PrismaClient } from "@prisma/client";
import { hashApiKey, keyPrefixOf } from "../dist/keys/api-key.util.js";

const prisma = new PrismaClient();
const PLAIN = "pk_test_demo";

async function main() {
  const prefix = "demo";
  const tenant =
    (await prisma.tenant.findUnique({ where: { prefix } })) ??
    (await prisma.tenant.create({
      data: { name: "Demo", prefix, status: "active" },
    }));

  await prisma.searchConfig.upsert({
    where: { tenantId: tenant.id },
    create: {
      tenantId: tenant.id,
      synonyms: [],
      boosts: {},
      facets: ["tags", "source"],
      suggestConfig: { size: 8 },
    },
    update: {},
  });

  const tabs = await prisma.tabConfig.count({ where: { tenantId: tenant.id } });
  if (tabs === 0) {
    await prisma.tabConfig.createMany({
      data: [
        { tenantId: tenant.id, tabKey: "all", label: "All", position: 0 },
        { tenantId: tenant.id, tabKey: "documents", label: "Documents", position: 1 },
      ],
    });
  }

  const keyPrefix = keyPrefixOf(PLAIN);
  const existing = await prisma.apiKey.findFirst({
    where: { tenantId: tenant.id, keyPrefix },
  });
  if (existing) {
    await prisma.apiKey.update({
      where: { id: existing.id },
      data: {
        keyHash: await hashApiKey(PLAIN),
        scopes: ["search", "rag", "suggest"],
        active: true,
        rateLimit: 120,
        originAllowlist: [],
      },
    });
  } else {
    await prisma.apiKey.create({
      data: {
        tenantId: tenant.id,
        keyPrefix,
        keyHash: await hashApiKey(PLAIN),
        scopes: ["search", "rag", "suggest"],
        originAllowlist: [],
        rateLimit: 120,
        active: true,
      },
    });
  }

  console.log(JSON.stringify({ tenantId: tenant.id, prefix: tenant.prefix, key: PLAIN }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
