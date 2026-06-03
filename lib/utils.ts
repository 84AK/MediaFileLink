import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 브라우저 Canvas API를 활용하여 이미지 파일을 WebP 포맷으로 변환하고 압축합니다.
 * 이미지 가로/세로 중 더 긴 축이 1920px을 초과할 경우 비율을 유지한 채 1920px로 리사이징합니다.
 * 이미지 이외의 포맷(비디오, 오디오, SVG)은 변환하지 않고 그대로 반환합니다.
 */
export function convertToWebP(file: File, quality: number = 0.8): Promise<File> {
  return new Promise((resolve, reject) => {
    // 이미지 파일이 아니거나 SVG 파일이면 변환을 수행하지 않고 그대로 반환
    if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
      return resolve(file);
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        // 해상도 제한 (최대 1920px)
        const MAX_WIDTH = 1920;
        const MAX_HEIGHT = 1920;
        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          if (width > height) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          } else {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Canvas 2D Context를 생성할 수 없습니다.'));
        }

        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              return reject(new Error('WebP 변환에 실패했습니다.'));
            }
            
            // 기존 파일명에서 확장자를 제거하고 .webp로 명명
            const lastDotIndex = file.name.lastIndexOf('.');
            const originalNameWithoutExt = lastDotIndex !== -1 
              ? file.name.substring(0, lastDotIndex) 
              : file.name;

            const webpFile = new File([blob], `${originalNameWithoutExt}.webp`, {
              type: 'image/webp',
              lastModified: Date.now(),
            });
            resolve(webpFile);
          },
          'image/webp',
          quality
        );
      };
      img.onerror = () => reject(new Error('이미지 객체 로드에 실패했습니다.'));
      img.src = event.target?.result as string;
    };
    reader.onerror = () => reject(new Error('파일 리더 동작에 실패했습니다.'));
    reader.readAsDataURL(file);
  });
}

