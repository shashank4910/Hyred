-- ============================================================
-- 0019_private_resumes_bucket.sql
-- Lock resume PDFs: bucket private + own-folder storage policies.
-- Object path convention: {profile_id}/{matchId}-{name}.pdf
-- App serves files via short-lived signed URLs (service role).
-- ============================================================

update storage.buckets
set public = false
where id = 'resumes';

-- Defense-in-depth: authenticated clients may only touch their own folder.
-- Service-role uploads/signing bypass RLS (existing server pattern).

drop policy if exists "resumes_select_own" on storage.objects;
create policy "resumes_select_own"
on storage.objects for select to authenticated
using (
  bucket_id = 'resumes'
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and (storage.foldername(name))[1] = p.id::text
  )
);

drop policy if exists "resumes_insert_own" on storage.objects;
create policy "resumes_insert_own"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'resumes'
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and (storage.foldername(name))[1] = p.id::text
  )
);

drop policy if exists "resumes_update_own" on storage.objects;
create policy "resumes_update_own"
on storage.objects for update to authenticated
using (
  bucket_id = 'resumes'
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and (storage.foldername(name))[1] = p.id::text
  )
)
with check (
  bucket_id = 'resumes'
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and (storage.foldername(name))[1] = p.id::text
  )
);

drop policy if exists "resumes_delete_own" on storage.objects;
create policy "resumes_delete_own"
on storage.objects for delete to authenticated
using (
  bucket_id = 'resumes'
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and (storage.foldername(name))[1] = p.id::text
  )
);
