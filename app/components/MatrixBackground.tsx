'use client';

// ============================================================
// MatrixBackground.tsx — Canvas 기반 매트릭스 코드 스트림 배경
//
// 시안빛 바이너리/코드 스트림이 위에서 아래로 흐르고,
// 이따금 붉은 경고 글리치 스트림이 튀어나오는 사이버펑크 배경
// ============================================================

import { useEffect, useRef, useCallback } from 'react';

const CHARS = '01アイウエオカキクケコサシスセソタチツテトナニヌネノ{}[]<>/:;!@#$%^&*ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef0123456789';

interface Column {
  x: number;
  y: number;
  speed: number;
  chars: string[];
  isGlitch: boolean;
  glitchTimer: number;
  opacity: number;
  fontSize: number;
}

export default function MatrixBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const columnsRef = useRef<Column[]>([]);
  const animFrameRef = useRef<number>(0);

  const initColumns = useCallback((width: number, height: number) => {
    const columns: Column[] = [];
    const baseFontSize = 14;
    const columnCount = Math.floor(width / (baseFontSize * 0.8));

    for (let i = 0; i < columnCount; i++) {
      const fontSize = baseFontSize + Math.random() * 4 - 2;
      const charCount = Math.floor(height / fontSize) + 5;
      const chars: string[] = [];
      for (let j = 0; j < charCount; j++) {
        chars.push(CHARS[Math.floor(Math.random() * CHARS.length)]);
      }

      columns.push({
        x: i * (width / columnCount),
        y: Math.random() * -height,
        speed: 0.5 + Math.random() * 2,
        chars,
        isGlitch: false,
        glitchTimer: 0,
        opacity: 0.15 + Math.random() * 0.2,
        fontSize,
      });
    }

    columnsRef.current = columns;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      initColumns(canvas.width, canvas.height);
    };

    resize();
    window.addEventListener('resize', resize);

    let lastTime = 0;

    const draw = (timestamp: number) => {
      const deltaTime = timestamp - lastTime;
      if (deltaTime < 33) {
        // ~30 FPS cap for performance
        animFrameRef.current = requestAnimationFrame(draw);
        return;
      }
      lastTime = timestamp;

      ctx.fillStyle = 'rgba(7, 10, 19, 0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const columns = columnsRef.current;

      for (const col of columns) {
        // Randomly trigger glitch (red) streams
        if (!col.isGlitch && Math.random() < 0.0005) {
          col.isGlitch = true;
          col.glitchTimer = 60 + Math.floor(Math.random() * 120);
        }

        if (col.isGlitch) {
          col.glitchTimer--;
          if (col.glitchTimer <= 0) {
            col.isGlitch = false;
          }
        }

        const baseColor = col.isGlitch ? [255, 42, 95] : [0, 240, 255];

        // Draw stream of characters
        const visibleChars = Math.min(20, col.chars.length);
        for (let j = 0; j < visibleChars; j++) {
          const charY = col.y + j * col.fontSize;
          if (charY < -col.fontSize || charY > canvas.height + col.fontSize) continue;

          // Head char is brighter
          const isHead = j === visibleChars - 1;
          const fadeOut = 1 - j / visibleChars;
          const alpha = isHead
            ? col.opacity * 2.5
            : col.opacity * fadeOut;

          ctx.font = `${col.fontSize}px 'JetBrains Mono', monospace`;
          ctx.fillStyle = isHead
            ? `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, ${Math.min(alpha, 1)})`
            : `rgba(${baseColor[0]}, ${baseColor[1]}, ${baseColor[2]}, ${Math.min(alpha, 0.6)})`;

          // Randomly mutate characters
          if (Math.random() < 0.04) {
            col.chars[j] = CHARS[Math.floor(Math.random() * CHARS.length)];
          }

          ctx.fillText(col.chars[j], col.x, charY);

          // Head glow effect
          if (isHead) {
            ctx.shadowColor = col.isGlitch
              ? 'rgba(255, 42, 95, 0.8)'
              : 'rgba(0, 240, 255, 0.8)';
            ctx.shadowBlur = 15;
            ctx.fillText(col.chars[j], col.x, charY);
            ctx.shadowBlur = 0;
          }
        }

        // Move column downward
        col.y += col.speed;

        // Reset when off-screen
        if (col.y > canvas.height + col.fontSize * 20) {
          col.y = Math.random() * -canvas.height * 0.5;
          col.speed = 0.5 + Math.random() * 2;
          col.opacity = 0.15 + Math.random() * 0.2;
        }
      }

      animFrameRef.current = requestAnimationFrame(draw);
    };

    animFrameRef.current = requestAnimationFrame(draw);

    // Pause when tab is hidden
    const handleVisibility = () => {
      if (document.hidden) {
        cancelAnimationFrame(animFrameRef.current);
      } else {
        lastTime = 0;
        animFrameRef.current = requestAnimationFrame(draw);
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [initColumns]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: -1,
        pointerEvents: 'none',
        opacity: 0.4,
      }}
      aria-hidden="true"
    />
  );
}
