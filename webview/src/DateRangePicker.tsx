import { useCallback, useEffect, useRef } from 'react';
import flatpickr from 'flatpickr';
import type { Instance as FlatpickrInstance } from 'flatpickr/dist/types/instance';
import type { Options as FlatpickrOptions } from 'flatpickr/dist/types/options';
import { clampMonthYear, formatMonthYear, parseMonthYear } from './monthYearInput';

/**
 * A single date field backed by flatpickr.
 *
 * flatpickr owns the input's value, so this component is intentionally
 * uncontrolled: it only pushes external value changes into the instance and
 * reports user edits back through `onChange`. The value contract stays
 * `'YYYY-MM-DD'` or `''`, which is what the toolbar previously hand-rolled
 * with `formatDatePickerInput`.
 */
export interface DateFieldProps {
  id: string;
  label: string;
  ariaLabel: string;
  value: string;
  onChange(value: string): void;
  /** Lower bound (inclusive) enforced by the calendar. */
  minDate?: string | undefined;
  /** Upper bound (inclusive) enforced by the calendar. */
  maxDate?: string | undefined;
}

export function DateField({
  id,
  label,
  ariaLabel,
  value,
  onChange,
  minDate,
  maxDate,
}: DateFieldProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const instanceRef = useRef<FlatpickrInstance | null>(null);
  /**
   * The combined `YYYY-MM` field shown in the calendar header. flatpickr builds
   * its own month <select> and year number input into `.flatpickr-current-month`;
   * we hide those with CSS and mount this input in their place so a single
   * editable field covers both, with the prev/next arrows still stepping months.
   */
  const monthYearRef = useRef<HTMLInputElement | null>(null);
  // Keep the latest callback without re-creating the flatpickr instance.
  // Assigned in an effect (not during render) to satisfy react-hooks/refs.
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const options: FlatpickrOptions = {
      dateFormat: 'Y-m-d',
      // Typing is deliberately disabled. With allowInput, flatpickr leaves
      // rejected text (out-of-range or unparsable) sitting in the field and
      // never fires onChange, so the input and React state drift apart.
      // Without it the field reverts to the last valid value on blur and the
      // calendar click is the only way to commit a date.
      allowInput: false,
      // The popover lives inside the filter menu; anchoring it to the field
      // avoids fighting the menu's own positioning logic.
      position: 'auto',
      disableMobile: true,
      onChange: (_dates, dateString) => {
        onChangeRef.current(dateString);
      },
      // Both hooks fire whenever the displayed month changes — including via the
      // prev/next arrows and the hook-based redraws — which is what keeps the
      // combined field in sync.
      onMonthChange: syncMonthYearField,
      onYearChange: syncMonthYearField,
      onOpen: syncMonthYearField,
    };

    function syncMonthYearField(this: FlatpickrInstance): void {
      refreshMonthYearField(this);
    }

    if (minDate) options.minDate = minDate;
    if (maxDate) options.maxDate = maxDate;

    const instance = flatpickr(input, options);
    instanceRef.current = instance;
    mountMonthYearField(instance);

    return () => {
      monthYearRef.current?.remove();
      monthYearRef.current = null;
      instance.destroy();
      instanceRef.current = null;
    };
    // Mount-only by design. minDate/maxDate are read once for the initial
    // options and then kept in sync by the effect below; folding them into this
    // dependency array would tear down and recreate flatpickr on every bound
    // change, closing a calendar the user has open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Writes the calendar's current month into the combined field.
   *
   * Skips a focused field so it never clobbers a draft the user is mid-way
   * through typing — flatpickr's arrows move the calendar and blur the field,
   * and its own redraws fire the same hooks.
   */
  const refreshMonthYearField = useCallback((instance: FlatpickrInstance): void => {
    const field = monthYearRef.current;
    if (!field) return;
    if (field.ownerDocument.activeElement === field) return;
    field.value = formatMonthYear(instance.currentYear, instance.currentMonth);
  }, []);

  /**
   * Moves the calendar to an absolute year+month and refreshes the field.
   *
   * flatpickr's mutators are order-sensitive and cannot be composed naively:
   * `changeYear` clamps `currentMonth` itself whenever the new year equals a
   * bound's year, and `changeMonth` rolls the year over on its own when the
   * target month lands outside 0-11. Setting the year first and then correcting
   * only the month keeps the two guards from fighting; the delta is taken
   * against the month flatpickr actually settled on, not the one requested.
   */
  const setDisplayedMonth = useCallback(
    (instance: FlatpickrInstance, year: number, monthIndex: number): void => {
      instance.changeYear(year);
      // `changeYear` may have reined the month in to satisfy a bound.
      if (instance.currentMonth !== monthIndex) {
        instance.changeMonth(monthIndex - instance.currentMonth);
      }
      refreshMonthYearField(instance);
    },
    [refreshMonthYearField],
  );

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    instance.set('minDate', minDate);
    instance.set('maxDate', maxDate);
    // Bounds may have narrowed past the displayed month; snap the calendar back
    // into range so it never shows a month flatpickr would refuse to open.
    const clamped = clampMonthYear(instance.currentYear, instance.currentMonth, minDate, maxDate);
    if (clamped.year !== instance.currentYear || clamped.monthIndex !== instance.currentMonth) {
      setDisplayedMonth(instance, clamped.year, clamped.monthIndex);
    }
  }, [minDate, maxDate, setDisplayedMonth]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    if (instance.input.value === value) return;
    instance.setDate(value, false);
  }, [value]);

  /**
   * Builds the combined field and inserts it into the calendar header, in place
   * of flatpickr's own month/year controls.
   */
  function mountMonthYearField(instance: FlatpickrInstance): void {
    if (!instance.monthNav) return;
    const container = instance.monthNav.querySelector<HTMLElement>('.flatpickr-current-month');
    if (!container) return;

    const field = instance.monthNav.ownerDocument.createElement('input');
    field.type = 'text';
    field.className = 'flatpickr-month-year-input';
    field.setAttribute('aria-label', 'Month and year');
    field.value = formatMonthYear(instance.currentYear, instance.currentMonth);

    // Keep the draft mid-edit: only validate once the user leaves the field, so
    // a half-typed `2026-1` is not rejected on the first keystroke.
    field.addEventListener('blur', commitMonthYearField);
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') field.blur();
      if (event.key === 'Escape') {
        // Abandon the draft and restore what the calendar is actually showing.
        refreshMonthYearForce();
        field.blur();
      }
    });

    container.appendChild(field);
    monthYearRef.current = field;

    /** Rewrites the field from the calendar, even while it holds focus. */
    function refreshMonthYearForce(): void {
      const current = instanceRef.current;
      if (!current) return;
      field.value = formatMonthYear(current.currentYear, current.currentMonth);
    }

    function commitMonthYearField(): void {
      const current = instanceRef.current;
      if (!current) return;
      const parsed = parseMonthYear(field.value, minDate, maxDate);
      // An unparsable or out-of-range draft snaps to the nearest legal month,
      // which doubles as the correction for a typo the user already left.
      const target =
        parsed ?? clampMonthYear(current.currentYear, current.currentMonth, minDate, maxDate);
      setDisplayedMonth(current, target.year, target.monthIndex);
      // setDisplayedMonth skips a focused field, and this one still holds focus
      // for the duration of the blur handler, so write it here.
      refreshMonthYearForce();
    }
  }

  return (
    <label htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        ref={inputRef}
        type="text"
        aria-label={ariaLabel}
        readOnly
        defaultValue={value}
      />
    </label>
  );
}
