import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import type { RefKind, RefLabel, RepositorySummary } from '../../src/shared/models';
import { buildRefTree, type RefTreeNode } from './buildRefTree';
import { ChevronDown, ChevronRight } from './icons';

const refGroups: readonly { label: string; kind: RefKind }[] = [
  { label: 'Local', kind: 'local' },
  { label: 'Remote', kind: 'remote' },
  { label: 'Tags', kind: 'tag' },
];

function RefTreeNodes({
  nodes,
  depth,
  group,
  folderKeyPrefix,
  collapsedFolders,
  forceExpanded,
  onToggleFolder,
  onSelect,
  onKeyDown,
  onContextMenu,
}: {
  nodes: RefTreeNode[];
  depth: number;
  group: (typeof refGroups)[number];
  folderKeyPrefix: string;
  collapsedFolders: ReadonlySet<string>;
  forceExpanded: boolean;
  onToggleFolder(key: string): void;
  onSelect(ref: RefLabel): void;
  onKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, ref: RefLabel): void;
  onContextMenu(ref: RefLabel, x: number, y: number): void;
}) {
  return nodes.map((node) => {
    if (node.type === 'directory') {
      const folderKey = `${folderKeyPrefix}:${node.id}`;
      const collapsed = !forceExpanded && collapsedFolders.has(folderKey);
      return (
        <div
          className="ref-tree-directory"
          style={{ '--indent-guide-left': `${16 + depth * 20}px` } as React.CSSProperties}
          role="group"
          aria-label={
            group.kind === 'remote' && depth === 0
              ? `Remote ${node.name}`
              : `${group.label} folder ${node.path}`
          }
          key={node.id}
        >
          <button
            type="button"
            className="ref-folder-row"
            style={{ paddingLeft: 16 + depth * 20 }}
            aria-expanded={!collapsed}
            aria-label={
              forceExpanded
                ? `${group.label} folder ${node.path} (expanded while filtering)`
                : `${collapsed ? 'Expand' : 'Collapse'} ${group.label} folder ${node.path}`
            }
            disabled={forceExpanded}
            onClick={() => onToggleFolder(folderKey)}
          >
            <span className="ref-folder-chevron" aria-hidden="true">
              {collapsed ? ChevronRight : ChevronDown}
            </span>
            <span className="ref-name">{node.name}</span>
          </button>
          {!collapsed ? (
            <RefTreeNodes
              nodes={node.children}
              depth={depth + 1}
              group={group}
              folderKeyPrefix={folderKeyPrefix}
              collapsedFolders={collapsedFolders}
              forceExpanded={forceExpanded}
              onToggleFolder={onToggleFolder}
              onSelect={onSelect}
              onKeyDown={onKeyDown}
              onContextMenu={onContextMenu}
            />
          ) : null}
        </div>
      );
    }

    const ref = node.ref;
    return (
      <button
        type="button"
        className={`ref-item${ref.isCurrent ? ' current-ref' : ''}`}
        style={{ paddingLeft: 16 + depth * 20, '--indent-guide-left': `${16 + depth * 20}px` } as React.CSSProperties}
        key={ref.fullName}
        title={ref.fullName}
        data-ref-item="true"
        onClick={() => onSelect(ref)}
        onKeyDown={(event) => onKeyDown(event, ref)}
        onContextMenu={(event) => {
          event.preventDefault();
          onContextMenu(ref, event.clientX, event.clientY);
        }}
      >
        <span className="ref-folder-chevron" aria-hidden="true" />
        <span className="ref-name">{node.name}</span>
        {ref.ahead || ref.behind ? (
          <span className="tracking">
            {ref.ahead ? `↑${String(ref.ahead)}` : ''}
            {ref.behind ? ` ↓${String(ref.behind)}` : ''}
          </span>
        ) : null}
      </button>
    );
  });
}

export interface RefsPaneProps {
  refs: readonly RefLabel[];
  selectedRepository: RepositorySummary | undefined;
  selectedRepositoryId: string | undefined;
  refSearch: string;
  onRefSearchChange(value: string): void;
  refSearchActive: boolean;
  collapsedRefGroups: ReadonlySet<string>;
  onToggleRefGroup(group: string): void;
  collapsedRefFolders: ReadonlySet<string>;
  onToggleRefFolder(key: string): void;
  onSelectRef(ref: RefLabel): void;
  onRefKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, ref: RefLabel): void;
  onOpenHeadContextMenu(x: number, y: number): void;
  onOpenRefContextMenu(ref: RefLabel, x: number, y: number): void;
  hidden: boolean;
  refsWidth: number;
  onResizeStart(event: ReactPointerEvent<HTMLDivElement>): void;
  onResizeKeyDown(delta: number): void;
}

