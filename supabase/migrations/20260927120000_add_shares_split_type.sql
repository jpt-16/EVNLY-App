-- New enum values can't be used in the transaction that adds them, so this
-- lives in its own migration ahead of the add_expense change.
alter type public.split_type add value if not exists 'shares';
