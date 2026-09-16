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
      attempts: {
        Row: {
          answer: Json
          applied_delta: number | null
          boss_kind: Database["public"]["Enums"]["boss_kind"] | null
          boss_ref: string | null
          chain_rung: number | null
          client_nonce: string
          concept_id: string | null
          concept_ids: string[]
          correct: boolean | null
          created_at: string
          depth: number
          dimension: Database["public"]["Enums"]["mastery_dimension"] | null
          duration_ms: number
          exercise_id: string | null
          failure_reason: string | null
          flags: string[]
          form_key: string
          id: number
          kind: Database["public"]["Enums"]["attempt_kind"]
          lesson_id: string | null
          llm_class: string | null
          llm_evaluation: Json | null
          local_date: string
          misconception_ids: string[]
          next_retry_at: string | null
          passed: boolean | null
          probe_angle: Database["public"]["Enums"]["probe_angle"] | null
          question_type: Database["public"]["Enums"]["question_type"]
          retry_count: number
          review_item_id: string | null
          score: number | null
          scorer: Database["public"]["Enums"]["scorer_kind"]
          self_confidence: number | null
          status: Database["public"]["Enums"]["attempt_status"]
          step: Database["public"]["Enums"]["session_step"] | null
          user_id: string
          verdict: Database["public"]["Enums"]["confidence_verdict"]
        }
        Insert: {
          answer: Json
          applied_delta?: number | null
          boss_kind?: Database["public"]["Enums"]["boss_kind"] | null
          boss_ref?: string | null
          chain_rung?: number | null
          client_nonce: string
          concept_id?: string | null
          concept_ids?: string[]
          correct?: boolean | null
          created_at?: string
          depth: number
          dimension?: Database["public"]["Enums"]["mastery_dimension"] | null
          duration_ms?: number
          exercise_id?: string | null
          failure_reason?: string | null
          flags?: string[]
          form_key: string
          id?: never
          kind: Database["public"]["Enums"]["attempt_kind"]
          lesson_id?: string | null
          llm_class?: string | null
          llm_evaluation?: Json | null
          local_date: string
          misconception_ids?: string[]
          next_retry_at?: string | null
          passed?: boolean | null
          probe_angle?: Database["public"]["Enums"]["probe_angle"] | null
          question_type: Database["public"]["Enums"]["question_type"]
          retry_count?: number
          review_item_id?: string | null
          score?: number | null
          scorer: Database["public"]["Enums"]["scorer_kind"]
          self_confidence?: number | null
          status?: Database["public"]["Enums"]["attempt_status"]
          step?: Database["public"]["Enums"]["session_step"] | null
          user_id: string
          verdict?: Database["public"]["Enums"]["confidence_verdict"]
        }
        Update: {
          answer?: Json
          applied_delta?: number | null
          boss_kind?: Database["public"]["Enums"]["boss_kind"] | null
          boss_ref?: string | null
          chain_rung?: number | null
          client_nonce?: string
          concept_id?: string | null
          concept_ids?: string[]
          correct?: boolean | null
          created_at?: string
          depth?: number
          dimension?: Database["public"]["Enums"]["mastery_dimension"] | null
          duration_ms?: number
          exercise_id?: string | null
          failure_reason?: string | null
          flags?: string[]
          form_key?: string
          id?: never
          kind?: Database["public"]["Enums"]["attempt_kind"]
          lesson_id?: string | null
          llm_class?: string | null
          llm_evaluation?: Json | null
          local_date?: string
          misconception_ids?: string[]
          next_retry_at?: string | null
          passed?: boolean | null
          probe_angle?: Database["public"]["Enums"]["probe_angle"] | null
          question_type?: Database["public"]["Enums"]["question_type"]
          retry_count?: number
          review_item_id?: string | null
          score?: number | null
          scorer?: Database["public"]["Enums"]["scorer_kind"]
          self_confidence?: number | null
          status?: Database["public"]["Enums"]["attempt_status"]
          step?: Database["public"]["Enums"]["session_step"] | null
          user_id?: string
          verdict?: Database["public"]["Enums"]["confidence_verdict"]
        }
        Relationships: [
          {
            foreignKeyName: "attempts_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attempts_review_item_id_fkey"
            columns: ["review_item_id"]
            isOneToOne: false
            referencedRelation: "review_items"
            referencedColumns: ["id"]
          },
        ]
      }
      concept_skills: {
        Row: {
          concept_id: string
          skill_id: string
          weight: number
        }
        Insert: {
          concept_id: string
          skill_id: string
          weight: number
        }
        Update: {
          concept_id?: string
          skill_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "concept_skills_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concept_skills_skill_id_fkey"
            columns: ["skill_id"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      concepts: {
        Row: {
          id: string
          parent_id: string | null
          retired_at: string | null
          skill: string
          title: string
          world_id: string
        }
        Insert: {
          id: string
          parent_id?: string | null
          retired_at?: string | null
          skill: string
          title: string
          world_id: string
        }
        Update: {
          id?: string
          parent_id?: string | null
          retired_at?: string | null
          skill?: string
          title?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "concepts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepts_skill_fkey"
            columns: ["skill"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "concepts_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_concepts: {
        Row: {
          concept_id: string
          is_primary: boolean
          lesson_id: string
        }
        Insert: {
          concept_id: string
          is_primary?: boolean
          lesson_id: string
        }
        Update: {
          concept_id?: string
          is_primary?: boolean
          lesson_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_concepts_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lesson_concepts_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_progress: {
        Row: {
          completed_at: string | null
          content_hash_seen: string | null
          current_step: Database["public"]["Enums"]["session_step"]
          flex_action_last: Database["public"]["Enums"]["flex_action"] | null
          lesson_id: string
          started_at: string | null
          status: Database["public"]["Enums"]["lesson_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          content_hash_seen?: string | null
          current_step?: Database["public"]["Enums"]["session_step"]
          flex_action_last?: Database["public"]["Enums"]["flex_action"] | null
          lesson_id: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["lesson_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          content_hash_seen?: string | null
          current_step?: Database["public"]["Enums"]["session_step"]
          flex_action_last?: Database["public"]["Enums"]["flex_action"] | null
          lesson_id?: string
          started_at?: string | null
          status?: Database["public"]["Enums"]["lesson_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_progress_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lesson_step_states: {
        Row: {
          completed_at: string | null
          duration_ms: number
          entered_at: string | null
          lesson_id: string
          payload: Json
          skip_reason: Database["public"]["Enums"]["skip_reason"] | null
          status: Database["public"]["Enums"]["step_status"]
          step: Database["public"]["Enums"]["session_step"]
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          duration_ms?: number
          entered_at?: string | null
          lesson_id: string
          payload?: Json
          skip_reason?: Database["public"]["Enums"]["skip_reason"] | null
          status?: Database["public"]["Enums"]["step_status"]
          step: Database["public"]["Enums"]["session_step"]
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          duration_ms?: number
          entered_at?: string | null
          lesson_id?: string
          payload?: Json
          skip_reason?: Database["public"]["Enums"]["skip_reason"] | null
          status?: Database["public"]["Enums"]["step_status"]
          step?: Database["public"]["Enums"]["session_step"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_step_states_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["id"]
          },
        ]
      }
      lessons: {
        Row: {
          api_version: string
          content_hash: string
          day: number
          id: string
          kind: string
          mission_id: string
          ordinal: number
          release: string
          retired_at: string | null
          title: string
          visibility: string
        }
        Insert: {
          api_version: string
          content_hash: string
          day: number
          id: string
          kind: string
          mission_id: string
          ordinal: number
          release: string
          retired_at?: string | null
          title: string
          visibility: string
        }
        Update: {
          api_version?: string
          content_hash?: string
          day?: number
          id?: string
          kind?: string
          mission_id?: string
          ordinal?: number
          release?: string
          retired_at?: string | null
          title?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_mission_id_fkey"
            columns: ["mission_id"]
            isOneToOne: false
            referencedRelation: "missions"
            referencedColumns: ["id"]
          },
        ]
      }
      llm_usage: {
        Row: {
          count: number
          hour_bucket: string
          user_id: string
        }
        Insert: {
          count?: number
          hour_bucket: string
          user_id: string
        }
        Update: {
          count?: number
          hour_bucket?: string
          user_id?: string
        }
        Relationships: []
      }
      mastery: {
        Row: {
          application: number
          architecture: number
          band: Database["public"]["Enums"]["mastery_band"]
          cap_reason: Database["public"]["Enums"]["cap_reason"] | null
          concept_id: string
          created_at: string
          debugging: number
          evidence_count: number
          overall: number
          recall: number
          state: Json
          teach_back: number
          understanding: number
          updated_at: string
          user_id: string
        }
        Insert: {
          application?: number
          architecture?: number
          band?: Database["public"]["Enums"]["mastery_band"]
          cap_reason?: Database["public"]["Enums"]["cap_reason"] | null
          concept_id: string
          created_at?: string
          debugging?: number
          evidence_count?: number
          overall?: number
          recall?: number
          state?: Json
          teach_back?: number
          understanding?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          application?: number
          architecture?: number
          band?: Database["public"]["Enums"]["mastery_band"]
          cap_reason?: Database["public"]["Enums"]["cap_reason"] | null
          concept_id?: string
          created_at?: string
          debugging?: number
          evidence_count?: number
          overall?: number
          recall?: number
          state?: Json
          teach_back?: number
          understanding?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mastery_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      missions: {
        Row: {
          boss_lesson_id: string | null
          id: string
          ordinal: number
          retired_at: string | null
          title: string
          world_id: string
        }
        Insert: {
          boss_lesson_id?: string | null
          id: string
          ordinal: number
          retired_at?: string | null
          title: string
          world_id: string
        }
        Update: {
          boss_lesson_id?: string | null
          id?: string
          ordinal?: number
          retired_at?: string | null
          title?: string
          world_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "missions_world_id_fkey"
            columns: ["world_id"]
            isOneToOne: false
            referencedRelation: "worlds"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_log: {
        Row: {
          created_at: string
          error: string | null
          id: number
          kind: string
          local_date: string
          provider: string
          provider_message_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: never
          kind: string
          local_date: string
          provider: string
          provider_message_id?: string | null
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: never
          kind?: string
          local_date?: string
          provider?: string
          provider_message_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      notification_preferences: {
        Row: {
          enabled: boolean
          frequency: string
          preferred_hour: number
          review_due_reminder: boolean
          streak_reminder: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          enabled?: boolean
          frequency?: string
          preferred_hour?: number
          review_due_reminder?: boolean
          streak_reminder?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          enabled?: boolean
          frequency?: string
          preferred_hour?: number
          review_due_reminder?: boolean
          streak_reminder?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          email: string | null
          explanation_mode_default: string
          id: string
          plan: string
          time_zone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          email?: string | null
          explanation_mode_default?: string
          id: string
          plan?: string
          time_zone?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string
          email?: string | null
          explanation_mode_default?: string
          id?: string
          plan?: string
          time_zone?: string
          updated_at?: string
        }
        Relationships: []
      }
      review_items: {
        Row: {
          angle: Database["public"]["Enums"]["probe_angle"] | null
          concept_id: string
          created_at: string
          depth: number
          dimension: Database["public"]["Enums"]["mastery_dimension"]
          due_on: string
          exclude_form_keys: string[]
          id: string
          interval_days: number
          lapses: number
          last_outcome: Database["public"]["Enums"]["review_outcome"] | null
          question_type: Database["public"]["Enums"]["question_type"]
          reason: Database["public"]["Enums"]["review_reason"]
          review_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          angle?: Database["public"]["Enums"]["probe_angle"] | null
          concept_id: string
          created_at?: string
          depth: number
          dimension: Database["public"]["Enums"]["mastery_dimension"]
          due_on: string
          exclude_form_keys?: string[]
          id?: string
          interval_days: number
          lapses?: number
          last_outcome?: Database["public"]["Enums"]["review_outcome"] | null
          question_type: Database["public"]["Enums"]["question_type"]
          reason: Database["public"]["Enums"]["review_reason"]
          review_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          angle?: Database["public"]["Enums"]["probe_angle"] | null
          concept_id?: string
          created_at?: string
          depth?: number
          dimension?: Database["public"]["Enums"]["mastery_dimension"]
          due_on?: string
          exclude_form_keys?: string[]
          id?: string
          interval_days?: number
          lapses?: number
          last_outcome?: Database["public"]["Enums"]["review_outcome"] | null
          question_type?: Database["public"]["Enums"]["question_type"]
          reason?: Database["public"]["Enums"]["review_reason"]
          review_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_items_concept_id_fkey"
            columns: ["concept_id"]
            isOneToOne: false
            referencedRelation: "concepts"
            referencedColumns: ["id"]
          },
        ]
      }
      skills: {
        Row: {
          id: string
          label: string
          ordinal: number
        }
        Insert: {
          id: string
          label: string
          ordinal: number
        }
        Update: {
          id?: string
          label?: string
          ordinal?: number
        }
        Relationships: []
      }
      worlds: {
        Row: {
          id: string
          ordinal: number
          retired_at: string | null
          skill: string
          title: string
        }
        Insert: {
          id: string
          ordinal: number
          retired_at?: string | null
          skill: string
          title: string
        }
        Update: {
          id?: string
          ordinal?: number
          retired_at?: string | null
          skill?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "worlds_skill_fkey"
            columns: ["skill"]
            isOneToOne: false
            referencedRelation: "skills"
            referencedColumns: ["id"]
          },
        ]
      }
      xp_transactions: {
        Row: {
          amount: number
          attempt_id: number | null
          base: number
          created_at: string
          id: number
          local_date: string
          multiplier: number
          reason: Database["public"]["Enums"]["xp_reason"]
          ref: string | null
          user_id: string
        }
        Insert: {
          amount: number
          attempt_id?: number | null
          base: number
          created_at?: string
          id?: never
          local_date: string
          multiplier?: number
          reason: Database["public"]["Enums"]["xp_reason"]
          ref?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          attempt_id?: number | null
          base?: number
          created_at?: string
          id?: never
          local_date?: string
          multiplier?: number
          reason?: Database["public"]["Enums"]["xp_reason"]
          ref?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "xp_transactions_attempt_id_fkey"
            columns: ["attempt_id"]
            isOneToOne: false
            referencedRelation: "attempts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_qualifying_days: {
        Row: {
          local_date: string | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      advance_step: {
        Args: {
          p_content_hash?: string
          p_duration_ms?: number
          p_flex_action?: Database["public"]["Enums"]["flex_action"]
          p_lesson_id: string
          p_lesson_status?: Database["public"]["Enums"]["lesson_status"]
          p_payload?: Json
          p_skip_reason?: Database["public"]["Enums"]["skip_reason"]
          p_status: Database["public"]["Enums"]["step_status"]
          p_step: Database["public"]["Enums"]["session_step"]
          p_user: string
        }
        Returns: undefined
      }
      check_llm_quota: {
        Args: { p_plan_limits: Json }
        Returns: {
          allowed: boolean
          remaining_day: number
          remaining_hour: number
          retry_after: string
        }[]
      }
      complete_read_step: {
        Args: {
          p_content_hash?: string
          p_duration_ms?: number
          p_lesson_id: string
          p_payload?: Json
          p_status: Database["public"]["Enums"]["step_status"]
          p_step: Database["public"]["Enums"]["session_step"]
        }
        Returns: undefined
      }
      record_attempt: { Args: { payload: Json }; Returns: Json }
      reserve_llm_call: {
        Args: { p_plan_limits: Json }
        Returns: {
          allowed: boolean
          remaining_day: number
          remaining_hour: number
          retry_after: string
        }[]
      }
      resolve_pending_evaluation: {
        Args: { p_attempt_id: number; payload: Json }
        Returns: Json
      }
    }
    Enums: {
      attempt_kind:
        | "question"
        | "prediction"
        | "explain_why"
        | "teach_back"
        | "scenario"
        | "lab"
        | "boss"
        | "capstone"
      attempt_status: "evaluated" | "pending_evaluation" | "needs_review"
      boss_kind: "mission" | "weekly" | "capstone"
      cap_reason:
        | "recall_only"
        | "no_understanding"
        | "no_application_or_debugging"
        | "no_optimize_evidence"
        | "no_design_evidence"
        | "mastered_gate"
        | "min_evidence"
      confidence_verdict:
        | "calibrated"
        | "suspicious"
        | "overconfident"
        | "underconfident"
        | "unknown"
      flex_action:
        | "continue"
        | "challenge_me"
        | "review_weakness"
        | "next_mission"
      lesson_status:
        | "not_started"
        | "in_progress"
        | "completed"
        | "completed_early"
        | "skipped_with_gap"
      mastery_band:
        | "lost"
        | "familiar"
        | "developing"
        | "competent"
        | "strong"
        | "mastered"
      mastery_dimension:
        | "recall"
        | "understanding"
        | "application"
        | "debugging"
        | "architecture"
        | "teach_back"
      probe_angle:
        | "why"
        | "what_if"
        | "what_breaks"
        | "what_would_you_change"
        | "explain_without_jargon"
        | "explain_to_junior"
        | "predict"
      question_type:
        | "mcq"
        | "multi_select"
        | "true_false"
        | "predict_outcome"
        | "order_execution"
        | "debug_code"
        | "find_anti_pattern"
        | "explain_why"
        | "compare_approaches"
        | "architecture_decision"
        | "fix_design"
        | "scenario_diagnosis"
        | "teach_back"
        | "lab"
        | "boss"
        | "capstone"
      review_outcome: "fail" | "struggle" | "strong" | "mastered"
      review_reason:
        | "weak_dimension"
        | "failed_attempt"
        | "skipped_with_gap"
        | "scheduled"
      scorer_kind: "deterministic" | "llm"
      session_step:
        | "warmup"
        | "curiosity"
        | "problem"
        | "caveman"
        | "technical"
        | "simulation"
        | "prediction"
        | "hands_on"
        | "teach_back"
        | "assessment"
        | "spaced_review"
        | "real_world_scenario"
      skip_reason: "confident" | "challenge_gate" | "move_on"
      step_status:
        | "locked"
        | "available"
        | "active"
        | "awaiting_prediction"
        | "predicted"
        | "revealed"
        | "submitted"
        | "pending_evaluation"
        | "completed"
        | "skipped"
      xp_reason:
        | "answer_correct"
        | "prediction_correct"
        | "explain_why_passed"
        | "teach_back_passed"
        | "scenario_passed"
        | "lab_completed"
        | "review_answered"
        | "review_correct"
        | "lesson_completed"
        | "band_reached"
        | "mission_boss_attempted"
        | "mission_boss_defeated"
        | "weekly_boss_attempted"
        | "weekly_boss_defeated"
        | "capstone_attempted"
        | "capstone_passed"
        | "achievement_unlocked"
        | "manual_adjustment"
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
      attempt_kind: [
        "question",
        "prediction",
        "explain_why",
        "teach_back",
        "scenario",
        "lab",
        "boss",
        "capstone",
      ],
      attempt_status: ["evaluated", "pending_evaluation", "needs_review"],
      boss_kind: ["mission", "weekly", "capstone"],
      cap_reason: [
        "recall_only",
        "no_understanding",
        "no_application_or_debugging",
        "no_optimize_evidence",
        "no_design_evidence",
        "mastered_gate",
        "min_evidence",
      ],
      confidence_verdict: [
        "calibrated",
        "suspicious",
        "overconfident",
        "underconfident",
        "unknown",
      ],
      flex_action: [
        "continue",
        "challenge_me",
        "review_weakness",
        "next_mission",
      ],
      lesson_status: [
        "not_started",
        "in_progress",
        "completed",
        "completed_early",
        "skipped_with_gap",
      ],
      mastery_band: [
        "lost",
        "familiar",
        "developing",
        "competent",
        "strong",
        "mastered",
      ],
      mastery_dimension: [
        "recall",
        "understanding",
        "application",
        "debugging",
        "architecture",
        "teach_back",
      ],
      probe_angle: [
        "why",
        "what_if",
        "what_breaks",
        "what_would_you_change",
        "explain_without_jargon",
        "explain_to_junior",
        "predict",
      ],
      question_type: [
        "mcq",
        "multi_select",
        "true_false",
        "predict_outcome",
        "order_execution",
        "debug_code",
        "find_anti_pattern",
        "explain_why",
        "compare_approaches",
        "architecture_decision",
        "fix_design",
        "scenario_diagnosis",
        "teach_back",
        "lab",
        "boss",
        "capstone",
      ],
      review_outcome: ["fail", "struggle", "strong", "mastered"],
      review_reason: [
        "weak_dimension",
        "failed_attempt",
        "skipped_with_gap",
        "scheduled",
      ],
      scorer_kind: ["deterministic", "llm"],
      session_step: [
        "warmup",
        "curiosity",
        "problem",
        "caveman",
        "technical",
        "simulation",
        "prediction",
        "hands_on",
        "teach_back",
        "assessment",
        "spaced_review",
        "real_world_scenario",
      ],
      skip_reason: ["confident", "challenge_gate", "move_on"],
      step_status: [
        "locked",
        "available",
        "active",
        "awaiting_prediction",
        "predicted",
        "revealed",
        "submitted",
        "pending_evaluation",
        "completed",
        "skipped",
      ],
      xp_reason: [
        "answer_correct",
        "prediction_correct",
        "explain_why_passed",
        "teach_back_passed",
        "scenario_passed",
        "lab_completed",
        "review_answered",
        "review_correct",
        "lesson_completed",
        "band_reached",
        "mission_boss_attempted",
        "mission_boss_defeated",
        "weekly_boss_attempted",
        "weekly_boss_defeated",
        "capstone_attempted",
        "capstone_passed",
        "achievement_unlocked",
        "manual_adjustment",
      ],
    },
  },
} as const

