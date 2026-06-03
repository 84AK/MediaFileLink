import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// 캐시를 방지하고 항상 동적으로 실행되도록 구성
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    // 1. 보안 시크릿 키 검증
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');

    if (!secret || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized: Invalid cron secret' }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Server configuration error: Supabase service key is missing' },
        { status: 500 }
      );
    }

    // RLS를 우회하기 위해 Service Role Key를 활용한 어드민 클라이언트 인스턴스 생성
    const adminSupabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const now = new Date().toISOString();

    // 2. 만료 기한이 경과한 레코드 목록 조회 (expires_at < 현재시간)
    const { data: expiredFiles, error: fetchError } = await adminSupabase
      .from('media_files')
      .select('id, file_url, file_name')
      .lt('expires_at', now);

    if (fetchError) {
      console.error('Failed to fetch expired records:', fetchError);
      throw new Error(`DB 조회 실패: ${fetchError.message}`);
    }

    // 만료된 파일이 없을 경우 얼리 리턴
    if (!expiredFiles || expiredFiles.length === 0) {
      return NextResponse.json({
        success: true,
        message: 'No expired files found to clean up.',
        count: 0,
      });
    }

    // 3. 스토리지 물리 파일 일괄 삭제
    const fileNamesToDelete = expiredFiles
      .map((item) => {
        try {
          const urlParts = item.file_url.split('/');
          const rawFileName = urlParts[urlParts.length - 1].split('?')[0]; // URL에서 파일명 추출
          return decodeURIComponent(rawFileName); // 디코딩 처리
        } catch (e) {
          console.error(`Failed to parse file url: ${item.file_url}`, e);
          return null;
        }
      })
      .filter((name): name is string => Boolean(name));

    let storageErrors: any[] = [];
    if (fileNamesToDelete.length > 0) {
      const { data: storageData, error: storageError } = await adminSupabase.storage
        .from('MediaLink Hub')
        .remove(fileNamesToDelete);

      if (storageError) {
        console.error('Supabase Storage 파일 삭제 실패:', storageError);
        storageErrors.push(storageError);
      } else {
        console.log('Deleted storage files:', storageData);
      }
    }

    // 4. DB 레코드 삭제
    const idsToDelete = expiredFiles.map((item) => item.id);
    const { error: dbDeleteError } = await adminSupabase
      .from('media_files')
      .delete()
      .in('id', idsToDelete);

    if (dbDeleteError) {
      console.error('Supabase DB 레코드 삭제 실패:', dbDeleteError);
      throw new Error(`DB 삭제 실패: ${dbDeleteError.message}`);
    }

    return NextResponse.json({
      success: true,
      message: `Cleaned up ${idsToDelete.length} expired files successfully.`,
      count: idsToDelete.length,
      deleted_files: fileNamesToDelete,
      has_storage_errors: storageErrors.length > 0,
    });

  } catch (error: any) {
    console.error('[Cron Cleanup Error]:', error);
    return NextResponse.json({ error: error.message || 'Unknown server error' }, { status: 500 });
  }
}
