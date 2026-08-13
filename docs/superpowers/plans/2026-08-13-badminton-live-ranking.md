# Badminton Mobile App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 휴대폰에서 복식 경기 결과를 기록하면 개인 승률, 파트너 조합 전적, 당일 기록이 실시간 갱신되고 Google Sheets에 안전하게 복제되는 단일 동호회용 PWA를 구축한다.

**Architecture:** Next.js App Router가 모바일 UI와 서버 전용 쓰기 경계를 제공하고 Supabase Postgres가 유일한 원본이 된다. 모든 경기 변경은 트랜잭션 RPC를 통하며 통계는 완료 경기 기반 SQL 뷰로 재계산하고, trigger → private Broadcast → refetch 흐름으로 클라이언트를 갱신한다. Google Sheets는 outbox Edge Function이 `match_id`를 먼저 검색해 멱등 동기화하는 읽기·백업용 미러다.

**Tech Stack:** Node.js 22 LTS, Next.js 16, React 19, TypeScript 5, Tailwind CSS 4, `@supabase/ssr`, `@supabase/supabase-js`, `@tanstack/react-query`, Zod, App Router manifest와 직접 관리하는 Service Worker, Supabase CLI/Postgres/Edge Functions, Vitest, React Testing Library, Playwright, axe-core

## Global Constraints

- 단일 동호회 MVP이며 조회는 공개, 쓰기는 공유 운영 코드로 발급한 서명 HttpOnly 쿠키가 있어야 한다.
- 브라우저에는 `NEXT_PUBLIC_SUPABASE_URL`과 `NEXT_PUBLIC_SUPABASE_ANON_KEY`만 노출한다.
- `SUPABASE_SERVICE_ROLE_KEY`, `OPERATOR_CODE_HASH`, `OPERATOR_COOKIE_SECRET`, Google 서비스 계정 비밀은 서버 또는 Edge Function에서만 읽는다.
- 복식 경기에는 서로 다른 활성 선수 UUID 4명이 정확히 한 번씩 참가한다.
- 통계에는 `completed` 경기만 포함하고 수정·취소 시 개인 및 조합 순위를 원본 경기에서 다시 계산한다.
- 개인 및 조합 정렬은 승률 내림차순, 승리 수 내림차순, 경기 수 내림차순, 표시 이름 오름차순이다.
- 파트너 조합은 UUID 두 개를 정렬한 키로 집계하며 1~2경기는 `경기 수 적음`, 3경기부터 일반 표시한다.
- 동명이인은 `이름 · P001` 형식으로 표시하고 UUID와 회원번호로 기록을 분리한다.
- Realtime은 raw Postgres Changes를 사용하지 않고 database trigger → private Broadcast → 클라이언트 refetch로 구현한다.
- Google Sheets는 역동기화하지 않으며 `match_id` 선검색 후 추가 또는 갱신한다.
- 경기 수정은 `match_version` 낙관적 잠금으로 경쟁 상태를 거절한다.
- 디자인 기준 이미지는 `C:\Users\Owner\.codex\generated_images\019ff6a4-b05f-78e1-8110-e96d0af4f26f\exec-30497795-9d1e-4e70-b555-0a16dd4d5d03.png`이다.
- 실제 개발 시작 시 Product Design `image-to-code`로 선택 시안을 구현하고, 완성 화면은 Product Design 디자인 QA로 검증한다.

---

## 예상 프로젝트 파일 구조와 책임

```text
app/
  api/operator/session/route.ts       운영 코드 검증과 서명 쿠키 발급/삭제
  api/players/route.ts                선수 생성·비활성 서버 쓰기 경계
  api/matches/route.ts                경기 생성 서버 쓰기 경계
  api/matches/[id]/route.ts           경기 수정·취소 서버 쓰기 경계
  api/sheet-sync/[matchId]/route.ts   실패한 시트 작업 수동 재시도
  matches/new/page.tsx                새 경기 입력 화면
  records/page.tsx                    날짜별 경기 기록 화면
  rankings/page.tsx                   개인/파트너 순위 화면
  players/page.tsx                    선수 관리 화면
  layout.tsx                          전역 레이아웃과 공급자
  page.tsx                            오늘 대시보드
components/
  matches/MatchForm.tsx               4명 선택, 승리팀 선택, 제출
  matches/MatchRow.tsx                승리팀 둥근 강조와 승 배지
  matches/EditMatchDialog.tsx         버전 기반 경기 수정/취소
  players/PlayerPicker.tsx            검색과 중복 선택 방지
  rankings/RankingTabs.tsx            개인/파트너 탭과 표
  realtime/LiveRefresh.tsx            private Broadcast 구독 후 refetch
  pwa/ServiceWorkerRegistration.tsx   production에서 public/sw.js 등록
lib/
  auth/operator-cookie.ts             운영 쿠키 서명·검증
  domain/types.ts                     공유 DTO와 enum
  domain/display-name.ts              동명이인 표시명 생성
  domain/ranking.ts                   정렬/표시 순수 함수
  supabase/browser.ts                 공개 브라우저 클라이언트
  supabase/server.ts                  쿠키 기반 서버 클라이언트
  supabase/admin.ts                   Route Handler 전용 service-role 클라이언트
  queries.ts                          공개 읽기 쿼리
  mutations.ts                        Route Handler 호출 클라이언트 함수
supabase/
  migrations/                         스키마, RLS, 뷰, RPC, Broadcast SQL
  functions/sync-google-sheet/        outbox 소비 Edge Function
  seed.sql                             로컬 검증 선수 데이터
tests/
  unit/                               Vitest 순수 함수 테스트
  components/                         RTL 컴포넌트 테스트
  db/                                 pgTAP SQL 테스트
  e2e/                                Playwright 모바일/접근성 흐름
docs/design/references/selected-ui.png 선택 시안 복사본
public/images/badminton-court.webp      imagegen으로 생성한 앱 배경 자산
public/icons/icon-192.png                imagegen으로 생성한 PWA 아이콘
public/icons/icon-512.png                imagegen으로 생성한 PWA 아이콘
public/sw.js                             API 쓰기를 캐시하지 않는 서비스 워커
.env.example                           비밀 이름과 브라우저/서버 경계
```

---

### Task 1: 프로젝트, PWA, 디자인 레퍼런스와 환경 검증

