import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BPR · Badminton Player Record',
    short_name: 'BPR',
    description: '복식 경기 기록과 실시간 승률 순위표',
    start_url: '/',
    display: 'standalone',
    background_color: '#052d21',
    theme_color: '#0b6b45',
    orientation: 'portrait',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
