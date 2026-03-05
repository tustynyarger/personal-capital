// src/lib/parser.ts

export type ParsedCommand =
  | {
      kind: "income";
      amount: number;
      description: string;
      categoryGuess: { category: string };
    }
  | {
      kind: "expense";
      amount: number;
      description: string;
      categoryGuess: { category: string };
    }
  | {
      kind: "buy";
      ticker: string;
      quantity?: number;
      price?: number;
      amount?: number; // dollar mode
      accountHint?: string; // roth / brokerage / etc
    }
  | { kind: "unknown"; reason: string };

export function parseCommand(input: string): ParsedCommand {
  const raw = input.trim();
  const tokens = raw.split(/\s+/).filter(Boolean);

  if (tokens.length === 0) return { kind: "unknown", reason: "Empty input" };

  const first = tokens[0].toLowerCase();

  // BUY
  if (first === "buy") {

    // buy 10 vti 220
    if (
      tokens.length >= 4 &&
      !isNaN(Number(tokens[1])) &&
      !isNaN(Number(tokens[3]))
    ) {
      return {
        kind: "buy",
        quantity: Number(tokens[1]),
        ticker: tokens[2].toUpperCase(),
        price: Number(tokens[3]),
        accountHint: tokens[4]?.toLowerCase(),
      };
    }
  
    // buy vti 300 roth
    if (
      tokens.length >= 3 &&
      isNaN(Number(tokens[1])) &&
      !isNaN(Number(tokens[2]))
    ) {
      return {
        kind: "buy",
        ticker: tokens[1].toUpperCase(),
        amount: Number(tokens[2]),
        accountHint: tokens[3]?.toLowerCase(),
      };
    }
  
    return { kind: "unknown", reason: "Invalid buy format" };
  }

  // Keyword → category mapping for quick expense typing
  const keywordCategory: Record<string, string> = {
    groceries: "Groceries",
    rent: "Housing",
    gas: "Gas",
    food: "Food",
    coffee: "Food",
    uber: "Travel",
    flight: "Travel",
    tax: "Taxes",
    commission: "Revenue",
  };

  // Numeric-first income/expense
  if (!isNaN(Number(tokens[0]))) {
    const amount = Number(tokens[0]);
    const description = tokens.slice(1).join(" ").trim();
    const d = description.toLowerCase();

    const incomeKeywords = ["commission", "revenue", "closing", "income", "sale"];
    const isIncome = incomeKeywords.some((k) => d.includes(k));

    if (isIncome) {
      return {
        kind: "income",
        amount,
        description,
        categoryGuess: {
          category: keywordCategory["commission"] ?? "Revenue",
        },
      };
    }

    // Try to guess a more specific expense category from keywords
    let guessedCategory = "General";
    for (const [keyword, category] of Object.entries(keywordCategory)) {
      if (d.includes(keyword) && category !== "Revenue") {
        guessedCategory = category;
        break;
      }
    }

    return {
      kind: "expense",
      amount,
      description,
      categoryGuess: { category: guessedCategory },
    };
  }

  return { kind: "unknown", reason: "Unrecognized command" };
}