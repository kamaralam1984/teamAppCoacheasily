# CoachEasily Team App

Build the foundation of an internal team operating system for CoachEasily, an online coaching company in Mumbai with 18 team members (we call them "warriors").

This is the first of 12 prompts. Build ONLY what this prompt asks for — later prompts add the screens. Every rule below is deliberate and already reviewed, so please follow it exactly rather than simplifying.

BUILD IN THIS PROMPT ONLY:

1) DATABASE SCHEMA — create these tables. Every table gets:
   id uuid primary key default gen_random_uuid(),
   org_id uuid not null references organisations(id),
   created_at timestamptz default now().

   organisations(name, logo_url, settings jsonb)
   profiles(id uuid primary key default gen_random_uuid(),
     auth_user_id uuid unique references auth.users(id),   -- NULL until they accept the invite
     org_id, full_name, title, department,
     manager_id uuid references profiles(id),
     role text check (role in ('member','manager','hr','admin')) default 'member',
     weekly_off text, joined_on date, birthday text, wedding_anniversary text,
     fun_fact text, responsibilities text,
     status text check (status in ('active','exited')) default 'active',
     new_badge text check (new_badge in ('auto','on','off')) default 'auto',
     opening_earned_leave int default 0, avatar_url text, exited_on date)
   notifications(profile_id, title, body, link, read bool default false)

2) AUTH — email + password. NO public sign-up; invite only.
   Profiles are created FIRST by People & Culture; the auth account is created later by invitation and LINKED to the existing profile by setting profiles.auth_user_id. Do NOT add a trigger that auto-creates a profile when an auth user appears — a person must never get a profile just by signing in.

3) ROW LEVEL SECURITY — enable on every table.
   - Everyone reads profiles in their own org (directory).
   - A person updates only their own profile.
   - Only role in ('hr','admin') may insert/update/delete any profile.
   - Notifications readable only by their own profile_id.

   TWO THINGS THAT WILL BREAK IF YOU GET THEM WRONG:
   a) Do NOT name a function current_role() — that is a RESERVED Postgres function. Name them my_role(), my_org() and my_profile_id().
   b) A policy on profiles that SELECTs from profiles causes INFINITE RECURSION — the most common Supabase mistake. Define the helpers as SECURITY DEFINER STABLE so they bypass RLS:

      create or replace function my_profile_id() returns uuid
        language sql security definer stable set search_path = public as $$
        select id from profiles where auth_user_id = auth.uid() limit 1 $$;

      create or replace function my_role() returns text
        language sql security definer stable set search_path = public as $$
        select role from profiles where auth_user_id = auth.uid() limit 1 $$;

      create or replace function my_org() returns uuid
        language sql security definer stable set search_path = public as $$
        select org_id from profiles where auth_user_id = auth.uid() limit 1 $$;

      -- is target_id anywhere in my downline? used for manager permissions
      create or replace function manages(target_id uuid) returns boolean
        language sql security definer stable set search_path = public as $$
        with recursive line as (
          select id from profiles where id = my_profile_id()
          union all
          select p.id from profiles p join line l on p.manager_id = l.id
        ) select exists(select 1 from line where id = target_id) $$;

      Use my_role(), my_org() and manages() in every policy.

4) DESIGN TOKENS — in Tailwind config AND as CSS variables. Light mode only, no dark mode:
   pearl #FAF8F3 (page)      ivory #FFFDF7 (cards)   ink #241B33 (text)
   soft #6E6580 (muted)      night #171126 (top bar) night2 #241640
   line #EFE7D3 (hairlines)  gold #C9A227            goldL #F0C75E
   goldD #8F6307             saff #F26B1D            saffBtn #C74E0C (button fill)
   violet #6D28D9            emer #12805C            red #C0392B
   white #FFFFFF             cream #FBF7EC           mist #D6CCE8

   Fonts: 'Rozha One' for display headings, 'Manrope' for all UI text (Google Fonts).
   Buttons: 8px radius, 3D pressable look (solid bottom shadow), min-height 44px.
   Cards: ivory background, 1px line border, 14px radius, soft shadow.

