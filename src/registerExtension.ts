export interface DisposableLike {
  dispose(): void;
}

export interface ExtensionRegistrationHost {
  registerCommand(command: string, handler: (...args: unknown[]) => unknown): DisposableLike;
  openWorkbench(): void;
  showLineHistory(): Promise<void>;
  showSelectionHistory(): Promise<void>;
  showFileHistory(resource?: unknown): Promise<void>;
  showFolderHistory(resource?: unknown): Promise<void>;
  compareFileWithRef(): void;
  applyPatch(): Promise<void>;
  showDiagnostics(): Promise<void>;
  showGitConsole(): void;
  configureGitSettings(): Promise<void>;
  pull(strategy: 'ff-only' | 'merge' | 'rebase'): Promise<void>;
}

export function registerExtension(host: ExtensionRegistrationHost): DisposableLike[] {
  const openLogCommand = host.registerCommand('gitLogWorkbench.openLog', () => {
    host.openWorkbench();
  });
  const showLineHistoryCommand = host.registerCommand(
    'gitLogWorkbench.editor.showLineHistory',
    () => host.showLineHistory(),
  );
  const showSelectionHistoryCommand = host.registerCommand(
    'gitLogWorkbench.editor.showSelectionHistory',
    () => host.showSelectionHistory(),
  );
  const showFileHistoryCommand = host.registerCommand(
    'gitLogWorkbench.editor.showFileHistory',
    (resource?: unknown) => host.showFileHistory(resource),
  );
  const showFolderHistoryCommand = host.registerCommand(
    'gitLogWorkbench.explorer.showFolderHistory',
    (resource?: unknown) => host.showFolderHistory(resource),
  );
  const compareFileWithRefCommand = host.registerCommand(
    'gitLogWorkbench.editor.compareFileWithRef',
    () => host.compareFileWithRef(),
  );
  const applyPatchCommand = host.registerCommand('gitLogWorkbench.applyPatch', () =>
    host.applyPatch(),
  );
  const showDiagnosticsCommand = host.registerCommand('gitLogWorkbench.showDiagnostics', () =>
    host.showDiagnostics(),
  );
  const showGitConsoleCommand = host.registerCommand('gitLogWorkbench.showGitConsole', () =>
    host.showGitConsole(),
  );
  const configureGitSettingsCommand = host.registerCommand(
    'gitLogWorkbench.config.multiRepo',
    () => host.configureGitSettings(),
  );
  const pullFastForwardOnlyCommand = host.registerCommand('gitLogWorkbench.pull.ffOnly', () =>
    host.pull('ff-only'),
  );
  const pullMergeCommand = host.registerCommand('gitLogWorkbench.pull.merge', () =>
    host.pull('merge'),
  );
  const pullRebaseCommand = host.registerCommand('gitLogWorkbench.pull.rebase', () =>
    host.pull('rebase'),
  );

  return [
    openLogCommand,
    showLineHistoryCommand,
    showSelectionHistoryCommand,
    showFileHistoryCommand,
    showFolderHistoryCommand,
    compareFileWithRefCommand,
    applyPatchCommand,
    showDiagnosticsCommand,
    showGitConsoleCommand,
    configureGitSettingsCommand,
    pullFastForwardOnlyCommand,
    pullMergeCommand,
    pullRebaseCommand,
  ];
}
