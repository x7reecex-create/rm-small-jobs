#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const os = require('node:os');

const INSTRUCTION_START = '<!-- BEGIN CODEX ACTIVITY LOG: managed -->';
const INSTRUCTION_END = '<!-- END CODEX ACTIVITY LOG: managed -->';
const IGNORE_START = '# BEGIN CODEX ACTIVITY LOG: managed';
const IGNORE_END = '# END CODEX ACTIVITY LOG: managed';

function usage() {
  return 'Usage: node install.cjs --repo PATH --project NAME [--project-value OPTION] [--global] [--dry-run]\n' +
    'Installs the activity-log tools and managed instructions without touching Notion.\n' +
    'The Project option must already exist in Notion; defaults to Other.\n' +
    '--global additionally appends instructions to the supported Codex home.\n';
}

function parseArgs(argv) {
  const result = { projectValue: 'Other', dryRun: false, global: false };
  const keys = { '--repo': 'repo', '--project': 'project', '--project-value': 'projectValue' };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--dry-run') {
      result.dryRun = true;
      continue;
    }
    if (arg === '--global') {
      result.global = true;
      continue;
    }
    const key = keys[arg];
    if (!key) throw new Error(`Unknown argument: ${arg}`);
    const value = argv[++i];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    if (Object.prototype.hasOwnProperty.call(result, key) && key !== 'projectValue') {
      throw new Error(`Repeated argument: ${arg}`);
    }
    result[key] = value;
  }
  if (!result.repo || !result.project) throw new Error('--repo and --project are required');
  for (const [key, value] of [['project', result.project], ['project-value', result.projectValue]]) {
    if (!value.trim() || /[\r\n\u0000-\u001f\u007f]/.test(value)) {
      throw new Error(`${key} must be a nonempty single-line value`);
    }
  }
  result.project = result.project.trim();
  result.projectValue = result.projectValue.trim();
  result.repo = path.resolve(result.repo);
  return result;
}

function ensureRegular(file) {
  if (!fs.existsSync(file)) return;
  const st = fs.lstatSync(file);
  if (!st.isFile() || st.isSymbolicLink()) throw new Error(`Refusing to replace a nonregular file: ${file}`);
}

function readExisting(file) {
  ensureRegular(file);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
}

function managedBlock(existing, start, end, content, file) {
  const startCount = existing.split(start).length - 1;
  const endCount = existing.split(end).length - 1;
  if (startCount !== endCount || startCount > 1) {
    throw new Error(`Malformed or repeated managed markers in ${file}; preserve and review manually`);
  }
  const block = `${start}\n${content.trim()}\n${end}`;
  if (startCount === 1) {
    const a = existing.indexOf(start);
    const b = existing.indexOf(end);
    if (b < a) throw new Error(`Reversed managed markers in ${file}`);
    return existing.slice(0, a) + block + existing.slice(b + end.length);
  }
  const separator = existing.length === 0 ? '' : existing.endsWith('\n\n') ? '' : existing.endsWith('\n') ? '\n' : '\n\n';
  return existing + separator + block + '\n';
}

