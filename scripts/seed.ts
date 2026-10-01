import { prisma } from "@/src/lib/prisma";
import { DROP_NAME } from "@/src/lib/constants";

async function main() {
  const sneaker = await prisma.sneaker.upsert({
    where: { name: DROP_NAME },
    update: {
      totalStock: 20,
      availableStock: 20,
      soldStock: 0,
    },
    create: {
      name: DROP_NAME,
      totalStock: 20,
      availableStock: 20,
      soldStock: 0,
    },
  });

  await prisma.user.deleteMany({
    where: {
      email: {
        startsWith: "demo",
        endsWith: "@example.com",
      },
    },
  });

  const users = await prisma.user.createManyAndReturn({
    data: Array.from({ length: 100 }, (_, index) => ({
      name: `Demo User ${index + 1}`,
      email: `demo${index + 1}@example.com`,
    })),
  });

  console.log(
    JSON.stringify(
      {
        sneakerId: sneaker.id,
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