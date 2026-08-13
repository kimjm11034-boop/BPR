'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, CheckCircle2, ChevronRight, ClipboardList, CloudUpload, Home, Pencil, Plus, RotateCcw, Settings, Trash2, Trophy, UserPlus, WifiOff } from 'lucide-react';
import type { Session } from '@supabase/supabase-js';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { DEMO_PLAYERS, type Match, type Player, personalRankings, partnerRankings } from '@/lib/demo-data';
import { cancelLocalMatch, loadLocalStore, LOCAL_SCHEMA_VERSION, saveLocalStore, type LocalStoreState } from '@/lib/domain/local-store';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { readAuthCallback } from '@/lib/supabase/deep-link';
import { cancelCloudMatch, readCloudState, recordCloudMatch, registerCloudPlayer, setCloudPlayerActive, syncLocalSnapshot } from '@/lib/supabase/sync';

type View = 'home' | 'input' | 'records' | 'rankings' | 'settings';
type SyncState = 'idle' | 'waiting' | 'syncing' | 'success' | 'error';

const fmtRate = (value: number) => `${Math.round(value * 1000) / 10}%`;
const localDateInput = () => {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
};
const formatSessionTitle = (date: string) => {
  const [, month, day] = date.split('-');
  return month && day ? `${Number(month)}월 ${Number(day)}일 경기` : '오늘 경기';
};
const supabase = createSupabaseBrowserClient();
const isNative = Capacitor.isNativePlatform();

