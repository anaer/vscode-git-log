// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CommitDetails } from '../../src/shared/models';
import { DetailsPane } from '../../webview/src/DetailsPane';

afterEach(cleanup);

function renderWithBody(body: string): HTMLElement {
  const details: CommitDetails = {
    hash: 'abcdef1234567890',
    parents: [],
    subject: 'Add feature',
    body,
    authorName: 'Alice',
    authorEmail: 'alice@example.com',
    authorTime: 1_700_000_000,
    commitTime: 1_700_000_000,
    committerName: 'Alice',
    committerEmail: 'alice@example.com',
    refs: [],
    signature: 'none',
  };
  const { container } = render(
    <DetailsPane
      details={details}
      detailsInChanges={false}
      detailsHeight={160}
      detailsRepositoryId="repo-1"
      onCopyHash={vi.fn()}
      detailsHashCopyState="idle"
      onTogglePlacement={vi.fn()}
      onSelectHash={vi.fn()}
      onResizeStart={vi.fn()}
      onResizeKeyDown={vi.fn()}
      runOperation={vi.fn()}
      selectedRepository={{ isBare: false }}
      selectedOperationInFlight={false}
    />,
  );
  return container;
}

describe('DetailsPane multi-line commit message rendering', () => {
  it('renders the body verbatim (subject removed, line breaks and blank lines preserved)', () => {
    const container = renderWithBody(
      'Add feature\n\n- bullet one\n- bullet two\n\nTrailer line below.\nSigned-off-by: Alice <a@b.c>\n',
    );

    const body = container.querySelector('.details-body');
    expect(body).not.toBeNull();
    // Subject line is shown separately, so the body block starts after it and
    // keeps every internal newline and the blank line between sections.
    expect(body?.textContent).toBe(
      '- bullet one\n- bullet two\n\nTrailer line below.\nSigned-off-by: Alice <a@b.c>',
    );
  });

  it('uses a single pre-wrapped block instead of per-line <p> elements', () => {
    const container = renderWithBody('Add feature\n\nline one\nline two\n');
    expect(container.querySelectorAll('.details-body p')).toHaveLength(0);
  });

  it('does not render an empty body block when the message is subject-only', () => {
    const container = renderWithBody('Add feature\n');
    expect(container.querySelector('.details-body')).toBeNull();
  });
});
