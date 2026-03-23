import type { LearningSessionType } from "./types";

export type MockSessionSpec = {
  name: string;
  session_type: LearningSessionType;
  estimated_duration_minutes?: number;
  /** Day offset from "today" for planned_start_date */
  startOffsetDays: number;
  /** Length of planned window in days (inclusive) */
  spanDays: number;
};

export type MockModuleSpec = {
  title: string;
  description: string;
  sessions: MockSessionSpec[];
};

export type MockWeaknessSpec = {
  title: string;
  description: string;
  priority: number;
};

export type MockFlashcardSpec = {
  front_text: string;
  back_text: string;
};

export type MockResourceSpec = {
  kind: "link";
  title: string;
  description: string;
  uri: string;
};

export type MockLearningPlan = {
  modules: MockModuleSpec[];
  weaknesses: MockWeaknessSpec[];
  flashcards: MockFlashcardSpec[];
  resources: MockResourceSpec[];
};

/**
 * Deterministic mock "AI" plan — swap for a real model later.
 * Uses the user's brief only to personalize copy slightly.
 */
export function buildMockLearningPlan(brief: string): MockLearningPlan {
  const snippet = brief.trim().slice(0, 120) || "this skill";

  return {
    modules: [
      {
        title: "Orientation & metalearning",
        description: `Clarify outcomes, constraints, and how you'll learn ${snippet}.`,
        sessions: [
          {
            name: "Define success criteria",
            session_type: "study",
            startOffsetDays: 0,
            spanDays: 1,
            estimated_duration_minutes: 45,
          },
          {
            name: "Resource map",
            session_type: "project",
            startOffsetDays: 1,
            spanDays: 2,
            estimated_duration_minutes: 60,
          },
        ],
      },
      {
        title: "Core foundations",
        description: `Build the primitives that everything else rests on for ${snippet}.`,
        sessions: [
          {
            name: "Concept sweep",
            session_type: "study",
            startOffsetDays: 3,
            spanDays: 2,
            estimated_duration_minutes: 90,
          },
          {
            name: "Deliberate drills",
            session_type: "drill",
            startOffsetDays: 5,
            spanDays: 3,
            estimated_duration_minutes: 30,
          },
          {
            name: "Checkpoint quiz",
            session_type: "test",
            startOffsetDays: 8,
            spanDays: 1,
            estimated_duration_minutes: 40,
          },
        ],
      },
      {
        title: "Integration & projects",
        description: `Apply skills in realistic chunks; adjust pace freely.`,
        sessions: [
          {
            name: "Mini-project sprint",
            session_type: "project",
            startOffsetDays: 9,
            spanDays: 4,
            estimated_duration_minutes: 120,
          },
          {
            name: "Flashcard review",
            session_type: "flashcard_session",
            startOffsetDays: 13,
            spanDays: 1,
            estimated_duration_minutes: 25,
          },
        ],
      },
    ],
    weaknesses: [
      {
        title: "Working memory under load",
        description:
          "Lose track of steps when complexity spikes — schedule shorter sessions with checklists.",
        priority: 2,
      },
      {
        title: "Feedback latency",
        description:
          "Hard to tell if practice is correct — add self-tests and recorded checkpoints.",
        priority: 1,
      },
    ],
    flashcards: [
      {
        front_text: `What is the primary goal of "${snippet.slice(0, 40)}..."?`,
        back_text: "A concrete outcome you can observe or measure within the program window.",
      },
      {
        front_text: "Name one drill you can repeat in under 15 minutes.",
        back_text: "A tight loop with immediate feedback (metronome, prompts, checks).",
      },
      {
        front_text: "When should you shrink session length?",
        back_text: "When error rates rise or focus drops — adapt the schedule, don't penalize.",
      },
    ],
    resources: [
      {
        kind: "link",
        title: "Ultralearning — project overview",
        description: "Reference framing for aggressive self-directed learning.",
        uri: "https://example.com/ultralearning-overview",
      },
    ],
  };
}
