-- HCM Lite stores application records in Postgres JSONB through the API only.
-- The API uses SUPABASE_SERVICE_ROLE_KEY; never expose that secret to browser code.
create table if not exists public.hcm_records (
  collection text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection, id),
  constraint hcm_records_data_object check (jsonb_typeof(data) = 'object')
);

create index if not exists hcm_records_collection_idx on public.hcm_records (collection);
create index if not exists hcm_records_data_gin_idx on public.hcm_records using gin (data jsonb_path_ops);

create unique index if not exists hcm_users_email_unique
  on public.hcm_records (lower(data->>'email'))
  where collection = 'users' and coalesce(data->>'email', '') <> '';
create unique index if not exists hcm_users_employee_code_unique
  on public.hcm_records (data->>'employeeCode')
  where collection = 'users' and coalesce(data->>'employeeCode', '') <> '';
create unique index if not exists hcm_attendance_user_date_unique
  on public.hcm_records (data->>'userId', data->>'date')
  where collection = 'attendance';
create unique index if not exists hcm_departments_name_unique
  on public.hcm_records (lower(data->>'name'))
  where collection = 'departments' and coalesce(data->>'name', '') <> '';
create unique index if not exists hcm_designations_name_unique
  on public.hcm_records (lower(data->>'name'))
  where collection = 'designations' and coalesce(data->>'name', '') <> '';
create unique index if not exists hcm_leave_types_name_unique
  on public.hcm_records (lower(data->>'name'))
  where collection = 'leaveTypes' and coalesce(data->>'name', '') <> '';
create unique index if not exists hcm_payroll_month_unique
  on public.hcm_records (data->>'month')
  where collection = 'payrollRuns' and coalesce(data->>'month', '') <> '';
create unique index if not exists hcm_audit_sequence_unique
  on public.hcm_records ((data->>'seq')::bigint)
  where collection = 'auditLogs' and data ? 'seq';

alter table public.hcm_records enable row level security;
revoke all on table public.hcm_records from anon, authenticated;
grant all on table public.hcm_records to service_role;
-- Deliberately no browser policies: HR data access always passes through the API's
-- authenticated role/scope checks using the server-only service-role credential.
