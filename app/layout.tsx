// ============================================================
// app/layout.tsx — 루트 레이아웃
// ============================================================

import type { Metadata } from 'next';
import './globals.css';
import MatrixBackground from './components/MatrixBackground';

export const metadata: Metadata = {
  title: 'AI 레드팀 챌린지 — 사이버 워게임 통제실',
  description: 'AI 프롬프트 인젝션 공격 & 방어를 직접 체험하는 교육용 워게임 플랫폼',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-grid min-h-screen scanline-overlay">
        <MatrixBackground />
        <div style={{ position: 'relative', zIndex: 1, minHeight: '100vh' }}>
          {children}
        </div>
      </body>
    </html>
  );
}
