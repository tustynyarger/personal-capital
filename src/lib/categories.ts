export type CategoryGuess = { category: string; confidence: "high" | "low" };

const RULES: Array<{ contains: string[]; category: string }> = [
  { contains: ["gas", "fuel", "shell", "bp"], category: "Auto: Gas" },
  { contains: ["grocer", "meijer", "kroger", "walmart", "costco"], category: "Food: Groceries" },
  { contains: ["audible", "spotify", "netflix", "prime"], category: "Subscriptions" },
  { contains: ["rent", "lease"], category: "Housing" },
  { contains: ["phone", "verizon", "att"], category: "Utilities: Phone" },
  { contains: ["commission", "closing"], category: "Income: Real Estate" },
];

export const CATEGORY_OPTIONS = [
  "Income: Real Estate",
  "Income: Other",
  "Auto: Gas",
  "Food: Groceries",
  "Food: Dining",
  "Subscriptions",
  "Housing",
  "Utilities: Phone",
  "Utilities: Internet",
  "Health",
  "Education",
  "Shopping",
  "Travel",
  "Other",
];

export function guessCategory(input: string, kind: "income" | "expense"): CategoryGuess {
  const s = input.toLowerCase();

  for (const r of RULES) {
    if (r.contains.some((c) => s.includes(c))) {
      return { category: r.category, confidence: "high" };
    }
  }

  // fallbacks
  if (kind === "income") return { category: "Income: Other", confidence: "low" };
  return { category: "Other", confidence: "low" };
}