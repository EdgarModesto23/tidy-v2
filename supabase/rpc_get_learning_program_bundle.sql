-- Run in Supabase SQL Editor after tables exist (SECURITY INVOKER: RLS applies).
-- Returns one JSON payload for the program detail page (single round trip).

CREATE OR REPLACE FUNCTION public.get_learning_program_bundle(p_program_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  prog record;
  bv timestamptz;
BEGIN
  IF uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  SELECT * INTO prog
  FROM learning_programs lp
  WHERE lp.id = p_program_id AND lp.owner_id = uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  bv := greatest(
    prog.updated_at,
    coalesce(
      (SELECT max(m.updated_at) FROM learning_modules m WHERE m.learning_program_id = p_program_id),
      prog.updated_at
    ),
    coalesce(
      (
        SELECT max(s.updated_at)
        FROM learning_sessions s
        INNER JOIN learning_modules lm ON lm.id = s.learning_module_id
        WHERE lm.learning_program_id = p_program_id
      ),
      prog.updated_at
    ),
    coalesce(
      (SELECT max(w.updated_at) FROM program_weaknesses w WHERE w.learning_program_id = p_program_id),
      prog.updated_at
    ),
    coalesce(
      (SELECT max(f.updated_at) FROM program_flashcards f WHERE f.learning_program_id = p_program_id),
      prog.updated_at
    ),
    coalesce(
      (SELECT max(r.updated_at) FROM metalearning_resources r WHERE r.learning_program_id = p_program_id),
      prog.updated_at
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'bundle_version', (extract(epoch FROM bv) * 1000)::bigint,
    'program', to_jsonb(row_to_json(prog)),
    'modules',
      coalesce(
        (
          SELECT jsonb_agg(to_jsonb(m) ORDER BY m.sort_order ASC)
          FROM learning_modules m
          WHERE m.learning_program_id = p_program_id
        ),
        '[]'::jsonb
      ),
    'sessions',
      coalesce(
        (
          SELECT jsonb_agg(to_jsonb(s) ORDER BY s.sort_order ASC)
          FROM learning_sessions s
          INNER JOIN learning_modules lm ON lm.id = s.learning_module_id
          WHERE lm.learning_program_id = p_program_id
        ),
        '[]'::jsonb
      ),
    'weaknesses',
      coalesce(
        (
          SELECT jsonb_agg(to_jsonb(w) ORDER BY w.sort_order ASC)
          FROM program_weaknesses w
          WHERE w.learning_program_id = p_program_id
        ),
        '[]'::jsonb
      ),
    'flashcards',
      coalesce(
        (
          SELECT jsonb_agg(to_jsonb(f) ORDER BY f.created_at DESC)
          FROM program_flashcards f
          WHERE f.learning_program_id = p_program_id
        ),
        '[]'::jsonb
      ),
    'resources',
      coalesce(
        (
          SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at ASC)
          FROM metalearning_resources r
          WHERE r.learning_program_id = p_program_id
        ),
        '[]'::jsonb
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_learning_program_bundle(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_learning_program_bundle(uuid) TO authenticated;
