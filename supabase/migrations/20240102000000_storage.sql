-- Create a private storage bucket for resumes
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'resumes', 
  'resumes', 
  false, 
  5242880, -- 5 MB limit
  array['application/pdf']
)
on conflict (id) do nothing;

-- Allow candidates to upload CVs to their own directory inside the "resumes" bucket
-- Example path format: <user_id>/resume_v1.pdf
drop policy if exists "Candidates can upload their own CV" on storage.objects;
create policy "Candidates can upload their own CV"
  on storage.objects for insert
  with check (
    bucket_id = 'resumes' and 
    auth.uid() = owner and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow candidates to read their own CVs
drop policy if exists "Candidates can view their own CV" on storage.objects;
create policy "Candidates can view their own CV"
  on storage.objects for select
  using (
    bucket_id = 'resumes' and 
    auth.uid() = owner and
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow candidates to delete their own CVs
drop policy if exists "Candidates can delete their own CV" on storage.objects;
create policy "Candidates can delete their own CV"
  on storage.objects for delete
  using (
    bucket_id = 'resumes' and 
    auth.uid() = owner and
    (storage.foldername(name))[1] = auth.uid()::text
  );
