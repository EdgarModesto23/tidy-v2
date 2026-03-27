/** Matches Postgres enums from the learning schema */
export type LearningProgramReason = "instrumental" | "intrinsic";

export type LearningSessionType =
  | "test"
  | "study"
  | "drill"
  | "project"
  | "flashcard_session";

export type LearningSessionStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "skipped"
  | "deferred";

export type MetalearningResourceKind = "document" | "link" | "picture";

/** DB `learning_modules.module_state`; align with `completed_at` / `started_at`. */
export type ModuleLifecycleState = "pending" | "started" | "completed";

export type LearningProgramRow = {
  id: string;
  owner_id: string;
  name: string;
  description: string | null;
  starting_point_description: string | null;
  reason: LearningProgramReason;
  reason_description: string | null;
  target_start_date: string | null;
  target_end_date: string | null;
  /** When set, treat the program as finished for UI (add column via SQL migration). */
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type LearningModuleRow = {
  id: string;
  learning_program_id: string;
  /** NULL = root module for this program (exactly one per program). */
  parent_module_id?: string | null;
  title: string;
  description: string | null;
  sort_order: number;
  module_state?: ModuleLifecycleState;
  started_at?: string | null;
  completed_at?: string | null;
  created_at: string;
  updated_at: string;
};

export type ProgramWeaknessRow = {
  id: string;
  learning_program_id: string;
  title: string;
  description: string | null;
  priority: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type LearningSessionRow = {
  id: string;
  learning_module_id: string;
  name: string;
  session_type: LearningSessionType;
  sort_order: number;
  planned_start_date: string;
  planned_end_date: string;
  /** Calendar slot in UTC (ISO string); null until scheduled. */
  scheduled_start_at?: string | null;
  scheduled_end_at?: string | null;
  status: LearningSessionStatus;
  actual_started_at: string | null;
  actual_completed_at: string | null;
  /** Optional DB column; UI completion uses status + actual_completed_at. */
  completed_at?: string | null;
  estimated_duration_minutes: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

/** `user_availability_windows` — local wall time + IANA zone; day 0 = Sunday … 6 = Saturday. */
export type UserAvailabilityWindowRow = {
  id: string;
  owner_id: string;
  day_of_week: number;
  start_local_time: string;
  end_local_time: string;
  timezone: string;
  created_at: string;
  updated_at: string;
};

export type ProgramFlashcardRow = {
  id: string;
  learning_program_id: string;
  front_text: string;
  back_text: string;
  difficulty: number | null;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type MetalearningResourceRow = {
  id: string;
  learning_program_id: string | null;
  kind: MetalearningResourceKind;
  title: string;
  description: string | null;
  uri: string;
  created_at: string;
  updated_at: string;
};
