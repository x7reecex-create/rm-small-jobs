'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ActivityLog, extractManagedBody, matchesTaskToken, secretGuard, main } = require('./activity-log.cjs');

const DATA_SOURCE = '11111111-1111-4111-8111-111111111111';
const PAGE = '22222222-2222-4222-8222-222222222222';
const TASK = '33333333-3333-4333-8333-333333333333';
const VIEW = 'view://55555555-5555-4555-8555-555555555555';
const CONFIG = { version: 1, project_name: 'Nexus', data_source_id: DATA_SOURCE,
  database_url: 'https://www.notion.so/44444444444444448444444444444444',
  title_property: 'Task', project_property: 'Project', project_value: 'Other', transport: 'notion-connector' };
const PAYLOAD = { privacy_attestation: true, properties: { Task: 'Verify progress logging', Status: 'Completed',
  'date:Date:start': '2026-10-08T14:00:00Z', 'date:Date:is_datetime': 1 },
  body: 'Completed code: harmless logging setup.\n\nTests: local queue checks passed.\n\nLive functionality: not verified.\n\nNext action: read the activity log.' };
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-notion-test-'));
  fs.mkdirSync(path.join(directory, '.codex'));
  fs.writeFileSync(path.join(directory, '.codex', 'activity-log.json'), JSON.stringify(CONFIG));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, log: new ActivityLog(directory) };
}
function evidence(record, expected) {
  return { task_id: record.task_id, revision: record.revision, page_id: PAGE,
    data_source_id: DATA_SOURCE, matched_count: 1, fetched_at: new Date().toISOString(),
    fetched_properties: { ...expected.properties }, fetched_body: expected.body };
}
function runCli(args) {
  // Runs the real CLI entrypoint without spawning; some managed sandboxes forbid child processes.
  let stdout = ''; let stderr = '';
  const originalOut = process.stdout.write; const originalError = process.stderr.write;
  process.stdout.write = chunk => { stdout += chunk; return true; };
  process.stderr.write = chunk => { stderr += chunk; return true; };
  let status;
  try { status = main(args); } finally { process.stdout.write = originalOut; process.stderr.write = originalError; }
  return { status, stdout, stderr };
}

test('new writes durable reviewed state; restarting and rerunning the same UUID preserves one task', t => {
  const { directory, log } = fixture(t);
  const first = log.new(PAYLOAD, TASK);
  assert.equal(first.sync_state, 'pending');
  const reloaded = new ActivityLog(directory);
  const second = reloaded.new(PAYLOAD, TASK);
  assert.deepEqual(second, first);
  assert.equal(reloaded.list().entries.length, 1);
  assert.equal(reloaded.list().pending_count, 1);
  assert.match(fs.readFileSync(path.join(directory, '.codex', 'activity-log', 'latest-handover.md'), 'utf8'), /Notion sync: pending/);
  const files = fs.readdirSync(path.join(directory, '.codex', 'activity-log', 'outbox'));
  assert.deepEqual(files, [TASK + '.json']);
  assert.equal(fs.statSync(log.filename(TASK)).mode & 0o777, 0o600);
});

test('payload edits advance the revision and identical restaging is idempotent', t => {
  const { log } = fixture(t);
  const first = log.new(PAYLOAD, TASK);
  assert.equal(log.stage(TASK, PAYLOAD).revision, 1);
  const changed = { ...PAYLOAD, body: PAYLOAD.body + '\n\nBugs fixed: none.' };
  const staged = log.stage(TASK, changed);
  assert.equal(staged.revision, 2);
  assert.equal(log.stage(TASK, changed).revision, 2);
  assert.equal(staged.created_at, first.created_at);
  assert.equal(log.list().entries.length, 1);
  assert.throws(() => log.new(PAYLOAD, TASK), /different content/);
});

