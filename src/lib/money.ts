/** One place for rupees. Indian numbering system — ₹1,20,000, never ₹120,000. */
const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function rupees(amount: number | null | undefined): string {
  return inr.format(Number(amount ?? 0));
}
