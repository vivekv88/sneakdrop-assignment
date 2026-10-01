import { prisma } from "@/src/lib/prisma";
import { DROP_NAME } from "@/src/lib/constants";

async function main() {
  await prisma.sneaker.deleteMany({ where: { name: { startsWith: DROP_NAME } } });
  const sneakers = await Promise.all(Array.from({ length: 20 }, (_, index) => prisma.sneaker.create({ data: {
      name: `${DROP_NAME} - Pair ${String(index + 1).padStart(2, "0")}`,
      totalStock: 1,
      availableStock: 1,
      soldStock: 0,
    } })));

  await prisma.user.deleteMany({
    where: {
      email: {
        startsWith: "demo",
        endsWith: "@example.com",
      },
    },
  });

  const users = await Promise.all(Array.from({ length: 100 }, (_, index) => prisma.user.create({ data: {
      name: `Demo User ${index + 1}`,
      email: `demo${index + 1}@example.com`,
    } })));

  console.log(
    JSON.stringify(
      {
        sneakerIds: sneakers.map((sneaker) => sneaker.id),
        userIds: users.slice(0, 5).map((user) => user.id),
        usersCreated: users.length,
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error("❌ Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });