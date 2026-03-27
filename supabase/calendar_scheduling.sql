-- Calendar scheduling: module lifecycle, session time slots, user availability.
-- Run in Supabase SQL Editor after existing learning_* tables.

-- ---------------------------------------------------------------------------
-- 1. Module lifecycle (pending | started | completed)
-- ---------------------------------------------------------------------------
ALTER TABLE public.learning_modules
  ADD COLUMN IF NOT EXISTS module_state text NOT NULL DEFAULT 'pending';

ALTER TABLE public.learning_modules
  ADD COLUMN IF NOT EXISTS started_at timestamptz;

ALTER TABLE public.learning_modules
  DROP CONSTRAINT IF EXISTS learning_modules_module_state_check;

ALTER TABLE public.learning_modules
  ADD CONSTRAINT learning_modules_module_state_check
  CHECK (module_state IN ('pending', 'started', 'completed'));

COMMENT ON COLUMN public.learning_modules.module_state IS
  'pending: not started; started: user began module (sessions may be scheduled); completed: module done.';
COMMENT ON COLUMN public.learning_modules.started_at IS
  'When the user started this module; used with module_state.';

UPDATE public.learning_modules
SET module_state = 'completed'
WHERE completed_at IS NOT NULL AND module_state <> 'completed';

UPDATE public.learning_modules
SET module_state = 'pending'
WHERE completed_at IS NULL AND started_at IS NULL AND module_state NOT IN ('pending', 'started', 'completed');

-- ---------------------------------------------------------------------------
-- 2. Session scheduled wall-clock (UTC instants)
-- ---------------------------------------------------------------------------
ALTER TABLE public.learning_sessions
  ADD COLUMN IF NOT EXISTS scheduled_start_at timestamptz;

ALTER TABLE public.learning_sessions
  ADD COLUMN IF NOT EXISTS scheduled_end_at timestamptz;

ALTER TABLE public.learning_sessions
  DROP CONSTRAINT IF EXISTS learning_sessions_scheduled_order_check;

ALTER TABLE public.learning_sessions
  ADD CONSTRAINT learning_sessions_scheduled_order_check
  CHECK (
    scheduled_start_at IS NULL
    OR scheduled_end_at IS NULL
    OR scheduled_end_at > scheduled_start_at
  );

COMMENT ON COLUMN public.learning_sessions.scheduled_start_at IS
  'Calendar slot start (UTC). Null until scheduled.';
COMMENT ON COLUMN public.learning_sessions.scheduled_end_at IS
  'Calendar slot end (UTC). Null until scheduled.';

CREATE INDEX IF NOT EXISTS learning_sessions_scheduled_start_idx
  ON public.learning_sessions (scheduled_start_at)
  WHERE scheduled_start_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. User availability windows (local wall time + IANA timezone per row)
-- day_of_week: 0 = Sunday .. 6 = Saturday (JavaScript Date.getDay())
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_availability_windows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_local_time time NOT NULL,
  end_local_time time NOT NULL,
  timezone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_availability_windows_time_order_check CHECK (end_local_time > start_local_time)
);

CREATE INDEX IF NOT EXISTS user_availability_windows_owner_dow_idx
  ON public.user_availability_windows (owner_id, day_of_week);

ALTER TABLE public.user_availability_windows ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 4. Touch updated_at on availability windows
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.user_availability_windows_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_availability_windows_updated_at_trg
  ON public.user_availability_windows;

CREATE TRIGGER user_availability_windows_updated_at_trg
  BEFORE UPDATE ON public.user_availability_windows
  FOR EACH ROW
  EXECUTE PROCEDURE public.user_availability_windows_set_updated_at();
