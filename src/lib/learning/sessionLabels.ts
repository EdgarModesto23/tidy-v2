import type { LearningSessionType } from "./types";

/** Short labels for session type badges (UI). */
export const SESSION_TYPE_LABEL: Record<LearningSessionType, string> = {
  test: "Test",
  study: "Study",
  drill: "Drill",
  project: "Project",
  flashcard_session: "Flashcards",
};
