-- V-24: Make audit_logs append-only.
--
-- Audit logs are the forensic record of privileged actions. Even a compromised
-- service_role must not be able to rewrite history. These INSTEAD-NOTHING rules
-- silently drop any UPDATE or DELETE against public.audit_logs while leaving
-- INSERT (and SELECT) intact. Rules apply to ALL roles, including service_role
-- and table owner, so this is a genuine append-only guarantee.
--
-- audit_logs is defined in migration 012. If it is absent, this no-ops.

do $$
begin
  if to_regclass('public.audit_logs') is not null then
    execute 'create rule audit_logs_no_update as on update to public.audit_logs do instead nothing';
  end if;
exception when duplicate_object then null;
end $$;

do $$
begin
  if to_regclass('public.audit_logs') is not null then
    execute 'create rule audit_logs_no_delete as on delete to public.audit_logs do instead nothing';
  end if;
exception when duplicate_object then null;
end $$;
