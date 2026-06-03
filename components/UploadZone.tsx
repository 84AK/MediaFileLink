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
  const [error, setError] = useState<string | null>(null);

  const handleUpload = useCallback(async (file: File) => {
    if (!file) return;

    setIsUploading(true);
    setError(null);

    // 보안 검증: 파일 크기 제한 (10MB)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (file.size > MAX_FILE_SIZE) {
      setError('파일 크기가 너무 큽니다. (최대 10MB)');
      setIsUploading(false);
      return;
    }

    // 보안 검증: 미디어 파일 형식만 허용
    const allowedTypes = ['image/', 'video/', 'audio/'];
    if (!allowedTypes.some(type => file.type.startsWith(type))) {
      setError('이미지, 비디오, 오디오 파일만 업로드 가능합니다.');
      setIsUploading(false);
      return;
    }


    try {
      // 업로드 전 이미지 파일인 경우 WebP로 자동 변환 및 최적화 진행
      const processedFile = await convertToWebP(file);

      const fileExt = processedFile.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      // 현재 로그인된 사용자(익명 또는 로그인 사용자) 정보 조회
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('로그인 세션이 존재하지 않습니다. 새로고침 후 다시 시도해 주세요.');
      }

      // 1. Upload to Supabase Storage (Bucket: MediaLink Hub)
      const { error: uploadError } = await supabase.storage
        .from('MediaLink Hub')
        .upload(filePath, processedFile);

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('MediaLink Hub')
        .getPublicUrl(filePath);

      // 만료 일시 산출 (익명 1일, 일반 로그인 7일, 관리자 영구)
      let expiresAt: string | null = null;
      if (user.email === process.env.NEXT_PUBLIC_ADMIN_EMAIL) {
        expiresAt = null;
      } else if (user.email) {
        expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      } else {
        expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }

      // 3. Save to Database (Table: media_files)
      const { error: dbError } = await supabase
        .from('media_files')
        .insert([
          {
            file_name: processedFile.name,
            file_url: publicUrl,
            file_type: processedFile.type.split('/')[0], // image, video, audio
            user_id: user.id, // 유저 ID 명시적 전달 (RLS 검증 통과용)
            expires_at: expiresAt,
          },
        ]);

      if (dbError) throw dbError;

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
    const file = e.dataTransfer.files[0];
    if (file) handleUpload(file);
  }, [handleUpload]);

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
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
              <p className="text-sm font-medium text-zinc-500">미디어를 처리 중입니다...</p>
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
                <p className="text-sm text-zinc-500 mt-1">파일을 드래그하거나 클릭하여 선택하세요</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <input
          type="file"
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
            비로그인 업로드 시 <strong>24시간(1일)</strong> 보존 후 자동 삭제되며, 구글 소셜 로그인 유저는 <strong>7일(일주일)</strong>, 관리자 계정은 만료 기한 없이 <strong>영구 보존</strong>됩니다.
          </p>
        </div>
      </div>
    </div>
  );
}
