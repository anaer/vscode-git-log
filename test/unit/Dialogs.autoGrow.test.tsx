// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AutoGrowTextarea } from '../../webview/src/Dialogs';

// jsdom does not lay out text — `scrollHeight` is a fixed 0 — so a real
// auto-grow cannot be observed. Stub `scrollHeight` with a content-derived
// value (one line = LINE_HEIGHT) to make the height math deterministic and to
// exercise the +2px border-box compensation.
const LINE_HEIGHT = 18;

function stubScrollHeight(): void {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      const value = (this as unknown as HTMLTextAreaElement).value ?? '';
      const lines = value === '' ? 1 : value.split('\n').length;
      return lines * LINE_HEIGHT;
    },
  });
}

afterEach(() => {
  cleanup();
  delete (HTMLElement.prototype as unknown as { scrollHeight?: unknown }).scrollHeight;
});

function getTextbox(ariaLabel: string): HTMLTextAreaElement {
  return document.querySelector<HTMLTextAreaElement>(
    `textarea[aria-label="${ariaLabel}"]`,
  ) as HTMLTextAreaElement;
}

describe('AutoGrowTextarea content-adaptive height', () => {
  it('sizes a single-line message to one line plus the 2px border compensation', () => {
    stubScrollHeight();
    render(
      <AutoGrowTextarea ariaLabel="msg" value="Short subject" onValueChange={() => {}} />,
    );
    // 1 line * 18 + 2 (top/bottom 1px borders under border-box).
    expect(getTextbox('msg').style.height).toBe(`${LINE_HEIGHT + 2}px`);
  });

  it('grows with multi-line content', () => {
    stubScrollHeight();
    render(
      <AutoGrowTextarea
        ariaLabel="msg"
        value={'line one\nline two\nline three'}
        onValueChange={() => {}}
      />,
    );
    expect(getTextbox('msg').style.height).toBe(`${3 * LINE_HEIGHT + 2}px`);
  });

  it('recomputes the height when the value changes', () => {
    stubScrollHeight();
    const { rerender } = render(
      <AutoGrowTextarea ariaLabel="msg" value="one" onValueChange={() => {}} />,
    );
    expect(getTextbox('msg').style.height).toBe(`${LINE_HEIGHT + 2}px`);

    rerender(
      <AutoGrowTextarea ariaLabel="msg" value={'one\ntwo\nthree\nfour'} onValueChange={() => {}} />,
    );
    expect(getTextbox('msg').style.height).toBe(`${4 * LINE_HEIGHT + 2}px`);
  });

  it('treats an empty message as one line', () => {
    stubScrollHeight();
    render(<AutoGrowTextarea ariaLabel="msg" value="" onValueChange={() => {}} />);
    expect(getTextbox('msg').style.height).toBe(`${LINE_HEIGHT + 2}px`);
  });

  it('propagates typed values through onValueChange', () => {
    stubScrollHeight();
    const onValueChange = vi.fn();
    render(<AutoGrowTextarea ariaLabel="msg" value="a" onValueChange={onValueChange} />);
    fireEvent.change(getTextbox('msg'), { target: { value: 'typed body\nsecond line' } });
    expect(onValueChange).toHaveBeenCalledWith('typed body\nsecond line');
  });

  it('passes the disabled state through to the textarea', () => {
    stubScrollHeight();
    render(<AutoGrowTextarea ariaLabel="msg" value="a" disabled onValueChange={() => {}} />);
    expect(getTextbox('msg')).toBeDisabled();
  });
});
