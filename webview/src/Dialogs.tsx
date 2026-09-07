import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { RepositorySummary } from '../../src/shared/models';
import type { GitOperationRequest, WebviewToExtensionMessage } from '../../src/protocol/messages';
import type {
  AmendDialogState,
  HistoryParentPickerState,
  SquashOperationState,
  StashDialogState,
} from './workbenchEffects';
import type { NamedOperationState } from './App';
import { requestId } from './webviewUtils';

interface DialogsProps {
  stashDialog: StashDialogState | undefined;
  setStashDialog: Dispatch<SetStateAction<StashDialogState | undefined>>;
  stashDialogRepositoryRef: RefObject<string | undefined>;
  amendDialog: AmendDialogState | undefined;
  setAmendDialog: Dispatch<SetStateAction<AmendDialogState | undefined>>;
  historyParentPicker: HistoryParentPickerState | undefined;
  setHistoryParentPicker: Dispatch<SetStateAction<HistoryParentPickerState | undefined>>;
  historyParentChoicesRef: RefObject<Map<string, string>>;
  squashOperation: SquashOperationState | undefined;
  setSquashOperation: Dispatch<SetStateAction<SquashOperationState | undefined>>;
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
    historyParentPicker,
    setHistoryParentPicker,
    historyParentChoicesRef,
    squashOperation,
    setSquashOperation,
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

      {namedOperation ? (
        <div className="operation-dialog-backdrop">
          <form
            className="operation-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={
              namedOperation.kind === 'createBranch'
                ? 'Create Branch'
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
                {namedOperation.kind === 'createBranch'
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
                  namedOperation.kind === 'createBranch'
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
            <div className="operation-dialog-actions">
              <button type="button" onClick={() => setNamedOperation(undefined)}>
                Cancel
              </button>
              <button type="submit" disabled={!namedOperation.value.trim()}>
                {namedOperation.kind === 'createBranch'
                  ? 'Create Branch'
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
    </>
  );
}