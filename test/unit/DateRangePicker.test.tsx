// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DateField } from '../../webview/src/DateRangePicker';
import { epochSecondsToDateInput } from '../../webview/src/dateInput';

afterEach(() => {
  cleanup();
});

function renderField(props: Partial<Parameters<typeof DateField>[0]> = {}) {
  const onChange = vi.fn();
  const utils = render(
    <DateField
      id="custom-date-from"
      label="From"
      ariaLabel="Custom date from"
      value=""
      onChange={onChange}
      {...props}
    />,
  );
  const input = screen.getByLabelText('Custom date from') as HTMLInputElement;
  return { onChange, input, ...utils };
}

describe('DateField', () => {
  it('renders a labelled, read-only text input wired to the aria label', () => {
    const { input } = renderField();
    expect(input).toBeInTheDocument();
    expect(input.type).toBe('text');
    // Dates are committed from the calendar only, so the field is not typeable.
    expect(input.readOnly).toBe(true);
    expect(screen.getByText('From')).toBeInTheDocument();
  });

  it('reports a calendar selection as a YYYY-MM-DD string', () => {
    const { onChange } = renderField();
    const days = [...document.querySelectorAll<HTMLElement>('.flatpickr-day:not(.flatpickr-disabled)')];
    const target = days.find((day) => day.textContent?.trim() === '15');
    expect(target, 'expected a selectable day 15 in the calendar').toBeDefined();

    fireEvent.click(target as HTMLElement);

    expect(onChange).toHaveBeenCalled();
    const [value] = onChange.mock.calls.at(-1) as [string];
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
  });

describe('date picker survives the outside-click dismissal guard', () => {
  let dismissOpenMenus: ((event: Event) => void) | undefined;

  // The listener is registered on window and must be torn down even when an
  // assertion fails, so cleanup lives in afterEach rather than the success path.
  afterEach(() => {
    if (dismissOpenMenus) {
      window.removeEventListener('pointerdown', dismissOpenMenus);
      dismissOpenMenus = undefined;
    }
  });

  it('App keeps .flatpickr-calendar out of the outside-click dismiss list', async () => {
    // Source-level regression guard: App.tsx's global pointerdown handler must
    // keep .flatpickr-calendar alongside the other popovers in its "do not
    // dismiss" list. flatpickr mounts its calendar on document.body, outside
    // .filter-popover, so dropping this clause would let picking a day close the
    // menu before the selection reaches React state. Reading the source means a
    // weakened guard fails the test instead of silently passing a copied copy.
    const app = await readFile('webview/src/App.tsx', 'utf8');
    expect(
      app,
      'App must ignore the flatpickr calendar when dismissing popovers',
    ).toMatch(/\.flatpickr-calendar/su);
    // The clause has to live inside the same dismiss guard as the other popovers.
    expect(app).toMatch(
      /target\.closest\(\s*'\.context-menu'\s*\)[\s\S]*\.flatpickr-calendar/su,
    );
  });

  it('calendar day clicks fire the field change and are not dismissed', () => {
    const onChange = vi.fn();
    render(
      <div className="filter-popover">
        <DateField id="f" label="From" ariaLabel="From" value="" onChange={onChange} />
      </div>,
    );

    let dismissed = 0;
    dismissOpenMenus = (event: Event): void => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest('.context-menu') ||
        target.closest('.filter-popover') ||
        target.closest('.flatpickr-calendar') ||
        target.closest('[data-popup-trigger="true"]')
      ) {
        return;
      }
      dismissed += 1;
    };
    window.addEventListener('pointerdown', dismissOpenMenus);

    const day = [...document.querySelectorAll<HTMLElement>('.flatpickr-day')].find(
      (candidate) => candidate.textContent?.trim() === '15',
    );
    expect(day, 'expected a selectable day 15 in the calendar').toBeDefined();
    // A real selection fires pointerdown, then click.
    fireEvent.pointerDown(day as HTMLElement);
    fireEvent.click(day as HTMLElement);

    expect(dismissed, 'calendar clicks must not count as outside clicks').toBe(0);
    expect(onChange).toHaveBeenCalled();
  });
});

  it('keeps the input in sync with the reported value', () => {
    const { input, onChange } = renderField();
    const day = [...document.querySelectorAll<HTMLElement>('.flatpickr-day')].find(
      (candidate) => candidate.textContent?.trim() === '15',
    );
    fireEvent.click(day as HTMLElement);

    const [value] = onChange.mock.calls.at(-1) as [string];
    expect(input.value).toBe(value);
  });

  it('renders the calendar popover with the value pre-selected', () => {
    renderField({ value: '2026-09-07' });
    expect(document.querySelector('.flatpickr-calendar')).not.toBeNull();
    expect(document.querySelector('.flatpickr-day.selected')?.textContent?.trim()).toBe('7');
    expect(document.querySelectorAll('.flatpickr-weekday').length).toBe(7);
  });

  it('disables in-calendar days outside the minDate bound', () => {
    renderField({ minDate: '2026-09-07' });
    // The popover opens on the current month, which is before the bound.
    expect(document.querySelectorAll('.flatpickr-day.flatpickr-disabled').length).toBeGreaterThan(
      0,
    );
  });

  it('pushes external value changes into the flatpickr instance', () => {
    const { input, rerender } = renderField();
    rerender(
      <DateField
        id="custom-date-from"
        label="From"
        ariaLabel="Custom date from"
        value="2026-09-07"
        onChange={vi.fn()}
      />,
    );
    expect(input.value).toBe('2026-09-07');
  });

  it('clears the input when the value resets to empty', () => {
    const { input, rerender } = renderField({ value: '2026-09-07' });
    expect(input.value).toBe('2026-09-07');
    rerender(
      <DateField
        id="custom-date-from"
        label="From"
        ariaLabel="Custom date from"
        value=""
        onChange={vi.fn()}
      />,
    );
    expect(input.value).toBe('');
  });

  it('destroys the flatpickr instance on unmount without throwing', () => {
    const { unmount } = renderField();
    expect(() => {
      act(() => {
        unmount();
      });
    }).not.toThrow();
    expect(document.querySelector('.flatpickr-calendar')).toBeNull();
  });
});

