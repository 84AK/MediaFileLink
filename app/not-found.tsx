import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center">
      <h2 className="text-4xl font-bold mb-4">404</h2>
      <p className="text-zinc-500 mb-8">페이지를 찾을 수 없습니다.</p>
      <Link 
        href="/" 
        className="px-6 py-3 bg-zinc-900 text-white rounded-full font-medium hover:bg-zinc-800 transition-colors"
      >
        홈으로 돌아가기
      </Link>
    </div>
  );
}
