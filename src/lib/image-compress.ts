'use client';

/**
 * Safely downscales and compresses images in the browser
 * to prevent iPadOS / iOS WKWebView memory overflow crashes (Guideline 2.1(a)).
 */
export async function compressImageForUpload(file: File | Blob, maxWidth = 1280, quality = 0.75): Promise<Blob> {
  return new Promise((resolve) => {
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new (window.Image || Image)();
        img.onload = () => {
          try {
            let width = img.width;
            let height = img.height;

            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');

            if (!ctx) {
              resolve(file);
              return;
            }

            ctx.drawImage(img, 0, 0, width, height);

            canvas.toBlob(
              (blob) => {
                if (blob) {
                  resolve(blob);
                } else {
                  resolve(file);
                }
              },
              'image/jpeg',
              quality
            );
          } catch (e) {
            console.warn('[ImageCompress] Canvas error, fallback to original', e);
            resolve(file);
          }
        };
        img.onerror = () => resolve(file);
        img.src = event.target?.result as string;
      };
      reader.onerror = () => resolve(file);
      reader.readAsDataURL(file);
    } catch (err) {
      console.warn('[ImageCompress] Fatal error, fallback to original', err);
      resolve(file);
    }
  });
}
