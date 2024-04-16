export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      comment_reactions: {
        Row: {
          comment_id: string
          created_at: string
          id: string
          reaction_type: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          id: string
          reaction_type: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          id?: string
          reaction_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_progress_for_course"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "comment_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      comments: {
        Row: {
          content: string
          content_type: string
          created_at: string
          deleted_at: string | null
          entity_id: number
          entity_type: string
          id: string
          parent_id: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          content: string
          content_type: string
          created_at?: string
          deleted_at?: string | null
          entity_id: number
          entity_type: string
          id?: string
          parent_id?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          content?: string
          content_type?: string
          created_at?: string
          deleted_at?: string | null
          entity_id?: number
          entity_type?: string
          id?: string
          parent_id?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      course_categories: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: number
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: number
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: number
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      course_enrollments: {
        Row: {
          completed_at: string | null
          course_id: number | null
          deleted_at: string | null
          enrolled_at: string
          id: number
          last_accessed_lesson_id: number | null
          progress: number | null
          status: Database["public"]["Enums"]["enrollment_status"]
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          course_id?: number | null
          deleted_at?: string | null
          enrolled_at?: string
          id?: number
          last_accessed_lesson_id?: number | null
          progress?: number | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          course_id?: number | null
          deleted_at?: string | null
          enrolled_at?: string
          id?: number
          last_accessed_lesson_id?: number | null
          progress?: number | null
          status?: Database["public"]["Enums"]["enrollment_status"]
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "user_progress_for_course"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_enrollments_last_accessed_lesson_id_fkey"
            columns: ["last_accessed_lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_progress_for_course"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "course_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      course_purchases: {
        Row: {
          course_id: number | null
          id: number
          purchased_at: string
          user_id: string | null
        }
        Insert: {
          course_id?: number | null
          id?: number
          purchased_at?: string
          user_id?: string | null
        }
        Update: {
          course_id?: number | null
          id?: number
          purchased_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_purchases_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_purchases_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "user_progress_for_course"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_progress_for_course"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "course_purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      courses: {
        Row: {
          archived_at: string | null
          author_id: string | null
          category_id: number | null
          created_at: string
          deleted_at: string | null
          description: string | null
          id: number
          product_id: number | null
          published_at: string | null
          status: Database["public"]["Enums"]["course_status"]
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          archived_at?: string | null
          author_id?: string | null
          category_id?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: number
          product_id?: number | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["course_status"]
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          archived_at?: string | null
          author_id?: string | null
          category_id?: number | null
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: number
          product_id?: number | null
          published_at?: string | null
          status?: Database["public"]["Enums"]["course_status"]
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
            referencedRelation: "user_progress_for_course"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "courses_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_category"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "course_categories"
            referencedColumns: ["id"]
          }
        ]
      }
      currencies: {
        Row: {
          code: string
          created_at: string
          id: number
          name: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: number
          name: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          content: string | null
          created_at: string | null
          embedding: string | null
          id: number
          metadata: Json | null
        }
        Insert: {
          content?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: number
          metadata?: Json | null
        }
        Update: {
          content?: string | null
          created_at?: string | null
          embedding?: string | null
          id?: number
          metadata?: Json | null
        }
        Relationships: []
      }
      invoice_line_items: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: number
          invoice_id: number
          line_amount: number
          product_id: number
          quantity: number
          unit_price: number
          vat_amount: number
          vat_percentage: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: number
          invoice_id: number
          line_amount?: number
          product_id: number
          quantity?: number
          unit_price?: number
          vat_amount?: number
          vat_percentage?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: number
          invoice_id?: number
          line_amount?: number
          product_id?: number
          quantity?: number
          unit_price?: number
          vat_amount?: number
          vat_percentage?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      invoices: {
        Row: {
          country: string
          created_at: string
          currency: number
          customer_id: string
          deleted_at: string | null
          due_date: string
          id: number
          invoice_date: string
          invoice_number: number
          paid_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
        }
        Insert: {
          country: string
          created_at?: string
          currency: number
          customer_id: string
          deleted_at?: string | null
          due_date: string
          id?: number
          invoice_date?: string
          invoice_number?: never
          paid_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
        }
        Update: {
          country?: string
          created_at?: string
          currency?: number
          customer_id?: string
          deleted_at?: string | null
          due_date?: string
          id?: number
          invoice_date?: string
          invoice_number?: never
          paid_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
        }
        Relationships: [
          {
            foreignKeyName: "invoices_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          }
        ]
      }
      lesson_localizations: {
        Row: {
          content: string | null
          language_code: Database["public"]["Enums"]["language_code"]
          lesson_id: number
          title: string
        }
        Insert: {
          content?: string | null
          language_code: Database["public"]["Enums"]["language_code"]
          lesson_id: number
          title: string
        }
        Update: {
          content?: string | null
          language_code?: Database["public"]["Enums"]["language_code"]
          lesson_id?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_lesson_localization_language"
            columns: ["language_code"]
            isOneToOne: false
            referencedRelation: "supported_languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fk_lesson_localization_lesson"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          }
        ]
      }
      lesson_progress: {
        Row: {
          completed_at: string | null
          id: number
          lesson_id: number | null
          progress_status: Database["public"]["Enums"]["lesson_progress_status"]
          started_at: string | null
          user_id: string | null
        }
        Insert: {
          completed_at?: string | null
          id?: number
          lesson_id?: number | null
          progress_status: Database["public"]["Enums"]["lesson_progress_status"]
          started_at?: string | null
          user_id?: string | null
        }
        Update: {
          completed_at?: string | null
          id?: number
          lesson_id?: number | null
          progress_status?: Database["public"]["Enums"]["lesson_progress_status"]
          started_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_progress_for_course"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "lesson_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      lessons: {
        Row: {
          course_id: number | null
          created_at: string
          deleted_at: string | null
          embed: string | null
          id: number
          sequence: number
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          course_id?: number | null
          created_at?: string
          deleted_at?: string | null
          embed?: string | null
          id?: number
          sequence: number
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          course_id?: number | null
          created_at?: string
          deleted_at?: string | null
          embed?: string | null
          id?: number
          sequence?: number
          updated_at?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "user_progress_for_course"
            referencedColumns: ["course_id"]
          }
        ]
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
            foreignKeyName: "fk_course"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_course"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "user_progress_for_course"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "fk_plan"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          }
        ]
      }
      plans: {
        Row: {
          billing_interval: unknown
          created_at: string
          deleted_at: string | null
          id: number
          product_id: number
        }
        Insert: {
          billing_interval?: unknown
          created_at?: string
          deleted_at?: string | null
          id?: number
          product_id: number
        }
        Update: {
          billing_interval?: unknown
          created_at?: string
          deleted_at?: string | null
          id?: number
          product_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "plans_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      products: {
        Row: {
          created_at: string
          deleted_at: string | null
          description: string | null
          id: number
          is_subscription: boolean
          name: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: number
          is_subscription?: boolean
          name: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          id?: number
          is_subscription?: boolean
          name?: string
        }
        Relationships: []
      }
      products_pricing: {
        Row: {
          created_at: string
          currency: number
          deleted_at: string | null
          from_date: string
          id: number
          price: number
          product_id: number
          to_date: string
        }
        Insert: {
          created_at?: string
          currency: number
          deleted_at?: string | null
          from_date: string
          id?: number
          price: number
          product_id: number
          to_date: string
        }
        Update: {
          created_at?: string
          currency?: number
          deleted_at?: string | null
          from_date?: string
          id?: number
          price?: number
          product_id?: number
          to_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_pricing_currency_fkey"
            columns: ["currency"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_pricing_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          }
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          currency_id: number | null
          full_name: string | null
          id: string
          preferred_language:
            | Database["public"]["Enums"]["language_code"]
            | null
          stripeCustomerID: string | null
          updated_at: string | null
          username: string | null
          website: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          currency_id?: number | null
          full_name?: string | null
          id: string
          preferred_language?:
            | Database["public"]["Enums"]["language_code"]
            | null
          stripeCustomerID?: string | null
          updated_at?: string | null
          username?: string | null
          website?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          currency_id?: number | null
          full_name?: string | null
          id?: string
          preferred_language?:
            | Database["public"]["Enums"]["language_code"]
            | null
          stripeCustomerID?: string | null
          updated_at?: string | null
          username?: string | null
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_currency_id_fkey"
            columns: ["currency_id"]
            isOneToOne: false
            referencedRelation: "currencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "user_progress_for_course"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      question_option_localizations: {
        Row: {
          language_code: Database["public"]["Enums"]["language_code"]
          option_id: number
          option_text: string
        }
        Insert: {
          language_code: Database["public"]["Enums"]["language_code"]
          option_id: number
          option_text: string
        }
        Update: {
          language_code?: Database["public"]["Enums"]["language_code"]
          option_id?: number
          option_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_option_localization_language"
            columns: ["language_code"]
            isOneToOne: false
            referencedRelation: "supported_languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fk_option_localization_option"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "question_options"
            referencedColumns: ["id"]
          }
        ]
      }
      question_options: {
        Row: {
          id: number
          is_correct: boolean
          question_id: number | null
        }
        Insert: {
          id?: number
          is_correct?: boolean
          question_id?: number | null
        }
        Update: {
          id?: number
          is_correct?: boolean
          question_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "test_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "vw_user_test_submissions"
            referencedColumns: ["question_id"]
          }
        ]
      }
      related_courses: {
        Row: {
          course_id: number
          related_course_id: number
        }
        Insert: {
          course_id: number
          related_course_id: number
        }
        Update: {
          course_id?: number
          related_course_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "related_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "related_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "user_progress_for_course"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "related_courses_related_course_id_fkey"
            columns: ["related_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "related_courses_related_course_id_fkey"
            columns: ["related_course_id"]
            isOneToOne: false
            referencedRelation: "user_progress_for_course"
            referencedColumns: ["course_id"]
          }
        ]
      }
      related_lessons: {
        Row: {
          lesson_id: number
          related_lesson_id: number
        }
        Insert: {
          lesson_id: number
          related_lesson_id: number
        }
        Update: {
          lesson_id?: number
          related_lesson_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "related_lessons_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "related_lessons_related_lesson_id_fkey"
            columns: ["related_lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          }
        ]
      }
      roles: {
        Row: {
          created_at: string
          id: number
          role: Database["public"]["Enums"]["user_role"]
        }
        Insert: {
          created_at?: string
          id?: number
          role: Database["public"]["Enums"]["user_role"]
        }
        Update: {
          created_at?: string
          id?: number
          role?: Database["public"]["Enums"]["user_role"]
        }
        Relationships: []
      }
      submission_answers: {
        Row: {
          given_answer: string | null
          id: number
          is_correct: boolean | null
          question_id: number | null
          submission_id: number | null
          teacher_comment: string | null
        }
        Insert: {
          given_answer?: string | null
          id?: number
          is_correct?: boolean | null
          question_id?: number | null
          submission_id?: number | null
          teacher_comment?: string | null
        }
        Update: {
          given_answer?: string | null
          id?: number
          is_correct?: boolean | null
          question_id?: number | null
          submission_id?: number | null
          teacher_comment?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submission_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "test_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "vw_user_test_submissions"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "submission_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "test_submissions"
            referencedColumns: ["id"]
          }
        ]
      }
      subscriptions: {
        Row: {
          cancelled_at: string | null
          created_at: string
          customer_id: string
          deleted_at: string | null
          downgraded_at: string | null
          downgraded_to_plan_id: number | null
          ends_at: string | null
          id: number
          invoice_id: number
          plan_id: number
          renewed_at: string | null
          renewed_subscription_id: number | null
          starts_at: string
          status: Database["public"]["Enums"]["subscription_status"]
          upgraded_at: string | null
          upgraded_to_plan_id: number | null
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          customer_id: string
          deleted_at?: string | null
          downgraded_at?: string | null
          downgraded_to_plan_id?: number | null
          ends_at?: string | null
          id?: number
          invoice_id: number
          plan_id: number
          renewed_at?: string | null
          renewed_subscription_id?: number | null
          starts_at?: string
          status: Database["public"]["Enums"]["subscription_status"]
          upgraded_at?: string | null
          upgraded_to_plan_id?: number | null
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          customer_id?: string
          deleted_at?: string | null
          downgraded_at?: string | null
          downgraded_to_plan_id?: number | null
          ends_at?: string | null
          id?: number
          invoice_id?: number
          plan_id?: number
          renewed_at?: string | null
          renewed_subscription_id?: number | null
          starts_at?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          upgraded_at?: string | null
          upgraded_to_plan_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_downgraded_to_plan_id_fkey"
            columns: ["downgraded_to_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_renewed_subscription_id_fkey"
            columns: ["renewed_subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_upgraded_to_plan_id_fkey"
            columns: ["upgraded_to_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          }
        ]
      }
      supported_languages: {
        Row: {
          code: Database["public"]["Enums"]["language_code"]
          created_at: string
          name: string
        }
        Insert: {
          code?: Database["public"]["Enums"]["language_code"]
          created_at?: string
          name: string
        }
        Update: {
          code?: Database["public"]["Enums"]["language_code"]
          created_at?: string
          name?: string
        }
        Relationships: []
      }
      test_localizations: {
        Row: {
          description: string | null
          language_code: Database["public"]["Enums"]["language_code"]
          test_id: number
          title: string
        }
        Insert: {
          description?: string | null
          language_code: Database["public"]["Enums"]["language_code"]
          test_id: number
          title: string
        }
        Update: {
          description?: string | null
          language_code?: Database["public"]["Enums"]["language_code"]
          test_id?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_test_localization_language"
            columns: ["language_code"]
            isOneToOne: false
            referencedRelation: "supported_languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fk_test_localization_test"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          }
        ]
      }
      test_question_localizations: {
        Row: {
          language_code: Database["public"]["Enums"]["language_code"]
          question_id: number
          question_text: string
        }
        Insert: {
          language_code: Database["public"]["Enums"]["language_code"]
          question_id: number
          question_text: string
        }
        Update: {
          language_code?: Database["public"]["Enums"]["language_code"]
          question_id?: number
          question_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_question_localization_language"
            columns: ["language_code"]
            isOneToOne: false
            referencedRelation: "supported_languages"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "fk_question_localization_question"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "test_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_question_localization_question"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "vw_user_test_submissions"
            referencedColumns: ["question_id"]
          }
        ]
      }
      test_questions: {
        Row: {
          created_at: string
          id: number
          question_type:
            | Database["public"]["Enums"]["user_question_type"]
            | null
          test_id: number | null
        }
        Insert: {
          created_at?: string
          id?: number
          question_type?:
            | Database["public"]["Enums"]["user_question_type"]
            | null
          test_id?: number | null
        }
        Update: {
          created_at?: string
          id?: number
          question_type?:
            | Database["public"]["Enums"]["user_question_type"]
            | null
          test_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "test_questions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          }
        ]
      }
      test_submissions: {
        Row: {
          id: number
          is_approved: boolean | null
          is_latest: boolean | null
          score: number | null
          submitted_at: string
          teacher_review: string | null
          test_id: number | null
          user_id: string | null
        }
        Insert: {
          id?: number
          is_approved?: boolean | null
          is_latest?: boolean | null
          score?: number | null
          submitted_at?: string
          teacher_review?: string | null
          test_id?: number | null
          user_id?: string | null
        }
        Update: {
          id?: number
          is_approved?: boolean | null
          is_latest?: boolean | null
          score?: number | null
          submitted_at?: string
          teacher_review?: string | null
          test_id?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "test_submissions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_progress_for_course"
            referencedColumns: ["user_id"]
          },
          {
            foreignKeyName: "test_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      tests: {
        Row: {
          course_id: number | null
          created_at: string
          id: number
          retake_interval: unknown | null
          time_for_test: number
        }
        Insert: {
          course_id?: number | null
          created_at?: string
          id?: number
          retake_interval?: unknown | null
          time_for_test?: number
        }
        Update: {
          course_id?: number | null
          created_at?: string
          id?: number
          retake_interval?: unknown | null
          time_for_test?: number
        }
        Relationships: [
          {
            foreignKeyName: "tests_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tests_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "user_progress_for_course"
            referencedColumns: ["course_id"]
          }
        ]
      }
      user_roles: {
        Row: {
          profile_id: string
          role_id: number
        }
        Insert: {
          profile_id: string
          role_id: number
        }
        Update: {
          profile_id?: string
          role_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "fk_profile"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_role"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "roles"
            referencedColumns: ["id"]
          }
        ]
      }
    }
    Views: {
      user_progress_for_course: {
        Row: {
          completed_lessons: number | null
          course_id: number | null
          progress_percentage: number | null
          total_lessons: number | null
          user_id: string | null
        }
        Relationships: []
      }
      vw_user_test_submissions: {
        Row: {
          given_answer: string | null
          is_approved: boolean | null
          is_correct: boolean | null
          option_text: string | null
          question_id: number | null
          question_text: string | null
          question_type:
            | Database["public"]["Enums"]["user_question_type"]
            | null
          submitted_at: string | null
          test_id: number | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "test_submissions_test_id_fkey"
            columns: ["test_id"]
            isOneToOne: false
            referencedRelation: "tests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "test_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_progress_for_course"
            referencedColumns: ["user_id"]
          }
        ]
      }
    }
    Functions: {
      auth_role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      check_role:
        | {
            Args: {
              user_id: string
              role_to_check: Database["public"]["Enums"]["user_role"]
            }
            Returns: boolean
          }
        | {
            Args: {
              user_id: string
              role_to_check: string
            }
            Returns: boolean
          }
      check_user_permission: {
        Args: {
          user_id: string
          permission: Database["public"]["Enums"]["user_role"]
        }
        Returns: boolean
      }
      delete_claim: {
        Args: {
          uid: string
          claim: string
        }
        Returns: string
      }
      gbt_bit_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_bool_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_bool_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_bpchar_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_bytea_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_cash_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_cash_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_date_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_date_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_decompress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_enum_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_enum_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_float4_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_float4_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_float8_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_float8_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_inet_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_int2_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_int2_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_int4_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_int4_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_int8_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_int8_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_intv_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_intv_decompress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_intv_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_macad_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_macad_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_macad8_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_macad8_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_numeric_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_oid_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_oid_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_text_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_time_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_time_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_timetz_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_ts_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_ts_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_tstz_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_uuid_compress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_uuid_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_var_decompress: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbt_var_fetch: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey_var_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey_var_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey16_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey16_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey2_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey2_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey32_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey32_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey4_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey4_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey8_in: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      gbtreekey8_out: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      get_claim: {
        Args: {
          uid: string
          claim: string
        }
        Returns: Json
      }
      get_claims: {
        Args: {
          uid: string
        }
        Returns: Json
      }
      get_course_progress: {
        Args: {
          course_id_arg: number
          user_id_arg: string
        }
        Returns: {
          user_id: string
          course_id: number
          completed_lessons: number
          total_lessons: number
          progress_percentage: number
          total_tests: number
          tests_submitted: number
          tests_approved: number
        }[]
      }
      get_my_claim: {
        Args: {
          claim: string
        }
        Returns: Json
      }
      get_my_claims: {
        Args: Record<PropertyKey, never>
        Returns: Json
      }
      get_user_role: {
        Args: {
          user_id: string
        }
        Returns: string
      }
      hnswhandler: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_admin_or_teacher: {
        Args: {
          user_id: string
        }
        Returns: boolean
      }
      is_claims_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      ivfflathandler: {
        Args: {
          "": unknown
        }
        Returns: unknown
      }
      match_documents: {
        Args: {
          query_embedding: string
          match_count?: number
          filter?: Json
          match_threshold?: number
        }
        Returns: {
          id: number
          content: string
          metadata: Json
          embedding: Json
          similarity: number
        }[]
      }
      set_claim: {
        Args: {
          uid: string
          claim: string
          value: Json
        }
        Returns: string
      }
      vector_avg: {
        Args: {
          "": number[]
        }
        Returns: string
      }
      vector_dims: {
        Args: {
          "": string
        }
        Returns: number
      }
      vector_norm: {
        Args: {
          "": string
        }
        Returns: number
      }
      vector_out: {
        Args: {
          "": string
        }
        Returns: unknown
      }
      vector_send: {
        Args: {
          "": string
        }
        Returns: string
      }
      vector_typmod_in: {
        Args: {
          "": unknown[]
        }
        Returns: number
      }
    }
    Enums: {
      course_status: "draft" | "published" | "archived"
      enrollment_status: "active" | "completed" | "inactive"
      invoice_status: "draft" | "unpaid" | "paid" | "pending"
      language_code:
        | "aa"
        | "ab"
        | "ac"
        | "ad"
        | "ae"
        | "af"
        | "ag"
        | "ah"
        | "ai"
        | "aj"
        | "ak"
        | "al"
        | "am"
        | "an"
        | "ao"
        | "ap"
        | "aq"
        | "ar"
        | "as"
        | "at"
        | "au"
        | "av"
        | "aw"
        | "ax"
        | "ay"
        | "azba"
        | "bb"
        | "bc"
        | "bd"
        | "be"
        | "bf"
        | "bg"
        | "bh"
        | "bi"
        | "bj"
        | "bk"
        | "bl"
        | "bm"
        | "bn"
        | "bo"
        | "bp"
        | "bq"
        | "br"
        | "bs"
        | "bt"
        | "bu"
        | "bv"
        | "bw"
        | "bx"
        | "by"
        | "bzca"
        | "cb"
        | "cc"
        | "cd"
        | "ce"
        | "cf"
        | "cg"
        | "ch"
        | "ci"
        | "cj"
        | "ck"
        | "cl"
        | "cm"
        | "cn"
        | "co"
        | "cp"
        | "cq"
        | "cr"
        | "cs"
        | "ct"
        | "cu"
        | "cv"
        | "cw"
        | "cx"
        | "cy"
        | "czda"
        | "db"
        | "dc"
        | "dd"
        | "de"
        | "df"
        | "dg"
        | "dh"
        | "di"
        | "dj"
        | "dk"
        | "dl"
        | "dm"
        | "dn"
        | "do"
        | "dp"
        | "dq"
        | "dr"
        | "ds"
        | "dt"
        | "du"
        | "dv"
        | "dw"
        | "dx"
        | "dy"
        | "dzea"
        | "eb"
        | "ec"
        | "ed"
        | "ee"
        | "ef"
        | "eg"
        | "eh"
        | "ei"
        | "ej"
        | "ek"
        | "el"
        | "em"
        | "en"
        | "eo"
        | "ep"
        | "eq"
        | "er"
        | "es"
        | "et"
        | "eu"
        | "ev"
        | "ew"
        | "ex"
        | "ey"
        | "ezfa"
        | "fb"
        | "fc"
        | "fd"
        | "fe"
        | "ff"
        | "fg"
        | "fh"
        | "fi"
        | "fj"
        | "fk"
        | "fl"
        | "fm"
        | "fn"
        | "fo"
        | "fp"
        | "fq"
        | "fr"
        | "fs"
        | "ft"
        | "fu"
        | "fv"
        | "fw"
        | "fx"
        | "fy"
        | "fzga"
        | "gb"
        | "gc"
        | "gd"
        | "ge"
        | "gf"
        | "gg"
        | "gh"
        | "gi"
        | "gj"
        | "gk"
        | "gl"
        | "gm"
        | "gn"
        | "go"
        | "gp"
        | "gq"
        | "gr"
        | "gs"
        | "gt"
        | "gu"
        | "gv"
        | "gw"
        | "gx"
        | "gy"
        | "gzha"
        | "hb"
        | "hc"
        | "hd"
        | "he"
        | "hf"
        | "hg"
        | "hh"
        | "hi"
        | "hj"
        | "hk"
        | "hl"
        | "hm"
        | "hn"
        | "ho"
        | "hp"
        | "hq"
        | "hr"
        | "hs"
        | "ht"
        | "hu"
        | "hv"
        | "hw"
        | "hx"
        | "hy"
        | "hzia"
        | "ib"
        | "ic"
        | "id"
        | "ie"
        | "if"
        | "ig"
        | "ih"
        | "ii"
        | "ij"
        | "ik"
        | "il"
        | "im"
        | "in"
        | "io"
        | "ip"
        | "iq"
        | "ir"
        | "is"
        | "it"
        | "iu"
        | "iv"
        | "iw"
        | "ix"
        | "iy"
        | "izja"
        | "jb"
        | "jc"
        | "jd"
        | "je"
        | "jf"
        | "jg"
        | "jh"
        | "ji"
        | "jj"
        | "jk"
        | "jl"
        | "jm"
        | "jn"
        | "jo"
        | "jp"
        | "jq"
        | "jr"
        | "js"
        | "jt"
        | "ju"
        | "jv"
        | "jw"
        | "jx"
        | "jy"
        | "jzka"
        | "kb"
        | "kc"
        | "kd"
        | "ke"
        | "kf"
        | "kg"
        | "kh"
        | "ki"
        | "kj"
        | "kk"
        | "kl"
        | "km"
        | "kn"
        | "ko"
        | "kp"
        | "kq"
        | "kr"
        | "ks"
        | "kt"
        | "ku"
        | "kv"
        | "kw"
        | "kx"
        | "ky"
        | "kzla"
        | "lb"
        | "lc"
        | "ld"
        | "le"
        | "lf"
        | "lg"
        | "lh"
        | "li"
        | "lj"
        | "lk"
        | "ll"
        | "lm"
        | "ln"
        | "lo"
        | "lp"
        | "lq"
        | "lr"
        | "ls"
        | "lt"
        | "lu"
        | "lv"
        | "lw"
        | "lx"
        | "ly"
        | "lzma"
        | "mb"
        | "mc"
        | "md"
        | "me"
        | "mf"
        | "mg"
        | "mh"
        | "mi"
        | "mj"
        | "mk"
        | "ml"
        | "mm"
        | "mn"
        | "mo"
        | "mp"
        | "mq"
        | "mr"
        | "ms"
        | "mt"
        | "mu"
        | "mv"
        | "mw"
        | "mx"
        | "my"
        | "mzna"
        | "nb"
        | "nc"
        | "nd"
        | "ne"
        | "nf"
        | "ng"
        | "nh"
        | "ni"
        | "nj"
        | "nk"
        | "nl"
        | "nm"
        | "nn"
        | "no"
        | "np"
        | "nq"
        | "nr"
        | "ns"
        | "nt"
        | "nu"
        | "nv"
        | "nw"
        | "nx"
        | "ny"
        | "nzoa"
        | "ob"
        | "oc"
        | "od"
        | "oe"
        | "of"
        | "og"
        | "oh"
        | "oi"
        | "oj"
        | "ok"
        | "ol"
        | "om"
        | "on"
        | "oo"
        | "op"
        | "oq"
        | "or"
        | "os"
        | "ot"
        | "ou"
        | "ov"
        | "ow"
        | "ox"
        | "oy"
        | "ozpa"
        | "pb"
        | "pc"
        | "pd"
        | "pe"
        | "pf"
        | "pg"
        | "ph"
        | "pi"
        | "pj"
        | "pk"
        | "pl"
        | "pm"
        | "pn"
        | "po"
        | "pp"
        | "pq"
        | "pr"
        | "ps"
        | "pt"
        | "pu"
        | "pv"
        | "pw"
        | "px"
        | "py"
        | "pzqa"
        | "qb"
        | "qc"
        | "qd"
        | "qe"
        | "qf"
        | "qg"
        | "qh"
        | "qi"
        | "qj"
        | "qk"
        | "ql"
        | "qm"
        | "qn"
        | "qo"
        | "qp"
        | "qq"
        | "qr"
        | "qs"
        | "qt"
        | "qu"
        | "qv"
        | "qw"
        | "qx"
        | "qy"
        | "qzra"
        | "rb"
        | "rc"
        | "rd"
        | "re"
        | "rf"
        | "rg"
        | "rh"
        | "ri"
        | "rj"
        | "rk"
        | "rl"
        | "rm"
        | "rn"
        | "ro"
        | "rp"
        | "rq"
        | "rr"
        | "rs"
        | "rt"
        | "ru"
        | "rv"
        | "rw"
        | "rx"
        | "ry"
        | "rzsa"
        | "sb"
        | "sc"
        | "sd"
        | "se"
        | "sf"
        | "sg"
        | "sh"
        | "si"
        | "sj"
        | "sk"
        | "sl"
        | "sm"
        | "sn"
        | "so"
        | "sp"
        | "sq"
        | "sr"
        | "ss"
        | "st"
        | "su"
        | "sv"
        | "sw"
        | "sx"
        | "sy"
        | "szta"
        | "tb"
        | "tc"
        | "td"
        | "te"
        | "tf"
        | "tg"
        | "th"
        | "ti"
        | "tj"
        | "tk"
        | "tl"
        | "tm"
        | "tn"
        | "to"
        | "tp"
        | "tq"
        | "tr"
        | "ts"
        | "tt"
        | "tu"
        | "tv"
        | "tw"
        | "tx"
        | "ty"
        | "tzua"
        | "ub"
        | "uc"
        | "ud"
        | "ue"
        | "uf"
        | "ug"
        | "uh"
        | "ui"
        | "uj"
        | "uk"
        | "ul"
        | "um"
        | "un"
        | "uo"
        | "up"
        | "uq"
        | "ur"
        | "us"
        | "ut"
        | "uu"
        | "uv"
        | "uw"
        | "ux"
        | "uy"
        | "uzva"
        | "vb"
        | "vc"
        | "vd"
        | "ve"
        | "vf"
        | "vg"
        | "vh"
        | "vi"
        | "vj"
        | "vk"
        | "vl"
        | "vm"
        | "vn"
        | "vo"
        | "vp"
        | "vq"
        | "vr"
        | "vs"
        | "vt"
        | "vu"
        | "vv"
        | "vw"
        | "vx"
        | "vy"
        | "vzwa"
        | "wb"
        | "wc"
        | "wd"
        | "we"
        | "wf"
        | "wg"
        | "wh"
        | "wi"
        | "wj"
        | "wk"
        | "wl"
        | "wm"
        | "wn"
        | "wo"
        | "wp"
        | "wq"
        | "wr"
        | "ws"
        | "wt"
        | "wu"
        | "wv"
        | "ww"
        | "wx"
        | "wy"
        | "wzxa"
        | "xb"
        | "xc"
        | "xd"
        | "xe"
        | "xf"
        | "xg"
        | "xh"
        | "xi"
        | "xj"
        | "xk"
        | "xl"
        | "xm"
        | "xn"
        | "xo"
        | "xp"
        | "xq"
        | "xr"
        | "xs"
        | "xt"
        | "xu"
        | "xv"
        | "xw"
        | "xx"
        | "xy"
        | "xzya"
        | "yb"
        | "yc"
        | "yd"
        | "ye"
        | "yf"
        | "yg"
        | "yh"
        | "yi"
        | "yj"
        | "yk"
        | "yl"
        | "ym"
        | "yn"
        | "yo"
        | "yp"
        | "yq"
        | "yr"
        | "ys"
        | "yt"
        | "yu"
        | "yv"
        | "yw"
        | "yx"
        | "yy"
        | "yzza"
        | "zb"
        | "zc"
        | "zd"
        | "ze"
        | "zf"
        | "zg"
        | "zh"
        | "zi"
        | "zj"
        | "zk"
        | "zl"
        | "zm"
        | "zn"
        | "zo"
        | "zp"
        | "zq"
        | "zr"
        | "zs"
        | "zt"
        | "zu"
        | "zv"
        | "zw"
        | "zx"
        | "zy"
        | "zz"
      lesson_progress_status: "not_started" | "in_progress" | "completed"
      subscription_status: "inactive" | "active" | "upgraded"
      user_question_type: "multiple_choice" | "true_false" | "fill_in"
      user_role: "admin" | "teacher" | "student"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

export type Tables<
  PublicTableNameOrOptions extends
    | keyof (Database["public"]["Tables"] & Database["public"]["Views"])
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
        Database[PublicTableNameOrOptions["schema"]]["Views"])
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? (Database[PublicTableNameOrOptions["schema"]]["Tables"] &
      Database[PublicTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : PublicTableNameOrOptions extends keyof (Database["public"]["Tables"] &
      Database["public"]["Views"])
  ? (Database["public"]["Tables"] &
      Database["public"]["Views"])[PublicTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  PublicTableNameOrOptions extends
    | keyof Database["public"]["Tables"]
    | { schema: keyof Database },
  TableName extends PublicTableNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = PublicTableNameOrOptions extends { schema: keyof Database }
  ? Database[PublicTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : PublicTableNameOrOptions extends keyof Database["public"]["Tables"]
  ? Database["public"]["Tables"][PublicTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  PublicEnumNameOrOptions extends
    | keyof Database["public"]["Enums"]
    | { schema: keyof Database },
  EnumName extends PublicEnumNameOrOptions extends { schema: keyof Database }
    ? keyof Database[PublicEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = PublicEnumNameOrOptions extends { schema: keyof Database }
  ? Database[PublicEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : PublicEnumNameOrOptions extends keyof Database["public"]["Enums"]
  ? Database["public"]["Enums"][PublicEnumNameOrOptions]
  : never
