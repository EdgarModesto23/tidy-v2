-- RLS policies for ultralearning tables (Tidy app)
-- Run in Supabase SQL Editor after tables exist and RLS is enabled.
-- Uses owner_id = auth.uid() on learning_programs; children join through the program.

-- ---------------------------------------------------------------------------
-- learning_programs
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "learning_programs_select_own" ON public.learning_programs;
CREATE POLICY "learning_programs_select_own"
  ON public.learning_programs
  FOR SELECT
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "learning_programs_insert_own" ON public.learning_programs;
CREATE POLICY "learning_programs_insert_own"
  ON public.learning_programs
  FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "learning_programs_update_own" ON public.learning_programs;
CREATE POLICY "learning_programs_update_own"
  ON public.learning_programs
  FOR UPDATE
  TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "learning_programs_delete_own" ON public.learning_programs;
CREATE POLICY "learning_programs_delete_own"
  ON public.learning_programs
  FOR DELETE
  TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- ---------------------------------------------------------------------------
-- learning_modules (via learning_program_id)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "learning_modules_select_own" ON public.learning_modules;
CREATE POLICY "learning_modules_select_own"
  ON public.learning_modules
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = learning_modules.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "learning_modules_insert_own" ON public.learning_modules;
CREATE POLICY "learning_modules_insert_own"
  ON public.learning_modules
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = learning_modules.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "learning_modules_update_own" ON public.learning_modules;
CREATE POLICY "learning_modules_update_own"
  ON public.learning_modules
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = learning_modules.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = learning_modules.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "learning_modules_delete_own" ON public.learning_modules;
CREATE POLICY "learning_modules_delete_own"
  ON public.learning_modules
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = learning_modules.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- learning_sessions (via module -> program)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "learning_sessions_select_own" ON public.learning_sessions;
CREATE POLICY "learning_sessions_select_own"
  ON public.learning_sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.learning_modules m
      JOIN public.learning_programs p ON p.id = m.learning_program_id
      WHERE m.id = learning_sessions.learning_module_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "learning_sessions_insert_own" ON public.learning_sessions;
CREATE POLICY "learning_sessions_insert_own"
  ON public.learning_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.learning_modules m
      JOIN public.learning_programs p ON p.id = m.learning_program_id
      WHERE m.id = learning_sessions.learning_module_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "learning_sessions_update_own" ON public.learning_sessions;
CREATE POLICY "learning_sessions_update_own"
  ON public.learning_sessions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.learning_modules m
      JOIN public.learning_programs p ON p.id = m.learning_program_id
      WHERE m.id = learning_sessions.learning_module_id
        AND p.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.learning_modules m
      JOIN public.learning_programs p ON p.id = m.learning_program_id
      WHERE m.id = learning_sessions.learning_module_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "learning_sessions_delete_own" ON public.learning_sessions;
CREATE POLICY "learning_sessions_delete_own"
  ON public.learning_sessions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.learning_modules m
      JOIN public.learning_programs p ON p.id = m.learning_program_id
      WHERE m.id = learning_sessions.learning_module_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- program_weaknesses
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "program_weaknesses_select_own" ON public.program_weaknesses;
CREATE POLICY "program_weaknesses_select_own"
  ON public.program_weaknesses
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = program_weaknesses.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "program_weaknesses_insert_own" ON public.program_weaknesses;
CREATE POLICY "program_weaknesses_insert_own"
  ON public.program_weaknesses
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = program_weaknesses.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "program_weaknesses_update_own" ON public.program_weaknesses;
CREATE POLICY "program_weaknesses_update_own"
  ON public.program_weaknesses
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = program_weaknesses.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = program_weaknesses.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "program_weaknesses_delete_own" ON public.program_weaknesses;
CREATE POLICY "program_weaknesses_delete_own"
  ON public.program_weaknesses
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = program_weaknesses.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- program_flashcards
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "program_flashcards_select_own" ON public.program_flashcards;
CREATE POLICY "program_flashcards_select_own"
  ON public.program_flashcards
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = program_flashcards.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "program_flashcards_insert_own" ON public.program_flashcards;
CREATE POLICY "program_flashcards_insert_own"
  ON public.program_flashcards
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = program_flashcards.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "program_flashcards_update_own" ON public.program_flashcards;
CREATE POLICY "program_flashcards_update_own"
  ON public.program_flashcards
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = program_flashcards.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = program_flashcards.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "program_flashcards_delete_own" ON public.program_flashcards;
CREATE POLICY "program_flashcards_delete_own"
  ON public.program_flashcards
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = program_flashcards.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- metalearning_resources (program-scoped rows only)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "metalearning_resources_select_own" ON public.metalearning_resources;
CREATE POLICY "metalearning_resources_select_own"
  ON public.metalearning_resources
  FOR SELECT
  TO authenticated
  USING (
    learning_program_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = metalearning_resources.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "metalearning_resources_insert_own" ON public.metalearning_resources;
CREATE POLICY "metalearning_resources_insert_own"
  ON public.metalearning_resources
  FOR INSERT
  TO authenticated
  WITH CHECK (
    learning_program_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = metalearning_resources.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "metalearning_resources_update_own" ON public.metalearning_resources;
CREATE POLICY "metalearning_resources_update_own"
  ON public.metalearning_resources
  FOR UPDATE
  TO authenticated
  USING (
    learning_program_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = metalearning_resources.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    learning_program_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = metalearning_resources.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "metalearning_resources_delete_own" ON public.metalearning_resources;
CREATE POLICY "metalearning_resources_delete_own"
  ON public.metalearning_resources
  FOR DELETE
  TO authenticated
  USING (
    learning_program_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.learning_programs p
      WHERE p.id = metalearning_resources.learning_program_id
        AND p.owner_id = (SELECT auth.uid())
    )
  );
