import {
  layoutCommitGraph,
  type GraphContinuationState,
} from '../../src/shared/layoutCommitGraph';
import type { ExtensionToWebviewMessage, LogFilters } from '../../src/protocol/messages';
import { defaultFilters } from '../../src/protocol/messages';
import type { CommitSummary } from '../../src/shared/models';
import { advanceCommitWindow } from './commitWindow';
import { emptyCommitSelection } from './commitSelection';
import { requestId } from './webviewUtils';
import {
  EMPTY_GRAPH_LAYOUT_CACHE,
  type GraphLayoutCache,
  type WorkbenchState,
} from './workbenchStore';
import type { WorkbenchEffects, WorkbenchRaceState } from './workbenchEffects';

/**
 * Dependencies needed to run the extension message processor. The store supplies
 * read access to the non-reactive race/effects slices and a state dispatcher, so
 * the processor stays decoupled from the store shape and only depends on the
 * message contract.
 */
export interface MessageProcessorDeps {
  get(): { race: WorkbenchRaceState; effects: WorkbenchEffects };
  setWorkbenchState(next: WorkbenchState | ((current: WorkbenchState) => WorkbenchState)): void;
}

function filtersEqual(left: LogFilters, right: LogFilters): boolean {
  const sameItems = (leftItems: readonly string[], rightItems: readonly string[]): boolean =>
    leftItems.length === rightItems.length &&
    leftItems.every((item, index) => item === rightItems[index]);
  return (
    left.text === right.text &&
    left.dateFrom === right.dateFrom &&
    left.dateTo === right.dateTo &&
    sameItems(left.branches, right.branches) &&
    sameItems(left.authors, right.authors) &&
    sameItems(left.paths, right.paths)
  );
}

// Incrementally compute the commit-graph layout. The `previous` cache is the
// layout already in WorkbenchState; when the new commits merely append to the
// previously laid-out prefix we lay out only the tail and splice the rows, which
// is O(appended) instead of O(commits). Any other change (replace, evict, history
// view) falls back to a from-scratch layout, so the output is always identical to
// `layoutCommitGraph(commits, graphContinuation)` for the commit list, or to a
// layout of the history entries when `history` is set.
function computeGraphLayout(
  commits: CommitSummary[],
  graphContinuation: GraphContinuationState | undefined,
  history: WorkbenchState['history'],
  previous: GraphLayoutCache | undefined,
): GraphLayoutCache {
  if (history) {
    const visibleHashes = new Set(history.entries.map((entry) => entry.hash));
    return {
      mode: 'history',
      commits,
      result: layoutCommitGraph(
        history.entries.map((entry) => ({
          hash: entry.hash,
          parents: entry.parents.filter((parent) => visibleHashes.has(parent)),
        })),
      ),
    };
  }
  if (
    previous?.mode === 'commits' &&
    commits.length > previous.commits.length &&
    commits
      .slice(0, previous.commits.length)
      .every((commit, index) => commit === previous.commits[index])
  ) {
    const appended = commits.slice(previous.commits.length);
    const appendedLayout = layoutCommitGraph(appended, previous.result.continuation);
    return {
      mode: 'commits',
      commits,
      result: {
        rows: [...previous.result.rows, ...appendedLayout.rows],
        continuation: appendedLayout.continuation,
        maxLaneCount: Math.max(previous.result.maxLaneCount, appendedLayout.maxLaneCount),
      },
    };
  }
  return {
    mode: 'commits',
    commits,
    result: layoutCommitGraph(commits, graphContinuation),
  };
}

/**
 * Factory that produces the store's `processMessage` action. Keeps the full
 * extension-message handling switch (migrated from App.tsx's message listener)
 * in one place. The returned handler updates `WorkbenchState` and the mutable
 * `race` slice exactly as the original listener did — functional state updates,
 * in-place race reads/writes and nested component side effects are preserved
 * verbatim to keep behavior identical.
 */
