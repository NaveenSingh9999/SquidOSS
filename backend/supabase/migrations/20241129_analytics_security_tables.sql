-- Analytics Events Table
create table if not exists analytics_events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  event_type text not null,
  metadata jsonb default '{}',
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null,
  session_id text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Security Events Table
create table if not exists security_events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  event_type text not null,
  ip_address text,
  user_agent text,
  metadata jsonb default '{}',
  risk_level text check (risk_level in ('low', 'medium', 'high', 'critical')) default 'low',
  status text check (status in ('success', 'failed', 'blocked')) default 'success',
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Threat Alerts Table
create table if not exists threat_alerts (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  type text not null,
  severity text check (severity in ('low', 'medium', 'high', 'critical')) default 'medium',
  title text not null,
  description text,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null,
  status text check (status in ('active', 'investigating', 'resolved', 'false_positive')) default 'active',
  actions_taken jsonb default '[]',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Audit Logs Table
create table if not exists audit_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  action text not null,
  resource text not null,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null,
  ip_address text,
  details jsonb default '{}',
  compliance_tags text[] default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- User Encryption Settings Table
create table if not exists user_encryption_settings (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade unique,
  settings jsonb not null default '{}',
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Access Policies Table
create table if not exists access_policies (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  description text,
  rules jsonb not null default '{}',
  applies_to text check (applies_to in ('all', 'specific_users', 'user_groups')) default 'all',
  target_users text[],
  target_groups text[],
  priority integer default 1,
  active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Admin Access Logs Table (Enhanced)
create table if not exists admin_access_logs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  access_purpose text not null,
  step_completed integer not null,
  ip_address text,
  user_agent text,
  session_id text not null,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Create indexes for better performance
create index if not exists analytics_events_user_id_idx on analytics_events(user_id);
create index if not exists analytics_events_timestamp_idx on analytics_events(timestamp);
create index if not exists analytics_events_event_type_idx on analytics_events(event_type);

create index if not exists security_events_user_id_idx on security_events(user_id);
create index if not exists security_events_timestamp_idx on security_events(timestamp);
create index if not exists security_events_risk_level_idx on security_events(risk_level);

create index if not exists threat_alerts_user_id_idx on threat_alerts(user_id);
create index if not exists threat_alerts_status_idx on threat_alerts(status);
create index if not exists threat_alerts_severity_idx on threat_alerts(severity);

create index if not exists audit_logs_user_id_idx on audit_logs(user_id);
create index if not exists audit_logs_timestamp_idx on audit_logs(timestamp);
create index if not exists audit_logs_action_idx on audit_logs(action);

create index if not exists access_policies_user_id_idx on access_policies(user_id);
create index if not exists access_policies_active_idx on access_policies(active);

-- Enable Row Level Security (RLS)
alter table analytics_events enable row level security;
alter table security_events enable row level security;
alter table threat_alerts enable row level security;
alter table audit_logs enable row level security;
alter table user_encryption_settings enable row level security;
alter table access_policies enable row level security;

-- Create RLS Policies
-- Analytics Events Policies
create policy "Users can view own analytics events" on analytics_events for select using (auth.uid() = user_id);
create policy "Users can insert own analytics events" on analytics_events for insert with check (auth.uid() = user_id);

-- Security Events Policies
create policy "Users can view own security events" on security_events for select using (auth.uid() = user_id);
create policy "Users can insert own security events" on security_events for insert with check (auth.uid() = user_id);

-- Threat Alerts Policies
create policy "Users can view threat alerts" on threat_alerts for select using (auth.uid() = user_id or user_id is null);
create policy "System can insert threat alerts" on threat_alerts for insert with check (true);

-- Audit Logs Policies
create policy "Users can view own audit logs" on audit_logs for select using (auth.uid() = user_id);
create policy "Users can insert own audit logs" on audit_logs for insert with check (auth.uid() = user_id);

-- User Encryption Settings Policies
create policy "Users can manage own encryption settings" on user_encryption_settings for all using (auth.uid() = user_id);

-- Access Policies Policies
create policy "Users can manage own access policies" on access_policies for all using (auth.uid() = user_id);

-- Update functions for automatic timestamp updates
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

-- Create triggers for updated_at
create trigger update_user_encryption_settings_updated_at before update on user_encryption_settings
  for each row execute function update_updated_at_column();

create trigger update_access_policies_updated_at before update on access_policies
  for each row execute function update_updated_at_column();