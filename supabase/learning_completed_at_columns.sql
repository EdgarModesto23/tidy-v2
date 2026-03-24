-- Optional completion tracking for programs and modules (run in Supabase SQL Editor).

ALTER TABLE public.learning_programs
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE public.learning_modules
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;
