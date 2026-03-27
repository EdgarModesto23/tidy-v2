-- =============================================================================
-- Calendar, working hours, module lifecycle — single migration for Supabase
-- Run once in the SQL Editor after your base learning_* tables exist.
-- Idempotent: safe to re-run (IF NOT EXISTS / OR REPLACE / DROP IF EXISTS where needed).
-- =============================================================================

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
-- 2. Session scheduled instants (UTC timestamptz)
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

-- ---------------------------------------------------------------------------
-- 5. RLS policies for user_availability_windows
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "user_availability_windows_select_own" ON public.user_availability_windows;
CREATE POLICY "user_availability_windows_select_own"
  ON public.user_availability_windows
  FOR SELECT
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_availability_windows_insert_own" ON public.user_availability_windows;
CREATE POLICY "user_availability_windows_insert_own"
  ON public.user_availability_windows
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_availability_windows_update_own" ON public.user_availability_windows;
CREATE POLICY "user_availability_windows_update_own"
  ON public.user_availability_windows
  FOR UPDATE
  TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "user_availability_windows_delete_own" ON public.user_availability_windows;
CREATE POLICY "user_availability_windows_delete_own"
  ON public.user_availability_windows
  FOR DELETE
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- 6. RPC: sessions in time range (for Calendar / Today)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_sessions_in_range(
  range_start timestamptz,
  range_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  IF range_end <= range_start THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_range');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'sessions',
    coalesce(
      (
        SELECT jsonb_agg(to_jsonb(q) ORDER BY q.scheduled_start_at)
        FROM (
          SELECT
            s.id,
            s.learning_module_id,
            s.name,
            s.session_type,
            s.sort_order,
            s.planned_start_date,
            s.planned_end_date,
            s.status,
            s.scheduled_start_at,
            s.scheduled_end_at,
            s.estimated_duration_minutes,
            m.title AS module_title,
            m.module_state,
            p.id AS program_id,
            p.name AS program_name
          FROM public.learning_sessions s
          INNER JOIN public.learning_modules m ON m.id = s.learning_module_id
          INNER JOIN public.learning_programs p ON p.id = m.learning_program_id
          WHERE p.owner_id = uid
            AND s.scheduled_start_at IS NOT NULL
            AND s.scheduled_start_at >= range_start
            AND s.scheduled_start_at < range_end
        ) q
      ),
      '[]'::jsonb
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_sessions_in_range(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_user_sessions_in_range(timestamptz, timestamptz) TO authenticated;
