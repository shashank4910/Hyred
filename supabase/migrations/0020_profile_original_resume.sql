-- ============================================================
-- 0020_profile_original_resume.sql
-- Keep the last uploaded resume FILE (PDF/DOCX/…) so My Resume
-- can download the exact upload, not a re-styled text PDF.
-- Object path lives in private Storage bucket "resumes".
-- ============================================================

alter table profiles
  add column if not exists resume_original_path text,
  add column if not exists resume_original_filename text,
  add column if not exists resume_original_mime text;

comment on column profiles.resume_original_path is
  'Storage path in resumes bucket for the last uploaded source file';
comment on column profiles.resume_original_filename is
  'Original filename shown on download';
comment on column profiles.resume_original_mime is
  'MIME type of the uploaded file';
