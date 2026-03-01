import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export function registerPrompts(server: McpServer) {
  server.prompt(
    "create-course-outline",
    {
      topic: z.string().describe("The topic or subject for the course"),
      difficulty_level: z.enum(["beginner", "intermediate", "advanced"]).optional().describe("Target difficulty level"),
      duration_weeks: z.number().optional().describe("Intended course duration in weeks"),
    },
    ({ topic, difficulty_level, duration_weeks }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Create a detailed course outline for the following topic:

**Topic:** ${topic}
**Difficulty Level:** ${difficulty_level ?? "intermediate"}
**Duration:** ${duration_weeks ? `${duration_weeks} weeks` : "flexible"}

Please provide:
1. A course title and description
2. A list of lessons in logical order, each with:
   - Title
   - Brief description of what it covers
   - Key learning objectives
3. Suggested exams (midterm, final, or per-section)
4. Suggested exercises per lesson

After creating the outline, use the \`create_course\` tool to create the course, then \`create_lesson\` for each lesson, and \`create_exam\` for each exam.

Format the lessons with sequential numbering starting from 1.`,
          },
        },
      ],
    })
  );

  server.prompt(
    "generate-lesson-content",
    {
      lesson_title: z.string().describe("Title of the lesson"),
      learning_objectives: z.string().describe("Comma-separated learning objectives"),
      include_examples: z.boolean().optional().describe("Whether to include code examples"),
    },
    ({ lesson_title, learning_objectives, include_examples }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Generate MDX content for a lesson with the following details:

**Lesson Title:** ${lesson_title}
**Learning Objectives:** ${learning_objectives}
**Include Examples:** ${include_examples !== false ? "Yes" : "No"}

The content should be written in MDX format suitable for an LMS. Include:
- An introduction explaining why this topic matters
- Clear explanations with headings and subheadings
- ${include_examples !== false ? "Practical code examples with syntax highlighting" : "Conceptual explanations"}
- Key takeaways at the end
- A brief summary

After generating the content, use the \`update_lesson\` tool to save it to the appropriate lesson.`,
          },
        },
      ],
    })
  );

  server.prompt(
    "create-exam-questions",
    {
      lesson_content: z.string().describe("The lesson content or topic to create questions for"),
      num_questions: z.number().optional().describe("Number of questions to generate (default 5)"),
      question_types: z.string().optional().describe("Comma-separated question types: true_false, multiple_choice, free_text"),
    },
    ({ lesson_content, num_questions, question_types }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Generate exam questions based on the following content:

**Content/Topic:** ${lesson_content}
**Number of Questions:** ${num_questions ?? 5}
**Question Types:** ${question_types ?? "multiple_choice, true_false, free_text"}

For each question, provide:
- question_text: The question
- question_type: "true_false", "multiple_choice", or "free_text"
- points: Point value (1-5)
- sequence: Order number
- For multiple_choice/true_false: options with option_text and is_correct
- For free_text: ai_grading_criteria and expected_keywords

After generating the questions, use the \`create_exam\` tool to create an exam with all questions in a single call. The questions array should match the schema expected by create_exam.`,
          },
        },
      ],
    })
  );

  server.prompt(
    "review-course",
    {
      course_id: z.string().describe("The course ID to review"),
    },
    ({ course_id }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `Please review course ${course_id} for completeness and quality.

Steps:
1. Use \`get_course\` to fetch the course details
2. Use \`get_lesson\` for each lesson to review content
3. Use \`get_exam\` for each exam to review questions

Analyze and report on:
- **Completeness**: Are all lessons filled with content? Are there enough exams?
- **Structure**: Is the lesson sequence logical? Do topics build on each other?
- **Quality**: Is the content clear? Are exam questions well-written?
- **Coverage**: Do exams cover the material from lessons?
- **Readiness**: Can this course be published? What's missing?

Provide actionable recommendations for improvement.`,
          },
        },
      ],
    })
  );
}
