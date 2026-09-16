// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { EditCommitMessagesEditor } from '../../webview/src/Dialogs';

const HASH_A = 'a'.repeat(40);
const HASH_B = 'b'.repeat(40);
const SHORT_A = HASH_A.slice(0, 12);
const SHORT_B = HASH_B.slice(0, 12);

afterEach(cleanup);

// Stateful parent so we can assert an edit to one commit survives navigating
// away and back — the paging is a pure view concern over the shared edits array.
function Harness(): ReactElement {
  const [edits, setEdits] = useState([
    { hash: HASH_A, message: 'first body' },
    { hash: HASH_B, message: 'second body' },
  ]);
  return (
    <EditCommitMessagesEditor
      edits={edits}
      loading={false}
      onEditMessageChange={(index, value) =>
        setEdits((prev) => prev.map((entry, i) => (i === index ? { ...entry, message: value } : entry)))
      }
    />
  );
}

describe('EditCommitMessagesEditor one-at-a-time paging', () => {
  it('shows only the first commit initially with a disabled previous arrow', () => {
    render(<Harness />);
    expect(screen.getByLabelText(`Commit message ${SHORT_A}`)).toHaveValue('first body');
    expect(screen.queryByLabelText(`Commit message ${SHORT_B}`)).not.toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous commit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next commit' })).toBeEnabled();
  });

  it('advances to the next commit and disables the next arrow at the end', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Next commit' }));
    expect(screen.getByLabelText(`Commit message ${SHORT_B}`)).toHaveValue('second body');
    expect(screen.queryByLabelText(`Commit message ${SHORT_A}`)).not.toBeInTheDocument();
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next commit' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Previous commit' })).toBeEnabled();
  });

  it('preserves an edit when navigating away and back', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Next commit' }));
    fireEvent.change(screen.getByLabelText(`Commit message ${SHORT_B}`), {
      target: { value: 'edited second' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Previous commit' }));
    expect(screen.getByLabelText(`Commit message ${SHORT_A}`)).toHaveValue('first body');
    fireEvent.click(screen.getByRole('button', { name: 'Next commit' }));
    expect(screen.getByLabelText(`Commit message ${SHORT_B}`)).toHaveValue('edited second');
  });
});
