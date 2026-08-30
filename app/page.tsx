'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import UploadZone from '@/components/UploadZone';
import MediaCard from '@/components/MediaCard';
import { LayoutGrid, History, Sparkles, Globe, Loader2, RotateCw } from 'lucide-react';

interface MediaItem {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  user_id?: string;
  expires_at?: string;
  created_at: string;
}


export default function Page() {
  const [items, setItems] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // 필터 및 다중 선택 상태 추가
  const [filterMode, setFilterMode] = useState<'all' | 'mine'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isCleaning, setIsCleaning] = useState(false);

  // 만료 여부 판별 함수 (밀리초 단위 엄격 비교)
  const isExpired = (expiresAt?: string | null) => {
    if (!expiresAt) return false;
    const expTime = new Date(expiresAt).getTime();
    if (isNaN(expTime)) return false;
    return expTime <= Date.now();
  };

  // 필터링된 이미지 목록 산출 (비관리자는 만료된 파일 즉시 제외)
  const validItems = isAdmin
    ? items
    : items.filter(item => !isExpired(item.expires_at));

  const displayedItems = filterMode === 'mine' && user && !user.is_anonymous
    ? validItems.filter(item => item.user_id === user.id)
    : validItems;

  const expiredCount = items.filter(item => isExpired(item.expires_at)).length;

  // 개별 선택 토글 핸들러
  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // 전체 선택 / 전체 선택 해제 핸들러
  const handleSelectAll = () => {
    if (selectedIds.size === displayedItems.length && displayedItems.length > 0) {
      setSelectedIds(new Set()); // 전체 해제
    } else {
      setSelectedIds(new Set(displayedItems.map(item => item.id))); // 전체 선택
    }
  };

  // 벌크 일괄 삭제 핸들러 (최적화)
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!user) {
      alert('로그인 정보가 존재하지 않습니다.');
      return;
    }

    const targetIds = Array.from(selectedIds);
    const targetItems = items.filter(item => targetIds.includes(item.id));

    // 권한 검증: 관리자면 전체 삭제, 일반 유저면 본인 파일만 선별
    const deletableItems = isAdmin
      ? targetItems
      : targetItems.filter(item => item.user_id === user.id);

    if (deletableItems.length === 0) {
      alert('삭제할 수 있는 본인 소유의 파일이 선택되지 않았습니다.');
      return;
    }

    if (!window.confirm(`선택한 ${deletableItems.length}개의 파일을 일괄 삭제하시겠습니까?`)) {
      return;
    }

    setIsLoading(true);

    try {
      // 1. 스토리지 파일들 일괄 삭제 (MIME 확장자 복구)
      const fileNames = deletableItems
        .map(item => {
          try {
            const urlParts = item.file_url.split('/');
            return decodeURIComponent(urlParts[urlParts.length - 1].split('?')[0]);
          } catch (e) {
            return null;
          }
        })
        .filter((name): name is string => Boolean(name));

      if (fileNames.length > 0) {
        const { error: storageError } = await supabase.storage
          .from('MediaLink Hub')
          .remove(fileNames);

        if (storageError) {
          console.error('Storage Bulk Delete Error:', storageError);
          throw new Error(`스토리지 파일 물리 삭제 실패: ${storageError.message}`);
        }
      }

      // 2. DB 레코드 일괄 삭제
      const deletableIds = deletableItems.map(item => item.id);
      const { error: dbError } = await supabase
        .from('media_files')
        .delete()
        .in('id', deletableIds);

      if (dbError) throw dbError;

      // 3. UI 상태 동기화
      setItems(prev => prev.filter(item => !deletableIds.includes(item.id)));
      setSelectedIds(new Set()); // 선택 클리어
      alert(`${deletableIds.length}개의 파일이 성공적으로 삭제되었습니다.`);
    } catch (err: any) {
      console.error('Bulk Delete Transaction Error:', err);
      alert(`일괄 삭제 실패: ${err.message || '오류가 발생했습니다.'}`);
    } finally {
      setIsLoading(false);
    }
  };

  // 관리자 전용: 만료 미디어 강제 정리 핸들러
  const handleRunCleanup = async () => {
    if (!isAdmin) return;
    if (!window.confirm(`기한이 만료된 파일(총 ${expiredCount}개)을 서버 및 스토리지에서 영구 삭제하시겠습니까?`)) {
      return;
    }

    setIsCleaning(true);
    try {
      const secret = process.env.NEXT_PUBLIC_CRON_SECRET || 'medialink_hub_cron_secret_key_2026_06_03';
      const res = await fetch(`/api/cron/cleanup?secret=${encodeURIComponent(secret)}`);
      const data = await res.json();
      if (res.ok) {
        alert(`만료된 미디어 ${data.count || 0}개가 성공적으로 정리되었습니다.`);
        fetchItems();
      } else {
        alert(`만료 미디어 정리 실패: ${data.error || '알 수 없는 에러가 발생했습니다.'}`);
      }
    } catch (e: any) {
      alert(`정리 요청 중 오류 발생: ${e.message}`);
    } finally {
      setIsCleaning(false);
    }
  };


  // 인증 및 관리자/소셜 로그인 체크
  useEffect(() => {
    // 1. 초기 세션 복구 및 체크
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          if (session.user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
            setIsAdmin(true);
          }
        } else {
          // 세션이 없으면 백그라운드 익명 로그인 유지
          const { data, error } = await supabase.auth.signInAnonymously();
          if (error) throw error;
          setUser(data.user);
        }
      } catch (err) {
        console.error('Auth Initialization Error:', err);
      }
    };

    initAuth();

    // 2. 인증 상태 실시간 구독 (구글 소셜 로그인 완료 감지 등)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user);
        if (session.user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
        }
      } else {
        // 로그아웃 시 다시 익명 계정으로 복구
        setIsAdmin(false);
        try {
          const { data, error } = await supabase.auth.signInAnonymously();
          if (!error && data?.user) {
            setUser(data.user);
          }
        } catch (e) {
          console.error('Auto Anonymous Login Failed on Signout:', e);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // 구글 소셜 로그인 트리거
  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        }
      });
      if (error) throw error;
    } catch (err: any) {
      alert('구글 로그인 실패: ' + err.message);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      });
      if (error) throw error;
      setUser(data.user);
      if (data.user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
        setIsAdmin(true);
      }
      setShowLoginModal(false);
      alert('관리자로 로그인되었습니다.');
      fetchItems();
    } catch (err: any) {
      alert('로그인 실패: ' + err.message);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    window.location.reload();
  };




  const fetchItems = async () => {
    // Check if Supabase is properly configured
    if (process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('placeholder')) {
      console.warn('Supabase URL is not configured. Please set NEXT_PUBLIC_SUPABASE_URL in Secrets.');
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('media_files')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Supabase Error Details:', error);
        throw error;
      }
      setItems(data || []);
    } catch (err: any) {
      console.error('Full Error Object:', err);
      const errorMessage = err.message || JSON.stringify(err);
      console.error('Error fetching items:', errorMessage);
      
      if (errorMessage.includes('public.media_files')) {
        setTableMissing(true);
      }
      if (errorMessage.includes('row-level security')) {
        setRlsError(true);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const [tableMissing, setTableMissing] = useState(false);
  const [rlsError, setRlsError] = useState(false);

  const handleDelete = async (id: string) => {
    if (!user) {
      alert('로그인 정보가 없습니다. 새로고침 후 다시 시도해 주세요.');
      return;
    }
    
    if (!window.confirm('정말 이 파일을 삭제하시겠습니까?')) return;

    try {
      const itemToDelete = items.find(i => i.id === id);
      if (itemToDelete) {
        // 본인 소유 확인
        if (itemToDelete.user_id && itemToDelete.user_id !== user.id) {
          alert('본인이 업로드한 파일만 삭제할 수 있습니다.');
          return;
        }

        // 스토리지 파일 삭제
        const urlParts = itemToDelete.file_url.split('/');
        const fileName = urlParts[urlParts.length - 1].split('?')[0]; // 쿼리 파라미터 제거
        
        if (fileName) {
          const { error: storageError } = await supabase.storage
            .from('MediaLink Hub')
            .remove([fileName]);
          
          if (storageError) {
            console.error('Storage Deletion Error:', storageError);
            throw new Error(`스토리지 파일 삭제 실패: ${storageError.message}`);
          }
        }
      }

      // DB 레코드 삭제 (삭제된 행의 개수를 확인하기 위해 select().single() 등으로 검증 가능하지만, 
      // 여기서는 삭제 후 결과 데이터가 있는지 확인하는 방식을 사용합니다.)
      const matchCriteria = isAdmin ? { id } : { id, user_id: user.id };
      const { data, error: dbError } = await supabase
        .from('media_files')
        .delete()
        .match(matchCriteria)
        .select(); // 삭제된 데이터를 반환받아 실제 삭제 여부 확인

      if (dbError) throw dbError;
      
      if (!data || data.length === 0) {
        throw new Error('삭제 권한이 없거나 이미 삭제된 파일입니다. (DB 정책 확인 필요)');
      }

      setItems(items.filter(item => item.id !== id));
      alert('성공적으로 삭제되었습니다.');
    } catch (err: any) {

      console.error('Full Deletion Error:', err);
      alert(`삭제 실패: ${err.message || '알 수 없는 오류가 발생했습니다.'}`);
    }
  };



  useEffect(() => {
    fetchItems();
  }, []);

  return (
    <main className="min-h-screen bg-[#F8F9FA] text-zinc-900 selection:bg-zinc-900 selection:text-white">
      {/* Configuration Warning Banner */}
      {(!process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL.includes('placeholder')) && (
        <div className="bg-amber-50 border-b border-amber-100 p-3 text-center">
          <p className="text-sm text-amber-700 font-medium">
            ⚠️ Supabase 설정이 필요합니다. <b>.env.local</b> 파일에서 프로젝트 URL과 Anon Key를 설정해 주세요.
          </p>
        </div>
      )}


      {/* Table Missing Warning */}
      {tableMissing && (
        <div className="max-w-7xl mx-auto px-6 mt-6">
          <div className="bg-red-50 border border-red-100 rounded-3xl p-8">
            <h2 className="text-red-800 font-bold mb-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full" />
              데이터베이스 테이블이 없습니다
            </h2>
            <p className="text-red-700 text-sm mb-4">
              Supabase SQL Editor에서 아래 명령어를 실행하여 <b>media_files</b> 테이블을 생성해 주세요.
            </p>
            <pre className="bg-zinc-900 text-zinc-400 p-4 rounded-xl text-xs overflow-x-auto font-mono">
{`create table media_files (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_url text not null,
  file_type text not null,
  user_id uuid references auth.users not null default auth.uid(),
  created_at timestamp with time zone default now()
);`}
            </pre>
          </div>
        </div>
      )}

      {/* RLS Error Warning */}
      {rlsError && (
        <div className="max-w-7xl mx-auto px-6 mt-6">
          <div className="bg-amber-50 border border-amber-100 rounded-3xl p-8">
            <h2 className="text-amber-800 font-bold mb-2 flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-500 rounded-full" />
              보안 정책(RLS) 설정이 필요합니다
            </h2>
            <p className="text-amber-700 text-sm mb-4">
              데이터를 저장할 권한이 없습니다. SQL Editor에서 아래 명령어를 실행하여 정책을 추가해 주세요.
            </p>
            <pre className="bg-zinc-900 text-zinc-400 p-4 rounded-xl text-xs overflow-x-auto font-mono">
{`-- 1. media_files 테이블에 컬럼 추가 (기존에 없는 경우에만 추가)
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users DEFAULT auth.uid();
ALTER TABLE media_files ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;

-- 2. media_files 테이블 RLS 활성화
ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;

-- 3. media_files 테이블 RLS 정책 생성
-- 3-1. INSERT 정책 (익명 및 로그인 사용자 모두 본인 파일 추가 가능)
create policy "Users can insert their own media" on media_files for insert to anon, authenticated with check (auth.uid() = user_id);

-- 3-2. SELECT 정책 (누구나 파일 목록 조회 가능)
create policy "Users can select all media" on media_files for select using (true);

-- 3-3. DELETE 정책 (파일 업로더 및 관리자 mosebb@gmail.com 만 삭제 가능)
create policy "Users can delete their own media" on media_files for delete to anon, authenticated using (auth.uid() = user_id or auth.jwt() ->> 'email' = 'mosebb@gmail.com');

-- 4. 스토리지 권한: 누구나 업로드 가능 및 소유자/관리자 삭제 가능
create policy "Allow public select" on storage.objects for select using (bucket_id = 'MediaLink Hub');
create policy "Allow upload for all" on storage.objects for insert to anon, authenticated with check (bucket_id = 'MediaLink Hub');
create policy "Allow delete for owners and admin" on storage.objects for delete using (bucket_id = 'MediaLink Hub' and (auth.uid() = owner or auth.jwt() ->> 'email' = 'mosebb@gmail.com'));`}

            </pre>
          </div>
        </div>
      )}

      {/* Header Section */}
      <header className="max-w-7xl mx-auto px-6 pt-12 pb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-2 mb-4"
            >
              <div className="w-10 h-10 bg-zinc-900 rounded-xl flex items-center justify-center">
                <Globe className="w-6 h-6 text-white" />
              </div>
              <span className="text-sm font-bold tracking-widest uppercase text-zinc-400">MediaLink Hub</span>
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-5xl md:text-7xl font-light tracking-tight leading-[0.9]"
            >
              Instant <br />
              <span className="font-semibold italic">Media Sharing.</span>
            </motion.h1>
          </div>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="flex items-center gap-3 text-sm font-medium text-zinc-500 flex-wrap"
          >
            {!user || user.is_anonymous ? (
              <>
                {/* Google OAuth Login */}
                <button 
                  onClick={handleGoogleLogin}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white text-zinc-700 rounded-full border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-all shadow-sm font-semibold text-xs"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#EA4335" d="M5.266 9.765A7.077 7.077 0 0 1 12 4.909c1.69 0 3.218.6 4.418 1.582l3.51-3.51C17.842 1.05 15.11 0 12 0 7.34 0 3.32 2.67 1.34 6.57l3.926 3.195z" />
                    <path fill="#4285F4" d="M23.455 12.273c0-.818-.073-1.609-.209-2.386H12v4.518h6.427a5.53 5.53 0 0 1-2.4 3.632l3.736 2.9C21.945 19.123 23.455 16.014 23.455 12.273z" />
                    <path fill="#FBBC05" d="M5.266 14.235A7.014 7.014 0 0 1 4.909 12c0-.782.132-1.532.357-2.235L1.34 6.57A11.97 11.97 0 0 0 0 12c0 1.95.468 3.79 1.3 5.43l3.966-3.195z" />
                    <path fill="#34A853" d="M12 24c3.24 0 5.97-1.07 7.96-2.91l-3.736-2.9C15.11 19.064 13.68 19.09 12 19.09c-2.86 0-5.29-1.93-6.16-4.53H1.87v3.195C3.85 21.33 7.86 24 12 24z" />
                  </svg>
                  <span>Google 로그인</span>
                </button>

                <button 
                  onClick={() => setShowLoginModal(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-full border border-zinc-200 shadow-sm hover:bg-zinc-50 transition-colors text-xs font-semibold text-zinc-600"
                >
                  <Sparkles className="w-4 h-4 text-zinc-400" />
                  <span>Admin Login</span>
                </button>
              </>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-zinc-600 text-xs font-semibold px-4 py-2 bg-white border border-zinc-100 rounded-full shadow-sm max-w-[220px] truncate" title={user.email}>
                  👤 {user.email}
                </span>
                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-full border border-red-100 shadow-sm hover:bg-red-100 transition-colors text-xs font-semibold"
                >
                  <Globe className="w-4 h-4" />
                  <span>{isAdmin ? 'Admin Mode (Logout)' : '로그아웃'}</span>
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 px-4 py-2.5 bg-white rounded-full border border-zinc-100 shadow-sm text-xs font-semibold">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>{items.length} Files Hosted</span>
            </div>
          </motion.div>

        </div>
      </header>

      {/* Main Content - Bento Grid Layout */}
      <div className="max-w-7xl mx-auto px-6 pb-24">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Upload Section - Large Box */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="md:col-span-8 h-full"
          >
            <UploadZone onUploadComplete={fetchItems} />
          </motion.div>

          {/* Stats/Info Box - Small Box */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="md:col-span-4 bg-zinc-900 rounded-3xl p-8 text-white flex flex-col justify-between"
          >
            <div className="flex justify-between items-start">
              <LayoutGrid className="w-8 h-8 opacity-50" />
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest font-bold opacity-50 mb-1">Status</p>
                <div className="flex items-center gap-2 justify-end">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                  <span className="text-xs font-medium">Live Server</span>
                </div>
              </div>
            </div>
            <div>
              <p className="text-3xl font-light leading-tight">
                Upload once, <br />
                <span className="opacity-50">embed anywhere.</span>
              </p>
            </div>
          </motion.div>

          {/* History Section Header */}
          <div className="md:col-span-12 mt-12 mb-4 flex items-center justify-between border-b border-zinc-200 pb-4">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-zinc-400" />
              <h2 className="text-xl font-semibold">Recent Uploads</h2>
            </div>
            <p className="text-xs text-zinc-400 font-medium uppercase tracking-widest">History Management</p>
          </div>

          {/* Bento Controls Bar */}
          <div className="md:col-span-12 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-white border border-zinc-200/60 rounded-[2rem] p-5 shadow-sm">
            {/* Left: filter tabs */}
            <div className="flex items-center gap-1.5 bg-zinc-100 p-1.5 rounded-2xl self-start sm:self-auto">
              <button
                onClick={() => { setFilterMode('all'); setSelectedIds(new Set()); }}
                className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                  filterMode === 'all' 
                    ? 'bg-white text-zinc-950 shadow-sm' 
                    : 'text-zinc-500 hover:text-zinc-800'
                }`}
              >
                모든 미디어
              </button>
              {user && !user.is_anonymous && (
                <button
                  onClick={() => { setFilterMode('mine'); setSelectedIds(new Set()); }}
                  className={`px-4 py-2 text-xs font-bold rounded-xl transition-all ${
                    filterMode === 'mine' 
                      ? 'bg-white text-zinc-950 shadow-sm' 
                      : 'text-zinc-500 hover:text-zinc-800'
                  }`}
                >
                  내가 올린 미디어
                </button>
              )}
            </div>

            {/* Right: bulk actions & Admin cleanup */}
            <div className="flex items-center gap-2 justify-end flex-wrap">
              {isAdmin && expiredCount > 0 && (
                <button
                  onClick={handleRunCleanup}
                  disabled={isCleaning}
                  className="px-3.5 py-2.5 text-xs font-bold bg-amber-50 border border-amber-200 text-amber-800 rounded-xl hover:bg-amber-100 transition-all shadow-sm flex items-center gap-1.5"
                  title="만료된 미디어를 스토리지와 DB에서 즉시 영구 삭제합니다."
                >
                  <RotateCw className={`w-3.5 h-3.5 ${isCleaning ? 'animate-spin text-amber-600' : 'text-amber-500'}`} />
                  <span>만료 정리 ({expiredCount})</span>
                </button>
              )}

              <button
                onClick={handleSelectAll}
                className="px-4 py-2.5 text-xs font-bold bg-white border border-zinc-200 text-zinc-700 rounded-xl hover:bg-zinc-50 transition-all shadow-sm"
              >
                {selectedIds.size === displayedItems.length && displayedItems.length > 0 
                  ? '선택 해제' 
                  : '전체 선택'}
              </button>
              
              <AnimatePresence>
                {selectedIds.size > 0 && (
                  <motion.button
                    initial={{ opacity: 0, scale: 0.9, x: 20 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9, x: 20 }}
                    onClick={handleBulkDelete}
                    className="px-4 py-2.5 text-xs font-bold bg-red-500 text-white rounded-xl hover:bg-red-600 transition-all shadow-md flex items-center gap-1.5"
                  >
                    <span>선택 삭제 ({selectedIds.size})</span>
                  </motion.button>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Media Grid */}
          <div className="md:col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <AnimatePresence mode="popLayout">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-video bg-zinc-200 animate-pulse rounded-3xl" />
                ))
              ) : displayedItems.length > 0 ? (
                displayedItems.map((item) => (
                  <MediaCard 
                    key={item.id} 
                    item={item} 
                    onDelete={handleDelete} 
                    isOwner={isAdmin || Boolean(user && item.user_id && user.id === item.user_id)}
                    isSelected={selectedIds.has(item.id)}
                    onToggleSelect={handleToggleSelect}
                  />
                ))

              ) : (
                <div className="col-span-full py-24 text-center">
                  <p className="text-zinc-400 font-medium italic">아직 업로드된 파일이 없습니다.</p>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Admin Login Modal */}
      <AnimatePresence>
        {showLoginModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/20 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-white rounded-[2rem] p-10 shadow-2xl border border-zinc-100"
            >
              <div className="flex justify-between items-center mb-8">
                <h2 className="text-2xl font-bold tracking-tight">Admin Portal</h2>
                <button 
                  onClick={() => setShowLoginModal(false)}
                  className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200"
                >
                  ✕
                </button>
              </div>
              <form onSubmit={handleAdminLogin} className="space-y-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">Email Address</label>
                  <input 
                    type="email" 
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    className="w-full px-5 py-4 bg-zinc-50 border border-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
                    placeholder="admin@medialink.hub"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-zinc-400 mb-2">Master Password</label>
                  <input 
                    type="password" 
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    className="w-full px-5 py-4 bg-zinc-50 border border-zinc-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-zinc-900 transition-all"
                    placeholder="••••••••"
                    required
                  />
                </div>
                <button 
                  type="submit"
                  className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all shadow-lg"
                >
                  Authorize Access
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}

      <footer className="max-w-7xl mx-auto px-6 py-12 border-t border-zinc-200 flex flex-col md:flex-row justify-between items-center gap-6">
        <p className="text-xs text-zinc-400 font-medium">© 2026 MediaLink Hub. All rights reserved.</p>
        <div className="flex gap-8">
          <a href="https://litt.ly/aklabs" target="_blank" rel="noopener noreferrer" className="text-xs font-bold uppercase tracking-widest text-zinc-400 hover:text-zinc-900 transition-colors">
            AK Labs
          </a>
        </div>
      </footer>
    </main>
  );
}
