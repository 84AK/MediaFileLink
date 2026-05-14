'use client';

import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import UploadZone from '@/components/UploadZone';
import MediaCard from '@/components/MediaCard';
import { LayoutGrid, History, Sparkles, Globe, Loader2 } from 'lucide-react';

interface MediaItem {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  user_id?: string;
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
 // Supabase User type


  // 인증 및 관리자 체크
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          setUser(session.user);
          // 관리자 이메일 체크 (필요시 .env로 관리 가능)
          if (session.user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
            setIsAdmin(true);
          }
        } else {
          const { data, error } = await supabase.auth.signInAnonymously();
          if (error) throw error;
          setUser(data.user);
        }
      } catch (err) {
        console.error('Auth Initialization Error:', err);
      }
    };
    initAuth();
  }, []);

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
{`-- 테이블 권한: 소유자만 관리 가능
create policy "Users can insert their own media" on media_files for insert with check (auth.uid() = user_id);
create policy "Users can select all media" on media_files for select using (true);
create policy "Users can delete their own media" on media_files for delete using (auth.uid() = user_id);

-- 스토리지 권한: 소유자만 업로드/삭제 가능
create policy "Allow public select" on storage.objects for select using (bucket_id = 'MediaLink Hub');
create policy "Allow authenticated upload" on storage.objects for insert to authenticated with check (bucket_id = 'MediaLink Hub');
create policy "Allow owners to delete" on storage.objects for delete to authenticated using (bucket_id = 'MediaLink Hub');`}

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
            className="flex items-center gap-4 text-sm font-medium text-zinc-500"
          >
            {isAdmin ? (
              <button 
                onClick={handleLogout}
                className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-full border border-red-100 shadow-sm hover:bg-red-100 transition-colors"
              >
                <Globe className="w-4 h-4" />
                <span>Admin Mode (Logout)</span>
              </button>
            ) : (
              <button 
                onClick={() => setShowLoginModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-zinc-100 shadow-sm hover:bg-zinc-50 transition-colors"
              >
                <Sparkles className="w-4 h-4 text-zinc-400" />
                <span>Admin Login</span>
              </button>
            )}
            <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-full border border-zinc-100 shadow-sm">
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

          {/* Media Grid */}
          <div className="md:col-span-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <AnimatePresence mode="popLayout">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="aspect-video bg-zinc-200 animate-pulse rounded-3xl" />
                ))
              ) : items.length > 0 ? (
                items.map((item) => (
                  <MediaCard 
                    key={item.id} 
                    item={item} 
                    onDelete={handleDelete} 
                    isOwner={isAdmin || Boolean(user && item.user_id && user.id === item.user_id)}
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
