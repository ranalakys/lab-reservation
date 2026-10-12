-- ================================================================
--  Lab Reservation System — Supabase Database Schema
--  Run this entire file in the Supabase SQL Editor
--  (Supabase dashboard → SQL Editor → New query → paste → Run)
-- ================================================================

-- ── Reservations ─────────────────────────────────────────────────
create table if not exists reservations (
  id           bigserial primary key,
  slot_key     text unique not null,   -- e.g. "lab-a__2025-09-15__3"
  lab_id       text not null,
  date_str     text not null,          -- YYYY-MM-DD
  slot_idx     int not null,
  reserved_by  text not null,          -- email
  unit         text not null,
  section      text not null,
  student_ids  text not null,
  team_name    text,
  status       text not null default 'pending',  -- pending | approved | rejected
  review_note  text,
  submitted_at timestamptz default now(),
  reviewed_at  timestamptz
);

-- ── Staff ─────────────────────────────────────────────────────────
create table if not exists staff (
  id         bigserial primary key,
  name       text not null,
  role       text not null default 'engineer',   -- engineer | technician
  lab_id     text not null,
  days       int[] not null default '{1,2,3,4,5}',  -- 0=Sun…6=Sat
  start_time text not null default '08:00',
  end_time   text not null default '17:00'
);

-- ── Classes (recurring weekly blocks) ────────────────────────────
create table if not exists classes (
  id         bigserial primary key,
  name       text not null,
  lab_id     text not null,
  day        int not null,   -- 0=Sun…6=Sat
  start_time text not null,
  end_time   text not null
);

-- ── Semester ──────────────────────────────────────────────────────
create table if not exists semester (
  id         int primary key default 1,  -- single row
  name       text,
  start_date text,
  end_date   text
);

-- ── Row Level Security ────────────────────────────────────────────
-- Enable RLS on all tables
alter table reservations enable row level security;
alter table staff        enable row level security;
alter table classes      enable row level security;
alter table semester     enable row level security;

-- Anyone signed in can read all tables
create policy "Authenticated users can read reservations"
  on reservations for select using (auth.role() = 'authenticated');

create policy "Authenticated users can read staff"
  on staff for select using (auth.role() = 'authenticated');

create policy "Authenticated users can read classes"
  on classes for select using (auth.role() = 'authenticated');

create policy "Authenticated users can read semester"
  on semester for select using (auth.role() = 'authenticated');

-- Authenticated users can insert reservations (students book)
create policy "Authenticated users can insert reservations"
  on reservations for insert with check (auth.role() = 'authenticated');

-- Users can delete their own reservations (cancel)
create policy "Users can delete own reservations"
  on reservations for delete using (reserved_by = auth.jwt() ->> 'email');

-- Users can update their own reservations (admin updates status)
-- Note: in production you would restrict status updates to admin emails
-- using a Supabase Edge Function. For now all authenticated users can update.
create policy "Authenticated users can update reservations"
  on reservations for update using (auth.role() = 'authenticated');

-- Staff, classes, semester: only admin emails can write
-- Replace with your actual admin email(s)
create policy "Admin can insert staff"
  on staff for insert with check (
    auth.jwt() ->> 'email' in (
      'admin@au.edu.kw'
      -- add more admin emails here, comma-separated
    )
  );
create policy "Admin can update staff"
  on staff for update using (
    auth.jwt() ->> 'email' in ('admin@au.edu.kw')
  );
create policy "Admin can delete staff"
  on staff for delete using (
    auth.jwt() ->> 'email' in ('admin@au.edu.kw')
  );

create policy "Admin can insert classes"
  on classes for insert with check (
    auth.jwt() ->> 'email' in ('admin@au.edu.kw')
  );
create policy "Admin can update classes"
  on classes for update using (
    auth.jwt() ->> 'email' in ('admin@au.edu.kw')
  );
create policy "Admin can delete classes"
  on classes for delete using (
    auth.jwt() ->> 'email' in ('admin@au.edu.kw')
  );

create policy "Admin can upsert semester"
  on semester for all using (
    auth.jwt() ->> 'email' in ('admin@au.edu.kw')
  );

-- ── Enable Realtime ───────────────────────────────────────────────
-- Run these to enable live updates for all tables
alter publication supabase_realtime add table reservations;
alter publication supabase_realtime add table staff;
alter publication supabase_realtime add table classes;
alter publication supabase_realtime add table semester;
