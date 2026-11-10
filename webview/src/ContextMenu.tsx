import {
  Fragment,
  type CSSProperties,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';
import type { ChangedFile, RepositorySummary } from '../../src/shared/models';
import type { GitOperationRequest, WebviewToExtensionMessage } from '../../src/protocol/messages';
import type {
  AmendDialogState,
  EditCommitMessagesState,
  RewriteAuthorIdentityState,
  SquashOperationState,
} from './workbenchEffects';
import type { ContextMenuState, FolderDeleteState, NamedOperationState } from './App';
import { t } from './i18n';
import { contextMenuPosition, requestId } from './webviewUtils';

const menuAriaKeys: Record<ContextMenuState['kind'], string> = {
  toolbar: 'webview.menu.aria.toolbar',
  commit: 'webview.menu.aria.commit',
  file: 'webview.menu.aria.file',
  refFolder: 'webview.menu.aria.refFolder',
  ref: 'webview.menu.aria.ref',
  head: 'webview.menu.aria.head',
};

interface ContextMenuProps {
  contextMenu: ContextMenuState;
  setContextMenu: Dispatch<SetStateAction<ContextMenuState | undefined>>;
  menuRef: RefObject<HTMLDivElement | null>;
  measuredContextMenuPosition: CSSProperties | undefined;
  selectedRepository: RepositorySummary | undefined;
  canCreateOrphanBranch: boolean;
  hasContiguousCommitRange: boolean;
  selectedOperationInFlight: boolean;
  currentBranchHasUpstream: boolean;
  headIsPushed: boolean;
  refsCollapsed: boolean;
  filesCollapsed: boolean;
  onToggleRefsPane(): void;
  onToggleFilesPane(): void;
  detailsHash: string | undefined;
  detailsBody: string | undefined;
  selectedParent: string | undefined;
  runOperation: (operation: GitOperationRequest, repositoryId?: string) => void;
  send: (message: WebviewToExtensionMessage) => void;
  openCommitComparison: (hash: string, mode: 'parent' | 'current', parent?: string) => void;
  openDiff: (file: ChangedFile) => void;
  openFile: (file: ChangedFile, mode: 'revision' | 'current') => void;
  onFilterByPath(path: string): void;
  setSquashOperation: Dispatch<SetStateAction<SquashOperationState | undefined>>;
  setEditCommitMessages: Dispatch<SetStateAction<EditCommitMessagesState | undefined>>;
  setRewriteAuthorIdentity: Dispatch<SetStateAction<RewriteAuthorIdentityState | undefined>>;
  setAmendDialog: Dispatch<SetStateAction<AmendDialogState | undefined>>;
  setNamedOperation: Dispatch<SetStateAction<NamedOperationState | undefined>>;
  setFolderDelete: Dispatch<SetStateAction<FolderDeleteState | undefined>>;
  setActiveCommitMessagesRequest: (requestId: string | undefined) => void;
}

export function ContextMenu(props: ContextMenuProps) {
  const {
    contextMenu,
    setContextMenu,
    menuRef,
    measuredContextMenuPosition,
    selectedRepository,
    canCreateOrphanBranch,
    hasContiguousCommitRange,
    selectedOperationInFlight,
    currentBranchHasUpstream,
    headIsPushed,
    refsCollapsed,
    filesCollapsed,
    onToggleRefsPane,
    onToggleFilesPane,
    detailsHash,
    detailsBody,
    selectedParent,
    runOperation,
    send,
    openCommitComparison,
    openDiff,
    openFile,
    onFilterByPath,
    setSquashOperation,
    setEditCommitMessages,
    setRewriteAuthorIdentity,
    setAmendDialog,
    setNamedOperation,
    setFolderDelete,
    setActiveCommitMessagesRequest,
  } = props;

  // Both the toolbar and the branch menu push the current branch, so they offer to publish it
  // while it has no upstream. The branch menu already carries the clicked ref, so it reads the
  // upstream from there instead of relying on the toolbar's snapshot-derived flag.
  const toolbarPublishesBranch =
    Boolean(selectedRepository?.currentBranch) && !currentBranchHasUpstream;
  const refPublishesBranch =
    contextMenu.kind === 'ref' && contextMenu.ref.isCurrent && !contextMenu.ref.upstream;
  const pullDisabled = !selectedRepository?.currentBranch || selectedOperationInFlight;

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      aria-label={t(menuAriaKeys[contextMenu.kind])}
      style={measuredContextMenuPosition ?? contextMenuPosition(contextMenu.x, contextMenu.y)}
      onClick={(event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const menuItem = target.closest<HTMLButtonElement>('button[role="menuitem"]');
        if (menuItem && !menuItem.disabled) {
          setContextMenu(undefined);
        }
      }}
    >
      {contextMenu.kind === 'toolbar' ? (
        selectedRepository?.operationState ? (
          <span className="menu-note">
            {t('webview.menu.operationInProgress', {
              operation: selectedRepository.operationState,
            })}
          </span>
        ) : selectedRepository?.isBare ? (
          <span className="menu-note">{t('webview.menu.bareReadOnly')}</span>
        ) : (
          <>
            {contextMenu.actions.map((action) => {
              switch (action) {
              case 'toggleRefs':
                return (
                  <button
                    key={action}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onToggleRefsPane();
                      setContextMenu(undefined);
                    }}
                  >
                    {t('webview.menu.toggleRefs', {
                      state: refsCollapsed
                        ? t('webview.action.expand')
                        : t('webview.action.collapse'),
                    })}
                  </button>
                );
              case 'toggleFiles':
                return (
                  <button
                    key={action}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onToggleFilesPane();
                      setContextMenu(undefined);
                    }}
                  >
                    {t('webview.menu.toggleFiles', {
                      state: filesCollapsed
                        ? t('webview.action.expand')
                        : t('webview.action.collapse'),
                    })}
                  </button>
                );
              case 'pull':
                return (
                  <Fragment key={action}>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={pullDisabled}
                      onClick={() => runOperation({ kind: 'pull' }, contextMenu.repositoryId)}
                    >
                      {t('webview.menu.pull')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={pullDisabled}
                      onClick={() =>
                        runOperation(
                          { kind: 'pull', strategy: 'ff-only' },
                          contextMenu.repositoryId,
                        )
                      }
                    >
                      {t('webview.menu.pullFfOnly')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={pullDisabled}
                      onClick={() =>
                        runOperation(
                          { kind: 'pull', strategy: 'merge' },
                          contextMenu.repositoryId,
                        )
                      }
                    >
                      {t('webview.menu.pullMerge')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={pullDisabled}
                      onClick={() =>
                        runOperation(
                          { kind: 'pull', strategy: 'rebase' },
                          contextMenu.repositoryId,
                        )
                      }
                    >
                      {t('webview.menu.pullRebase')}
                    </button>
                  </Fragment>
                );
              case 'push':
                return (
                  <button
                    key={action}
                    type="button"
                    role="menuitem"
                    disabled={!selectedRepository?.currentBranch || selectedOperationInFlight}
                    title={
                      toolbarPublishesBranch
                        ? t('webview.menu.pushTitlePublish')
                        : t('webview.menu.pushTitle')
                    }
                    onClick={() =>
                      runOperation(
                        { kind: toolbarPublishesBranch ? 'publishBranch' : 'push' },
                        contextMenu.repositoryId,
                      )
                    }
                  >
                    {toolbarPublishesBranch
                      ? t('webview.menu.publishBranch')
                      : t('webview.menu.push')}
                  </button>
                );
              case 'forcePush':
                return (
                  <button
                    key={action}
                    type="button"
                    role="menuitem"
                    disabled={!selectedRepository?.currentBranch || selectedOperationInFlight}
                    onClick={() =>
                      runOperation(
                        { kind: 'push', forceWithLease: true },
                        contextMenu.repositoryId,
                      )
                    }
                  >
                    {t('webview.menu.forcePush')}
                  </button>
                );
                default:
                  return null;
              }
            })}
            <button
              type="button"
              role="menuitem"
              disabled={selectedOperationInFlight}
              onClick={() =>
                send({
                  type: 'applyPatch',
                  requestId: requestId('apply-patch'),
                  repositoryId: contextMenu.repositoryId,
                })
              }
            >
              {t('webview.menu.applyPatch')}
            </button>
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
                    ? t('webview.menu.maxCommitsTitle')
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
                {t('webview.menu.dropCommits')}              </button>
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
                    ? t('webview.menu.maxCommitsTitle')
                    : undefined
                }
                onClick={() => {
                  const hashes = contextMenu.commits.map((commit) => commit.hash);
                  const messageRequestId = requestId('commit-messages');
                  setActiveCommitMessagesRequest(messageRequestId);
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
                {t('webview.menu.squashCommits')}              </button>
            </>
          ) : null}
          {contextMenu.commits.length >= 1 &&
          !selectedRepository?.isBare &&
          !selectedRepository?.operationState ? (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={
                  !selectedRepository?.currentBranch ||
                  selectedOperationInFlight ||
                  contextMenu.commits.length !== 1 ||
                  contextMenu.commit.parents.length !== 1
                }
                title={
                  contextMenu.commits.length !== 1 || contextMenu.commit.parents.length !== 1
                    ? t('webview.menu.fixupCommitTitle')
                    : undefined
                }
                onClick={() =>
                  runOperation(
                    { kind: 'fixupCommit', hash: contextMenu.commit.hash },
                    contextMenu.repositoryId,
                  )
                }
              >
                {t('webview.menu.fixupCommit')}
              </button>
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
                    ? t('webview.menu.maxCommitsTitle')
                    : undefined
                }
                onClick={() => {
                  const hashes = contextMenu.commits.map((commit) => commit.hash);
                  const messageRequestId = requestId('commit-messages');
                  setActiveCommitMessagesRequest(messageRequestId);
                  setEditCommitMessages({
                    repositoryId: contextMenu.repositoryId,
                    requestId: messageRequestId,
                    edits: hashes.map((hash) => ({ hash, message: '' })),
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
                {t('webview.menu.editCommitMessages')}
              </button>
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
                    ? t('webview.menu.maxCommitsTitle')
                    : undefined
                }
                onClick={() => {
                  setRewriteAuthorIdentity({
                    repositoryId: contextMenu.repositoryId,
                    hashes: contextMenu.commits.map((commit) => commit.hash),
                    name: '',
                    email: '',
                  });
                  setContextMenu(undefined);
                }}
              >
                {t('webview.menu.rewriteAuthorIdentity')}
              </button>
            </>
          ) : null}
          <button
            type="button"
            role="menuitem"
            disabled={!contextMenu.commit.parents[0]}
            title={
              contextMenu.commit.parents[0]
                ? t('webview.menu.compareWithParentTitle')
                : t('webview.menu.compareWithParentRootTitle')
            }
            onClick={() =>
              openCommitComparison(
                contextMenu.commit.hash,
                'parent',
                contextMenu.commit.parents[0],
              )
            }
          >
            {t('webview.menu.compareWithParent')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={
              !selectedRepository?.head || selectedRepository.head === contextMenu.commit.hash
            }
            title={t('webview.menu.compareWithCurrentTitle')}
            onClick={() => openCommitComparison(contextMenu.commit.hash, 'current')}
          >
            {t('webview.menu.compareWithCurrent')}
          </button>
          {!selectedRepository?.isBare && !selectedRepository?.operationState ? (
            <>
              {contextMenu.commits.length === 1 ? (
                <>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={selectedOperationInFlight}
                    title={t('webview.menu.checkoutRevisionTitle')}
                    onClick={() =>
                      runOperation(
                        { kind: 'checkout', ref: contextMenu.commit.hash },
                        contextMenu.repositoryId,
                      )
                    }
                  >
                    {t('webview.menu.checkoutRevision')}
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
                      {t('webview.menu.amendHead')}                    </button>
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
                {t('webview.menu.createBranch')}              </button>
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
                {t('webview.menu.createTag')}              </button>
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
                {t('webview.menu.cherryPick')}
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
                {t('webview.menu.revert')}
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
                {t('webview.menu.mergeIntoCurrent')}
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
                {t('webview.menu.rebaseOntoThis')}
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
                    {t('webview.menu.resetSoft')}
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
                    {t('webview.menu.resetMixed')}
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
                    {t('webview.menu.resetHard')}                  </button>
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
            {t('webview.menu.copyHash')}
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
            {t('webview.menu.copySubject')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={detailsHash !== contextMenu.commit.hash}
            title={
              detailsHash === contextMenu.commit.hash
                ? t('webview.menu.copyFullMessageTitle')
                : t('webview.menu.copyFullMessageDisabledTitle')
            }
            onClick={() =>
              send({
                type: 'copyToClipboard',
                requestId: requestId('copy-message'),
                text: detailsBody ?? '',
              })
            }
          >
            {t('webview.menu.copyFullMessage')}
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
                ? t('webview.menu.binaryDiffTitle')
                : undefined
            }
            onClick={() => {
              openDiff(contextMenu.file);
              setContextMenu(undefined);
            }}
          >
            {t('webview.menu.showDiff')}
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={contextMenu.file.binary || (contextMenu.file.status === 'D' && !selectedParent)}
            title={
              contextMenu.file.binary
                ? t('webview.menu.binaryEditorTitle')
                : contextMenu.file.status === 'D' && !selectedParent
                  ? t('webview.menu.deletedNoParentTitle')
                  : undefined
            }
            onClick={() => openFile(contextMenu.file, 'revision')}
          >
            {t('webview.menu.openFileAtRevision')}
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => openFile(contextMenu.file, 'current')}
          >
            {t('webview.menu.openCurrentFile')}
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
            {t('webview.menu.copyPath')}
          </button>
          <button
            type="button"
            role="menuitem"
            title={t('webview.menu.filterByPathTitle')}
            onClick={() => {
              onFilterByPath(contextMenu.file.path);
              setContextMenu(undefined);
            }}
          >
            {t('webview.menu.filterByPath')}
          </button>
        </>
      ) : null}
      {contextMenu.kind === 'refFolder' ? (
        <button
          type="button"
          role="menuitem"
          disabled={
            selectedOperationInFlight ||
            Boolean(selectedRepository?.isBare) ||
            Boolean(selectedRepository?.operationState)
          }
          title={
            selectedRepository?.isBare
              ? t('webview.menu.bareReadOnlyTitle')
              : selectedRepository?.operationState
                ? t('webview.menu.finishOperationTitle')
                : t('webview.menu.deleteFolderRefsTitle', {
                    path: contextMenu.path,
                  })
          }
          onClick={() => {
            setFolderDelete({
              repositoryId: contextMenu.repositoryId,
              path: contextMenu.path,
              refs: contextMenu.refs,
              selected: new Set<string>(),
            });
          }}
        >
          {contextMenu.refs.length === 1
            ? t('webview.menu.deleteFolderRefsOne', {
                count: contextMenu.refs.length,
                path: contextMenu.path,
              })
            : t('webview.menu.deleteFolderRefsMany', {
                count: contextMenu.refs.length,
                path: contextMenu.path,
              })}
        </button>
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
            {t('webview.menu.compareWithCurrent')}
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
            {t('webview.menu.copyName')}
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
                  {t('webview.menu.checkout')}
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
                    {t('webview.menu.checkoutAsLocal')}                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      const remote = contextMenu.ref.remote;
                      if (!remote) return;
                      runOperation({ kind: 'fetch', remote }, contextMenu.repositoryId);
                    }}
                  >
                    {t('webview.menu.fetch')}
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
                    {t('webview.menu.deleteRemoteBranch')}                  </button>
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
                    {t('webview.menu.checkout')}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() =>
                      runOperation(
                        { kind: 'pushTag', name: contextMenu.ref.shortName },
                        contextMenu.repositoryId,
                      )
                    }
                  >
                    {t('webview.menu.pushTag')}
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
                    {t('webview.menu.deleteLocalTag')}                  </button>
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
                {t('webview.menu.createBranchFrom')}              </button>
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
                    {t('webview.menu.mergeIntoCurrent')}
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
                    {t('webview.menu.rebaseOntoThis')}
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
                      !contextMenu.ref.isCurrent
                        ? t('webview.menu.pushTitleCheckoutFirst')
                        : refPublishesBranch
                          ? t('webview.menu.pushTitlePublish')
                          : t('webview.menu.pushTitle')
                    }
                    onClick={() =>
                      runOperation(
                        { kind: refPublishesBranch ? 'publishBranch' : 'push' },
                        contextMenu.repositoryId,
                      )
                    }
                  >
                    {refPublishesBranch
                      ? t('webview.menu.publishBranch')
                      : t('webview.menu.push')}
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
                    {t('webview.menu.rename')}                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    disabled={contextMenu.ref.isCurrent}
                    onClick={() =>
                      runOperation(
                        { kind: 'deleteBranch', name: contextMenu.ref.shortName, force: true },
                        contextMenu.repositoryId,
                      )
                    }
                  >
                    {t('webview.menu.delete')}
                  </button>
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
            {t('webview.menu.copyHash')}
          </button>
          {!selectedRepository?.isBare && !selectedRepository?.operationState ? (
            <>
              <button
                type="button"
                role="menuitem"
                disabled={headIsPushed || selectedOperationInFlight}
                title={headIsPushed ? t('webview.menu.undoLastCommitPushedTitle') : undefined}
                onClick={() =>
                  runOperation(
                    { kind: 'undoLastCommit', hash: contextMenu.hash },
                    contextMenu.repositoryId,
                  )
                }
              >
                {t('webview.menu.undoLastCommit')}
              </button>
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
                {t('webview.menu.createBranch')}              </button>
              {canCreateOrphanBranch ? (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setNamedOperation({
                      kind: 'createOrphanBranch',
                      repositoryId: contextMenu.repositoryId,
                      value: '',
                    });
                    setContextMenu(undefined);
                  }}
                >
                  {t('webview.menu.createOrphanBranch')}                </button>
              ) : null}
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
                {t('webview.menu.createTag')}              </button>
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
                    {t('webview.menu.resetSoft')}
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
                    {t('webview.menu.resetMixed')}
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
                    {t('webview.menu.resetHard')}                  </button>
                </>
              ) : null}
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
