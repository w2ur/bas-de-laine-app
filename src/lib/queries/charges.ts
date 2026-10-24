import { prisma } from "@/lib/prisma";

export async function getRecurringCharges(householdId: string) {
  return prisma.recurringCharge.findMany({
    where: { householdId },
    orderBy: { dayOfMonth: "asc" },
  });
}
