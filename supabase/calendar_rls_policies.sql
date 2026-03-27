-- RLS for user_availability_windows (run after calendar_scheduling.sql)

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
