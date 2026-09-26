# EVNLY

Split costs with anyone — no account needed. [getevnly.com](https://getevnly.com)

Next.js (App Router) on Vercel, Supabase Postgres as the backend.

## Running locally

```sh
cp .env.example .env.local   # points at the EVNLY-App Supabase project
npm install
npm run dev
```

`npm test` runs the money/splitting unit tests; `npm run typecheck` runs tsc.

## Routes

| Route | Screen |
|---|---|
| `/` | Landing — start a split or open an existing link |
| `/new` | Name the split and add people (names only) |
| `/g/[slug]` | Group view — balances, expenses, invite, settle up. First visit on a device asks "Which one are you?" |
| `/g/[slug]/expense/new` | Add an expense, split evenly or by custom amounts |

## Data model and access

Schema lives in `supabase/migrations/`. Tables: `groups`, `people`, `expenses`,
`expense_splits`, `settlements`. Money is integer cents everywhere.

There is no login. A group's 12-character random `slug` is the access key: anyone
with the link can view and edit that split. Tables have RLS enabled and no grants
for the `anon`/`authenticated` roles, so they can't be read or listed directly.
The app calls slug-scoped `SECURITY DEFINER` functions via `supabase.rpc`:

- `create_group(name, organizer_name, other_names[])` → `{slug, person_id}`
- `get_group(slug)` → group, people, expenses + splits, settlements, pairwise balances
- `add_person(slug, name)`, `claim_person(slug, person_id)`
- `add_expense(slug, paid_by, description, amount_cents, split_type, participants[], shares[]?)`
- `record_settlement(slug, from, to, amount_cents)`

Which person "you" are is remembered per device in localStorage.

Groups auto-archive (become read-only) `archive_after_days` (default 14) after the
last expense. This is computed on read, so no cron job is needed.
