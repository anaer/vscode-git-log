import type { PointerEvent as ReactPointerEvent, ReactElement } from 'react';
import type { CommitDetails } from '../../src/shared/models';
import { formatCommitDate } from './formatCommitDate';
import { t } from './i18n';

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
    ? t('webview.details.placementBottom')
    : t('webview.details.placementBelow');
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
      aria-label={t('webview.details.resize')}
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
  // Render the body verbatim (minus the subject line shown separately) so the
  // author's line breaks, blank-line paragraph breaks, bullet lists and
  // trailers are preserved under `white-space: pre-wrap`.
  const bodyText = details
    ? details.body.split(/\r?\n/u).slice(1).join('\n').trim()
    : '';
  return (
    <section
      className="details-pane pane"
      style={detailsInChanges ? { gridRow: 6 } : undefined}
      role="region"
      aria-label={t('webview.details.region')}
      tabIndex={-1}
    >
      {details ? (
        <div className="details-content">
          <div className="details-heading-row">
            <div className="details-message">{details.subject}</div>
            <div className="details-actions" role="toolbar" aria-label={t('webview.details.actions')}>
              {detailsPlacementButton}
              <button
                type="button"
                aria-label={t('webview.details.cherryPickAria')}
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
                {t('webview.details.cherryPick')}
              </button>
              <button
                type="button"
                aria-label={t('webview.details.revertAria')}
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
                {t('webview.details.revert')}
              </button>
            </div>
          </div>
          <div className="details-meta">
            <span>
              <span className="details-meta-label">{t('webview.details.author')}</span>
              {details.authorName} &lt;{details.authorEmail}&gt;
            </span>
            <span>
              <span className="details-meta-label">{t('webview.details.authored')}</span>
              {formatCommitDate(details.authorTime)}
            </span>
            <span>
              <span className="details-meta-label">{t('webview.details.committer')}</span>
              {details.committerName} &lt;{details.committerEmail}&gt;
            </span>
            <span>
              <span className="details-meta-label">{t('webview.details.committed')}</span>
              {formatCommitDate(details.commitTime)}
            </span>
            <span className="details-hash">
              <code>{details.hash}</code>
              <button
                type="button"
                aria-label={t('webview.details.copyHashAria')}
                disabled={detailsHashCopyState === 'copying'}
                onClick={onCopyHash}
              >
                {detailsHashCopyState === 'copying'
                  ? t('webview.details.copying')
                  : detailsHashCopyState === 'copied'
                    ? t('webview.details.copied')
                    : t('webview.details.copy')}
              </button>
            </span>
            {details.parents.length ? (
              <span className="details-parents">
                <span className="details-meta-label">{t('webview.details.parents')}</span>
                {details.parents.map((parent) => (
                  <button
                    type="button"
                    aria-label={t('webview.details.parentAria', { parent })}
                    title={parent}
                    key={parent}
                    onClick={() => onSelectHash(parent, 'parent')}
                  >
                    {parent.slice(0, 8)}
                  </button>
                ))}
              </span>
            ) : (
              <span>
                <span className="details-meta-label">{t('webview.details.parents')}</span>
                {t('webview.details.rootCommit')}
              </span>
            )}
            {details.refs.length ? (
              <span className="details-refs">
                <span className="details-meta-label">{t('webview.details.refs')}</span>
                {details.refs.map((ref) => <span key={ref.fullName}>{ref.shortName}</span>)}
              </span>
            ) : null}
            <span>
              <span className="details-meta-label">{t('webview.details.signature')}</span>
              {details.signature}
            </span>
          </div>
          {bodyText ? <div className="details-body">{bodyText}</div> : null}
        </div>
      ) : (
        <div>
          <div className="details-heading-row">
            <div className="details-message">{t('webview.details.headingEmpty')}</div>
            <div className="details-actions" role="toolbar" aria-label={t('webview.details.actions')}>
              {detailsPlacementButton}
            </div>
          </div>
          <div className="details-placeholder">{t('webview.details.placeholder')}</div>
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