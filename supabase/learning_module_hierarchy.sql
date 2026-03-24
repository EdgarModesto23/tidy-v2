-- Module hierarchy: one root per program, optional parent for child modules.
-- Run in Supabase SQL Editor after learning_modules exists.
-- Prerequisite: learning_completed_at_columns.sql (optional but recommended for completed_at on modules).

-- ---------------------------------------------------------------------------
-- 1. Self-reference: child modules point to a parent in the same program
-- ---------------------------------------------------------------------------
ALTER TABLE public.learning_modules
  ADD COLUMN IF NOT EXISTS parent_module_id uuid;

-- FK after column exists (idempotent if already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'learning_modules_parent_module_id_fkey'
  ) THEN
    ALTER TABLE public.learning_modules
      ADD CONSTRAINT learning_modules_parent_module_id_fkey
      FOREIGN KEY (parent_module_id)
      REFERENCES public.learning_modules (id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- Parent must belong to the same program (CHECK cannot use subqueries in PostgreSQL)
ALTER TABLE public.learning_modules
  DROP CONSTRAINT IF EXISTS learning_modules_parent_same_program;

CREATE OR REPLACE FUNCTION public.learning_modules_parent_same_program_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.parent_module_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.learning_modules AS p
    WHERE p.id = NEW.parent_module_id
      AND p.learning_program_id = NEW.learning_program_id
  ) THEN
    RAISE EXCEPTION
      'learning_modules.parent_module_id must reference a module in the same learning_program_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS learning_modules_parent_same_program_trg
  ON public.learning_modules;

CREATE TRIGGER learning_modules_parent_same_program_trg
  BEFORE INSERT OR UPDATE OF parent_module_id, learning_program_id
  ON public.learning_modules
  FOR EACH ROW
  EXECUTE PROCEDURE public.learning_modules_parent_same_program_check();

-- ---------------------------------------------------------------------------
-- 2. Backfill: at most one NULL parent per program (pick earliest by sort_order)
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    learning_program_id,
    row_number() OVER (
      PARTITION BY learning_program_id
      ORDER BY sort_order ASC, created_at ASC
    ) AS rn
  FROM public.learning_modules
  WHERE parent_module_id IS NULL
),
roots AS (
  SELECT id, learning_program_id
  FROM ranked
  WHERE rn = 1
),
reattach AS (
  SELECT m.id AS child_id, r.id AS root_id
  FROM public.learning_modules m
  INNER JOIN roots r ON r.learning_program_id = m.learning_program_id
  WHERE m.parent_module_id IS NULL
    AND m.id <> r.id
)
UPDATE public.learning_modules AS m
SET parent_module_id = reattach.root_id
FROM reattach
WHERE m.id = reattach.child_id;

-- ---------------------------------------------------------------------------
-- 3. Enforce exactly one root module per program (parent_module_id IS NULL)
-- ---------------------------------------------------------------------------
DROP INDEX IF EXISTS learning_modules_one_root_per_program;

CREATE UNIQUE INDEX learning_modules_one_root_per_program
  ON public.learning_modules (learning_program_id)
  WHERE parent_module_id IS NULL;

-- ---------------------------------------------------------------------------
-- Tasks (learning_sessions): optional completion timestamp for reporting.
-- The app marks tasks done via status = 'completed' and actual_completed_at.
-- ---------------------------------------------------------------------------
ALTER TABLE public.learning_sessions
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

COMMENT ON COLUMN public.learning_sessions.completed_at IS
  'Optional mirror of completion time; app may use status/actual_completed_at only.';
