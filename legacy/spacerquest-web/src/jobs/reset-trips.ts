import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.character.updateMany({
    data: {
      tripCount: 0,
      lastTripDate: null
    }
  });
  console.log("Reset trip limits for all characters.");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
