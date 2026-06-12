/**
 * Row shapes for the subset of the lms-front schema the student app reads.
 * Mirrors the web app's query patterns — see docs/BACKEND.md for gotchas
 * (PK naming, missing tenant_id columns, etc.).
 */

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string;
  plan: string;
  status: string;
}

export interface Course {
  course_id: number;
  title: string;
  description: string | null;
  thumbnail_url: string | null;
}

export interface Lesson {
  id: number;
  title: string;
  sequence: number | null;
  content: string | null;
  video_url: string | null;
  embed_code: string | null;
  course_id: number;
}

export interface LessonCompletion {
  lesson_id: number;
  user_id: string;
}

/** Shape returned by the enrolled-courses query on the dashboard. */
export interface EnrolledCourse {
  enrollment_id: number;
  course: (Course & {
    lessons: { id: number; title: string; lesson_completions: { user_id: string }[] }[];
  }) | null;
}

// ── Exams ────────────────────────────────────────────────────────────────
// Gotchas: `exams` has `sequence` for ordering; child tables
// (exam_questions, question_options, exam_answers) have NO tenant_id.

export type QuestionType = 'true_false' | 'multiple_choice' | 'free_text';

export interface QuestionOption {
  option_id: number;
  question_id: number;
  option_text: string;
  is_correct: boolean;
}

export interface ExamQuestion {
  question_id: number;
  exam_id: number;
  question_text: string;
  question_type: QuestionType;
  question_options: QuestionOption[];
}

export interface ExamAnswer {
  answer_id: number;
  question_id: number;
  answer_text: string | null;
  is_correct: boolean | null;
  feedback: string | null;
}

/** Written by the save_exam_feedback RPC (AI grading) or teacher review. */
export interface ExamQuestionScore {
  question_id: number;
  points_earned: number | null;
  points_possible: number | null;
  is_correct: boolean | null;
  ai_feedback: string | null;
  ai_confidence: number | null;
  teacher_notes: string | null;
  is_overridden: boolean | null;
}

export interface ExamSubmission {
  submission_id: number;
  student_id: string;
  submission_date: string;
  score: number | null;
  review_status: 'pending' | 'ai_reviewed' | 'pending_teacher_review' | 'teacher_reviewed';
  /** jsonb set by save_exam_feedback: { overall_feedback, question_feedback, graded_at } */
  ai_data: { overall_feedback?: string; summary?: string } | null;
  exam_answers: ExamAnswer[];
  exam_scores: { score_id: number; score: number | null }[];
  exam_question_scores: ExamQuestionScore[];
}

export interface ExamSummary {
  exam_id: number;
  title: string;
  description: string | null;
  duration: number | null;
  sequence: number | null;
  exam_submissions: Pick<ExamSubmission, 'submission_id' | 'score' | 'review_status'>[];
}

// ── Exercises ────────────────────────────────────────────────────────────
// Gotchas: `exercises.id` PK; exercise_completions and exercise_messages
// have NO tenant_id — never insert or filter it on those tables.

export type ExerciseType =
  | 'quiz'
  | 'coding_challenge'
  | 'essay'
  | 'multiple_choice'
  | 'true_false'
  | 'fill_in_the_blank'
  | 'discussion'
  | 'audio_evaluation'
  | 'video_evaluation'
  | 'artifact'
  | 'real_time_conversation';

/** jsonb — fields depend on exercise_type (artifact / audio / video). */
export interface ExerciseConfig {
  artifact_type?: string;
  artifact_html?: string;
  passing_score?: number;
  max_daily_attempts?: number;
  topic_prompt?: string;
  min_duration_seconds?: number;
  max_duration_seconds?: number;
}

export interface ExerciseSummary {
  id: number;
  title: string;
  description: string | null;
  exercise_type: ExerciseType | string;
  difficulty_level: string | null;
  exercise_completions: { id: number; score?: number | null; completed_at?: string | null }[];
}

export interface ExerciseDetail extends ExerciseSummary {
  course_id: number;
  instructions: string;
  time_limit: number | null;
  active_file: string | null;
  exercise_config: ExerciseConfig | null;
  exercise_messages: ExerciseMessage[];
}

/** Starter files for coding_challenge. NO tenant_id column. */
export interface ExerciseFile {
  file_path: string;
  content: string;
}

/** Saved student code (coding_challenge). NO tenant_id column. */
export interface CodeSubmission {
  id: number;
  submission_code: string;
  created_at: string;
}

/** Audio/video evaluation attempts. This table HAS tenant_id. */
export interface MediaSubmission {
  id: number;
  media_type: string | null;
  duration_seconds: number | null;
  status: string | null;
  ai_evaluation: Record<string, unknown> | null;
  score: number | null;
  created_at: string;
}

export interface ExerciseMessage {
  id: number;
  message: string;
  role: 'user' | 'assistant' | 'system' | 'function' | 'data' | 'tool';
  created_at: string;
}

// ── Lessons (detail screen) ──────────────────────────────────────────────
// Gotchas: lessons_ai_task_messages and lesson_comments have NO tenant_id;
// lesson_resources HAS tenant_id.

export interface AiTask {
  id: number;
  task_instructions: string | null;
}

/** Chat history for the lesson AI tutor. `sender` is the role column. */
export interface AiTaskMessage {
  id: number;
  message: string | null;
  sender: 'user' | 'assistant';
  created_at: string;
}

export type ReactionType = 'like' | 'dislike' | 'boring' | 'funny';

export interface CommentReaction {
  comment_id: number;
  user_id: string;
  reaction_type: ReactionType;
}

export interface LessonComment {
  id: number;
  user_id: string;
  parent_comment_id: number | null;
  content: string;
  created_at: string;
  profiles: { id: string; full_name: string | null; avatar_url: string | null } | null;
  comment_reactions: CommentReaction[];
}

export interface LessonResource {
  id: number;
  file_name: string;
  file_size: number | null;
  mime_type: string | null;
}
