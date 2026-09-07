import type { CSSProperties, RefObject } from 'react';
import type { LogFilters } from '../../src/protocol/messages';
import type { RepositorySummary } from '../../src/shared/models';

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
  onFilterPopupChange(popup: FilterPopupKind | undefined): void;
  onCustomDateFromChange(value: string): void;
  onCustomDateToChange(value: string): void;
  onFocusLog(): void;
  onSwitchHistoryToFile(): void;
  onBackToLog(): void;
  onCloseHistory(): void;
  onCloseFolderHistory(): void;
  onResetFilters(): void;
}

export function CommitToolbar({
  history,
  folderHistory,
  repositories,
  selectedRepositoryId,
  selectedRepositoryOperationState,
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
  const toggleFilterPopup = (popup: FilterPopupKind): void => {
    onFilterPopupChange(filterPopup === popup ? undefined : popup);
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
        <div className="history-toolbar">
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
            <span aria-hidden="true">×</span>
          </button>
        </div>
      ) : null}
      {repositories.length > 1 ? (
        <label className="field repository-field">
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
                {repository.operationState ? ` · ${repository.operationState}` : ''}
              </option>
            ))}
          </select>
          {selectedRepositoryOperationState ? (
            <span className="operation-badge">{selectedRepositoryOperationState}</span>
          ) : null}
        </label>
      ) : selectedRepositoryOperationState ? (
        <span className="operation-badge">{selectedRepositoryOperationState}</span>
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
        className={filters.branches.length ? 'filter-active' : ''}
        onClick={() => toggleFilterPopup('branch')}
      >
        Branch{filters.branches.length ? ` (${String(filters.branches.length)})` : ''}
      </button>
      <button
        type="button"
        data-popup-trigger="true"
        className={filters.authors.length ? 'filter-active' : ''}
        onClick={() => toggleFilterPopup('user')}
      >
        User{filters.authors.length ? ` (${String(filters.authors.length)})` : ''}
      </button>
      <button
        type="button"
        data-popup-trigger="true"
        className={filters.dateFrom || filters.dateTo ? 'filter-active' : ''}
        onClick={() => toggleFilterPopup('date')}
      >
        Date
      </button>
      <button
        type="button"
        data-popup-trigger="true"
        className={filters.paths.length ? 'filter-active' : ''}
        onClick={() => toggleFilterPopup('paths')}
      >
        Paths{filters.paths.length ? ` (${String(filters.paths.length)})` : ''}
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
                <label>
                  <span>From</span>
                  <input
                    type="date"
                    aria-label="Custom date from"
                    value={customDateFrom}
                    onChange={(event) => onCustomDateFromChange(event.target.value)}
                  />
                </label>
                <label>
                  <span>To</span>
                  <input
                    type="date"
                    aria-label="Custom date to"
                    value={customDateTo}
                    onChange={(event) => onCustomDateToChange(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  disabled={!customDateFrom && !customDateTo}
                  onClick={() =>
                    onApplyDateRange(
                      customDateFrom
                        ? Math.floor(new Date(`${customDateFrom}T00:00:00`).getTime() / 1000)
                        : undefined,
                      customDateTo
                        ? Math.floor(new Date(`${customDateTo}T23:59:59`).getTime() / 1000)
                        : undefined,
                    )
                  }
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

export interface GlobalToolbarProps {
  hasHead: boolean;
  canRunOperations: boolean;
  operationInFlight: boolean;
  refsCollapsed: boolean;
  filesCollapsed: boolean;
  moreActionsExpanded: boolean;
  onRefresh(): void;
  onGoToHead(): void;
  onFetch(): void;
  onManageStashes(): void;
  onToggleRefsPane(): void;
  onToggleFilesPane(): void;
  onToggleMoreActions(anchor: { right: number; bottom: number }): void;
}

export function GlobalToolbar({
  hasHead,
  canRunOperations,
  operationInFlight,
  refsCollapsed,
  filesCollapsed,
  moreActionsExpanded,
  onRefresh,
  onGoToHead,
  onFetch,
  onManageStashes,
  onToggleRefsPane,
  onToggleFilesPane,
  onToggleMoreActions,
}: GlobalToolbarProps) {
  return (
    <header className="global-toolbar" role="toolbar" aria-label="Global Git actions">
      <button
        type="button"
        aria-label="Refresh log"
        title="Refresh local repository state"
        onClick={onRefresh}
      >
        ↻
      </button>
      <button
        type="button"
        aria-label="Go to HEAD"
        title="Locate the current HEAD commit"
        disabled={!hasHead}
        onClick={onGoToHead}
      >
        ◎
      </button>
      <button
        type="button"
        aria-label="Fetch remotes"
        title="Fetch from remotes"
        disabled={!canRunOperations || operationInFlight}
        onClick={onFetch}
      >
        ⇣
      </button>
      <button
        type="button"
        aria-label="Manage stashes"
        title="Create, inspect, apply, pop, or drop stashes"
        disabled={!canRunOperations}
        onClick={onManageStashes}
      >
        ◫
      </button>
      <button
        type="button"
        aria-label={`${refsCollapsed ? 'Expand' : 'Collapse'} references pane`}
        title={`${refsCollapsed ? 'Expand' : 'Collapse'} references pane`}
        onClick={onToggleRefsPane}
      >
        ⇤
      </button>
      <button
        type="button"
        aria-label={`${filesCollapsed ? 'Expand' : 'Collapse'} changed files pane`}
        title={`${filesCollapsed ? 'Expand' : 'Collapse'} changed files pane`}
        onClick={onToggleFilesPane}
      >
        ⇥
      </button>
      <button
        type="button"
        data-popup-trigger="true"
        aria-label="More actions"
        title="More Git actions"
        aria-haspopup="menu"
        aria-expanded={moreActionsExpanded}
        disabled={!canRunOperations}
        onClick={(event) => {
          const bounds = event.currentTarget.getBoundingClientRect();
          onToggleMoreActions({ right: bounds.right, bottom: bounds.bottom + 2 });
        }}
      >
        ⋮
      </button>
    </header>
  );
}
