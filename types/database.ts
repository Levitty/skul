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
    PostgrestVersion: "13.0.4"
  }
  public: {
    Tables: {
      admissions: {
        Row: {
          application_date: string
          application_number: string
          applied_class: string
          created_at: string
          date_of_birth: string
          first_name: string
          gender: Database["public"]["Enums"]["gender"]
          id: string
          interview_date: string | null
          interview_notes: string | null
          last_name: string
          parent_email: string | null
          parent_name: string
          parent_phone: string
          status: Database["public"]["Enums"]["admission_status"]
          updated_at: string
        }
        Insert: {
          application_date?: string
          application_number: string
          applied_class: string
          created_at?: string
          date_of_birth: string
          first_name: string
          gender: Database["public"]["Enums"]["gender"]
          id?: string
          interview_date?: string | null
          interview_notes?: string | null
          last_name: string
          parent_email?: string | null
          parent_name: string
          parent_phone: string
          status?: Database["public"]["Enums"]["admission_status"]
          updated_at?: string
        }
        Update: {
          application_date?: string
          application_number?: string
          applied_class?: string
          created_at?: string
          date_of_birth?: string
          first_name?: string
          gender?: Database["public"]["Enums"]["gender"]
          id?: string
          interview_date?: string | null
          interview_notes?: string | null
          last_name?: string
          parent_email?: string | null
          parent_name?: string
          parent_phone?: string
          status?: Database["public"]["Enums"]["admission_status"]
          updated_at?: string
        }
        Relationships: []
      }
      announcements: {
        Row: {
          content: string
          created_at: string
          id: string
          is_active: boolean
          priority: string
          published_at: string | null
          published_by: string | null
          target_audience: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          priority?: string
          published_at?: string | null
          published_by?: string | null
          target_audience: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          priority?: string
          published_at?: string | null
          published_by?: string | null
          target_audience?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          class_id: string
          created_at: string
          date: string
          id: string
          marked_by: string | null
          remarks: string | null
          status: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          class_id: string
          created_at?: string
          date: string
          id?: string
          marked_by?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          class_id?: string
          created_at?: string
          date?: string
          id?: string
          marked_by?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["attendance_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_marked_by_fkey"
            columns: ["marked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      class_subjects: {
        Row: {
          academic_year: string
          class_id: string
          created_at: string
          id: string
          subject_id: string
          teacher_id: string | null
        }
        Insert: {
          academic_year: string
          class_id: string
          created_at?: string
          id?: string
          subject_id: string
          teacher_id?: string | null
        }
        Update: {
          academic_year?: string
          class_id?: string
          created_at?: string
          id?: string
          subject_id?: string
          teacher_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "class_subjects_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subjects_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          academic_year: string
          class_teacher_id: string | null
          created_at: string
          grade_level: number
          id: string
          is_active: boolean
          max_students: number | null
          name: string
          room_number: string | null
          section: string | null
          updated_at: string
        }
        Insert: {
          academic_year: string
          class_teacher_id?: string | null
          created_at?: string
          grade_level: number
          id?: string
          is_active?: boolean
          max_students?: number | null
          name: string
          room_number?: string | null
          section?: string | null
          updated_at?: string
        }
        Update: {
          academic_year?: string
          class_teacher_id?: string | null
          created_at?: string
          grade_level?: number
          id?: string
          is_active?: boolean
          max_students?: number | null
          name?: string
          room_number?: string | null
          section?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_class_teacher_id_fkey"
            columns: ["class_teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      discipline_incidents: {
        Row: {
          action_taken: string | null
          created_at: string
          description: string
          id: string
          incident_date: string
          parent_informed: boolean
          reported_by: string | null
          severity: Database["public"]["Enums"]["discipline_severity"]
          student_id: string
          updated_at: string
        }
        Insert: {
          action_taken?: string | null
          created_at?: string
          description: string
          id?: string
          incident_date: string
          parent_informed?: boolean
          reported_by?: string | null
          severity: Database["public"]["Enums"]["discipline_severity"]
          student_id: string
          updated_at?: string
        }
        Update: {
          action_taken?: string | null
          created_at?: string
          description?: string
          id?: string
          incident_date?: string
          parent_informed?: boolean
          reported_by?: string | null
          severity?: Database["public"]["Enums"]["discipline_severity"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discipline_incidents_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discipline_incidents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          category: string
          created_at: string
          description: string | null
          file_type: string
          file_url: string
          id: string
          is_public: boolean
          student_id: string | null
          title: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          file_type: string
          file_url: string
          id?: string
          is_public?: boolean
          student_id?: string | null
          title: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          file_type?: string
          file_url?: string
          id?: string
          is_public?: boolean
          student_id?: string | null
          title?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_payments: {
        Row: {
          amount_paid: number
          created_at: string
          fee_structure_id: string | null
          id: string
          payment_date: string
          payment_method: string | null
          remarks: string | null
          status: Database["public"]["Enums"]["fee_status"]
          student_id: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount_paid: number
          created_at?: string
          fee_structure_id?: string | null
          id?: string
          payment_date?: string
          payment_method?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["fee_status"]
          student_id: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          created_at?: string
          fee_structure_id?: string | null
          id?: string
          payment_date?: string
          payment_method?: string | null
          remarks?: string | null
          status?: Database["public"]["Enums"]["fee_status"]
          student_id?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_payments_fee_structure_id_fkey"
            columns: ["fee_structure_id"]
            isOneToOne: false
            referencedRelation: "fee_structure"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_structure: {
        Row: {
          academic_year: string
          amount: number
          class_id: string
          created_at: string
          due_date: string
          fee_type: string
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          academic_year: string
          amount: number
          class_id: string
          created_at?: string
          due_date: string
          fee_type: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          academic_year?: string
          amount?: number
          class_id?: string
          created_at?: string
          due_date?: string
          fee_type?: string
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_structure_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          amount: number
          category: string
          created_at: string
          description: string | null
          id: string
          payment_method: string | null
          recorded_by: string | null
          reference_number: string | null
          transaction_date: string
          transaction_type: string
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          description?: string | null
          id?: string
          payment_method?: string | null
          recorded_by?: string | null
          reference_number?: string | null
          transaction_date?: string
          transaction_type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          payment_method?: string | null
          recorded_by?: string | null
          reference_number?: string | null
          transaction_date?: string
          transaction_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      grades: {
        Row: {
          academic_year: string
          created_at: string
          exam_date: string | null
          exam_name: string
          grade: string | null
          id: string
          max_marks: number
          obtained_marks: number
          remarks: string | null
          student_id: string
          subject_id: string
          updated_at: string
        }
        Insert: {
          academic_year: string
          created_at?: string
          exam_date?: string | null
          exam_name: string
          grade?: string | null
          id?: string
          max_marks: number
          obtained_marks: number
          remarks?: string | null
          student_id: string
          subject_id: string
          updated_at?: string
        }
        Update: {
          academic_year?: string
          created_at?: string
          exam_date?: string | null
          exam_name?: string
          grade?: string | null
          id?: string
          max_marks?: number
          obtained_marks?: number
          remarks?: string | null
          student_id?: string
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grades_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grades_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      hostel_allocations: {
        Row: {
          academic_year: string
          allocation_date: string
          created_at: string
          id: string
          is_active: boolean
          room_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_year: string
          allocation_date?: string
          created_at?: string
          id?: string
          is_active?: boolean
          room_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_year?: string
          allocation_date?: string
          created_at?: string
          id?: string
          is_active?: boolean
          room_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hostel_allocations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "hostel_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hostel_allocations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      hostel_rooms: {
        Row: {
          capacity: number
          created_at: string
          current_occupancy: number
          floor: number
          id: string
          is_active: boolean
          room_number: string
          room_type: Database["public"]["Enums"]["room_type"]
          updated_at: string
        }
        Insert: {
          capacity: number
          created_at?: string
          current_occupancy?: number
          floor: number
          id?: string
          is_active?: boolean
          room_number: string
          room_type: Database["public"]["Enums"]["room_type"]
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          current_occupancy?: number
          floor?: number
          id?: string
          is_active?: boolean
          room_number?: string
          room_type?: Database["public"]["Enums"]["room_type"]
          updated_at?: string
        }
        Relationships: []
      }
      library_books: {
        Row: {
          author: string
          available_copies: number
          category: string | null
          created_at: string
          id: string
          is_active: boolean
          isbn: string | null
          location: string | null
          publication_year: number | null
          publisher: string | null
          title: string
          total_copies: number
          updated_at: string
        }
        Insert: {
          author: string
          available_copies?: number
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          isbn?: string | null
          location?: string | null
          publication_year?: number | null
          publisher?: string | null
          title: string
          total_copies?: number
          updated_at?: string
        }
        Update: {
          author?: string
          available_copies?: number
          category?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          isbn?: string | null
          location?: string | null
          publication_year?: number | null
          publisher?: string | null
          title?: string
          total_copies?: number
          updated_at?: string
        }
        Relationships: []
      }
      library_issues: {
        Row: {
          book_id: string
          created_at: string
          due_date: string
          fine_amount: number | null
          id: string
          issue_date: string
          issued_by: string | null
          return_date: string | null
          status: string
          student_id: string
          updated_at: string
        }
        Insert: {
          book_id: string
          created_at?: string
          due_date: string
          fine_amount?: number | null
          id?: string
          issue_date?: string
          issued_by?: string | null
          return_date?: string | null
          status?: string
          student_id: string
          updated_at?: string
        }
        Update: {
          book_id?: string
          created_at?: string
          due_date?: string
          fine_amount?: number | null
          id?: string
          issue_date?: string
          issued_by?: string | null
          return_date?: string | null
          status?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_issues_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "library_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_issues_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "library_issues_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_inventory: {
        Row: {
          cost: number
          created_at: string
          id: string
          is_active: boolean
          item_type: string
          name: string
          price: number
          quantity: number
          reorder_level: number
          updated_at: string
        }
        Insert: {
          cost: number
          created_at?: string
          id?: string
          is_active?: boolean
          item_type: string
          name: string
          price: number
          quantity?: number
          reorder_level?: number
          updated_at?: string
        }
        Update: {
          cost?: number
          created_at?: string
          id?: string
          is_active?: boolean
          item_type?: string
          name?: string
          price?: number
          quantity?: number
          reorder_level?: number
          updated_at?: string
        }
        Relationships: []
      }
      pos_sales: {
        Row: {
          created_at: string
          id: string
          items: Json
          payment_method: string
          sale_date: string
          served_by: string | null
          total_amount: number
        }
        Insert: {
          created_at?: string
          id?: string
          items: Json
          payment_method: string
          sale_date?: string
          served_by?: string | null
          total_amount: number
        }
        Update: {
          created_at?: string
          id?: string
          items?: Json
          payment_method?: string
          sale_date?: string
          served_by?: string | null
          total_amount?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string
          full_name: string
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name: string
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      student_transport: {
        Row: {
          academic_year: string
          created_at: string
          id: string
          is_active: boolean
          pickup_point: string
          route_id: string
          student_id: string
          updated_at: string
        }
        Insert: {
          academic_year: string
          created_at?: string
          id?: string
          is_active?: boolean
          pickup_point: string
          route_id: string
          student_id: string
          updated_at?: string
        }
        Update: {
          academic_year?: string
          created_at?: string
          id?: string
          is_active?: boolean
          pickup_point?: string
          route_id?: string
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_transport_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_transport_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          address: string | null
          admission_date: string
          admission_number: string
          blood_group: Database["public"]["Enums"]["blood_group"] | null
          city: string | null
          class_id: string | null
          created_at: string
          date_of_birth: string
          emergency_contact: string | null
          emergency_phone: string | null
          first_name: string
          gender: Database["public"]["Enums"]["gender"]
          id: string
          is_active: boolean
          last_name: string
          parent_email: string | null
          parent_name: string | null
          parent_phone: string
          photo_url: string | null
          postal_code: string | null
          state: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          admission_date?: string
          admission_number: string
          blood_group?: Database["public"]["Enums"]["blood_group"] | null
          city?: string | null
          class_id?: string | null
          created_at?: string
          date_of_birth: string
          emergency_contact?: string | null
          emergency_phone?: string | null
          first_name: string
          gender: Database["public"]["Enums"]["gender"]
          id?: string
          is_active?: boolean
          last_name: string
          parent_email?: string | null
          parent_name?: string | null
          parent_phone: string
          photo_url?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          admission_date?: string
          admission_number?: string
          blood_group?: Database["public"]["Enums"]["blood_group"] | null
          city?: string | null
          class_id?: string | null
          created_at?: string
          date_of_birth?: string
          emergency_contact?: string | null
          emergency_phone?: string | null
          first_name?: string
          gender?: Database["public"]["Enums"]["gender"]
          id?: string
          is_active?: boolean
          last_name?: string
          parent_email?: string | null
          parent_name?: string | null
          parent_phone?: string
          photo_url?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_student_class"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subjects: {
        Row: {
          code: string
          created_at: string
          description: string | null
          grade_level: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          grade_level: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          grade_level?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      teachers: {
        Row: {
          address: string | null
          created_at: string
          date_of_birth: string | null
          email: string
          employee_id: string
          first_name: string
          gender: Database["public"]["Enums"]["gender"]
          id: string
          is_active: boolean
          joining_date: string
          last_name: string
          phone: string
          photo_url: string | null
          qualification: string | null
          specialization: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          email: string
          employee_id: string
          first_name: string
          gender: Database["public"]["Enums"]["gender"]
          id?: string
          is_active?: boolean
          joining_date?: string
          last_name: string
          phone: string
          photo_url?: string | null
          qualification?: string | null
          specialization?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string
          employee_id?: string
          first_name?: string
          gender?: Database["public"]["Enums"]["gender"]
          id?: string
          is_active?: boolean
          joining_date?: string
          last_name?: string
          phone?: string
          photo_url?: string | null
          qualification?: string | null
          specialization?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "teachers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      timetable: {
        Row: {
          academic_year: string
          class_id: string
          created_at: string
          day_of_week: number
          end_time: string
          id: string
          is_active: boolean
          room_number: string | null
          start_time: string
          subject_id: string
          teacher_id: string | null
          updated_at: string
        }
        Insert: {
          academic_year: string
          class_id: string
          created_at?: string
          day_of_week: number
          end_time: string
          id?: string
          is_active?: boolean
          room_number?: string | null
          start_time: string
          subject_id: string
          teacher_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_year?: string
          class_id?: string
          created_at?: string
          day_of_week?: number
          end_time?: string
          id?: string
          is_active?: boolean
          room_number?: string | null
          start_time?: string
          subject_id?: string
          teacher_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timetable_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timetable_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "teachers"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_routes: {
        Row: {
          created_at: string
          distance_km: number | null
          ending_point: string
          fare: number
          id: string
          is_active: boolean
          route_name: string
          route_number: string
          starting_point: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          distance_km?: number | null
          ending_point: string
          fare: number
          id?: string
          is_active?: boolean
          route_name: string
          route_number: string
          starting_point: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          distance_km?: number | null
          ending_point?: string
          fare?: number
          id?: string
          is_active?: boolean
          route_name?: string
          route_number?: string
          starting_point?: string
          updated_at?: string
        }
        Relationships: []
      }
      transport_vehicles: {
        Row: {
          capacity: number
          created_at: string
          driver_name: string
          driver_phone: string
          id: string
          is_active: boolean
          route_id: string | null
          updated_at: string
          vehicle_number: string
          vehicle_type: Database["public"]["Enums"]["transport_type"]
        }
        Insert: {
          capacity: number
          created_at?: string
          driver_name: string
          driver_phone: string
          id?: string
          is_active?: boolean
          route_id?: string | null
          updated_at?: string
          vehicle_number: string
          vehicle_type: Database["public"]["Enums"]["transport_type"]
        }
        Update: {
          capacity?: number
          created_at?: string
          driver_name?: string
          driver_phone?: string
          id?: string
          is_active?: boolean
          route_id?: string | null
          updated_at?: string
          vehicle_number?: string
          vehicle_type?: Database["public"]["Enums"]["transport_type"]
        }
        Relationships: [
          {
            foreignKeyName: "transport_vehicles_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      admission_status:
        | "pending"
        | "interview_scheduled"
        | "accepted"
        | "rejected"
        | "waitlisted"
      app_role: "admin" | "teacher" | "student" | "parent" | "staff"
      attendance_status: "present" | "absent" | "late" | "half_day" | "excused"
      blood_group: "A+" | "A-" | "B+" | "B-" | "AB+" | "AB-" | "O+" | "O-"
      discipline_severity: "minor" | "moderate" | "major" | "critical"
      fee_status: "pending" | "partial" | "paid" | "overdue" | "waived"
      gender: "male" | "female" | "other"
      room_type: "single" | "double" | "triple" | "dormitory"
      transport_type: "bus" | "van" | "car"
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
  public: {
    Enums: {
      admission_status: [
        "pending",
        "interview_scheduled",
        "accepted",
        "rejected",
        "waitlisted",
      ],
      app_role: ["admin", "teacher", "student", "parent", "staff"],
      attendance_status: ["present", "absent", "late", "half_day", "excused"],
      blood_group: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"],
      discipline_severity: ["minor", "moderate", "major", "critical"],
      fee_status: ["pending", "partial", "paid", "overdue", "waived"],
      gender: ["male", "female", "other"],
      room_type: ["single", "double", "triple", "dormitory"],
      transport_type: ["bus", "van", "car"],
    },
  },
} as const
