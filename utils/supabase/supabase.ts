export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      assignments: {
        Row: {
          assignment_id: number
          course_id: number
          created_at: string | null
          description: string | null
          due_date: string | null
          title: string
        }
        Insert: {
          assignment_id?: number
          course_id: number
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          title: string
        }
        Update: {
          assignment_id?: number
          course_id?: number
          created_at?: string | null
          description?: string | null
          due_date?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
        ]
      }
      chats: {
        Row: {
          chat_id: number
          chat_type: Database["public"]["Enums"]["chat_types"] | null
          created_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          chat_id?: number
          chat_type?: Database["public"]["Enums"]["chat_types"] | null
          created_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          chat_id?: number
          chat_type?: Database["public"]["Enums"]["chat_types"] | null
          created_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chats_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_flags: {
        Row: {
          comment_id: number
          created_at: string | null
          id: number
          reason: string
          user_id: string
        }
        Insert: {
          comment_id: number
          created_at?: string | null
          id?: never
          reason: string
          user_id: string
        }
        Update: {
          comment_id?: number
          created_at?: string | null
          id?: never
          reason?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_flags_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "lesson_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_flags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "comment_flags_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_reactions: {
        Row: {
          comment_id: number
          created_at: string | null
          id: number
          reaction_type: Database["public"]["Enums"]["reactions"]
          user_id: string
        }
        Insert: {
          comment_id: number
          created_at?: string | null
          id?: never
          reaction_type?: Database["public"]["Enums"]["reactions"]
          user_id: string
        }
        Update: {
          comment_id?: number
          created_at?: string | null
          id?: never
          reaction_type?: Database["public"]["Enums"]["reactions"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "lesson_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "comment_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_categories: {
        Row: {
          created_at: string | null
          deleted_at: string | null
          description: string | null
          id: number
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      courses: {
        Row: {
          archived_at: string | null
          author_id: string | null
          category_id: number | null
          course_id: number
          created_at: string | null
          deleted_at: string | null
          description: string | null
          published_at: string | null
          status: Database["public"]["Enums"]["status"]
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          author_id?: string | null
          category_id?: number | null
          course_id?: number
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["status"]
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          author_id?: string | null
          category_id?: number | null
          course_id?: number
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["status"]
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "course_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          course_id: number
          enrollment_date: string | null
          enrollment_id: number
          product_id: number | null
          status: Database["public"]["Enums"]["enrollement_status"] | null
          subscription_id: number | null
          user_id: string
        }
        Insert: {
          course_id: number
          enrollment_date?: string | null
          enrollment_id?: number
          product_id?: number | null
          status?: Database["public"]["Enums"]["enrollement_status"] | null
          subscription_id?: number | null
          user_id: string
        }
        Update: {
          course_id?: number
          enrollment_date?: string | null
          enrollment_id?: number
          product_id?: number | null
          status?: Database["public"]["Enums"]["enrollement_status"] | null
          subscription_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "enrollments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "enrollments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["subscription_id"]
          },
          {
            foreignKeyName: "enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_answers: {
        Row: {
          answer_id: number
          answer_text: string | null
          feedback: string | null
          is_correct: boolean | null
          question_id: number
          submission_id: number
        }
        Insert: {
          answer_id?: number
          answer_text?: string | null
          feedback?: string | null
          is_correct?: boolean | null
          question_id: number
          submission_id: number
        }
        Update: {
          answer_id?: number
          answer_text?: string | null
          feedback?: string | null
          is_correct?: boolean | null
          question_id?: number
          submission_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "exam_questions"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "exam_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "exam_submissions"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          exam_id: number
          question_id: number
          question_text: string
          question_type: string
        }
        Insert: {
          exam_id: number
          question_id?: number
          question_text: string
          question_type: string
        }
        Update: {
          exam_id?: number
          question_id?: number
          question_text?: string
          question_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_questions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["exam_id"]
          },
        ]
      }
      exam_scores: {
        Row: {
          evaluated_at: string | null
          exam_id: number
          feedback: string | null
          score: number | null
          score_id: number
          student_id: string
          submission_id: number
        }
        Insert: {
          evaluated_at?: string | null
          exam_id: number
          feedback?: string | null
          score?: number | null
          score_id?: number
          student_id: string
          submission_id: number
        }
        Update: {
          evaluated_at?: string | null
          exam_id?: number
          feedback?: string | null
          score?: number | null
          score_id?: number
          student_id?: string
          submission_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_scores_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "exam_scores_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exam_scores_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "exam_submissions"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      exam_submissions: {
        Row: {
          ai_data: Json | null
          exam_id: number
          student_id: string
          submission_date: string | null
          submission_id: number
        }
        Insert: {
          ai_data?: Json | null
          exam_id: number
          student_id: string
          submission_date?: string | null
          submission_id?: number
        }
        Update: {
          ai_data?: Json | null
          exam_id?: number
          student_id?: string
          submission_date?: string | null
          submission_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "exam_submissions_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "exam_submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_views: {
        Row: {
          exam_id: number
          id: number
          user_id: string
          viewed_at: string
        }
        Insert: {
          exam_id: number
          id?: never
          user_id: string
          viewed_at?: string
        }
        Update: {
          exam_id?: number
          id?: never
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "exam_views_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "exam_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      exams: {
        Row: {
          course_id: number
          created_at: string | null
          created_by: string | null
          description: string | null
          duration: number
          exam_date: string
          exam_id: number
          sequence: number | null
          status: Database["public"]["Enums"]["status"] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          course_id: number
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration: number
          exam_date: string
          exam_id?: number
          sequence?: number | null
          status?: Database["public"]["Enums"]["status"] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          course_id?: number
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration?: number
          exam_date?: string
          exam_id?: number
          sequence?: number | null
          status?: Database["public"]["Enums"]["status"] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exams_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "exams_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_completions: {
        Row: {
          completed_at: string | null
          completed_by: string
          exercise_id: number
          id: number
          score: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_by: string
          exercise_id: number
          id?: never
          score?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string
          exercise_id?: number
          id?: never
          score?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_completions_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_completions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_messages: {
        Row: {
          created_at: string | null
          exercise_id: number
          id: number
          message: string
          role: Database["public"]["Enums"]["ai_sender_type"] | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          exercise_id: number
          id?: never
          message: string
          role?: Database["public"]["Enums"]["ai_sender_type"] | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          exercise_id?: number
          id?: never
          message?: string
          role?: Database["public"]["Enums"]["ai_sender_type"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_messages_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "exercise_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          course_id: number
          created_at: string | null
          created_by: string
          description: string | null
          difficulty_level: Database["public"]["Enums"]["difficulty_level"]
          exercise_type: Database["public"]["Enums"]["exercise_type"]
          id: number
          instructions: string
          lesson_id: number | null
          system_prompt: string | null
          time_limit: number | null
          title: string
          updated_at: string | null
        }
        Insert: {
          course_id: number
          created_at?: string | null
          created_by: string
          description?: string | null
          difficulty_level: Database["public"]["Enums"]["difficulty_level"]
          exercise_type: Database["public"]["Enums"]["exercise_type"]
          id?: never
          instructions: string
          lesson_id?: number | null
          system_prompt?: string | null
          time_limit?: number | null
          title: string
          updated_at?: string | null
        }
        Update: {
          course_id?: number
          created_at?: string | null
          created_by?: string
          description?: string | null
          difficulty_level?: Database["public"]["Enums"]["difficulty_level"]
          exercise_type?: Database["public"]["Enums"]["exercise_type"]
          id?: never
          instructions?: string
          lesson_id?: number | null
          system_prompt?: string | null
          time_limit?: number | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exercises_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "exercises_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      grades: {
        Row: {
          course_id: number
          feedback: string | null
          grade: number | null
          grade_id: number
          graded_at: string | null
          student_id: string
          submission_id: number | null
        }
        Insert: {
          course_id: number
          feedback?: string | null
          grade?: number | null
          grade_id?: number
          graded_at?: string | null
          student_id: string
          submission_id?: number | null
        }
        Update: {
          course_id?: number
          feedback?: string | null
          grade?: number | null
          grade_id?: number
          graded_at?: string | null
          student_id?: string
          submission_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "grades_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "exam_submissions"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      lesson_comments: {
        Row: {
          content: string
          created_at: string | null
          id: number
          lesson_id: number
          parent_comment_id: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: never
          lesson_id: number
          parent_comment_id?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: never
          lesson_id?: number
          parent_comment_id?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_comments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "lesson_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "lesson_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_completions: {
        Row: {
          completed_at: string | null
          id: number
          lesson_id: number
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: never
          lesson_id: number
          user_id: string
        }
        Update: {
          completed_at?: string | null
          id?: never
          lesson_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_completions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "lesson_completions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_passed: {
        Row: {
          id: number
          lesson_id: number
          passed_at: string | null
          user_id: string
        }
        Insert: {
          id?: never
          lesson_id: number
          passed_at?: string | null
          user_id: string
        }
        Update: {
          id?: never
          lesson_id?: number
          passed_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_passed_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_passed_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_views: {
        Row: {
          id: number
          lesson_id: number
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: never
          lesson_id: number
          user_id: string
          viewed_at?: string
        }
        Update: {
          id?: never
          lesson_id?: number
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_views_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          content: string | null
          course_id: number | null
          created_at: string | null
          description: string | null
          embed_code: string | null
          id: number
          image: string | null
          sequence: number | null
          status: Database["public"]["Enums"]["status"] | null
          summary: string | null
          title: string | null
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          content?: string | null
          course_id?: number | null
          created_at?: string | null
          description?: string | null
          embed_code?: string | null
          id?: never
          image?: string | null
          sequence?: number | null
          status?: Database["public"]["Enums"]["status"] | null
          summary?: string | null
          title?: string | null
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          content?: string | null
          course_id?: number | null
          created_at?: string | null
          description?: string | null
          embed_code?: string | null
          id?: never
          image?: string | null
          sequence?: number | null
          status?: Database["public"]["Enums"]["status"] | null
          summary?: string | null
          title?: string | null
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
        ]
      }
      lessons_ai_task_messages: {
        Row: {
          created_at: string
          id: number
          lesson_id: number | null
          message: string | null
          sender: Database["public"]["Enums"]["ai_sender_type"] | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          lesson_id?: number | null
          message?: string | null
          sender?: Database["public"]["Enums"]["ai_sender_type"] | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          lesson_id?: number | null
          message?: string | null
          sender?: Database["public"]["Enums"]["ai_sender_type"] | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_ai_task_messages_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_ai_task_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons_ai_tasks: {
        Row: {
          created_at: string
          id: number
          lesson_id: number | null
          system_prompt: string | null
          task_instructions: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          lesson_id?: number | null
          system_prompt?: string | null
          task_instructions?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          lesson_id?: number | null
          system_prompt?: string | null
          task_instructions?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_ai_tasks_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          chat_id: number
          created_at: string
          id: number
          message: string | null
          sender: Database["public"]["Enums"]["ai_sender_type"] | null
        }
        Insert: {
          chat_id: number
          created_at?: string
          id?: number
          message?: string | null
          sender?: Database["public"]["Enums"]["ai_sender_type"] | null
        }
        Update: {
          chat_id?: number
          created_at?: string
          id?: number
          message?: string | null
          sender?: Database["public"]["Enums"]["ai_sender_type"] | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "chats"
            referencedColumns: ["chat_id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          link: string | null
          message: string
          notification_id: number
          notification_type:
            | Database["public"]["Enums"]["notification_types"]
            | null
          read: boolean
          shrot_message: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          link?: string | null
          message: string
          notification_id?: number
          notification_type?:
            | Database["public"]["Enums"]["notification_types"]
            | null
          read?: boolean
          shrot_message?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          link?: string | null
          message?: string
          notification_id?: number
          notification_type?:
            | Database["public"]["Enums"]["notification_types"]
            | null
          read?: boolean
          shrot_message?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          permission_id: number
          permission_name: string
        }
        Insert: {
          permission_id?: number
          permission_name: string
        }
        Update: {
          permission_id?: number
          permission_name?: string
        }
        Relationships: []
      }
      plan_courses: {
        Row: {
          course_id: number
          plan_id: number
        }
        Insert: {
          course_id: number
          plan_id: number
        }
        Update: {
          course_id?: number
          plan_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "plan_courses_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["plan_id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string | null
          currency: Database["public"]["Enums"]["currency_type"] | null
          deleted_at: string | null
          description: string | null
          duration_in_days: number
          features: string | null
          plan_id: number
          plan_name: string
          price: number
          thumbnail: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: Database["public"]["Enums"]["currency_type"] | null
          deleted_at?: string | null
          description?: string | null
          duration_in_days: number
          features?: string | null
          plan_id?: number
          plan_name: string
          price: number
          thumbnail?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: Database["public"]["Enums"]["currency_type"] | null
          deleted_at?: string | null
          description?: string | null
          duration_in_days?: number
          features?: string | null
          plan_id?: number
          plan_name?: string
          price?: number
          thumbnail?: string | null
        }
        Relationships: []
      }
      product_courses: {
        Row: {
          course_id: number
          product_id: number
        }
        Insert: {
          course_id: number
          product_id: number
        }
        Update: {
          course_id?: number
          product_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_product"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string | null
          currency: Database["public"]["Enums"]["currency_type"] | null
          description: string | null
          image: string | null
          name: string
          price: number
          product_id: number
        }
        Insert: {
          created_at?: string | null
          currency?: Database["public"]["Enums"]["currency_type"] | null
          description?: string | null
          image?: string | null
          name: string
          price: number
          product_id?: number
        }
        Update: {
          created_at?: string | null
          currency?: Database["public"]["Enums"]["currency_type"] | null
          description?: string | null
          image?: string | null
          name?: string
          price?: number
          product_id?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          currency_id: number | null
          data_person: Json | null
          full_name: string | null
          id: string
          stripe_customer_id: string | null
          stripeCustomerID: string | null
          username: string | null
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          currency_id?: number | null
          data_person?: Json | null
          full_name?: string | null
          id: string
          stripe_customer_id?: string | null
          stripeCustomerID?: string | null
          username?: string | null
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          currency_id?: number | null
          data_person?: Json | null
          full_name?: string | null
          id?: string
          stripe_customer_id?: string | null
          stripeCustomerID?: string | null
          username?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      question_options: {
        Row: {
          is_correct: boolean
          option_id: number
          option_text: string
          question_id: number
        }
        Insert: {
          is_correct?: boolean
          option_id?: number
          option_text: string
          question_id: number
        }
        Update: {
          is_correct?: boolean
          option_id?: number
          option_text?: string
          question_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "exam_questions"
            referencedColumns: ["question_id"]
          },
        ]
      }
      reviews: {
        Row: {
          created_at: string | null
          entity_id: number
          entity_type: Database["public"]["Enums"]["reviewable"]
          id: number
          rating: number
          review_text: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          entity_id: number
          entity_type: Database["public"]["Enums"]["reviewable"]
          id?: never
          rating: number
          review_text?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          entity_id?: number
          entity_type?: Database["public"]["Enums"]["reviewable"]
          id?: never
          rating?: number
          review_text?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          permission_id: number
          role_id: number
        }
        Insert: {
          permission_id: number
          role_id: number
        }
        Update: {
          permission_id?: number
          role_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["permission_id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["role_id"]
          },
        ]
      }
      roles: {
        Row: {
          role_id: number
          role_name: string
        }
        Insert: {
          role_id?: number
          role_name: string
        }
        Update: {
          role_id?: number
          role_name?: string
        }
        Relationships: []
      }
      submissions: {
        Row: {
          assignment_id: number
          file_path: string | null
          student_id: string
          submission_date: string | null
          submission_id: number
        }
        Insert: {
          assignment_id: number
          file_path?: string | null
          student_id: string
          submission_date?: string | null
          submission_id?: number
        }
        Update: {
          assignment_id?: number
          file_path?: string | null
          student_id?: string
          submission_date?: string | null
          submission_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "submissions_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["assignment_id"]
          },
          {
            foreignKeyName: "submissions_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at: string
          cancel_at_period_end: boolean | null
          canceled_at: string | null
          created: string
          current_period_end: string
          current_period_start: string
          end_date: string
          ended_at: string | null
          plan_id: number
          start_date: string
          subscription_id: number
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          transaction_id: number
          trial_end: string | null
          trial_start: string | null
          user_id: string
        }
        Insert: {
          cancel_at?: string
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created?: string
          current_period_end?: string
          current_period_start?: string
          end_date: string
          ended_at?: string | null
          plan_id: number
          start_date?: string
          subscription_id?: number
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          transaction_id: number
          trial_end?: string | null
          trial_start?: string | null
          user_id: string
        }
        Update: {
          cancel_at?: string
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created?: string
          current_period_end?: string
          current_period_start?: string
          end_date?: string
          ended_at?: string | null
          plan_id?: number
          start_date?: string
          subscription_id?: number
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          transaction_id?: number
          trial_end?: string | null
          trial_start?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "subscriptions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          created_at: string | null
          message: string
          message_id: number
          ticket_id: number | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          message: string
          message_id?: number
          ticket_id?: number | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          message?: string
          message_id?: number
          ticket_id?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["ticket_id"]
          },
          {
            foreignKeyName: "ticket_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          created_at: string | null
          description: string
          status: Database["public"]["Enums"]["ticket_status"] | null
          ticket_id: number
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          description: string
          status?: Database["public"]["Enums"]["ticket_status"] | null
          ticket_id?: number
          title: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          description?: string
          status?: Database["public"]["Enums"]["ticket_status"] | null
          ticket_id?: number
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          currency: Database["public"]["Enums"]["currency_type"] | null
          payment_method: string | null
          plan_id: number | null
          product_id: number | null
          status: Database["public"]["Enums"]["transaction_status"]
          transaction_date: string
          transaction_id: number
          user_id: string
        }
        Insert: {
          amount: number
          currency?: Database["public"]["Enums"]["currency_type"] | null
          payment_method?: string | null
          plan_id?: number | null
          product_id?: number | null
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_date?: string
          transaction_id?: number
          user_id: string
        }
        Update: {
          amount?: number
          currency?: Database["public"]["Enums"]["currency_type"] | null
          payment_method?: string | null
          plan_id?: number | null
          product_id?: number | null
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_date?: string
          transaction_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "transactions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: number
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: number
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: number
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      distinct_exam_views: {
        Row: {
          exam_course_id: number | null
          exam_created_at: string | null
          exam_created_by: string | null
          exam_date: string | null
          exam_description: string | null
          exam_duration: number | null
          exam_id: number | null
          exam_sequence: number | null
          exam_status: Database["public"]["Enums"]["status"] | null
          exam_title: string | null
          exam_updated_at: string | null
          user_id: string | null
          view_id: number | null
          viewed_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_views_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: false
            referencedRelation: "exams"
            referencedColumns: ["exam_id"]
          },
          {
            foreignKeyName: "exam_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exams_course_id_fkey"
            columns: ["exam_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "exams_created_by_fkey"
            columns: ["exam_created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      distinct_lesson_views: {
        Row: {
          lesson_content: string | null
          lesson_course_id: number | null
          lesson_created_at: string | null
          lesson_description: string | null
          lesson_embed_code: string | null
          lesson_id: number | null
          lesson_image: string | null
          lesson_sequence: number | null
          lesson_status: Database["public"]["Enums"]["status"] | null
          lesson_summary: string | null
          lesson_title: string | null
          lesson_updated_at: string | null
          lesson_video_url: string | null
          user_id: string | null
          view_id: number | null
          viewed_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_views_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["lesson_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
        ]
      }
      get_reviews: {
        Row: {
          created_at: string | null
          entity_id: number | null
          entity_type: Database["public"]["Enums"]["reviewable"] | null
          full_name: string | null
          profile_id: string | null
          rating: number | null
          review_id: number | null
          review_text: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      cancel_subscription: {
        Args: {
          _user_id: string
          _plan_id: number
        }
        Returns: undefined
      }
      create_exam_submission: {
        Args: {
          p_student_id: string
          p_exam_id: number
          p_answers: Json
        }
        Returns: number
      }
      create_notification: {
        Args: {
          _user_id: string
          _notification_type: string
          _message: string
        }
        Returns: undefined
      }
      create_transaction_for_renewal: {
        Args: {
          sub_id: number
          usr_id: string
          pln_id: number
        }
        Returns: number
      }
      custom_access_token_hook: {
        Args: {
          event: Json
        }
        Returns: Json
      }
      enroll_user: {
        Args: {
          _user_id: string
          _product_id: number
        }
        Returns: undefined
      }
      get_exam_submissions: {
        Args: {
          p_exam_id: number
        }
        Returns: {
          submission_id: number
          exam_id: number
          exam_title: string
          student_id: string
          submission_date: string
          score: number
          feedback: string
          evaluated_at: string
          is_reviewed: boolean
          full_name: string
        }[]
      }
      handle_new_subscription: {
        Args: {
          _user_id: string
          _plan_id: number
          _transaction_id: number
          _start_date?: string
        }
        Returns: undefined
      }
      identify_subscriptions_due_for_renewal: {
        Args: {
          renewal_period: unknown
        }
        Returns: {
          user_id: string
          subscription_id: number
          plan_id: number
          end_date: string
        }[]
      }
      notify_users_for_renewal: {
        Args: Record<PropertyKey, never>
        Returns: undefined
      }
      save_exam_feedback: {
        Args: {
          p_submission_id: number
          p_exam_id: number
          p_student_id: string
          p_answers: Json
          p_overall_feedback: string
          p_score: number
        }
        Returns: undefined
      }
    }
    Enums: {
      ai_sender_type:
        | "system"
        | "user"
        | "assistant"
        | "function"
        | "data"
        | "tool"
      app_role: "admin" | "moderator" | "teacher" | "student"
      chat_types: "free_chat" | "q&a" | "exam_prep" | "course_convo"
      currency_type: "usd" | "eur"
      difficulty_level: "easy" | "medium" | "hard"
      enrollement_status: "active" | "disabled"
      exercise_type:
        | "quiz"
        | "coding_challenge"
        | "essay"
        | "multiple_choice"
        | "true_false"
        | "fill_in_the_blank"
        | "discussion"
      notification_types:
        | "comment_reply"
        | "comment"
        | "exam_review"
        | "order_renewal"
      reactions: "like" | "dislike" | "boring" | "funny"
      review_status: "approved" | "pending" | "failed"
      reviewable: "lessons" | "courses" | "exams"
      status: "published" | "draft" | "archived"
      subscription_status: "active" | "canceled" | "expired" | "renewed"
      ticket_status: "open" | "in_progress" | "resolved" | "closed"
      transaction_status:
        | "pending"
        | "successful"
        | "failed"
        | "archived"
        | "canceled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (PublicSchema["Tables"] & PublicSchema["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (PublicSchema["Tables"] &
        PublicSchema["Views"])
    ? (PublicSchema["Tables"] &
        PublicSchema["Views"])[PublicTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof PublicSchema["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof PublicSchema["Tables"]
    ? PublicSchema["Tables"][PublicTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof PublicSchema["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof PublicSchema["Enums"]
    ? PublicSchema["Enums"][PublicEnumNameOrOptions]
    : never