describe('combined month and year field', () => {
  const monthYearInput = () =>
    document.querySelector<HTMLInputElement>('.flatpickr-month-year-input');

  it('replaces the native month select and year stepper with one editable field', () => {
    renderField({ value: '2026-09-07' });

    const field = monthYearInput();
    expect(field, 'expected the combined field to be mounted').not.toBeNull();
    expect(field?.value).toBe('2026-09');
    // The native controls stay in the DOM (flatpickr owns them) but are hidden.
    expect(document.querySelector('.flatpickr-monthDropdown-months')).not.toBeNull();
    expect(document.querySelector('.numInputWrapper')).not.toBeNull();
  });

  it('opens on the month of the selected date', () => {
    renderField({ value: '2026-09-07' });
    expect(monthYearInput()?.value).toBe('2026-09');
  });

  it('allows an intermediate draft while typing and only corrects it on blur', () => {
    renderField({ value: '2026-09-07' });
    const field = monthYearInput() as HTMLInputElement;

    // A half-typed value has to survive every keystroke — correcting eagerly
    // would fight the user before they finish typing.
    fireEvent.change(field, { target: { value: '202' } });
    expect(field.value).toBe('202');
    fireEvent.change(field, { target: { value: '2026-1' } });
    expect(field.value).toBe('2026-1');

    // Only on blur does the draft resolve. `2026-1` is a complete year+month, so
    // it commits as January rather than snapping back.
    fireEvent.blur(field);
    expect(field.value).toBe('2026-01');
  });

  it('snaps an incomplete draft back to the month the calendar is showing', () => {
    renderField({ value: '2026-09-07' });
    const field = monthYearInput() as HTMLInputElement;

    fireEvent.change(field, { target: { value: '2026-' } });
    fireEvent.blur(field);

    expect(field.value).toBe('2026-09');
  });

  it('jumps the calendar to a typed month on blur', () => {
    renderField({ value: '2026-09-07' });
    const field = monthYearInput() as HTMLInputElement;

    fireEvent.change(field, { target: { value: '2026-03' } });
    fireEvent.blur(field);

    expect(field.value).toBe('2026-03');
    // The grid must follow: March 2026 starts the week containing the 1st.
    const days = [...document.querySelectorAll('.flatpickr-day')].map((d) => d.textContent?.trim());
    expect(days.length).toBeGreaterThan(0);
  });

  it('clamps an out-of-range typed month to the nearest allowed month', () => {
    renderField({ value: '2026-09-07', minDate: '2026-09-07' });
    const field = monthYearInput() as HTMLInputElement;

    fireEvent.change(field, { target: { value: '2026-01' } });
    fireEvent.blur(field);

    // January is below the minDate, so it snaps forward to September.
    expect(field.value).toBe('2026-09');
  });

  it('rejects an unparsable draft and restores the current month', () => {
    renderField({ value: '2026-09-07' });
    const field = monthYearInput() as HTMLInputElement;

    fireEvent.change(field, { target: { value: 'not-a-month' } });
    fireEvent.blur(field);

    expect(field.value).toBe('2026-09');
  });

  it('rejects a month outside 1-12', () => {
    renderField({ value: '2026-09-07' });
    const field = monthYearInput() as HTMLInputElement;

    fireEvent.change(field, { target: { value: '2026-13' } });
    fireEvent.blur(field);

    expect(field.value).toBe('2026-09');
  });

  it('restores the current month on Escape instead of committing the draft', () => {
    renderField({ value: '2026-09-07' });
    const field = monthYearInput() as HTMLInputElement;

    fireEvent.change(field, { target: { value: '2030-01' } });
    fireEvent.keyDown(field, { key: 'Escape' });

    expect(field.value).toBe('2026-09');
  });

  it('keeps the field in step with the prev/next month arrows', () => {
    renderField({ value: '2026-09-07' });
    const field = monthYearInput() as HTMLInputElement;
    expect(field.value).toBe('2026-09');

    fireEvent.click(document.querySelector('.flatpickr-next-month') as HTMLElement);
    expect(field.value).toBe('2026-10');

    fireEvent.click(document.querySelector('.flatpickr-prev-month') as HTMLElement);
    fireEvent.click(document.querySelector('.flatpickr-prev-month') as HTMLElement);
    expect(field.value).toBe('2026-08');
  });

  it('rolls the year over when stepping past December', () => {
    renderField({ value: '2026-12-07' });
    const field = monthYearInput() as HTMLInputElement;
    expect(field.value).toBe('2026-12');

    fireEvent.click(document.querySelector('.flatpickr-next-month') as HTMLElement);
    expect(field.value).toBe('2027-01');
  });

  it('removes the injected field on unmount', () => {
    const { unmount } = renderField({ value: '2026-09-07' });
    expect(monthYearInput()).not.toBeNull();
    act(() => {
      unmount();
    });
    expect(monthYearInput()).toBeNull();
  });

  it('keeps the field in sync when a bound narrows past the displayed month', () => {
    const { rerender } = renderField({ value: '2026-09-07' });
    expect(monthYearInput()?.value).toBe('2026-09');

    rerender(
      <DateField
        id="custom-date-from"
        label="From"
        ariaLabel="Custom date from"
        value="2026-09-07"
        onChange={vi.fn()}
        maxDate="2026-05-20"
      />,
    );

    expect(monthYearInput()?.value).toBe('2026-05');
  });

  it('lands exactly on a forward bound that requires crossing a year', () => {
    // Regression: changeYear clamps currentMonth itself when the new year equals
    // a bound's year, and changeMonth rolls the year over on its own when the
    // target month falls outside 0-11. Applying month-then-year used to let the
    // two guards fight: a minDate of 2027-03 rendered 2027-11 instead of 2027-03.
    const { rerender } = renderField({ value: '2026-09-07' });
    expect(monthYearInput()?.value).toBe('2026-09');

    rerender(
      <DateField
        id="custom-date-from"
        label="From"
        ariaLabel="Custom date from"
        value="2026-09-07"
        onChange={vi.fn()}
        minDate="2027-03-01"
      />,
    );

    expect(monthYearInput()?.value).toBe('2027-03');
  });

  it('lands exactly on a backward bound that requires crossing a year', () => {
    const { rerender } = renderField({ value: '2026-01-07' });
    expect(monthYearInput()?.value).toBe('2026-01');

    rerender(
      <DateField
        id="custom-date-from"
        label="From"
        ariaLabel="Custom date from"
        value="2026-01-07"
        onChange={vi.fn()}
        maxDate="2025-11-20"
      />,
    );

    expect(monthYearInput()?.value).toBe('2025-11');
  });

  it('positions the calendar grid on the same month the field reports', () => {
    const { rerender } = renderField({ value: '2026-09-07' });
    rerender(
      <DateField
        id="custom-date-from"
        label="From"
        ariaLabel="Custom date from"
        value="2026-09-07"
        onChange={vi.fn()}
        minDate="2027-03-01"
      />,
    );

    // March has 31 days; a 30-day grid would mean the calendar drifted.
    const inMonthDays = [...document.querySelectorAll('.flatpickr-day')].filter(
      (day) => !day.classList.contains('prevMonthDay') && !day.classList.contains('nextMonthDay'),
    );
    expect(monthYearInput()?.value).toBe('2027-03');
    expect(inMonthDays).toHaveLength(31);
  });
});

describe('epochSecondsToDateInput', () => {
  it('renders a local date as YYYY-MM-DD', () => {
    // Local midnight, so the rendered day matches the picked day in any zone.
    const localMidnight = new Date(2026, 8, 7).getTime() / 1000;
    expect(epochSecondsToDateInput(localMidnight)).toBe('2026-09-07');
  });

  it('returns an empty string for absent or unusable values', () => {
    expect(epochSecondsToDateInput(undefined)).toBe('');
    expect(epochSecondsToDateInput(Number.NaN)).toBe('');
    expect(epochSecondsToDateInput(Number.POSITIVE_INFINITY)).toBe('');
  });

  it('zero-pads single-digit months and days', () => {
    expect(epochSecondsToDateInput(new Date(2026, 0, 5).getTime() / 1000)).toBe('2026-01-05');
  });
});
