import {
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import type { ChangedFile, CommitDetails } from '../../src/shared/models';
import type { WorkbenchLayout } from '../../src/protocol/messages';
import { buildFileTree, type FileTreeNode } from './buildFileTree';
import { ChevronDown, ChevronRight } from './icons';

function changedFileStatusLabel(status: ChangedFile['status']): string {
  return (
    {
      A: 'Added',
      M: 'Modified',
      D: 'Deleted',
      R: 'Renamed',
      C: 'Copied',
      T: 'Type changed',
      U: 'Unmerged',
    } as const
  )[status];
}

function ChangedFileRow({
  file,
  depth = 0,
  inTree = false,
  onOpen,
  onSelect,
  onContextMenu,
}: {
  file: ChangedFile;
  depth?: number;
  inTree?: boolean;
  onOpen(file: ChangedFile): void;
  onSelect(file: ChangedFile): void;
  onContextMenu(file: ChangedFile, x: number, y: number): void;
}) {
  return (
    <button
      type="button"
      className="file-row"
      style={{ paddingLeft: 10 + depth * (inTree ? 20 : 14) }}
      title={file.binary ? `${file.path} is binary` : file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
      onClick={() => onSelect(file)}
      onDoubleClick={() => onOpen(file)}
      onContextMenu={(event) => {
        event.preventDefault();
        onSelect(file);
        onContextMenu(file, event.clientX, event.clientY);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onOpen(file);
      }}
    >
      {inTree ? <span className="folder-chevron" aria-hidden="true" /> : null}
      <span className="file-path">{file.path.split('/').at(-1)}</span>
      {file.additions !== undefined || file.deletions !== undefined ? (
        <span className="file-stats">
          {file.additions !== undefined ? (
            <span className="file-stat-additions">+{String(file.additions)}</span>
          ) : null}
          {file.deletions !== undefined ? (
            <span className="file-stat-deletions">−{String(file.deletions)}</span>
          ) : null}
        </span>
      ) : null}
      <span className={`file-status status-${file.status}`}>{file.status}</span>
    </button>
  );
}

function FileTreeNodes({
  nodes,
  depth,
  collapsedDirectories,
  onToggleDirectory,
  onOpen,
  onSelect,
  onContextMenu,
}: {
  nodes: FileTreeNode[];
  depth: number;
  collapsedDirectories: ReadonlySet<string>;
  onToggleDirectory(key: string): void;
  onOpen(file: ChangedFile): void;
  onSelect(file: ChangedFile): void;
  onContextMenu(file: ChangedFile, x: number, y: number): void;
}) {
  return nodes.map((node) =>
    node.type === 'directory' ? (
      <div
        className="file-tree-directory"
        style={{ '--indent-guide-left': `${8 + depth * 20}px` } as React.CSSProperties}
        key={node.path}
      >
        <button
          type="button"
          className="file-folder-row"
          style={{ paddingLeft: 8 + depth * 20 }}
          aria-expanded={!collapsedDirectories.has(node.path)}
          onClick={() => onToggleDirectory(node.path)}
        >
          <span className="folder-chevron" aria-hidden="true">
            {collapsedDirectories.has(node.path) ? ChevronRight : ChevronDown}
          </span>
          <span className="file-folder-name">{node.name}</span>
        </button>
        {!collapsedDirectories.has(node.path) ? (
          <FileTreeNodes
            nodes={node.children}
            depth={depth + 1}
            collapsedDirectories={collapsedDirectories}
            onToggleDirectory={onToggleDirectory}
            onOpen={onOpen}
            onSelect={onSelect}
            onContextMenu={onContextMenu}
          />
        ) : null}
      </div>
    ) : (
      <ChangedFileRow
        file={node.file}
        depth={depth}
        inTree
        onOpen={onOpen}
        onSelect={onSelect}
        onContextMenu={onContextMenu}
        key={node.path}
      />
    ),
  );
}

export interface FilesPaneProps {
  files: readonly ChangedFile[];
  details: CommitDetails | undefined;
  filesViewMode: WorkbenchLayout['filesViewMode'];
  loading: 'repositories' | 'log' | 'selection' | 'operation' | undefined;
  filesWidth: number;
  hidden: boolean;
  detailsInChanges: boolean;
  detailsHeight: number;
  selectedParent: string | undefined;
  detailsContent?: ReactNode;
  onSelectParent(parent: string, hash: string): void;
  selectedFile?: ChangedFile;
  onUpdateFilesViewMode(mode: WorkbenchLayout['filesViewMode']): void;
  onResizeStart(event: ReactPointerEvent<HTMLDivElement>): void;
  onResizeKeyDown(delta: number): void;
  onOpenDiff(file: ChangedFile): void;
  onSelectFile(file: ChangedFile): void;
  onFileContextMenu(file: ChangedFile, x: number, y: number): void;
}

export function FilesPane({
  files,
  details,
  filesViewMode,
  loading,
  filesWidth,
  hidden,
  detailsInChanges,
  detailsHeight,
  selectedParent,
  detailsContent,
  selectedFile,
  onSelectParent,
  onUpdateFilesViewMode,
  onResizeStart,
  onResizeKeyDown,
  onOpenDiff,
  onSelectFile,
  onFileContextMenu,
}: FilesPaneProps) {
  const [collapsedFileDirectories, setCollapsedFileDirectories] = useState<Set<string>>(new Set());
  const fileTree = useMemo(() => buildFileTree(files), [files]);
  const toggleFileDirectory = (directory: string): void => {
    setCollapsedFileDirectories((current) => {
      const next = new Set(current);
      if (next.has(directory)) {
        next.delete(directory);
      } else {
        next.add(directory);
      }
      return next;
    });
  };

  return (
    <>
      <div
        className="pane-resizer vertical files-resizer"
        role="separator"
        aria-label="Resize changed files pane"
        aria-orientation="vertical"
        aria-valuemin={220}
        aria-valuenow={filesWidth}
        hidden={hidden}
        tabIndex={0}
        onPointerDown={onResizeStart}
        onKeyDown={(event) => {
          if (event.key === 'ArrowLeft') onResizeKeyDown(10);
          if (event.key === 'ArrowRight') onResizeKeyDown(-10);
        }}
      />
      <section
        className={`files-pane pane${detailsInChanges ? ' with-details' : ''}`}
        role="region"
        aria-label="Changed files"
        hidden={hidden}
        style={
          detailsInChanges
            ? {
                gridTemplateRows: `38px 30px minmax(0, 1fr) auto 4px ${detailsHeight}px`,
              }
            : undefined
        }
      >
        <div className="global-toolbar-spacer" aria-hidden="true" />
        <div className="pane-heading files-heading">
          <span>Changed Files</span>
          {details && details.parents.length > 1 ? (
            <select
              className="parent-selector"
              aria-label="Diff parent"
              value={selectedParent ?? ''}
              onChange={(event) => onSelectParent(event.target.value, details.hash)}
            >
              {details.parents.map((parent, index) => (
                <option value={parent} key={parent}>
                  Parent {String(index + 1)} · {parent.slice(0, 8)}
                </option>
              ))}
            </select>
          ) : null}
          <span className="segmented-control" aria-label="Changed files display mode">
            <button
              type="button"
              aria-pressed={filesViewMode === 'tree'}
              title="Tree view"
              onClick={() => onUpdateFilesViewMode('tree')}
            >
              Tree
            </button>
            <button
              type="button"
              aria-pressed={filesViewMode === 'list'}
              title="List view"
              onClick={() => onUpdateFilesViewMode('list')}
            >
              List
            </button>
          </span>
        </div>
        {files.length ? (
          <div className="file-list">
            <div className="file-list-content">
              {filesViewMode === 'tree' ? (
                <FileTreeNodes
                  nodes={fileTree}
                  depth={0}
                  collapsedDirectories={collapsedFileDirectories}
                  onToggleDirectory={toggleFileDirectory}
                  onOpen={onOpenDiff}
                  onSelect={onSelectFile}
                  onContextMenu={onFileContextMenu}
                />
              ) : (
                files.map((file) => (
                  <ChangedFileRow
                    file={file}
                    onOpen={onOpenDiff}
                    onSelect={onSelectFile}
                    onContextMenu={onFileContextMenu}
                    key={`${file.oldPath ?? ''}:${file.path}`}
                  />
                ))
              )}
            </div>
          </div>
        ) : (
          <div className="empty-pane">
            {loading === 'selection' ? 'Loading changed files…' : 'Select a commit to inspect its files.'}
          </div>
        )}
        {selectedFile ? (
          <div className="file-preview" role="status" aria-label="Changed file preview">
            <span>{selectedFile.path}</span>
            <span> · {changedFileStatusLabel(selectedFile.status)}</span>
            {selectedFile.additions !== undefined ? (
              <span className="file-stat-additions">
                {' '}· +{String(selectedFile.additions)}
              </span>
            ) : null}
            {selectedFile.deletions !== undefined ? (
              <span className="file-stat-deletions">
                {' '}−{String(selectedFile.deletions)}
              </span>
            ) : null}
          </div>
        ) : null}
        {detailsContent ?? null}
      </section>
    </>
  );
}