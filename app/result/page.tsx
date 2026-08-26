'use client';

// ============================================================
// app/result/page.tsx — 결과 요약 페이지
// ============================================================

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { STAGES } from '@/lib/stagePrompts';

export default function ResultPage() {
  const router = useRouter();
  const [teamName, setTeamName] = useState('');
  const [completedStages, setCompletedStages] = useState<number[]>([]);

  useEffect(() => {
    const saved = localStorage.getItem('teamName');
    if (saved) setTeamName(saved);

    const stages = localStorage.getItem('completedStages');
    if (stages) {
      try {
        setCompletedStages(JSON.parse(stages));
      } catch { /* 무시 */ }
    }
  }, []);

  const allCompleted = completedStages.length === STAGES.length;

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        gap: '32px',
      }}
    >
      {/* 헤더 */}
      <div className="animate-fade-in-up" style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '64px', marginBottom: '16px' }}>
          {allCompleted ? '🏆' : '📊'}
        </div>
        <h1 style={{ fontSize: '32px', fontWeight: 900, margin: 0 }}>
          {allCompleted ? (
            <span className="gradient-text-green">챌린지 완료!</span>
          ) : (
            <span className="gradient-text-cyan">결과 요약</span>
          )}
        </h1>
        {teamName && (
          <p style={{ marginTop: '8px', fontSize: '16px' }} className="text-secondary">
            🏷 팀: <strong>{teamName}</strong>
          </p>
        )}
      </div>

      {/* 스테이지 결과 카드 */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          gap: '16px',
          width: '100%',
          maxWidth: '600px',
        }}
        className="animate-fade-in-up delay-100"
      >
        {STAGES.map((stage) => {
          const done = completedStages.includes(stage.id);
          return (
            <div
              key={stage.id}
              className="card"
              style={{
                textAlign: 'center',
                borderColor: done ? 'rgba(0, 255, 136, 0.4)' : 'rgba(255, 59, 92, 0.25)',
                background: done ? 'rgba(0, 255, 136, 0.05)' : 'rgba(255, 59, 92, 0.03)',
              }}
            >
              <div style={{ fontSize: '40px', marginBottom: '8px' }}>
                {done ? '✅' : stage.emoji}
              </div>
              <div style={{ fontSize: '11px', fontWeight: 600 }} className="text-muted">
                STAGE {stage.id}
              </div>
              <div style={{ fontSize: '18px', fontWeight: 700, margin: '4px 0 8px' }}>
                {stage.title}
              </div>
              <span className={`badge ${done ? 'badge-green' : 'badge-red'}`}>
                {done ? '탈취 성공' : '도전 필요'}
              </span>
            </div>
          );
        })}
      </div>

      {/* 액션 버튼 */}
      <div
        style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}
        className="animate-fade-in-up delay-200"
      >
        <button className="btn btn-outline" onClick={() => router.push('/')}>
          🏠 홈으로
        </button>
        <button className="btn btn-ghost" onClick={() => router.push('/defense')}>
          🧱 방어 활동
        </button>
      </div>
    </main>
  );
}
