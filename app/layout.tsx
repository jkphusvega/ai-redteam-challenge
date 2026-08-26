// ============================================================
// app/layout.tsx — 루트 레이아웃
// ============================================================

import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI 레드팀 챌린지',
  description: 'AI 보안을 직접 체험하는 교육용 게임 플랫폼',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className="bg-grid min-h-screen">
        {children}
      </body>
    </html>
  );
}
