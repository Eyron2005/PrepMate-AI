-- Migration: Add AI Difficulty Classification & Bloom's Revised Taxonomy metadata to public.questions
-- Preserves all existing questions and difficulty values ('Easy', 'Medium', 'Hard').

ALTER TABLE public.questions
  ADD COLUMN IF NOT EXISTS job_role text,
  ADD COLUMN IF NOT EXISTS ai_suggested_difficulty text,
  ADD COLUMN IF NOT EXISTS cognitive_level text,
  ADD COLUMN IF NOT EXISTS difficulty_assessment jsonb,
  ADD COLUMN IF NOT EXISTS difficulty_reason text,
  ADD COLUMN IF NOT EXISTS classification_status text,
  ADD COLUMN IF NOT EXISTS classification_method text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'questions_ai_suggested_difficulty_check'
  ) THEN
    ALTER TABLE public.questions
      ADD CONSTRAINT questions_ai_suggested_difficulty_check
      CHECK (ai_suggested_difficulty IS NULL OR upper(ai_suggested_difficulty) IN ('EASY', 'MEDIUM', 'HARD'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'questions_cognitive_level_check'
  ) THEN
    ALTER TABLE public.questions
      ADD CONSTRAINT questions_cognitive_level_check
      CHECK (
        cognitive_level IS NULL OR cognitive_level IN (
          'Remembering',
          'Understanding',
          'Applying',
          'Analyzing',
          'Evaluating',
          'Creating'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'questions_classification_status_check'
  ) THEN
    ALTER TABLE public.questions
      ADD CONSTRAINT questions_classification_status_check
      CHECK (
        classification_status IS NULL OR classification_status IN ('PENDING', 'COMPLETED', 'FAILED')
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'questions_classification_method_check'
  ) THEN
    ALTER TABLE public.questions
      ADD CONSTRAINT questions_classification_method_check
      CHECK (
        classification_method IS NULL OR classification_method IN ('AI', 'ADMIN_OVERRIDE')
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS questions_category_role_difficulty_idx
  ON public.questions (category, job_role, difficulty);

NOTIFY pgrst, 'reload schema';