export default function HomePage() {
  const [view, setView] = useState<View>('home');
  const [sessionDate, setSessionDate] = useState(localDateInput);
  const [calendarDate, setCalendarDate] = useState(localDateInput);
  const [hydrated, setHydrated] = useState(false);
  const [players, setPlayers] = useState<Player[]>(DEMO_PLAYERS);
  const [inactivePlayerIds, setInactivePlayerIds] = useState<string[]>([]);
  const [cancelledMatchIds, setCancelledMatchIds] = useState<string[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [newPlayerName, setNewPlayerName] = useState('');
  const [matches, setMatches] = useState<Match[]>([]);
  const [todayMatches, setTodayMatches] = useState<Match[]>([]);
  const [selected, setSelected] = useState<[string, string, string, string]>(['', '', '', '']);
  const [winner, setWinner] = useState<'A' | 'B'>('A');
  const [rankingTab, setRankingTab] = useState<'personal' | 'partner'>('personal');
  const [authReady, setAuthReady] = useState(!supabase || isNative);
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [syncError, setSyncError] = useState('');
  const [authError, setAuthError] = useState('');
  const [syncEmail, setSyncEmail] = useState('');
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const [lastSyncAt, setLastSyncAt] = useState('');
  const pendingSyncRef = useRef(false);
  const localSnapshotRef = useRef<LocalStoreState>({ schemaVersion: LOCAL_SCHEMA_VERSION, deviceId: '', players: DEMO_PLAYERS, inactivePlayerIds: [], matches: [], todayMatches: [], cancelledMatchIds: [], updatedAt: new Date().toISOString() });
  localSnapshotRef.current = { schemaVersion: LOCAL_SCHEMA_VERSION, deviceId, players, inactivePlayerIds, matches, todayMatches, cancelledMatchIds, updatedAt: new Date().toISOString() };
  const rankings = useMemo(() => personalRankings(players, matches), [matches, players]);
  const partners = useMemo(() => partnerRankings(players, matches), [matches, players]);
  const sessionTitle = formatSessionTitle(sessionDate);
  const runManualSync = async (session: Session) => {
    if (!supabase) return;
    setSyncState('syncing');
    setSyncError('');
    const hasStoredSnapshot = window.localStorage.getItem('bpr-local-store') !== null || window.localStorage.getItem('badminton-matchbook-players') !== null;
    const storedSnapshot = loadLocalStore(window.localStorage, localDateInput());
    const result = await syncLocalSnapshot(supabase, hasStoredSnapshot ? storedSnapshot : localSnapshotRef.current);
    setAuthSession(session);
    pendingSyncRef.current = false;
    window.localStorage.removeItem('bpr-pending-sync');
    if (result.failed.length) {
      setSyncState('error');
      setSyncError(`${result.failed.length}개 항목을 동기화하지 못했어요. 설정에서 다시 시도해 주세요.`);
      return;
    }
    const syncedAt = new Date().toISOString();
    window.localStorage.setItem('bpr-last-sync-at', syncedAt);
    setLastSyncAt(syncedAt);
    setSyncState('success');
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const date = localDateInput();
      const stored = loadLocalStore(window.localStorage, date);
      const hasStoredRoster = window.localStorage.getItem('bpr-local-store') !== null || window.localStorage.getItem('badminton-matchbook-players') !== null;
      setDeviceId(stored.deviceId);
      setMatches(stored.matches);
      setPlayers(hasStoredRoster ? stored.players : DEMO_PLAYERS);
      setInactivePlayerIds(stored.inactivePlayerIds);
      setCancelledMatchIds(stored.cancelledMatchIds);
      setTodayMatches(stored.todayMatches.length ? stored.todayMatches : stored.matches.filter((match) => match.playedAt.slice(0, 10) === date));
      setLastSyncAt(window.localStorage.getItem('bpr-last-sync-at') ?? '');
      pendingSyncRef.current = isNative && window.localStorage.getItem('bpr-pending-sync') === '1';
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const hydrateCloud = async (session: Session | null) => {
      if (!active) return;
      setAuthSession(session);
      if (session && !isNative && !pendingSyncRef.current) {
        const cloud = await readCloudState(supabase);
        if (active && cloud) {
          setPlayers(cloud.players);
          setMatches(cloud.matches);
          setTodayMatches(cloud.matches.filter((match) => match.playedAt.slice(0, 10) === localDateInput()));
        }
      }
      if (active) setAuthReady(true);
    };
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (isNative && session && pendingSyncRef.current) void runManualSync(session);
      else void hydrateCloud(session);
    });
    if (!isNative) supabase.auth.getSession().then(({ data }) => hydrateCloud(data.session));
    const handleDeepLink = async (url: string | null | undefined) => {
      if (!isNative) return;
      const callback = readAuthCallback(url);
      if (!callback.code && !(callback.accessToken && callback.refreshToken)) return;
      try {
        const result = callback.code
          ? await supabase.auth.exchangeCodeForSession(callback.code)
          : await supabase.auth.setSession({ access_token: callback.accessToken!, refresh_token: callback.refreshToken! });
        if (result.error) throw result.error;
        if (result.data.session && pendingSyncRef.current) await runManualSync(result.data.session);
      } catch {
        pendingSyncRef.current = false;
        window.localStorage.removeItem('bpr-pending-sync');
        setSyncState('error');
        setSyncError('로그인 링크를 처리하지 못했어요. 설정에서 새 동기화를 시작해 주세요.');
      }
    };
    if (isNative) {
      void CapacitorApp.getLaunchUrl().then((launch) => handleDeepLink(launch?.url));
    }
    const deepLink = isNative ? CapacitorApp.addListener('appUrlOpen', ({ url }) => { void handleDeepLink(url); }) : null;
    return () => { active = false; listener.subscription.unsubscribe(); if (deepLink) void deepLink.then((handle) => handle.remove()); };
  }, []);

  useEffect(() => {
    if (!supabase || !authSession || isNative) return;
    const refresh = async () => {
      const cloud = await readCloudState(supabase);
      if (!cloud) return;
      setPlayers(cloud.players);
      setMatches(cloud.matches);
      setTodayMatches(cloud.matches.filter((match) => match.playedAt.slice(0, 10) === sessionDate));
    };
    const channel = supabase.channel('bpr-live-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'players' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => { void refresh(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_participants' }, () => { void refresh(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [authSession, sessionDate]);

  useEffect(() => {
    if (!hydrated) return;
    saveLocalStore(window.localStorage, localSnapshotRef.current);
  }, [hydrated, players, inactivePlayerIds, matches, todayMatches, cancelledMatchIds, deviceId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const actualDate = localDateInput();
      if (actualDate === calendarDate) return;
      if (sessionDate === calendarDate) {
        setSessionDate(actualDate);
        setTodayMatches([]);
        window.localStorage.setItem('badminton-matchbook-today', JSON.stringify({ date: actualDate, matches: [] }));
      }
      setCalendarDate(actualDate);
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [calendarDate, sessionDate]);

  const selectPlayer = (index: number, id: string) => {
    setSelected((previous) => {
      const next = [...previous] as typeof previous;
      next[index] = id;
      return next;
    });
  };

  const addMatch = async () => {
    if (selected.some((id) => !id) || new Set(selected).size !== 4) return;
    const player = (id: string) => players.find((item) => item.id === id)!;
    const match: Match = { id: crypto.randomUUID(), playedAt: `${sessionDate}T${new Date().toISOString().slice(11)}`, teamA: [player(selected[0]), player(selected[1])], teamB: [player(selected[2]), player(selected[3])], winner };
    if (!isNative && supabase && authSession && !(await recordCloudMatch(supabase, match, todayMatches.length + 1))) { setSyncError('클라우드 저장에 실패했어요. 잠시 후 다시 시도해 주세요.'); return; }
    setSyncError('');
    setMatches((previous) => [...previous, match]);
    setTodayMatches((previous) => [...previous, match]);
    window.localStorage.setItem('badminton-matchbook-today', JSON.stringify({ date: sessionDate, matches: [...todayMatches, match] }));
    setSelected(['', '', '', '']);
    setView('input');
  };

  const openMatchInput = () => {
    if (!sessionDate) return;
    const nextTodayMatches = loadLocalStore(window.localStorage, sessionDate).todayMatches;
    setTodayMatches(nextTodayMatches);
    setSelected(['', '', '', '']);
    window.localStorage.setItem('badminton-matchbook-session', JSON.stringify({ date: sessionDate, players }));
    setView('input');
  };

  const resetToday = () => {
    setTodayMatches([]);
    window.localStorage.setItem('badminton-matchbook-today', JSON.stringify({ date: sessionDate, matches: [] }));
  };

  const removeMatch = async (match: Match) => {
    if (!window.confirm('이 경기 기록을 삭제할까요? 삭제하면 누적 순위와 파트너 전적에서도 제외됩니다.')) return;
    if (!isNative && supabase && authSession && !(await cancelCloudMatch(supabase, match.id))) {
      setSyncError('경기 기록 삭제에 실패했어요. 잠시 후 다시 시도해 주세요.');
      return;
    }
    const next = cancelLocalMatch(localSnapshotRef.current, match.id);
    setMatches(next.matches);
    setTodayMatches(next.todayMatches);
    setCancelledMatchIds(next.cancelledMatchIds);
    setSyncError('');
  };

  const addPlayer = async () => {
    const displayName = newPlayerName.trim();
    if (!displayName) return;
    const player = { id: crypto.randomUUID(), displayName };
    if (!isNative && supabase && authSession && !(await registerCloudPlayer(supabase, player))) { setSyncError('클라우드 저장에 실패했어요. 잠시 후 다시 시도해 주세요.'); return; }
    setSyncError('');
    setPlayers((current) => [...current, player]);
    setNewPlayerName('');
  };

  const removePlayer = async (id: string) => {
    if (!isNative && supabase && authSession && !(await setCloudPlayerActive(supabase, id, false))) { setSyncError('클라우드 저장에 실패했어요. 잠시 후 다시 시도해 주세요.'); return; }
    setSyncError('');
    setPlayers((current) => current.filter((player) => player.id !== id));
    setInactivePlayerIds((current) => [...new Set([...current, id])]);
    setSelected((current) => current.map((selectedId) => selectedId === id ? '' : selectedId) as typeof current);
  };

  const startManualSync = async () => {
    if (!supabase) return;
    setSyncError('');
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      await runManualSync(data.session);
      return;
    }
    if (!isNative) return;
    const email = syncEmail.trim();
    if (!email) {
      setSyncState('error');
      setSyncError('컴퓨터에서 사용할 이메일을 입력해 주세요.');
      return;
    }
    pendingSyncRef.current = true;
    window.localStorage.setItem('bpr-pending-sync', '1');
    setSyncState('waiting');
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: 'bpr://auth-callback' } });
    if (error) {
      pendingSyncRef.current = false;
      window.localStorage.removeItem('bpr-pending-sync');
      setSyncState('error');
      setSyncError(error.message);
    }
  };

  const startNewMatch = () => {
    setSelected(['', '', '', '']);
    setWinner('A');
    setView('input');
  };

  const sectionTitle = view === 'home' ? '경기 준비' : view === 'input' ? sessionTitle : view === 'records' ? '전체 경기 기록' : view === 'rankings' ? '전체 누적 순위' : '설정';

  if (!isNative && supabase && !authReady) return <AuthLoading />;
  if (!isNative && supabase && !authSession) return <AuthGate authError={authError} />;

  return (
    <main className="app-shell">
      <div className="court-wash" />
      <div className="app-content">
        <header className="topbar">
          <div>
            <p className="eyebrow">BPR · LIVE</p>
            <h1>{sectionTitle}</h1>
          </div>
          <div className="topbar-actions">
            {!isNative && authSession && <button className="auth-user-pill" type="button" onClick={() => { void supabase?.auth.signOut(); }}>{authSession.user.email} · 로그아웃</button>}
            {isNative && <button className="settings-top-button" type="button" onClick={() => setView('settings')} aria-label="설정"><Settings size={17} /></button>}
            <span className="live-pill"><span /> 실시간</span>
          </div>
        </header>
        {syncError && <p className="sync-error" role="alert">{syncError}</p>}

        {view === 'home' && (
          <section className="surface setup-card">
            <div className="setup-intro">
              <span className="section-kicker">SETUP</span>
              <h2>오늘 경기를 시작해요</h2>
              <p>경기 일자와 오늘 참여할 선수 명단을 먼저 입력하세요.</p>
            </div>
            <label className="form-label" htmlFor="session-date"><span><CalendarDays size={15} /> 경기 일자</span><input id="session-date" type="date" value={sessionDate} onChange={(event) => setSessionDate(event.target.value)} onInput={(event) => setSessionDate(event.currentTarget.value)} /></label>
            <div className="register-player-row"><label className="form-label" htmlFor="new-player"><span><UserPlus size={15} /> 선수 등록</span><input id="new-player" placeholder="이름 입력" value={newPlayerName} onChange={(event) => setNewPlayerName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') addPlayer(); }} /></label><button className="register-button" type="button" onClick={addPlayer}><Plus size={18} /> 등록</button></div>
            <div className="roster-heading"><div><span className="form-label-text">등록된 선수</span><small>경기 입력과 순위표에 반영되는 선수</small></div><span className="roster-count">{players.length}명</span></div>
            <RegisteredPlayerList rows={rankings} fmtRate={fmtRate} onRemove={removePlayer} />
            <p className="setup-note">선수를 삭제해도 기존 경기 기록과 누적 전적은 삭제되지 않아요. 명단 확인 후 아래 `경기입력` 메뉴에서 바로 시작할 수 있어요.</p>
          </section>
        )}

        {view === 'input' && (
          <>
            <button className="hero-cta" onClick={startNewMatch}>
              <span className="hero-icon"><Plus size={26} /></span>
              <span><small>오늘 경기</small><strong>새 경기 시작</strong></span>
              <ChevronRight className="hero-arrow" size={27} />
            </button>
            <section className="surface current-card">
              <div className="section-heading"><div><span className="section-kicker">INPUT</span><h2>현재 경기</h2></div><span className="match-state">복식 2 : 2</span></div>
              <div className="teams-grid">
                <TeamPicker label="A팀" players={players} values={selected.slice(0, 2)} indexOffset={0} selected={selected} onChange={selectPlayer} />
                <div className="versus">VS</div>
                <TeamPicker label="B팀" players={players} values={selected.slice(2, 4)} indexOffset={2} selected={selected} onChange={selectPlayer} />
              </div>
              <div className="winner-divider"><span>승리팀 선택</span></div>
              <div className="winner-actions">
                <button className={winner === 'A' ? 'winner-button active' : 'winner-button'} onClick={() => setWinner('A')}><Trophy size={18} /> A팀 승리</button>
                <button className={winner === 'B' ? 'winner-button active' : 'winner-button'} onClick={() => setWinner('B')}><Trophy size={18} /> B팀 승리</button>
              </div>
              <button className="primary-button" disabled={selected.some((id) => !id) || new Set(selected).size !== 4} onClick={addMatch}>경기 기록 저장</button>
            </section>
          </>
        )}

        {view === 'settings' && (
          <section className="surface settings-panel">
            <div className="setup-intro">
              <span className="section-kicker">DEVICE</span>
              <h2>기기에서 바로 기록해요</h2>
              <p>경기 기록은 먼저 이 핸드폰에 저장됩니다. 컴퓨터에서 확인할 때만 동기화하세요.</p>
            </div>
            <div className="offline-status"><WifiOff size={17} /><div><strong>기기 저장 모드</strong><small>경기 입력 중에는 인터넷과 이메일을 사용하지 않아요.</small></div></div>
            <div className="settings-sync-card">
              <div><span className="section-kicker">SYNC</span><h3>컴퓨터로 기록 보내기</h3><p>{lastSyncAt ? `마지막 동기화: ${new Date(lastSyncAt).toLocaleString('ko-KR')}` : '아직 동기화하지 않았어요.'}</p></div>
              <CloudUpload size={25} />
            </div>
            {syncState === 'waiting' && <p className="auth-success">메일을 확인한 뒤 링크를 누르면 기록 전송이 계속됩니다.</p>}
            {syncState === 'success' && <p className="auth-success"><CheckCircle2 size={16} /> 기록을 컴퓨터로 보냈어요.</p>}
            {isNative && !authSession && <label className="form-label" htmlFor="sync-email"><span>컴퓨터에서 사용할 이메일</span><input id="sync-email" type="email" placeholder="name@example.com" value={syncEmail} onChange={(event) => setSyncEmail(event.target.value)} /></label>}
            <button className="primary-button" type="button" onClick={() => void startManualSync()} disabled={syncState === 'syncing'}><CloudUpload size={18} /> {syncState === 'syncing' ? '기록을 보내는 중...' : '컴퓨터로 기록 보내기'}</button>
            <p className="settings-note">동기화에 실패해도 핸드폰의 기록은 삭제되지 않습니다. 네트워크가 연결된 뒤 다시 시도할 수 있어요.</p>
          </section>
        )}

        {view === 'records' && <Records matches={matches} onDelete={removeMatch} emptyText="아직 누적된 경기가 없습니다." />}
        {view === 'rankings' && (
          <section className="surface ranking-panel">
            <div className="segmented"><button className={rankingTab === 'personal' ? 'selected' : ''} onClick={() => setRankingTab('personal')}>개인 순위</button><button className={rankingTab === 'partner' ? 'selected' : ''} onClick={() => setRankingTab('partner')}>파트너 조합</button></div>
            {rankingTab === 'personal' ? <PersonalTable rows={rankings} fmtRate={fmtRate} /> : <PartnerTable rows={partners} fmtRate={fmtRate} />}
          </section>
        )}

        {view === 'input' && <section className="surface today-panel"><div className="section-heading"><div><span className="section-kicker">RECENT</span><h2>오늘 경기 기록</h2></div><div className="today-actions"><span className="count-pill">{todayMatches.length} 경기</span><button className="reset-button" type="button" onClick={resetToday} disabled={!todayMatches.length}><RotateCcw size={14} /> 초기화</button></div></div><Records matches={todayMatches} compact emptyText="아직 오늘 기록이 없습니다." /><p className="record-note">초기화해도 전체 기록과 순위표의 누적 기록은 유지돼요.</p></section>}
      </div>

      <nav className="bottom-nav">
        <NavButton label="홈" icon={<Home size={21} />} active={view === 'home'} onClick={() => setView('home')} />
        <NavButton label="경기입력" icon={<Pencil size={21} />} active={view === 'input'} onClick={openMatchInput} />
        <NavButton label="전체기록" icon={<ClipboardList size={21} />} active={view === 'records'} onClick={() => setView('records')} />
        <NavButton label="순위표" icon={<Trophy size={21} />} active={view === 'rankings'} onClick={() => setView('rankings')} />
        <NavButton label="설정" icon={<Settings size={21} />} active={view === 'settings'} onClick={() => setView('settings')} />
      </nav>
    </main>
  );
}

