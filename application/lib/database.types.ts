export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_users: {
        Row: {
          added_at: string
          added_by: string | null
          email: string
          full_name: string | null
          user_id: string
        }
        Insert: {
          added_at?: string
          added_by?: string | null
          email: string
          full_name?: string | null
          user_id: string
        }
        Update: {
          added_at?: string
          added_by?: string | null
          email?: string
          full_name?: string | null
          user_id?: string
        }
        Relationships: []
      }
      alumni: {
        Row: {
          cohort: string
          consent_confirmed: boolean
          created_at: string
          degree_course: string | null
          firm: string
          id: string
          industry: string | null
          is_published: boolean
          linkedin_url: string | null
          location: string | null
          mutis_position: string | null
          name: string
          role: string
          updated_at: string
        }
        Insert: {
          cohort: string
          consent_confirmed?: boolean
          created_at?: string
          degree_course?: string | null
          firm: string
          id?: string
          industry?: string | null
          is_published?: boolean
          linkedin_url?: string | null
          location?: string | null
          mutis_position?: string | null
          name: string
          role: string
          updated_at?: string
        }
        Update: {
          cohort?: string
          consent_confirmed?: boolean
          created_at?: string
          degree_course?: string | null
          firm?: string
          id?: string
          industry?: string | null
          is_published?: boolean
          linkedin_url?: string | null
          location?: string | null
          mutis_position?: string | null
          name?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      alumni_submissions: {
        Row: {
          consent_at: string
          consent_gdpr: boolean
          consent_publish: boolean
          created_at: string
          current_company: string
          current_position: string
          degree_course: string | null
          full_name: string
          graduation_year: number
          id: string
          industry: string | null
          linkedin_url: string | null
          mutis_position: string | null
          photo_url: string | null
          status: string
        }
        Insert: {
          consent_at: string
          consent_gdpr: boolean
          consent_publish: boolean
          created_at?: string
          current_company: string
          current_position: string
          degree_course?: string | null
          full_name: string
          graduation_year: number
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          mutis_position?: string | null
          photo_url?: string | null
          status?: string
        }
        Update: {
          consent_at?: string
          consent_gdpr?: boolean
          consent_publish?: boolean
          created_at?: string
          current_company?: string
          current_position?: string
          degree_course?: string | null
          full_name?: string
          graduation_year?: number
          id?: string
          industry?: string | null
          linkedin_url?: string | null
          mutis_position?: string | null
          photo_url?: string | null
          status?: string
        }
        Relationships: []
      }
      articles: {
        Row: {
          author_id: string | null
          author_name: string
          body_html: string | null
          cover_image_url: string | null
          created_at: string
          id: string
          pdf_url: string | null
          published_at: string | null
          status: string
          tag: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          author_name: string
          body_html?: string | null
          cover_image_url?: string | null
          created_at?: string
          id?: string
          pdf_url?: string | null
          published_at?: string | null
          status?: string
          tag: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          body_html?: string | null
          cover_image_url?: string | null
          created_at?: string
          id?: string
          pdf_url?: string | null
          published_at?: string | null
          status?: string
          tag?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      attendance_submissions: {
        Row: {
          comments: string | null
          course: string
          created_at: string
          email: string
          event_id: string | null
          id: string
          name: string
          other_event_name: string | null
          rating: number
          status: string
          year: string
        }
        Insert: {
          comments?: string | null
          course: string
          created_at?: string
          email: string
          event_id?: string | null
          id?: string
          name: string
          other_event_name?: string | null
          rating: number
          status?: string
          year: string
        }
        Update: {
          comments?: string | null
          course?: string
          created_at?: string
          email?: string
          event_id?: string | null
          id?: string
          name?: string
          other_event_name?: string | null
          rating?: number
          status?: string
          year?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_submissions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_attendance_stats"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "attendance_submissions_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string
          actor_user_id: string | null
          after: Json | null
          before: Json | null
          created_at: string
          id: string
          row_id: string
          table_name: string
        }
        Insert: {
          action: string
          actor_email: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          row_id: string
          table_name: string
        }
        Update: {
          action?: string
          actor_email?: string
          actor_user_id?: string | null
          after?: Json | null
          before?: Json | null
          created_at?: string
          id?: string
          row_id?: string
          table_name?: string
        }
        Relationships: []
      }
      committee_members: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          linkedin_url: string | null
          name: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          linkedin_url?: string | null
          name: string
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          linkedin_url?: string | null
          name?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      contact_submissions: {
        Row: {
          created_at: string
          email: string
          id: string
          message: string
          name: string
          reason: string
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          reason: string
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          reason?: string
          status?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          category: string
          created_at: string
          description: string | null
          file_size_bytes: number | null
          id: string
          is_published: boolean
          storage_path: string
          team_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          file_size_bytes?: number | null
          id?: string
          is_published?: boolean
          storage_path: string
          team_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          file_size_bytes?: number | null
          id?: string
          is_published?: boolean
          storage_path?: string
          team_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      etoro_portfolio_cache: {
        Row: {
          account_totals: Json | null
          fetched_at: string | null
          holdings: Json
          id: boolean
          sync_error: string | null
          sync_status: string
        }
        Insert: {
          account_totals?: Json | null
          fetched_at?: string | null
          holdings?: Json
          id?: boolean
          sync_error?: string | null
          sync_status?: string
        }
        Update: {
          account_totals?: Json | null
          fetched_at?: string | null
          holdings?: Json
          id?: boolean
          sync_error?: string | null
          sync_status?: string
        }
        Relationships: []
      }
      etoro_settings: {
        Row: {
          id: boolean
          is_configured: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          is_configured?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          is_configured?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "etoro_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["user_id"]
          },
        ]
      }
      event_signups: {
        Row: {
          created_at: string
          email: string
          event_id: string
          id: string
          name: string
          notes: string | null
          status: string
        }
        Insert: {
          created_at?: string
          email: string
          event_id: string
          id?: string
          name: string
          notes?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          email?: string
          event_id?: string
          id?: string
          name?: string
          notes?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_signups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_attendance_stats"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_signups_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          capacity: number | null
          cover_image_url: string | null
          created_at: string
          description: string
          ends_at: string | null
          id: string
          is_published: boolean
          location: string
          signup_enabled: boolean
          starts_at: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          cover_image_url?: string | null
          created_at?: string
          description: string
          ends_at?: string | null
          id?: string
          is_published?: boolean
          location: string
          signup_enabled?: boolean
          starts_at: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          cover_image_url?: string | null
          created_at?: string
          description?: string
          ends_at?: string | null
          id?: string
          is_published?: boolean
          location?: string
          signup_enabled?: boolean
          starts_at?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      fund_managers: {
        Row: {
          created_at: string
          id: string
          is_published: boolean
          linkedin_url: string | null
          name: string
          start_year: number
          updated_at: string
          year_label: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_published?: boolean
          linkedin_url?: string | null
          name: string
          start_year: number
          updated_at?: string
          year_label: string
        }
        Update: {
          created_at?: string
          id?: string
          is_published?: boolean
          linkedin_url?: string | null
          name?: string
          start_year?: number
          updated_at?: string
          year_label?: string
        }
        Relationships: []
      }
      gallery_images: {
        Row: {
          caption: string | null
          created_at: string
          display_order: number
          id: string
          image_url: string
          is_published: boolean
          updated_at: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          is_published?: boolean
          updated_at?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          is_published?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      home_programs: {
        Row: {
          created_at: string
          description: string
          display_order: number
          id: string
          is_published: boolean
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          display_order?: number
          id?: string
          is_published?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          display_order?: number
          id?: string
          is_published?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      membership_signup_diversity: {
        Row: {
          contextual_offer_eligible: string | null
          created_at: string
          ethnicity: string | null
          ethnicity_other_description: string | null
          first_generation_student: string | null
          free_school_meals: string | null
          school_type: string | null
          signup_id: string
        }
        Insert: {
          contextual_offer_eligible?: string | null
          created_at?: string
          ethnicity?: string | null
          ethnicity_other_description?: string | null
          first_generation_student?: string | null
          free_school_meals?: string | null
          school_type?: string | null
          signup_id: string
        }
        Update: {
          contextual_offer_eligible?: string | null
          created_at?: string
          ethnicity?: string | null
          ethnicity_other_description?: string | null
          first_generation_student?: string | null
          free_school_meals?: string | null
          school_type?: string | null
          signup_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "membership_signup_diversity_signup_id_fkey"
            columns: ["signup_id"]
            isOneToOne: true
            referencedRelation: "membership_signups"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_signups: {
        Row: {
          consent_share_partners: boolean
          consent_share_partners_at: string | null
          course: string
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          status: string
          year: string
        }
        Insert: {
          consent_share_partners?: boolean
          consent_share_partners_at?: string | null
          course: string
          created_at?: string
          email: string
          full_name: string
          id?: string
          phone?: string | null
          status?: string
          year: string
        }
        Update: {
          consent_share_partners?: boolean
          consent_share_partners_at?: string | null
          course?: string
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          status?: string
          year?: string
        }
        Relationships: []
      }
      network_logos: {
        Row: {
          alumnus_id: string | null
          company_name: string
          created_at: string
          display_order: number
          id: string
          is_published: boolean
          logo_url: string
          updated_at: string
        }
        Insert: {
          alumnus_id?: string | null
          company_name: string
          created_at?: string
          display_order?: number
          id?: string
          is_published?: boolean
          logo_url: string
          updated_at?: string
        }
        Update: {
          alumnus_id?: string | null
          company_name?: string
          created_at?: string
          display_order?: number
          id?: string
          is_published?: boolean
          logo_url?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "network_logos_alumnus_id_fkey"
            columns: ["alumnus_id"]
            isOneToOne: false
            referencedRelation: "alumni"
            referencedColumns: ["id"]
          },
        ]
      }
      page_backgrounds: {
        Row: {
          image_url: string | null
          page_key: string
          updated_at: string
        }
        Insert: {
          image_url?: string | null
          page_key: string
          updated_at?: string
        }
        Update: {
          image_url?: string | null
          page_key?: string
          updated_at?: string
        }
        Relationships: []
      }
      past_speakers: {
        Row: {
          created_at: string
          event: string
          firm: string
          id: string
          is_published: boolean
          name: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event: string
          firm: string
          id?: string
          is_published?: boolean
          name: string
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event?: string
          firm?: string
          id?: string
          is_published?: boolean
          name?: string
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      podcast_settings: {
        Row: {
          created_at: string
          embed_height: number | null
          embed_html: string | null
          embed_title: string | null
          embed_width: number | null
          fetched_at: string | null
          id: string
          spotify_url: string
          thumbnail_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          embed_height?: number | null
          embed_html?: string | null
          embed_title?: string | null
          embed_width?: number | null
          fetched_at?: string | null
          id?: string
          spotify_url?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          embed_height?: number | null
          embed_html?: string | null
          embed_title?: string | null
          embed_width?: number | null
          fetched_at?: string | null
          id?: string
          spotify_url?: string
          thumbnail_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      presidents: {
        Row: {
          created_at: string
          id: string
          is_published: boolean
          linkedin_url: string | null
          name: string
          notes: string | null
          start_year: number
          updated_at: string
          year_label: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_published?: boolean
          linkedin_url?: string | null
          name: string
          notes?: string | null
          start_year: number
          updated_at?: string
          year_label: string
        }
        Update: {
          created_at?: string
          id?: string
          is_published?: boolean
          linkedin_url?: string | null
          name?: string
          notes?: string | null
          start_year?: number
          updated_at?: string
          year_label?: string
        }
        Relationships: []
      }
      recordings: {
        Row: {
          created_at: string
          event_date: string
          id: string
          is_published: boolean
          recording_url: string | null
          speaker: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          event_date: string
          id?: string
          is_published?: boolean
          recording_url?: string | null
          speaker?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          event_date?: string
          id?: string
          is_published?: boolean
          recording_url?: string | null
          speaker?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      site_settings: {
        Row: {
          contact_email: string
          founding_year: number
          freshers_fair_banner_enabled: boolean
          id: number
          instagram_url: string
          linkedin_url: string
          member_count_label: string
          su_signup_url: string
          updated_at: string
          weekly_meeting_info: string
        }
        Insert: {
          contact_email?: string
          founding_year?: number
          freshers_fair_banner_enabled?: boolean
          id?: number
          instagram_url?: string
          linkedin_url?: string
          member_count_label?: string
          su_signup_url?: string
          updated_at?: string
          weekly_meeting_info?: string
        }
        Update: {
          contact_email?: string
          founding_year?: number
          freshers_fair_banner_enabled?: boolean
          id?: number
          instagram_url?: string
          linkedin_url?: string
          member_count_label?: string
          su_signup_url?: string
          updated_at?: string
          weekly_meeting_info?: string
        }
        Relationships: []
      }
      sponsors: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_published: boolean
          link_url: string | null
          logo_url: string | null
          name: string
          role_label: string | null
          sector: string | null
          tier: string
          updated_at: string
          years_active: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_published?: boolean
          link_url?: string | null
          logo_url?: string | null
          name: string
          role_label?: string | null
          sector?: string | null
          tier: string
          updated_at?: string
          years_active?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_published?: boolean
          link_url?: string | null
          logo_url?: string | null
          name?: string
          role_label?: string | null
          sector?: string | null
          tier?: string
          updated_at?: string
          years_active?: string | null
        }
        Relationships: []
      }
      sponsorship_enquiries: {
        Row: {
          company: string
          created_at: string
          email: string
          id: string
          message: string
          name: string
          status: string
        }
        Insert: {
          company: string
          created_at?: string
          email: string
          id?: string
          message: string
          name: string
          status?: string
        }
        Update: {
          company?: string
          created_at?: string
          email?: string
          id?: string
          message?: string
          name?: string
          status?: string
        }
        Relationships: []
      }
      sponsorship_packages: {
        Row: {
          created_at: string
          deliverables: string[]
          display_order: number
          headline: string
          id: string
          is_published: boolean
          tier: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deliverables?: string[]
          display_order?: number
          headline: string
          id?: string
          is_published?: boolean
          tier: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deliverables?: string[]
          display_order?: number
          headline?: string
          id?: string
          is_published?: boolean
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      dashboard_attendance_totals: {
        Row: {
          past_events: number | null
          total_events: number | null
          total_signups: number | null
          unique_attendees: number | null
          upcoming_events: number | null
        }
        Relationships: []
      }
      event_attendance_stats: {
        Row: {
          attendance_count: number | null
          capacity: number | null
          event_id: string | null
          signup_count: number | null
          starts_at: string | null
          title: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      etoro_get_secret: { Args: { secret_name: string }; Returns: string }
      etoro_set_secret: {
        Args: { secret_name: string; secret_value: string }
        Returns: undefined
      }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
