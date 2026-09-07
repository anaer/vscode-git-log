import type { CSSProperties, Dispatch, RefObject, SetStateAction } from 'react';
import type { ChangedFile, RepositorySummary } from '../../src/shared/models';
import type { GitOperationRequest, WebviewToExtensionMessage } from '../../src/protocol/messages';
import type {
  AmendDialogState,
  ContextMenuState,
  NamedOperationState,
  SquashOperationState,
} from './App';
import { contextMenuPosition, requestId } from './webviewUtils';

interface ContextMenuProps {
  contextMenu: ContextMenuState;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | undefined>>;
  menuRef: RefObject<HTMLDivElement | null>;
  measuredContextMenuPosition: CSSProperties | undefined;
  selectedRepository: RepositorySummary | undefined;
  hasContiguousCommitRange: boolean;
  selectedOperationInFlight: boolean;
  detailsHash: string | undefined;
  detailsBody: string | undefined;
  selectedParent: string | undefined;
  runOperation: (operation: GitOperationRequest, repositoryId?: string) => void;
  send: (message: WebviewToExtensionMessage) => void;
  openCommitComparison: (hash: string, mode: 'parent' | 'current', parent?: string) => void;
  openDiff: (file: ChangedFile) => void;
  openFile: (file: ChangedFile, mode: 'revision' | 'current') => void;
  setSquashOperation: Dispatch<SetStateAction<SquashOperationState | undefined>>;
  setAmendDialog: Dispatch<SetStateAction<AmendDialogState | undefined>>;
  setNamedOperation: Dispatch<SetStateAction<NamedOperationState | undefined>>;
  activeCommitMessagesRequestRef: RefObject<string | undefined>;
}