function AuthLoading() {
  return <main className="auth-shell"><section className="surface auth-card"><span className="section-kicker">BPR · SECURE</span><h1>연결 중이에요</h1><p>Supabase 계정을 확인하고 있습니다.</p></section></main>;
}

function AuthGate({ authError = '' }: { authError?: string }) {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const sendMagicLink = async () => {
    const address = email.trim();
    if (!address || !supabase) return;
    setError('');
    const redirectTo = Capacitor.isNativePlatform() ? 'bpr://auth-callback' : window.location.origin;
    const { error: authError } = await supabase.auth.signInWithOtp({ email: address, options: { emailRedirectTo: redirectTo } });
    if (authError) setError(authError.message);
    else setSent(true);
  };
  return <main className="auth-shell"><section className="surface auth-card"><span className="section-kicker">BPR · SECURE</span><h1>운영자 로그인</h1><p>경기 기록을 여러 기기에서 안전하게 공유하려면 이메일 로그인이 필요해요.</p>{authError && <p className="sync-error" role="alert">{authError}</p>}{sent ? <div className="auth-success">메일을 확인해 로그인 링크를 눌러 주세요.</div> : <><label className="form-label" htmlFor="operator-email"><span>운영자 이메일</span><input id="operator-email" type="email" placeholder="name@example.com" value={email} onChange={(event) => setEmail(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void sendMagicLink(); }} /></label><button className="primary-button" type="button" disabled={!email.trim()} onClick={() => void sendMagicLink()}>로그인 링크 보내기</button></>}{error && <p className="sync-error" role="alert">{error}</p>}</section></main>;
}

