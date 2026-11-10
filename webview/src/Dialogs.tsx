import { useLayoutEffect, useRef, useState, type ReactElement } from "react";
import type { Dispatch, RefObject, SetStateAction } from "react";
import type { RepositorySummary } from "../../src/shared/models";
import type {
  GitOperationRequest,
  WebviewToExtensionMessage,
} from "../../src/protocol/messages";
import type {
  AmendDialogState,
  BranchCleanupDialogState,
  EditCommitMessagesState,
  HistoryParentPickerState,
  RewriteAuthorIdentityState,
  SquashOperationState,
  StashDialogState,
} from "./workbenchEffects";
import type { FolderDeleteState, NamedOperationState } from "./App";
import { formatCommitDate } from "./formatCommitDate";
import { t } from "./i18n";
import { requestId } from "./webviewUtils";

const namedOperationDialogKeys: Record<NamedOperationState["kind"], string> = {
  createBranch: "webview.namedOperation.dialog.createBranch",
  createOrphanBranch: "webview.namedOperation.dialog.createOrphanBranch",
  createTag: "webview.namedOperation.dialog.createTag",
  checkoutRemote: "webview.namedOperation.dialog.checkoutRemote",
  renameBranch: "webview.namedOperation.dialog.renameBranch",
};

const namedOperationLabelKeys: Record<NamedOperationState["kind"], string> = {
  createBranch: "webview.namedOperation.label.branch",
  createOrphanBranch: "webview.namedOperation.label.branch",
  createTag: "webview.namedOperation.label.tag",
  checkoutRemote: "webview.namedOperation.label.localBranch",
  renameBranch: "webview.namedOperation.label.newBranch",
};

const namedOperationSubmitKeys: Record<NamedOperationState["kind"], string> = {
  createBranch: "webview.namedOperation.submit.createBranch",
  createOrphanBranch: "webview.namedOperation.submit.createOrphanBranch",
  createTag: "webview.namedOperation.submit.createTag",
  checkoutRemote: "webview.namedOperation.submit.checkoutRemote",
  renameBranch: "webview.namedOperation.submit.renameBranch",
};

