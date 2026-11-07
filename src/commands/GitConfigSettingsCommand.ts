import { basename } from 'node:path';
import * as vscode from 'vscode';
import { toUserMessage } from '../git/classifyGitError';
import type { GitRunner } from '../git/GitRunner';
import {
  type GitConfigChangePlan,
  type GitConfigProfile,
  type GitConfigProfileFields,
  type GitConfigService,
  type PullRebaseValue,
} from '../git/GitConfigService';
import { resolveRepositoryRoot } from './resolveRepositoryRoot';

type SettingsItem = vscode.QuickPickItem & {
  action?: 'create' | 'current' | 'external';
  profile?: GitConfigProfile;
  externalCondition?: string;
  externalPath?: string;
};

type FieldKey = 'signingKey' | 'gpgSign' | 'sshCommand' | 'pullRebase';

type FieldOption = vscode.QuickPickItem & { key: FieldKey };

const PULL_REBASE_VALUES: readonly PullRebaseValue[] = ['false', 'true', 'merges', 'interactive'];

function describeProfile(profile: GitConfigProfile): string {
  const details: string[] = [];
  const name = profile.fields.name;
  const email = profile.fields.email;
  if (name && email) details.push(`${name} <${email}>`);
  else if (name) details.push(name);
  else if (email) details.push(`<${email}>`);
  else details.push('No identity fields');
  if (profile.fields.signingKey) details.push(`signingkey=${profile.fields.signingKey}`);
  if (profile.fields.gpgSign !== undefined) {
    details.push(`gpgsign=${profile.fields.gpgSign ? 'true' : 'false'}`);
  }
  if (profile.fields.sshCommand) details.push(`sshCommand=${profile.fields.sshCommand}`);
  if (profile.fields.pullRebase) details.push(`pull.rebase=${profile.fields.pullRebase}`);
  return details.join(' · ');
}

function defaultLabel(directory: string): string {
  const name = basename(directory);
  return name && name !== '.' && name !== '/' ? name : '';
}

function hasField(fields: GitConfigProfileFields, key: FieldKey): boolean {
  const value = fields[key];
  return value !== undefined && value !== '';
}

export class GitConfigSettingsCommand {
  constructor(
    private readonly service: GitConfigService,
    private readonly runner: GitRunner,
  ) {}

  async run(): Promise<void> {
    try {
      await this.showMenu();
    } catch (error) {
      void vscode.window.showErrorMessage(`Git Log: ${toUserMessage(error)}`);
    }
  }

  private async showMenu(): Promise<void> {
    const { profiles, external } = await this.service.list();
    const items: SettingsItem[] = [
      {
        label: '$(add) Create new profile…',
        description: 'Bind Git settings to a directory',
        action: 'create',
      },
      {
        label: '$(repo) Use current repository…',
        description: 'Create a profile for the active repository',
        action: 'current',
      },
    ];
    if (profiles.length) {
      items.push({ label: 'Managed profiles', kind: vscode.QuickPickItemKind.Separator });
      items.push(
        ...profiles.map((profile) => ({
          label: profile.label,
          description: profile.gitDir,
          detail: describeProfile(profile),
          profile,
        })),
      );
    }
    if (external.length) {
      items.push({
        label: 'External includes (read-only)',
        kind: vscode.QuickPickItemKind.Separator,
      });
      items.push(
        ...external.map((entry) => ({
          label: '$(lock) External include',
          description: entry.condition,
          detail: `${entry.includePath} — managed outside Git Log`,
          action: 'external' as const,
          externalCondition: entry.condition,
          externalPath: entry.includePath,
        })),
      );
    }

    const picked = await vscode.window.showQuickPick(items, {
      title: 'Git Log: Multi-Repository Git Settings',
      placeHolder:
        profiles.length || external.length
          ? 'Select a profile to edit or delete'
          : 'Create a directory-scoped Git profile',
      matchOnDescription: true,
      matchOnDetail: true,
    });
    if (!picked) return;

    if (picked.action === 'create') {
      await this.createProfile();
      return;
    }
    if (picked.action === 'current') {
      const root = await resolveRepositoryRoot(
        this.runner,
        'Select the repository to configure',
      );
      if (root) await this.createProfile(root);
      return;
    }
    if (picked.action === 'external') {
      void vscode.window.showInformationMessage(
        `External include for ${picked.externalCondition ?? 'unknown condition'} points to ${
          picked.externalPath ?? 'an unknown file'
        }. It is not managed by Git Log.`,
      );
      return;
    }
    if (picked.profile) await this.manageProfile(picked.profile);
  }