function TeamPicker({ label, players, values, indexOffset, selected, onChange }: { label: string; players: Player[]; values: string[]; indexOffset: number; selected: string[]; onChange: (index: number, id: string) => void }) {
  return <div className="team-picker"><div className="team-label">{label}</div>{values.map((value, index) => <select key={`${label}-${index}`} aria-label={`${label} 선수 ${index + 1}`} value={value} onChange={(event) => onChange(indexOffset + index, event.target.value)}><option value="">선수 선택</option>{players.filter((player) => !selected.includes(player.id) || player.id === value).map((player) => <option key={player.id} value={player.id}>{playerLabel(player, players)}</option>)}</select>)}</div>;
}

function playerLabel(player: Player, players: Player[]) {
  const duplicate = players.some((candidate) => candidate.id !== player.id && candidate.displayName === player.displayName);
  const position = players.findIndex((candidate) => candidate.id === player.id) + 1;
  return duplicate ? `${player.displayName} · P${String(position).padStart(2, '0')}` : player.displayName;
}

function RegisteredPlayerList({ rows, fmtRate, onRemove }: { rows: ReturnType<typeof personalRankings>; fmtRate: (value: number) => string; onRemove: (id: string) => void }) {
  if (!rows.length) return <div className="records-empty">등록된 선수가 없습니다.</div>;
  const rosterPlayers = rows.map((row) => row.player);
  return <div className="registered-list">{rows.map((row, index) => <div className="registered-player-row" key={row.player.id}><span className={`rank-medal medal-${index + 1}`}>{index + 1}</span><div className="rank-name"><strong>{playerLabel(row.player, rosterPlayers)}</strong><small>{row.games}경기 · {row.wins}승 {row.losses}패</small></div><b className="rank-rate">{fmtRate(row.winRate)}</b><button type="button" aria-label={`${row.player.displayName} 선수 삭제`} onClick={() => onRemove(row.player.id)}><Trash2 size={15} /></button></div>)}</div>;
}

