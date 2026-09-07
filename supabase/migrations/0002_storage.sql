-- Private storage bucket for trade screenshots. Not public: screenshots may
-- show account balances/numbers, so access goes through RLS (scoped by the
-- uploading user's id as the first path segment, e.g. "<user_id>/<file>")
-- plus short-lived signed URLs generated on read (see lib/supabase/storage.ts),
-- never a permanent public link.

insert into storage.buckets (id, name, public)
values ('screenshots', 'screenshots', false)
on conflict (id) do nothing;

create policy "screenshots are owner-only (select)"
  on storage.objects for select
  using (bucket_id = 'screenshots' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "screenshots are owner-only (insert)"
  on storage.objects for insert
  with check (bucket_id = 'screenshots' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "screenshots are owner-only (delete)"
  on storage.objects for delete
  using (bucket_id = 'screenshots' and auth.uid()::text = (storage.foldername(name))[1]);
