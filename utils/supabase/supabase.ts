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
          created_at: string | null
          user_id: string
        }
        Insert: {
          chat_id?: number
          created_at?: string | null
          user_id: string
        }
        Update: {
          chat_id?: number
          created_at?: string | null
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
          status: string
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
          status?: string
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
          status?: string
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
          subscription_id: number | null
          user_id: string
        }
        Insert: {
          course_id: number
          enrollment_date?: string | null
          enrollment_id?: number
          product_id?: number | null
          subscription_id?: number | null
          user_id: string
        }
        Update: {
          course_id?: number
          enrollment_date?: string | null
          enrollment_id?: number
          product_id?: number | null
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
          exam_id: number
          student_id: string
          submission_date: string | null
          submission_id: number
        }
        Insert: {
          exam_id: number
          student_id: string
          submission_date?: string | null
          submission_id?: number
        }
        Update: {
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
      exams: {
        Row: {
          course_id: number
          created_at: string | null
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
      lessons: {
        Row: {
          content: string | null
          course_id: number | null
          created_at: string | null
          description: string | null
          embed_code: string | null
          id: number
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
        }
        Insert: {
          created_at?: string
          id?: number
          lesson_id?: number | null
          system_prompt?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          lesson_id?: number | null
          system_prompt?: string | null
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
          chat_id: number | null
          created_at: string
          id: number
          message: string | null
          sender: string | null
        }
        Insert: {
          chat_id?: number | null
          created_at?: string
          id?: number
          message?: string | null
          sender?: string | null
        }
        Update: {
          chat_id?: number | null
          created_at?: string
          id?: number
          message?: string | null
          sender?: string | null
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
          name: string
          price: number
          product_id: number
        }
        Insert: {
          created_at?: string | null
          currency?: Database["public"]["Enums"]["currency_type"] | null
          description?: string | null
          name: string
          price: number
          product_id?: number
        }
        Update: {
          created_at?: string | null
          currency?: Database["public"]["Enums"]["currency_type"] | null
          description?: string | null
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
      review_comments: {
        Row: {
          comment_text: string
          created_at: string | null
          id: number
          review_id: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          comment_text: string
          created_at?: string | null
          id?: never
          review_id: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          comment_text?: string
          created_at?: string | null
          id?: never
          review_id?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_comments_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "reviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "review_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          created_at: string | null
          entity_id: number
          entity_type: string
          id: number
          rating: number
          review_text: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          entity_id: number
          entity_type: string
          id?: never
          rating: number
          review_text?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          entity_id?: number
          entity_type?: string
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
          end_date: string
          plan_id: number
          start_date: string
          subscription_id: number
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          user_id: string
        }
        Insert: {
          end_date: string
          plan_id: number
          start_date?: string
          subscription_id?: number
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          user_id: string
        }
        Update: {
          end_date?: string
          plan_id?: number
          start_date?: string
          subscription_id?: number
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
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
            foreignKeyName: "subscriptions_user_id_fkey"
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
      [_ in never]: never
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
        Returns: undefined
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
      handle_new_subscription: {
        Args: {
          _user_id: string
          _plan_id: number
          _transaction_id: number
          _start_date?: string
        }
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
      currency_type: "usd" | "eur"
      review_status: "approved" | "pending" | "failed"
      status: "published" | "draft" | "archived"
      subscription_status: "active" | "canceled" | "expired" | "renewed"
      transaction_status:
        | "pending"
        | "successfull"
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
