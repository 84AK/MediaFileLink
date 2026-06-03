'use client';

import React, { useState, useCallback } from 'react';
import { Upload, File, Loader2, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { convertToWebP } from '@/lib/utils';

interface UploadZoneProps {
  onUploadComplete: () => void;
}

export default function UploadZone({ onUploadComplete }: UploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [error, setError] = useState<string | null>(null);

  const handleUploads = useCallback(async (files: FileList | File[]) => {
    if (!files || files.length === 0) return;

    const fileArray = Array.from(files);
    setIsUploading(true);
    setUploadProgress({ current: 0, total: fileArray.length });
    setError(null);

    // 1차 보안 검증: 모든 파일 크기 및 포맷 체크
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    const allowedTypes = ['image/', 'video/', 'audio/'];

    for (const file of fileArray) {
      if (file.size > MAX_FILE_SIZE) {
        setError(`'${file.name}' 파일 크기가 너무 큽니다. (최대 10MB)`);
        setIsUploading(false);
        return;
      }

      if (!allowedTypes.some(type => file.type.startsWith(type))) {
        setError(`'${file.name}'은 지원하지 않는 파일 형식입니다. (이미지, 비디오, 오디오만 가능)`);
        setIsUploading(false);
        return;
      }
    }

    try {
      // 현재 로그인된 사용자 정보 조회
      let { data: { user } } = await supabase.auth.getUser();

      // 세션이 없으면 즉시 백그라운드 익명 로그인 재시도
      if (!user) {
        const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
        if (anonError) {
          throw new Error('익명 로그인 세션을 생성할 수 없습니다. Supabase 대시보드에서 Anonymous Sign-ins 활성화 여부를 확인해 주세요.');
        }
        user = anonData.user;
      }

      if (!user) {
        throw new Error('로그인 세션이 존재하지 않습니다. 새로고침 후 다시 시도해 주세요.');
      }

      const isAnonymous = user.is_anonymous || !user.email;
      const isAdmin = user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL;

      // 1. 한국 시간(KST) 오늘 자정 구하기 (UTC+9)
      const kstDate = new Date(new Date().getTime() + 9 * 60 * 60 * 1000);
      const y = kstDate.getUTCFullYear();
      const m = String(kstDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(kstDate.getUTCDate()).padStart(2, '0');
      const kstMidnightIso = `${y}-${m}-${d}T00:00:00+09:00`;

      // 2. DB에서 현재 유저가 오늘 업로드한 개수 카운팅
      const { count, error: countError } = await supabase
        .from('media_files')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .gte('created_at', kstMidnightIso);

      if (countError) {
        console.error('Failed to check upload limit count:', countError);
        throw new Error('업로드 제한 확인에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      }

      const dailyLimit = isAdmin ? Infinity : isAnonymous ? 3 : 10;
      const currentUploads = count || 0;
      const attemptCount = fileArray.length;

      if (currentUploads + attemptCount > dailyLimit) {
        if (isAnonymous) {
          throw new Error(`오늘 업로드 한도(최대 3개)를 초과했습니다. (오늘 이미 ${currentUploads}개 업로드함)\n구글 소셜 로그인 시 하루 최대 10개까지 업로드 가능합니다.`);
        } else if (!isAdmin) {
          throw new Error(`오늘 업로드 한도(최대 10개)를 초과했습니다. (오늘 이미 ${currentUploads}개 업로드함)`);
        }
      }

      // 만료 일시 산출 (익명 1일, 일반 로그인 7일, 관리자 영구)
      let expiresAt: string | null = null;
      if (isAdmin) {
        expiresAt = null;
      } else if (isAnonymous) {
        expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      } else {
        expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      }

      // 순차 업로드 실행 (렉 방지 및 모바일 기기 메모리 보호)
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];
        setUploadProgress(prev => ({ ...prev, current: i + 1 }));

        // 1. WebP 변환 및 최적화 (비디오/오디오/SVG 등은 자동 예외 처리됨)
        const processedFile = await convertToWebP(file);

        const fileExt = processedFile.name.split('.').pop();
        const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
        const filePath = `${fileName}`;

        // 2. Storage 업로드
        const { error: uploadError } = await supabase.storage
          .from('MediaLink Hub')
          .upload(filePath, processedFile);

        if (uploadError) throw uploadError;

        // 3. Get Public URL
        const { data: { publicUrl } } = supabase.storage
          .from('MediaLink Hub')
          .getPublicUrl(filePath);

        // 4. Save to Database
        const { error: dbError } = await supabase
          .from('media_files')
          .insert([
            {
              file_name: processedFile.name,
              file_url: publicUrl,
              file_type: processedFile.type.split('/')[0], // image, video, audio
              user_id: user.id, // RLS 검증용
              expires_at: expiresAt,
            },
          ]);

        if (dbError) throw dbError;
      }

      onUploadComplete();
    } catch (err: any) {
      console.error('Upload error:', err);
      let msg = err.message || '업로드 중 오류가 발생했습니다.';
      if (msg === 'Failed to fetch') {
        msg = 'Supabase 서버에 연결할 수 없습니다. Settings > Secrets에 URL과 Anon Key가 올바르게 설정되어 있는지 확인해 주세요.';
      }
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  }, [onUploadComplete]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) handleUploads(files);
  }, [handleUploads]);

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) handleUploads(files);
  };

  return (
    <div className="flex flex-col gap-3 h-full">
      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`relative group cursor-pointer overflow-hidden rounded-3xl border-2 border-dashed transition-all duration-300 h-full min-h-[200px] flex flex-col items-center justify-center p-8 ${
          isDragging ? 'border-primary bg-primary/5' : 'border-zinc-200 hover:border-zinc-400 bg-white/50 backdrop-blur-sm'
        }`}
      >
        <AnimatePresence mode="wait">
          {isUploading ? (
            <motion.div
              key="uploading"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="flex flex-col items-center gap-4"
            >
              <Loader2 className="w-12 h-12 text-zinc-400 animate-spin" />
              <p className="text-sm font-medium text-zinc-500">
                미디어를 처리 중입니다... ({uploadProgress.current} / {uploadProgress.total})
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="flex flex-col items-center gap-4 text-center"
            >
              <div className="w-16 h-16 rounded-2xl bg-zinc-100 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                <Upload className="w-8 h-8 text-zinc-600" />
              </div>
              <div>
                <p className="text-lg font-semibold text-zinc-800">미디어 업로드</p>
                <p className="text-sm text-zinc-500 mt-1">파일들을 드래그하거나 클릭하여 다중 선택하세요</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <input
          type="file"
          multiple
          accept="image/*,video/*,audio/*"
          className="absolute inset-0 opacity-0 cursor-pointer z-10"
          onChange={onFileSelect}
          disabled={isUploading}
        />

        {error && (
          <div className="absolute bottom-4 left-4 right-4 p-2 bg-red-50 text-red-500 text-xs rounded-lg text-center">
            {error}
          </div>
        )}
      </div>
      
      {/* Retention Guide Banner */}
      <div className="p-5 bg-zinc-900/5 rounded-3xl border border-zinc-200/60 flex items-start gap-4 text-left shadow-sm">
        <div className="w-10 h-10 rounded-2xl bg-zinc-900 text-white flex items-center justify-center shrink-0">
          <Clock className="w-5 h-5" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-zinc-800">미디어 자동 보존 정책 안내</h4>
          <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
            비로그인 업로드 시 하루 최대 <strong>3개</strong>, <strong>24시간(1일)</strong> 보존 후 자동 삭제되며, 구글 소셜 로그인 유저는 하루 최대 <strong>10개</strong>, <strong>7일(일주일)</strong> 보존됩니다. 관리자 계정은 제한 없이 <strong>영구 보존</strong>됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
