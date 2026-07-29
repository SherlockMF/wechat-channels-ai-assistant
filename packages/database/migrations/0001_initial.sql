CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  CREATE TYPE analysis_job_status AS ENUM ('queued','processing','completed','failed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE video_match_status AS ENUM ('matched','needs_review','unmatched');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  original_filename text NOT NULL,
  sheet_name text NOT NULL,
  row_count integer NOT NULL,
  valid_row_count integer NOT NULL,
  invalid_row_count integer NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS video_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  import_id uuid NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  spreadsheet_row integer NOT NULL,
  platform_video_id text,
  normalized_platform_video_id text,
  description text NOT NULL,
  normalized_description text NOT NULL,
  published_at timestamptz NOT NULL,
  completion_rate double precision,
  average_watch_seconds double precision,
  views integer, recommendations integer, likes integer, comments integer,
  shares integer, follows integer, share_to_chat integer, set_as_ringtone integer,
  set_as_status integer, set_as_moments_cover integer, wecom_link_clicks integer,
  wecom_link_users integer, contact_add_count integer, contact_add_users integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS video_records_import_platform_id_uq
  ON video_records(import_id, normalized_platform_video_id)
  WHERE normalized_platform_video_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS video_records_published_idx
  ON video_records(import_id, published_at DESC, spreadsheet_row ASC);

CREATE TABLE IF NOT EXISTS video_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  import_id uuid NOT NULL REFERENCES imports(id) ON DELETE CASCADE,
  original_filename text NOT NULL,
  normalized_filename text NOT NULL,
  storage_path text NOT NULL,
  mime_type text NOT NULL,
  file_size integer NOT NULL,
  last_modified_at timestamptz,
  duration_seconds double precision,
  width integer, height integer, fps double precision,
  processing_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS video_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  video_asset_id uuid NOT NULL UNIQUE REFERENCES video_assets(id) ON DELETE CASCADE,
  video_record_id uuid REFERENCES video_records(id) ON DELETE SET NULL,
  method text NOT NULL,
  similarity_score double precision NOT NULL,
  status video_match_status NOT NULL,
  confirmed_by_user boolean NOT NULL DEFAULT false,
  candidates_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analysis_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  video_record_id uuid NOT NULL REFERENCES video_records(id) ON DELETE CASCADE,
  video_asset_id uuid NOT NULL REFERENCES video_assets(id) ON DELETE CASCADE,
  status analysis_job_status NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  current_step text NOT NULL DEFAULT 'queued',
  retry_count integer NOT NULL DEFAULT 0,
  error_code text, error_message text,
  started_at timestamptz, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analysis_jobs_poll_idx ON analysis_jobs(status, created_at);

CREATE TABLE IF NOT EXISTS video_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_asset_id uuid NOT NULL REFERENCES video_assets(id) ON DELETE CASCADE,
  full_text text NOT NULL, language text, provider text NOT NULL, model text NOT NULL,
  confidence double precision, segments_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  user_corrected_text text, created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS video_segments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_asset_id uuid NOT NULL REFERENCES video_assets(id) ON DELETE CASCADE,
  start_second double precision NOT NULL, end_second double precision NOT NULL,
  shot_type text NOT NULL, information_function text NOT NULL,
  visual_description text NOT NULL, spoken_text text, subtitle_text text,
  audio_description text, is_static boolean NOT NULL DEFAULT false,
  is_repeated boolean NOT NULL DEFAULT false, is_silent boolean NOT NULL DEFAULT false,
  key_frame_path text, confidence double precision NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_job_id uuid NOT NULL REFERENCES analysis_jobs(id) ON DELETE CASCADE,
  data_summary_json jsonb NOT NULL, result_json jsonb NOT NULL,
  edited_markdown text,
  limitations_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  analysis_version text NOT NULL, rule_engine_version text NOT NULL,
  prompt_version text NOT NULL, speech_provider text NOT NULL, speech_model text NOT NULL,
  vision_provider text NOT NULL, vision_model text NOT NULL,
  llm_provider text NOT NULL, llm_model text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recommendation_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL,
  analysis_result_id uuid NOT NULL REFERENCES analysis_results(id) ON DELETE CASCADE,
  recommendation_path text NOT NULL, status text NOT NULL, user_comment text,
  edited_content text, created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS retention_datasets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_record_id uuid NOT NULL REFERENCES video_records(id) ON DELETE CASCADE,
  source text NOT NULL, source_confidence double precision, captured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS retention_points (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  retention_dataset_id uuid NOT NULL REFERENCES retention_datasets(id) ON DELETE CASCADE,
  second double precision NOT NULL, retention_rate double precision NOT NULL,
  is_estimated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(retention_dataset_id, second)
);