test('request persists the create reservation before export; crashes cannot authorize blind retry', t => {
  const { directory, log } = fixture(t);
  log.new(PAYLOAD, TASK);
  const first = log.request(TASK);
  assert.equal(first.create.allowed_after_successful_zero_match, true);
  assert.equal(log.read(TASK).ambiguous_create, true);
  assert.equal(first.lookup.data.params[0], '%[codex-task:' + TASK + ']%');
  assert.match(first.create.args.pages[0].properties.Task, /Nexus: Verify progress logging \[codex-task:/);
  assert.equal(first.create.args.pages[0].properties.Project, 'Other');
  const afterCrash = new ActivityLog(directory).request(TASK);
  assert.equal(afterCrash.create.allowed_after_successful_zero_match, false);
  assert.equal(afterCrash.request_hash, first.request_hash);
  assert.equal(log.read(TASK).attempts, 2);
});

test('lookup outage is pending and explicit proof of no create call permits a safe retry', t => {
  const { log } = fixture(t);
  log.new(PAYLOAD, TASK);
  log.request(TASK);
  log.fail(TASK, 'Notion unavailable before a create call.', false);
  assert.equal(log.request(TASK).create.allowed_after_successful_zero_match, false);
  log.fail(TASK, 'Lookup failed; no create call was attempted.', false, true);
  assert.equal(log.list().pending_count, 1);
  assert.equal(log.request(TASK).create.allowed_after_successful_zero_match, true);
  assert.throws(() => log.fail(TASK, 'Invalid contradictory evidence.', true, true), /not both/);
});

test('simulated successful-create timeout reconciles and updates the same remote page after restart', t => {
  const { directory, log } = fixture(t);
  log.new(PAYLOAD, TASK);
  const first = log.request(TASK);
  // Fake the remote accepting a create while its response is lost.
  const remote = new Map([[TASK, { page_id: PAGE, properties: first.create.args.pages[0].properties,
    body: first.create.args.pages[0].content }]]);
  log.fail(TASK, 'Create response timed out; remote result is uncertain.', true);
  const restarted = new ActivityLog(directory);
  const retry = restarted.request(TASK);
  assert.equal(retry.create.allowed_after_successful_zero_match, false);
  assert.equal(remote.size, 1);
  const existing = remote.get(TASK);
  existing.properties = retry.update.properties_args.properties;
  existing.body = retry.readback_expected.body;
  const actual = evidence(restarted.read(TASK), { properties: existing.properties, body: existing.body });
  const saved = restarted.ack(TASK, actual);
  assert.equal(saved.sync_state, 'synced');
  assert.equal(saved.remote_page_id, PAGE);
  assert.equal(saved.receipt.matched_count, 1);
  assert.equal(remote.size, 1);
  assert.equal(restarted.list().pending_count, 0);
  assert.equal(restarted.request(TASK).action, 'none');
});

test('stale receipts fail and a new revision retains its original remote page identity', t => {
  const { log } = fixture(t);
  const first = log.new(PAYLOAD, TASK);
  const oldProof = evidence(first, log.expected(first));
  log.ack(TASK, oldProof);
  const revised = log.stage(TASK, { ...PAYLOAD, body: PAYLOAD.body + '\n\nNew verified evidence: local tests only.' });
  assert.equal(revised.remote_page_id, PAGE);
  assert.equal(revised.sync_state, 'pending');
  assert.equal(revised.receipt, null);
  assert.throws(() => log.ack(TASK, oldProof), /stale revision/);
  const request = log.request(TASK);
  assert.equal(request.create.allowed_after_successful_zero_match, false);
  assert.equal(request.update.remote_page_id, PAGE);
  log.ack(TASK, evidence(revised, log.expected(revised)));
  assert.equal(log.list().entries.length, 1);
});

test('receipts reject duplicates, wrong destination, missing fields, corrupted body and marker-only proof', t => {
  const { log } = fixture(t);
  const record = log.new(PAYLOAD, TASK);
  const proof = evidence(record, log.expected(record));
  assert.throws(() => log.ack(TASK, { ...proof, matched_count: 2 }), /Exactly one/);
  assert.throws(() => log.ack(TASK, { ...proof, data_source_id: PAGE }), /different database/);
  assert.throws(() => log.ack(TASK, { ...proof, fetched_properties: { Task: proof.fetched_properties.Task } }), /properties/);
  assert.throws(() => log.ack(TASK, { ...proof, fetched_body: proof.fetched_body.replace('harmless logging setup', 'unfinished deployment') }), /full body/);
  assert.throws(() => log.ack(TASK, { ...proof, fetched_body: 'Codex handover begins: codex-task:' + TASK + '\n\nLog revision: 1\n\nCodex handover ends: codex-task:' + TASK }), /full body/);
  assert.throws(() => log.ack(TASK, { ...proof, fetched_at: '2020-01-01T00:00:00Z' }), /timestamp/);
  assert.equal(log.read(TASK).sync_state, 'pending');
});

test('actual bounded handover extraction preserves surrounding human text and accepts verified fetch normalization', t => {
  const { log } = fixture(t);
  const record = log.new(PAYLOAD, TASK);
  const expected = log.expected(record);
  const remoteBody = 'Human notes before.\n\n' + expected.body + '\n\nHuman notes after.';
  const managedBody = extractManagedBody(remoteBody, TASK);
  assert.equal(managedBody, expected.body);
  assert.throws(() => extractManagedBody(expected.body + '\n' + expected.body, TASK), /exactly one/);
  const proof = evidence(record, expected);
  assert.throws(() => log.ack(TASK, { ...proof, fetched_body: remoteBody }), /only the fetched bounded/);
  proof.fetched_body = managedBody.replace(/\n/g, '\r\n');
  proof.fetched_properties['date:Date:start'] = '2026-10-08T14:00:00.000+00:00';
  assert.equal(log.ack(TASK, proof).sync_state, 'synced');
});

test('Notion datetime requests normalize to UTC minute precision before staging; wrong minutes still reject', t => {
  const { log } = fixture(t);
  const input = { ...PAYLOAD, properties: { ...PAYLOAD.properties,
    'date:Date:start': '2026-10-08T16:50:05.987+02:00',
    'date:Date:end': '2026-10-08T14:55:47Z',
    'date:Day:start': '2026-10-08', 'date:Day:is_datetime': 0 } };
  const record = log.new(input, TASK);
  assert.equal(record.payload.properties['date:Date:start'], '2026-10-08T14:50:00Z');
  assert.equal(record.payload.properties['date:Date:end'], '2026-10-08T14:55:00Z');
  assert.equal(record.payload.properties['date:Day:start'], '2026-10-08');
  assert.equal(input.properties['date:Date:start'], '2026-10-08T16:50:05.987+02:00');
  const expected = log.expected(record); const proof = evidence(record, expected);
  const wrongMinute = { ...proof, fetched_properties: { ...proof.fetched_properties, 'date:Date:start': '2026-10-08 14:51:00Z' } };
  assert.throws(() => log.ack(TASK, wrongMinute), /properties/);
  proof.fetched_properties['date:Date:start'] = '2026-10-08 14:50:00Z';
  assert.equal(log.ack(TASK, proof).sync_state, 'synced');
  assert.throws(() => log.stage(TASK, { ...input, properties: { ...input.properties, 'date:Date:start': 'invalid timestamp' } }), /valid timestamp/);
  assert.throws(() => log.stage(TASK, { ...input, properties: { ...input.properties, 'date:Date:start': '2026-10-08T14:50:00' } }), /explicit timezone/);
});

test('free saved-view lookup scans active and archived pages and incomplete scans cannot acknowledge uniqueness', t => {
  const { directory, log } = fixture(t);
  log.new(PAYLOAD, TASK);
  fs.writeFileSync(path.join(directory, '.codex', 'activity-log.json'), JSON.stringify({ ...CONFIG, view_url: VIEW }));
  const withView = new ActivityLog(directory);
  const request = withView.request(TASK);
  assert.equal(request.lookup.data.mode, 'view');
  assert.equal(request.lookup.data.is_archived, false);
  assert.equal(request.lookup.archived.data.is_archived, true);
  assert.equal(request.lookup.verify_view.require_no_filters, true);
  assert.equal(request.lookup.verify_view.require_no_quick_filters, true);
  assert.equal(request.lookup.verify_view.expected_data_source_id, DATA_SOURCE);
  assert.equal(request.lookup.requires_complete_collection, true);
  assert.match(request.lookup.pagination, /next_cursor/);
  const record = withView.read(TASK); const proof = evidence(record, withView.expected(record));
  assert.throws(() => withView.ack(TASK, proof), /complete active plus archived/);
  const completeLookup = { mode: 'view', view_url: VIEW, verified_data_source_id: DATA_SOURCE,
    view_unfiltered: true, active_complete: true, archived_complete: true };
  assert.throws(() => withView.ack(TASK, { ...proof, lookup: { ...completeLookup, archived_complete: false } }), /partial scans/);
  assert.throws(() => withView.ack(TASK, { ...proof, lookup: { ...completeLookup, view_unfiltered: false } }), /unfiltered/);
  assert.throws(() => withView.ack(TASK, { ...proof, lookup: { ...completeLookup, verified_data_source_id: PAGE } }), /unfiltered/);
  assert.equal(withView.ack(TASK, { ...proof, lookup: completeLookup }).sync_state, 'synced');
});

test('one Markdown bracket-escape layer in fetched titles is accepted without hiding title mismatches', t => {
  const { log } = fixture(t);
  const record = log.new(PAYLOAD, TASK); const expected = log.expected(record);
  const proof = evidence(record, expected);
  const escapedTitle = expected.properties.Task.replace('[', '\\[').replace(']', '\\]');
  assert.ok(matchesTaskToken(escapedTitle, TASK));
  assert.ok(!matchesTaskToken(escapedTitle, PAGE));
  const wrongTitle = { ...proof, fetched_properties: { ...proof.fetched_properties, Task: escapedTitle.replace('Verify progress logging', 'Wrong task') } };
  assert.throws(() => log.ack(TASK, wrongTitle), /properties/);
  const doubleEscaped = { ...proof, fetched_properties: { ...proof.fetched_properties, Task: escapedTitle.replace(/\\/g, '\\\\') } };
  assert.throws(() => log.ack(TASK, doubleEscaped), /properties/);
  assert.equal(log.ack(TASK, { ...proof, fetched_properties: { ...proof.fetched_properties, Task: escapedTitle } }).sync_state, 'synced');
});

test('privacy review is mandatory and common secrets are rejected before any queue file is written', t => {
  const { log } = fixture(t);
  assert.throws(() => log.new({ ...PAYLOAD, privacy_attestation: false }, TASK), /privacy_attestation/);
  assert.throws(() => log.new({ ...PAYLOAD, body: 'Credential example sk-' + 'x'.repeat(24) }, TASK), /credential/);
  assert.throws(() => secretGuard({ access_token: 'redacted' }), /Credential-shaped/);
  assert.throws(() => secretGuard('https://example.com/path?access_token=redacted'), /credential/);
  assert.throws(() => secretGuard('eyJ' + 'x'.repeat(20) + '.' + 'y'.repeat(20) + '.' + 'z'.repeat(20)), /credential/);
  assert.equal(log.list().entries.length, 0);
});

test('malformed input and failure messages do not disclose input secrets; CLI exports only deliberate requests', t => {
  const { directory, log } = fixture(t);
  const malformed = path.join(directory, 'malformed.json');
  const privateText = 'PRIVATE_CUSTOMER_EXAMPLE_' + 'x'.repeat(20);
  fs.writeFileSync(malformed, '{}' + privateText);
  const bad = runCli(['--project', directory, 'new', '--input', malformed]);
  assert.equal(bad.status, 1);
  assert.ok(!bad.stderr.includes(privateText));
  log.new(PAYLOAD, TASK);
  const listed = runCli(['--project', directory, 'list']);
  assert.equal(listed.status, 0);
  assert.equal(JSON.parse(listed.stdout).pending_count, 1);
  assert.ok(!listed.stdout.includes(PAYLOAD.body));
  assert.throws(() => log.fail(TASK, 'Authorization: Bearer ' + 'x'.repeat(30), true), /credential/);
});

test('invalid UUIDs cannot escape the outbox and concurrent local writers fail explicitly', t => {
  const { log } = fixture(t);
  assert.throws(() => log.new(PAYLOAD, '../escape'), /stable UUID/);
  log.new(PAYLOAD, TASK);
  fs.writeFileSync(log.filename(TASK) + '.lock', 'test local lock');
  assert.throws(() => log.stage(TASK, PAYLOAD), /locked/);
  fs.unlinkSync(log.filename(TASK) + '.lock');
  assert.equal(log.stage(TASK, PAYLOAD).revision, 1);
});
