export type TransactionType = "FILL" | "SPEND" | "TRANSFER_IN" | "TRANSFER_OUT";

/**
 * How a transaction reads in a ledger row. The sign and its colour carry the
 * kind (DESIGN.md: terracotta for money out, blue for money in), so a row has
 * no type badge; the kind's name is only spelled out in the row's sheet.
 */
export function transactionDisplay(type: TransactionType): {
  sign: "-" | "+";
  direction: "out" | "in";
  kind: string;
} {
  switch (type) {
    case "SPEND":
      return { sign: "-", direction: "out", kind: "Dépense" };
    case "TRANSFER_OUT":
      return { sign: "-", direction: "out", kind: "Transfert envoyé" };
    case "FILL":
      return { sign: "+", direction: "in", kind: "Remplissage" };
    case "TRANSFER_IN":
      return { sign: "+", direction: "in", kind: "Transfert reçu" };
  }
}
