-- Enable Supabase cron + HTTP for treasury pipeline

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;