export function ContextMenu(props: ContextMenuProps) {
  const {
    contextMenu,
    setContextMenu,
    menuRef,
    measuredContextMenuPosition,
    selectedRepository,
    hasContiguousCommitRange,
    selectedOperationInFlight,
    detailsHash,
    detailsBody,
    selectedParent,
    runOperation,
    send,
    openCommitComparison,
    openDiff,
    openFile,
    setSquashOperation,
    setAmendDialog,
    setNamedOperation,
    activeCommitMessagesRequestRef,
  } = props;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label={`${contextMenu.kind} actions`}
      style={measuredContextMenuPosition ?? contextMenuPosition(contextMenu.x, contextMenu.y)}
      onClick={(event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const menuItem = target.closest<HTMLButtonElement>('button[role="menuitem"]');
        if (menuItem && !menuItem.disabled) setContextMenu(undefined);
      }}
    >
      {contextMenu.kind === 'toolbar' ? (
        selectedRepository?.operationState ? (
          <span className="menu-note">
            Git {selectedRepository.operationState} is in progress. Finish or abort it first.
          </span>
        ) : selectedRepository?.isBare ? (
          <span className="menu-note">Bare repositories are read-only.</span>
        ) : (
          <>
            <button
              type="button"
              role="menuitem"
              disabled={!selectedRepository?.currentBranch}
              onClick={() => runOperation({ kind: 'pull' }, contextMenu.repositoryId)}
            >
              Pull
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!selectedRepository?.currentBranch}
              onClick={() => runOperation({ kind: 'push' }, contextMenu.repositoryId)}
            >
              Push
            </button>
            <button
              type="button"
              role="menuitem"
              disabled={!selectedRepository?.currentBranch}
              onClick={() =>
                runOperation({ kind: 'push', forceWithLease: true }, contextMenu.repositoryId)
              }
            >
              Force Push with Lease…            </button>
          </>
        )
      ) : null}
      {contextMenu.kind === 'commit' ? (
        <>
          {hasContiguousCommitRange &&
          !selectedRepository?.isBare &&
          !selectedRepository?.operationState ? (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={
                  !selectedRepository?.currentBranch ||
                  selectedOperationInFlight ||
                  contextMenu.commits.length > 100
                }
                title={
                  contextMenu.commits.length > 100
                    ? 'Select no more than 100 commits'
                    : undefined
                }
                onClick={() =>
                  runOperation(
                    {
                      kind: 'dropCommits',
                      hashes: contextMenu.commits.map((commit) => commit.hash),
                    },
                    contextMenu.repositoryId,
                  )
                }
              >
                Drop commits…              </button>
              <button
                type="button"
                role="menuitem"
                disabled={
                  !selectedRepository?.currentBranch ||
                  selectedOperationInFlight ||
                  contextMenu.commits.length > 100
                }
                title={
                  contextMenu.commits.length > 100
                    ? 'Select no more than 100 commits'
                    : undefined
                }
                onClick={() => {
                  const hashes = contextMenu.commits.map((commit) => commit.hash);
                  const messageRequestId = requestId('commit-messages');
                  activeCommitMessagesRequestRef.current = messageRequestId;
                  setSquashOperation({
                    repositoryId: contextMenu.repositoryId,
                    hashes,
                    requestId: messageRequestId,
                    message: '',
                    loading: true,
                  });
                  send({
                    type: 'requestCommitMessages',
                    requestId: messageRequestId,
                    repositoryId: contextMenu.repositoryId,
                    hashes,
                  });
                  setContextMenu(undefined);
                }}
              >
                Squash commits…              </button>
            </>
          ) : null}
          <button
            type="button"
            role="menuitem"
            disabled={!contextMenu.commit.parents[0]}
            title={
              contextMenu.commit.parents[0]
                ? 'Open all changed text files'
                : 'Root commit has no parent'
            }
            onClick={() =>
              openCommitComparison(
                contextMenu.commit.hash,
                'parent',
                contextMenu.commit.parents[0],
              )
            }
          >
            Compare with Parent
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={
              !selectedRepository?.head || selectedRepository.head === contextMenu.commit.hash
            }
            title="Compare this commit with the current HEAD"
            onClick={() => openCommitComparison(contextMenu.commit.hash, 'current')}
          >
            Compare with Current
          </button>
          {!selectedRepository?.isBare && !selectedRepository?.operationState ? (
            <>
              {contextMenu.commits.length === 1 ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={selectedOperationInFlight}
                    title="Check out this commit in detached HEAD state"
                    onClick={() =>
                      runOperation(
                        { kind: 'checkout', ref: contextMenu.commit.hash },
                        contextMenu.repositoryId,
                      )
                    }
                  >
                    Checkout Revision
                  </button>
                  {selectedRepository?.head === contextMenu.commit.hash &&
                  selectedRepository.currentBranch ? (
                    <button
                      type="button"
                      role="menuitem"
                      disabled={selectedOperationInFlight}
                      onClick={() => {
                        setAmendDialog({
                          repositoryId: contextMenu.repositoryId,
                          message: contextMenu.commit.subject,
                        });
                        setContextMenu(undefined);
                      }}
                    >
                      Amend HEAD…                    </button>
                  ) : null}
                </>
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setNamedOperation({
                    kind: 'createBranch',
                    repositoryId: contextMenu.repositoryId,
                    target: contextMenu.commit.hash,
                    value: '',
                  });
                  setContextMenu(undefined);
                }}
              >
                New Branch…              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setNamedOperation({
                    kind: 'createTag',
                    repositoryId: contextMenu.repositoryId,
                    target: contextMenu.commit.hash,
                    value: '',
                  });
                  setContextMenu(undefined);
                }}
              >
                New Tag…              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  runOperation(
                    { kind: 'cherryPick', hash: contextMenu.commit.hash },
                    contextMenu.repositoryId,
                  )
                }
              >
                Cherry-pick
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() =>
                  runOperation(
                    { kind: 'revert', hash: contextMenu.commit.hash },
                    contextMenu.repositoryId,
                  )
                }
              >
                Revert
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={
                  !selectedRepository?.currentBranch ||
                  selectedRepository.head === contextMenu.commit.hash
                }
                onClick={() =>
                  runOperation(
                    { kind: 'merge', ref: contextMenu.commit.hash },
                    contextMenu.repositoryId,
                  )
                }
              >
                Merge into Current
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={
                  !selectedRepository?.currentBranch ||
                  selectedRepository.head === contextMenu.commit.hash
                }
                onClick={() =>
                  runOperation(
                    { kind: 'rebase', ref: contextMenu.commit.hash },
                    contextMenu.repositoryId,
                  )
                }
              >
                Rebase Current onto This
              </button>
              {selectedRepository?.currentBranch ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() =>
                      runOperation(
                        { kind: 'reset', mode: 'soft', hash: contextMenu.commit.hash },
                        contextMenu.repositoryId,
                      )
                    }
                  >
                    Soft Reset
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() =>
                      runOperation(
                        { kind: 'reset', mode: 'mixed', hash: contextMenu.commit.hash },
                        contextMenu.repositoryId,
                      )
                    }
                  >
                    Mixed Reset
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() =>
                      runOperation(
                        { kind: 'reset', mode: 'hard', hash: contextMenu.commit.hash },
                        contextMenu.repositoryId,
                      )
                    }
                  >
                    Hard Reset…                  </button>
                </>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              send({
                type: 'copyToClipboard',
                requestId: requestId('copy-hash'),
                text: contextMenu.commit.hash,
              })
            }
          >
            Copy Hash
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              send({
                type: 'copyToClipboard',
                requestId: requestId('copy-subject'),
                text: contextMenu.commit.subject,
              })
            }
          >
            Copy Subject
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={detailsHash !== contextMenu.commit.hash}
            title={
              detailsHash === contextMenu.commit.hash
                ? 'Copy the complete commit message'
                : 'Select the commit first to load the full message'
            }
            onClick={() =>
              send({
                type: 'copyToClipboard',
                requestId: requestId('copy-message'),
                text: detailsBody ?? '',
              })
            }
          >
            Copy Full Message
          </button>
        </>
      ) : null}
      {contextMenu.kind === 'file' ? (
        <>
          <button
            type="button"
            role="menuitem"
            disabled={contextMenu.file.binary}
            title={
              contextMenu.file.binary
                ? 'Binary files cannot be opened in the text diff editor'
                : undefined
            }
            onClick={() => {
              openDiff(contextMenu.file);
              setContextMenu(undefined);
            }}
          >
            Show Diff
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={contextMenu.file.binary || (contextMenu.file.status === 'D' && !selectedParent)}
            title={
              contextMenu.file.binary
                ? 'Binary files cannot be opened in the text editor'
                : contextMenu.file.status === 'D' && !selectedParent
                  ? 'The deleted file has no available parent revision'
                  : undefined
            }
            onClick={() => openFile(contextMenu.file, 'revision')}
          >
            Open File at Revision
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => openFile(contextMenu.file, 'current')}
          >
            Open Current File
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              send({
                type: 'copyToClipboard',
                requestId: requestId('copy-path'),
                text: contextMenu.file.path,
              });
              setContextMenu(undefined);
            }}
          >
            Copy Path
          </button>
        </>
      ) : null}
      {contextMenu.kind === 'ref' ? (
        <>
          <button
            type="button"
            role="menuitem"
            disabled={
              !selectedRepository?.head || selectedRepository.head === contextMenu.ref.target
            }
            onClick={() => openCommitComparison(contextMenu.ref.target, 'current')}
          >
            Compare with Current
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() =>
              send({
                type: 'copyToClipboard',
                requestId: requestId('copy-ref'),
                text: contextMenu.ref.shortName,
              })
            }
          >
            Copy Name
          </button>
          {!selectedRepository?.isBare && !selectedRepository?.operationState ? (
            <>
              {contextMenu.ref.kind === 'local' ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={contextMenu.ref.isCurrent}
                  onClick={() =>
                    runOperation(
                      { kind: 'checkout', ref: contextMenu.ref.shortName },
                      contextMenu.repositoryId,
                    )
                  }
                >
                  Checkout
                </button>
              ) : null}
              {contextMenu.ref.kind === 'remote' &&
              contextMenu.ref.remote &&
              !contextMenu.ref.shortName.endsWith('/HEAD') ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const remote = contextMenu.ref.remote;
                      if (!remote) return;
                      const branch = contextMenu.ref.shortName.slice(remote.length + 1);
                      setNamedOperation({
                        kind: 'checkoutRemote',
                        repositoryId: contextMenu.repositoryId,
                        startPoint: contextMenu.ref.shortName,
                        value: branch,
                      });
                      setContextMenu(undefined);
                    }}
                  >
                    Checkout as New Local…                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const remote = contextMenu.ref.remote;
                      if (!remote) return;
                      runOperation({ kind: 'fetch', remote }, contextMenu.repositoryId);
                    }}
                  >
                    Fetch
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const remote = contextMenu.ref.remote;
                      if (!remote) return;
                      const branch = contextMenu.ref.shortName.slice(remote.length + 1);
                      runOperation(
                        { kind: 'deleteRemoteBranch', remote, branch },
                        contextMenu.repositoryId,
                      );
                    }}
                  >
                    Delete Remote Branch…                  </button>
                </>
              ) : null}
              {contextMenu.ref.kind === 'tag' ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() =>
                      runOperation(
                        { kind: 'checkout', ref: contextMenu.ref.fullName },
                        contextMenu.repositoryId,
                      )
                    }
                  >
                    Checkout
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() =>
                      runOperation(
                        { kind: 'deleteTag', name: contextMenu.ref.shortName },
                        contextMenu.repositoryId,
                      )
                    }
                  >
                    Delete Local Tag…                  </button>
                </>
              ) : null}
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setNamedOperation({
                    kind: 'createBranch',
                    repositoryId: contextMenu.repositoryId,
                    target: contextMenu.ref.fullName,
                    value: '',
                  });
                  setContextMenu(undefined);
                }}
              >
                New Branch from…              </button>
              {contextMenu.ref.kind === 'local' ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!selectedRepository?.currentBranch || contextMenu.ref.isCurrent}
                    onClick={() =>
                      runOperation(
                        { kind: 'merge', ref: contextMenu.ref.shortName },
                        contextMenu.repositoryId,
                      )
                    }
                  >
                    Merge into Current
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!selectedRepository?.currentBranch || contextMenu.ref.isCurrent}
                    onClick={() =>
                      runOperation(
                        { kind: 'rebase', ref: contextMenu.ref.shortName },
                        contextMenu.repositoryId,
                      )
                    }
                  >
                    Rebase Current onto
                  </button>
                </>
              ) : null}
              {contextMenu.ref.kind === 'local' ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={!contextMenu.ref.isCurrent}
                    title={
                      contextMenu.ref.isCurrent
                        ? 'Push the current branch'
                        : 'Checkout this branch before pushing it'
                    }
                    onClick={() => runOperation({ kind: 'push' }, contextMenu.repositoryId)}
                  >
                    Push
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setNamedOperation({
                        kind: 'renameBranch',
                        repositoryId: contextMenu.repositoryId,
                        oldName: contextMenu.ref.shortName,
                        value: contextMenu.ref.shortName,
                      });
                      setContextMenu(undefined);
                    }}
                  >
                    Rename…                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={contextMenu.ref.isCurrent}
                    onClick={() =>
                      runOperation(
                        { kind: 'deleteBranch', name: contextMenu.ref.shortName, force: false },
                        contextMenu.repositoryId,
                      )
                    }
                  >
                    Delete…                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={contextMenu.ref.isCurrent}
                    title="Delete this branch even if it is not fully merged"
                    onClick={() =>
                      runOperation(
                        { kind: 'deleteBranch', name: contextMenu.ref.shortName, force: true },
                        contextMenu.repositoryId,
                      )
                    }
                  >
                    Force Delete…                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
      {contextMenu.kind === 'head' ? (
        <>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              send({
                type: 'copyToClipboard',
                requestId: requestId('copy-head'),
                text: contextMenu.hash,
              });
              setContextMenu(undefined);
            }}
          >
            Copy Revision
          </button>
          {!selectedRepository?.isBare && !selectedRepository?.operationState ? (
            <>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setNamedOperation({
                    kind: 'createBranch',
                    repositoryId: contextMenu.repositoryId,
                    target: contextMenu.hash,
                    value: '',
                  });
                  setContextMenu(undefined);
                }}
              >
                Create Branch…              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setNamedOperation({
                    kind: 'createTag',
                    repositoryId: contextMenu.repositoryId,
                    target: contextMenu.hash,
                    value: '',
                  });
                  setContextMenu(undefined);
                }}
              >
                Create Tag…              </button>
              {selectedRepository?.currentBranch ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() =>
                      runOperation(
                        { kind: 'reset', mode: 'soft', hash: contextMenu.hash },
                        contextMenu.repositoryId,
                      )
                    }
                  >
                    Reset Current Branch (soft)
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() =>
                      runOperation(
                        { kind: 'reset', mode: 'mixed', hash: contextMenu.hash },
                        contextMenu.repositoryId,
                      )
                    }
                  >
                    Reset Current Branch (mixed)
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() =>
                      runOperation(
                        { kind: 'reset', mode: 'hard', hash: contextMenu.hash },
                        contextMenu.repositoryId,
                      )
                    }
                  >
                    Reset Current Branch (hard)…                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