  private async manageProfile(profile: GitConfigProfile): Promise<void> {
    const action = await vscode.window.showQuickPick(
      [
        { label: 'Edit profile…', value: 'edit' as const },
        { label: 'Delete profile…', value: 'delete' as const },
      ],
      {
        title: profile.label,
        placeHolder: `${profile.gitDir} · ${describeProfile(profile)}`,
      },
    );
    if (!action) return;
    if (action.value === 'edit') await this.editProfile(profile);
    else await this.deleteProfile(profile);
  }

  private async createProfile(directory?: string): Promise<void> {
    const label = await this.promptLabel(directory ? defaultLabel(directory) : '');
    if (label === undefined) return;
    const selectedDirectory = directory ?? (await this.pickDirectory());
    if (selectedDirectory === undefined) return;
    const fields = await this.promptFields({});
    if (!fields) return;
    const plan = await this.service.planCreate({
      label,
      directory: selectedDirectory,
      fields,
    });
    await this.confirmAndApply(plan);
  }

  private async editProfile(profile: GitConfigProfile): Promise<void> {
    const label = await this.promptLabel(profile.label);
    if (label === undefined) return;
    const directory = await this.pickDirectory(profile.directoryPath);
    if (directory === undefined) return;
    const fields = await this.promptFields(profile.fields);
    if (!fields) return;
    const plan = await this.service.planUpdate(profile, { label, directory, fields });
    await this.confirmAndApply(plan);
  }

  private async deleteProfile(profile: GitConfigProfile): Promise<void> {
    const plan = await this.service.planDelete(profile);
    await this.confirmAndApply(plan);
  }

  private async promptLabel(initial: string): Promise<string | undefined> {
    return vscode.window.showInputBox({
      title: 'Git profile',
      prompt: 'Profile name (used as the included configuration file name)',
      value: initial,
      validateInput: (value) =>
        value.trim() ? undefined : 'Profile name is required.',
    });
  }

  private async pickDirectory(initial?: string): Promise<string | undefined> {
    const picked = await vscode.window.showOpenDialog({
      title: 'Choose the directory that should use this profile',
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Use this directory',
      ...(initial ? { defaultUri: vscode.Uri.file(initial) } : {}),
    });
    return picked?.[0]?.fsPath;
  }

