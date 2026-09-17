import { useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { RepositorySummary } from '../../src/shared/models';
import type { GitOperationRequest, WebviewToExtensionMessage } from '../../src/protocol/messages';
import type {
  AmendDialogState,
  BranchCleanupDialogState,
  EditCommitMessagesState,
  HistoryParentPickerState,
  RewriteAuthorIdentityState,
  SquashOperationState,
  StashDialogState,
} from './workbenchEffects';
import type { FolderDeleteState, NamedOperationState } from './App';
import { formatCommitDate } from './formatCommitDate';
import { requestId } from './webviewUtils';

interface DialogsProps {
  stashDialog: StashDialogState | undefined;
  setStashDialog: Dispatch<SetStateAction<StashDialogState | undefined>>;
  stashDialogRepositoryRef: RefObject<string | undefined>;
  amendDialog: AmendDialogState | undefined;
  setAmendDialog: Dispatch<SetStateAction<AmendDialogState | undefined>>;
  branchCleanup: BranchCleanupDialogState | undefined;
  setBranchCleanup: Dispatch<SetStateAction<BranchCleanupDialogState | undefined>>;
  submitBranchCleanup: () => void;
  folderDelete: FolderDeleteState | undefined;
  setFolderDelete: Dispatch<SetStateAction<FolderDeleteState | undefined>>;
  submitFolderDelete: () => void;
  historyParentPicker: HistoryParentPickerState | undefined;
  setHistoryParentPicker: Dispatch<SetStateAction<HistoryParentPickerState | undefined>>;
  historyParentChoicesRef: RefObject<Map<string, string>>;
  squashOperation: SquashOperationState | undefined;
  setSquashOperation: Dispatch<SetStateAction<SquashOperationState | undefined>>;
  editCommitMessages: EditCommitMessagesState | undefined;
  setEditCommitMessages: Dispatch<SetStateAction<EditCommitMessagesState | undefined>>;
  rewriteAuthorIdentity: RewriteAuthorIdentityState | undefined;
  setRewriteAuthorIdentity: Dispatch<SetStateAction<RewriteAuthorIdentityState | undefined>>;
  setActiveCommitMessagesRequest: (requestId: string | undefined) => void;
  namedOperation: NamedOperationState | undefined;
  setNamedOperation: Dispatch<SetStateAction<NamedOperationState | undefined>>;
  submitNamedOperation: () => void;
  selectedRepository: RepositorySummary | undefined;
  selectedOperationInFlight: boolean;
  runOperation: (operation: GitOperationRequest, repositoryId?: string) => void;
  send: (message: WebviewToExtensionMessage) => void;
}

export function Dialogs(props: DialogsProps) {
  const {
    stashDialog,
    setStashDialog,
    stashDialogRepositoryRef,
    amendDialog,
    setAmendDialog,
    branchCleanup,
    setBranchCleanup,
    submitBranchCleanup,
    folderDelete,
    setFolderDelete,
    submitFolderDelete,
    historyParentPicker,
    setHistoryParentPicker,
    historyParentChoicesRef,
    squashOperation,
    setSquashOperation,
    editCommitMessages,
    setEditCommitMessages,
    rewriteAuthorIdentity,
    setRewriteAuthorIdentity,
    setActiveCommitMessagesRequest,
    namedOperation,
    setNamedOperation,
    submitNamedOperation,
    selectedRepository,
    selectedOperationInFlight,
    runOperation,
    send,
  } = props;

  return (
    <>
      {stashDialog ? (
        <div className="operation-dialog-backdrop">
          <div
            className="operation-dialog stash-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Stash management"
          >
            <button
              className="stash-dialog-close"
              type="button"
              aria-label="Close stash manager"
              title="Close"
              onClick={() => {
                stashDialogRepositoryRef.current = undefined;
                setStashDialog(undefined);
              }}
            >
              <span aria-hidden="true">×</span>
            </button>
            <strong>Stashes</strong>
            <section className="stash-tool-section">
              <span>Stash changes</span>
              <input
                className="stash-message-input"
                aria-label="Stash message"
                placeholder="Optional stash message"
                value={stashDialog.stashMessage}
                disabled={Boolean(selectedRepository?.operationState)}
                onChange={(event) =>
                  setStashDialog((current) =>
                    current ? { ...current, stashMessage: event.target.value } : current,
                  )
                }
              />
              <div className="stash-create-actions">
                <label className="stash-checkbox">
                  <input
                    type="checkbox"
                    checked={stashDialog.includeUntracked}
                    disabled={Boolean(selectedRepository?.operationState)}
                    onChange={(event) =>
                      setStashDialog((current) =>
                        current
                          ? { ...current, includeUntracked: event.target.checked }
                          : current,
                      )
                    }
                  />
                  <span>Include untracked files</span>
                </label>
                <button
                  className="stash-submit-button"
                  type="button"
                  disabled={
                    Boolean(selectedRepository?.operationState) || selectedOperationInFlight
                  }
                  onClick={() =>
                    runOperation(
                      {
                        kind: 'createStash',
                        message: stashDialog.stashMessage,
                        includeUntracked: stashDialog.includeUntracked,
                      },
                      stashDialog.repositoryId,
                    )
                  }
                >
                  Stash
                </button>
              </div>
              {stashDialog.loading ? <span>Loading…</span> : null}
              {stashDialog.stashes.map((stash) => (
                <div className="stash-tool-row" key={stash.ref}>
                  <span>{stash.subject}</span>
                  <button
                    type="button"
                    aria-label={`Show changes for ${stash.ref}`}
                    onClick={() =>
                      send({
                        type: 'openStashComparison',
                        requestId: requestId('stash-diff'),
                        repositoryId: stashDialog.repositoryId,
                        hash: stash.hash,
                      })
                    }
                  >
                    Show Changes
                  </button>
                  <button
                    type="button"
                    disabled={
                      Boolean(selectedRepository?.operationState) || selectedOperationInFlight
                    }
                    onClick={() =>
                      runOperation(
                        { kind: 'applyStash', stash: stash.ref },
                        stashDialog.repositoryId,
                      )
                    }
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    disabled={
                      Boolean(selectedRepository?.operationState) || selectedOperationInFlight
                    }
                    onClick={() =>
                      runOperation(
                        { kind: 'popStash', stash: stash.ref },
                        stashDialog.repositoryId,
                      )
                    }
                  >
                    Pop
                  </button>
                  <button
                    type="button"
                    disabled={
                      Boolean(selectedRepository?.operationState) || selectedOperationInFlight
                    }
                    onClick={() =>
                      runOperation(
                        { kind: 'dropStash', stash: stash.ref },
                        stashDialog.repositoryId,
                      )
                    }
                  >
                    Drop…
                  </button>
                </div>
              ))}
            </section>
          </div>
        </div>
      ) : null}

      {amendDialog ? (
        <div className="operation-dialog-backdrop">
          <div className="operation-dialog" role="dialog" aria-modal="true" aria-label="Amend HEAD">
            <strong>Amend HEAD</strong>
            <span>Currently staged changes will be included in the amended commit.</span>
            <textarea
              aria-label="Amend commit message"
              value={amendDialog.message}
              onChange={(event) =>
                setAmendDialog((current) =>
                  current ? { ...current, message: event.target.value } : current,
                )
              }
            />
            <div className="operation-dialog-actions">
              <button type="button" onClick={() => setAmendDialog(undefined)}>
                Cancel
              </button>
              <button
                type="button"
                aria-label="Amend Commit"
                disabled={!amendDialog.message.trim()}
                onClick={() => {
                  runOperation(
                    { kind: 'amendCommit', message: amendDialog.message },
                    amendDialog.repositoryId,
                  );
                  setAmendDialog(undefined);
                }}
              >
                Amend
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {historyParentPicker ? (
        <div className="operation-dialog-backdrop">
          <div
            className="operation-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Select history parent"
          >
            <strong>Select a parent for this merge commit</strong>
            <span>{historyParentPicker.commit.subject}</span>
            <div className="history-parent-options">
              {historyParentPicker.commit.parents.map((parent, index) => (
                <button
                  type="button"
                  aria-label={`Compare with parent ${parent.slice(0, 8)}`}
                  title={parent}
                  key={parent}
                  onClick={() => {
                    historyParentChoicesRef.current.set(historyParentPicker.commit.hash, parent);
                    send({
                      type: 'openHistoryDiff',
                      requestId: requestId('history-diff'),
                      repositoryId: historyParentPicker.repositoryId,
                      hash: historyParentPicker.commit.hash,
                      parent,
                    });
                    setHistoryParentPicker(undefined);
                  }}
                >
                  Parent {String(index + 1)} · {parent.slice(0, 8)}
                </button>
              ))}
            </div>
            <div className="operation-dialog-actions">
              <button type="button" onClick={() => setHistoryParentPicker(undefined)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {squashOperation ? (
        <div className="operation-dialog-backdrop">
          <form
            className="operation-dialog squash-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Squash Commits"
            onSubmit={(event) => {
              event.preventDefault();
              if (squashOperation.loading || !squashOperation.message.trim()) return;
              runOperation(
                {
                  kind: 'squashCommits',
                  hashes: squashOperation.hashes,
                  message: squashOperation.message,
                },
                squashOperation.repositoryId,
              );
              setSquashOperation(undefined);
            }}
          >
            <label>
              <span>Commit message</span>
              <textarea
                autoFocus
                aria-label="Squash commit message"
                disabled={squashOperation.loading}
                value={squashOperation.message}
                onChange={(event) =>
                  setSquashOperation((current) =>
                    current ? { ...current, message: event.target.value } : current,
                  )
                }
              />
            </label>
            <div className="operation-dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setActiveCommitMessagesRequest(undefined);
                  setSquashOperation(undefined);
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={squashOperation.loading || !squashOperation.message.trim()}
              >
                Squash Commits
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editCommitMessages ? (
        <div className="operation-dialog-backdrop">
          <form
            className="operation-dialog edit-commit-messages-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Edit Commit Messages"
            onSubmit={(event) => {
              event.preventDefault();
              if (editCommitMessages.loading) return;
              const edits = editCommitMessages.edits
                .map((entry) => ({ ...entry, message: entry.message.trim() }))
                .filter((entry) => entry.message.length > 0);
              if (edits.length === 0) return;
              runOperation(
                { kind: 'editCommitMessages', edits },
                editCommitMessages.repositoryId,
              );
              setEditCommitMessages(undefined);
            }}
          >
            <strong>Edit Commit Messages</strong>
            <span>
              Rewrites the selected commit messages and every affected descendant on the current
              branch, amending their hashes.
            </span>
            <EditCommitMessagesEditor
              key={editCommitMessages.requestId}
              edits={editCommitMessages.edits}
              loading={editCommitMessages.loading}
              onEditMessageChange={(index, value) =>
                setEditCommitMessages((current) =>
                  current
                    ? {
                        ...current,
                        edits: current.edits.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, message: value } : item,
                        ),
                      }
                    : current,
                )
              }
            />
            <div className="operation-dialog-actions">
              <button
                type="button"
                onClick={() => {
                  setActiveCommitMessagesRequest(undefined);
                  setEditCommitMessages(undefined);
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  editCommitMessages.loading ||
                  editCommitMessages.edits.some((entry) => !entry.message.trim())
                }
              >
                Rewrite Commit Messages
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {rewriteAuthorIdentity ? (
        <div className="operation-dialog-backdrop">
          <form
            className="operation-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Rewrite Author Identity"
            onSubmit={(event) => {
              event.preventDefault();
              if (!rewriteAuthorIdentity.name.trim() || !rewriteAuthorIdentity.email.trim()) return;
              runOperation(
                {
                  kind: 'rewriteAuthorIdentity',
                  hashes: rewriteAuthorIdentity.hashes,
                  name: rewriteAuthorIdentity.name.trim(),
                  email: rewriteAuthorIdentity.email.trim(),
                },
                rewriteAuthorIdentity.repositoryId,
              );
              setRewriteAuthorIdentity(undefined);
            }}
          >
            <strong>Rewrite Author Identity</strong>
            <span>
              Replaces the author and committer of the {String(rewriteAuthorIdentity.hashes.length)}{' '}
              selected commit{rewriteAuthorIdentity.hashes.length === 1 ? '' : 's'} and rewrites
              every affected descendant on the current branch, amending their hashes.
            </span>
            <label>
              <span>Author name</span>
              <input
                autoFocus
                aria-label="Author name"
                value={rewriteAuthorIdentity.name}
                onChange={(event) =>
                  setRewriteAuthorIdentity((current) =>
                    current ? { ...current, name: event.target.value } : current,
                  )
                }
              />
            </label>
            <label>
              <span>Author email</span>
              <input
                aria-label="Author email"
                value={rewriteAuthorIdentity.email}
                onChange={(event) =>
                  setRewriteAuthorIdentity((current) =>
                    current ? { ...current, email: event.target.value } : current,
                  )
                }
              />
            </label>
            <div className="operation-dialog-actions">
              <button type="button" onClick={() => setRewriteAuthorIdentity(undefined)}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  !rewriteAuthorIdentity.name.trim() || !rewriteAuthorIdentity.email.trim()
                }
              >
                Rewrite Author Identity
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {namedOperation ? (
        <div className="operation-dialog-backdrop">
          <form
            className="operation-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={
              namedOperation.kind === 'createBranch'
                ? 'Create Branch'
                : namedOperation.kind === 'createOrphanBranch'
                  ? 'Create Orphan Branch'
                  : namedOperation.kind === 'createTag'
                    ? 'Create Tag'
                    : namedOperation.kind === 'checkoutRemote'
                      ? 'Checkout Remote Branch'
                      : 'Rename Branch'
            }
            onSubmit={(event) => {
              event.preventDefault();
              submitNamedOperation();
            }}
          >
            <label>
              <span>
                {namedOperation.kind === 'createBranch' ||
                namedOperation.kind === 'createOrphanBranch'
                  ? 'Branch name'
                  : namedOperation.kind === 'createTag'
                    ? 'Tag name'
                    : namedOperation.kind === 'checkoutRemote'
                      ? 'Local branch name'
                      : 'New branch name'}
              </span>
              <input
                autoFocus
                aria-label={
                  namedOperation.kind === 'createBranch' ||
                  namedOperation.kind === 'createOrphanBranch'
                    ? 'Branch name'
                    : namedOperation.kind === 'createTag'
                      ? 'Tag name'
                      : namedOperation.kind === 'checkoutRemote'
                        ? 'Local branch name'
                        : 'New branch name'
                }
                value={namedOperation.value}
                onChange={(event) =>
                  setNamedOperation((current) =>
                    current ? { ...current, value: event.target.value } : current,
                  )
                }
              />
            </label>
            {namedOperation.kind === 'createOrphanBranch' ? (
              <p className="named-operation-note">
                Creates a branch with no parent commit. All tracked files are removed from the
                working tree (untracked and ignored files are kept), and the branch appears in the
                ref tree only after its first commit.
              </p>
            ) : null}
            <div className="operation-dialog-actions">
              <button type="button" onClick={() => setNamedOperation(undefined)}>
                Cancel
              </button>
              <button type="submit" disabled={!namedOperation.value.trim()}>
                {namedOperation.kind === 'createBranch'
                  ? 'Create Branch'
                  : namedOperation.kind === 'createOrphanBranch'
                    ? 'Create Orphan Branch'
                    : namedOperation.kind === 'createTag'
                      ? 'Create Tag'
                      : namedOperation.kind === 'checkoutRemote'
                        ? 'Checkout'
                        : 'Rename Branch'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {branchCleanup ? (
        <div className="operation-dialog-backdrop">
          <div
            className="operation-dialog branch-cleanup-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Clean up branches"
          >
            <strong>Clean Up Branches</strong>
            {branchCleanup.loading ? (
              <p className="branch-cleanup-empty">Loading branches…</p>
            ) : branchCleanup.candidates.length === 0 ? (
              <p className="branch-cleanup-empty">
                No branch is either merged into the current branch or missing its upstream.
              </p>
            ) : (
              <ul className="branch-cleanup-list">
                {branchCleanup.candidates.map((candidate) => (
                  <li key={candidate.name}>
                    <label className="branch-cleanup-row">
                      <input
                        type="checkbox"
                        aria-label={`Delete ${candidate.name}`}
                        checked={branchCleanup.selected.has(candidate.name)}
                        onChange={(event) =>
                          setBranchCleanup((current) => {
                            if (!current) return current;
                            const selected = new Set(current.selected);
                            if (event.target.checked) selected.add(candidate.name);
                            else selected.delete(candidate.name);
                            return { ...current, selected };
                          })
                        }
                      />
                      <span className="branch-cleanup-name" title={candidate.name}>
                        {candidate.name}
                      </span>
                      {candidate.gone ? (
                        <span className="branch-cleanup-badge gone">upstream gone</span>
                      ) : null}
                      {candidate.merged ? (
                        <span className="branch-cleanup-badge merged">merged</span>
                      ) : (
                        <span className="branch-cleanup-badge unmerged">
                          {String(candidate.aheadCount)} unmerged
                        </span>
                      )}
                      <span className="branch-cleanup-date">
                        {formatCommitDate(candidate.lastCommitTime)}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="branch-cleanup-note">
              {selectedRepository?.currentBranch
                ? `“merged” means reachable from “${selectedRepository.currentBranch}”. `
                : 'No branch is checked out, so the merged category is unavailable. '}
              Branches whose upstream is gone are selected by default; unmerged branches never
              are. Deleting an unmerged branch makes its commits unreachable.
            </p>
            <div className="operation-dialog-actions">
              <button type="button" onClick={() => setBranchCleanup(undefined)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={branchCleanup.loading || branchCleanup.selected.size === 0}
                onClick={submitBranchCleanup}
              >
                {branchCleanup.selected.size === 1
                  ? 'Delete 1 Branch'
                  : `Delete ${String(branchCleanup.selected.size)} Branches`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {folderDelete ? (
        <div className="operation-dialog-backdrop">
          <div
            className="operation-dialog branch-cleanup-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Delete references in ${folderDelete.path}`}
          >
            <strong>Delete references in “{folderDelete.path}/”</strong>
            <ul className="branch-cleanup-list">
              {folderDelete.refs.map((ref) => (
                <li key={ref.fullName}>
                  <label className="branch-cleanup-row">
                    <input
                      type="checkbox"
                      aria-label={`Delete ${ref.shortName}`}
                      checked={folderDelete.selected.has(ref.fullName)}
                      onChange={(event) =>
                        setFolderDelete((current) => {
                          if (!current) return current;
                          const selected = new Set(current.selected);
                          if (event.target.checked) selected.add(ref.fullName);
                          else selected.delete(ref.fullName);
                          return { ...current, selected };
                        })
                      }
                    />
                    <span className="branch-cleanup-name" title={ref.fullName}>
                      {ref.shortName}
                    </span>
                    <span className="branch-cleanup-badge merged">{ref.kind}</span>
                    {ref.gone ? (
                      <span className="branch-cleanup-badge gone">upstream gone</span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
            <p className="branch-cleanup-note">
              Nothing is selected by default. Selecting a remote entry deletes that branch on the
              shared remote; unmerged local branches are refused, not force-deleted.
            </p>
            <div className="operation-dialog-actions">
              <button type="button" onClick={() => setFolderDelete(undefined)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={folderDelete.selected.size === 0}
                onClick={submitFolderDelete}
              >
                Delete {String(folderDelete.selected.size)} item
                {folderDelete.selected.size === 1 ? '' : 's'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

// A textarea whose height tracks its own content, so the Edit Commit Messages
// dialog grows and shrinks with the messages being edited instead of using a
// fixed box. `field-sizing: content` is not available on the extension's
// baseline webview engine, so the height is recomputed from `scrollHeight` in a
// layout effect keyed on the value (covers typing and async-loaded messages).
interface AutoGrowTextareaProps {
  ariaLabel: string;
  value: string;
  disabled?: boolean;
  onValueChange(value: string): void;
}

export function AutoGrowTextarea({
  ariaLabel,
  value,
  disabled,
  onValueChange,
}: AutoGrowTextareaProps): ReactElement {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    // scrollHeight omits the 1px top/bottom borders; the box uses border-box, so
    // add them back to avoid clipping an exactly-fitting line.
    element.style.height = `${element.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className="auto-grow"
      aria-label={ariaLabel}
      disabled={disabled}
      value={value}
      rows={1}
      onChange={(event) => onValueChange(event.target.value)}
    />
  );
}

// One-commit-at-a-time editor for the Edit Commit Messages dialog. Holds only a
// local page index (reset by remounting via the `requestId` key at the call
// site) so navigating between selected commits preserves each message in the
// shared `edits` array without a reset effect.
interface EditCommitMessagesEditorProps {
  edits: readonly { hash: string; message: string }[];
  loading: boolean;
  onEditMessageChange(index: number, value: string): void;
}

export function EditCommitMessagesEditor({
  edits,
  loading,
  onEditMessageChange,
}: EditCommitMessagesEditorProps): ReactElement {
  const [index, setIndex] = useState(0);
  const total = edits.length;
  const current = Math.min(index, Math.max(total - 1, 0));
  const entry = edits[current];
  return (
    <section className="edit-commit-messages-editor">
      {loading ? (
        <div className="edit-commit-messages-loading">Loading commit messages…</div>
      ) : null}
      {entry ? (
        <>
          <div className="edit-commit-messages-nav">
            <button
              type="button"
              aria-label="Previous commit"
              title="Previous commit"
              disabled={current <= 0}
              onClick={() => setIndex((value) => Math.max(value - 1, 0))}
            >
              ‹
            </button>
            <code>{entry.hash.slice(0, 12)}</code>
            <span className="edit-commit-messages-count">
              {String(current + 1)} / {String(total)}
            </span>
            <button
              type="button"
              aria-label="Next commit"
              title="Next commit"
              disabled={current >= total - 1}
              onClick={() => setIndex((value) => Math.min(value + 1, total - 1))}
            >
              ›
            </button>
          </div>
          <AutoGrowTextarea
            ariaLabel={`Commit message ${entry.hash.slice(0, 12)}`}
            disabled={loading}
            value={entry.message}
            onValueChange={(value) => onEditMessageChange(current, value)}
          />
        </>
      ) : null}
    </section>
  );
}
