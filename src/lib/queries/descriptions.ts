import { prisma } from "@/lib/prisma";
import { subMonths } from "date-fns";
import { rankDescriptions } from "@/lib/description-suggestions";

export async function getDescriptionSuggestions(householdId: string): Promise<Record<string, string[]>> {
  const since = subMonths(new Date(), 12);

  const transactions = await prisma.envelopeTransaction.findMany({
    where: {
      type: "SPEND",
      description: { not: null },
      date: { gte: since },
      envelope: { householdId },
    },
    select: { envelopeId: true, description: true },
    orderBy: { date: "desc" },
  });

  return rankDescriptions(
    transactions
      .filter((t): t is { envelopeId: string; description: string } => t.description !== null)
  );
}