export function RefsPane({
  refs,
  selectedRepository,
  selectedRepositoryId,
  refSearch,
  onRefSearchChange,
  refSearchActive,
  collapsedRefGroups,
  onToggleRefGroup,
  collapsedRefFolders,
  onToggleRefFolder,
  onSelectRef,
  onRefKeyDown,
  onOpenHeadContextMenu,
  onOpenRefContextMenu,
  hidden,
  refsWidth,
  onResizeStart,
  onResizeKeyDown,
}: RefsPaneProps) {
  const visibleRefs = refSearch.trim()
    ? refs.filter((ref) =>
        [ref.shortName, ref.fullName, ref.remote]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLocaleLowerCase().includes(refSearch.trim().toLocaleLowerCase())),
      )
    : refs;
  const refGroupTrees = refGroups.map((group) => {
    const groupRefs = visibleRefs.filter((ref) => ref.kind === group.kind);
    return { group, refs: groupRefs, tree: buildRefTree(groupRefs) };
  });
  const headMatchesRefSearch = (): boolean => {
    const query = refSearch.trim().toLocaleLowerCase();
    if (!query) return true;
    return [selectedRepository?.currentBranch, selectedRepository?.head]
      .filter((value): value is string => Boolean(value))
      .some((value) => value.toLocaleLowerCase().includes(query));
  };

  return (
    <>
      <nav className="refs-pane pane" aria-label="Git references" hidden={hidden}>
        <div className="refs-toolbar">
          <label className="refs-search-bar field">
            <input
              type="search"
              aria-label="Filter branches"
              placeholder="Filter branches"
              value={refSearch}
              onChange={(event) => onRefSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape' || !refSearch) return;
                event.preventDefault();
                event.stopPropagation();
                onRefSearchChange('');
              }}
            />
          </label>
        </div>
        <div className="pane-heading">Branches</div>
        <div className="refs-scroll">
          <section className="ref-group">
            <button
              type="button"
              className="ref-group-heading"
              aria-expanded={refSearchActive || !collapsedRefGroups.has('head')}
              disabled={refSearchActive}
              onClick={() => onToggleRefGroup('head')}
            >
              <span className="ref-folder-chevron" aria-hidden="true">
                {!refSearchActive && collapsedRefGroups.has('head') ? ChevronRight : ChevronDown}
              </span>
              <span>HEAD</span>
            </button>
            {selectedRepository?.head && headMatchesRefSearch() && (refSearchActive || !collapsedRefGroups.has('head')) ? (
              <button
                type="button"
                className="ref-item current-ref"
                title={selectedRepository.head}
                data-ref-item="true"
                onClick={() => {
                  const headRef: RefLabel = {
                    fullName: 'HEAD',
                    shortName: selectedRepository.currentBranch ?? selectedRepository.head?.slice(0, 8) ?? 'HEAD',
                    kind: 'local',
                    target: selectedRepository.head ?? '',
                    ahead: 0,
                    behind: 0,
                    isCurrent: true,
                  };
                  onSelectRef(headRef);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  if (!selectedRepositoryId || !selectedRepository.head) return;
                  onOpenHeadContextMenu(event.clientX, event.clientY);
                }}
              >
                <span className="ref-icon" aria-hidden="true">
                  ●
                </span>
                <span>{selectedRepository.currentBranch ?? selectedRepository.head.slice(0, 8)}</span>
              </button>
            ) : null}
          </section>
          {refGroupTrees.map(({ group, refs: groupRefs, tree }) => {
            const collapsed = !refSearchActive && collapsedRefGroups.has(group.kind);
            return (
              <section className="ref-group" key={group.kind}>
                <button
                  type="button"
                  className="ref-group-heading"
                  aria-expanded={!collapsed}
                  disabled={refSearchActive}
                  onClick={() => onToggleRefGroup(group.kind)}
                >
                  <span className="ref-folder-chevron" aria-hidden="true">
                    {collapsed ? ChevronRight : ChevronDown}
                  </span>
                  <span>{group.label}</span>
                  <span className="ref-count">{groupRefs.length}</span>
                </button>
                {!collapsed ? (
                  <RefTreeNodes
                    nodes={tree}
                    depth={0}
                    group={group}
                    folderKeyPrefix={`${selectedRepositoryId ?? ''}:${group.kind}`}
                    collapsedFolders={collapsedRefFolders}
                    forceExpanded={refSearchActive}
                    onToggleFolder={onToggleRefFolder}
                    onSelect={onSelectRef}
                    onKeyDown={onRefKeyDown}
                    onContextMenu={onOpenRefContextMenu}
                  />
                ) : null}
              </section>
            );
          })}
        </div>
      </nav>

      <div
        className="pane-resizer vertical refs-resizer"
        role="separator"
        aria-label="Resize references pane"
        aria-orientation="vertical"
        aria-valuemin={160}
        aria-valuenow={refsWidth}
        hidden={hidden}
        tabIndex={0}
        onPointerDown={onResizeStart}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') onResizeKeyDown(-10);
          if (event.key === 'ArrowRight') onResizeKeyDown(10);
        }}
      />
    </>
  );
}