import type { CSSProperties } from 'react';

export function requestId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

/**
 * Returns a new set with `key` toggled (inserted if absent, removed if present).
 */
export function toggleSetMember<T>(set: ReadonlySet<T>, key: T): Set<T> {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

/**
 * Reconciles a set of collapsed folder keys with the folders that currently exist.
 *
 * Folders listed in `defaultCollapsedKeys` start out collapsed the first time they are
 * seen; every folder the user has explicitly toggled afterwards is preserved as-is. Keys
 * that no longer correspond to a live folder are dropped so the set cannot grow without
 * bound while repositories are switched.
 */
export function reconcileCollapsedFolders(
  current: ReadonlySet<string>,
  liveKeys: readonly string[],
  defaultCollapsedKeys: readonly string[],
  touchedKeys: ReadonlySet<string>,
): Set<string> {
  const live = new Set(liveKeys);
  const defaults = new Set(defaultCollapsedKeys);
  const next = new Set<string>();

  for (const key of live) {
    if (touchedKeys.has(key)) {
      if (current.has(key)) next.add(key);
    } else if (defaults.has(key)) {
      next.add(key);
    }
  }

  if (next.size === current.size) {
    let identical = true;
    for (const key of next) {
      if (!current.has(key)) {
        identical = false;
        break;
      }
    }
    if (identical) return current as Set<string>;
  }

  return next;
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