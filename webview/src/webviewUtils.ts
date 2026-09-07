import type { CSSProperties } from 'react';

export function requestId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function contextMenuPosition(x: number, y: number): CSSProperties {
  const margin = 4;
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const horizontal =
    x > viewportWidth / 2
      ? { right: Math.max(margin, viewportWidth - x) }
      : { left: Math.max(margin, x) };
  const vertical =
    y > viewportHeight / 2
      ? { bottom: Math.max(margin, viewportHeight - y) }
      : { top: Math.max(margin, y) };
  return { ...horizontal, ...vertical };
}