  private async promptFields(
    existing: GitConfigProfileFields,
  ): Promise<GitConfigProfileFields | undefined> {
    const name = await vscode.window.showInputBox({
      title: 'user.name',
      prompt: 'Leave empty to leave user.name unset',
      value: existing.name ?? '',
    });
    if (name === undefined) return undefined;
    const email = await vscode.window.showInputBox({
      title: 'user.email',
      prompt: 'Leave empty to leave user.email unset',
      value: existing.email ?? '',
    });
    if (email === undefined) return undefined;

    const options: FieldOption[] = [
      { label: 'Signing key', description: 'user.signingkey', key: 'signingKey' },
      { label: 'Commit signing', description: 'commit.gpgsign', key: 'gpgSign' },
      { label: 'SSH command', description: 'core.sshCommand', key: 'sshCommand' },
      { label: 'Pull rebase', description: 'pull.rebase', key: 'pullRebase' },
    ];
    const optionsWithState = options.map((option) => ({
      ...option,
      picked: hasField(existing, option.key),
    }));
    const selected = await vscode.window.showQuickPick(optionsWithState, {
      title: 'Additional Git settings',
      placeHolder: 'Select settings to configure; deselect to remove them',
      canPickMany: true,
    });
    if (!selected) return undefined;

    const fields: GitConfigProfileFields = {
      ...(name.trim() ? { name: name.trim() } : {}),
      ...(email.trim() ? { email: email.trim() } : {}),
    };
    for (const option of selected) {
      if (option.key === 'signingKey') {
        const value = await vscode.window.showInputBox({
          title: 'user.signingkey',
          value: existing.signingKey ?? '',
          prompt: 'GPG key ID or key file',
        });
        if (value === undefined) return undefined;
        if (value.trim()) fields.signingKey = value.trim();
      } else if (option.key === 'gpgSign') {
        const value = await vscode.window.showQuickPick(['true', 'false'], {
          title: 'commit.gpgsign',
          placeHolder: existing.gpgSign === undefined ? 'Select a value' : `Current: ${String(existing.gpgSign)}`,
        });
        if (!value) return undefined;
        fields.gpgSign = value === 'true';
      } else if (option.key === 'sshCommand') {
        const value = await vscode.window.showInputBox({
          title: 'core.sshCommand',
          value: existing.sshCommand ?? '',
          prompt: 'For example: ssh -i ~/.ssh/id_work',
        });
        if (value === undefined) return undefined;
        if (value.trim()) fields.sshCommand = value.trim();
      } else {
        const ordered = existing.pullRebase
          ? [
              existing.pullRebase,
              ...PULL_REBASE_VALUES.filter((item) => item !== existing.pullRebase),
            ]
          : PULL_REBASE_VALUES;
        const value = await vscode.window.showQuickPick([...ordered], {
          title: 'pull.rebase',
          placeHolder: existing.pullRebase
            ? `Current: ${existing.pullRebase}`
            : 'Select a value',
        });
        if (!value) return undefined;
        fields.pullRebase = value as PullRebaseValue;
      }
    }
    return fields;
  }

  private async confirmAndApply(plan: GitConfigChangePlan): Promise<void> {
    const detail = [
      ...plan.summary,
      ...(plan.warnings.length ? ['', 'Warnings:', ...plan.warnings] : []),
      '',
      'A backup of the global Git configuration and affected files is kept under ~/.git-log/backups.',
    ].join('\n');
    const confirmLabel = plan.action === 'delete' ? 'Delete' : 'Apply';
    const answer = await vscode.window.showWarningMessage(
      plan.action === 'delete'
        ? `Delete Git profile "${plan.profile.label}"?`
        : `Apply Git profile "${plan.profile.label}"?`,
      { modal: true, detail },
      confirmLabel,
    );
    if (answer !== confirmLabel) return;

    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Writing Git configuration',
      },
      () => this.service.apply(plan),
    );

    if (plan.action === 'delete') {
      void vscode.window.showInformationMessage(
        `Deleted Git profile "${plan.profile.label}". Backup: ${result.backupDirectory}`,
      );
      return;
    }

    const verification = await this.service.verify(plan.profile);
    if (!verification) {
      void vscode.window.showInformationMessage(
        `Saved Git profile "${plan.profile.label}". The directory is not a Git repository yet; the profile applies to repositories created under it. Backup: ${result.backupDirectory}`,
      );
      return;
    }
    const expectedName = plan.profile.fields.name;
    const expectedEmail = plan.profile.fields.email;
    const actualName = verification.values['user.name'];
    const actualEmail = verification.values['user.email'];
    const mismatch =
      (expectedName !== undefined && actualName !== expectedName) ||
      (expectedEmail !== undefined && actualEmail !== expectedEmail);
    if (mismatch) {
      void vscode.window.showWarningMessage(
        `Saved Git profile "${plan.profile.label}", but the effective identity in ${verification.directory} is "${actualName ?? ''} <${actualEmail ?? ''}>". Check overlapping directory conditions. Backup: ${result.backupDirectory}`,
      );
      return;
    }
    const identity = [actualName, actualEmail ? `<${actualEmail}>` : undefined]
      .filter(Boolean)
      .join(' ');
    void vscode.window.showInformationMessage(
      `Saved Git profile "${plan.profile.label}"${identity ? `; verified ${identity} in ${verification.directory}` : ''}. Backup: ${result.backupDirectory}`,
    );
  }
}
