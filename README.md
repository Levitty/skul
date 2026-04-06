# Tuta School Management System

A comprehensive school management system built with Next.js 14+, Supabase, and TypeScript. This system provides complete school administration, student management, fee collection, attendance tracking, and strategic analytics.

## Features

### Core Modules

- **Student Information System (SIS) & Admissions**: Complete student profile management, online applications, and enrollment workflows
- **Attendance Tracking**: Mobile-optimized attendance taking with period-level tracking
- **Timetable & Scheduling**: Manual timetable creation with drag-and-drop interface
- **Fees & Payments**: Invoice generation, online payments via Paystack and M-Pesa STK Push
- **Exams & Gradebook**: Exam session management, marks entry, and report card generation
- **Parent & Student Portal**: Mobile-first portal for parents to view fees, attendance, and results
- **Teacher Portal**: Tools for teachers to manage classes, take attendance, and enter grades

### Strategic Management Layer

- **Financial Runway Forecast**: Predicts cash runway based on income vs expenses
- **Unit-Based Profitability**: P&L calculations by class, grade, or department
- **Staff Burnout Sentinel**: AI-driven monitoring of teacher engagement and burnout risk
- **Invisible Auditor**: Automated anomaly detection for inventory, fuel, and attendance mismatches

### Communication & Integrations

- **WhatsApp Magic Links**: Zero-login access via secure temporary URLs sent via WhatsApp
- **M-Pesa STK Push**: One-tap payment integration for Kenyan market
- **Paystack Integration**: Online payment processing
- **Automated Reconciliation**: Automatic payment matching and invoice updates

### Proactive Reporting Agents

- **Monday Morning Briefing**: Weekly executive summary delivered via WhatsApp
- **Admissions Watchdog**: Automated alerts for applications stuck > 48 hours

## Tech Stack

- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + Shadcn UI
- **Database**: Supabase (PostgreSQL with Row Level Security)
- **Authentication**: Supabase Auth
- **Payment Gateways**: Paystack, M-Pesa
- **Messaging**: Twilio WhatsApp API

## Architecture

### Multi-Tenancy

The system supports hybrid deployment:
- **Default**: Shared-database multi-tenant with `tenant_id` and RLS policies
- **Isolated**: Single-tenant deployments for large clients (abstracted for easy switching)

All database queries are protected by Row Level Security (RLS) policies that ensure data isolation between schools.

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Supabase account and project
- Paystack account (for payments)
- M-Pesa API credentials (for STK Push)
- Twilio account (for WhatsApp)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd tuta-school
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
```

Fill in your Supabase, Paystack, M-Pesa, and Twilio credentials in `.env`.

4. Set up Supabase:
   - Create a new Supabase project
   - Run the migrations in `supabase/migrations/`:
     - `001_initial_schema.sql` - Creates all tables
     - `002_rls_policies.sql` - Sets up RLS policies

5. Run the development server:
```bash
npm run dev
```

Visit `http://localhost:3000` to see the application.

## Project Structure

```
tuta-school/
├── app/                          # Next.js App Router
│   ├── (auth)/                   # Authentication routes
│   ├── (dashboard)/              # Protected dashboard routes
│   │   ├── admin/                # School admin views
│   │   ├── teacher/              # Teacher portal
│   │   ├── parent/               # Parent/student portal
│   │   └── accountant/           # Finance views
│   ├── api/                      # API routes
│   │   ├── webhooks/             # Payment/SMS callbacks
│   │   ├── integrations/         # External service integrations
│   │   └── cron/                 # Scheduled jobs
│   └── layout.tsx                # Root layout
├── components/                   # React components
│   ├── ui/                       # Shadcn UI components
│   ├── modules/                  # Feature-specific components
│   └── dashboard/                # Dashboard components
├── lib/                          # Utilities and configurations
│   ├── supabase/                 # Supabase client, RLS helpers
│   ├── db/                       # Database schema types
│   ├── integrations/             # Payment/SMS gateway clients
│   ├── analytics/                # Strategic layer calculations
│   └── agents/                   # Proactive reporting agents
├── supabase/                     # Supabase config
│   └── migrations/              # SQL migrations
└── types/                        # TypeScript type definitions
```

## Database Schema

The system includes comprehensive tables for:
- Schools (multi-tenant)
- Students, Guardians, Applications
- Enrollments, Classes, Sections
- Attendance Records
- Timetables and Schedule
- Fees, Invoices, Payments
- Exams, Results, Grade Scales
- Employees and Staff
- Strategic Analytics Tables
- Communication and Notifications

All tables include `school_id` for tenant isolation and RLS policies for security.

## API Endpoints

### Webhooks
- `POST /api/webhooks/paystack` - Paystack payment callbacks
- `POST /api/webhooks/mpesa` - M-Pesa STK Push callbacks

### Integrations
- `POST /api/integrations/whatsapp/magic-link` - Generate WhatsApp magic link

### Cron Jobs
- `GET /api/cron/weekly-briefing` - Generate and send Monday briefing
- `GET /api/cron/admissions-check` - Check for stuck applications

## Security

- Row Level Security (RLS) on all database tables
- Role-based access control (RBAC)
- Multi-factor authentication for admin roles
- Secure payment webhook verification
- Magic link expiration (24 hours)

## Deployment

### Environment Variables

Required environment variables:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYSTACK_SECRET_KEY`
- `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE`, `MPESA_PASSKEY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_NUMBER`
- `CRON_SECRET` (for scheduled jobs)

### Setting Up Cron Jobs

Configure your hosting provider (Vercel Cron, GitHub Actions, etc.) to call:
- `/api/cron/weekly-briefing` every Monday at 8 AM
- `/api/cron/admissions-check` every 4 hours

## Contributing

This is a production-ready system. When contributing:
1. Follow TypeScript best practices
2. Ensure RLS policies are maintained
3. Test multi-tenant isolation
4. Update migrations for schema changes

## License

[Your License Here]

## Support

For issues and questions, please contact [Your Support Contact]