function Records({ matches, compact = false, onDelete, emptyText = '기록이 없습니다.' }: { matches: Match[]; compact?: boolean; onDelete?: (match: Match) => void; emptyText?: string }) {
  if (!matches.length) return <div className="records-empty">{emptyText}</div>;
  return <div className={compact ? 'records compact' : 'records'}>{matches.slice().reverse().map((match, index) => <MatchRow key={match.id} match={match} number={matches.length - index} onDelete={onDelete} />)}</div>;
}

function MatchRow({ match, number, onDelete }: { match: Match; number: number; onDelete?: (match: Match) => void }) {
  const aWon = match.winner === 'A';
  return <article className="match-row"><span className="match-number">{number}</span><div className={aWon ? 'side won' : 'side'}>{aWon && <b className="win-badge">승</b>}{match.teamA.map((player) => <span key={player.id}>{player.displayName}</span>)}</div><span className="row-vs">VS</span><div className={!aWon ? 'side won' : 'side'}>{!aWon && <b className="win-badge">승</b>}{match.teamB.map((player) => <span key={player.id}>{player.displayName}</span>)}</div>{onDelete && <button className="match-delete-button" type="button" onClick={() => onDelete(match)} aria-label="경기 기록 삭제"><Trash2 size={15} /></button>}</article>;
}

