import { prisma } from "@/lib/prisma";

export async function getTreasury(householdId: string) {
  const treasury = await prisma.treasury.findUnique({
    where: { householdId },
    include: {
      adjustments: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
      pools: {
        orderBy: { order: "asc" },
      },
    },
  });

  if (!treasury) return null;

  const pools = treasury.pools.map((p) => ({
    id: p.id,
    name: p.name,
    availability: p.availability,
    amount: Number(p.amount),
    order: p.order,
  }));

  const poolsTotal = pools.reduce((sum, p) => sum + p.amount, 0);

  return {
    id: treasury.id,
    balance: Number(treasury.balance),
    adjustments: treasury.adjustments.map((a) => ({
      id: a.id,
      amount: Number(a.amount),
      type: a.type,
      label: a.label,
      createdAt: a.createdAt,
    })),
    pools,
    poolsTotal,
  };
}