interface DialogsProps {
  stashDialog: StashDialogState | undefined;
  setStashDialog: Dispatch<SetStateAction<StashDialogState | undefined>>;
  stashDialogRepositoryRef: RefObject<string | undefined>;
  amendDialog: AmendDialogState | undefined;
  setAmendDialog: Dispatch<SetStateAction<AmendDialogState | undefined>>;
  branchCleanup: BranchCleanupDialogState | undefined;
  setBranchCleanup: Dispatch<
    SetStateAction<BranchCleanupDialogState | undefined>
  >;
  submitBranchCleanup: () => void;
  folderDelete: FolderDeleteState | undefined;
  setFolderDelete: Dispatch<SetStateAction<FolderDeleteState | undefined>>;
  submitFolderDelete: () => void;
  historyParentPicker: HistoryParentPickerState | undefined;
  setHistoryParentPicker: Dispatch<
    SetStateAction<HistoryParentPickerState | undefined>
  >;
  historyParentChoicesRef: RefObject<Map<string, string>>;
  squashOperation: SquashOperationState | undefined;
  setSquashOperation: Dispatch<
    SetStateAction<SquashOperationState | undefined>
  >;
  editCommitMessages: EditCommitMessagesState | undefined;
  setEditCommitMessages: Dispatch<
    SetStateAction<EditCommitMessagesState | undefined>
  >;
  rewriteAuthorIdentity: RewriteAuthorIdentityState | undefined;
  setRewriteAuthorIdentity: Dispatch<
    SetStateAction<RewriteAuthorIdentityState | undefined>
  >;
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
            aria-label={t("webview.stash.dialog")}
          >
            <button
              className="stash-dialog-close"
              type="button"
              aria-label={t("webview.stash.closeAria")}
              title={t("webview.common.close")}
              onClick={() => {
                stashDialogRepositoryRef.current = undefined;
                setStashDialog(undefined);
              }}
            >
              <span aria-hidden="true">×</span>
            </button>
            <strong>{t("webview.stash.heading")}</strong>
            <section className="stash-tool-section">
              <span>{t("webview.stash.section")}</span>
              <input
                className="stash-message-input"
                aria-label={t("webview.stash.messageAria")}
                placeholder={t("webview.stash.messagePlaceholder")}
                value={stashDialog.stashMessage}
                disabled={Boolean(selectedRepository?.operationState)}
                onChange={(event) =>
                  setStashDialog((current) =>
                    current
                      ? { ...current, stashMessage: event.target.value }
                      : current,
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
                          ? {
                              ...current,
                              includeUntracked: event.target.checked,
                            }
                          : current,
                      )
                    }
                  />
                  <span>{t("webview.stash.includeUntracked")}</span>
                </label>
                <button
                  className="stash-submit-button"
                  type="button"
                  disabled={
                    Boolean(selectedRepository?.operationState) ||
                    selectedOperationInFlight
                  }
                  onClick={() =>
                    runOperation(
                      {
                        kind: "createStash",
                        message: stashDialog.stashMessage,
                        includeUntracked: stashDialog.includeUntracked,
                      },
                      stashDialog.repositoryId,
                    )
                  }
                >
                  {t("webview.stash.create")}
                </button>
              </div>
              {stashDialog.loading ? (
                <span>{t("webview.stash.loading")}</span>
              ) : null}
              {stashDialog.stashes.map((stash) => (
                <div className="stash-tool-row" key={stash.ref}>
                  <span>{stash.subject}</span>
                  <button
                    type="button"
                    aria-label={t("webview.stash.showChangesAria", {
                      ref: stash.ref,
                    })}
                    onClick={() =>
                      send({
                        type: "openStashComparison",
                        requestId: requestId("stash-diff"),
                        repositoryId: stashDialog.repositoryId,
                        hash: stash.hash,
                      })
                    }
                  >
                    {t("webview.stash.showChanges")}
                  </button>
                  <button
                    type="button"
                    disabled={
                      Boolean(selectedRepository?.operationState) ||
                      selectedOperationInFlight
                    }
                    onClick={() =>
                      runOperation(
                        { kind: "applyStash", stash: stash.ref },
                        stashDialog.repositoryId,
                      )
                    }
                  >
                    {t("webview.stash.apply")}
                  </button>
                  <button
                    type="button"
                    disabled={
                      Boolean(selectedRepository?.operationState) ||
                      selectedOperationInFlight
                    }
                    onClick={() =>
                      runOperation(
                        { kind: "popStash", stash: stash.ref },
                        stashDialog.repositoryId,
                      )
                    }
                  >
                    {t("webview.stash.pop")}
                  </button>
                  <button
                    type="button"
                    disabled={
                      Boolean(selectedRepository?.operationState) ||
                      selectedOperationInFlight
                    }
                    onClick={() =>
                      runOperation(
                        { kind: "dropStash", stash: stash.ref },
                        stashDialog.repositoryId,
                      )
                    }
                  >
                    {t("webview.stash.drop")}
                  </button>
                </div>
              ))}
            </section>
          </div>
        </div>
      ) : null}

      {amendDialog ? (
        <div className="operation-dialog-backdrop">
          <div
            className="operation-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("webview.amend.dialog")}
          >
            <strong>{t("webview.amend.heading")}</strong>
            <span>{t("webview.amend.description")}</span>
            <textarea
              aria-label={t("webview.amend.messageAria")}
              value={amendDialog.message}
              onChange={(event) =>
                setAmendDialog((current) =>
                  current
                    ? { ...current, message: event.target.value }
                    : current,
                )
              }
            />
            <div className="operation-dialog-actions">
              <button type="button" onClick={() => setAmendDialog(undefined)}>
                {t("webview.common.cancel")}
              </button>
              <button
                type="button"
                aria-label={t("webview.amend.submitAria")}
                disabled={!amendDialog.message.trim()}
                onClick={() => {
                  runOperation(
                    { kind: "amendCommit", message: amendDialog.message },
                    amendDialog.repositoryId,
                  );
                  setAmendDialog(undefined);
                }}
              >
                {t("webview.amend.submit")}
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
            aria-label={t("webview.historyParent.dialog")}
          >
            <strong>{t("webview.historyParent.heading")}</strong>
            <span>{historyParentPicker.commit.subject}</span>
            <div className="history-parent-options">
              {historyParentPicker.commit.parents.map((parent, index) => (
                <button
                  type="button"
                  aria-label={t("webview.historyParent.compareAria", {
                    hash: parent.slice(0, 8),
                  })}
                  title={parent}
                  key={parent}
                  onClick={() => {
                    historyParentChoicesRef.current.set(
                      historyParentPicker.commit.hash,
                      parent,
                    );
                    send({
                      type: "openHistoryDiff",
                      requestId: requestId("history-diff"),
                      repositoryId: historyParentPicker.repositoryId,
                      hash: historyParentPicker.commit.hash,
                      parent,
                    });
                    setHistoryParentPicker(undefined);
                  }}
                >
                  {t("webview.historyParent.option", {
                    index: index + 1,
                    hash: parent.slice(0, 8),
                  })}
                </button>
              ))}
            </div>
            <div className="operation-dialog-actions">
              <button
                type="button"
                onClick={() => setHistoryParentPicker(undefined)}
              >
                {t("webview.common.cancel")}
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
            aria-label={t("webview.squash.dialog")}
            onSubmit={(event) => {
              event.preventDefault();
              if (squashOperation.loading || !squashOperation.message.trim())
                return;
              runOperation(
                {
                  kind: "squashCommits",
                  hashes: squashOperation.hashes,
                  message: squashOperation.message,
                },
                squashOperation.repositoryId,
              );
              setSquashOperation(undefined);
            }}
          >
            <label>
              <span>{t("webview.squash.messageLabel")}</span>
              <textarea
                autoFocus
                aria-label={t("webview.squash.messageAria")}
                disabled={squashOperation.loading}
                value={squashOperation.message}
                onChange={(event) =>
                  setSquashOperation((current) =>
                    current
                      ? { ...current, message: event.target.value }
                      : current,
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
                {t("webview.common.cancel")}
              </button>
              <button
                type="submit"
                disabled={
                  squashOperation.loading || !squashOperation.message.trim()
                }
              >
                {t("webview.squash.submit")}
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
            aria-label={t("webview.editMessages.dialog")}
            onSubmit={(event) => {
              event.preventDefault();
              if (editCommitMessages.loading) return;
              const edits = editCommitMessages.edits
                .map((entry) => ({ ...entry, message: entry.message.trim() }))
                .filter((entry) => entry.message.length > 0);
              if (edits.length === 0) return;
              runOperation(
                { kind: "editCommitMessages", edits },
                editCommitMessages.repositoryId,
              );
              setEditCommitMessages(undefined);
            }}
          >
            <strong>{t("webview.editMessages.heading")}</strong>
            <span>{t("webview.editMessages.description")}</span>
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
                          itemIndex === index
                            ? { ...item, message: value }
                            : item,
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
                {t("webview.common.cancel")}
              </button>
              <button
                type="submit"
                disabled={
                  editCommitMessages.loading ||
                  editCommitMessages.edits.some(
                    (entry) => !entry.message.trim(),
                  )
                }
              >
                {t("webview.editMessages.submit")}
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
            aria-label={t("webview.rewriteAuthor.dialog")}
            onSubmit={(event) => {
              event.preventDefault();
              if (
                !rewriteAuthorIdentity.name.trim() ||
                !rewriteAuthorIdentity.email.trim()
              )
                return;
              runOperation(
                {
                  kind: "rewriteAuthorIdentity",
                  hashes: rewriteAuthorIdentity.hashes,
                  name: rewriteAuthorIdentity.name.trim(),
                  email: rewriteAuthorIdentity.email.trim(),
                },
                rewriteAuthorIdentity.repositoryId,
              );
              setRewriteAuthorIdentity(undefined);
            }}
          >
            <strong>{t("webview.rewriteAuthor.heading")}</strong>
            <span>
              {t(
                rewriteAuthorIdentity.hashes.length === 1
                  ? "webview.rewriteAuthor.descriptionOne"
                  : "webview.rewriteAuthor.descriptionMany",
                { count: rewriteAuthorIdentity.hashes.length },
              )}
            </span>
            <label>
              <span>{t("webview.rewriteAuthor.name")}</span>
              <input
                autoFocus
                aria-label={t("webview.rewriteAuthor.name")}
                value={rewriteAuthorIdentity.name}
                onChange={(event) =>
                  setRewriteAuthorIdentity((current) =>
                    current
                      ? { ...current, name: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            <label>
              <span>{t("webview.rewriteAuthor.email")}</span>
              <input
                aria-label={t("webview.rewriteAuthor.email")}
                value={rewriteAuthorIdentity.email}
                onChange={(event) =>
                  setRewriteAuthorIdentity((current) =>
                    current
                      ? { ...current, email: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            <button
              type="button"
              className="identity-suggestion-button"
              title={t("webview.rewriteAuthor.mailmapTitle")}
              onClick={() =>
                send({
                  type: "requestIdentityMappingCandidates",
                  requestId: requestId("identity-candidates"),
                  repositoryId: rewriteAuthorIdentity.repositoryId,
                  hashes: rewriteAuthorIdentity.hashes,
                })
              }
            >
              {t("webview.rewriteAuthor.mailmap")}
            </button>
            <div className="operation-dialog-actions">
              <button
                type="button"
                onClick={() => setRewriteAuthorIdentity(undefined)}
              >
                {t("webview.common.cancel")}
              </button>
              <button
                type="submit"
                disabled={
                  !rewriteAuthorIdentity.name.trim() ||
                  !rewriteAuthorIdentity.email.trim()
                }
              >
                {t("webview.rewriteAuthor.submit")}
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
            aria-label={t(namedOperationDialogKeys[namedOperation.kind])}
            onSubmit={(event) => {
              event.preventDefault();
              submitNamedOperation();
            }}
          >
            <label>
              <span>{t(namedOperationLabelKeys[namedOperation.kind])}</span>
              <input
                autoFocus
                aria-label={t(namedOperationLabelKeys[namedOperation.kind])}
                value={namedOperation.value}
                onChange={(event) =>
                  setNamedOperation((current) =>
                    current
                      ? { ...current, value: event.target.value }
                      : current,
                  )
                }
              />
            </label>
            {namedOperation.kind === "createOrphanBranch" ? (
              <p className="named-operation-note">
                {t("webview.namedOperation.orphanNote")}
              </p>
            ) : null}
            <div className="operation-dialog-actions">
              <button
                type="button"
                onClick={() => setNamedOperation(undefined)}
              >
                {t("webview.common.cancel")}
              </button>
              <button type="submit" disabled={!namedOperation.value.trim()}>
                {t(namedOperationSubmitKeys[namedOperation.kind])}
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
            aria-label={t("webview.cleanup.dialog")}
          >
            <strong>{t("webview.cleanup.heading")}</strong>
            {branchCleanup.loading ? (
              <p className="branch-cleanup-empty">
                {t("webview.cleanup.loading")}
              </p>
            ) : branchCleanup.candidates.length === 0 ? (
              <p className="branch-cleanup-empty">
                {t("webview.cleanup.empty")}
              </p>
            ) : (
              <ul className="branch-cleanup-list">
                <li className="branch-cleanup-head-row">
                  <div className="branch-cleanup-row branch-cleanup-head">
                    <input
                      type="checkbox"
                      aria-label={t("webview.cleanup.selectAllAria")}
                      checked={
                        branchCleanup.selected.size ===
                        branchCleanup.candidates.length
                      }
                      ref={(input) => {
                        if (input)
                          input.indeterminate =
                            branchCleanup.selected.size > 0 &&
                            branchCleanup.selected.size <
                              branchCleanup.candidates.length;
                      }}
                      onChange={(event) =>
                        setBranchCleanup((current) => {
                          if (!current) return current;
                          const selected = event.target.checked
                            ? new Set(
                                current.candidates.map(
                                  (candidate) => candidate.name,
                                ),
                              )
                            : new Set<string>();
                          return { ...current, selected };
                        })
                      }
                    />
                    <span className="branch-cleanup-colhead">
                      {t("webview.cleanup.column.branch")}
                    </span>
                    <span className="branch-cleanup-colhead end">
                      {t("webview.cleanup.column.status")}
                    </span>
                    <span className="branch-cleanup-colhead end">
                      {t("webview.cleanup.column.lastCommit")}
                    </span>
                  </div>
                </li>
                {branchCleanup.candidates.map((candidate) => (
                  <li key={candidate.name}>
                    <label className="branch-cleanup-row">
                      <input
                        type="checkbox"
                        aria-label={t("webview.cleanup.deleteAria", {
                          name: candidate.name,
                        })}
                        checked={branchCleanup.selected.has(candidate.name)}
                        onChange={(event) =>
                          setBranchCleanup((current) => {
                            if (!current) return current;
                            const selected = new Set(current.selected);
                            if (event.target.checked)
                              selected.add(candidate.name);
                            else selected.delete(candidate.name);
                            return { ...current, selected };
                          })
                        }
                      />
                      <span className="branch-cleanup-name-cell">
                        <span
                          className="branch-cleanup-name"
                          title={candidate.name}
                        >
                          {candidate.name}
                        </span>
                        {candidate.gone ? (
                          <span className="branch-cleanup-badge gone">
                            {t("webview.cleanup.upstreamGone")}
                          </span>
                        ) : null}
                      </span>
                      {candidate.merged ? (
                        <span className="branch-cleanup-badge merged">
                          {t("webview.cleanup.merged")}
                        </span>
                      ) : (
                        <span className="branch-cleanup-badge unmerged">
                          {t("webview.cleanup.unmerged", {
                            count: candidate.aheadCount,
                          })}
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
              {t(
                selectedRepository?.currentBranch
                  ? "webview.cleanup.noteMerged"
                  : "webview.cleanup.noteNoBranch",
                { branch: selectedRepository?.currentBranch ?? "" },
              )}
              {t("webview.cleanup.noteTail")}
            </p>
            <div className="operation-dialog-actions">
              <button type="button" onClick={() => setBranchCleanup(undefined)}>
                {t("webview.common.cancel")}
              </button>
              <button
                type="button"
                disabled={
                  branchCleanup.loading || branchCleanup.selected.size === 0
                }
                onClick={submitBranchCleanup}
              >
                {branchCleanup.selected.size === 1
                  ? t("webview.cleanup.deleteOne")
                  : t("webview.cleanup.deleteMany", {
                      count: branchCleanup.selected.size,
                    })}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {folderDelete ? (
        <div className="operation-dialog-backdrop">
          <div
            className="operation-dialog branch-cleanup-dialog folder-delete-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={t("webview.folderDelete.dialog", {
              path: folderDelete.path,
            })}
          >
            <strong>
              {t("webview.folderDelete.heading", { path: folderDelete.path })}
            </strong>
            <ul className="branch-cleanup-list">
              <li className="branch-cleanup-head-row">
                <div className="branch-cleanup-row branch-cleanup-head">
                  <input
                    type="checkbox"
                    aria-label={t("webview.folderDelete.selectAllAria")}
                    checked={
                      folderDelete.refs.length > 0 &&
                      folderDelete.selected.size === folderDelete.refs.length
                    }
                    ref={(input) => {
                      if (input)
                        input.indeterminate =
                          folderDelete.selected.size > 0 &&
                          folderDelete.selected.size < folderDelete.refs.length;
                    }}
                    onChange={(event) =>
                      setFolderDelete((current) => {
                        if (!current) return current;
                        const selected = event.target.checked
                          ? new Set(current.refs.map((ref) => ref.fullName))
                          : new Set<string>();
                        return { ...current, selected };
                      })
                    }
                  />
                  <span className="branch-cleanup-colhead">
                    {t("webview.folderDelete.column.reference")}
                  </span>
                  <span className="branch-cleanup-colhead end">
                    {t("webview.folderDelete.column.type")}
                  </span>
                  <span className="branch-cleanup-colhead end">
                    {t("webview.folderDelete.column.status")}
                  </span>
                </div>
              </li>
              {folderDelete.refs.map((ref) => (
                <li key={ref.fullName}>
                  <label className="branch-cleanup-row">
                    <input
                      type="checkbox"
                      aria-label={t("webview.folderDelete.deleteAria", {
                        name: ref.shortName,
                      })}
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
                    <span className="branch-cleanup-badge merged">
                      {ref.kind}
                    </span>
                    {ref.gone ? (
                      <span className="branch-cleanup-badge gone">
                        {t("webview.cleanup.upstreamGone")}
                      </span>
                    ) : null}
                  </label>
                </li>
              ))}
            </ul>
            <p className="branch-cleanup-note">
              {t("webview.folderDelete.note")}
            </p>
            <div className="operation-dialog-actions">
              <button type="button" onClick={() => setFolderDelete(undefined)}>
                {t("webview.common.cancel")}
              </button>
              <button
                type="button"
                disabled={folderDelete.selected.size === 0}
                onClick={submitFolderDelete}
              >
                {folderDelete.selected.size === 1
                  ? t("webview.folderDelete.deleteOne", {
                      count: folderDelete.selected.size,
                    })
                  : t("webview.folderDelete.deleteMany", {
                      count: folderDelete.selected.size,
                    })}
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
    element.style.height = "auto";
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
        <div className="edit-commit-messages-loading">
          {t("webview.editMessages.loading")}
        </div>
      ) : null}
      {entry ? (
        <>
          <div className="edit-commit-messages-nav">
            <button
              type="button"
              aria-label={t("webview.editMessages.previous")}
              title={t("webview.editMessages.previous")}
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
              aria-label={t("webview.editMessages.next")}
              title={t("webview.editMessages.next")}
              disabled={current >= total - 1}
              onClick={() =>
                setIndex((value) => Math.min(value + 1, total - 1))
              }
            >
              ›
            </button>
          </div>
          <AutoGrowTextarea
            ariaLabel={t("webview.editMessages.messageAria", {
              hash: entry.hash.slice(0, 12),
            })}
            disabled={loading}
            value={entry.message}
            onValueChange={(value) => onEditMessageChange(current, value)}
          />
        </>
      ) : null}
    </section>
  );
}
