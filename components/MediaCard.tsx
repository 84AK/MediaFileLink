'use client';

import React from 'react';
import { Copy, Trash2, ExternalLink, Image as ImageIcon, Film, Music, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';

interface MediaItem {
  id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  user_id?: string;
  expires_at?: string;
  created_at: string;
}


interface MediaCardProps {
  item: MediaItem;
  onDelete: (id: string) => void;
  isOwner?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (id: string) => void;
}

export default function MediaCard({
  item,
  onDelete,
  isOwner = false,
  isSelected = false,
  onToggleSelect,
}: MediaCardProps) {
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);


  React.useEffect(() => {
    setMounted(true);
  }, []);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(item.file_url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getIcon = () => {
    switch (item.file_type) {
      case 'video': return <Film className="w-5 h-5" />;
      case 'audio': return <Music className="w-5 h-5" />;
      default: return <ImageIcon className="w-5 h-5" />;
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      onClick={() => setShowOverlay(!showOverlay)}
      onMouseLeave={() => setShowOverlay(false)}
      className={`group relative bg-white rounded-3xl border overflow-hidden hover:shadow-xl hover:shadow-zinc-200/50 transition-all duration-500 cursor-pointer ${
        isSelected ? 'border-zinc-900 ring-2 ring-zinc-900/10' : 'border-zinc-100'
      }`}
    >

      {/* Preview Area */}
      <div className="aspect-video bg-zinc-50 flex items-center justify-center overflow-hidden relative">
        {/* Checkbox Overlay */}
        {onToggleSelect && (
          <div 
            onClick={(e) => { e.stopPropagation(); onToggleSelect(item.id); }}
            className={`absolute top-4 left-4 z-30 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${
              isSelected 
                ? 'bg-zinc-900 border-zinc-900 text-white scale-110 shadow-md' 
                : 'bg-white/70 backdrop-blur-sm border-zinc-300 opacity-0 group-hover:opacity-100'
            }`}
          >
            {isSelected && <span className="text-[10px] font-bold">✓</span>}
          </div>
        )}
        {item.file_type === 'image' ? (
          <div className="relative w-full h-full">
            <img
              src={item.file_url}
              alt={item.file_name}
              className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
              loading="lazy"
              referrerPolicy="no-referrer"
            />
          </div>
        ) : item.file_type === 'video' ? (
          <video src={item.file_url} className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-zinc-400">
            <Music className="w-10 h-10" />
            <span className="text-xs font-medium">Audio File</span>
          </div>
        )}
        
        {/* Overlay Actions */}
        <div 
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 flex items-center justify-center gap-3 z-20 ${
            showOverlay ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => { e.stopPropagation(); copyToClipboard(); }}
            className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-zinc-900 hover:scale-110 transition-transform shadow-lg"
            title="URL 복사"
          >
            {copied ? <Check className="w-5 h-5 text-green-500" /> : <Copy className="w-5 h-5" />}
          </button>
          <a
            href={item.file_url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-zinc-900 hover:scale-110 transition-transform shadow-lg"
            title="새 창에서 열기"
          >
            <ExternalLink className="w-5 h-5" />
          </a>
          {isOwner && (
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-red-500 hover:scale-110 transition-transform shadow-lg"
              title="삭제"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
        </div>

      </div>

      {/* Info Area */}
      <div className="p-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-zinc-400">{getIcon()}</span>
          <h3 className="text-sm font-semibold text-zinc-800 truncate" title={item.file_name}>
            {item.file_name}
          </h3>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">
            {mounted ? new Date(item.created_at).toLocaleDateString() : '로딩 중...'}
          </p>
          <div className="flex items-center gap-1.5">
            {mounted && (
              item.expires_at ? (
                <span className="text-[8px] bg-amber-50 text-amber-600 border border-amber-100/50 px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter" title={`만료 시간: ${new Date(item.expires_at).toLocaleString()}`}>
                  만료: {new Date(item.expires_at).toLocaleDateString()}
                </span>
              ) : (
                <span className="text-[8px] bg-green-50 text-green-600 border border-green-100/50 px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">
                  영구 보존
                </span>
              )
            )}
            {isOwner && (
              <span className="text-[8px] bg-zinc-100 text-zinc-600 px-2 py-0.5 rounded-full font-bold uppercase tracking-tighter">My File</span>
            )}
          </div>
        </div>

      </div>
    </motion.div>
  );
}