function atomicWrite(file, data) {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  let handle;
  try {
    handle = fs.openSync(temp, 'wx', 0o600);
    fs.writeFileSync(handle, data, 'utf8');
    fs.fsyncSync(handle);
    fs.closeSync(handle);
    handle = undefined;
    if (fs.existsSync(file)) fs.chmodSync(temp, fs.statSync(file).mode & 0o777);
    else fs.chmodSync(temp, 0o644);
    fs.renameSync(temp, file);
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}

function assertDirectory(file) {
  if (!fs.existsSync(file)) return;
  const st = fs.lstatSync(file);
  if (!st.isDirectory() || st.isSymbolicLink()) throw new Error(`Refusing nonregular directory: ${file}`);
}

function shellQuote(value) {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

function globalInstructions(kitInstaller) {
  return [
    '## Automatic activity logging for development projects',
    '',
    'The user requires automatic progress logging in the existing Codex Activity',
    'Log Notion database for all meaningful development tasks. At the start of',
    'each project session, read the effective repository instructions, check its',
    'latest Notion handover and pending local queue, and inspect the Git state.',
    'At task completion, verify the work and automatically sync a sanitized',
    'handover; confirm saved-and-read-back versus pending with the real blocker.',
    '',
    'If the repository lacks `.codex/activity-log.json`, safely bootstrap this',
    'workflow using the existing kit before starting substantial work:',
    '',
    '```sh',
    `node ${shellQuote(kitInstaller)} --repo '<absolute repository path>' --project '<actual project name>' --project-value 'Other'`,
    '```',
    '',
    'Replace the placeholders with the actual repository and project name; infer',
    'the repository basename only when no better project identity is available.',
    'Use an existing known Notion Project option instead of Other when appropriate.',
    'The installer preserves unrelated instructions. If its kit path is unavailable,',
    'report that blocker and preserve a sanitized pending handover locally; do not',
    'create a replacement Notion database or silently skip logging. Do not rerun',
    'global setup just to bootstrap a repository. Once installed, follow the local',
    '`.codex/activity-log-workflow.md` and its stable task ID/read-back rules.',
    '',
    'Never store secrets or private customer data. Never claim unverified tests',
    'or deployments succeeded. These instructions govern active Codex sessions;',
    'they do not provide authentication or run a background service. Notion access',
    'must be available separately to Codex and to ChatGPT.',
  ].join('\n');
}

function globalHome(environment = process.env, home = os.homedir()) {
  return path.resolve(environment.CODEX_HOME || path.join(home, '.codex'));
}

function safeErrorReason(error) {
  return error instanceof SyntaxError ? 'Configuration JSON is invalid; file contents omitted' : error.message;
}

function install(options) {
  if (!fs.existsSync(options.repo) || !fs.statSync(options.repo).isDirectory()) {
    throw new Error(`Repository directory does not exist: ${options.repo}`);
  }
  const repo = fs.realpathSync(options.repo);
  const codex = path.join(repo, '.codex');
  assertDirectory(codex);
  const kitTarget = path.join(codex, 'activity-log-kit');
  assertDirectory(kitTarget);
  const sourceRoot = __dirname;
  const sourceConfigFile = path.join(sourceRoot, 'activity-log.config.json');
  const baseConfig = JSON.parse(fs.readFileSync(sourceConfigFile, 'utf8'));
  if (baseConfig.version !== 1 || !baseConfig.data_source_id || !baseConfig.database_url) {
    throw new Error('Source activity-log.config.json is missing the existing Notion source identifiers');
  }
  const targetConfig = path.join(codex, 'activity-log.json');
  const existingConfigText = readExisting(targetConfig);
  const existingConfig = existingConfigText ? JSON.parse(existingConfigText) : {};
  if (existingConfig.data_source_id && existingConfig.data_source_id !== baseConfig.data_source_id) {
    throw new Error('Existing activity-log.json points to a different data source; refusing to retarget it');
  }
  const config = { ...baseConfig, ...existingConfig, project_name: options.project, project_value: options.projectValue };
  const templateFile = path.join(sourceRoot, 'AGENTS.template.md');
  const template = fs.readFileSync(templateFile, 'utf8');
  const start = template.indexOf(INSTRUCTION_START);
  const end = template.indexOf(INSTRUCTION_END);
  if (start < 0 || end < start) throw new Error('AGENTS template has missing or reversed managed markers');
  const instructionContent = template.slice(start + INSTRUCTION_START.length, end).trim();

  // Read and validate every destination before any writes; malformed instructions
  // never result in a partial instruction replacement.
  const writes = new Map();
  for (const name of ['AGENTS.md', 'AGENTS.override.md']) {
    const file = path.join(repo, name);
    if (name === 'AGENTS.override.md' && !fs.existsSync(file)) continue;
    const existing = readExisting(file);
    writes.set(file, managedBlock(existing, INSTRUCTION_START, INSTRUCTION_END, instructionContent, file));
  }
  const ignoreFile = path.join(repo, '.gitignore');
  writes.set(ignoreFile, managedBlock(readExisting(ignoreFile), IGNORE_START, IGNORE_END,
    '# Sanitized local outbox: keep pending logs on this clone until synced.\n/.codex/activity-log/', ignoreFile));
  for (const [source, target] of [
    ['activity-log.cjs', 'activity-log.cjs'],
    ['workflow.md', 'activity-log-workflow.md'],
  ]) {
    const targetFile = path.join(codex, target);
    ensureRegular(targetFile);
    writes.set(targetFile, fs.readFileSync(path.join(sourceRoot, source), 'utf8'));
  }
  writes.set(targetConfig, JSON.stringify(config, null, 2) + '\n');
  const kitNames = ['install.cjs', 'AGENTS.template.md', 'activity-log.config.json', 'activity-log.cjs', 'workflow.md'];
  for (const optional of ['activity-log.test.cjs', 'install.test.cjs', 'README.md']) {
    if (fs.existsSync(path.join(sourceRoot, optional))) kitNames.push(optional);
  }
  for (const name of kitNames) {
    const target = path.join(kitTarget, name);
    ensureRegular(target);
    writes.set(target, fs.readFileSync(path.join(sourceRoot, name), 'utf8'));
  }
  let globalFile = null;
  let globalDirectory = null;
  if (options.global) {
    // globalDirectory is an explicit test seam for fixture-only unit tests. The
    // CLI never accepts this key and resolves only the supported Codex home.
    globalDirectory = options.globalDirectory || globalHome();
    assertDirectory(globalDirectory);
    globalFile = path.join(globalDirectory, fs.existsSync(path.join(globalDirectory, 'AGENTS.override.md')) ? 'AGENTS.override.md' : 'AGENTS.md');
    const existing = readExisting(globalFile);
    writes.set(globalFile, managedBlock(existing, INSTRUCTION_START, INSTRUCTION_END,
      globalInstructions(path.join(kitTarget, 'install.cjs')), globalFile));
  }

  const changed = [...writes].filter(([file, content]) => readExisting(file) !== content);
  if (!options.dryRun) {
    fs.mkdirSync(codex, { recursive: true });
    fs.mkdirSync(kitTarget, { recursive: true });
    if (globalDirectory) fs.mkdirSync(globalDirectory, { recursive: true });
    for (const [file, content] of changed) atomicWrite(file, content);
  }
  return {
    mode: options.dryRun ? 'dry-run' : 'installed',
    repository: repo,
    project_name: options.project,
    project_value: options.projectValue,
    changed_files: changed.map(([file]) => file === globalFile ? file : path.relative(repo, file)),
    instructions: fs.existsSync(path.join(repo, 'AGENTS.override.md')) ? ['AGENTS.md', 'AGENTS.override.md'] : ['AGENTS.md'],
    pending_path: '.codex/activity-log/',
    notion_writes: false,
    background_service: false,
    global_instructions_installed: options.global && !options.dryRun,
    global_instruction_file: globalFile,
  };
}

if (require.main === module) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) process.stdout.write(usage());
    else process.stdout.write(JSON.stringify(install(options), null, 2) + '\n');
  } catch (error) {
    process.stderr.write(`Installation failed: ${safeErrorReason(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = { parseArgs, managedBlock, install, globalHome, globalInstructions, safeErrorReason };
