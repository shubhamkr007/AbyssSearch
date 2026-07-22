import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
try {
  await prisma.$queryRaw`SELECT 1`;
  console.log('prisma-ok');
} catch (err) {
  console.error('prisma-fail', err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
