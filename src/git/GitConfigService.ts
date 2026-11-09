import { randomBytes } from 'node:crypto';
import { access, copyFile, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, posix, relative, resolve, win32 } from 'node:path';
import { GitCommandError, type GitRunner } from './GitRunner';

export type PullRebaseValue = 'false' | 'true' | 'merges' | 'interactive';
export type GitDirConditionType = 'gitdir' | 'gitdir/i';

export interface GitConfigProfileFields {
  name?: string;
  email?: string;
  signingKey?: string;
  gpgSign?: boolean;
  sshCommand?: string;
  pullRebase?: PullRebaseValue;
}

export interface GitConfigProfileDraft {
  label: string;
  directory: string;
  fields: GitConfigProfileFields;
}

export interface GitConfigProfile {
  label: string;
  condition: string;
  conditionType: GitDirConditionType;
  gitDir: string;
  directoryPath: string;
  includePath: string;
  fields: GitConfigProfileFields;
}

export interface GitConfigExternalEntry {
  condition: string;
  includePath: string;
}

export interface GitConfigListResult {
  globalConfigPath: string;
  profiles: GitConfigProfile[];
  external: GitConfigExternalEntry[];
}

export type GitConfigPlanAction = 'create' | 'update' | 'delete';

export interface GitConfigChangePlan {
  action: GitConfigPlanAction;
  globalConfigPath: string;
  summary: string[];
  warnings: string[];
  backupPaths: string[];
  writes: Array<{ path: string; content: string }>;
  removeFiles: string[];
  addEntries: GitConfigExternalEntry[];
  removeEntries: GitConfigExternalEntry[];
  profile: GitConfigProfile;
}

export interface GitConfigApplyResult {
  backupDirectory: string;
}

export interface GitConfigVerification {
  directory: string;
  values: Record<string, string | undefined>;
}

export interface GitConfigServiceOptions {
  runner: GitRunner;
  homeDir?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
}

