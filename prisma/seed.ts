import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  // Upsert household
  const household = await prisma.household.upsert({
    where: { id: "default-household" },
    update: {},
    create: {
      id: "default-household",
      income: 5000,
    },
  });

  console.log("✓ Household created (income:", Number(household.income), ")");

  // ─── Envelopes ──────────────────────────────────────────

  const envelopes = [
    { name: "Courses", monthlyBudget: 600, icon: "🛒", color: "#22c55e", sortOrder: 1 },
    { name: "Loisirs", monthlyBudget: 400, icon: "🎉", color: "#f59e0b", sortOrder: 2 },
    { name: "Transport", monthlyBudget: 200, icon: "🚌", color: "#3b82f6", sortOrder: 3 },
    { name: "Café / Resto", monthlyBudget: 150, icon: "☕", color: "#92400e", sortOrder: 4 },
  ];

  for (const env of envelopes) {
    await prisma.envelope.upsert({
      where: { householdId_name: { householdId: household.id, name: env.name } },
      update: { monthlyBudget: env.monthlyBudget, icon: env.icon, color: env.color, sortOrder: env.sortOrder },
      create: { householdId: household.id, ...env },
    });
  }

  console.log(`✓ ${envelopes.length} envelopes created`);

  // ─── Recurring Charges ────────────────────────────────

  const charges = [
    { name: "Loyer", amount: 1200.00, dayOfMonth: 5 },
    { name: "Énergie", amount: 120.00, dayOfMonth: 3 },
    { name: "Assurance habitation", amount: 45.00, dayOfMonth: 8 },
    { name: "Transport", amount: 85.00, dayOfMonth: 1 },
    { name: "Internet + TV", amount: 50.00, dayOfMonth: 4 },
    { name: "Abonnements", amount: 30.00, dayOfMonth: 12 },
    { name: "Forfait mobile", amount: 20.00, dayOfMonth: 20 },
    { name: "Salle de sport", amount: 35.00, dayOfMonth: 1 },
    { name: "Mutuelle", amount: 50.00, dayOfMonth: 1 },
  ];

  for (const charge of charges) {
    const existing = await prisma.recurringCharge.findFirst({
      where: { householdId: household.id, name: charge.name },
    });

    if (existing) {
      await prisma.recurringCharge.update({
        where: { id: existing.id },
        data: { amount: charge.amount, dayOfMonth: charge.dayOfMonth },
      });
    } else {
      await prisma.recurringCharge.create({
        data: { householdId: household.id, ...charge },
      });
    }
  }

  console.log(`✓ ${charges.length} recurring charges created`);

  // ─── Treasury ─────────────────────────────────────────

  await prisma.treasury.upsert({
    where: { householdId: household.id },
    update: {},
    create: {
      householdId: household.id,
      balance: 0,
    },
  });

  console.log("✓ Treasury created (balance: 0)");

  console.log("\n🎉 Seed completed successfully!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
