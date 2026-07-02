/* ============================================================
   Valiant Movement — Finance mock data (Super Admin treasury)
   Naira figures. Shaped to swap for a real ledger / payments
   provider later. Demoable without the database.
   ============================================================ */

export function naira(n: number, compact = false): string {
  if (compact) {
    if (Math.abs(n) >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (Math.abs(n) >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`;
  }
  return "₦" + n.toLocaleString("en-NG");
}

export interface MonthPoint {
  month: string;
  income: number;
  expense: number;
}

/** 12-month cashflow series for the overview chart. */
export const cashflow: MonthPoint[] = [
  { month: "Jul", income: 2_400_000, expense: 1_500_000 },
  { month: "Aug", income: 3_100_000, expense: 1_800_000 },
  { month: "Sep", income: 2_800_000, expense: 2_100_000 },
  { month: "Oct", income: 4_200_000, expense: 2_400_000 },
  { month: "Nov", income: 3_900_000, expense: 2_000_000 },
  { month: "Dec", income: 5_600_000, expense: 3_100_000 },
  { month: "Jan", income: 4_800_000, expense: 2_700_000 },
  { month: "Feb", income: 5_200_000, expense: 2_900_000 },
  { month: "Mar", income: 6_100_000, expense: 3_400_000 },
  { month: "Apr", income: 5_400_000, expense: 3_000_000 },
  { month: "May", income: 6_800_000, expense: 3_600_000 },
  { month: "Jun", income: 7_450_000, expense: 3_180_000 },
];

export const treasury = {
  balance: 28_640_000,
  monthIncome: 7_450_000,
  monthExpense: 3_180_000,
  pendingPayouts: 1_240_000,
  incomeChange: 12.4,
  expenseChange: 6.0,
  balanceChange: 9.1,
};

export type TxnType = "income" | "expense";
export type TxnStatus = "completed" | "pending" | "failed";

export interface Transaction {
  id: string;
  date: string;
  party: string;
  category: string;
  method: string;
  type: TxnType;
  amount: number;
  status: TxnStatus;
}

export const transactions: Transaction[] = [
  { id: "TXN-10481", date: "28 Jun 2026", party: "Adaeze Okonkwo", category: "Membership dues", method: "Card", type: "income", amount: 5_000, status: "completed" },
  { id: "TXN-10480", date: "28 Jun 2026", party: "Lagos State Chapter", category: "Fundraising", method: "Transfer", type: "income", amount: 1_250_000, status: "completed" },
  { id: "TXN-10479", date: "27 Jun 2026", party: "Eagle Print Ltd.", category: "Campaign materials", method: "Transfer", type: "expense", amount: 480_000, status: "completed" },
  { id: "TXN-10478", date: "27 Jun 2026", party: "Ibrahim Suleiman", category: "Donation", method: "Card", type: "income", amount: 100_000, status: "completed" },
  { id: "TXN-10477", date: "26 Jun 2026", party: "Venue — Enugu Town Hall", category: "Gatherings", method: "Transfer", type: "expense", amount: 320_000, status: "pending" },
  { id: "TXN-10476", date: "26 Jun 2026", party: "Aisha Mohammed", category: "Membership dues", method: "USSD", type: "income", amount: 5_000, status: "completed" },
  { id: "TXN-10475", date: "25 Jun 2026", party: "DataReach SMS", category: "Outreach / SMS", method: "Card", type: "expense", amount: 145_000, status: "completed" },
  { id: "TXN-10474", date: "25 Jun 2026", party: "Kano State Chapter", category: "Fundraising", method: "Transfer", type: "income", amount: 880_000, status: "completed" },
  { id: "TXN-10473", date: "24 Jun 2026", party: "Coordinator stipends", category: "Stipends", method: "Bulk transfer", type: "expense", amount: 1_500_000, status: "completed" },
  { id: "TXN-10472", date: "24 Jun 2026", party: "Anonymous", category: "Donation", method: "Card", type: "income", amount: 50_000, status: "failed" },
];

export interface Campaign {
  id: string;
  name: string;
  goal: number;
  raised: number;
  donors: number;
  status: "active" | "completed";
}

export const campaigns: Campaign[] = [
  { id: "cmp1", name: "2026 Mobilization Drive", goal: 20_000_000, raised: 14_200_000, donors: 3_412, status: "active" },
  { id: "cmp2", name: "Ward Town Halls Fund", goal: 6_000_000, raised: 5_280_000, donors: 1_204, status: "active" },
  { id: "cmp3", name: "Youth Leadership Bootcamp", goal: 4_000_000, raised: 4_000_000, donors: 980, status: "completed" },
  { id: "cmp4", name: "Voter Education Outreach", goal: 8_000_000, raised: 2_640_000, donors: 642, status: "active" },
];

export interface Budget {
  category: string;
  allocated: number;
  spent: number;
}

export const budgets: Budget[] = [
  { category: "Coordinator stipends", allocated: 6_000_000, spent: 4_500_000 },
  { category: "Gatherings & venues", allocated: 4_000_000, spent: 2_840_000 },
  { category: "Campaign materials", allocated: 3_000_000, spent: 2_960_000 },
  { category: "Outreach & SMS", allocated: 2_000_000, spent: 1_180_000 },
  { category: "Technology & ops", allocated: 2_500_000, spent: 900_000 },
];

export type PayoutStatus = "scheduled" | "pending" | "paid";

export interface Payout {
  id: string;
  payee: string;
  purpose: string;
  chapter: string;
  amount: number;
  date: string;
  status: PayoutStatus;
}

export const payouts: Payout[] = [
  { id: "PO-3021", payee: "Lagos coordinators (12)", purpose: "Monthly stipends", chapter: "Lagos", amount: 600_000, date: "30 Jun 2026", status: "scheduled" },
  { id: "PO-3020", payee: "Eagle Print Ltd.", purpose: "Banner & flyers", chapter: "National", amount: 480_000, date: "29 Jun 2026", status: "pending" },
  { id: "PO-3019", payee: "Enugu Town Hall", purpose: "Venue balance", chapter: "Enugu", amount: 320_000, date: "28 Jun 2026", status: "pending" },
  { id: "PO-3018", payee: "Kano coordinators (9)", purpose: "Monthly stipends", chapter: "Kano", amount: 450_000, date: "27 Jun 2026", status: "paid" },
  { id: "PO-3017", payee: "DataReach SMS", purpose: "Bulk SMS credits", chapter: "National", amount: 145_000, date: "25 Jun 2026", status: "paid" },
];

export interface Statement {
  period: string;
  opening: number;
  inflow: number;
  outflow: number;
  closing: number;
}

export const statements: Statement[] = [
  { period: "June 2026", opening: 24_370_000, inflow: 7_450_000, outflow: 3_180_000, closing: 28_640_000 },
  { period: "May 2026", opening: 21_570_000, inflow: 6_800_000, outflow: 3_600_000, closing: 24_770_000 },
  { period: "April 2026", opening: 19_170_000, inflow: 5_400_000, outflow: 3_000_000, closing: 21_570_000 },
  { period: "March 2026", opening: 16_470_000, inflow: 6_100_000, outflow: 3_400_000, closing: 19_170_000 },
  { period: "February 2026", opening: 14_170_000, inflow: 5_200_000, outflow: 2_900_000, closing: 16_470_000 },
];

/** Fund split by chapter for the overview breakdown. */
export const chapterFunds = [
  { chapter: "Lagos", amount: 9_200_000, color: "#f7931e" },
  { chapter: "Kano", amount: 6_400_000, color: "#1faa59" },
  { chapter: "FCT — Abuja", amount: 5_100_000, color: "#0ea5e9" },
  { chapter: "Rivers", amount: 4_140_000, color: "#7c3aed" },
  { chapter: "Others", amount: 3_800_000, color: "#a8a098" },
];
