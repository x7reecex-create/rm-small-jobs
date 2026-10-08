'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { install, globalHome, safeErrorReason } = require('./install.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'activity-log-install-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'project');
  fs.mkdirSync(repo);
  return { root, repo };
}

function opts(repo, extra = {}) {
  return { repo, project: 'Example Project', projectValue: 'Other', dryRun: false, global: false, ...extra };
}

test('installation preserves root instructions, override and ignore rules on repeat', (t) => {
  const { repo } = fixture(t);
  const instructions = '# Existing user instructions\nKeep this literal content.\n';
  const override = '# Existing override\nFollow repository rules.\n';
  const ignore = 'node_modules/\n.env.local\n';
  fs.writeFileSync(path.join(repo, 'AGENTS.md'), instructions);
  fs.writeFileSync(path.join(repo, 'AGENTS.override.md'), override);
  fs.writeFileSync(path.join(repo, '.gitignore'), ignore);
  const first = install(opts(repo));
  assert.equal(first.notion_writes, false);
  assert.equal(first.global_instructions_installed, false);
  const captured = new Map();
  for (const [name, before] of [['AGENTS.md', instructions], ['AGENTS.override.md', override], ['.gitignore', ignore]]) {
    const actual = fs.readFileSync(path.join(repo, name), 'utf8');
    assert.ok(actual.startsWith(before), `${name}: unrelated instructions must remain exact`);
    captured.set(name, actual);
  }
  const second = install(opts(repo));
  assert.deepEqual(second.changed_files, []);
  for (const [name, before] of captured) assert.equal(fs.readFileSync(path.join(repo, name), 'utf8'), before);
  assert.equal(captured.get('AGENTS.md').split('<!-- BEGIN CODEX ACTIVITY LOG: managed -->').length - 1, 1);
  assert.equal(captured.get('.gitignore').split('/.codex/activity-log/').length - 1, 1);
  assert.equal(fs.readFileSync(path.join(repo, '.codex/activity-log.cjs'), 'utf8'), fs.readFileSync(path.join(__dirname, 'activity-log.cjs'), 'utf8'));
  assert.equal(fs.readFileSync(path.join(repo, '.codex/activity-log-kit/install.cjs'), 'utf8'), fs.readFileSync(path.join(__dirname, 'install.cjs'), 'utf8'));
});

test('copied kit can install a new repository independently and does not create overrides', (t) => {
  const { root, repo } = fixture(t);
  install(opts(repo));
  assert.equal(fs.existsSync(path.join(repo, 'AGENTS.override.md')), false);
  const future = path.join(root, 'future');
  fs.mkdirSync(future);
  const copiedInstaller = require(path.join(repo, '.codex/activity-log-kit/install.cjs'));
  copiedInstaller.install(opts(future, { project: 'Future Project' }));
  const config = JSON.parse(fs.readFileSync(path.join(future, '.codex/activity-log.json'), 'utf8'));
  assert.equal(config.project_name, 'Future Project');
  assert.equal(config.project_value, 'Other');
  assert.equal(config.data_source_id, JSON.parse(fs.readFileSync(path.join(__dirname, 'activity-log.config.json'), 'utf8')).data_source_id);
});

test('dry run creates no files and malformed markers fail before any mutation', (t) => {
  const { repo } = fixture(t);
  const preview = install(opts(repo, { dryRun: true }));
  assert.ok(preview.changed_files.includes('AGENTS.md'));
  assert.deepEqual(fs.readdirSync(repo), []);
  const malformed = '# Unrelated content\n<!-- BEGIN CODEX ACTIVITY LOG: managed -->\nmissing end';
  fs.writeFileSync(path.join(repo, 'AGENTS.override.md'), malformed);
  assert.throws(() => install(opts(repo)), /Malformed or repeated managed markers/);
  assert.equal(fs.readFileSync(path.join(repo, 'AGENTS.override.md'), 'utf8'), malformed);
  assert.equal(fs.existsSync(path.join(repo, 'AGENTS.md')), false);
  assert.equal(fs.existsSync(path.join(repo, '.codex')), false);
});

test('existing config preserves custom keys and cannot be silently retargeted', (t) => {
  const { repo } = fixture(t);
  install(opts(repo));
  const file = path.join(repo, '.codex/activity-log.json');
  const existing = JSON.parse(fs.readFileSync(file, 'utf8'));
  existing.custom_note = 'keep this';
  fs.writeFileSync(file, JSON.stringify(existing));
  install(opts(repo));
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).custom_note, 'keep this');
  existing.data_source_id = 'different-source';
  fs.writeFileSync(file, JSON.stringify(existing));
  assert.throws(() => install(opts(repo)), /refusing to retarget/);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).data_source_id, 'different-source');
});

test('optional global instructions preserve effective override and are idempotent', (t) => {
  const { root, repo } = fixture(t);
  const configuredHome = path.join(root, 'codex-fixture');
  fs.mkdirSync(configuredHome);
  const file = path.join(configuredHome, 'AGENTS.override.md');
  const original = '# Existing global rules\nKeep these instructions.\n';
  fs.writeFileSync(file, original);
  const first = install(opts(repo, { global: true, globalDirectory: configuredHome }));
  assert.equal(first.global_instructions_installed, true);
  assert.equal(first.global_instruction_file, file);
  const actual = fs.readFileSync(file, 'utf8');
  assert.ok(actual.startsWith(original));
  assert.ok(actual.includes(path.join(repo, '.codex/activity-log-kit/install.cjs')));
  assert.equal(fs.existsSync(path.join(configuredHome, 'AGENTS.md')), false);
  assert.deepEqual(install(opts(repo, { global: true, globalDirectory: configuredHome })).changed_files, []);
  assert.equal(fs.readFileSync(file, 'utf8'), actual);
  assert.equal(globalHome({ CODEX_HOME: configuredHome }, path.join(root, 'unused')), configuredHome);
  assert.equal(globalHome({}, root), path.join(root, '.codex'));
});

test('invalid configuration errors use sanitized diagnostics without JSON content', (t) => {
  const { repo } = fixture(t);
  fs.mkdirSync(path.join(repo, '.codex'));
  fs.writeFileSync(path.join(repo, '.codex/activity-log.json'), '{"credential":"DO_NOT_PRINT_THIS_TEST_VALUE", bad}');
  let caught;
  try { install(opts(repo)); } catch (error) { caught = error; }
  assert.ok(caught instanceof SyntaxError);
  const message = safeErrorReason(caught);
  assert.match(message, /Configuration JSON is invalid; file contents omitted/);
  assert.equal(message.includes('DO_NOT_PRINT_THIS_TEST_VALUE'), false);
  assert.equal(fs.existsSync(path.join(repo, 'AGENTS.md')), false);
});
