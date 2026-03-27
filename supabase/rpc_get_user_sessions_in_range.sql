-- Returns scheduled sessions for the current user within [range_start, range_end) (timestamptz UTC).
-- Includes program name, module title, session fields for calendar UI.

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
