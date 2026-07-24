-- Admin-managed member tags (会员标签): free-form labels attached to a member,
-- shown across the admin panel (referral tree, member list, member detail) and
-- usable as filters. Service-role writes only (admin edge function).
alter table public.profiles
  add column if not exists member_tags jsonb not null default '[]'::jsonb;

comment on column public.profiles.member_tags is
  '管理后台的会员标签 (string[]) — 推荐树/会员列表/详情共享,可筛选';