export function createMessageProcessor(
  deps: MessageProcessorDeps,
): (message: ExtensionToWebviewMessage) => void {
  const { get, setWorkbenchState } = deps;
  return (message) => {
    const race = get().race;
    const effects = get().effects;
    const setState = setWorkbenchState;
    switch (message.type) {
      case 'initialize':
        if (
          race.requestById.get(message.requestId) === 'repositories' &&
          race.latestByScope.repositories !== message.requestId
        ) {
          race.requestById.delete(message.requestId);
          break;
        }
        race.requestById.delete(message.requestId);
        race.activeSelectionRequest = undefined;
        race.activeCommitMessagesRequest = undefined;
        effects.setCommitSelection(emptyCommitSelection);
        effects.setSquashOperation(undefined);
        effects.setStashDialog(undefined);
        effects.setAmendDialog(undefined);
        effects.stashDialogRepositoryRef.current = undefined;
        race.activeOperationByRepository.clear();
        race.pendingFilters = undefined;
        effects.lastWindowAnchorSignatureRef.current = undefined;
        race.acceptedRepositoryId = message.selectedRepositoryId;
        if (message.layout.detailsPlacement === 'changes') {
          effects.setResponsiveExpanded((current) =>
            current.files ? current : { ...current, files: true },
          );
        }
        setState((current) => ({
          ...current,
          repositories: message.repositories,
          selectedRepositoryId: message.selectedRepositoryId,
          pageSize: message.pageSize,
          maxCachedCommits: message.maxCachedCommits ?? 5000,
          nextLogOffset: 0,
          startLogOffset: 0,
          graphContinuation: undefined,
          graphLayout: EMPTY_GRAPH_LAYOUT_CACHE,
          windowAnchorReady: false,
          operationRepositoryIds: new Set(),
          layout: message.layout,
          filters: defaultFilters,
          refs: [],
          commits: [],
          commitListRevision: current.commitListRevision + 1,
          details: undefined,
          detailsRepositoryId: undefined,
          selectedParent: undefined,
          files: [],
          selectedFile: undefined,
          error: undefined,
          errorRecovery: undefined,
          folderHistory: undefined,
        }));
        break;
      case 'commitMessagesLoaded':
        if (race.activeCommitMessagesRequest !== message.requestId) break;
        race.activeCommitMessagesRequest = undefined;
        effects.setSquashOperation((current) =>
          current &&
          current.requestId === message.requestId &&
          current.repositoryId === message.repositoryId
            ? {
                ...current,
                loading: false,
                message: message.messages
                  .map((entry) => entry.message.replace(/\r?\n$/u, ''))
                  .join('\n\n'),
              }
            : current,
        );
        break;
      case 'stashStateLoaded':
        effects.setStashDialog((current) =>
          current && current.repositoryId === message.repositoryId
            ? { ...current, stashes: message.stashes, loading: false }
            : current,
        );
        break;
      case 'repositoryData': {
        if (race.acceptedRepositoryId !== message.repositoryId) {
          race.requestById.delete(message.requestId);
          break;
        }
        if (
          race.requestById.get(message.requestId) === 'log' &&
          race.latestByScope.log !== message.requestId
        ) {
          race.requestById.delete(message.requestId);
          break;
        }
        race.requestById.delete(message.requestId);
        const pendingFilters = race.pendingFilters;
        const resolvesPendingFilters =
          pendingFilters?.repositoryId === message.repositoryId &&
          (pendingFilters.requestId === message.requestId ||
            filtersEqual(pendingFilters.filters, message.filters));
        const preservesPendingFilters =
          pendingFilters?.repositoryId === message.repositoryId && !resolvesPendingFilters;
        if (resolvesPendingFilters) race.pendingFilters = undefined;
        if (message.replace && message.scrollTop !== undefined) {
          effects.setScrollTopByRepository((current) => {
            const next = { ...current, [message.repositoryId]: message.scrollTop ?? 0 };
            effects.scrollTopByRepositoryRef.current = next;
            if (race.pendingScrollPosition?.repositoryId === message.repositoryId) {
              race.pendingScrollPosition = undefined;
            }
            effects.persistScrollTopByRepository(next);
            return next;
          });
        }
        if (message.selectedHash) {
          const selectedHash = message.selectedHash;
          race.activeSelectionRequest = {
            requestId: message.requestId,
            repositoryId: message.repositoryId,
            hash: selectedHash,
          };
          if (message.selectedHashes) {
            effects.setCommitSelection({
              hashes: message.selectedHashes,
              anchor: selectedHash,
            });
          } else {
            effects.setCommitSelection((current) => {
              const selectedIndexes = current.hashes.map((hash) =>
                message.commits.findIndex((commit) => commit.hash === hash),
              );
              const keepsSelection =
                current.hashes.length > 1 &&
                current.hashes.includes(selectedHash) &&
                selectedIndexes.every((index) => index >= 0);
              if (keepsSelection) return current;
              return { hashes: [selectedHash], anchor: selectedHash };
            });
          }
        }
        setState((current) => {
          if (current.selectedRepositoryId !== message.repositoryId) return current;
          const commitWindow = advanceCommitWindow(
            {
              commits: current.commits,
              graphContinuation: current.graphContinuation,
              nextLogOffset: current.nextLogOffset,
              startLogOffset: current.startLogOffset,
            },
            message.commits,
            current.maxCachedCommits,
            message.replace,
            message.startLogOffset ?? (message.replace ? 0 : current.nextLogOffset),
            message.graphContinuation,
          );
          const keepsSelection =
            message.selectedHash !== undefined ||
            !message.replace ||
            (current.selectedHash !== undefined &&
              commitWindow.commits.some((commit) => commit.hash === current.selectedHash));
          const graphLayout = computeGraphLayout(
            commitWindow.commits,
            commitWindow.graphContinuation,
            current.history,
            message.replace ? undefined : current.graphLayout,
          );
          return {
            ...current,
            selectedRepositoryId: message.repositoryId,
            graphLayout,
            refs: message.refs,
            filters: preservesPendingFilters ? current.filters : message.filters,
            commits: commitWindow.commits,
            commitListRevision: message.replace
              ? current.commitListRevision + 1
              : current.commitListRevision,
            nextLogOffset: commitWindow.nextLogOffset,
            startLogOffset: commitWindow.startLogOffset,
            graphContinuation: commitWindow.graphContinuation,
            windowAnchorReady: true,
            ...(message.selectedHash ? { selectedHash: message.selectedHash } : {}),
            hasMore: message.hasMore,
            loading: undefined,
            error: undefined,
            errorRecovery: undefined,
            ...(message.replace && !keepsSelection
              ? {
                  selectedHash: undefined,
                  details: undefined,
                  detailsRepositoryId: undefined,
                  selectedParent: undefined,
                  files: [],
                  selectedFile: undefined,
                }
              : {}),
          };
        });
        break;
      }
      case 'repositoriesUpdated':
        if (
          message.selectedRepositoryId &&
          message.selectedRepositoryId !== race.acceptedRepositoryId &&
          effects.latestRepositorySelectionRequestRef.current !== message.requestId
        ) {
          break;
        }
        setState((current) => {
          const selectedRepositoryId =
            message.selectedRepositoryId ?? current.selectedRepositoryId;
          race.acceptedRepositoryId = selectedRepositoryId;
          if (selectedRepositoryId !== current.selectedRepositoryId) {
            race.activeSelectionRequest = undefined;
            effects.lastWindowAnchorSignatureRef.current = undefined;
            return {
              ...current,
              repositories: message.repositories,
              selectedRepositoryId,
              refs: [],
              commits: [],
              commitListRevision: current.commitListRevision + 1,
              nextLogOffset: 0,
              startLogOffset: 0,
              graphContinuation: undefined,
              graphLayout: EMPTY_GRAPH_LAYOUT_CACHE,
              windowAnchorReady: false,
              selectedHash: undefined,
              details: undefined,
              detailsRepositoryId: undefined,
              selectedParent: undefined,
              files: [],
              selectedFile: undefined,
            };
          }
          return { ...current, repositories: message.repositories };
        });
        break;
      case 'selectionDetailsLoaded':
        race.requestById.delete(message.requestId);
        setState((current) => {
          const activeRequest = race.activeSelectionRequest;
          if (
            !activeRequest ||
            activeRequest.requestId !== message.requestId ||
            activeRequest.repositoryId !== message.repositoryId ||
            activeRequest.hash !== message.details.hash ||
            current.selectedRepositoryId !== message.repositoryId ||
            current.selectedHash !== message.details.hash
          ) {
            return current;
          }
          return {
            ...current,
            details: message.details,
            detailsRepositoryId: message.repositoryId,
            selectedParent: message.selectedParent ?? message.details.parents[0],
            files: message.files,
            selectedFile: undefined,
            loading: undefined,
            error: undefined,
            errorRecovery: undefined,
          };
        });
        break;
      case 'historyOpened':
        if (message.replace) effects.historyParentChoicesRef.current.clear();
        effects.setHistoryParentPicker(undefined);
        setState((current) => {
          const history = {
            repositoryId: message.repositoryId,
            kind: message.kind,
            path: message.path,
            ...(message.startLine !== undefined ? { startLine: message.startLine } : {}),
            ...(message.endLine !== undefined ? { endLine: message.endLine } : {}),
            entries: message.replace
              ? message.entries
              : [...(current.history?.entries ?? []), ...message.entries],
            hasMore: message.hasMore,
            ...(message.notice ? { notice: message.notice } : {}),
          };
          return {
            ...current,
            history,
            graphLayout: computeGraphLayout(
              current.commits,
              current.graphContinuation,
              history,
              current.graphLayout,
            ),
            loading: undefined,
            error: undefined,
            errorRecovery: undefined,
          };
        });
        break;
      case 'historyClosed':
        effects.historyParentChoicesRef.current.clear();
        effects.setHistoryParentPicker(undefined);
        setState((current) =>
          current.history?.repositoryId === message.repositoryId
            ? {
                ...current,
                history: undefined,
                graphLayout: computeGraphLayout(
                  current.commits,
                  current.graphContinuation,
                  undefined,
                  current.graphLayout,
                ),
                ...(message.reason ? { error: message.reason, errorRecovery: undefined } : {}),
              }
            : current,
        );
        break;
      case 'folderHistoryOpened':
        race.acceptedRepositoryId = message.repositoryId;
        effects.historyParentChoicesRef.current.clear();
        effects.setHistoryParentPicker(undefined);
        setState((current) => {
          const repositories = current.repositories.some(
            (repository) => repository.id === message.repository.id,
          )
            ? current.repositories.map((repository) =>
                repository.id === message.repository.id ? message.repository : repository,
              )
            : [...current.repositories, message.repository];
          return {
            ...current,
            repositories,
            selectedRepositoryId: message.repositoryId,
            refs: [],
            commits: [],
            graphLayout: EMPTY_GRAPH_LAYOUT_CACHE,
            commitListRevision: current.commitListRevision + 1,
            selectedHash: undefined,
            details: undefined,
            detailsRepositoryId: undefined,
            selectedParent: undefined,
            files: [],
            selectedFile: undefined,
            history: undefined,
            folderHistory: {
              repositoryId: message.repositoryId,
              path: message.path,
            },
            error: undefined,
            errorRecovery: undefined,
          };
        });
        break;
      case 'folderHistoryClosed':
        if (message.selectedRepositoryId) {
          race.acceptedRepositoryId = message.selectedRepositoryId;
        }
        race.activeSelectionRequest = undefined;
        effects.setCommitSelection(emptyCommitSelection);
        setState((current) =>
          current.folderHistory?.repositoryId === message.repositoryId
            ? {
                ...current,
                folderHistory: undefined,
                selectedHash: undefined,
                details: undefined,
                detailsRepositoryId: undefined,
                selectedParent: undefined,
                files: [],
                selectedFile: undefined,
                ...(message.selectedRepositoryId &&
                message.selectedRepositoryId !== current.selectedRepositoryId
                  ? {
                      selectedRepositoryId: message.selectedRepositoryId,
                      refs: [],
                      commits: [],
                      graphLayout: EMPTY_GRAPH_LAYOUT_CACHE,
                      commitListRevision: current.commitListRevision + 1,
                    }
                  : {}),
              }
            : current,
        );
        break;
      case 'loading':
        if (message.scope === 'operation' && message.repositoryId) {
          const repositoryId = message.repositoryId;
          const activeRequest = race.activeOperationByRepository.get(repositoryId);
          if (activeRequest && activeRequest !== message.requestId) break;
          race.activeOperationByRepository.set(repositoryId, message.requestId);
          setState((current) => ({
            ...current,
            operationRepositoryIds: new Set(current.operationRepositoryIds).add(repositoryId),
            error: undefined,
            errorRecovery: undefined,
          }));
          break;
        }
        if (
          race.requestById.get(message.requestId) === message.scope &&
          race.latestByScope[message.scope] !== message.requestId
        ) {
          break;
        }
        race.latestByScope[message.scope] = message.requestId;
        setState((current) => {
          if (message.repositoryId && current.selectedRepositoryId !== message.repositoryId) {
            return current;
          }
          return {
            ...current,
            loading: message.scope,
            error: undefined,
            errorRecovery: undefined,
          };
        });
        break;
      case 'clipboardCopied':
        if (effects.detailsHashCopyRequestRef.current !== message.requestId) break;
        effects.detailsHashCopyRequestRef.current = undefined;
        effects.setDetailsHashCopyState('copied');
        effects.scheduleDetailsHashCopyReset(() => {
          effects.setDetailsHashCopyState('idle');
        });
        break;
      case 'error':
        {
          if (effects.detailsHashCopyRequestRef.current === message.requestId) {
            effects.detailsHashCopyRequestRef.current = undefined;
            effects.setDetailsHashCopyState('idle');
          }
          if (race.activeCommitMessagesRequest === message.requestId) {
            race.activeCommitMessagesRequest = undefined;
            effects.setSquashOperation(undefined);
          }
          if (race.pendingFilters?.requestId === message.requestId) {
            race.pendingFilters = undefined;
          }
          const scope = race.requestById.get(message.requestId);
          if (scope === 'operation' && message.repositoryId) {
            const repositoryId = message.repositoryId;
            if (race.activeOperationByRepository.get(repositoryId) !== message.requestId) {
              race.requestById.delete(message.requestId);
              break;
            }
            race.activeOperationByRepository.delete(repositoryId);
            race.requestById.delete(message.requestId);
            setState((current) => {
              const operationRepositoryIds = new Set(current.operationRepositoryIds);
              operationRepositoryIds.delete(repositoryId);
              return {
                ...current,
                operationRepositoryIds,
                ...(current.selectedRepositoryId === repositoryId
                  ? {
                      error: message.message,
                      errorRecovery: message.recovery
                        ? { repositoryId, action: message.recovery }
                        : undefined,
                    }
                  : {}),
              };
            });
            break;
          }
          if (scope && race.latestByScope[scope] !== message.requestId) {
            race.requestById.delete(message.requestId);
            break;
          }
        }
        race.requestById.delete(message.requestId);
        setState((current) => {
          if (
            message.repositoryId &&
            current.selectedRepositoryId !== message.repositoryId &&
            current.history?.repositoryId !== message.repositoryId
          ) {
            return current;
          }
          return {
            ...current,
            loading: undefined,
            error: message.message,
            errorRecovery:
              message.recovery && message.repositoryId
                ? { repositoryId: message.repositoryId, action: message.recovery }
                : undefined,
          };
        });
        break;
      case 'operationCompleted':
        if (race.activeOperationByRepository.get(message.repositoryId) !== message.requestId) {
          race.requestById.delete(message.requestId);
          break;
        }
        race.activeOperationByRepository.delete(message.repositoryId);
        race.requestById.delete(message.requestId);
        setState((current) => {
          const operationRepositoryIds = new Set(current.operationRepositoryIds);
          operationRepositoryIds.delete(message.repositoryId);
          return {
            ...current,
            operationRepositoryIds,
            ...(current.selectedRepositoryId === message.repositoryId
              ? { error: undefined, errorRecovery: undefined }
              : {}),
          };
        });
        if (effects.stashDialogRepositoryRef.current === message.repositoryId) {
          effects.vscodePostMessage({
            type: 'requestStashState',
            requestId: requestId('stash-state-refresh'),
            repositoryId: message.repositoryId,
          });
        }
        break;
      case 'operationCancelled':
        if (race.activeOperationByRepository.get(message.repositoryId) !== message.requestId) {
          race.requestById.delete(message.requestId);
          break;
        }
        race.activeOperationByRepository.delete(message.repositoryId);
        race.requestById.delete(message.requestId);
        setState((current) => {
          const operationRepositoryIds = new Set(current.operationRepositoryIds);
          operationRepositoryIds.delete(message.repositoryId);
          return {
            ...current,
            operationRepositoryIds,
            ...(current.selectedRepositoryId === message.repositoryId
              ? { error: undefined, errorRecovery: undefined }
              : {}),
          };
        });
        break;
    }
  };
}