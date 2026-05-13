'use client';

import React, { useState, useCallback } from 'react';
import { Upload, File, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';

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
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      // 1. Upload to Supabase Storage (Bucket: MediaLink Hub)
      const { error: uploadError } = await supabase.storage
        .from('MediaLink Hub')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from('MediaLink Hub')
        .getPublicUrl(filePath);

      // 3. Save to Database (Table: media_files)
      const { error: dbError } = await supabase
        .from('media_files')
        .insert([
          {
            file_name: file.name,
            file_url: publicUrl,
            file_type: file.type.split('/')[0], // image, video, audio
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
  );
}
