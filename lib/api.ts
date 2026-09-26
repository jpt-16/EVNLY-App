import { createClient } from "@supabase/supabase-js";
import type { Group, SplitType } from "./types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
}

// No auth: every call goes through a slug-gated Postgres function.
const supabase = createClient(url, key, { auth: { persistSession: false } });

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

export function createGroup(name: string, organizerName: string, otherNames: string[]) {
  return rpc<{ slug: string; person_id: string }>("create_group", {
    p_name: name,
    p_organizer_name: organizerName,
    p_other_names: otherNames,
  });
}

export function getGroup(slug: string) {
  return rpc<Group | null>("get_group", { p_slug: slug });
}

export function addPerson(slug: string, name: string) {
  return rpc<string>("add_person", { p_slug: slug, p_name: name });
}

export function claimPerson(slug: string, personId: string) {
  return rpc<void>("claim_person", { p_slug: slug, p_person_id: personId });
}

export function addExpense(args: {
  slug: string;
  paidBy: string;
  description: string;
  amountCents: number;
  splitType: SplitType;
  participants: string[];
  shares?: number[]; // custom splits only: cents, parallel to participants
  shareWeights?: number[]; // shares splits only: weights, parallel to participants
}) {
  return rpc<string>("add_expense", {
    p_slug: args.slug,
    p_paid_by: args.paidBy,
    p_description: args.description,
    p_amount_cents: args.amountCents,
    p_split_type: args.splitType,
    p_participants: args.participants,
    p_shares: args.splitType === "custom" ? args.shares : null,
    p_share_weights: args.splitType === "shares" ? args.shareWeights : null,
  });
}

export function recordSettlement(slug: string, from: string, to: string, amountCents: number) {
  return rpc<string>("record_settlement", {
    p_slug: slug,
    p_from: from,
    p_to: to,
    p_amount_cents: amountCents,
  });
}
