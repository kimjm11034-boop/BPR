import type { Metadata } from 'next';
import './globals.css';
import { ServiceWorkerRegistration } from '@/components/pwa/ServiceWorkerRegistration';

export const metadata: Metadata = {
  title: 'BPR · Badminton Player Record',
  description: '복식 경기 기록과 개인 승률 순위',
  icons: {
    icon: '/icons/icon-512.png',
    apple: '/icons/icon-512.png',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}<ServiceWorkerRegistration /></body>
    </html>
  );
}
