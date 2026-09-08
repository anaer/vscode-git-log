import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import type { CommitDetails } from '../../src/shared/models';
import { formatCommitDate } from './formatCommitDate';

export interface DetailsPaneProps {
  details: CommitDetails | undefined;
  detailsInChanges: boolean;
  detailsHeight: number;
  detailsRepositoryId: string | undefined;
  onCopyHash(): void;
  detailsHashCopyState: 'idle' | 'copying' | 'copied';
  onTogglePlacement(): void;
  onSelectHash(hash: string, prefix: string): void;
  onResizeStart(event: ReactPointerEvent<HTMLDivElement>): void;
  onResizeKeyDown(delta: number): void;
  runOperation(operation: { kind: string; [key: string]: unknown }, repositoryId?: string): void;
  selectedRepository: { isBare?: boolean; operationState?: string } | undefined;
  selectedOperationInFlight: boolean;
}

function DetailsPlacementButton({
  detailsInChanges,
  onClick,
}: { detailsInChanges: boolean; onClick(): void }) {
  const label = detailsInChanges
    ? 'Move commit details to bottom'
    : 'Move commit details below changed files';
  return (
    <button
      type="button"
      className="details-placement-button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <span
        className={`details-placement-icon${detailsInChanges ? ' to-bottom' : ''}`}
        aria-hidden="true"
      >
        ⇥
      </span>
    </button>
  );
}

function CommitDetailsResizer({
  detailsInChanges,
  detailsHeight,
  onResizeStart,
  onResizeKeyDown,
}: {
  detailsInChanges: boolean;
  detailsHeight: number;
  onResizeStart(event: ReactPointerEvent<HTMLDivElement>): void;
  onResizeKeyDown(delta: number): void;
}) {
  return (
    <div
      className="pane-resizer horizontal details-resizer"
      style={detailsInChanges ? { gridRow: 5 } : undefined}
      role="separator"
      aria-label="Resize commit details pane"
      aria-orientation="horizontal"
      aria-valuemin={100}
      aria-valuenow={detailsHeight}
      tabIndex={0}
      onPointerDown={onResizeStart}
      onKeyDown={(event) => {
        if (event.key === 'ArrowUp') onResizeKeyDown(10);
        if (event.key === 'ArrowDown') onResizeKeyDown(-10);
      }}
    />
  );
}