**Files:**
- Create: `package.json`, `next.config.ts`, `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `app/manifest.ts`
- Create: `.env.example`, `scripts/check-env.mjs`, `tests/unit/environment.test.ts`, `tests/unit/service-worker.test.ts`, `tests/components/ServiceWorkerRegistration.test.tsx`
- Create: `components/pwa/ServiceWorkerRegistration.tsx`, `public/sw.js`
- Create: `docs/design/references/selected-ui.png`, `public/images/badminton-court.webp`, `public/icons/icon-192.png`, `public/icons/icon-512.png`

**Interfaces:**
- Produces: `assertServerEnv(env: NodeJS.ProcessEnv): void`, Next.js PWA shell, 공통 테스트 명령
- Consumes: 선택 시안 원본 경로와 imagegen으로 생성한 초록 배드민턴 코트 배경

- [ ] **Step 1: 선택 시안을 프로젝트 레퍼런스로 복사한다**

  Run:

  ```powershell
  New-Item -ItemType Directory -Force docs/design/references
  Copy-Item -LiteralPath 'C:\Users\Owner\.codex\generated_images\019ff6a4-b05f-78e1-8110-e96d0af4f26f\exec-30497795-9d1e-4e70-b555-0a16dd4d5d03.png' -Destination 'docs/design/references/selected-ui.png'
  ```

- [ ] **Step 2: imagegen으로 배경 자산을 생성한다**

  Prompt:

  ```text
  Mobile PWA background asset, top-down emerald green badminton court, subtle white court lines, soft vignette, low visual noise behind white UI cards, no people, no shuttlecock, no text, no logo, no watermark, portrait 9:16.
  ```

  생성 결과를 `public/images/badminton-court.webp`로 저장한다.

- [ ] **Step 3: imagegen으로 192px와 512px 앱 아이콘을 생성한다**

  Prompt:

  ```text
  Square mobile app icon, one white badminton shuttlecock centered on an emerald green court, lime accent, simple dimensional style, no letters, no logo, no watermark, safe padding for maskable crop.
  ```

  같은 원본을 정확히 192×192와 512×512로 내보내 `public/icons/icon-192.png`, `public/icons/icon-512.png`에 저장한다.

- [ ] **Step 4: 환경 검증 실패 테스트를 작성한다**

  ```ts
  // tests/unit/environment.test.ts
  import { describe, expect, it } from 'vitest';
  import { assertServerEnv } from '../../scripts/check-env.mjs';

  describe('assertServerEnv', () => {
    it('rejects a missing server secret', () => {
      expect(() => assertServerEnv({ NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' }))
        .toThrow('Missing environment variables');
    });
  });
  ```

- [ ] **Step 5: 테스트가 실패하는지 확인한다**

  Run: `npm test -- tests/unit/environment.test.ts`

  Expected: FAIL with `Cannot find module '../../scripts/check-env.mjs'`.

- [ ] **Step 6: 정확한 패키지와 명령을 정의한다**

  ```json
  {
    "scripts": {
      "dev": "next dev",
      "build": "node scripts/check-env.mjs && next build",
      "lint": "eslint .",
      "test": "vitest run",
      "test:watch": "vitest",
      "test:db": "supabase test db",
      "test:e2e": "playwright test",
      "typecheck": "tsc --noEmit"
    },
    "dependencies": {
      "@supabase/ssr": "^0.7.0",
      "@supabase/supabase-js": "^2.57.0",
      "@tanstack/react-query": "^5.87.0",
      "next": "^16.0.0",
      "react": "^19.2.0",
      "react-dom": "^19.2.0",
      "zod": "^4.1.0"
    },
    "devDependencies": {
      "@axe-core/playwright": "^4.10.0",
      "@playwright/test": "^1.55.0",
      "@testing-library/jest-dom": "^6.8.0",
      "@testing-library/react": "^16.3.0",
      "@testing-library/user-event": "^14.6.0",
      "@types/node": "^22.0.0",
      "@types/react": "^19.0.0",
      "@types/react-dom": "^19.0.0",
      "@tailwindcss/postcss": "^4.1.0",
      "eslint": "^9.0.0",
      "eslint-config-next": "^16.0.0",
      "jsdom": "^26.0.0",
      "supabase": "^2.39.0",
      "tailwindcss": "^4.1.0",
      "typescript": "^5.9.0",
      "vite-tsconfig-paths": "^5.1.0",
      "vitest": "^3.2.0"
    }
  }
  ```

- [ ] **Step 7: 환경 변수 경계와 최소 검증을 구현한다**

  ```dotenv
  # .env.example
  NEXT_PUBLIC_SUPABASE_URL=
  NEXT_PUBLIC_SUPABASE_ANON_KEY=
  SUPABASE_SERVICE_ROLE_KEY=
  OPERATOR_CODE_HASH=
  OPERATOR_COOKIE_SECRET=
  OPERATOR_IP_HASH_SECRET=
  GOOGLE_SHEETS_SPREADSHEET_ID=
  GOOGLE_SHEETS_TAB_NAME=경기기록
  GOOGLE_SERVICE_ACCOUNT_EMAIL=
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
  SHEET_SYNC_WEBHOOK_SECRET=
  ```

  ```js
  // scripts/check-env.mjs
  export function assertServerEnv(env) {
    const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY', 'OPERATOR_CODE_HASH', 'OPERATOR_COOKIE_SECRET'];
    const missing = required.filter((key) => !env[key]);
    if (missing.length) throw new Error(`Missing environment variables: ${missing.join(', ')}`);
  }
  if (process.argv[1]?.endsWith('check-env.mjs')) assertServerEnv(process.env);
  ```

- [ ] **Step 8: PWA manifest와 선택 디자인 토큰을 구현한다**

  ```ts
  // app/manifest.ts
  import type { MetadataRoute } from 'next';
  export default function manifest(): MetadataRoute.Manifest {
    return { name: '배드민턴 기록', short_name: '배드민턴', start_url: '/',
      display: 'standalone', background_color: '#073b2a', theme_color: '#0b6b45',
      icons:[{src:'/icons/icon-192.png',sizes:'192x192',type:'image/png'},
        {src:'/icons/icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}] };
  }
  ```

  `app/globals.css`에는 `--court: #0b6b45`, `--lime: #c7f36b`, 16px 카드 반경, 배경 이미지, 44px 최소 터치 영역을 정의한다. Product Design `image-to-code`를 사용해 `selected-ui.png`의 카드 간격과 승리팀 표현을 구현 기준으로 삼는다.

- [ ] **Step 9: API 쓰기를 캐시하지 않는 서비스 워커 실패 테스트를 작성한다**

  ```ts
  // tests/unit/service-worker.test.ts
  import { readFileSync } from 'node:fs';
  import { expect, it } from 'vitest';
  it('never caches API or non-GET requests',()=>{
    const source=readFileSync('public/sw.js','utf8');
    expect(source).toContain("request.method !== 'GET'");
    expect(source).toContain("url.pathname.startsWith('/api/')");
  });
  ```

  ```tsx
  // tests/components/ServiceWorkerRegistration.test.tsx
  import { render } from '@testing-library/react';
  import { expect, it, vi } from 'vitest';
  import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';
  it('registers the explicit worker in production',()=>{
    const register=vi.fn().mockResolvedValue({}); Object.defineProperty(navigator,'serviceWorker',{value:{register},configurable:true});
    vi.stubEnv('NODE_ENV','production'); render(<ServiceWorkerRegistration/>);
    expect(register).toHaveBeenCalledWith('/sw.js',{scope:'/'});
  });
  ```

- [ ] **Step 10: 서비스 워커 테스트 실패를 확인한다**

  Run: `npm test -- tests/unit/service-worker.test.ts`

  Expected: FAIL because `public/sw.js` does not exist.

- [ ] **Step 11: 직접 관리하는 서비스 워커를 구현한다**

  ```js
  // public/sw.js
  const CACHE='badminton-static-v1';
  const STATIC=['/','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png'];
  self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(STATIC))));
  self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
  self.addEventListener('fetch',event=>{
    const {request}=event; const url=new URL(request.url);
    if(request.method !== 'GET' || url.pathname.startsWith('/api/')) return;
    event.respondWith(caches.match(request).then(hit=>hit ?? fetch(request).then(response=>{
      if(response.ok && url.origin===self.location.origin) caches.open(CACHE).then(cache=>cache.put(request,response.clone()));
      return response;
    })));
  });
  ```

- [ ] **Step 12: production 서비스 워커 등록 컴포넌트를 구현한다**

  ```tsx
  // components/pwa/ServiceWorkerRegistration.tsx
  'use client';
  import { useEffect } from 'react';
  export function ServiceWorkerRegistration(){
    useEffect(()=>{ if(process.env.NODE_ENV==='production' && 'serviceWorker' in navigator){ void navigator.serviceWorker.register('/sw.js',{scope:'/'}); } },[]);
    return null;
  }
  ```

  `app/layout.tsx`의 `<body>` 마지막에 `<ServiceWorkerRegistration />`을 한 번 렌더링한다. 서비스 워커는 경기 신규 저장을 큐잉하지 않으며 오프라인 POST는 네트워크 오류로 반환한다.

- [ ] **Step 13: PWA·환경 테스트와 기본 검증을 통과시킨다**

  Run: `npm test -- tests/unit/environment.test.ts tests/unit/service-worker.test.ts tests/components/ServiceWorkerRegistration.test.tsx && npm run typecheck && npm run lint`

  Expected: all PASS.

- [ ] **Step 14: Task 1을 커밋한다**

  ```bash
  git add package.json next.config.ts tsconfig.json vitest.config.ts playwright.config.ts app components/pwa public/sw.js scripts tests .env.example docs/design/references public/images/badminton-court.webp public/icons
  git commit -m "chore: scaffold badminton pwa"
  ```

---

### Task 2: Supabase 스키마와 RLS

**Files:**
- Create: `supabase/config.toml`, `supabase/migrations/202608130001_core_schema.sql`, `supabase/tests/001_core_schema_test.sql`, `supabase/seed.sql`
- Create: `lib/domain/types.ts`, `lib/supabase/browser.ts`, `lib/supabase/server.ts`, `lib/supabase/admin.ts`

**Interfaces:**
- Produces: `team_code`, `match_status`, `players`, `sessions`, `matches`, `match_participants`, `sheet_sync_jobs`; `MatchDto`, `PlayerDto`
- Consumes: Task 1 환경 변수

- [ ] **Step 1: 제약과 공개 읽기 RLS의 실패 pgTAP 테스트를 작성한다**

  ```sql
  -- supabase/tests/001_core_schema_test.sql
  begin;
  select plan(5);
  select has_table('public', 'players');
  select has_column('public', 'matches', 'match_version');
  select has_column('public', 'sheet_sync_jobs', 'match_version');
  select col_is_unique('public', 'matches', 'client_request_id');
  select policies_are('public', 'players', array['players_public_read']);
  select * from finish();
  rollback;
  ```

- [ ] **Step 2: 스키마 테스트가 실패하는지 확인한다**

  Run: `supabase start && supabase test db`

  Expected: FAIL because `public.players` does not exist.

- [ ] **Step 3: enum과 핵심 테이블을 생성한다**

  ```sql
  -- supabase/migrations/202608130001_core_schema.sql
  create type public.team_code as enum ('A','B');
  create type public.match_status as enum ('completed','cancelled');
  create type public.sync_operation as enum ('upsert','cancel');
  create type public.sync_status as enum ('pending','processing','succeeded','failed');

  create sequence public.member_code_seq;
  create table public.players (
    id uuid primary key default gen_random_uuid(),
    member_code text not null unique default ('P' || lpad(nextval('public.member_code_seq')::text, 3, '0')),
    display_name text not null check (length(btrim(display_name)) > 0),
    note text,
    is_active boolean not null default true,
    created_at timestamptz not null default now()
  );
  create table public.sessions (
    id uuid primary key default gen_random_uuid(), session_date date not null unique,
    status text not null default 'open' check (status in ('open','closed')),
    created_at timestamptz not null default now()
  );
  create table public.matches (
    id uuid primary key default gen_random_uuid(), session_id uuid not null references public.sessions,
    match_no integer not null check (match_no > 0), winner_team public.team_code not null,
    status public.match_status not null default 'completed', client_request_id uuid not null unique,
    match_version integer not null default 1 check (match_version > 0),
    played_at timestamptz not null default now(), updated_at timestamptz not null default now(),
    unique(session_id, match_no)
  );
  create table public.match_participants (
    match_id uuid not null references public.matches on delete restrict,
    player_id uuid not null references public.players on delete restrict,
    team public.team_code not null, seat smallint not null check (seat in (1,2)),
    primary key(match_id, player_id), unique(match_id, team, seat)
  );
  create table public.sheet_sync_jobs (
    id uuid primary key default gen_random_uuid(), match_id uuid not null references public.matches,
    match_version integer not null check (match_version > 0),
    operation public.sync_operation not null, status public.sync_status not null default 'pending',
    attempt_count integer not null default 0, next_attempt_at timestamptz not null default now(),
    sheet_row integer, last_error text, updated_at timestamptz not null default now(),
    unique(match_id)
  );
  ```

- [ ] **Step 4: RLS를 공개 읽기·직접 쓰기 금지로 설정한다**

  ```sql
  alter table public.players enable row level security;
  alter table public.sessions enable row level security;
  alter table public.matches enable row level security;
  alter table public.match_participants enable row level security;
  alter table public.sheet_sync_jobs enable row level security;
  create policy players_public_read on public.players for select using (true);
  create policy sessions_public_read on public.sessions for select using (true);
  create policy matches_public_read on public.matches for select using (true);
  create policy participants_public_read on public.match_participants for select using (true);
  revoke insert, update, delete on all tables in schema public from anon, authenticated;
  ```

- [ ] **Step 5: 공유 DTO를 정의한다**

  ```ts
  // lib/domain/types.ts
  export type TeamCode = 'A' | 'B';
  export type PlayerDto = { id: string; memberCode: string; displayName: string; resolvedName: string; isActive: boolean };
  export type MatchInput = { sessionDate: string; playerIds: [string,string,string,string]; winnerTeam: TeamCode; clientRequestId: string };
  export type MatchDto = MatchInput & { id: string; matchNo: number; matchVersion: number; status: 'completed'|'cancelled'; playedAt: string };
  ```

- [ ] **Step 6: DB 및 TypeScript 검증을 통과시킨다**

  Run: `supabase db reset && supabase test db && npm run typecheck`

  Expected: all PASS.

- [ ] **Step 7: Task 2 관련 전체 테스트를 실행한다**

  Run: `npm test && supabase test db`

  Expected: all PASS.

- [ ] **Step 8: Task 2를 커밋한다**

  ```bash
  git add supabase lib/domain/types.ts lib/supabase
  git commit -m "feat: add core database schema and rls"
  ```

---

### Task 3: 개인·파트너 통계 뷰

**Files:**
- Create: `supabase/migrations/202608130002_ranking_views.sql`, `supabase/tests/002_ranking_views_test.sql`
- Create: `lib/domain/ranking.ts`, `tests/unit/ranking.test.ts`

**Interfaces:**
- Produces: `public.personal_rankings`, `public.partner_rankings`, `sortRankingRows<T>()`
- Consumes: Task 2 테이블과 `match_status`

- [ ] **Step 1: 완료 경기만 집계하는 실패 DB 테스트를 작성한다**

  ```sql
  -- supabase/tests/002_ranking_views_test.sql
  begin; select plan(2);
  select has_view('public', 'personal_rankings');
  select has_view('public', 'partner_rankings');
  select * from finish(); rollback;
  ```

- [ ] **Step 2: DB 테스트 실패를 확인한다**

  Run: `supabase test db`

  Expected: FAIL because ranking views do not exist.

- [ ] **Step 3: 개인 순위 뷰를 구현한다**

  ```sql
  create view public.personal_rankings with (security_invoker=true) as
  with name_counts as (
    select display_name, count(*) count from public.players group by display_name
  ), results as (
    select p.id player_id,
      count(mp.match_id) filter (where m.status='completed')::int games,
      count(mp.match_id) filter (where m.status='completed' and mp.team=m.winner_team)::int wins,
      count(mp.match_id) filter (where m.status='completed' and mp.team<>m.winner_team)::int losses
    from public.players p left join public.match_participants mp on mp.player_id=p.id
    left join public.matches m on m.id=mp.match_id group by p.id
  )
  select p.id player_id, p.member_code,
    case when nc.count > 1 then p.display_name || ' · ' || p.member_code else p.display_name end resolved_name,
    r.games, r.wins, r.losses,
    case when r.games=0 then 0::numeric else r.wins::numeric/r.games end win_rate
  from results r join public.players p on p.id=r.player_id join name_counts nc using(display_name);
  ```

- [ ] **Step 4: 파트너 순위 뷰를 구현한다**

  ```sql
  create view public.partner_rankings with (security_invoker=true) as
  with grouped as (
    select m.id match_id, mp.team, array_agg(mp.player_id order by mp.player_id::text) player_ids,
      bool_or(mp.team=m.winner_team) won
    from public.matches m join public.match_participants mp on mp.match_id=m.id
    where m.status='completed' group by m.id, mp.team having count(*)=2
  ), teams as (
    select match_id, team, player_ids[1] player_low_id, player_ids[2] player_high_id, won from grouped
  )
  select player_low_id, player_high_id, count(*)::int games,
    count(*) filter (where won)::int wins, count(*) filter (where not won)::int losses,
    count(*) filter (where won)::numeric/count(*) win_rate, count(*) < 3 is_small_sample
  from teams group by player_low_id, player_high_id;
  grant select on public.personal_rankings, public.partner_rankings to anon, authenticated;
  ```

- [ ] **Step 5: 정렬 함수의 실패 테스트를 작성한다**

  ```ts
  // tests/unit/ranking.test.ts
  import { expect, it } from 'vitest';
  import { sortRankingRows } from '@/lib/domain/ranking';
  it('sorts by raw rate, wins, games, then name', () => {
    const rows = [{name:'나',winRate:0.5,wins:2,games:4},{name:'가',winRate:0.5,wins:2,games:4}];
    expect(sortRankingRows(rows).map(x => x.name)).toEqual(['가','나']);
  });
  ```

- [ ] **Step 6: 정렬 테스트 실패를 확인한다**

  Run: `npm test -- tests/unit/ranking.test.ts`

  Expected: FAIL because `sortRankingRows` is undefined.

- [ ] **Step 7: 정렬 함수를 최소 구현한다**

  ```ts
  // lib/domain/ranking.ts
  export type Rankable = { name:string; winRate:number; wins:number; games:number };
  export function sortRankingRows<T extends Rankable>(rows:T[]):T[] {
    return [...rows].sort((a,b) => b.winRate-a.winRate || b.wins-a.wins || b.games-a.games || a.name.localeCompare(b.name,'ko'));
  }
  ```

- [ ] **Step 8: 통계 관련 테스트를 통과시킨다**

  Run: `supabase db reset && supabase test db && npm test -- tests/unit/ranking.test.ts`

  Expected: all PASS.

- [ ] **Step 9: Task 3 관련 전체 테스트를 실행한다**

  Run: `npm test && supabase test db`

  Expected: all PASS.

- [ ] **Step 10: Task 3을 커밋한다**

  ```bash
  git add supabase/migrations/202608130002_ranking_views.sql supabase/tests/002_ranking_views_test.sql lib/domain/ranking.ts tests/unit/ranking.test.ts
  git commit -m "feat: add personal and partner rankings"
  ```

---

### Task 4: 경기 RPC, 멱등성, 수정 경쟁 방지

**Files:**
- Create: `supabase/migrations/202608130003_match_rpc.sql`, `supabase/tests/003_match_rpc_test.sql`

**Interfaces:**
- Produces: `record_match(date,uuid[],team_code,uuid) returns matches`, `update_match(uuid,integer,uuid[],team_code) returns matches`, `cancel_match(uuid,integer) returns matches`
- Consumes: Task 2 스키마, Task 3 뷰

- [ ] **Step 1: 중복 선수와 동일 요청 ID 테스트를 작성한다**

  ```sql
  begin; select plan(3);
  select throws_ok($$ select public.record_match(current_date, array[gen_random_uuid()]::uuid[], 'A', gen_random_uuid()) $$, 'BM001', 'four unique active players required');
  select has_function('public','update_match',array['uuid','integer','uuid[]','team_code']);
  select has_function('public','cancel_match',array['uuid','integer']);
  select * from finish(); rollback;
  ```

- [ ] **Step 2: RPC 테스트 실패를 확인한다**

  Run: `supabase test db`

  Expected: FAIL because `record_match` does not exist.

- [ ] **Step 3: 경기 생성 RPC를 구현한다**

  ```sql
  create function public.record_match(p_session_date date, p_player_ids uuid[], p_winner_team public.team_code, p_client_request_id uuid)
  returns public.matches language plpgsql security definer set search_path=public as $$
  declare v_session public.sessions; v_match public.matches;
  begin
    perform pg_advisory_xact_lock(hashtextextended(p_client_request_id::text,0));
    select * into v_match from matches where client_request_id=p_client_request_id;
    if found then return v_match; end if;
    if cardinality(p_player_ids)<>4 or (select count(distinct x) from unnest(p_player_ids) x)<>4
      or (select count(*) from players where id=any(p_player_ids) and is_active)<>4 then
      raise exception using errcode='BM001', message='four unique active players required';
    end if;
    insert into sessions(session_date) values(p_session_date) on conflict(session_date) do nothing;
    select * into v_session from sessions where session_date=p_session_date for update;
    insert into matches(session_id,match_no,winner_team,client_request_id)
      select v_session.id, coalesce(max(match_no),0)+1, p_winner_team,p_client_request_id from matches where session_id=v_session.id returning * into v_match;
    insert into match_participants(match_id,player_id,team,seat) values
      (v_match.id,p_player_ids[1],'A',1),(v_match.id,p_player_ids[2],'A',2),(v_match.id,p_player_ids[3],'B',1),(v_match.id,p_player_ids[4],'B',2);
    insert into sheet_sync_jobs(match_id,match_version,operation) values(v_match.id,v_match.match_version,'upsert');
    return v_match;
  end $$;
  revoke all on function public.record_match(date,uuid[],public.team_code,uuid) from public;
  grant execute on function public.record_match(date,uuid[],public.team_code,uuid) to service_role;
  ```

- [ ] **Step 4: 버전 기반 수정 RPC를 구현한다**

  ```sql
  create function public.update_match(p_match_id uuid,p_expected_version integer,p_player_ids uuid[],p_winner_team public.team_code)
  returns public.matches language plpgsql security definer set search_path=public as $$
  declare v_match public.matches;
  begin
    if cardinality(p_player_ids)<>4 or (select count(distinct x) from unnest(p_player_ids) x)<>4
      or (select count(*) from players where id=any(p_player_ids) and is_active)<>4 then
      raise exception using errcode='BM001',message='four unique active players required';
    end if;
    update matches set winner_team=p_winner_team,status='completed',match_version=match_version+1,updated_at=now()
      where id=p_match_id and match_version=p_expected_version returning * into v_match;
    if not found then raise exception using errcode='BM409',message='match version conflict'; end if;
    delete from match_participants where match_id=p_match_id;
    insert into match_participants(match_id,player_id,team,seat) values
      (p_match_id,p_player_ids[1],'A',1),(p_match_id,p_player_ids[2],'A',2),
      (p_match_id,p_player_ids[3],'B',1),(p_match_id,p_player_ids[4],'B',2);
    insert into sheet_sync_jobs(match_id,match_version,operation,status,next_attempt_at)
      values(p_match_id,v_match.match_version,'upsert','pending',now()) on conflict(match_id) do update
      set match_version=excluded.match_version,operation='upsert',status='pending',next_attempt_at=now(),updated_at=now();
    return v_match;
  end $$;
  revoke all on function public.update_match(uuid,integer,uuid[],public.team_code) from public;
  grant execute on function public.update_match(uuid,integer,uuid[],public.team_code) to service_role;
  ```

- [ ] **Step 5: 버전 기반 취소 RPC를 구현한다**

  ```sql
  create function public.cancel_match(p_match_id uuid,p_expected_version integer)
  returns public.matches language plpgsql security definer set search_path=public as $$
  declare v_match public.matches;
  begin
    update matches set status='cancelled',match_version=match_version+1,updated_at=now()
    where id=p_match_id and match_version=p_expected_version returning * into v_match;
    if not found then raise exception using errcode='BM409',message='match version conflict'; end if;
    insert into sheet_sync_jobs(match_id,match_version,operation,status,next_attempt_at)
      values(p_match_id,v_match.match_version,'cancel','pending',now()) on conflict(match_id) do update
      set match_version=excluded.match_version,operation='cancel',status='pending',next_attempt_at=now(),updated_at=now();
    return v_match;
  end $$;
  revoke all on function public.cancel_match(uuid,integer) from public;
  grant execute on function public.cancel_match(uuid,integer) to service_role;
  ```

- [ ] **Step 6: 동시 생성 회귀 테스트를 추가한다**

  ```sql
  -- tests/db/concurrent_record_match.sql에서 두 psql 세션을 동시에 시작한다.
  -- 같은 request UUID 두 호출 결과의 count(distinct id)는 1이어야 하고,
  -- 서로 다른 request UUID 두 호출의 같은 session_date match_no는 {1,2}여야 한다.
  select is((select count(*) from matches where client_request_id='11111111-1111-1111-1111-111111111111'),1::bigint,'same request is idempotent');
  select results_eq('select match_no from matches order by match_no','values (1),(2)','session row lock serializes match numbers');
  ```

  Run: `supabase db reset && pwsh tests/db/run-concurrent-record-match.ps1`

  Expected: both assertions PASS without unique-constraint errors.

- [ ] **Step 7: RPC와 재계산 테스트를 통과시킨다**

  Run: `supabase db reset && supabase test db`

  Expected: duplicate players rejected, duplicate request returns one match, stale version returns `BM409`, cancelled match disappears from views.

- [ ] **Step 8: Task 4 관련 전체 테스트를 실행한다**

  Run: `npm test && supabase test db`

  Expected: all PASS.

- [ ] **Step 9: Task 4를 커밋한다**

  ```bash
  git add supabase/migrations/202608130003_match_rpc.sql supabase/tests/003_match_rpc_test.sql tests/db
  git commit -m "feat: add transactional match commands"
  ```

---

### Task 5: 운영자 세션 Route Handlers

**Files:**
- Create: `lib/auth/operator-cookie.ts`, `app/api/operator/session/route.ts`, `tests/unit/operator-cookie.test.ts`, `tests/unit/operator-session-route.test.ts`
- Create: `supabase/migrations/202608130004_operator_login_guard.sql`, `supabase/tests/004_operator_login_guard_test.sql`

**Interfaces:**
- Produces: `createOperatorToken(now:number):Promise<string>`, `verifyOperatorToken(token:string,now:number):Promise<boolean>`, `hashClientIp(ip:string):Promise<string>`, `operator_login_status(text)`, `record_operator_login_failure(text)`, `clear_operator_login_failures(text)`
- Consumes: `OPERATOR_CODE_HASH`, `OPERATOR_COOKIE_SECRET`, `OPERATOR_IP_HASH_SECRET`

- [ ] **Step 1: 만료된 쿠키 실패 테스트를 작성한다**

  ```ts
  import { expect, it } from 'vitest';
  import { createOperatorToken, verifyOperatorToken } from '@/lib/auth/operator-cookie';
  it('rejects after 12 hours', async () => {
    const token=await createOperatorToken(1_000);
    expect(await verifyOperatorToken(token,1_000+43_200_001)).toBe(false);
  });
  it('returns false for malformed tokens',async()=>{
    await expect(verifyOperatorToken('not.a.valid.token',1_000)).resolves.toBe(false);
  });
  ```

- [ ] **Step 2: 쿠키 테스트 실패를 확인한다**

  Run: `npm test -- tests/unit/operator-cookie.test.ts`

  Expected: FAIL because module is missing.

- [ ] **Step 3: Web Crypto 서명 쿠키를 구현한다**

  ```ts
  async function keyFor(secret:string){
    return crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
  }
  async function sign(payload:string,secret:string):Promise<string>{
    const key=await keyFor(secret);
    const bytes=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload));
    return Buffer.from(bytes).toString('base64url');
  }
  const TTL=43_200_000;
  export async function createOperatorToken(now:number):Promise<string> {
    const payload=btoa(JSON.stringify({iat:now,exp:now+TTL}));
    const sig=await sign(payload,process.env.OPERATOR_COOKIE_SECRET!);
    return `${payload}.${sig}`;
  }
  export async function verifyOperatorToken(token:string,now:number):Promise<boolean> {
    try {
      const [payload,sig]=token.split('.'); if(!payload||!sig)return false;
      const valid=await crypto.subtle.verify('HMAC',await keyFor(process.env.OPERATOR_COOKIE_SECRET!),Buffer.from(sig,'base64url'),new TextEncoder().encode(payload));
      if(!valid)return false; const value=JSON.parse(atob(payload)); return Number.isFinite(value.exp)&&value.exp>=now;
    } catch { return false; }
  }
  export function serializeOperatorCookie(token:string):string {
    return `operator_session=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200`;
  }
  export class OperatorUnauthorizedError extends Error { status=401 as const; }
  export async function requireOperator(request:Request):Promise<void>{
    const token=request.headers.get('cookie')?.match(/(?:^|; )operator_session=([^;]+)/)?.[1]??'';
    if(!await verifyOperatorToken(token,Date.now())) throw new OperatorUnauthorizedError();
  }
  ```

- [ ] **Step 4: DB 기반 로그인 차단 실패 테스트를 작성한다**

  ```sql
  begin; select plan(2);
  select is((select blocked from public.operator_login_status('ip-hash')),false,'initially open');
  select public.record_operator_login_failure('ip-hash') from generate_series(1,5);
  select is((select blocked from public.operator_login_status('ip-hash')),true,'blocked after five failures');
  select * from finish(); rollback;
  ```

- [ ] **Step 5: 로그인 차단 RPC를 구현한다**

  ```sql
  create table public.operator_login_attempts(
    ip_hash text primary key, failure_count integer not null default 0,
    first_failed_at timestamptz not null default now(), blocked_until timestamptz
  );
  alter table public.operator_login_attempts enable row level security;
  create function public.operator_login_status(p_ip_hash text) returns table(blocked boolean,retry_after_seconds integer)
  language sql security definer set search_path=public as $$
    select coalesce(blocked_until>now(),false),greatest(0,extract(epoch from blocked_until-now())::int)
    from operator_login_attempts where ip_hash=p_ip_hash
    union all select false,0 where not exists(select 1 from operator_login_attempts where ip_hash=p_ip_hash) limit 1;
  $$;
  create function public.record_operator_login_failure(p_ip_hash text) returns void language plpgsql security definer set search_path=public as $$
  begin insert into operator_login_attempts(ip_hash,failure_count,first_failed_at,blocked_until) values(p_ip_hash,1,now(),null)
    on conflict(ip_hash) do update set
      failure_count=case when operator_login_attempts.first_failed_at<now()-interval '15 minutes' then 1 else operator_login_attempts.failure_count+1 end,
      first_failed_at=case when operator_login_attempts.first_failed_at<now()-interval '15 minutes' then now() else operator_login_attempts.first_failed_at end,
      blocked_until=case when (case when operator_login_attempts.first_failed_at<now()-interval '15 minutes' then 1 else operator_login_attempts.failure_count+1 end)>=5 then now()+interval '15 minutes' else null end;
  end $$;
  create function public.clear_operator_login_failures(p_ip_hash text) returns void language sql security definer set search_path=public as $$ delete from operator_login_attempts where ip_hash=p_ip_hash $$;
  revoke all on table public.operator_login_attempts from anon,authenticated;
  grant execute on function public.operator_login_status(text),public.record_operator_login_failure(text),public.clear_operator_login_failures(text) to service_role;
  ```

- [ ] **Step 6: 세션 Route Handler를 구현한다**

  ```ts
  // app/api/operator/session/route.ts
  import { scryptSync, timingSafeEqual } from 'node:crypto';
  export async function hashClientIp(ip:string):Promise<string>{
    const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(process.env.OPERATOR_IP_HASH_SECRET!),{name:'HMAC',hash:'SHA-256'},false,['sign']);
    return Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(ip))).toString('hex');
  }
  export async function verifyScryptHash(code:string,stored:string):Promise<boolean>{
    const [salt,expectedHex]=stored.split(':');
    const actual=scryptSync(code,salt,32); const expected=Buffer.from(expectedHex,'hex');
    return expected.length===actual.length && timingSafeEqual(expected,actual);
  }
  export async function POST(request:Request) {
    const {code}=await request.json();
    const ip=(request.headers.get('x-forwarded-for')??'unknown').split(',')[0].trim(); const ipHash=await hashClientIp(ip);
    const {data:[guard]}=await admin().rpc('operator_login_status',{p_ip_hash:ipHash});
    if(guard.blocked)return Response.json({code:'OPERATOR_LOGIN_BLOCKED',retryAfter:guard.retry_after_seconds},{status:429});
    if (!await verifyScryptHash(code,process.env.OPERATOR_CODE_HASH!)) {
      await admin().rpc('record_operator_login_failure',{p_ip_hash:ipHash});
      return Response.json({code:'INVALID_OPERATOR_CODE'},{status:401});
    }
    await admin().rpc('clear_operator_login_failures',{p_ip_hash:ipHash});
    const response=Response.json({ok:true});
    response.headers.append('Set-Cookie',serializeOperatorCookie(await createOperatorToken(Date.now())));
    return response;
  }
  export async function DELETE(){ return new Response(null,{status:204,headers:{'Set-Cookie':'operator_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0'}}); }
  ```

- [ ] **Step 7: 쿠키·차단·성공 초기화 테스트를 통과시킨다**

  Run: `supabase db reset && supabase test db && npm test -- tests/unit/operator-cookie.test.ts tests/unit/operator-session-route.test.ts`

  Expected: all PASS; fifth failure starts a 15-minute block, success clears failures, malformed cookie returns false, cookie contains `HttpOnly`, `Secure`, `SameSite=Strict`.

- [ ] **Step 8: Task 5 관련 전체 테스트를 실행한다**

  Run: `npm test && npm run typecheck`

  Expected: all PASS.

- [ ] **Step 9: Task 5를 커밋한다**

  ```bash
  git add lib/auth app/api/operator tests/unit/operator-cookie.test.ts tests/unit/operator-session-route.test.ts supabase/migrations/202608130004_operator_login_guard.sql supabase/tests/004_operator_login_guard_test.sql
  git commit -m "feat: protect operator write routes"
  ```

---

### Task 6: 선수 관리

**Files:**
- Create: `app/api/players/route.ts`, `app/players/page.tsx`, `components/players/PlayerList.tsx`, `lib/domain/display-name.ts`
- Create: `tests/unit/display-name.test.ts`, `tests/unit/players-route.test.ts`, `tests/components/PlayerList.test.tsx`

**Interfaces:**
- Produces: `resolvePlayerNames(players): PlayerDto[]`, `POST /api/players`, `PATCH /api/players`
- Consumes: Task 2 `players`, Task 5 `requireOperator`

- [ ] **Step 1: 동명이인 표시 실패 테스트를 작성한다**

  ```ts
  it('adds member code only for duplicate names',()=>{
    expect(resolvePlayerNames([{id:'1',memberCode:'P001',displayName:'김재민',isActive:true},{id:'2',memberCode:'P002',displayName:'김재민',isActive:true}]).map(x=>x.resolvedName))
      .toEqual(['김재민 · P001','김재민 · P002']);
  });
  ```

- [ ] **Step 2: 표시명 테스트 실패를 확인한다**

  Run: `npm test -- tests/unit/display-name.test.ts`

  Expected: FAIL because function is missing.

- [ ] **Step 3: 표시명 함수와 선수 Route Handler를 구현한다**

  ```ts
  export function resolvePlayerNames(players:Omit<PlayerDto,'resolvedName'>[]):PlayerDto[]{
    const counts=new Map<string,number>(); players.forEach(p=>counts.set(p.displayName,(counts.get(p.displayName)??0)+1));
    return players.map(p=>({...p,resolvedName:counts.get(p.displayName)!>1?`${p.displayName} · ${p.memberCode}`:p.displayName}));
  }
  ```

  `POST /api/players`는 `{displayName:string,note?:string}`을 Zod로 검증하고 admin client로 insert한다. `PATCH`는 `{id:string,isActive:boolean}`만 허용하며 두 메서드 모두 `requireOperator`를 먼저 호출한다.

- [ ] **Step 4: 선수 목록 UI를 구현한다**

  `PlayerList`는 활성/비활성 구역, 회원번호, 동명이인 표시명, 44px 비활성 토글을 렌더링한다.

- [ ] **Step 5: 선수 관련 테스트를 통과시킨다**

  Run: `npm test -- tests/unit/display-name.test.ts tests/unit/players-route.test.ts tests/components/PlayerList.test.tsx`

  Expected: all PASS.

- [ ] **Step 6: Task 6 관련 전체 테스트를 실행한다**

  Run: `npm test && npm run typecheck && npm run lint`

  Expected: all PASS.

- [ ] **Step 7: Task 6을 커밋한다**

  ```bash
  git add app/api/players app/players components/players lib/domain/display-name.ts tests
  git commit -m "feat: add player management"
  ```

---

### Task 7: 경기 입력 UI와 생성 Route Handler

**Files:**
- Create: `app/api/matches/route.ts`, `app/matches/new/page.tsx`, `components/matches/MatchForm.tsx`, `components/players/PlayerPicker.tsx`, `lib/mutations.ts`
- Create: `tests/unit/matches-route.test.ts`, `tests/components/MatchForm.test.tsx`

**Interfaces:**
- Produces: `submitMatch(input:MatchInput):Promise<MatchDto>`, `POST /api/matches`
- Consumes: Task 4 `record_match`, Task 5 운영자 세션, Task 6 활성 선수

- [ ] **Step 1: 동일 선수 재선택 실패 컴포넌트 테스트를 작성한다**

  ```tsx
  it('disables a player already selected in another seat',async()=>{
    render(<MatchForm players={players}/>); await user.click(screen.getByLabelText('A팀 선수 1')); await user.click(screen.getByText('김재민'));
    await user.click(screen.getByLabelText('B팀 선수 1'));
    expect(screen.getByRole('option',{name:'김재민'})).toBeDisabled();
  });
  ```

- [ ] **Step 2: 경기 입력 테스트 실패를 확인한다**

  Run: `npm test -- tests/components/MatchForm.test.tsx`

  Expected: FAIL because `MatchForm` is missing.

- [ ] **Step 3: 생성 Route Handler를 구현한다**

  ```ts
  const MatchSchema=z.object({sessionDate:z.iso.date(),playerIds:z.tuple([z.uuid(),z.uuid(),z.uuid(),z.uuid()]).refine(x=>new Set(x).size===4),winnerTeam:z.enum(['A','B']),clientRequestId:z.uuid()});
  function mapDatabaseError(error:{code?:string;message:string}):Response {
    const status=error.code==='BM001'?422:error.code==='BM409'?409:500;
    return Response.json({code:error.code??'DATABASE_ERROR',message:error.message},{status});
  }
  function toMatchDto(row:any,sessionDate:string,playerIds:[string,string,string,string]):MatchDto {
    return {id:row.id,sessionDate,playerIds,winnerTeam:row.winner_team,
      clientRequestId:row.client_request_id,matchNo:row.match_no,matchVersion:row.match_version,status:row.status,playedAt:row.played_at};
  }
  export async function POST(request:Request){ await requireOperator(request); const input=MatchSchema.parse(await request.json());
    const {data,error}=await admin().rpc('record_match',{p_session_date:input.sessionDate,p_player_ids:input.playerIds,p_winner_team:input.winnerTeam,p_client_request_id:input.clientRequestId});
    if(error) return mapDatabaseError(error); return Response.json(toMatchDto(data,input.sessionDate,input.playerIds)); }
  ```

- [ ] **Step 4: 4자리 선택과 승리팀 확인 UI를 구현한다**

  `MatchForm`은 `[A1,A2,B1,B2]` 순서 UUID 튜플을 만들고, 네 고유 선수와 승리팀이 정해질 때만 제출 버튼을 활성화한다. 제출 시 `crypto.randomUUID()`를 한 번 생성해 재시도에도 같은 `clientRequestId`를 유지한다.

- [ ] **Step 5: 경기 입력 테스트를 통과시킨다**

  Run: `npm test -- tests/components/MatchForm.test.tsx tests/unit/matches-route.test.ts`

  Expected: all PASS, duplicate selection disabled and server rejects duplicate UUIDs.

- [ ] **Step 6: Task 7 관련 전체 테스트를 실행한다**

  Run: `npm test && npm run typecheck && npm run lint`

  Expected: all PASS.

- [ ] **Step 7: Task 7을 커밋한다**

  ```bash
  git add app/api/matches/route.ts app/matches components/matches/MatchForm.tsx components/players/PlayerPicker.tsx lib/mutations.ts tests
  git commit -m "feat: add mobile match entry"
  ```

---

### Task 8: 기록 조회, 수정과 취소

**Files:**
- Create: `app/records/page.tsx`, `app/api/matches/[id]/route.ts`, `components/matches/MatchRow.tsx`, `components/matches/EditMatchDialog.tsx`, `lib/queries.ts`
- Create: `tests/components/MatchRow.test.tsx`, `tests/unit/match-update-route.test.ts`

**Interfaces:**
- Produces: `getMatchesByDate(date:string):Promise<MatchDto[]>`, `PATCH /api/matches/:id`, `DELETE /api/matches/:id`, `UpdateMatchResult={id:string;matchVersion:number}`
- Consumes: Task 4 `update_match`/`cancel_match`, Task 7 DTO

- [ ] **Step 1: 승리팀 강조 실패 테스트를 작성한다**

  ```tsx
  it('wraps only the winning team and attaches 승 badge',()=>{
    render(<MatchRow match={matchWithWinnerA}/>);
    expect(screen.getByTestId('team-A')).toHaveAttribute('data-winner','true');
    expect(within(screen.getByTestId('team-A')).getByText('승')).toBeVisible();
    expect(within(screen.getByTestId('team-B')).queryByText('승')).toBeNull();
  });
  ```

- [ ] **Step 2: 기록 UI 테스트 실패를 확인한다**

  Run: `npm test -- tests/components/MatchRow.test.tsx`

  Expected: FAIL because `MatchRow` is missing.

- [ ] **Step 3: 버전 포함 수정·취소 Route Handler를 구현한다**

  ```ts
  type UpdateMatchBody={expectedVersion:number;playerIds:[string,string,string,string];winnerTeam:TeamCode};
  type UpdateMatchResult={id:string;matchVersion:number};
  export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){
    await requireOperator(req); const {id}=await params; const body=UpdateMatchSchema.parse(await req.json());
    const {data,error}=await admin().rpc('update_match',{p_match_id:id,p_expected_version:body.expectedVersion,p_player_ids:body.playerIds,p_winner_team:body.winnerTeam});
    if(error?.code==='BM409') return Response.json({code:'MATCH_VERSION_CONFLICT'},{status:409});
    if(error) return mapDatabaseError(error);
    return Response.json({id:data.id,matchVersion:data.match_version} satisfies UpdateMatchResult);
  }
  ```

- [ ] **Step 4: 기록 행과 수정 대화상자를 구현한다**

  승리팀 컨테이너는 둥근 사각형, 연두 테두리, 왼쪽 위에 겹친 `승` 배지를 사용한다. 수정 요청에는 화면이 읽은 `matchVersion`을 보내고 409면 최신 기록을 다시 불러오라는 메시지를 표시한다. 취소는 확인 대화상자를 거쳐 물리 삭제 없이 실행한다.

- [ ] **Step 5: 기록·버전 충돌 테스트를 통과시킨다**

  Run: `npm test -- tests/components/MatchRow.test.tsx tests/unit/match-update-route.test.ts`

  Expected: all PASS; stale version maps to HTTP 409.

- [ ] **Step 6: Task 8 관련 전체 테스트를 실행한다**

  Run: `npm test && supabase test db && npm run typecheck`

  Expected: all PASS.

- [ ] **Step 7: Task 8을 커밋한다**

  ```bash
  git add app/records app/api/matches/[id] components/matches lib/queries.ts tests
  git commit -m "feat: add match history corrections"
  ```

---

### Task 9: 개인·파트너 순위 화면

**Files:**
- Create: `app/rankings/page.tsx`, `components/rankings/RankingTabs.tsx`, `tests/components/RankingTabs.test.tsx`
- Modify: `lib/queries.ts`, `app/page.tsx`

**Interfaces:**
- Produces: `getPersonalRankings()`, `getPartnerRankings()`, 두 탭 UI
- Consumes: Task 3 뷰, Task 6 동명이인 표시, Task 8 쿼리

- [ ] **Step 1: 소표본 배지와 정렬 실패 테스트를 작성한다**

  ```tsx
  it('shows 경기 수 적음 for one or two games',async()=>{
    render(<RankingTabs personal={[]} partners={[{key:'1:2',names:'가 + 나',games:2,wins:2,losses:0,winRate:1,isSmallSample:true}]}/>);
    await user.click(screen.getByRole('tab',{name:'파트너 조합'}));
    expect(screen.getByText('경기 수 적음')).toBeVisible();
  });
  ```

- [ ] **Step 2: 순위 UI 테스트 실패를 확인한다**

  Run: `npm test -- tests/components/RankingTabs.test.tsx`

  Expected: FAIL because `RankingTabs` is missing.

- [ ] **Step 3: 순위 조회와 탭 UI를 구현한다**

  `getPersonalRankings`와 `getPartnerRankings`는 뷰의 반올림 전 `win_rate`를 숫자로 변환한 뒤 `sortRankingRows`를 적용한다. 화면은 승률을 소수점 첫째 자리 백분율로 보여주고 파트너 `games < 3`일 때만 배지를 렌더링한다.

- [ ] **Step 4: 오늘 대시보드 요약을 연결한다**

  `app/page.tsx`는 한국 날짜의 세션 경기 수, 최근 완료 경기 3개, 개인 상위 3명을 서버에서 병렬 조회한다.

- [ ] **Step 5: 순위 테스트를 통과시킨다**

  Run: `npm test -- tests/components/RankingTabs.test.tsx tests/unit/ranking.test.ts`

  Expected: all PASS.

- [ ] **Step 6: Task 9 관련 전체 테스트를 실행한다**

  Run: `npm test && npm run typecheck && npm run lint`

  Expected: all PASS.

- [ ] **Step 7: Task 9를 커밋한다**

  ```bash
  git add app/rankings app/page.tsx components/rankings lib/queries.ts tests/components/RankingTabs.test.tsx
  git commit -m "feat: add live ranking views"
  ```

---

### Task 10: private Broadcast와 refetch

**Files:**
- Create: `supabase/migrations/202608130005_realtime_broadcast.sql`, `supabase/tests/005_broadcast_test.sql`
- Create: `components/realtime/LiveRefresh.tsx`, `tests/components/LiveRefresh.test.tsx`
- Modify: `app/layout.tsx`

**Interfaces:**
- Produces: private topic `club:rankings`, trigger `broadcast_match_change()`, `<LiveRefresh queryKeys={string[][]}/>`
- Consumes: Task 2 browser client, Task 9 React Query keys

- [ ] **Step 1: Broadcast trigger 실패 DB 테스트를 작성한다**

  ```sql
  begin; select plan(2);
  select has_function('public','broadcast_match_change',array[]::text[]);
  select trigger_is('public','matches','matches_broadcast','public','broadcast_match_change');
  select * from finish(); rollback;
  ```

- [ ] **Step 2: Broadcast DB 테스트 실패를 확인한다**

  Run: `supabase test db`

  Expected: FAIL because trigger is missing.

- [ ] **Step 3: private Broadcast trigger와 권한을 구현한다**

  ```sql
  create function public.broadcast_match_change() returns trigger security definer language plpgsql set search_path=public,realtime as $$
  begin perform realtime.broadcast_changes('club:rankings',tg_op,tg_op,tg_table_name,tg_table_schema,new,old); return coalesce(new,old); end $$;
  create trigger matches_broadcast after insert or update or delete on public.matches for each row execute function public.broadcast_match_change();
  create trigger participants_broadcast after insert or update or delete on public.match_participants for each row execute function public.broadcast_match_change();
  create policy "public can receive club broadcasts" on realtime.messages for select to anon using (realtime.topic()='club:rankings');
  ```

- [ ] **Step 4: refetch 실패 컴포넌트 테스트를 작성한다**

  ```tsx
  it('invalidates rankings and records after broadcast',async()=>{
    render(<LiveRefresh queryKeys={[["personal-rankings"],["partner-rankings"],["matches"]]}/>);
    emitBroadcast('club:rankings');
    await waitFor(()=>expect(invalidateQueries).toHaveBeenCalledTimes(3));
  });
  ```

- [ ] **Step 5: 구독 후 refetch 컴포넌트를 구현한다**

  ```tsx
  export function LiveRefresh({queryKeys}:{queryKeys:string[][]}){
    const client=useQueryClient();
    useEffect(()=>{ const channel=browserSupabase().channel('club:rankings',{config:{private:true}})
      .on('broadcast',{event:'*'},()=>queryKeys.forEach(queryKey=>client.invalidateQueries({queryKey}))).subscribe();
      return()=>{void browserSupabase().removeChannel(channel)}; },[client,queryKeys]);
    return null;
  }
  ```

- [ ] **Step 6: Broadcast와 refetch 테스트를 통과시킨다**

  Run: `supabase db reset && supabase test db && npm test -- tests/components/LiveRefresh.test.tsx`

  Expected: all PASS; no `postgres_changes` subscription exists in source.

- [ ] **Step 7: Task 10 관련 전체 테스트를 실행한다**

  Run: `npm test && supabase test db`

  Expected: all tests PASS. Then run `rg "postgres_changes" app components lib`; expected exit code 1 with no matches.

- [ ] **Step 8: Task 10을 커밋한다**

  ```bash
  git add supabase/migrations/202608130005_realtime_broadcast.sql supabase/tests/005_broadcast_test.sql components/realtime app/layout.tsx tests/components/LiveRefresh.test.tsx
  git commit -m "feat: refresh views from private broadcasts"
  ```

---

### Task 11: Google Sheets outbox와 멱등 동기화

**Files:**
- Create: `supabase/functions/sync-google-sheet/index.ts`, `supabase/functions/sync-google-sheet/google.ts`, `supabase/functions/sync-google-sheet/types.ts`
- Create: `supabase/functions/sync-google-sheet/index.test.ts`, `supabase/migrations/202608130006_sync_claim.sql`, `supabase/tests/006_sync_claim_test.sql`
- Create: `app/api/sheet-sync/[matchId]/route.ts`, `tests/unit/sheet-retry-route.test.ts`

**Interfaces:**
- Produces: `claim_sheet_sync_jobs(integer)`, `complete_sheet_sync_job(uuid,integer,integer)`, `fail_sheet_sync_job(uuid,integer,text)`, `findMatchRow(...)`, `upsertMatchRow(...)`, `processJob(...)`, 수동 재시도 Route Handler
- Consumes: `sheet_sync_jobs`, Google Sheets API v4, 서버 전용 환경 변수

- [ ] **Step 1: 원자적 작업 claim 실패 테스트를 작성한다**

  ```sql
  begin; select plan(3);
  select has_function('public','claim_sheet_sync_jobs',array['integer']);
  select has_function('public','complete_sheet_sync_job',array['uuid','integer','integer']);
  select has_column('public','sheet_sync_jobs','match_version');
  select * from finish(); rollback;
  ```

- [ ] **Step 2: claim 테스트 실패를 확인한다**

  Run: `supabase test db`

  Expected: FAIL because function is missing.

- [ ] **Step 3: SKIP LOCKED claim 함수를 구현한다**

  ```sql
  create function public.claim_sheet_sync_jobs(p_limit integer default 10)
  returns setof public.sheet_sync_jobs language sql security definer set search_path=public as $$
    with claimed as (
      select id from sheet_sync_jobs where status in ('pending','failed') and next_attempt_at<=now()
      order by next_attempt_at for update skip locked limit p_limit
    ) update sheet_sync_jobs j set status='processing',updated_at=now() from claimed c where j.id=c.id returning j.*;
  $$;
  revoke all on function public.claim_sheet_sync_jobs(integer) from public;
  grant execute on function public.claim_sheet_sync_jobs(integer) to service_role;
  create function public.complete_sheet_sync_job(p_job_id uuid,p_claimed_version integer,p_sheet_row integer)
  returns boolean language plpgsql security definer set search_path=public as $$
  begin
    update sheet_sync_jobs set status='succeeded',sheet_row=p_sheet_row,last_error=null,updated_at=now()
      where id=p_job_id and match_version=p_claimed_version and status='processing';
    return found;
  end $$;
  create function public.fail_sheet_sync_job(p_job_id uuid,p_claimed_version integer,p_error text)
  returns boolean language plpgsql security definer set search_path=public as $$
  declare v_attempt integer;
  begin
    update sheet_sync_jobs set attempt_count=attempt_count+1,last_error=left(p_error,500),
      status=case when attempt_count+1>=4 then 'failed'::sync_status else 'pending'::sync_status end,
      next_attempt_at=now()+make_interval(secs=>(array[60,300,1800,7200])[least(attempt_count+1,4)]),updated_at=now()
      where id=p_job_id and match_version=p_claimed_version and status='processing' returning attempt_count into v_attempt;
    return found;
  end $$;
  grant execute on function public.complete_sheet_sync_job(uuid,integer,integer),public.fail_sheet_sync_job(uuid,integer,text) to service_role;
  ```

- [ ] **Step 4: 오래된 worker가 새 버전을 완료하지 못하는 DB 테스트를 작성한다**

  ```sql
  -- job version 1을 processing으로 claim한 뒤 경기 수정이 job version 2/pending을 기록한다.
  select is(public.complete_sheet_sync_job(:job_id,1,7),false,'stale worker cannot complete newer version');
  select results_eq('select match_version,status from sheet_sync_jobs where id='''||:job_id||'''','values (2,''pending''::sync_status)','newer work remains pending');
  ```

  Run: `supabase db reset && supabase test db`

  Expected: stale completion returns false and version 2 remains pending.

- [ ] **Step 5: `match_id` 선검색 실패 테스트를 작성한다**

  ```ts
  Deno.test('updates existing row instead of appending duplicate',async()=>{
    fakeSheets.searchResult={row:7,matchId:'m1'};
    await upsertMatchRow(fakeSheets,config,payload('m1'));
    assertEquals(fakeSheets.appendCalls,0); assertEquals(fakeSheets.updateCalls,[7]);
  });
  ```

- [ ] **Step 6: Sheets 테스트 실패를 확인한다**

  Run: `supabase functions serve sync-google-sheet --env-file supabase/.env.local` and `deno test supabase/functions/sync-google-sheet/index.test.ts`

  Expected: FAIL because `upsertMatchRow` is missing.

- [ ] **Step 7: 16개 고정 열 DTO와 선검색 upsert를 구현한다**

  ```ts
  export type SheetConfig={spreadsheetId:string;tabName:string};
  export type SheetsApi={
    find(range:string,value:string):Promise<{row:number}|null>;
    append(range:string,values:(string|number)[][]):Promise<{row:number}>;
    update(range:string,values:(string|number)[][]):Promise<{row:number}>;
  };
  export type SheetMatchRow={matchId:string;date:string;matchNo:number;playedAt:string;
    a1Code:string;a1Name:string;a2Code:string;a2Name:string;b1Code:string;b1Name:string;b2Code:string;b2Name:string;
    winnerTeam:'A'|'B';status:'완료'|'취소';updatedAt:string;syncedAt:string};
  export async function findMatchRow(api:SheetsApi,sheetId:string,tab:string,matchId:string){
    void sheetId; return api.find(`${tab}!A:A`,matchId);
  }
  export async function upsertMatchRow(api:SheetsApi,cfg:SheetConfig,row:SheetMatchRow){
    const existing=await findMatchRow(api,cfg.spreadsheetId,cfg.tabName,row.matchId);
    const values=[[row.matchId,row.date,row.matchNo,row.playedAt,row.a1Code,row.a1Name,row.a2Code,row.a2Name,row.b1Code,row.b1Name,row.b2Code,row.b2Name,row.winnerTeam,row.status,row.updatedAt,row.syncedAt]];
    return existing ? api.update(`${cfg.tabName}!A${existing.row}:P${existing.row}`,values) : api.append(`${cfg.tabName}!A:P`,values);
  }
  ```

- [ ] **Step 8: Google OAuth와 REST adapter를 구현한다**

  ```ts
  import { importPKCS8,SignJWT } from 'npm:jose@6.1.0';
  export async function getGoogleAccessToken(email:string,privateKey:string,now:number):Promise<string>{
    const key=await importPKCS8(privateKey.replace(/\\n/g,'\n'),'RS256');
    const assertion=await new SignJWT({scope:'https://www.googleapis.com/auth/spreadsheets'}).setProtectedHeader({alg:'RS256'})
      .setIssuer(email).setAudience('https://oauth2.googleapis.com/token').setIssuedAt(Math.floor(now/1000)).setExpirationTime(Math.floor(now/1000)+3600).sign(key);
    const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion})});
    if(!response.ok)throw new Error(`google oauth ${response.status}`); return (await response.json()).access_token;
  }
  export function createSheetsApi(token:string,spreadsheetId:string):SheetsApi {
    const base=`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`;
    const headers={authorization:`Bearer ${token}`,'content-type':'application/json'};
    return {
      async find(range,value){ const r=await fetch(`${base}/values/${encodeURIComponent(range)}`,{headers}); const rows=(await r.json()).values??[]; const index=rows.findIndex((x:string[])=>x[0]===value); return index<0?null:{row:index+1}; },
      async append(range,values){ const r=await fetch(`${base}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,{method:'POST',headers,body:JSON.stringify({values})}); if(!r.ok)throw new Error(`sheets append ${r.status}`); const json=await r.json(); return {row:Number(json.updates.updatedRange.match(/!(?:[A-Z]+)(\d+)/)[1])}; },
      async update(range,values){ const r=await fetch(`${base}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,{method:'PUT',headers,body:JSON.stringify({values})}); if(!r.ok)throw new Error(`sheets update ${r.status}`); return {row:Number(range.match(/\d+/)![0])}; }
    };
  }
  ```

- [ ] **Step 9: 작업 처리와 버전 CAS를 구현한다**

  ```ts
  export type ClaimedJob={id:string;match_id:string;match_version:number;operation:'upsert'|'cancel'};
  export async function loadSheetMatchRow(db:SupabaseClient,matchId:string,syncedAt:string):Promise<SheetMatchRow>{
    const {data,error}=await db.from('matches').select('id,match_no,winner_team,status,played_at,updated_at,sessions!inner(session_date),match_participants(team,seat,players!inner(member_code,display_name))').eq('id',matchId).single();
    if(error)throw error; const seats=Object.fromEntries(data.match_participants.map((p:any)=>[`${p.team}${p.seat}`,p.players]));
    return {matchId:data.id,date:data.sessions.session_date,matchNo:data.match_no,playedAt:data.played_at,
      a1Code:seats.A1.member_code,a1Name:seats.A1.display_name,a2Code:seats.A2.member_code,a2Name:seats.A2.display_name,
      b1Code:seats.B1.member_code,b1Name:seats.B1.display_name,b2Code:seats.B2.member_code,b2Name:seats.B2.display_name,
      winnerTeam:data.winner_team,status:data.status==='cancelled'?'취소':'완료',updatedAt:data.updated_at,syncedAt};
  }
  export async function processJob(db:SupabaseClient,api:SheetsApi,cfg:SheetConfig,job:ClaimedJob):Promise<void>{
    try {
      const row=await loadSheetMatchRow(db,job.match_id,new Date().toISOString());
      const result=await upsertMatchRow(api,cfg,row);
      const {data:completed,error}=await db.rpc('complete_sheet_sync_job',{p_job_id:job.id,p_claimed_version:job.match_version,p_sheet_row:result.row});
      if(error)throw error; if(!completed)return; // newer match_version is already pending; never overwrite it
    } catch(error) {
      await db.rpc('fail_sheet_sync_job',{p_job_id:job.id,p_claimed_version:job.match_version,p_error:String(error)});
    }
  }
  ```

- [ ] **Step 10: Webhook 인증을 검증하는 Edge Function entry를 구현한다**

  ```ts
  Deno.serve(async request=>{
    if(request.headers.get('authorization')!==`Bearer ${Deno.env.get('SHEET_SYNC_WEBHOOK_SECRET')}`) return new Response('unauthorized',{status:401});
    const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const {data:jobs,error}=await db.rpc('claim_sheet_sync_jobs',{p_limit:10}); if(error)throw error;
    const token=await getGoogleAccessToken(Deno.env.get('GOOGLE_SERVICE_ACCOUNT_EMAIL')!,Deno.env.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY')!,Date.now());
    const api=createSheetsApi(token,Deno.env.get('GOOGLE_SHEETS_SPREADSHEET_ID')!);
    await Promise.all(jobs.map((job:ClaimedJob)=>processJob(db,api,{spreadsheetId:Deno.env.get('GOOGLE_SHEETS_SPREADSHEET_ID')!,tabName:Deno.env.get('GOOGLE_SHEETS_TAB_NAME')!},job)));
    return Response.json({claimed:jobs.length});
  });
  ```

- [ ] **Step 11: Database Webhook과 1분 cron 호출을 구성한다**

  ```sql
  -- migration은 URL과 bearer secret을 Supabase Vault에서만 읽는다.
  create extension if not exists pg_net with schema extensions;
  create extension if not exists pg_cron with schema pg_catalog;
  create function public.wake_sheet_sync() returns trigger language plpgsql security definer set search_path=public,net,vault as $$
  declare v_url text; v_secret text;
  begin
    select decrypted_secret into v_url from vault.decrypted_secrets where name='sheet-sync-url';
    select decrypted_secret into v_secret from vault.decrypted_secrets where name='sheet-sync-webhook-secret';
    perform net.http_post(url=>v_url,headers=>jsonb_build_object('Authorization','Bearer '||v_secret,'Content-Type','application/json'),body=>jsonb_build_object('jobId',new.id));
    return new;
  end $$;
  create trigger sheet_sync_webhook after insert or update of status on public.sheet_sync_jobs
    for each row when (new.status='pending') execute function public.wake_sheet_sync();
  select cron.schedule('sheet-sync-recovery','* * * * *',$$select net.http_post(
    url=>(select decrypted_secret from vault.decrypted_secrets where name='sheet-sync-url'),
    headers=>jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='sheet-sync-webhook-secret')),
    body=>'{}'::jsonb)$$);
  ```

  Deploy:

  ```bash
  supabase secrets set SHEET_SYNC_WEBHOOK_SECRET="$SHEET_SYNC_WEBHOOK_SECRET" GOOGLE_SHEETS_SPREADSHEET_ID="$GOOGLE_SHEETS_SPREADSHEET_ID" GOOGLE_SHEETS_TAB_NAME="$GOOGLE_SHEETS_TAB_NAME" GOOGLE_SERVICE_ACCOUNT_EMAIL="$GOOGLE_SERVICE_ACCOUNT_EMAIL" GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="$GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY"
  supabase functions deploy sync-google-sheet --no-verify-jwt
  ```

  운영 migration 전에 `sheet-sync-url`과 `sheet-sync-webhook-secret`을 Vault에 생성한다. webhook 전달 실패를 모의한 테스트는 job이 `pending`으로 남고 다음 1분 cron 호출에서 claim되어 성공하는지 검증한다.

- [ ] **Step 12: 운영자 수동 재시도 Route Handler를 구현한다**

  ```ts
  export async function POST(request:Request,{params}:{params:Promise<{matchId:string}>}){
    await requireOperator(request); const {matchId}=await params;
    const {data:match}=await admin().from('matches').select('match_version').eq('id',matchId).single();
    if(!match)return Response.json({code:'MATCH_NOT_FOUND'},{status:404});
    const {data,error}=await admin().from('sheet_sync_jobs').update({match_version:match.match_version,status:'pending',attempt_count:0,next_attempt_at:new Date().toISOString(),last_error:null}).eq('match_id',matchId).select('id').maybeSingle();
    if(error)throw error; return data?Response.json({ok:true}):Response.json({code:'SYNC_JOB_NOT_FOUND'},{status:404});
  }
  ```

- [ ] **Step 13: Sheets, CAS, webhook 복구 테스트를 통과시킨다**

  Run: `supabase db reset && supabase test db && deno test supabase/functions/sync-google-sheet/index.test.ts && npm test -- tests/unit/sheet-retry-route.test.ts`

  Expected: all PASS; existing `match_id` is updated without append.

- [ ] **Step 14: Task 11 관련 전체 테스트를 실행한다**

  Run: `npm test && supabase test db && deno test supabase/functions/sync-google-sheet`

  Expected: all PASS.

- [ ] **Step 15: Task 11을 커밋한다**

  ```bash
  git add supabase/functions supabase/migrations/202608130006_sync_claim.sql supabase/tests/006_sync_claim_test.sql app/api/sheet-sync tests/unit/sheet-retry-route.test.ts
  git commit -m "feat: sync matches to google sheets"
  ```

---

### Task 12: 통합 E2E, 접근성, PWA와 디자인 QA

**Files:**
- Create: `tests/e2e/match-flow.spec.ts`, `tests/e2e/ranking-flow.spec.ts`, `tests/e2e/accessibility.spec.ts`, `tests/e2e/pwa.spec.ts`
- Create: `scripts/verify-design-reference.mjs`
- Modify: `playwright.config.ts`, `app/globals.css`, 관련 화면 컴포넌트

**Interfaces:**
- Produces: 모바일 Chromium 전체 흐름 검증, axe 접근성 검증, 선택 시안 대비 디자인 QA 기록
- Consumes: Tasks 1-11 전체 기능

- [ ] **Step 1: 모바일 경기 흐름 실패 E2E를 작성한다**

  ```ts
  test('records a match and updates both rankings',async({page})=>{
    await page.goto('/matches/new');
    await selectFourPlayers(page,['김재민','김민재','재민김','민재김']);
    await page.getByRole('button',{name:'A팀 승리'}).click();
    await page.getByRole('button',{name:'경기 기록'}).click();
    await expect(page.getByTestId('team-A').filter({hasText:'승'})).toBeVisible();
    await page.goto('/rankings');
    await expect(page.getByRole('row',{name:/김재민.*1.*1.*0.*100.0%/})).toBeVisible();
    await page.getByRole('tab',{name:'파트너 조합'}).click();
    await expect(page.getByText('경기 수 적음')).toBeVisible();
  });
  ```

- [ ] **Step 2: E2E가 실패하는지 확인한다**

  Run: `npm run test:e2e -- tests/e2e/match-flow.spec.ts`

  Expected: FAIL at the first UI mismatch or unseeded operator session.

- [ ] **Step 3: Playwright fixture와 seed를 연결한다**

  테스트 전 `supabase db reset`, 운영 쿠키 발급, 고정 UUID 선수 seed를 수행하고 Pixel 7 크기 `412x915`를 기본 프로젝트로 설정한다.

- [ ] **Step 4: 수정·취소와 버전 충돌 E2E를 작성한다**

  두 페이지가 같은 경기를 열고 첫 페이지가 수정한 뒤 두 번째 페이지가 저장하면 `다른 기기에서 변경된 경기입니다`를 표시하는지, 취소 후 개인·조합 통계가 원복되는지 검증한다.

- [ ] **Step 5: axe와 PWA 실패 테스트를 작성한다**

  ```ts
  test('rankings has no serious axe violations',async({page})=>{
    await page.goto('/rankings'); const results=await new AxeBuilder({page}).analyze();
    expect(results.violations.filter(v=>['serious','critical'].includes(v.impact??''))).toEqual([]);
  });
  ```

  manifest 응답 200, `display=standalone`, 44px 터치 영역, 키보드 탭 순서도 검증한다.

- [ ] **Step 6: Product Design 디자인 QA를 수행한다**

  실행 중 모바일 화면을 캡처하고 Product Design 디자인 QA로 `docs/design/references/selected-ui.png`와 비교한다. 승리팀 둥근 테두리와 왼쪽 위 `승` 배지, 초록 코트 배경, 흰 입체 카드, 하단 내비게이션의 차이를 수정한다.

- [ ] **Step 7: 전체 E2E와 접근성 테스트를 통과시킨다**

  Run: `npm run test:e2e`

  Expected: all Chromium mobile, accessibility, PWA tests PASS.

- [ ] **Step 8: Task 12 관련 전체 검증을 실행한다**

  Run: `npm test && npm run typecheck && npm run lint && npm run build && npm run test:e2e && supabase test db`

  Expected: all PASS.

- [ ] **Step 9: Task 12를 커밋한다**

  ```bash
  git add tests/e2e scripts/verify-design-reference.mjs playwright.config.ts app components
  git commit -m "test: verify mobile match experience"
  ```

---

### Task 13: 배포 준비와 운영 검증

**Files:**
- Create: `docs/operations/deployment.md`, `docs/operations/google-sheets.md`, `docs/operations/recovery.md`
- Create: `scripts/check-production-config.mjs`, `tests/unit/production-config.test.ts`
- Modify: `README.md`, `.env.example`

**Interfaces:**
- Produces: `checkProductionConfig(env):string[]`, 배포·시트 공유·장애 복구 절차
- Consumes: Tasks 1-12 환경 변수와 테스트 명령

- [ ] **Step 1: 프로덕션 설정 실패 테스트를 작성한다**

  ```ts
  it('rejects newline-escaped service account key mistakes',()=>{
    expect(checkProductionConfig({...valid,GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY:'plain-key'}))
      .toContain('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY must contain a PEM header');
  });
  ```

- [ ] **Step 2: 설정 테스트 실패를 확인한다**

  Run: `npm test -- tests/unit/production-config.test.ts`

  Expected: FAIL because `checkProductionConfig` is missing.

- [ ] **Step 3: 배포 전 설정 검증을 구현한다**

  ```js
  export function checkProductionConfig(env){
    const errors=[];
    if(!env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g,'\n').includes('BEGIN PRIVATE KEY')) errors.push('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY must contain a PEM header');
    if(env.OPERATOR_COOKIE_SECRET?.length<32) errors.push('OPERATOR_COOKIE_SECRET must be at least 32 characters');
    if(env.OPERATOR_IP_HASH_SECRET?.length<32) errors.push('OPERATOR_IP_HASH_SECRET must be at least 32 characters');
    if(env.SHEET_SYNC_WEBHOOK_SECRET?.length<32) errors.push('SHEET_SYNC_WEBHOOK_SECRET must be at least 32 characters');
    if(!/^https:\/\//.test(env.NEXT_PUBLIC_SUPABASE_URL??'')) errors.push('NEXT_PUBLIC_SUPABASE_URL must use HTTPS');
    return errors;
  }
  ```

- [ ] **Step 4: Google Sheet 운영 문서를 작성한다**

  `경기기록` 탭 A:P 16개 열을 `match_id, 날짜, 경기번호, 경기시각, A팀1_회원번호, A팀1_이름, A팀2_회원번호, A팀2_이름, B팀1_회원번호, B팀1_이름, B팀2_회원번호, B팀2_이름, 승리팀, 상태, 최종수정시각, 동기화시각`으로 고정하고, 서비스 계정 이메일에 편집 권한을 부여하는 절차를 기록한다.

- [ ] **Step 5: 배포와 복구 문서를 작성한다**

  Supabase migration/Edge Function 배포, 호스팅 환경 변수, smoke test, outbox `failed` 조회·수동 재시도, 시트 행 복구, DB 백업 복원 순서를 정확한 명령과 함께 기록한다.

- [ ] **Step 6: 설정 테스트를 통과시킨다**

  Run: `npm test -- tests/unit/production-config.test.ts`

  Expected: all PASS.

- [ ] **Step 7: 최종 전체 검증을 실행한다**

  Run: `npm test && npm run typecheck && npm run lint && npm run build && npm run test:e2e && supabase test db && deno test supabase/functions/sync-google-sheet`

  Expected: all PASS with no skipped tests.

- [ ] **Step 8: 비밀 하드코딩과 금지된 Realtime 사용을 검사한다**

  Run: `rg "service_role|BEGIN PRIVATE KEY|postgres_changes|1fAWC-CTIYou8EGoje264POUbs3WrCGLoi_p65-WbF2s" app components lib supabase --glob '!*.test.*'`

  Expected: no service-role key/private key/sheet ID literal and no `postgres_changes`; allowed identifier names only.

- [ ] **Step 9: Task 13을 커밋한다**

  ```bash
  git add README.md .env.example docs/operations scripts/check-production-config.mjs tests/unit/production-config.test.ts
  git commit -m "docs: add badminton app operations guide"
  ```

---

## 실행 종료 조건

Task 13의 최종 검증이 모두 통과하기 전에는 구현 완료로 보고하지 않는다. 이 계획은 Sol 모델이 작성한 설계 단계의 마지막 산출물이다. 실제 Task 1 구현을 시작하기 전에 작업을 멈추고 사용자에게 Luna 모델로 전환해 달라고 요청한다.
