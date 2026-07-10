import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.ship.updateMany({
    data: {
      hullStrength: 5, hullCondition: 10,
      driveStrength: 5, driveCondition: 10,
      cabinStrength: 1, cabinCondition: 10,
      lifeSupportStrength: 5, lifeSupportCondition: 10,
      weaponStrength: 1, weaponCondition: 10,
      navigationStrength: 5, navigationCondition: 10,
      roboticsStrength: 1, roboticsCondition: 10,
      shieldStrength: 1, shieldCondition: 10,
      fuel: 50, cargoPods: 0, maxCargoPods: 1,
    }
  });
  console.log("Updated all ships to starting scout stats.");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
