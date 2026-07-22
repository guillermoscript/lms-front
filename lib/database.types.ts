export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      aristotle_messages: {
        Row: {
          content: string
          context_page: string | null
          created_at: string | null
          message_id: string
          role: string
          session_id: string
        }
        Insert: {
          content: string
          context_page?: string | null
          created_at?: string | null
          message_id?: string
          role: string
          session_id: string
        }
        Update: {
          content?: string
          context_page?: string | null
          created_at?: string | null
          message_id?: string
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aristotle_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "aristotle_sessions"
            referencedColumns: ["session_id"]
          },
        ]
      }
      aristotle_sessions: {
        Row: {
          course_id: number
          ended_at: string | null
          session_id: string
          started_at: string | null
          summary: string | null
          tenant_id: string
          topics_discussed: string[] | null
          user_id: string
        }
        Insert: {
          course_id: number
          ended_at?: string | null
          session_id?: string
          started_at?: string | null
          summary?: string | null
          tenant_id: string
          topics_discussed?: string[] | null
          user_id: string
        }
        Update: {
          course_id?: number
          ended_at?: string | null
          session_id?: string
          started_at?: string | null
          summary?: string | null
          tenant_id?: string
          topics_discussed?: string[] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "aristotle_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "aristotle_sessions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "aristotle_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
          {
            foreignKeyName: "assignments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["course_id"]
          },
        ]
      }
      certificate_shares: {
        Row: {
          certificate_id: string | null
          ip_address: unknown
          last_viewed_at: string | null
          platform: string | null
          share_id: string
          share_url: string | null
          shared_at: string | null
          user_agent: string | null
          view_count: number | null
        }
        Insert: {
          certificate_id?: string | null
          ip_address?: unknown
          last_viewed_at?: string | null
          platform?: string | null
          share_id?: string
          share_url?: string | null
          shared_at?: string | null
          user_agent?: string | null
          view_count?: number | null
        }
        Update: {
          certificate_id?: string | null
          ip_address?: unknown
          last_viewed_at?: string | null
          platform?: string | null
          share_id?: string
          share_url?: string | null
          shared_at?: string | null
          user_agent?: string | null
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "certificate_shares_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["certificate_id"]
          },
        ]
      }
      certificate_templates: {
        Row: {
          achievement_type: string | null
          alignment_targets: Json | null
          allow_revocation: boolean | null
          course_id: number | null
          created_at: string | null
          created_by: string | null
          custom_fields: Json | null
          description: string | null
          design_settings: Json | null
          expiration_days: number | null
          is_active: boolean | null
          issuance_criteria: string | null
          issuer_name: string | null
          issuer_url: string | null
          logo_url: string | null
          min_exam_pass_score: number | null
          min_lesson_completion_pct: number | null
          required_exam_ids: number[] | null
          required_lesson_ids: number[] | null
          requires_all_exams: boolean | null
          signature_image_url: string | null
          signature_name: string | null
          signature_title: string | null
          tags: string[] | null
          template_id: string
          template_name: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          achievement_type?: string | null
          alignment_targets?: Json | null
          allow_revocation?: boolean | null
          course_id?: number | null
          created_at?: string | null
          created_by?: string | null
          custom_fields?: Json | null
          description?: string | null
          design_settings?: Json | null
          expiration_days?: number | null
          is_active?: boolean | null
          issuance_criteria?: string | null
          issuer_name?: string | null
          issuer_url?: string | null
          logo_url?: string | null
          min_exam_pass_score?: number | null
          min_lesson_completion_pct?: number | null
          required_exam_ids?: number[] | null
          required_lesson_ids?: number[] | null
          requires_all_exams?: boolean | null
          signature_image_url?: string | null
          signature_name?: string | null
          signature_title?: string | null
          tags?: string[] | null
          template_id?: string
          template_name: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          achievement_type?: string | null
          alignment_targets?: Json | null
          allow_revocation?: boolean | null
          course_id?: number | null
          created_at?: string | null
          created_by?: string | null
          custom_fields?: Json | null
          description?: string | null
          design_settings?: Json | null
          expiration_days?: number | null
          is_active?: boolean | null
          issuance_criteria?: string | null
          issuer_name?: string | null
          issuer_url?: string | null
          logo_url?: string | null
          min_exam_pass_score?: number | null
          min_lesson_completion_pct?: number | null
          required_exam_ids?: number[] | null
          required_lesson_ids?: number[] | null
          requires_all_exams?: boolean | null
          signature_image_url?: string | null
          signature_name?: string | null
          signature_title?: string | null
          tags?: string[] | null
          template_id?: string
          template_name?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificate_templates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "certificate_templates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "certificate_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "certificate_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificate_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      certificate_verification_log: {
        Row: {
          certificate_id: string | null
          country_code: string | null
          ip_address: unknown
          log_id: string
          referrer: string | null
          response_time_ms: number | null
          user_agent: string | null
          verification_code: string | null
          verification_status: string | null
          verified_at: string | null
        }
        Insert: {
          certificate_id?: string | null
          country_code?: string | null
          ip_address?: unknown
          log_id?: string
          referrer?: string | null
          response_time_ms?: number | null
          user_agent?: string | null
          verification_code?: string | null
          verification_status?: string | null
          verified_at?: string | null
        }
        Update: {
          certificate_id?: string | null
          country_code?: string | null
          ip_address?: unknown
          log_id?: string
          referrer?: string | null
          response_time_ms?: number | null
          user_agent?: string | null
          verification_code?: string | null
          verification_status?: string | null
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "certificate_verification_log_certificate_id_fkey"
            columns: ["certificate_id"]
            isOneToOne: false
            referencedRelation: "certificates"
            referencedColumns: ["certificate_id"]
          },
        ]
      }
      certificates: {
        Row: {
          badge_image_url: string | null
          blockchain_anchor_id: string | null
          certificate_id: string
          completion_data: Json
          course_id: number | null
          created_at: string | null
          credential_json: Json
          credential_jwt: string | null
          enrollment_id: number | null
          expires_at: string | null
          issued_at: string | null
          pdf_url: string | null
          revoke_reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          share_count: number | null
          template_id: string | null
          tenant_id: string
          updated_at: string | null
          user_id: string | null
          verification_code: string
          view_count: number | null
        }
        Insert: {
          badge_image_url?: string | null
          blockchain_anchor_id?: string | null
          certificate_id?: string
          completion_data: Json
          course_id?: number | null
          created_at?: string | null
          credential_json: Json
          credential_jwt?: string | null
          enrollment_id?: number | null
          expires_at?: string | null
          issued_at?: string | null
          pdf_url?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          share_count?: number | null
          template_id?: string | null
          tenant_id?: string
          updated_at?: string | null
          user_id?: string | null
          verification_code: string
          view_count?: number | null
        }
        Update: {
          badge_image_url?: string | null
          blockchain_anchor_id?: string | null
          certificate_id?: string
          completion_data?: Json
          course_id?: number | null
          created_at?: string | null
          credential_json?: Json
          credential_jwt?: string | null
          enrollment_id?: number | null
          expires_at?: string | null
          issued_at?: string | null
          pdf_url?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          share_count?: number | null
          template_id?: string | null
          tenant_id?: string
          updated_at?: string | null
          user_id?: string | null
          verification_code?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "certificates_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "certificates_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["enrollment_id"]
          },
          {
            foreignKeyName: "certificates_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "certificates_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "certificate_templates"
            referencedColumns: ["template_id"]
          },
          {
            foreignKeyName: "certificates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "certificates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "certificates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_conversations: {
        Row: {
          conversation_id: string
          created_at: string | null
          tenant_id: string
          title: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id?: string
          created_at?: string | null
          tenant_id: string
          title?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          message_id: string
          role: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          message_id?: string
          role: string
          tenant_id: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          message_id?: string
          role?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["conversation_id"]
          },
          {
            foreignKeyName: "chat_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
        Relationships: []
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
      comments: {
        Row: {
          comment_id: number
          content: string
          created_at: string | null
          lesson_id: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          comment_id?: number
          content: string
          created_at?: string | null
          lesson_id: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          comment_id?: number
          content?: string
          created_at?: string | null
          lesson_id?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      community_comments: {
        Row: {
          author_id: string
          content: string
          created_at: string
          id: string
          is_hidden: boolean
          parent_comment_id: string | null
          post_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          content: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          parent_comment_id?: string | null
          post_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          content?: string
          created_at?: string
          id?: string
          is_hidden?: boolean
          parent_comment_id?: string | null
          post_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "community_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      community_flags: {
        Row: {
          comment_id: string | null
          created_at: string
          id: string
          post_id: string | null
          reason: string
          reporter_id: string
          reviewed_by: string | null
          status: string
          tenant_id: string
        }
        Insert: {
          comment_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          reason: string
          reporter_id: string
          reviewed_by?: string | null
          status?: string
          tenant_id: string
        }
        Update: {
          comment_id?: string | null
          created_at?: string
          id?: string
          post_id?: string | null
          reason?: string
          reporter_id?: string
          reviewed_by?: string | null
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_flags_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_flags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_flags_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "community_flags_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_flags_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "community_flags_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_flags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      community_poll_options: {
        Row: {
          id: string
          option_text: string
          post_id: string
          sort_order: number
          vote_count: number
        }
        Insert: {
          id?: string
          option_text: string
          post_id: string
          sort_order?: number
          vote_count?: number
        }
        Update: {
          id?: string
          option_text?: string
          post_id?: string
          sort_order?: number
          vote_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "community_poll_options_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_poll_votes: {
        Row: {
          created_at: string
          id: string
          option_id: string
          post_id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          option_id: string
          post_id: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          option_id?: string
          post_id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_poll_votes_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "community_poll_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_poll_votes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_poll_votes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "community_poll_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          author_id: string
          comment_count: number
          content: string
          course_id: number | null
          created_at: string
          id: string
          is_graded: boolean
          is_hidden: boolean
          is_locked: boolean
          is_pinned: boolean
          lesson_id: number | null
          media_urls: Json | null
          milestone_data: Json | null
          milestone_type: string | null
          post_type: string
          reaction_count: number
          tenant_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          comment_count?: number
          content: string
          course_id?: number | null
          created_at?: string
          id?: string
          is_graded?: boolean
          is_hidden?: boolean
          is_locked?: boolean
          is_pinned?: boolean
          lesson_id?: number | null
          media_urls?: Json | null
          milestone_data?: Json | null
          milestone_type?: string | null
          post_type?: string
          reaction_count?: number
          tenant_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          comment_count?: number
          content?: string
          course_id?: number | null
          created_at?: string
          id?: string
          is_graded?: boolean
          is_hidden?: boolean
          is_locked?: boolean
          is_pinned?: boolean
          lesson_id?: number | null
          media_urls?: Json | null
          milestone_data?: Json | null
          milestone_type?: string | null
          post_type?: string
          reaction_count?: number
          tenant_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "community_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "community_posts_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "community_posts_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_posts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      community_reactions: {
        Row: {
          comment_id: string | null
          id: string
          post_id: string | null
          reaction_type: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          comment_id?: string | null
          id?: string
          post_id?: string | null
          reaction_type: string
          tenant_id: string
          user_id: string
        }
        Update: {
          comment_id?: string | null
          id?: string
          post_id?: string | null
          reaction_type?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "community_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "community_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "community_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      community_user_mutes: {
        Row: {
          created_at: string
          id: string
          muted_by: string
          muted_until: string | null
          reason: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          muted_by: string
          muted_until?: string | null
          reason?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          muted_by?: string
          muted_until?: string | null
          reason?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_user_mutes_muted_by_fkey"
            columns: ["muted_by"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "community_user_mutes_muted_by_fkey"
            columns: ["muted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_user_mutes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_user_mutes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "community_user_mutes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_versions: {
        Row: {
          changed_by: string | null
          content_id: number
          content_type: string
          created_at: string
          id: number
          snapshot: Json
          version_number: number
        }
        Insert: {
          changed_by?: string | null
          content_id: number
          content_type: string
          created_at?: string
          id?: number
          snapshot: Json
          version_number: number
        }
        Update: {
          changed_by?: string | null
          content_id?: number
          content_type?: string
          created_at?: string
          id?: number
          snapshot?: Json
          version_number?: number
        }
        Relationships: []
      }
      course_ai_tutors: {
        Row: {
          boundaries: string | null
          course_id: number
          created_at: string | null
          enabled: boolean | null
          model_config: Json | null
          persona: string | null
          teaching_approach: string | null
          tenant_id: string
          tutor_id: string
          updated_at: string | null
        }
        Insert: {
          boundaries?: string | null
          course_id: number
          created_at?: string | null
          enabled?: boolean | null
          model_config?: Json | null
          persona?: string | null
          teaching_approach?: string | null
          tenant_id: string
          tutor_id?: string
          updated_at?: string | null
        }
        Update: {
          boundaries?: string | null
          course_id?: number
          created_at?: string | null
          enabled?: boolean | null
          model_config?: Json | null
          persona?: string | null
          teaching_approach?: string | null
          tenant_id?: string
          tutor_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_ai_tutors_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_ai_tutors_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "exercise_view"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_ai_tutors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: number
          name: string
          tenant_id?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          deleted_at?: string | null
          description?: string | null
          id?: number
          name?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          require_sequential_completion: boolean
          status: Database["public"]["Enums"]["status"]
          tags: string[] | null
          tenant_id: string
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
          require_sequential_completion?: boolean
          status?: Database["public"]["Enums"]["status"]
          tags?: string[] | null
          tenant_id?: string
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
          require_sequential_completion?: boolean
          status?: Database["public"]["Enums"]["status"]
          tags?: string[] | null
          tenant_id?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_author_profile_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "courses_author_profile_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "course_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      device_push_tokens: {
        Row: {
          created_at: string
          device_name: string | null
          id: number
          last_seen_at: string
          platform: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          id?: number
          last_seen_at?: string
          platform: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_name?: string | null
          id?: number
          last_seen_at?: string
          platform?: string
          token?: string
          user_id?: string
        }
        Relationships: []
      }
      enrollments: {
        Row: {
          course_id: number
          enrollment_date: string | null
          enrollment_id: number
          status: Database["public"]["Enums"]["enrollement_status"] | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          course_id: number
          enrollment_date?: string | null
          enrollment_id?: number
          status?: Database["public"]["Enums"]["enrollement_status"] | null
          tenant_id?: string
          user_id: string
        }
        Update: {
          course_id?: number
          enrollment_date?: string | null
          enrollment_id?: number
          status?: Database["public"]["Enums"]["enrollement_status"] | null
          tenant_id?: string
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
            foreignKeyName: "enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "enrollments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlements: {
        Row: {
          course_id: number
          entitlement_id: number
          expires_at: string | null
          granted_at: string
          revoked_at: string | null
          source_id: number | null
          source_type: Database["public"]["Enums"]["entitlement_source"]
          status: Database["public"]["Enums"]["entitlement_status"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          course_id: number
          entitlement_id?: never
          expires_at?: string | null
          granted_at?: string
          revoked_at?: string | null
          source_id?: number | null
          source_type: Database["public"]["Enums"]["entitlement_source"]
          status?: Database["public"]["Enums"]["entitlement_status"]
          tenant_id: string
          user_id: string
        }
        Update: {
          course_id?: number
          entitlement_id?: never
          expires_at?: string | null
          granted_at?: string
          revoked_at?: string | null
          source_id?: number | null
          source_type?: Database["public"]["Enums"]["entitlement_source"]
          status?: Database["public"]["Enums"]["entitlement_status"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlements_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "entitlements_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "entitlements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      exam_ai_configs: {
        Row: {
          ai_feedback_detail_level: string | null
          ai_feedback_tone: string | null
          ai_grading_enabled: boolean | null
          ai_grading_prompt: string | null
          ai_persona: string | null
          config_id: number
          created_at: string | null
          exam_id: number
          updated_at: string | null
        }
        Insert: {
          ai_feedback_detail_level?: string | null
          ai_feedback_tone?: string | null
          ai_grading_enabled?: boolean | null
          ai_grading_prompt?: string | null
          ai_persona?: string | null
          config_id?: number
          created_at?: string | null
          exam_id: number
          updated_at?: string | null
        }
        Update: {
          ai_feedback_detail_level?: string | null
          ai_feedback_tone?: string | null
          ai_grading_enabled?: boolean | null
          ai_grading_prompt?: string | null
          ai_persona?: string | null
          config_id?: number
          created_at?: string | null
          exam_id?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_ai_configs_exam_id_fkey"
            columns: ["exam_id"]
            isOneToOne: true
            referencedRelation: "exams"
            referencedColumns: ["exam_id"]
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
      exam_question_scores: {
        Row: {
          ai_confidence: number | null
          ai_feedback: string | null
          created_at: string | null
          is_correct: boolean | null
          is_overridden: boolean | null
          points_earned: number
          points_possible: number
          question_id: number
          reviewed_at: string | null
          score_id: number
          student_answer: string | null
          submission_id: number
          teacher_id: string | null
          teacher_notes: string | null
          updated_at: string | null
        }
        Insert: {
          ai_confidence?: number | null
          ai_feedback?: string | null
          created_at?: string | null
          is_correct?: boolean | null
          is_overridden?: boolean | null
          points_earned?: number
          points_possible: number
          question_id: number
          reviewed_at?: string | null
          score_id?: number
          student_answer?: string | null
          submission_id: number
          teacher_id?: string | null
          teacher_notes?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_confidence?: number | null
          ai_feedback?: string | null
          created_at?: string | null
          is_correct?: boolean | null
          is_overridden?: boolean | null
          points_earned?: number
          points_possible?: number
          question_id?: number
          reviewed_at?: string | null
          score_id?: number
          student_answer?: string | null
          submission_id?: number
          teacher_id?: string | null
          teacher_notes?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exam_question_scores_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "exam_questions"
            referencedColumns: ["question_id"]
          },
          {
            foreignKeyName: "exam_question_scores_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "exam_submissions"
            referencedColumns: ["submission_id"]
          },
        ]
      }
      exam_questions: {
        Row: {
          ai_grading_criteria: string | null
          correct_answer: string | null
          exam_id: number
          expected_keywords: string[] | null
          grading_rubric: string | null
          max_length: number | null
          points: number | null
          question_id: number
          question_text: string
          question_type: string
        }
        Insert: {
          ai_grading_criteria?: string | null
          correct_answer?: string | null
          exam_id: number
          expected_keywords?: string[] | null
          grading_rubric?: string | null
          max_length?: number | null
          points?: number | null
          question_id?: number
          question_text: string
          question_type: string
        }
        Update: {
          ai_grading_criteria?: string | null
          correct_answer?: string | null
          exam_id?: number
          expected_keywords?: string[] | null
          grading_rubric?: string | null
          max_length?: number | null
          points?: number | null
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
          is_overridden: boolean | null
          reviewed_at: string | null
          score: number | null
          score_id: number
          student_id: string
          submission_id: number
          teacher_id: string | null
          teacher_notes: string | null
        }
        Insert: {
          evaluated_at?: string | null
          exam_id: number
          feedback?: string | null
          is_overridden?: boolean | null
          reviewed_at?: string | null
          score?: number | null
          score_id?: number
          student_id: string
          submission_id: number
          teacher_id?: string | null
          teacher_notes?: string | null
        }
        Update: {
          evaluated_at?: string | null
          exam_id?: number
          feedback?: string | null
          is_overridden?: boolean | null
          reviewed_at?: string | null
          score?: number | null
          score_id?: number
          student_id?: string
          submission_id?: number
          teacher_id?: string | null
          teacher_notes?: string | null
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
          ai_confidence_score: number | null
          ai_data: Json | null
          ai_model_used: string | null
          ai_processing_time_ms: number | null
          evaluated_at: string | null
          exam_id: number
          feedback: string | null
          requires_attention: boolean | null
          review_status: string | null
          score: number | null
          student_id: string
          submission_date: string | null
          submission_id: number
          tenant_id: string
        }
        Insert: {
          ai_confidence_score?: number | null
          ai_data?: Json | null
          ai_model_used?: string | null
          ai_processing_time_ms?: number | null
          evaluated_at?: string | null
          exam_id: number
          feedback?: string | null
          requires_attention?: boolean | null
          review_status?: string | null
          score?: number | null
          student_id: string
          submission_date?: string | null
          submission_id?: number
          tenant_id?: string
        }
        Update: {
          ai_confidence_score?: number | null
          ai_data?: Json | null
          ai_model_used?: string | null
          ai_processing_time_ms?: number | null
          evaluated_at?: string | null
          exam_id?: number
          feedback?: string | null
          requires_attention?: boolean | null
          review_status?: string | null
          score?: number | null
          student_id?: string
          submission_date?: string | null
          submission_id?: number
          tenant_id?: string
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
            foreignKeyName: "exam_submissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
        ]
      }
      exams: {
        Row: {
          course_id: number
          created_at: string | null
          created_by: string | null
          description: string | null
          duration: number
          exam_date: string | null
          exam_id: number
          sequence: number | null
          status: Database["public"]["Enums"]["status"] | null
          tenant_id: string
          title: string
          updated_at: string | null
        }
        Insert: {
          course_id: number
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration: number
          exam_date?: string | null
          exam_id?: number
          sequence?: number | null
          status?: Database["public"]["Enums"]["status"] | null
          tenant_id?: string
          title: string
          updated_at?: string | null
        }
        Update: {
          course_id?: number
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          duration?: number
          exam_date?: string | null
          exam_id?: number
          sequence?: number | null
          status?: Database["public"]["Enums"]["status"] | null
          tenant_id?: string
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
            foreignKeyName: "exams_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "exams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_code_student_submissions: {
        Row: {
          created_at: string | null
          exercise_id: number
          id: number
          submission_code: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          exercise_id: number
          id?: number
          submission_code: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          exercise_id?: number
          id?: number
          submission_code?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_code_student_submissions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_code_student_submissions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
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
            foreignKeyName: "exercise_completions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_completions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_evaluations: {
        Row: {
          ai_metrics: Json | null
          ai_result: Json
          attempt_number: number
          created_at: string
          engine_type: string
          exercise_id: number
          id: number
          passed: boolean
          score: number | null
          submission_id: number | null
          submission_source: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          ai_metrics?: Json | null
          ai_result?: Json
          attempt_number?: number
          created_at?: string
          engine_type: string
          exercise_id: number
          id?: number
          passed?: boolean
          score?: number | null
          submission_id?: number | null
          submission_source?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          ai_metrics?: Json | null
          ai_result?: Json
          attempt_number?: number
          created_at?: string
          engine_type?: string
          exercise_id?: number
          id?: number
          passed?: boolean
          score?: number | null
          submission_id?: number | null
          submission_source?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_evaluations_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_evaluations_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_evaluations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_evaluations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "exercise_evaluations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_files: {
        Row: {
          content: string
          exercise_id: number
          file_path: string
          file_type: Database["public"]["Enums"]["exercise_file_type"]
          id: number
        }
        Insert: {
          content: string
          exercise_id: number
          file_path: string
          file_type?: Database["public"]["Enums"]["exercise_file_type"]
          id?: number
        }
        Update: {
          content?: string
          exercise_id?: number
          file_path?: string
          file_type?: Database["public"]["Enums"]["exercise_file_type"]
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "exercise_files_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_files_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      exercise_media_submissions: {
        Row: {
          ai_evaluation: Json | null
          created_at: string | null
          duration_seconds: number | null
          exercise_id: number
          id: number
          media_type: string
          media_url: string
          score: number | null
          status: string
          stt_result: Json | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          ai_evaluation?: Json | null
          created_at?: string | null
          duration_seconds?: number | null
          exercise_id: number
          id?: never
          media_type: string
          media_url: string
          score?: number | null
          status?: string
          stt_result?: Json | null
          tenant_id: string
          user_id: string
        }
        Update: {
          ai_evaluation?: Json | null
          created_at?: string | null
          duration_seconds?: number | null
          exercise_id?: number
          id?: never
          media_type?: string
          media_url?: string
          score?: number | null
          status?: string
          stt_result?: Json | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "exercise_media_submissions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_media_submissions_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercise_media_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "exercise_media_submissions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            referencedRelation: "exercise_view"
            referencedColumns: ["id"]
          },
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
          active_file: string | null
          course_id: number
          created_at: string | null
          created_by: string
          description: string | null
          difficulty_level: Database["public"]["Enums"]["difficulty_level"]
          exercise_config: Json | null
          exercise_type: Database["public"]["Enums"]["exercise_type"]
          id: number
          instructions: string
          lesson_id: number | null
          status: Database["public"]["Enums"]["status"]
          system_prompt: string | null
          template_id: number | null
          template_variables: Json | null
          tenant_id: string
          time_limit: number | null
          title: string
          updated_at: string | null
          visible_files: string[] | null
        }
        Insert: {
          active_file?: string | null
          course_id: number
          created_at?: string | null
          created_by: string
          description?: string | null
          difficulty_level: Database["public"]["Enums"]["difficulty_level"]
          exercise_config?: Json | null
          exercise_type: Database["public"]["Enums"]["exercise_type"]
          id?: never
          instructions: string
          lesson_id?: number | null
          status?: Database["public"]["Enums"]["status"]
          system_prompt?: string | null
          template_id?: number | null
          template_variables?: Json | null
          tenant_id?: string
          time_limit?: number | null
          title: string
          updated_at?: string | null
          visible_files?: string[] | null
        }
        Update: {
          active_file?: string | null
          course_id?: number
          created_at?: string | null
          created_by?: string
          description?: string | null
          difficulty_level?: Database["public"]["Enums"]["difficulty_level"]
          exercise_config?: Json | null
          exercise_type?: Database["public"]["Enums"]["exercise_type"]
          id?: never
          instructions?: string
          lesson_id?: number | null
          status?: Database["public"]["Enums"]["status"]
          system_prompt?: string | null
          template_id?: number | null
          template_variables?: Json | null
          tenant_id?: string
          time_limit?: number | null
          title?: string
          updated_at?: string | null
          visible_files?: string[] | null
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
            foreignKeyName: "exercises_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "exercises_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "prompt_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exercises_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_achievements: {
        Row: {
          category: string
          coin_reward: number
          condition_type: string
          condition_value: number
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          slug: string
          tenant_id: string | null
          tier: string
          title: string
          xp_reward: number
        }
        Insert: {
          category: string
          coin_reward?: number
          condition_type: string
          condition_value: number
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          slug: string
          tenant_id?: string | null
          tier: string
          title: string
          xp_reward?: number
        }
        Update: {
          category?: string
          coin_reward?: number
          condition_type?: string
          condition_value?: number
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          slug?: string
          tenant_id?: string | null
          tier?: string
          title?: string
          xp_reward?: number
        }
        Relationships: [
          {
            foreignKeyName: "gamification_achievements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_challenge_participants: {
        Row: {
          challenge_id: string
          completed_at: string | null
          id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          challenge_id: string
          completed_at?: string | null
          id?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          challenge_id?: string
          completed_at?: string | null
          id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamification_challenge_participants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamification_challenge_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "gamification_challenge_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_leaderboard_cache: {
        Row: {
          avatar_url: string | null
          full_name: string | null
          id: string
          level: number
          rank: number
          tenant_id: string
          total_xp: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string
          level: number
          rank: number
          tenant_id: string
          total_xp: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          full_name?: string | null
          id?: string
          level?: number
          rank?: number
          tenant_id?: string
          total_xp?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamification_leaderboard_cache_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamification_leaderboard_cache_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "gamification_leaderboard_cache_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_levels: {
        Row: {
          icon: string | null
          level: number
          min_xp: number
          perks: Json | null
          title: string
        }
        Insert: {
          icon?: string | null
          level: number
          min_xp: number
          perks?: Json | null
          title: string
        }
        Update: {
          icon?: string | null
          level?: number
          min_xp?: number
          perks?: Json | null
          title?: string
        }
        Relationships: []
      }
      gamification_profiles: {
        Row: {
          current_streak: number | null
          id: string
          last_activity_date: string | null
          leagues_opt_out: boolean
          level: number | null
          longest_streak: number | null
          streak_freezes_available: number | null
          tenant_id: string
          total_coins_spent: number | null
          total_xp: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          current_streak?: number | null
          id?: string
          last_activity_date?: string | null
          leagues_opt_out?: boolean
          level?: number | null
          longest_streak?: number | null
          streak_freezes_available?: number | null
          tenant_id: string
          total_coins_spent?: number | null
          total_xp?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          current_streak?: number | null
          id?: string
          last_activity_date?: string | null
          leagues_opt_out?: boolean
          level?: number | null
          longest_streak?: number | null
          streak_freezes_available?: number | null
          tenant_id?: string
          total_coins_spent?: number | null
          total_xp?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamification_profiles_level_fkey"
            columns: ["level"]
            isOneToOne: false
            referencedRelation: "gamification_levels"
            referencedColumns: ["level"]
          },
          {
            foreignKeyName: "gamification_profiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamification_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "gamification_profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_redemptions: {
        Row: {
          coins_spent: number
          id: string
          item_id: string
          redeemed_at: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          coins_spent: number
          id?: string
          item_id: string
          redeemed_at?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          coins_spent?: number
          id?: string
          item_id?: string
          redeemed_at?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamification_redemptions_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "gamification_store_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamification_redemptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamification_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "gamification_redemptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_store_items: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_available: boolean | null
          max_per_user: number | null
          metadata: Json | null
          name: string
          price_coins: number
          slug: string
          tenant_id: string | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_available?: boolean | null
          max_per_user?: number | null
          metadata?: Json | null
          name: string
          price_coins: number
          slug: string
          tenant_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_available?: boolean | null
          max_per_user?: number | null
          metadata?: Json | null
          name?: string
          price_coins?: number
          slug?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gamification_store_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_user_achievements: {
        Row: {
          achievement_id: string
          earned_at: string | null
          id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          achievement_id: string
          earned_at?: string | null
          id?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          achievement_id?: string
          earned_at?: string | null
          id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamification_user_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "gamification_achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamification_user_achievements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamification_user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "gamification_user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_user_rewards: {
        Row: {
          created_at: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          reward_data: Json | null
          reward_type: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          reward_data?: Json | null
          reward_type: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          reward_data?: Json | null
          reward_type?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gamification_user_rewards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamification_user_rewards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "gamification_user_rewards_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      gamification_xp_transactions: {
        Row: {
          action_type: string
          created_at: string | null
          id: string
          reference_id: string | null
          reference_type: string | null
          tenant_id: string
          user_id: string
          xp_amount: number
        }
        Insert: {
          action_type: string
          created_at?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          tenant_id: string
          user_id: string
          xp_amount: number
        }
        Update: {
          action_type?: string
          created_at?: string | null
          id?: string
          reference_id?: string | null
          reference_type?: string | null
          tenant_id?: string
          user_id?: string
          xp_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "gamification_xp_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gamification_xp_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "gamification_xp_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
            foreignKeyName: "grades_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["course_id"]
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
      invoices: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          due_date: string | null
          invoice_id: number
          invoice_number: string
          paid_at: string | null
          pdf_url: string | null
          status: string
          tax_amount: number | null
          tenant_id: string
          total_amount: number
          transaction_id: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          invoice_id?: number
          invoice_number: string
          paid_at?: string | null
          pdf_url?: string | null
          status?: string
          tax_amount?: number | null
          tenant_id: string
          total_amount: number
          transaction_id?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          invoice_id?: number
          invoice_number?: string
          paid_at?: string | null
          pdf_url?: string | null
          status?: string
          tax_amount?: number | null
          tenant_id?: string
          total_amount?: number
          transaction_id?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["transaction_id"]
          },
        ]
      }
      issuer_keys: {
        Row: {
          created_at: string | null
          encryption_algorithm: string | null
          expires_at: string | null
          is_active: boolean | null
          key_id: string
          key_name: string
          key_type: string
          key_url: string
          last_used_at: string | null
          private_key_encrypted: string
          public_key: string
          public_key_jwk: Json | null
          public_key_multibase: string | null
          revoke_reason: string | null
          revoked_at: string | null
          usage_count: number | null
        }
        Insert: {
          created_at?: string | null
          encryption_algorithm?: string | null
          expires_at?: string | null
          is_active?: boolean | null
          key_id?: string
          key_name: string
          key_type: string
          key_url: string
          last_used_at?: string | null
          private_key_encrypted: string
          public_key: string
          public_key_jwk?: Json | null
          public_key_multibase?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          usage_count?: number | null
        }
        Update: {
          created_at?: string | null
          encryption_algorithm?: string | null
          expires_at?: string | null
          is_active?: boolean | null
          key_id?: string
          key_name?: string
          key_type?: string
          key_url?: string
          last_used_at?: string | null
          private_key_encrypted?: string
          public_key?: string
          public_key_jwk?: Json | null
          public_key_multibase?: string | null
          revoke_reason?: string | null
          revoked_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      item_ratings: {
        Row: {
          attempt_count: number
          course_id: number | null
          id: number
          item_id: number | null
          item_type: string
          rating: number
          tenant_id: string
          topic: string | null
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          course_id?: number | null
          id?: number
          item_id?: number | null
          item_type: string
          rating?: number
          tenant_id: string
          topic?: string | null
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          course_id?: number | null
          id?: number
          item_id?: number | null
          item_type?: string
          rating?: number
          tenant_id?: string
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_ratings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_page_templates: {
        Row: {
          created_at: string
          description: string | null
          name: string
          puck_data: Json
          template_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          name: string
          puck_data?: Json
          template_id?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          name?: string
          puck_data?: Json
          template_id?: string
        }
        Relationships: []
      }
      landing_pages: {
        Row: {
          created_at: string
          is_published: boolean
          page_id: string
          puck_data: Json
          slug: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          is_published?: boolean
          page_id?: string
          puck_data?: Json
          slug: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          is_published?: boolean
          page_id?: string
          puck_data?: Json
          slug?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "landing_pages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      league_memberships: {
        Row: {
          cohort_id: string
          created_at: string
          final_rank: number | null
          id: string
          movement: string | null
          tenant_id: string
          tier: number
          user_id: string
          week_start: string
        }
        Insert: {
          cohort_id: string
          created_at?: string
          final_rank?: number | null
          id?: string
          movement?: string | null
          tenant_id: string
          tier: number
          user_id: string
          week_start: string
        }
        Update: {
          cohort_id?: string
          created_at?: string
          final_rank?: number | null
          id?: string
          movement?: string | null
          tenant_id?: string
          tier?: number
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_memberships_tier_fkey"
            columns: ["tier"]
            isOneToOne: false
            referencedRelation: "league_tiers"
            referencedColumns: ["tier"]
          },
          {
            foreignKeyName: "league_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "league_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_tiers: {
        Row: {
          demote_count: number
          name: string
          promote_count: number
          slug: string
          tier: number
        }
        Insert: {
          demote_count?: number
          name: string
          promote_count?: number
          slug: string
          tier: number
        }
        Update: {
          demote_count?: number
          name?: string
          promote_count?: number
          slug?: string
          tier?: number
        }
        Relationships: []
      }
      lesson_checkpoint_attempts: {
        Row: {
          attempt_number: number
          checkpoint_id: number
          completed: boolean
          course_id: number
          created_at: string
          evaluation: Json | null
          evaluator_type: string
          exercise_id: number
          id: number
          lesson_id: number
          passed: boolean | null
          placement_source: string
          response: Json
          score: number | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          attempt_number: number
          checkpoint_id: number
          completed?: boolean
          course_id: number
          created_at?: string
          evaluation?: Json | null
          evaluator_type: string
          exercise_id: number
          id?: number
          lesson_id: number
          passed?: boolean | null
          placement_source: string
          response?: Json
          score?: number | null
          tenant_id: string
          user_id: string
        }
        Update: {
          attempt_number?: number
          checkpoint_id?: number
          completed?: boolean
          course_id?: number
          created_at?: string
          evaluation?: Json | null
          evaluator_type?: string
          exercise_id?: number
          id?: number
          lesson_id?: number
          passed?: boolean | null
          placement_source?: string
          response?: Json
          score?: number | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_checkpoint_attempts_checkpoint_id_fkey"
            columns: ["checkpoint_id"]
            isOneToOne: false
            referencedRelation: "lesson_checkpoints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_checkpoint_attempts_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "lesson_checkpoint_attempts_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "lesson_checkpoint_attempts_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_checkpoint_attempts_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_checkpoint_attempts_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_checkpoint_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_checkpoints: {
        Row: {
          allow_skip: boolean
          content_block_id: string | null
          created_at: string
          created_by: string
          exercise_id: number
          id: number
          is_enabled: boolean
          is_required: boolean
          label: string | null
          lesson_id: number
          max_ai_attempts: number
          placement_type: string
          tenant_id: string
          updated_at: string
          video_timestamp_seconds: number | null
        }
        Insert: {
          allow_skip?: boolean
          content_block_id?: string | null
          created_at?: string
          created_by: string
          exercise_id: number
          id?: number
          is_enabled?: boolean
          is_required?: boolean
          label?: string | null
          lesson_id: number
          max_ai_attempts?: number
          placement_type: string
          tenant_id: string
          updated_at?: string
          video_timestamp_seconds?: number | null
        }
        Update: {
          allow_skip?: boolean
          content_block_id?: string | null
          created_at?: string
          created_by?: string
          exercise_id?: number
          id?: number
          is_enabled?: boolean
          is_required?: boolean
          label?: string | null
          lesson_id?: number
          max_ai_attempts?: number
          placement_type?: string
          tenant_id?: string
          updated_at?: string
          video_timestamp_seconds?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lesson_checkpoints_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_checkpoints_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_checkpoints_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_checkpoints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
        ]
      }
      lesson_resources: {
        Row: {
          created_at: string
          display_order: number
          file_name: string
          file_path: string
          file_size: number
          id: number
          lesson_id: number
          mime_type: string
          tenant_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          file_name: string
          file_path: string
          file_size: number
          id?: never
          lesson_id: number
          mime_type: string
          tenant_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          display_order?: number
          file_name?: string
          file_path?: string
          file_size?: number
          id?: never
          lesson_id?: number
          mime_type?: string
          tenant_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_resources_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_resources_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
        ]
      }
      lessons: {
        Row: {
          ai_task_description: string | null
          ai_task_instructions: string | null
          content: string | null
          course_id: number | null
          created_at: string | null
          description: string | null
          embed_code: string | null
          id: number
          image: string | null
          is_preview: boolean
          publish_at: string | null
          sequence: number | null
          status: Database["public"]["Enums"]["status"] | null
          summary: string | null
          tenant_id: string
          title: string | null
          updated_at: string | null
          video_url: string | null
        }
        Insert: {
          ai_task_description?: string | null
          ai_task_instructions?: string | null
          content?: string | null
          course_id?: number | null
          created_at?: string | null
          description?: string | null
          embed_code?: string | null
          id?: never
          image?: string | null
          is_preview?: boolean
          publish_at?: string | null
          sequence?: number | null
          status?: Database["public"]["Enums"]["status"] | null
          summary?: string | null
          tenant_id?: string
          title?: string | null
          updated_at?: string | null
          video_url?: string | null
        }
        Update: {
          ai_task_description?: string | null
          ai_task_instructions?: string | null
          content?: string | null
          course_id?: number | null
          created_at?: string | null
          description?: string | null
          embed_code?: string | null
          id?: never
          image?: string | null
          is_preview?: boolean
          publish_at?: string | null
          sequence?: number | null
          status?: Database["public"]["Enums"]["status"] | null
          summary?: string | null
          tenant_id?: string
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
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "lessons_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
            isOneToOne: true
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      mcp_api_tokens: {
        Row: {
          created_at: string
          created_ip: unknown
          expires_at: string | null
          id: number
          is_active: boolean
          last_used_at: string | null
          last_used_ip: unknown
          name: string
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_ip?: unknown
          expires_at?: string | null
          id?: number
          is_active?: boolean
          last_used_at?: string | null
          last_used_ip?: unknown
          name: string
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_ip?: unknown
          expires_at?: string | null
          id?: number
          is_active?: boolean
          last_used_at?: string | null
          last_used_ip?: unknown
          name?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      mcp_audit_log: {
        Row: {
          created_at: string
          duration_ms: number | null
          error_message: string | null
          id: number
          ip_address: unknown
          method: string
          request_params: Json | null
          response_data: Json | null
          success: boolean
          tool_name: string | null
          user_agent: string | null
          user_id: string
          user_role: string
        }
        Insert: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: number
          ip_address?: unknown
          method: string
          request_params?: Json | null
          response_data?: Json | null
          success?: boolean
          tool_name?: string | null
          user_agent?: string | null
          user_id: string
          user_role: string
        }
        Update: {
          created_at?: string
          duration_ms?: number | null
          error_message?: string | null
          id?: number
          ip_address?: unknown
          method?: string
          request_params?: Json | null
          response_data?: Json | null
          success?: boolean
          tool_name?: string | null
          user_agent?: string | null
          user_id?: string
          user_role?: string
        }
        Relationships: []
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
      notification_preferences: {
        Row: {
          course_notifications: boolean | null
          created_at: string
          email_enabled: boolean | null
          email_frequency: string | null
          enrollment_notifications: boolean | null
          exam_notifications: boolean | null
          id: number
          in_app_enabled: boolean | null
          payment_notifications: boolean | null
          push_enabled: boolean | null
          quiet_hours_end: string | null
          quiet_hours_start: string | null
          system_notifications: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          course_notifications?: boolean | null
          created_at?: string
          email_enabled?: boolean | null
          email_frequency?: string | null
          enrollment_notifications?: boolean | null
          exam_notifications?: boolean | null
          id?: number
          in_app_enabled?: boolean | null
          payment_notifications?: boolean | null
          push_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          system_notifications?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          course_notifications?: boolean | null
          created_at?: string
          email_enabled?: boolean | null
          email_frequency?: string | null
          enrollment_notifications?: boolean | null
          exam_notifications?: boolean | null
          id?: number
          in_app_enabled?: boolean | null
          payment_notifications?: boolean | null
          push_enabled?: boolean | null
          quiet_hours_end?: string | null
          quiet_hours_start?: string | null
          system_notifications?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_templates: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string | null
          id: number
          name: string
          tenant_id: string | null
          title: string
          updated_at: string
          variables: Json | null
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: number
          name: string
          tenant_id?: string | null
          title: string
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: number
          name?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          content: string
          created_at: string
          created_by: string | null
          delivery_channels: string[]
          expires_at: string | null
          id: number
          metadata: Json | null
          notification_type: string
          priority: string
          scheduled_for: string | null
          sent_at: string | null
          status: string
          target_course_id: number | null
          target_roles: string[] | null
          target_type: string
          target_user_ids: string[] | null
          template_id: number | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by?: string | null
          delivery_channels?: string[]
          expires_at?: string | null
          id?: number
          metadata?: Json | null
          notification_type: string
          priority?: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          target_course_id?: number | null
          target_roles?: string[] | null
          target_type?: string
          target_user_ids?: string[] | null
          template_id?: number | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string | null
          delivery_channels?: string[]
          expires_at?: string | null
          id?: number
          metadata?: Json | null
          notification_type?: string
          priority?: string
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          target_course_id?: number | null
          target_roles?: string[] | null
          target_type?: string
          target_user_ids?: string[] | null
          template_id?: number | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_created_by_profile_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "notifications_created_by_profile_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_target_course_id_fkey"
            columns: ["target_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "notifications_target_course_id_fkey"
            columns: ["target_course_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "notifications_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "notification_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_requests: {
        Row: {
          admin_notes: string | null
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string | null
          invoice_generated_at: string | null
          invoice_number: string | null
          message: string | null
          payment_amount: number | null
          payment_confirmed_at: string | null
          payment_currency: string | null
          payment_deadline: string | null
          payment_instructions: string | null
          payment_method: string | null
          plan_id: number | null
          processed_by: string | null
          product_id: number | null
          proof_url: string | null
          request_id: number
          status: string
          tenant_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string | null
          invoice_generated_at?: string | null
          invoice_number?: string | null
          message?: string | null
          payment_amount?: number | null
          payment_confirmed_at?: string | null
          payment_currency?: string | null
          payment_deadline?: string | null
          payment_instructions?: string | null
          payment_method?: string | null
          plan_id?: number | null
          processed_by?: string | null
          product_id?: number | null
          proof_url?: string | null
          request_id?: number
          status?: string
          tenant_id?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string | null
          invoice_generated_at?: string | null
          invoice_number?: string | null
          message?: string | null
          payment_amount?: number | null
          payment_confirmed_at?: string | null
          payment_currency?: string | null
          payment_deadline?: string | null
          payment_instructions?: string | null
          payment_method?: string | null
          plan_id?: number | null
          processed_by?: string | null
          product_id?: number | null
          proof_url?: string | null
          request_id?: number
          status?: string
          tenant_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "payment_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "payment_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "payment_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "payment_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          failed_at: string | null
          failure_reason: string | null
          paid_at: string | null
          payout_id: number
          period_end: string
          period_start: string
          status: string
          stripe_metadata: Json | null
          stripe_payout_id: string | null
          tenant_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          paid_at?: string | null
          payout_id?: number
          period_end: string
          period_start: string
          status?: string
          stripe_metadata?: Json | null
          stripe_payout_id?: string | null
          tenant_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          paid_at?: string | null
          payout_id?: number
          period_end?: string
          period_start?: string
          status?: string
          stripe_metadata?: Json | null
          stripe_payout_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payouts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
            foreignKeyName: "plan_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
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
          payment_provider: string | null
          plan_id: number
          plan_name: string
          price: number
          provider_price_id: string | null
          provider_product_id: string | null
          tenant_id: string
          thumbnail: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: Database["public"]["Enums"]["currency_type"] | null
          deleted_at?: string | null
          description?: string | null
          duration_in_days: number
          features?: string | null
          payment_provider?: string | null
          plan_id?: number
          plan_name: string
          price: number
          provider_price_id?: string | null
          provider_product_id?: string | null
          tenant_id?: string
          thumbnail?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: Database["public"]["Enums"]["currency_type"] | null
          deleted_at?: string | null
          description?: string | null
          duration_in_days?: number
          features?: string | null
          payment_provider?: string | null
          plan_id?: number
          plan_name?: string
          price?: number
          provider_price_id?: string | null
          provider_product_id?: string | null
          tenant_id?: string
          thumbnail?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_payment_requests: {
        Row: {
          amount: number
          bank_reference: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string | null
          currency: string
          interval: string
          notes: string | null
          plan_id: string
          proof_url: string | null
          request_id: string
          request_type: string | null
          requested_by: string
          status: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          amount: number
          bank_reference?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          currency?: string
          interval?: string
          notes?: string | null
          plan_id: string
          proof_url?: string | null
          request_id?: string
          request_type?: string | null
          requested_by: string
          status?: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          amount?: number
          bank_reference?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string | null
          currency?: string
          interval?: string
          notes?: string | null
          plan_id?: string
          proof_url?: string | null
          request_id?: string
          request_type?: string | null
          requested_by?: string
          status?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_payment_requests_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "platform_plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "platform_payment_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_plans: {
        Row: {
          created_at: string | null
          description: string | null
          features: Json
          is_active: boolean
          limits: Json
          name: string
          plan_id: string
          price_monthly: number
          price_yearly: number
          slug: string
          sort_order: number
          stripe_price_id_monthly: string | null
          stripe_price_id_yearly: string | null
          transaction_fee_percent: number
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          features?: Json
          is_active?: boolean
          limits?: Json
          name: string
          plan_id?: string
          price_monthly?: number
          price_yearly?: number
          slug: string
          sort_order?: number
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          transaction_fee_percent?: number
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          features?: Json
          is_active?: boolean
          limits?: Json
          name?: string
          plan_id?: string
          price_monthly?: number
          price_yearly?: number
          slug?: string
          sort_order?: number
          stripe_price_id_monthly?: string | null
          stripe_price_id_yearly?: string | null
          transaction_fee_percent?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      platform_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null
          canceled_at: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          grace_period_end: string | null
          interval: string
          payment_method: string
          plan_id: string
          renewal_reminder_sent_at: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          grace_period_end?: string | null
          interval?: string
          payment_method?: string
          plan_id: string
          renewal_reminder_sent_at?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_id?: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          cancel_at_period_end?: boolean | null
          canceled_at?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          grace_period_end?: string | null
          interval?: string
          payment_method?: string
          plan_id?: string
          renewal_reminder_sent_at?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "platform_plans"
            referencedColumns: ["plan_id"]
          },
          {
            foreignKeyName: "platform_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      practice_attempts: {
        Row: {
          answers: Json
          correct_count: number
          course_id: number | null
          created_at: string
          id: number
          lesson_id: number | null
          mode: string
          questions: Json
          score: number
          source: string
          source_exercise_id: number | null
          tenant_id: string
          topic: string
          total_questions: number
          user_id: string
        }
        Insert: {
          answers: Json
          correct_count: number
          course_id?: number | null
          created_at?: string
          id?: number
          lesson_id?: number | null
          mode?: string
          questions: Json
          score: number
          source?: string
          source_exercise_id?: number | null
          tenant_id: string
          topic: string
          total_questions: number
          user_id: string
        }
        Update: {
          answers?: Json
          correct_count?: number
          course_id?: number | null
          created_at?: string
          id?: number
          lesson_id?: number | null
          mode?: string
          questions?: Json
          score?: number
          source?: string
          source_exercise_id?: number | null
          tenant_id?: string
          topic?: string
          total_questions?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "practice_attempts_source_exercise_id_fkey"
            columns: ["source_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_attempts_source_exercise_id_fkey"
            columns: ["source_exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "practice_attempts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_courses: {
        Row: {
          course_id: number
          product_id: number
          tenant_id: string
        }
        Insert: {
          course_id: number
          product_id: number
          tenant_id?: string
        }
        Update: {
          course_id?: number
          product_id?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_product"
            columns: ["product_id"]
            isOneToOne: false
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
          {
            foreignKeyName: "product_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "product_courses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_post_registration_steps: {
        Row: {
          created_at: string
          description: string | null
          id: number
          is_active: boolean
          product_id: number
          sort_order: number
          tenant_id: string
          title: string
          type: string
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: number
          is_active?: boolean
          product_id: number
          sort_order?: number
          tenant_id: string
          title: string
          type: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          is_active?: boolean
          product_id?: number
          sort_order?: number
          tenant_id?: string
          title?: string
          type?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_post_registration_steps_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "product_post_registration_steps_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
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
          payment_provider: string | null
          price: number
          product_id: number
          provider_price_id: string | null
          provider_product_id: string | null
          status: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          currency?: Database["public"]["Enums"]["currency_type"] | null
          description?: string | null
          image?: string | null
          name: string
          payment_provider?: string | null
          price: number
          product_id?: number
          provider_price_id?: string | null
          provider_product_id?: string | null
          status?: string | null
          tenant_id?: string
        }
        Update: {
          created_at?: string | null
          currency?: Database["public"]["Enums"]["currency_type"] | null
          description?: string | null
          image?: string | null
          name?: string
          payment_provider?: string | null
          price?: number
          product_id?: number
          provider_price_id?: string | null
          provider_product_id?: string | null
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          currency_id: number | null
          data_person: Json | null
          deactivated_at: string | null
          full_name: string | null
          id: string
          onboarding_completed: boolean
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
          deactivated_at?: string | null
          full_name?: string | null
          id: string
          onboarding_completed?: boolean
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
          deactivated_at?: string | null
          full_name?: string | null
          id?: string
          onboarding_completed?: boolean
          stripe_customer_id?: string | null
          stripeCustomerID?: string | null
          username?: string | null
          website?: string | null
        }
        Relationships: []
      }
      prompt_templates: {
        Row: {
          category: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: number
          is_system: boolean | null
          name: string
          system_prompt_template: string | null
          task_description_template: string | null
          tenant_id: string | null
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          category: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: number
          is_system?: boolean | null
          name: string
          system_prompt_template?: string | null
          task_description_template?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          category?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: number
          is_system?: boolean | null
          name?: string
          system_prompt_template?: string | null
          task_description_template?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "prompt_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
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
      revenue_splits: {
        Row: {
          applies_to_providers: string[] | null
          created_at: string | null
          platform_percentage: number
          school_percentage: number
          split_id: number
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          applies_to_providers?: string[] | null
          created_at?: string | null
          platform_percentage?: number
          school_percentage?: number
          split_id?: number
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          applies_to_providers?: string[] | null
          created_at?: string | null
          platform_percentage?: number
          school_percentage?: number
          split_id?: number
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_splits_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      review_cards: {
        Row: {
          back: string
          course_id: number | null
          created_at: string
          difficulty: number | null
          due_at: string
          ease: number
          elapsed_days: number
          front: string
          fsrs_state: number
          id: number
          interval_days: number
          lapses: number
          last_reviewed_at: string | null
          learning_steps: number
          lesson_id: number | null
          repetitions: number
          stability: number | null
          suspended: boolean
          tenant_id: string
          user_id: string
        }
        Insert: {
          back: string
          course_id?: number | null
          created_at?: string
          difficulty?: number | null
          due_at?: string
          ease?: number
          elapsed_days?: number
          front: string
          fsrs_state?: number
          id?: number
          interval_days?: number
          lapses?: number
          last_reviewed_at?: string | null
          learning_steps?: number
          lesson_id?: number | null
          repetitions?: number
          stability?: number | null
          suspended?: boolean
          tenant_id: string
          user_id: string
        }
        Update: {
          back?: string
          course_id?: number | null
          created_at?: string
          difficulty?: number | null
          due_at?: string
          ease?: number
          elapsed_days?: number
          front?: string
          fsrs_state?: number
          id?: number
          interval_days?: number
          lapses?: number
          last_reviewed_at?: string | null
          learning_steps?: number
          lesson_id?: number | null
          repetitions?: number
          stability?: number | null
          suspended?: boolean
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_cards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      reviews: {
        Row: {
          created_at: string | null
          entity_id: number
          entity_type: Database["public"]["Enums"]["reviewable"]
          rating: number
          review_id: number
          review_text: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          entity_id: number
          entity_type: Database["public"]["Enums"]["reviewable"]
          rating: number
          review_id?: never
          review_text?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          entity_id?: number
          entity_type?: Database["public"]["Enums"]["reviewable"]
          rating?: number
          review_id?: never
          review_text?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
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
      student_topic_ratings: {
        Row: {
          attempt_count: number
          course_id: number | null
          id: number
          rating: number
          tenant_id: string
          topic: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempt_count?: number
          course_id?: number | null
          id?: number
          rating?: number
          tenant_id: string
          topic: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempt_count?: number
          course_id?: number | null
          id?: number
          rating?: number
          tenant_id?: string
          topic?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_topic_ratings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      study_goals: {
        Row: {
          course_id: number | null
          created_at: string
          done: boolean
          done_at: string | null
          id: number
          kind: string
          required: boolean
          target_ref: Json | null
          tenant_id: string
          title: string
          user_id: string
          week_start: string
        }
        Insert: {
          course_id?: number | null
          created_at?: string
          done?: boolean
          done_at?: string | null
          id?: number
          kind: string
          required?: boolean
          target_ref?: Json | null
          tenant_id: string
          title: string
          user_id: string
          week_start: string
        }
        Update: {
          course_id?: number | null
          created_at?: string
          done?: boolean
          done_at?: string | null
          id?: number
          kind?: string
          required?: boolean
          target_ref?: Json | null
          tenant_id?: string
          title?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "study_goals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
          payment_provider: string
          plan_id: number
          provider_metadata: Json | null
          provider_subscription_id: string | null
          start_date: string
          subscription_id: number
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
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
          payment_provider?: string
          plan_id: number
          provider_metadata?: Json | null
          provider_subscription_id?: string | null
          start_date?: string
          subscription_id?: number
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id?: string
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
          payment_provider?: string
          plan_id?: number
          provider_metadata?: Json | null
          provider_subscription_id?: string | null
          start_date?: string
          subscription_id?: number
          subscription_status?: Database["public"]["Enums"]["subscription_status"]
          tenant_id?: string
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
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["transaction_id"]
          },
          {
            foreignKeyName: "subscriptions_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "get_reviews"
            referencedColumns: ["profile_id"]
          },
          {
            foreignKeyName: "subscriptions_user_profile_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      super_admins: {
        Row: {
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      system_settings: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: number
          setting_key: string
          setting_value: Json
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: number
          setting_key: string
          setting_value?: Json
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: number
          setting_key?: string
          setting_value?: Json
          updated_at?: string
        }
        Relationships: []
      }
      teacher_preview_sessions: {
        Row: {
          created_at: string | null
          entity_id: number | null
          entity_type: string
          id: number
          messages: Json[] | null
          teacher_id: string
          test_config: Json
        }
        Insert: {
          created_at?: string | null
          entity_id?: number | null
          entity_type: string
          id?: number
          messages?: Json[] | null
          teacher_id: string
          test_config: Json
        }
        Update: {
          created_at?: string | null
          entity_id?: number | null
          entity_type?: string
          id?: number
          messages?: Json[] | null
          teacher_id?: string
          test_config?: Json
        }
        Relationships: []
      }
      tenant_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          id: string
          invited_by: string
          role: string
          status: string
          tenant_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          id?: string
          invited_by: string
          role: string
          status?: string
          tenant_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          id?: string
          invited_by?: string
          role?: string
          status?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_payment_wallets: {
        Row: {
          created_at: string
          credentials: Json
          id: string
          provider: string
          tenant_id: string
          updated_at: string
          wallet_address: string | null
        }
        Insert: {
          created_at?: string
          credentials?: Json
          id?: string
          provider: string
          tenant_id: string
          updated_at?: string
          wallet_address?: string | null
        }
        Update: {
          created_at?: string
          credentials?: Json
          id?: string
          provider?: string
          tenant_id?: string
          updated_at?: string
          wallet_address?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_payment_wallets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_settings: {
        Row: {
          created_at: string | null
          id: string
          setting_key: string
          setting_value: Json
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          setting_key: string
          setting_value?: Json
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          setting_key?: string
          setting_value?: Json
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_users: {
        Row: {
          id: string
          joined_at: string | null
          role: string
          status: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string | null
          role?: string
          status?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string | null
          role?: string
          status?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          billing_email: string | null
          billing_period_end: string | null
          billing_status: string | null
          created_at: string | null
          domain: string | null
          id: string
          logo_url: string | null
          name: string
          plan: string | null
          primary_color: string | null
          secondary_color: string | null
          slug: string
          status: string | null
          stripe_account_id: string | null
          stripe_charges_enabled: boolean
          stripe_customer_id: string | null
          stripe_details_submitted: boolean
          stripe_payouts_enabled: boolean
          updated_at: string | null
        }
        Insert: {
          billing_email?: string | null
          billing_period_end?: string | null
          billing_status?: string | null
          created_at?: string | null
          domain?: string | null
          id?: string
          logo_url?: string | null
          name: string
          plan?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          status?: string | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_customer_id?: string | null
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          updated_at?: string | null
        }
        Update: {
          billing_email?: string | null
          billing_period_end?: string | null
          billing_status?: string | null
          created_at?: string | null
          domain?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          plan?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          status?: string | null
          stripe_account_id?: string | null
          stripe_charges_enabled?: boolean
          stripe_customer_id?: string | null
          stripe_details_submitted?: boolean
          stripe_payouts_enabled?: boolean
          updated_at?: string | null
        }
        Relationships: []
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
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          currency: Database["public"]["Enums"]["currency_type"] | null
          payment_method: string | null
          payment_provider: string | null
          plan_id: number | null
          product_id: number | null
          provider_charge_id: string | null
          provider_metadata: Json | null
          provider_subscription_id: string | null
          settlement_base: number | null
          settlement_currency: string | null
          settlement_mint: string | null
          settlement_sol_usd: number | null
          status: Database["public"]["Enums"]["transaction_status"]
          stripe_payment_intent_id: string | null
          tenant_id: string
          transaction_date: string
          transaction_id: number
          user_id: string
        }
        Insert: {
          amount: number
          currency?: Database["public"]["Enums"]["currency_type"] | null
          payment_method?: string | null
          payment_provider?: string | null
          plan_id?: number | null
          product_id?: number | null
          provider_charge_id?: string | null
          provider_metadata?: Json | null
          provider_subscription_id?: string | null
          settlement_base?: number | null
          settlement_currency?: string | null
          settlement_mint?: string | null
          settlement_sol_usd?: number | null
          status?: Database["public"]["Enums"]["transaction_status"]
          stripe_payment_intent_id?: string | null
          tenant_id?: string
          transaction_date?: string
          transaction_id?: number
          user_id: string
        }
        Update: {
          amount?: number
          currency?: Database["public"]["Enums"]["currency_type"] | null
          payment_method?: string | null
          payment_provider?: string | null
          plan_id?: number | null
          product_id?: number | null
          provider_charge_id?: string | null
          provider_metadata?: Json | null
          provider_subscription_id?: string | null
          settlement_base?: number | null
          settlement_currency?: string | null
          settlement_mint?: string | null
          settlement_sol_usd?: number | null
          status?: Database["public"]["Enums"]["transaction_status"]
          stripe_payment_intent_id?: string | null
          tenant_id?: string
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
            foreignKeyName: "transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_notifications: {
        Row: {
          action_taken: string | null
          action_taken_at: string | null
          created_at: string
          dismissed: boolean | null
          dismissed_at: string | null
          email_sent: boolean | null
          email_sent_at: string | null
          id: number
          in_app_read: boolean | null
          in_app_read_at: string | null
          notification_id: number
          push_sent: boolean | null
          push_sent_at: string | null
          user_id: string
        }
        Insert: {
          action_taken?: string | null
          action_taken_at?: string | null
          created_at?: string
          dismissed?: boolean | null
          dismissed_at?: string | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: number
          in_app_read?: boolean | null
          in_app_read_at?: string | null
          notification_id: number
          push_sent?: boolean | null
          push_sent_at?: string | null
          user_id: string
        }
        Update: {
          action_taken?: string | null
          action_taken_at?: string | null
          created_at?: string
          dismissed?: boolean | null
          dismissed_at?: string | null
          email_sent?: boolean | null
          email_sent_at?: string | null
          id?: number
          in_app_read?: boolean | null
          in_app_read_at?: string | null
          notification_id?: number
          push_sent?: boolean | null
          push_sent_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_notifications_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
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
        Relationships: []
      }
      webhook_events: {
        Row: {
          error: string | null
          event_type: string | null
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          provider_event_id: string
          received_at: string
        }
        Insert: {
          error?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          provider: string
          provider_event_id: string
          received_at?: string
        }
        Update: {
          error?: string | null
          event_type?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          provider_event_id?: string
          received_at?: string
        }
        Relationships: []
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
            foreignKeyName: "exams_course_id_fkey"
            columns: ["exam_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "exams_course_id_fkey"
            columns: ["exam_course_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["course_id"]
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
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["lesson_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "lessons_course_id_fkey"
            columns: ["lesson_course_id"]
            isOneToOne: false
            referencedRelation: "exercise_view"
            referencedColumns: ["course_id"]
          },
        ]
      }
      exercise_view: {
        Row: {
          course_id: number | null
          description: string | null
          difficulty_level:
            | Database["public"]["Enums"]["difficulty_level"]
            | null
          exercise_type: Database["public"]["Enums"]["exercise_type"] | null
          id: number | null
          time_limit: number | null
          title: string | null
        }
        Relationships: []
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
        Relationships: []
      }
      mcp_audit_summary: {
        Row: {
          avg_duration_ms: number | null
          hour: string | null
          max_duration_ms: number | null
          request_count: number | null
          success: boolean | null
          tool_name: string | null
          user_role: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      award_xp:
        | {
            Args: {
              _action_type: string
              _reference_id?: string
              _reference_type?: string
              _user_id: string
              _xp_amount: number
            }
            Returns: undefined
          }
        | {
            Args: {
              _action_type: string
              _reference_id?: string
              _reference_type?: string
              _tenant_id?: string
              _user_id: string
              _xp_amount: number
            }
            Returns: undefined
          }
      calculate_course_completion: {
        Args: { p_course_id: number; p_user_id: string }
        Returns: Json
      }
      calculate_pending_payout: {
        Args: { p_tenant_id: string }
        Returns: number
      }
      cancel_subscription: {
        Args: { _plan_id: number; _user_id: string }
        Returns: undefined
      }
      check_and_issue_certificate: {
        Args: { p_course_id: number; p_user_id: string }
        Returns: Json
      }
      cleanup_old_preview_sessions: { Args: never; Returns: undefined }
      create_exam_submission: {
        Args: { p_answers: Json; p_exam_id: number; p_student_id: string }
        Returns: number
      }
      create_notification:
        | {
            Args: {
              _message: string
              _notification_type: string
              _user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              _message: string
              _notification_type: Database["public"]["Enums"]["notification_types"]
              _user_id: string
            }
            Returns: undefined
          }
      create_school: { Args: { _name: string; _slug: string }; Returns: string }
      create_student_question_notification: {
        Args: { _context?: string; _course_id: number; _message: string }
        Returns: number
      }
      create_transaction_for_renewal: {
        Args: { pln_id: number; sub_id: number; usr_id: string }
        Returns: number
      }
      elo_apply_match: {
        Args: {
          _course_id: number
          _item_id: number
          _item_topic: string
          _item_type: string
          _score: number
          _student_topic: string
          _tenant_id: string
          _user_id: string
        }
        Returns: undefined
      }
      elo_expected: { Args: { a: number; b: number }; Returns: number }
      elo_k: { Args: { attempts: number }; Returns: number }
      enroll_user: {
        Args: { _product_id: number; _user_id: string }
        Returns: undefined
      }
      extend_subscription_period: {
        Args: {
          _new_period_end: string
          _provider: string
          _provider_subscription_id: string
        }
        Returns: undefined
      }
      generate_verification_code: { Args: never; Returns: string }
      get_completed_courses_count: {
        Args: { _user_id: string }
        Returns: number
      }
      get_daily_digest_candidates: {
        Args: never
        Returns: {
          current_streak: number
          due_cards: number
          email: string
          full_name: string
          goals_pending: number
          last_activity_date: string
          tenant_id: string
          user_id: string
        }[]
      }
      get_exam_submissions: {
        Args: { p_exam_id: number }
        Returns: {
          evaluated_at: string
          exam_id: number
          exam_title: string
          feedback: string
          full_name: string
          is_reviewed: boolean
          score: number
          student_id: string
          submission_date: string
          submission_id: number
        }[]
      }
      get_gamification_features: { Args: { _tenant_id: string }; Returns: Json }
      get_league_standings: { Args: never; Returns: Json }
      get_likes_received_count: { Args: { _user_id: string }; Returns: number }
      get_plan_features: { Args: { _tenant_id: string }; Returns: Json }
      get_platform_revenue: {
        Args: { _end?: string; _start?: string }
        Returns: Json
      }
      get_platform_stats: { Args: never; Returns: Json }
      get_tenant_id: { Args: never; Returns: string }
      get_tenant_role: { Args: never; Returns: string }
      grant_free_entitlement: {
        Args: { _course_id: number; _user_id: string }
        Returns: undefined
      }
      grant_free_subscription: {
        Args: { _plan_id: number; _user_id: string }
        Returns: undefined
      }
      handle_manual_subscription_expiry: { Args: never; Returns: undefined }
      handle_new_subscription: {
        Args: {
          _plan_id: number
          _start_date?: string
          _transaction_id: number
          _user_id: string
        }
        Returns: undefined
      }
      handle_student_subscription_expiry: { Args: never; Returns: undefined }
      has_course_access: {
        Args: { _course_id: number; _user_id: string }
        Returns: boolean
      }
      identify_subscriptions_due_for_renewal: {
        Args: { renewal_period: string }
        Returns: {
          end_date: string
          plan_id: number
          subscription_id: number
          user_id: string
        }[]
      }
      is_super_admin: { Args: never; Returns: boolean }
      issue_certificate_if_eligible: {
        Args: { p_course_id: number; p_user_id: string }
        Returns: Json
      }
      next_version_number: {
        Args: { _id: number; _type: string }
        Returns: number
      }
      notify_users_for_renewal: { Args: never; Returns: undefined }
      override_exam_score: {
        Args: {
          p_new_points: number
          p_score_id: number
          p_teacher_id: string
          p_teacher_notes: string
        }
        Returns: undefined
      }
      publish_scheduled_lessons: { Args: never; Returns: undefined }
      refresh_leaderboard_cache: { Args: never; Returns: undefined }
      register_push_token: {
        Args: { _device_name?: string; _platform: string; _token: string }
        Returns: undefined
      }
      restore_exam_version: {
        Args: { _exam_id: number; _version_number: number }
        Returns: undefined
      }
      restore_exercise_version: {
        Args: { _exercise_id: number; _version_number: number }
        Returns: undefined
      }
      restore_lesson_version: {
        Args: { _lesson_id: number; _version_number: number }
        Returns: undefined
      }
      restore_prompt_template_version: {
        Args: { _template_id: number; _version_number: number }
        Returns: undefined
      }
      rollover_all_leagues: { Args: { _week_start?: string }; Returns: number }
      rollover_leagues: {
        Args: { _tenant_id: string; _week_start?: string }
        Returns: number
      }
      save_exam_feedback: {
        Args: {
          p_ai_model?: string
          p_answers: Json
          p_exam_id: number
          p_overall_feedback: string
          p_processing_time_ms?: number
          p_question_feedback: Json
          p_score: number
          p_student_id: string
          p_submission_id: number
        }
        Returns: undefined
      }
      save_product_creation_wizard: {
        Args: {
          _author_id: string
          _course: Json
          _existing_course_id: number
          _intent: string
          _pricing_mode: string
          _product: Json
          _product_id: number
          _source_mode: string
          _steps: Json
          _tenant_id: string
        }
        Returns: Json
      }
      self_enroll_subscription_course: {
        Args: { _course_id: number }
        Returns: undefined
      }
      set_league_opt_out: { Args: { _opt_out: boolean }; Returns: undefined }
      update_token_last_used: {
        Args: { ip_input: unknown; token_id_input: number }
        Returns: undefined
      }
      validate_mcp_api_token: {
        Args: { token_input: string }
        Returns: {
          email: string
          token_id: number
          user_id: string
          user_role: string
        }[]
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
      currency_type:
        | "usd"
        | "eur"
        | "mxn"
        | "cop"
        | "clp"
        | "pen"
        | "ars"
        | "brl"
      difficulty_level: "easy" | "medium" | "hard"
      enrollement_status: "active" | "disabled"
      entitlement_source: "product" | "subscription" | "free" | "admin_grant"
      entitlement_status: "active" | "revoked" | "expired"
      exercise_file_type: "code" | "test" | "solution" | "config"
      exercise_type:
        | "quiz"
        | "coding_challenge"
        | "essay"
        | "multiple_choice"
        | "true_false"
        | "fill_in_the_blank"
        | "discussion"
        | "audio_evaluation"
        | "video_evaluation"
        | "real_time_conversation"
        | "artifact"
      notification_types:
        | "comment_reply"
        | "comment"
        | "exam_review"
        | "order_renewal"
        | "subscription_renewal"
      reactions: "like" | "dislike" | "boring" | "funny"
      review_status: "approved" | "pending" | "failed"
      reviewable: "lessons" | "courses" | "exams"
      status: "published" | "draft" | "archived"
      subscription_status:
        | "active"
        | "canceled"
        | "expired"
        | "renewed"
        | "past_due"
      ticket_status: "open" | "in_progress" | "resolved" | "closed"
      transaction_status:
        | "pending"
        | "successful"
        | "failed"
        | "archived"
        | "canceled"
        | "refunded"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      ai_sender_type: [
        "system",
        "user",
        "assistant",
        "function",
        "data",
        "tool",
      ],
      app_role: ["admin", "moderator", "teacher", "student"],
      chat_types: ["free_chat", "q&a", "exam_prep", "course_convo"],
      currency_type: ["usd", "eur", "mxn", "cop", "clp", "pen", "ars", "brl"],
      difficulty_level: ["easy", "medium", "hard"],
      enrollement_status: ["active", "disabled"],
      entitlement_source: ["product", "subscription", "free", "admin_grant"],
      entitlement_status: ["active", "revoked", "expired"],
      exercise_file_type: ["code", "test", "solution", "config"],
      exercise_type: [
        "quiz",
        "coding_challenge",
        "essay",
        "multiple_choice",
        "true_false",
        "fill_in_the_blank",
        "discussion",
        "audio_evaluation",
        "video_evaluation",
        "real_time_conversation",
        "artifact",
      ],
      notification_types: [
        "comment_reply",
        "comment",
        "exam_review",
        "order_renewal",
        "subscription_renewal",
      ],
      reactions: ["like", "dislike", "boring", "funny"],
      review_status: ["approved", "pending", "failed"],
      reviewable: ["lessons", "courses", "exams"],
      status: ["published", "draft", "archived"],
      subscription_status: [
        "active",
        "canceled",
        "expired",
        "renewed",
        "past_due",
      ],
      ticket_status: ["open", "in_progress", "resolved", "closed"],
      transaction_status: [
        "pending",
        "successful",
        "failed",
        "archived",
        "canceled",
        "refunded",
      ],
    },
  },
} as const