function PersonalTable({ rows, fmtRate }: { rows: ReturnType<typeof personalRankings>; fmtRate: (value: number) => string }) {
  return <div className="rank-list">{rows.map((row, index) => <div className="rank-row" key={row.player.id}><span className={`rank-medal medal-${index + 1}`}>{index + 1}</span><div className="rank-name"><strong>{row.player.displayName}</strong><small>{row.games}경기 · {row.wins}승 {row.losses}패</small></div><b className="rank-rate">{fmtRate(row.winRate)}</b></div>)}</div>;
}

function PartnerTable({ rows, fmtRate }: { rows: ReturnType<typeof partnerRankings>; fmtRate: (value: number) => string }) {
  return <div className="rank-list">{rows.map((row, index) => <div className="rank-row" key={row.key}><span className={`rank-medal medal-${index + 1}`}>{index + 1}</span><div className="rank-name"><strong>{row.players.map((player) => player.displayName).join(' · ')}</strong><small>{row.games < 3 ? '경기 수 적음 · ' : ''}{row.games}경기 · {row.wins}승 {row.losses}패</small></div><b className="rank-rate">{fmtRate(row.winRate)}</b></div>)}</div>;
}

function NavButton({ label, icon, active, onClick }: { label: string; icon: React.ReactNode; active: boolean; onClick: () => void }) { return <button className={active ? 'nav-button active' : 'nav-button'} onClick={onClick}>{icon}<span>{label}</span></button>; }