5) THE LOGO — create a <Mark/> React component with this exact SVG path. It was traced from the real logo file. Use it EXACTLY as given — do not redraw, simplify or re-approximate it. Colour is the only thing that may change. Aspect ratio is fixed: width is always size × 0.694.

   <svg viewBox="0 0 100 144.1" width={size*0.694} height={size}>
     <path fill={color} d="M50.0 1.5Q44.1 4.5 43.2 6.1Q42.4 7.6 41.6 9.1Q40.9 10.6 40.2 12.1Q39.6 13.7 38.8 15.2Q38.1 16.7 37.3 18.2Q36.6 19.7 35.8 21.3Q35.1 22.8 34.3 24.4Q33.5 26.0 32.8 27.6Q32.0 29.1 31.4 30.6Q30.8 32.1 30.0 33.6Q29.2 35.2 28.5 36.7Q27.7 38.2 27.0 39.7Q26.2 41.2 25.6 42.8Q24.9 44.3 24.2 45.8Q23.4 47.3 22.7 48.9Q21.9 50.6 21.2 52.1Q20.4 53.6 19.7 55.1Q18.9 56.6 18.2 58.2Q17.4 59.7 16.7 61.2Q15.9 62.7 15.3 64.2Q14.6 65.8 13.9 67.3Q13.1 68.8 12.4 70.4Q11.6 72.1 10.9 73.6Q10.1 75.1 9.4 76.6Q8.6 78.1 7.8 79.7Q7.1 81.2 6.4 82.7Q5.8 84.2 5.0 85.7Q4.3 87.3 3.8 88.8Q3.2 90.3 2.8 91.8Q2.4 93.3 2.1 95.0Q1.9 96.6 1.7 98.1Q1.5 99.6 1.5 101.2Q1.5 102.7 1.7 104.2Q1.9 105.7 2.1 107.2Q2.4 108.8 2.7 110.3Q3.0 111.8 3.5 113.3Q4.1 114.8 4.7 116.4Q5.4 117.9 6.2 119.5Q7.1 121.1 7.8 122.6Q8.6 124.2 9.4 125.7Q10.1 127.2 10.9 128.7Q11.6 130.2 12.4 131.8Q13.1 133.3 13.9 134.8Q14.6 136.3 15.4 137.8Q16.1 139.4 18.6 141.0Q21.1 142.6 21.7 142.6Q22.4 142.6 24.7 141.0Q27.1 139.4 27.7 137.8Q28.4 136.3 28.9 134.8Q29.5 133.3 30.0 131.8Q30.5 130.2 31.1 128.7Q31.6 127.2 32.1 125.7Q32.7 124.2 33.3 122.6Q34.0 121.1 34.5 119.5Q35.1 117.9 35.6 116.4Q36.1 114.8 36.7 113.3Q37.2 111.8 37.7 110.3Q38.3 108.8 38.9 107.2Q39.6 105.7 40.1 104.2Q40.6 102.7 41.2 101.2Q41.7 99.6 42.3 98.1Q42.8 96.6 43.3 95.0Q43.9 93.3 44.5 91.8Q45.2 90.3 47.1 88.8Q49.0 87.3 49.5 87.3Q50.0 87.3 52.4 88.8Q54.8 90.3 55.5 91.8Q56.1 93.3 56.7 95.0Q57.2 96.6 57.7 98.1Q58.3 99.6 58.8 101.2Q59.4 102.7 59.9 104.2Q60.4 105.7 61.1 107.2Q61.7 108.8 62.3 110.3Q62.8 111.8 63.3 113.3Q63.9 114.8 64.4 116.4Q64.9 117.9 65.5 119.5Q66.0 121.1 66.7 122.6Q67.3 124.2 67.9 125.7Q68.4 127.2 68.9 128.7Q69.5 130.2 70.0 131.8Q70.5 133.3 71.1 134.8Q71.6 136.3 72.3 137.8Q72.9 139.4 75.3 141.0Q77.6 142.6 78.3 142.6Q78.9 142.6 81.4 141.0Q83.9 139.4 84.6 137.8Q85.4 136.3 86.1 134.8Q86.9 133.3 87.6 131.8Q88.4 130.2 89.1 128.7Q89.9 127.2 90.6 125.7Q91.4 124.2 92.2 122.6Q92.9 121.1 93.8 119.5Q94.6 117.9 95.3 116.4Q95.9 114.8 96.5 113.3Q97.0 111.8 97.3 110.3Q97.6 108.8 97.9 107.2Q98.1 105.7 98.3 104.2Q98.5 102.7 98.5 101.2Q98.5 99.6 98.3 98.1Q98.1 96.6 97.9 95.0Q97.6 93.3 97.2 91.8Q96.8 90.3 96.2 88.8Q95.7 87.3 95.0 85.7Q94.2 84.2 93.6 82.7Q92.9 81.2 92.2 79.7Q91.4 78.1 90.6 76.6Q89.9 75.1 89.1 73.6Q88.4 72.1 87.6 70.4Q86.9 68.8 86.1 67.3Q85.4 65.8 84.7 64.2Q84.1 62.7 83.3 61.2Q82.6 59.7 81.8 58.2Q81.1 56.6 80.3 55.1Q79.6 53.6 78.8 52.1Q78.1 50.6 77.3 48.9Q76.6 47.3 75.8 45.8Q75.1 44.3 74.4 42.8Q73.8 41.2 73.0 39.7Q72.3 38.2 71.5 36.7Q70.8 35.2 70.0 33.6Q69.2 32.1 68.6 30.6Q68.0 29.1 67.2 27.6Q66.5 26.0 65.7 24.4Q64.9 22.8 64.2 21.3Q63.4 19.7 62.7 18.2Q61.9 16.7 61.2 15.2Q60.4 13.7 59.8 12.1Q59.1 10.6 58.4 9.1Q57.6 7.6 56.8 6.1Q55.9 4.5 53.0 3.0Z"/>
   </svg>

6) APP SHELL — sticky dark top bar (night) containing: the Mark in goldL, the wordmark "Coach" in white + "Easily" in goldL with "TEAM APP" beneath in mist, then a notification bell, then the signed-in user's name and a sign-out button. Below it a horizontal tab bar. Mobile-first, tabs scroll horizontally.

7) BOOTSTRAP THE FIRST ADMIN — public sign-up is off, so nobody can create the first account. Do this explicitly:
   - Seed one organisation named "CoachEasily".
   - Seed one profile: Purushottam Hambarde, Founder & CEO, Leadership, role 'admin', auth_user_id NULL.
   - Create the auth account directly via an edge function or seeded migration that creates an auth user for the email the owner gives you, and sets that profile's auth_user_id to match. Ask for the email, then confirm it worked. There is no external SQL dashboard for this project, so do not rely on one.
   - Add a guard: if a signed-in auth user has NO matching profile, show "Your account isn't set up yet — ask People & Culture to invite you." Never auto-create a profile on login.

Do NOT build any other screen yet. Just schema, auth, RLS, tokens, shell.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://coach-warriors-hub.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e12daa46-df32-4307-a233-20934c13492d).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
