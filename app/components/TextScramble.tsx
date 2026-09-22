'use client';

// ============================================================
// TextScramble.tsx — 텍스트 스크램블 디코딩 애니메이션
//
// 진입 시 기계어 난수/특수문자가 빠르게 전환되다가
// 한글/영문 텍스트로 안착되는 디코딩 효과
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react';

const SCRAMBLE_CHARS = '!@#$%^&*()_+-=[]{}|;:,.<>?/~`0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0x8F%#$@0101';

interface TextScrambleProps {
  text: string;
  /** Delay before animation starts (ms) */
  delay?: number;
  /** Duration of the scramble effect per character (ms) */
  duration?: number;
  /** Additional className */
  className?: string;
  /** Additional inline style */
  style?: React.CSSProperties;
  /** HTML tag to render */
  as?: keyof React.JSX.IntrinsicElements;
}

export default function TextScramble({
  text,
  delay = 0,
  duration = 50,
  className = '',
  style = {},
  as: Tag = 'span',
}: TextScrambleProps) {
  const [displayText, setDisplayText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const frameRef = useRef<number>(0);
  const startedRef = useRef(false);

  const scramble = useCallback(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const chars = text.split('');
    const totalChars = chars.length;
    const revealOrder: number[] = [];

    // Build reveal order (left to right with some randomness)
    for (let i = 0; i < totalChars; i++) {
      revealOrder.push(i);
    }

    let revealedCount = 0;
    const revealed = new Set<number>();
    let tick = 0;

    const animate = () => {
      tick++;

      // Reveal characters progressively
      const charsToReveal = Math.floor(tick / (duration / 16));
      while (revealedCount < charsToReveal && revealedCount < totalChars) {
        revealed.add(revealOrder[revealedCount]);
        revealedCount++;
      }

      // Build display string
      const result = chars
        .map((char, i) => {
          if (revealed.has(i)) return char;
          if (char === ' ') return ' ';
          return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        })
        .join('');

      setDisplayText(result);

      if (revealedCount >= totalChars) {
        setDisplayText(text);
        setIsComplete(true);
        return;
      }

      frameRef.current = requestAnimationFrame(animate);
    };

    frameRef.current = requestAnimationFrame(animate);
  }, [text, duration]);

  useEffect(() => {
    const timer = setTimeout(() => {
      scramble();
    }, delay);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frameRef.current);
    };
  }, [delay, scramble]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Component = Tag as any;

  return (
    <Component
      className={className}
      style={style}
    >
      {displayText || text}
    </Component>
  );
}
