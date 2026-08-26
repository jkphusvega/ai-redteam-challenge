'use client';

// ============================================================
// app/admin/page.tsx — 관리자 로그인 페이지
// ============================================================

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;

    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (res.ok) {
        router.push('/admin/dashboard');
      } else {
        setError(data.error ?? '로그인에 실패했습니다.');
        setPassword('');
      }
    } catch {
      setError('서버 연결 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        className="card animate-scale-in"
        style={{ width: '100%', maxWidth: '400px' }}
      >
        {/* 아이콘 */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div
            style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              background: 'rgba(0, 200, 255, 0.1)',
              border: '2px solid rgba(0, 200, 255, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '28px',
              margin: '0 auto 16px',
            }}
          >
            🔑
          </div>
          <h1 style={{ margin: 0, fontSize: '22px', fontWeight: 700 }}>관리자 로그인</h1>
          <p style={{ margin: '6px 0 0', fontSize: '13px' }} className="text-muted">
            AI 레드팀 챌린지 관리자 전용
          </p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '13px', fontWeight: 600 }} className="text-cyan">
              관리자 비밀번호
            </label>
            <input
              className="input"
              type="password"
              placeholder="비밀번호 입력"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(''); }}
              autoFocus
            />
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: '13px' }} className="text-red animate-shake">
              ⚠ {error}
            </p>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading || !password}
            style={{ width: '100%', padding: '12px' }}
          >
            {loading ? (
              <>
                <div className="spinner" />
                확인 중...
              </>
            ) : (
              '로그인'
            )}
          </button>
        </form>

        <div style={{ marginTop: '20px', textAlign: 'center' }}>
          <a href="/" style={{ fontSize: '13px', color: 'var(--text-muted)', textDecoration: 'none' }}>
            ← 학생 화면으로 돌아가기
          </a>
        </div>
      </div>
    </main>
  );
}