const INCLUDE_PREFIX = 'includeif.';
const INCLUDE_SUFFIX = '.path';
const MAX_TEXT_LENGTH = 500;
const RESERVED_WINDOWS_NAMES = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;
const UNSAFE_TEXT = /[\0\r\n"]/u;
const UNSAFE_LABEL = /[/\\:*?"<>|\0\r\n]/u;

function toPosix(value: string): string {
  return value.replaceAll('\\', '/');
}

function quoteValue(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function formatTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${String(date.getFullYear())}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${String(date.getMilliseconds()).padStart(3, '0')}`;
}

function parseConfigEntries(stdout: Buffer): Array<{ key: string; value: string }> {
  return stdout
    .toString('utf8')
    .split('\0')
    .filter(Boolean)
    .map((record) => {
      const separator = record.indexOf('\n');
      return separator === -1
        ? { key: record, value: '' }
        : { key: record.slice(0, separator), value: record.slice(separator + 1) };
    });
}

function parseOrigin(stdout: Buffer): string | undefined {
  const records = stdout.toString('utf8').split('\0').filter(Boolean);
  for (let index = 0; index + 1 < records.length; index += 2) {
    const origin = records[index] ?? '';
    if (origin.startsWith('file:')) return origin.slice('file:'.length);
  }
  return undefined;
}

function parseGitDirCondition(
  condition: string,
): { type: GitDirConditionType; directory: string } | undefined {
  const match = /^(gitdir(?:\/i)?):(.*)$/iu.exec(condition);
  if (!match) return undefined;
  return {
    type: match[1]?.toLowerCase() === 'gitdir/i' ? 'gitdir/i' : 'gitdir',
    directory: match[2] ?? '',
  };
}

function isPullRebaseValue(value: string | undefined): value is PullRebaseValue {
  return value === 'false' || value === 'true' || value === 'merges' || value === 'interactive';
}

function cleanText(value: string | undefined, label: string): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > MAX_TEXT_LENGTH) throw new Error(`${label} is too long.`);
  if (UNSAFE_TEXT.test(trimmed)) throw new Error(`${label} contains unsupported characters.`);
  return trimmed;
}

function serializeProfile(fields: GitConfigProfileFields): string {
  const lines: string[] = [];
  const user: string[] = [];
  if (fields.name) user.push(`\tname = ${quoteValue(fields.name)}`);
  if (fields.email) user.push(`\temail = ${quoteValue(fields.email)}`);
  if (fields.signingKey) user.push(`\tsigningkey = ${quoteValue(fields.signingKey)}`);
  if (user.length) lines.push('[user]', ...user);
  if (fields.gpgSign !== undefined) {
    lines.push('[commit]', `\tgpgsign = ${fields.gpgSign ? 'true' : 'false'}`);
  }
  if (fields.sshCommand) {
    lines.push('[core]', `\tsshCommand = ${quoteValue(fields.sshCommand)}`);
  }
  if (fields.pullRebase) lines.push('[pull]', `\trebase = ${fields.pullRebase}`);
  return lines.length ? `${lines.join('\n')}\n` : '';
}

function describeFields(fields: GitConfigProfileFields): string[] {
  const lines: string[] = [];
  if (fields.name) lines.push(`user.name = ${fields.name}`);
  if (fields.email) lines.push(`user.email = ${fields.email}`);
  if (fields.signingKey) lines.push(`user.signingkey = ${fields.signingKey}`);
  if (fields.gpgSign !== undefined) {
    lines.push(`commit.gpgsign = ${fields.gpgSign ? 'true' : 'false'}`);
  }
  if (fields.sshCommand) lines.push(`core.sshCommand = ${fields.sshCommand}`);
  if (fields.pullRebase) lines.push(`pull.rebase = ${fields.pullRebase}`);
  return lines;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export class GitConfigService {
  private readonly runner: GitRunner;
  private readonly homeDir: string;
  private readonly platform: NodeJS.Platform;
  private readonly env: NodeJS.ProcessEnv;
  private readonly now: () => Date;

  constructor(options: GitConfigServiceOptions) {
    this.runner = options.runner;
    this.homeDir = options.homeDir ?? homedir();
    this.platform = options.platform ?? process.platform;
    this.env = options.env ?? process.env;
    this.now = options.now ?? (() => new Date());
  }

  get managedDirectory(): string {
    return join(this.homeDir, '.git-log', 'identities');
  }

  private get backupRoot(): string {
    return join(this.homeDir, '.git-log', 'backups');
  }

  async resolveGlobalConfigPath(): Promise<string> {
    const configured = this.env.GIT_CONFIG_GLOBAL?.trim();
    if (configured) return configured;
    try {
      const listed = await this.runGit([
        'config',
        '--global',
        '--no-includes',
        '--list',
        '--show-origin',
        '-z',
      ]);
      const origin = parseOrigin(listed.stdout);
      if (origin) return this.platform === 'win32' ? win32.normalize(origin) : origin;
    } catch {
      // An unreadable or absent global file falls through to the platform defaults.
    }
    const legacy = join(this.homeDir, '.gitconfig');
    if (await pathExists(legacy)) return legacy;
    if (this.platform !== 'win32') {
      const xdgRoot = this.env.XDG_CONFIG_HOME?.trim() || join(this.homeDir, '.config');
      const xdg = join(xdgRoot, 'git', 'config');
      if (await pathExists(xdg)) return xdg;
    }
    return legacy;
  }

  async list(): Promise<GitConfigListResult> {
    const globalConfigPath = await this.resolveGlobalConfigPath();
    const entries = await this.readConfigFile(globalConfigPath);
    const includeEntries = this.parseIncludeEntries(entries, globalConfigPath);
    const seen = new Set<string>();
    const profiles: GitConfigProfile[] = [];
    const external: GitConfigExternalEntry[] = [];

    for (const entry of includeEntries) {
      const key = `${entry.condition}\0${entry.includePath}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!this.isManagedPath(entry.includePath)) {
        external.push(entry);
        continue;
      }
      const parsed = parseGitDirCondition(entry.condition);
      if (!parsed) {
        external.push(entry);
        continue;
      }
      profiles.push({
        label: basename(entry.includePath).replace(/\.inc$/iu, ''),
        condition: entry.condition,
        conditionType: parsed.type,
        gitDir: parsed.directory,
        directoryPath: this.expandConditionDirectory(parsed.directory),
        includePath: entry.includePath,
        fields: await this.readProfileFields(entry.includePath),
      });
    }

    profiles.sort((left, right) => left.label.localeCompare(right.label));
    return { globalConfigPath, profiles, external };
  }

  async planCreate(draft: GitConfigProfileDraft): Promise<GitConfigChangePlan> {
    const globalConfigPath = await this.resolveGlobalConfigPath();
    const label = this.validateLabel(draft.label);
    const directory = this.normalizeDirectory(draft.directory);
    const fields = this.validateFields(draft.fields);
    const condition = this.buildCondition(directory);
    const includePath = join(this.managedDirectory, `${label}.inc`);
    if (await pathExists(includePath)) {
      throw new Error(`A configuration file named "${label}.inc" already exists.`);
    }
    const warnings = await this.checkConflicts(label, condition, directory);
    return {
      action: 'create',
      globalConfigPath,
      summary: [
        `Create profile "${label}".`,
        `Match: ${condition}`,
        `File: ${includePath}`,
        ...describeFields(fields),
      ],
      warnings,
      backupPaths: [globalConfigPath],
      writes: [{ path: includePath, content: serializeProfile(fields) }],
      removeFiles: [],
      addEntries: [{ condition, includePath }],
      removeEntries: [],
      profile: this.createProfile(
        label,
        condition,
        directory,
        includePath,
        fields,
      ),
    };
  }

  async planUpdate(
    previous: GitConfigProfile,
    draft: GitConfigProfileDraft,
  ): Promise<GitConfigChangePlan> {
    this.assertManaged(previous);
    const globalConfigPath = await this.resolveGlobalConfigPath();
    const label = this.validateLabel(draft.label);
    const directory = this.normalizeDirectory(draft.directory);
    const fields = this.validateFields(draft.fields);
    const condition = this.buildCondition(directory);
    const includePath = join(this.managedDirectory, `${label}.inc`);
    if (includePath !== previous.includePath && (await pathExists(includePath))) {
      throw new Error(`A configuration file named "${label}.inc" already exists.`);
    }
    const warnings = await this.checkConflicts(label, condition, directory, previous);
    const conditionChanged =
      !this.sameCondition(previous.condition, condition) || includePath !== previous.includePath;
    const previousFileUsers =
      includePath === previous.includePath
        ? 0
        : await this.countOtherReferences(previous.includePath, previous.condition);
    if (previousFileUsers) {
      warnings.push(
        `${previousFileUsers} other condition(s) include ${previous.includePath}; the file is kept.`,
      );
    }
    const backupPaths = [globalConfigPath, previous.includePath];
    const summary = [`Update profile "${previous.label}" to "${label}".`];
    if (!this.sameCondition(previous.condition, condition)) {
      summary.push(`Match: ${previous.condition} → ${condition}`);
    }
    if (includePath !== previous.includePath) {
      summary.push(`File: ${previous.includePath} → ${includePath}`);
    }
    summary.push(...describeFields(fields));
    return {
      action: 'update',
      globalConfigPath,
      summary,
      warnings,
      backupPaths,
      writes: [{ path: includePath, content: serializeProfile(fields) }],
      removeFiles:
        includePath === previous.includePath || previousFileUsers ? [] : [previous.includePath],
      addEntries: conditionChanged ? [{ condition, includePath }] : [],
      removeEntries: conditionChanged
        ? [{ condition: previous.condition, includePath: previous.includePath }]
        : [],
      profile: this.createProfile(label, condition, directory, includePath, fields),
    };
  }

  async planDelete(profile: GitConfigProfile): Promise<GitConfigChangePlan> {
    this.assertManaged(profile);
    const globalConfigPath = await this.resolveGlobalConfigPath();
    const otherReferences = await this.countOtherReferences(
      profile.includePath,
      profile.condition,
    );
    return {
      action: 'delete',
      globalConfigPath,
      summary: [
        `Delete profile "${profile.label}".`,
        `Remove: ${profile.condition}`,
        otherReferences
          ? `File kept: ${profile.includePath} (still used by ${otherReferences} other condition(s))`
          : `File: ${profile.includePath}`,
      ],
      warnings: otherReferences
        ? [`${otherReferences} other condition(s) include the same file; it is left in place.`]
        : [],
      backupPaths: [globalConfigPath, profile.includePath],
      writes: [],
      removeFiles: otherReferences ? [] : [profile.includePath],
      addEntries: [],
      removeEntries: [{ condition: profile.condition, includePath: profile.includePath }],
      profile,
    };
  }

  async apply(plan: GitConfigChangePlan): Promise<GitConfigApplyResult> {
    const backupDirectory = await this.createBackupDirectory();
    try {
      for (const [index, source] of plan.backupPaths.entries()) {
        if (!(await pathExists(source))) continue;
        const prefix = String(index).padStart(2, '0');
        await copyFile(source, join(backupDirectory, `${prefix}-${basename(source)}`));
      }
      for (const write of plan.writes) {
        await this.writeFileAtomically(write.path, write.content);
      }
      for (const entry of plan.removeEntries) {
        await this.removeIncludeEntry(plan.globalConfigPath, entry);
      }
      for (const entry of plan.addEntries) {
        await this.addIncludeEntry(plan.globalConfigPath, entry);
      }
      for (const file of plan.removeFiles) {
        if (await pathExists(file)) await unlink(file);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Failed to apply the Git profile: ${reason} Backup: ${backupDirectory}`,
        { cause: error },
      );
    }
    return { backupDirectory };
  }

  async verify(profile: GitConfigProfile): Promise<GitConfigVerification | undefined> {
    if (!(await pathExists(profile.directoryPath))) return undefined;
    try {
      const topLevel = await this.runGit(['rev-parse', '--show-toplevel'], profile.directoryPath);
      if (!topLevel.stdout.toString('utf8').trim()) return undefined;
    } catch {
      return undefined;
    }
    const values: Record<string, string | undefined> = {};
    for (const key of ['user.name', 'user.email']) {
      try {
        const result = await this.runGit(['config', '--get', key], profile.directoryPath);
        const value = result.stdout.toString('utf8').trim();
        if (value) values[key] = value;
      } catch {
        values[key] = undefined;
      }
    }
    return { directory: profile.directoryPath, values };
  }

  private createProfile(
    label: string,
    condition: string,
    directory: string,
    includePath: string,
    fields: GitConfigProfileFields,
  ): GitConfigProfile {
    return {
      label,
      condition,
      conditionType: this.conditionType(),
      gitDir: directory,
      directoryPath: this.expandConditionDirectory(directory),
      includePath,
      fields,
    };
  }

  private conditionType(): GitDirConditionType {
    return this.platform === 'win32' ? 'gitdir/i' : 'gitdir';
  }

  private buildCondition(directory: string): string {
    return `${this.conditionType()}:${directory}`;
  }

  private expandConditionDirectory(gitDir: string): string {
    const value = toPosix(gitDir);
    if (value === '~' || value === '~/') return this.homeDir;
    if (value.startsWith('~/')) return join(this.homeDir, value.slice(2));
    if (/^[A-Za-z]:\//u.test(value)) {
      return this.platform === 'win32' ? win32.normalize(value) : value;
    }
    return this.platform === 'win32' ? win32.normalize(value) : value;
  }

  private validateLabel(raw: string): string {
    const label = raw.trim();
    if (!label) throw new Error('Profile name is required.');
    if (label.length > 64) throw new Error('Profile name must be 64 characters or fewer.');
    if (
      label === '.' ||
      label === '..' ||
      label.startsWith('.') ||
      label.endsWith('.') ||
      label.endsWith(' ') ||
      UNSAFE_LABEL.test(label) ||
      RESERVED_WINDOWS_NAMES.test(label)
    ) {
      throw new Error('Profile name contains unsupported characters.');
    }
    return label;
  }

  private normalizeDirectory(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) throw new Error('Directory is required.');
    if (UNSAFE_TEXT.test(trimmed)) throw new Error('Directory contains unsupported characters.');
    const home = toPosix(this.homeDir);
    let value = toPosix(trimmed);
    if (value === '~') value = home;
    else if (value.startsWith('~/')) value = `${home}/${value.slice(2)}`;
    const drivePath = /^[A-Za-z]:\//u.test(value);
    if (!value.startsWith('/') && !drivePath) {
      throw new Error('Directory must be absolute or start with ~/.');
    }
    const normalizedNative =
      this.platform === 'win32' || drivePath ? win32.normalize(value) : posix.normalize(value);
    const normalized = toPosix(normalizedNative).replace(/\/+$/u, '');
    if (!normalized) throw new Error('Directory must not be the filesystem root.');
    const withSlash = `${normalized}/`;
    const homeWithSlash = home.endsWith('/') ? home : `${home}/`;
    const comparison = this.platform === 'win32' ? withSlash.toLowerCase() : withSlash;
    const homeComparison =
      this.platform === 'win32' ? homeWithSlash.toLowerCase() : homeWithSlash;
    return comparison.startsWith(homeComparison)
      ? `~/${withSlash.slice(homeWithSlash.length)}`
      : withSlash;
  }

  private validateFields(input: GitConfigProfileFields): GitConfigProfileFields {
    const name = cleanText(input.name, 'user.name');
    const email = cleanText(input.email, 'user.email');
    const signingKey = cleanText(input.signingKey, 'user.signingkey');
    const sshCommand = cleanText(input.sshCommand, 'core.sshCommand');
    if (input.gpgSign !== undefined && typeof input.gpgSign !== 'boolean') {
      throw new Error('commit.gpgsign must be a boolean.');
    }
    if (input.pullRebase !== undefined && !isPullRebaseValue(input.pullRebase)) {
      throw new Error('pull.rebase must be false, true, merges, or interactive.');
    }
    const fields: GitConfigProfileFields = {
      ...(name === undefined ? {} : { name }),
      ...(email === undefined ? {} : { email }),
      ...(signingKey === undefined ? {} : { signingKey }),
      ...(input.gpgSign === undefined ? {} : { gpgSign: input.gpgSign }),
      ...(sshCommand === undefined ? {} : { sshCommand }),
      ...(input.pullRebase === undefined ? {} : { pullRebase: input.pullRebase }),
    };
    if (Object.keys(fields).length === 0) {
      throw new Error('Configure at least one Git setting.');
    }
    return fields;
  }

  private async checkConflicts(
    label: string,
    condition: string,
    directory: string,
    exclude?: GitConfigProfile,
  ): Promise<string[]> {
    const { profiles, external } = await this.list();
    const warnings: string[] = [];
    for (const profile of profiles) {
      if (exclude && profile.includePath === exclude.includePath) continue;
      if (profile.label.toLocaleLowerCase() === label.toLocaleLowerCase()) {
        throw new Error(`A profile named "${label}" already exists.`);
      }
      if (this.sameCondition(profile.condition, condition)) {
        throw new Error(`Another profile already matches ${condition}.`);
      }
      const parsed = parseGitDirCondition(profile.condition);
      if (parsed && this.overlappingDirectories(parsed.directory, directory)) {
        warnings.push(
          `Profile "${profile.label}" uses an overlapping directory; the profile written later wins.`,
        );
      }
    }
    for (const entry of external) {
      if (this.sameCondition(entry.condition, condition)) {
        warnings.push(`An external include already matches ${condition}; both files apply.`);
      }
    }
    return warnings;
  }

  /** Include entries other than `removedCondition` that point at the same file. */
  private async countOtherReferences(
    includePath: string,
    removedCondition: string,
  ): Promise<number> {
    const { profiles, external } = await this.list();
    const entries = [
      ...profiles.map((profile) => ({
        condition: profile.condition,
        includePath: profile.includePath,
      })),
      ...external,
    ];
    return entries.filter(
      (entry) =>
        this.sameFilePath(entry.includePath, includePath) &&
        !this.sameCondition(entry.condition, removedCondition),
    ).length;
  }

  private sameFilePath(left: string, right: string): boolean {
    const key = (value: string): string => {
      const text = toPosix(value);
      return this.platform === 'win32' ? text.toLocaleLowerCase() : text;
    };
    return key(left) === key(right);
  }

  private sameCondition(left: string, right: string): boolean {
    const keyLeft = this.conditionDirectoryKey(left);
    const keyRight = this.conditionDirectoryKey(right);
    if (keyLeft === undefined || keyRight === undefined) {
      return this.platform === 'win32'
        ? left.toLocaleLowerCase() === right.toLocaleLowerCase()
        : left === right;
    }
    return keyLeft === keyRight;
  }

  /**
   * Directory a condition matches, with the `gitdir` / `gitdir/i` prefix treated as a
   * matching-mode detail rather than part of the target directory.
   */
  private conditionDirectoryKey(condition: string): string | undefined {
    const parsed = parseGitDirCondition(condition);
    return parsed ? this.directoryKey(parsed.directory) : undefined;
  }

  private directoryKey(gitDir: string): string {
    const directory = toPosix(this.expandConditionDirectory(gitDir));
    return this.platform === 'win32' ? directory.toLocaleLowerCase() : directory;
  }

  private overlappingDirectories(left: string, right: string): boolean {
    const first = this.directoryKey(left);
    const second = this.directoryKey(right);
    return first.startsWith(second) || second.startsWith(first);
  }

  private assertManaged(profile: GitConfigProfile): void {
    if (!this.isManagedPath(profile.includePath)) {
      throw new Error('Only profiles managed by Git Log can be changed.');
    }
  }

  private isManagedPath(path: string): boolean {
    if (this.platform === 'win32') {
      const managed = win32.normalize(this.managedDirectory);
      const candidate = win32.normalize(path);
      const rel = win32.relative(managed, candidate);
      return Boolean(rel) && !rel.startsWith('..') && !win32.isAbsolute(rel);
    }
    const rel = relative(this.managedDirectory, path);
    return Boolean(rel) && !rel.startsWith('..') && !isAbsolute(rel);
  }

  private async readConfigFile(path: string): Promise<Array<{ key: string; value: string }>> {
    if (!(await pathExists(path))) return [];
    const result = await this.runGit(['config', '--file', path, '--no-includes', '--list', '-z']);
    return parseConfigEntries(result.stdout);
  }

  private parseIncludeEntries(
    entries: ReadonlyArray<{ key: string; value: string }>,
    globalConfigPath: string,
  ): GitConfigExternalEntry[] {
    const result: GitConfigExternalEntry[] = [];
    for (const entry of entries) {
      if (!entry.key.startsWith(INCLUDE_PREFIX) || !entry.key.endsWith(INCLUDE_SUFFIX)) continue;
      const condition = entry.key.slice(
        INCLUDE_PREFIX.length,
        entry.key.length - INCLUDE_SUFFIX.length,
      );
      if (!condition) continue;
      result.push({
        condition,
        includePath: this.resolveIncludedPath(entry.value, globalConfigPath),
      });
    }
    return result;
  }

  private resolveIncludedPath(raw: string, globalConfigPath: string): string {
    const value = toPosix(raw.trim());
    if (value === '~') return this.homeDir;
    if (value.startsWith('~/')) return join(this.homeDir, value.slice(2));
    if (/^[A-Za-z]:\//u.test(value)) {
      return this.platform === 'win32' ? win32.normalize(value) : value;
    }
    if (value.startsWith('/')) {
      return this.platform === 'win32' ? win32.normalize(value) : posix.normalize(value);
    }
    return resolve(dirname(globalConfigPath), value);
  }

  private async readProfileFields(includePath: string): Promise<GitConfigProfileFields> {
    const entries = await this.readConfigFile(includePath);
    const values = new Map(entries.map((entry) => [entry.key, entry.value]));
    const name = values.get('user.name');
    const email = values.get('user.email');
    const signingKey = values.get('user.signingkey');
    const sshCommand = values.get('core.sshcommand');
    const gpgSign = values.get('commit.gpgsign');
    const pullRebase = values.get('pull.rebase');
    return {
      ...(name ? { name } : {}),
      ...(email ? { email } : {}),
      ...(signingKey ? { signingKey } : {}),
      ...(gpgSign === 'true' ? { gpgSign: true } : {}),
      ...(gpgSign === 'false' ? { gpgSign: false } : {}),
      ...(sshCommand ? { sshCommand } : {}),
      ...(isPullRebaseValue(pullRebase) ? { pullRebase } : {}),
    };
  }

  private async runGit(
    args: readonly string[],
    cwd: string = this.homeDir,
  ): Promise<{ stdout: Buffer }> {
    const result = await this.runner.run(args, {
      cwd,
      env: this.env,
      timeoutMs: 30_000,
      maxStdoutBytes: 8 * 1024 * 1024,
    });
    return { stdout: result.stdout };
  }

  private async addIncludeEntry(
    globalConfigPath: string,
    entry: GitConfigExternalEntry,
  ): Promise<void> {
    await this.runGit([
      'config',
      '--file',
      globalConfigPath,
      '--add',
      `includeIf.${entry.condition}.path`,
      entry.includePath,
    ]);
  }

  private async removeIncludeEntry(
    globalConfigPath: string,
    entry: GitConfigExternalEntry,
  ): Promise<void> {
    const patterns = this.includePathAlternatives(entry.includePath).map(escapeRegExp);
    const valuePattern = patterns.length === 1 ? `^${patterns[0]}$` : `^(${patterns.join('|')})$`;
    try {
      await this.runGit([
        'config',
        '--file',
        globalConfigPath,
        '--unset',
        `includeIf.${entry.condition}.path`,
        valuePattern,
      ]);
    } catch (error) {
      if (error instanceof GitCommandError && error.exitCode === 5) return;
      throw error;
    }
  }

  private includePathAlternatives(includePath: string): string[] {
    const alternatives = new Set<string>([includePath]);
    const relativePath = relative(this.homeDir, includePath);
    if (relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath)) {
      alternatives.add(`~/${toPosix(relativePath)}`);
    }
    if (this.platform === 'win32') {
      for (const value of [...alternatives]) {
        alternatives.add(value.replaceAll('\\', '/'));
        alternatives.add(value.replaceAll('/', '\\'));
      }
    }
    return [...alternatives];
  }

  private async createBackupDirectory(): Promise<string> {
    const stamp = formatTimestamp(this.now());
    let candidate = join(this.backupRoot, stamp);
    let suffix = 1;
    while (await pathExists(candidate)) {
      candidate = join(this.backupRoot, `${stamp}-${String(suffix)}`);
      suffix += 1;
    }
    await mkdir(candidate, { recursive: true });
    return candidate;
  }

  private async writeFileAtomically(path: string, content: string): Promise<void> {
    await mkdir(dirname(path), { recursive: true });
    const temporary = join(
      dirname(path),
      `.${basename(path)}.${String(process.pid)}.${randomBytes(6).toString('hex')}.tmp`,
    );
    try {
      await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600 });
      await rename(temporary, path);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }
}
