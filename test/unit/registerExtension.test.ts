import { describe, expect, it, vi } from 'vitest';
import { registerExtension } from '../../src/registerExtension';

describe('registerExtension', () => {
  it('registers public workbench and editor-context commands and delegates them', () => {
    const openWorkbench = vi.fn();
    const showLineHistory = vi.fn();
    const showSelectionHistory = vi.fn();
    const showFileHistory = vi.fn();
    const showFolderHistory = vi.fn();
    const compareFileWithRef = vi.fn();
    const applyPatch = vi.fn();
    const showDiagnostics = vi.fn();
    const showGitConsole = vi.fn();
    const configureGitSettings = vi.fn();
    const pull = vi.fn();
    const registeredCommands = new Map<string, (...args: unknown[]) => void>();

    const result = registerExtension({
      registerCommand(command: string, handler: (...args: unknown[]) => void) {
        registeredCommands.set(command, handler);
        return { dispose: vi.fn() };
      },
      openWorkbench,
      showLineHistory,
      showSelectionHistory,
      showFileHistory,
      showFolderHistory,
      compareFileWithRef,
      applyPatch,
      showDiagnostics,
      showGitConsole,
      configureGitSettings,
      pull,
    });

    expect(result).toHaveLength(13);
    const fileResource = { scheme: 'file', fsPath: '/repo/src/app.ts' };
    const folderResource = { scheme: 'file', fsPath: '/repo/src' };
    registeredCommands.get('gitLogWorkbench.openLog')?.();
    registeredCommands.get('gitLogWorkbench.editor.showLineHistory')?.();
    registeredCommands.get('gitLogWorkbench.editor.showSelectionHistory')?.();
    registeredCommands.get('gitLogWorkbench.editor.showFileHistory')?.(fileResource);
    registeredCommands.get('gitLogWorkbench.explorer.showFolderHistory')?.(folderResource);
    registeredCommands.get('gitLogWorkbench.editor.compareFileWithRef')?.();
    registeredCommands.get('gitLogWorkbench.applyPatch')?.();
    registeredCommands.get('gitLogWorkbench.showDiagnostics')?.();
    registeredCommands.get('gitLogWorkbench.showGitConsole')?.();
    registeredCommands.get('gitLogWorkbench.config.multiRepo')?.();
    registeredCommands.get('gitLogWorkbench.pull.ffOnly')?.();
    registeredCommands.get('gitLogWorkbench.pull.merge')?.();
    registeredCommands.get('gitLogWorkbench.pull.rebase')?.();
    expect(openWorkbench).toHaveBeenCalledOnce();
    expect(showLineHistory).toHaveBeenCalledOnce();
    expect(showSelectionHistory).toHaveBeenCalledOnce();
    expect(showFileHistory).toHaveBeenCalledWith(fileResource);
    expect(showFolderHistory).toHaveBeenCalledWith(folderResource);
    expect(compareFileWithRef).toHaveBeenCalledOnce();
    expect(applyPatch).toHaveBeenCalledOnce();
    expect(showDiagnostics).toHaveBeenCalledOnce();
    expect(showGitConsole).toHaveBeenCalledOnce();
    expect(configureGitSettings).toHaveBeenCalledOnce();
    expect(pull.mock.calls).toEqual([['ff-only'], ['merge'], ['rebase']]);
  });
});
