// Shape of the JSON returned by the get_group() Postgres function.

export type SplitType = "even" | "custom" | "shares";
export type SettlementMethod = "manual" | "venmo" | "cashapp" | "other";

export interface Person {
  id: string;
  display_name: string;
  is_organizer: boolean;
  claimed: boolean;
}

export interface ExpenseSplit {
  person_id: string;
  share_cents: number;
}

export interface Expense {
  id: string;
  paid_by: string;
  description: string;
  amount_cents: number;
  split_type: SplitType;
  created_at: string;
  splits: ExpenseSplit[];
}

export interface Settlement {
  id: string;
  from_person: string;
  to_person: string;
  amount_cents: number;
  method: SettlementMethod;
  created_at: string;
}

// from_person owes to_person amount_cents (already netted per pair).
export interface Balance {
  from_person: string;
  to_person: string;
  amount_cents: number;
}

export interface Group {
  id: string;
  slug: string;
  name: string;
  currency: string;
  archive_after_days: number;
  last_activity_at: string;
  archives_at: string;
  is_archived: boolean;
  created_at: string;
  people: Person[];
  expenses: Expense[];
  settlements: Settlement[];
  balances: Balance[];
}
