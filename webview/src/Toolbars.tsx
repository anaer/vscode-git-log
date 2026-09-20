import {
  Fragment,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import type { GitOperationRequest, LogFilters } from '../../src/protocol/messages';
import type { RepositorySummary } from '../../src/shared/models';
import { DateField } from './DateRangePicker';
import {
  Archive,
  Branch,
  Calendar,
  Close,
  CloudDownload,
  ForcePush,
  More,
  PanelLeft,
  PanelRight,
  Paths,
  Pull,
  Push,
  Refresh,
  Target,
  User,
} from './icons';

export type FilterPopupKind = 'branch' | 'user' | 'date' | 'paths';

const dateRangeOptions: readonly {
  label: string;
  kind: 'all' | 'today' | 'yesterday' | 'days';
  days?: number;
}[] = [
  { label: 'All time', kind: 'all' },
  { label: 'Today', kind: 'today' },
  { label: 'Yesterday', kind: 'yesterday' },
  { label: 'Last 7 days', kind: 'days', days: 7 },
  { label: 'Last 30 days', kind: 'days', days: 30 },
];

export interface AuthorFilterOption {
  key: string;
  label: string;
  value: string;
}

export interface CommitToolbarProps {
  history:
    | {
        kind: 'line' | 'file';
        path: string;
        startLine?: number;
        endLine?: number;
        notice?: string;
        entryCount: number;
      }
    | undefined;
  folderHistory: { path: string } | undefined;
  repositories: readonly RepositorySummary[];
  selectedRepositoryId: string | undefined;
  selectedRepositoryOperationState: string | undefined;
  onOpenSourceControl(): void;
  refs: readonly { fullName: string; shortName: string }[];
  filters: LogFilters;
  filterPopup: FilterPopupKind | undefined;
  filterPopoverPosition: CSSProperties | undefined;
  authorFilterOptions: readonly AuthorFilterOption[];
  customDateFrom: string;
  customDateTo: string;
  searchRef: RefObject<HTMLInputElement | null>;
  onSelectRepository(repositoryId: string): void;
  onApplyFilters(filters: LogFilters, debounce?: boolean): void;
  onApplyDateRange(dateFrom?: number, dateTo?: number): void;
  onFilterPopupChange(
    popup: FilterPopupKind | undefined,
    anchor?: { left: number; top: number },
  ): void;
  onCustomDateFromChange(value: string): void;
  onCustomDateToChange(value: string): void;
  onFocusLog(): void;
  onSwitchHistoryToFile(): void;
  onBackToLog(): void;
  onCloseHistory(): void;
  onCloseFolderHistory(): void;
  onResetFilters(): void;
}

function operationStateLabel(state: string): string {
  return state === 'rebase' ? 'Rebasing' : state;
}

export function CommitToolbar({
  history,
  folderHistory,
  repositories,
  selectedRepositoryId,
  selectedRepositoryOperationState,
  onOpenSourceControl,
  refs,
  filters,
  filterPopup,
  filterPopoverPosition,
  authorFilterOptions,
  customDateFrom,
  customDateTo,
  searchRef,
  onSelectRepository,
  onApplyFilters,
  onApplyDateRange,
  onFilterPopupChange,
  onCustomDateFromChange,
  onCustomDateToChange,
  onFocusLog,
  onSwitchHistoryToFile,
  onBackToLog,
  onCloseHistory,
  onCloseFolderHistory,
  onResetFilters,
}: CommitToolbarProps) {
  const toggleFilterPopup = (
    popup: FilterPopupKind,
    event: ReactMouseEvent<HTMLButtonElement>,
  ): void => {
    if (filterPopup === popup) {
      onFilterPopupChange(undefined);
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    onFilterPopupChange(popup, { left: bounds.left, top: bounds.bottom });
  };
  return (
    <header
      className={`filter-bar${history || folderHistory ? ' history-active' : ''}`}
      role="toolbar"
      aria-label="Git log filters"
    >
      {history ? (
        <div className="history-toolbar">
          <strong>
            {history.kind === 'file' ? 'File History' : 'Line History'} · {history.path}
            {history.startLine !== undefined
              ? ` : ${String(history.startLine)}–${String(history.endLine ?? history.startLine)}`
              : ''}
          </strong>
          {history.notice && history.entryCount ? (
            <span className="history-notice">{history.notice}</span>
          ) : null}
          {history.kind === 'line' ? (
            <button
              type="button"
              aria-label="Show file history"
              title="Show complete file history"
              onClick={onSwitchHistoryToFile}
            >
              File History
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Back to log"
            title="Return to the Git log"
            onClick={onBackToLog}
          >
            Back
          </button>
          <button
            type="button"
            aria-label="Close history"
            title="Close history and return to the Git log"
            onClick={onCloseHistory}
          >
            Close
          </button>
        </div>
      ) : null}
      {folderHistory ? (
        <div className="history-toolbar history-toolbar--folder">
          <strong>
            Folder History ·{' '}
            {folderHistory.path === '.' ? 'Repository Root' : folderHistory.path}
          </strong>
          <button
            className="history-toolbar-close"
            type="button"
            aria-label="Close folder history"
            title="Restore the previous Git log filters"
            onClick={onCloseFolderHistory}
          >
            {Close}
          </button>
        </div>
      ) : null}
      {repositories.length > 1 ? (
        <div className="field repository-field">
          <span className="sr-only">Repository</span>
          <select
            aria-label="Repository"
            value={selectedRepositoryId ?? ''}
            onChange={(event) => onSelectRepository(event.target.value)}
          >
            <option value="" disabled>
              Select repository
            </option>
            {repositories.map((repository) => (
              <option value={repository.id} key={repository.id}>
                {repository.displayName}
                {repository.operationState
                  ? ` · ${operationStateLabel(repository.operationState)}`
                  : ''}
              </option>
            ))}
          </select>
          {selectedRepositoryOperationState && selectedRepositoryOperationState !== 'rebase' ? (
            <button
              className="operation-badge"
              type="button"
              aria-label="Open Source Control"
              title="Open Source Control"
              onClick={onOpenSourceControl}
            >
              {operationStateLabel(selectedRepositoryOperationState)}
            </button>
          ) : null}
        </div>
      ) : selectedRepositoryOperationState && selectedRepositoryOperationState !== 'rebase' ? (
        <button
          className="operation-badge"
          type="button"
          aria-label="Open Source Control"
          title="Open Source Control"
          onClick={onOpenSourceControl}
        >
          {operationStateLabel(selectedRepositoryOperationState)}
        </button>
      ) : null}
      <label className="field search-field">
        <input
          ref={searchRef}
          type="search"
          aria-label="Text or hash"
          placeholder="Text or hash"
          value={filters.text}
          onChange={(event) => onApplyFilters({ ...filters, text: event.target.value }, true)}
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            if (filters.text) {
              onApplyFilters({ ...filters, text: '' });
            } else {
              onFocusLog();
            }
          }}
        />
      </label>
      <button
        type="button"
        data-popup-trigger="true"
        aria-label="Filter by branch"
        title="Filter by branch"
        className={filters.branches.length ? 'filter-active' : ''}
        onClick={(event) => toggleFilterPopup('branch', event)}
      >
        {Branch}
        {filters.branches.length ? (
          <span className="filter-badge" aria-hidden="true">
            {String(filters.branches.length)}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        data-popup-trigger="true"
        aria-label="Filter by author"
        title="Filter by author"
        className={filters.authors.length ? 'filter-active' : ''}
        onClick={(event) => toggleFilterPopup('user', event)}
      >
        {User}
        {filters.authors.length ? (
          <span className="filter-badge" aria-hidden="true">
            {String(filters.authors.length)}
          </span>
        ) : null}
      </button>
      <button
        type="button"
        data-popup-trigger="true"
        aria-label="Filter by date range"
        title="Filter by date range"
        className={filters.dateFrom || filters.dateTo ? 'filter-active' : ''}
        onClick={(event) => toggleFilterPopup('date', event)}
      >
        {Calendar}
      </button>
      <button
        type="button"
        data-popup-trigger="true"
        aria-label="Filter by path"
        title="Filter by path"
        className={filters.paths.length ? 'filter-active' : ''}
        onClick={(event) => toggleFilterPopup('paths', event)}
      >
        {Paths}
        {filters.paths.length ? (
          <span className="filter-badge" aria-hidden="true">
            {String(filters.paths.length)}
          </span>
        ) : null}
      </button>
      {filterPopup ? (
        <div
          className={`filter-popover filter-${filterPopup}`}
          role="dialog"
          aria-label={`${filterPopup} filter`}
          style={filterPopoverPosition}
        >
          {filterPopup === 'branch' ? (
            <>
              <div className="filter-popover-title">Branches</div>
              {refs.length ? (
                refs.map((ref) => (
                  <label className="filter-option" key={ref.fullName}>
                    <input
                      type="checkbox"
                      checked={filters.branches.includes(ref.fullName)}
                      onChange={() => {
                        const branches = filters.branches.includes(ref.fullName)
                          ? filters.branches.filter((branch) => branch !== ref.fullName)
                          : [...filters.branches, ref.fullName];
                        onApplyFilters({ ...filters, branches });
                      }}
                    />
                    <span>{ref.shortName}</span>
                  </label>
                ))
              ) : (
                <span className="filter-empty">No refs loaded</span>
              )}
            </>
          ) : null}
          {filterPopup === 'user' ? (
            <>
              <div className="filter-popover-title">Authors</div>
              {authorFilterOptions.map((author) => (
                <label className="filter-option" key={author.key}>
                  <input
                    type="checkbox"
                    checked={filters.authors.includes(author.value)}
                    onChange={() => {
                      const authors = filters.authors.includes(author.value)
                        ? filters.authors.filter((candidate) => candidate !== author.value)
                        : [...filters.authors, author.value];
                      onApplyFilters({ ...filters, authors });
                    }}
                  />
                  <span>{author.label}</span>
                </label>
              ))}
            </>
          ) : null}
          {filterPopup === 'date' ? (
            <div className="date-options">
              {dateRangeOptions.map((option) => (
                <button
                  type="button"
                  key={option.label}
                  onClick={() => {
                    const now = new Date();
                    const today =
                      new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
                    if (option.kind === 'all') onApplyDateRange();
                    else if (option.kind === 'today') onApplyDateRange(today, today + 24 * 60 * 60);
                    else if (option.kind === 'yesterday') {
                      onApplyDateRange(today - 24 * 60 * 60, today);
                    } else {
                      onApplyDateRange(
                        Math.floor(Date.now() / 1000) - (option.days ?? 0) * 24 * 60 * 60,
                      );
                    }
                  }}
                >
                  {option.label}
                </button>
              ))}
              <div className="custom-date-range">
                <DateField
                  id="custom-date-from"
                  label="From"
                  ariaLabel="Custom date from"
                  value={customDateFrom}
                  maxDate={customDateTo || undefined}
                  onChange={onCustomDateFromChange}
                />
                <DateField
                  id="custom-date-to"
                  label="To"
                  ariaLabel="Custom date to"
                  value={customDateTo}
                  minDate={customDateFrom || undefined}
                  onChange={onCustomDateToChange}
                />
                {customDateFrom || customDateTo ? (
                  <div className="custom-date-preview" aria-live="polite">
                    {`${customDateFrom || '…'} → ${customDateTo || '…'}`}
                  </div>
                ) : null}
                <button
                  type="button"
                  disabled={!customDateFrom && !customDateTo}
                  onClick={() => {
                    // Both fields are flatpickr-backed, so each value is either
                    // an empty string or a valid 'YYYY-MM-DD' date.
                    const from = customDateFrom
                      ? Math.floor(new Date(`${customDateFrom}T00:00:00`).getTime() / 1000)
                      : undefined;
                    const to = customDateTo
                      ? Math.floor(new Date(`${customDateTo}T23:59:59`).getTime() / 1000)
                      : undefined;
                    onApplyDateRange(from, to);
                  }}
                >
                  Apply custom range
                </button>
              </div>
            </div>
          ) : null}
          {filterPopup === 'paths' ? (
            <label className="path-filter-field">
              <span>Git path</span>
              <input
                aria-label="Git path filter"
                value={filters.paths[0] ?? ''}
                placeholder="src/ or src/app.ts"
                onChange={(event) =>
                  onApplyFilters(
                    {
                      ...filters,
                      paths: event.target.value ? [event.target.value] : [],
                    },
                    true,
                  )
                }
              />
            </label>
          ) : null}
          <button
            type="button"
            className="reset-filters"
            onClick={() => {
              onResetFilters();
              onFilterPopupChange(undefined);
            }}
          >
            Reset filters
          </button>
        </div>
      ) : null}
    </header>
  );
}

export type GlobalToolbarAction =
  | 'refresh'
  | 'goToHead'
  | 'fetch'
  | 'stashes'
  | 'toggleRefs'
  | 'toggleFiles'
  | 'pull'
  | 'push'
  | 'forcePush';

export const GLOBAL_TOOLBAR_ACTIONS: readonly GlobalToolbarAction[] = [
  'refresh',
  'goToHead',
  'fetch',
  'stashes',
  'toggleRefs',
  'toggleFiles',
  'pull',
  'push',
  'forcePush',
];

// An action button is a 16px icon with 9px horizontal padding on each side.
export const TOOLBAR_ACTION_WIDTH = 34;
export const TOOLBAR_ACTION_GAP = 6;

export interface GlobalToolbarMetrics {
  visibleCount: number;
  contentWidth: number;
}

// Tracks the global toolbar layout: how many of the action buttons fit beside
// the More button for a given available content width. Actions overflow from
// the right (the last action is hidden first). The More button is counted into
// contentWidth whenever it renders — i.e. whenever any action overflows — so
// that even a lone More button at extreme narrow width reserves its own space
// and never masks the filter bar.
export function globalToolbarMetrics(available: number): GlobalToolbarMetrics {
  const total = GLOBAL_TOOLBAR_ACTIONS.length;
  let visibleCount = 0;
  while (visibleCount < total) {
    const next = visibleCount + 1;
    // next action buttons + (next - 1) gaps between them, then the gap and the
    // More button that trail them while at least one action still overflows.
    const actionsWidth = next * TOOLBAR_ACTION_WIDTH + (next - 1) * TOOLBAR_ACTION_GAP;
    const withMore = actionsWidth + TOOLBAR_ACTION_WIDTH + TOOLBAR_ACTION_GAP;
    if (withMore > available) break;
    visibleCount = next;
  }
  const contentWidth =
    visibleCount === total
      ? // Every action shows directly, so the More button is not rendered.
        total * TOOLBAR_ACTION_WIDTH + (total - 1) * TOOLBAR_ACTION_GAP
      : // visibleCount direct buttons plus the always-rendered More button.
        (visibleCount + 1) * TOOLBAR_ACTION_WIDTH + visibleCount * TOOLBAR_ACTION_GAP;
  return { visibleCount, contentWidth };
}

export interface GlobalToolbarProps {
  hasHead: boolean;
  canRunOperations: boolean;
  operationInFlight: boolean;
  gitWriteBlocked: boolean;
  publishesBranch: boolean;
  currentBranch: string | undefined;
  refsCollapsed: boolean;
  filesCollapsed: boolean;
  visibleActions: readonly GlobalToolbarAction[];
  overflowedActions: readonly GlobalToolbarAction[];
  moreActionsExpanded: boolean;
  onRefresh(): void;
  onGoToHead(): void;
  onFetch(): void;
  onManageStashes(): void;
  onToggleRefsPane(): void;
  onToggleFilesPane(): void;
  onRunOperation(operation: GitOperationRequest): void;
  onToggleMoreActions(anchor: { right: number; bottom: number }): void;
}

export function GlobalToolbar({
  hasHead,
  canRunOperations,
  operationInFlight,
  gitWriteBlocked,
  publishesBranch,
  currentBranch,
  refsCollapsed,
  filesCollapsed,
  visibleActions,
  overflowedActions,
  moreActionsExpanded,
  onRefresh,
  onGoToHead,
  onFetch,
  onManageStashes,
  onToggleRefsPane,
  onToggleFilesPane,
  onRunOperation,
  onToggleMoreActions,
}: GlobalToolbarProps) {
  const renderAction = (action: GlobalToolbarAction): ReactNode => {
    switch (action) {
      case 'refresh':
        return (
          <button
            type="button"
            aria-label="Refresh log"
            title="Refresh local repository state"
            onClick={onRefresh}
          >
            {Refresh}
          </button>
        );
      case 'goToHead':
        return (
          <button
            type="button"
            aria-label="Go to HEAD"
            title="Locate the current HEAD commit"
            disabled={!hasHead}
            onClick={onGoToHead}
          >
            {Target}
          </button>
        );
      case 'fetch':
        return (
          <button
            type="button"
            aria-label="Fetch remotes"
            title="Fetch from remotes"
            disabled={!canRunOperations || operationInFlight}
            onClick={onFetch}
          >
            {CloudDownload}
          </button>
        );
      case 'stashes':
        return (
          <button
            type="button"
            aria-label="Manage stashes"
            title="Create, inspect, apply, pop, or drop stashes"
            disabled={!canRunOperations}
            onClick={onManageStashes}
          >
            {Archive}
          </button>
        );
      case 'toggleRefs':
        return (
          <button
            type="button"
            aria-label={`${refsCollapsed ? 'Expand' : 'Collapse'} references pane`}
            title={`${refsCollapsed ? 'Expand' : 'Collapse'} references pane`}
            onClick={onToggleRefsPane}
          >
            {PanelLeft}
          </button>
        );
      case 'toggleFiles':
        return (
          <button
            type="button"
            aria-label={`${filesCollapsed ? 'Expand' : 'Collapse'} changed files pane`}
            title={`${filesCollapsed ? 'Expand' : 'Collapse'} changed files pane`}
            onClick={onToggleFilesPane}
          >
            {PanelRight}
          </button>
        );
      case 'pull':
        return (
          <button
            type="button"
            aria-label="Pull from remote"
            title="Pull the current branch from its remote"
            disabled={!canRunOperations || operationInFlight || gitWriteBlocked || !currentBranch}
            onClick={() => onRunOperation({ kind: 'pull' })}
          >
            {Pull}
          </button>
        );
      case 'push':
        return (
          <button
            type="button"
            aria-label={publishesBranch ? 'Publish branch' : 'Push to remote'}
            title={
              publishesBranch ? 'Push this branch and set its upstream' : 'Push the current branch'
            }
            disabled={!canRunOperations || operationInFlight || gitWriteBlocked || !currentBranch}
            onClick={() => onRunOperation({ kind: publishesBranch ? 'publishBranch' : 'push' })}
          >
            {Push}
          </button>
        );
      case 'forcePush':
        return (
          <button
            type="button"
            aria-label="Force push current branch"
            title="Force push the current branch with lease"
            disabled={!canRunOperations || operationInFlight || gitWriteBlocked || !currentBranch}
            onClick={() => onRunOperation({ kind: 'push', forceWithLease: true })}
          >
            {ForcePush}
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <header className="global-toolbar" role="toolbar" aria-label="Global Git actions">
      {visibleActions.map((action) => (
        <Fragment key={action}>{renderAction(action)}</Fragment>
      ))}
      {overflowedActions.length > 0 ? (
        <button
          type="button"
          data-popup-trigger="true"
          aria-label="More actions"
          title="More Git actions"
          aria-haspopup="menu"
          aria-expanded={moreActionsExpanded}
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            onToggleMoreActions({ right: bounds.right, bottom: bounds.bottom + 2 });
          }}
        >
          {More}
        </button>
      ) : null}
    </header>
  );
}
