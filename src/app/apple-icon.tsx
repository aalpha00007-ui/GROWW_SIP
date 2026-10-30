// The Apple touch icon (iPhone and iPad home screens), made as a PNG at build time: the same app-style tile as the
// browser-tab icon (app/icon.svg), the logo's mark on white. iOS rounds the corners itself, so the square is full.
// An image has no stylesheet, so the token colours are written out: --logo-navy #172554, --logo-green #065f46.
import { ImageResponse } from 'next/og';
import { LOGO_PATH } from '@/components/logo';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
        <svg width="124" height="124" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="16" fill="#172554" />
          <path d={LOGO_PATH} fill="#065f46" />
        </svg>
      </div>
    ),
    size,
  );
}