function CommitDetailsPane({
  details,
  detailsInChanges,
  detailsRepositoryId,
  detailsPlacementButton,
  detailsHashCopyState,
  onCopyHash,
  onSelectHash,
  runOperation,
  selectedRepository,
  selectedOperationInFlight,
}: {
  details: CommitDetails | undefined;
  detailsInChanges: boolean;
  detailsRepositoryId: string | undefined;
  detailsPlacementButton: ReactElement;
  detailsHashCopyState: 'idle' | 'copying' | 'copied';
  onCopyHash(): void;
  onSelectHash(hash: string, prefix: string): void;
  runOperation(operation: { kind: string; [key: string]: unknown }, repositoryId?: string): void;
  selectedRepository: { isBare?: boolean; operationState?: string } | undefined;
  selectedOperationInFlight: boolean;
}) {
  return (
    <section
      className="details-pane pane"
      style={detailsInChanges ? { gridRow: 6 } : undefined}
      role="region"
      aria-label="Commit details"
      tabIndex={-1}
    >
      {details ? (
        <div className="details-content">
          <div className="details-heading-row">
            <div className="details-message">{details.subject}</div>
            <div className="details-actions" role="toolbar" aria-label="Commit actions">
              {detailsPlacementButton}
              {selectedRepository?.operationState === 'cherry-pick' ? (
                <button
                  type="button"
                  className="details-stop-button"
                  aria-label="Abort cherry-pick"
                  onClick={() =>
                    runOperation({ kind: 'abortCherryPick' }, detailsRepositoryId)
                  }
                >
                  Stop Cherry-pick
                </button>
              ) : selectedRepository?.operationState === 'revert' ? (
                <button
                  type="button"
                  className="details-stop-button"
                  aria-label="Abort revert"
                  onClick={() =>
                    runOperation({ kind: 'abortRevert' }, detailsRepositoryId)
                  }
                >
                  Stop Revert
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    aria-label="Cherry-pick selected commit"
                    disabled={
                      selectedRepository?.isBare ||
                      Boolean(selectedRepository?.operationState) ||
                      selectedOperationInFlight
                    }
                    onClick={() =>
                      runOperation(
                        { kind: 'cherryPick', hash: details?.hash ?? '' },
                        detailsRepositoryId,
                      )
                    }
                  >
                    Cherry-pick
                  </button>
                  <button
                    type="button"
                    aria-label="Revert selected commit"
                    disabled={
                      selectedRepository?.isBare ||
                      Boolean(selectedRepository?.operationState) ||
                      selectedOperationInFlight
                    }
                    onClick={() =>
                      runOperation(
                        { kind: 'revert', hash: details?.hash ?? '' },
                        detailsRepositoryId,
                      )
                    }
                  >
                    Revert
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="details-meta">
            <span>Author: {details.authorName} &lt;{details.authorEmail}&gt;</span>
            <span>Authored: {formatCommitDate(details.authorTime)}</span>
            <span>
              Committer: {details.committerName} &lt;{details.committerEmail}&gt;
            </span>
            <span>Committed: {formatCommitDate(details.commitTime)}</span>
            <span className="details-hash">
              <code>{details.hash}</code>
              <button
                type="button"
                aria-label="Copy full commit hash"
                disabled={detailsHashCopyState === 'copying'}
                onClick={onCopyHash}
              >
                {detailsHashCopyState === 'copying'
                  ? 'Copying…'
                  : detailsHashCopyState === 'copied'
                    ? 'Copied'
                    : 'Copy'}
              </button>
            </span>
            {details.parents.length ? (
              <span className="details-parents">
                Parents:{' '}
                {details.parents.map((parent) => (
                  <button
                    type="button"
                    aria-label={`Parent ${parent}`}
                    title={parent}
                    key={parent}
                    onClick={() => onSelectHash(parent, 'parent')}
                  >
                    {parent.slice(0, 8)}
                  </button>
                ))}
              </span>
            ) : (
              <span>Parents: root commit</span>
            )}
            {details.refs.length ? (
              <span className="details-refs">
                Refs: {details.refs.map((ref) => <span key={ref.fullName}>{ref.shortName}</span>)}
              </span>
            ) : null}
            <span>Signature: {details.signature}</span>
          </div>
          <div className="details-body">
            {details.body
              .split(/\r?\n/u)
              .filter((line, index) => index > 0 && line.length > 0)
              .map((line, index) => (
                <p key={`${String(index)}:${line}`}>{line}</p>
              ))}
          </div>
        </div>
      ) : (
        <div>
          <div className="details-heading-row">
            <div className="details-message">Commit Details</div>
            <div className="details-actions" role="toolbar" aria-label="Commit actions">
              {detailsPlacementButton}
            </div>
          </div>
          <div className="details-placeholder">Select a commit to view its message and metadata.</div>
        </div>
      )}
    </section>
  );
}

export function DetailsPane({
  details,
  detailsInChanges,
  detailsHeight,
  detailsRepositoryId,
  onCopyHash,
  detailsHashCopyState,
  onTogglePlacement,
  onSelectHash,
  onResizeStart,
  onResizeKeyDown,
  runOperation,
  selectedRepository,
  selectedOperationInFlight,
}: DetailsPaneProps) {
  const detailsPlacementButton = (
    <DetailsPlacementButton detailsInChanges={detailsInChanges} onClick={onTogglePlacement} />
  );

  const resizer = (
    <CommitDetailsResizer
      detailsInChanges={detailsInChanges}
      detailsHeight={detailsHeight}
      onResizeStart={onResizeStart}
      onResizeKeyDown={onResizeKeyDown}
    />
  );

  const pane = (
    <CommitDetailsPane
      details={details}
      detailsInChanges={detailsInChanges}
      detailsRepositoryId={detailsRepositoryId}
      detailsPlacementButton={detailsPlacementButton}
      detailsHashCopyState={detailsHashCopyState}
      onCopyHash={onCopyHash}
      onSelectHash={onSelectHash}
      runOperation={runOperation}
      selectedRepository={selectedRepository}
      selectedOperationInFlight={selectedOperationInFlight}
    />
  );

  return <>{resizer}{pane}</>;
}