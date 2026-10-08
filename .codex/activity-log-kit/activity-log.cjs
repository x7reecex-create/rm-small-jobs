#!/usr/bin/env node
'use strict';

// Local durable outbox only. An authenticated agent performs connector requests.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION = 1;
const usage = `Usage: node .codex/activity-log.cjs [--project DIR] COMMAND [options]
  new --input FILE [--id UUID]       Persist a new reviewed handover
  stage --id UUID --input FILE       Revise that same logical task
  request --id UUID                  Persist attempt and print connector protocol
  fail --id UUID --reason TEXT [--ambiguous|--no-create-attempted]
                                    Keep failed writes pending; explicit no-create proof permits retry
  ack --id UUID --evidence FILE      Verify actual fetched properties and full body
  list                              List pending and saved entries
Payload: {privacy_attestation:true, properties:{Task:"base title",...}, body:"Markdown"}.
No command connects to Notion, starts a service, or reads credentials.`;

function assert(condition, message) { if (!condition) throw new Error(message); }
function isObject(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (isObject(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function digest(value) { return crypto.createHash('sha256').update(canonical(value)).digest('hex'); }
function now() { return new Date().toISOString(); }
function readJson(filename) { return JSON.parse(fs.readFileSync(filename, 'utf8')); }
function atomicWrite(filename, content) {
  fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = filename + '.tmp-' + crypto.randomUUID();
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, content, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor); descriptor = undefined;
    fs.renameSync(temporary, filename);
    const directory = fs.openSync(path.dirname(filename), 'r');
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
function secretGuard(value) {
  // Deliberately conservative pattern guard; human privacy review remains mandatory.
  const sensitiveKey = /^(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|authorization|private[_-]?key)$/i;
  const patterns = [
    /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/i,
    /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9_]{16,}|github_pat_[A-Za-z0-9_]{16,}|ntn_[A-Za-z0-9]{16,}|AKIA[A-Z0-9]{16})\b/,
    /\bBearer\s+[A-Za-z0-9._~+\/-]{12,}={0,2}/i,
    /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/,
    /(?:password|passwd|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret)\s*[=:]\s*["']?[^\s"'<>]{6,}/i,
    /https?:\/\/[^\s/@]+:[^\s/@]+@/i,
    /[?&](?:token|api_key|access_token|secret|signature|x-amz-signature)=[^&\s]+/i,
  ];
  function inspect(item) {
    if (typeof item === 'string') assert(!patterns.some(p => p.test(item)), 'Possible credential detected; redact before storing or sending this entry.');
    else if (Array.isArray(item)) item.forEach(inspect);
    else if (isObject(item)) {
      for (const [key, child] of Object.entries(item)) {
        assert(!sensitiveKey.test(key), 'Credential-shaped field detected; redact before storing this entry.');
        inspect(child);
      }
    }
  }
  inspect(value);
}
function normalizeBody(value) {
  assert(typeof value === 'string', 'Fetched body must be a string.');
  // Fetch may normalize line endings, trailing space and blank-line spacing.
  // Keep every non-whitespace character and its order; marker-only proof fails.
  return value.replace(/\r\n?/g, '\n').replace(/\s+/g, ' ').trim();
}
function quoteIdentifier(value) { return '"' + value.replace(/"/g, '""') + '"'; }
function extractManagedBody(content, taskId) {
  assert(UUID.test(taskId || ''), 'Use a valid stable task UUID.');
  assert(typeof content === 'string', 'Fetched page content must be a string.');
  const start = 'Codex handover begins: codex-task:' + taskId.toLowerCase();
  const end = 'Codex handover ends: codex-task:' + taskId.toLowerCase();
  const first = content.indexOf(start);
  const last = content.indexOf(end);
  assert(first >= 0 && last > first && content.indexOf(start, first + start.length) === -1 && content.indexOf(end, last + end.length) === -1, 'Fetched page must contain exactly one complete bounded handover.');
  return content.slice(first, last + end.length);
}
function propertyMatches(key, expected, fetched, properties) {
  if (/^date:.*:(?:start|end)$/.test(key)) {
    const dateName = key.replace(/:(?:start|end)$/, ':is_datetime');
    if (properties[dateName] === 1 && typeof expected === 'string' && typeof fetched === 'string') {
      const expectedTime = Date.parse(expected); const fetchedTime = Date.parse(fetched);
      return Number.isFinite(expectedTime) && expectedTime === fetchedTime;
    }
  }
  return canonical(expected) === canonical(fetched);
}
function normalizeTitleBrackets(value) {
  return typeof value === 'string' ? value.replace(/\\([\[\]])/g, '$1') : value;
}
function matchesTaskToken(title, taskId) {
  assert(UUID.test(taskId || ''), 'Use a valid stable task UUID.');
  const normalized = normalizeTitleBrackets(title);
  return typeof normalized === 'string' && normalized.includes('[codex-task:' + taskId.toLowerCase() + ']');
}

class ActivityLog {
  constructor(projectDirectory) {
    this.projectDirectory = path.resolve(projectDirectory);
    this.config = readJson(path.join(this.projectDirectory, '.codex', 'activity-log.json'));
    const c = this.config;
    assert(c.version === VERSION, 'Unsupported activity-log configuration version.');
    assert(typeof c.project_name === 'string' && c.project_name.trim(), 'Config needs project_name.');
    assert(UUID.test(c.data_source_id || ''), 'Config needs a valid data_source_id from the existing database.');
    assert(typeof c.title_property === 'string' && c.title_property.trim(), 'Config needs the existing title_property.');
    assert(typeof c.project_property === 'string' && c.project_property.trim(), 'Config needs the existing project_property.');
    assert(typeof c.project_value === 'string' && c.project_value.trim(), 'Config needs an existing project_value.');
    assert(c.transport === 'notion-connector', 'Only the existing notion-connector agent transport is supported.');
    assert(c.view_url === undefined || (typeof c.view_url === 'string' && /^view:\/\//.test(c.view_url) && UUID.test(c.view_url.slice(7))), 'Optional view_url must identify the verified existing unfiltered saved view.');
    secretGuard(c);
    this.stateDirectory = path.join(this.projectDirectory, '.codex', 'activity-log');
    this.outboxDirectory = path.join(this.stateDirectory, 'outbox');
    fs.mkdirSync(this.outboxDirectory, { recursive: true, mode: 0o700 });
  }
  filename(taskId) {
    assert(UUID.test(taskId || ''), 'Use the stable UUID printed by new.');
    return path.join(this.outboxDirectory, taskId.toLowerCase() + '.json');
  }
  read(taskId) {
    const record = readJson(this.filename(taskId));
    assert(record.version === VERSION && record.task_id === taskId.toLowerCase(), 'Outbox identity/version mismatch.');
    assert(record.project_name === this.config.project_name && record.data_source_id === this.config.data_source_id.toLowerCase(), 'Outbox destination differs from current config; reconcile before changing destinations.');
    assert(Number.isInteger(record.revision) && record.revision >= 1 && ['pending', 'synced'].includes(record.sync_state), 'Outbox revision/status is invalid.');
    assert(typeof record.ambiguous_create === 'boolean' && Number.isInteger(record.attempts) && record.attempts >= 0, 'Outbox attempt state is invalid.');
    assert(record.remote_page_id === null || UUID.test(record.remote_page_id), 'Outbox page identity is invalid.');
    // Existing queue revisions retain their exact original request. Normalize only
    // new/staged input; an old second-precision request must not silently change.
    assert(canonical(this.payload(record.payload, record.task_id, false)) === canonical(record.payload), 'Outbox payload no longer matches its reviewed shape.');
    secretGuard(record);
    return record;
  }
  save(record) { atomicWrite(this.filename(record.task_id), JSON.stringify(record, null, 2) + '\n'); }
  withLock(taskId, action) {
    const lock = this.filename(taskId) + '.lock';
    let descriptor;
    try { descriptor = fs.openSync(lock, 'wx', 0o600); }
    catch (error) {
      if (error.code === 'EEXIST') throw new Error('This task is locked by another local writer. Inspect the lock after a crashed process before removing it.');
      throw error;
    }
    try { return action(); } finally { fs.closeSync(descriptor); fs.unlinkSync(lock); }
  }
  payload(input, taskId, normalizeDates = true) {
    assert(isObject(input) && input.privacy_attestation === true, 'privacy_attestation:true is mandatory after reviewing secrets and private customer information.');
    assert(isObject(input.properties), 'Payload needs properties copied from the existing schema.');
    assert(typeof input.body === 'string' && input.body.trim(), 'Payload needs a complete body handover.');
    assert(Buffer.byteLength(input.body, 'utf8') <= 100000, 'Keep handovers below 100000 UTF-8 bytes.');
    const title = input.properties[this.config.title_property];
    assert(typeof title === 'string' && title.trim(), 'Payload must include the configured title property.');
    assert(!/\[codex-task:/i.test(title) && !/codex-task:/i.test(input.body), 'Supply a base title/body; the CLI owns the stable task token.');
    const suppliedProject = input.properties[this.config.project_property];
    assert(suppliedProject === undefined || suppliedProject === this.config.project_value, 'Project property must use the configured existing option.');
    for (const value of Object.values(input.properties)) {
      assert(value === null || typeof value === 'string' || typeof value === 'number' || (Array.isArray(value) && value.every(v => typeof v === 'string')), 'Properties must use connector SQLite values.');
      assert(typeof value !== 'number' || Number.isFinite(value), 'Numeric properties must be finite.');
    }
    const result = {
      privacy_attestation: true,
      properties: { ...input.properties, [this.config.project_property]: this.config.project_value },
      body: input.body.trim(),
    };
    for (const [key, value] of Object.entries(result.properties)) {
      if (!/^date:.*:(?:start|end)$/.test(key) || value === null) continue;
      const datetimeKey = key.replace(/:(?:start|end)$/, ':is_datetime');
      if (result.properties[datetimeKey] !== 1) continue;
      assert(typeof value === 'string' && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value), 'Datetime properties need a valid timestamp with an explicit timezone.');
      const timestamp = Date.parse(value);
      assert(Number.isFinite(timestamp), 'Datetime properties need a valid timestamp.');
      if (normalizeDates) {
        // The connected Notion backend was verified to store datetime values at
        // minute precision. Normalize BEFORE exporting, never weaken receipts.
        const date = new Date(timestamp); date.setUTCSeconds(0, 0);
        result.properties[key] = date.toISOString().replace('.000Z', 'Z');
      }
    }
    secretGuard(result);
    return result;
  }
  expected(record) {
    const token = 'codex-task:' + record.task_id;
    const baseTitle = record.payload.properties[this.config.title_property].trim();
    const projectTitle = baseTitle.startsWith(this.config.project_name + ':') ? baseTitle : this.config.project_name + ': ' + baseTitle;
    return {
      properties: { ...record.payload.properties, [this.config.title_property]: projectTitle + ' [' + token + ']' },
      body: 'Codex handover begins: ' + token + '\n\nProject: ' + this.config.project_name + '\n\nTask ID: ' + token + '\n\nLog revision: ' + record.revision + '\n\n' + record.payload.body + '\n\nCodex handover ends: ' + token,
    };
  }
  handover(record) {
    const expected = this.expected(record);
    const text = '# Latest Codex handover — ' + this.config.project_name + '\n\n' +
      'Task ID: ' + record.task_id + '\n\nRevision: ' + record.revision + '\n\n' +
      'Notion sync: ' + record.sync_state + '\n\nUpdated: ' + record.updated_at + '\n\n' +
      (record.remote_page_url ? 'Notion record: ' + record.remote_page_url + '\n\n' : '') + expected.body + '\n';
    atomicWrite(path.join(this.stateDirectory, 'latest-handover.md'), text);
  }
  new(input, suppliedId) {
    const id = (suppliedId || crypto.randomUUID()).toLowerCase();
    this.filename(id);
    return this.withLock(id, () => {
      const payload = this.payload(input, id);
      if (fs.existsSync(this.filename(id))) {
        const existing = this.read(id);
        assert(canonical(existing.payload) === canonical(payload), 'Task already exists with different content; use stage to revise the same entry.');
        return existing;
      }
      const timestamp = now();
      const record = {
        version: VERSION, task_id: id, project_name: this.config.project_name,
        data_source_id: this.config.data_source_id.toLowerCase(), revision: 1,
        created_at: timestamp, updated_at: timestamp, sync_state: 'pending',
        payload, attempts: 0, ambiguous_create: false, remote_page_id: null, remote_page_url: null,
        last_error: null, receipt: null,
      };
      this.save(record); this.handover(record); return record;
    });
  }
  stage(taskId, input) {
    return this.withLock(taskId, () => {
      const record = this.read(taskId);
      const payload = this.payload(input, record.task_id);
      if (canonical(record.payload) === canonical(payload)) return record;
      record.payload = payload; record.revision += 1; record.updated_at = now();
      record.sync_state = 'pending'; record.last_error = null; record.receipt = null;
      this.save(record); this.handover(record); return record;
    });
  }
  request(taskId) {
    return this.withLock(taskId, () => {
      const record = this.read(taskId);
      const expected = this.expected(record);
      const token = 'codex-task:' + record.task_id;
      if (record.sync_state === 'synced') return { task_id: record.task_id, revision: record.revision, sync_state: 'synced', remote_page_url: record.remote_page_url, action: 'none' };
      record.attempts += 1;
      record.last_requested_at = now();
      record.sync_state = 'pending';
      // Reserve the potentially non-idempotent create before printing its protocol.
      // A crash after a connector call must never enable another blind create.
      const priorAmbiguity = record.ambiguous_create;
      if (!record.remote_page_id) record.ambiguous_create = true;
      this.save(record);
      const table = quoteIdentifier('collection://' + record.data_source_id);
      const lookup = this.config.view_url ? {
        tool: 'notion_query_data_sources',
        verify_view: {
          tool: 'notion_fetch', id: this.config.view_url,
          expected_data_source_id: record.data_source_id,
          require_no_filters: true, require_no_quick_filters: true,
        },
        data: { mode: 'view', view_url: this.config.view_url, page_size: 100, is_archived: false },
        archived: { tool: 'notion_query_data_sources', data: { mode: 'view', view_url: this.config.view_url, page_size: 100, is_archived: true } },
        pagination: 'For each active/archived scan, while has_more is true, pass next_cursor as start_cursor with the same view_url and is_archived. Read every page before declaring count or zero matches.',
        local_match: { title_property: this.config.title_property, token: '[' + token + ']', normalize: 'One Markdown bracket-unescape round only; export matchesTaskToken is available.' },
        requires_complete_collection: true,
      } : {
        tool: 'notion_query_data_sources',
        data: { mode: 'sql', data_source_urls: ['collection://' + record.data_source_id],
          query: 'SELECT * FROM ' + table + ' WHERE ' + quoteIdentifier(this.config.title_property) + ' LIKE ?',
          params: ['%[' + token + ']%'] },
      };
      return {
        version: VERSION, task_id: record.task_id, revision: record.revision,
        request_hash: digest(expected), sync_state: 'pending', transport: 'notion-connector',
        lookup,
        rules: [
          'Run the exact token lookup before any mutation. A failed or incomplete lookup never authorizes create.',
          ...(this.config.view_url ? ['Verify the saved view belongs to the expected datasource and has no filters or quick filters. Scan every active and archived page, preserving is_archived during pagination. Match stable tokens locally; partial scans never prove absence or uniqueness.'] : []),
          'Zero matches: create only when create.allowed_after_successful_zero_match is true. Otherwise reconcile the uncertain previous attempt and keep pending.',
          'One match: fetch it, verify task token and destination, then update that same page. More than one match: report duplicates and keep pending.',
          'If the remote handover has a newer revision, stop and reconcile; never overwrite newer progress.',
          'After a connector write, fetch the same page; acknowledge only its full expected properties/body and a fresh exact token lookup count of one.',
          'Never retry a create after a timeout without reconciliation. Do not overwrite content outside the agent-owned handover.',
        ],
        create: {
          allowed_after_successful_zero_match: !priorAmbiguity && !record.remote_page_id,
          tool: 'notion_notion_create_pages',
          args: { allow_async: false, parent: { data_source_id: record.data_source_id }, pages: [{ properties: expected.properties, content: expected.body }] },
        },
        update: {
          remote_page_id: record.remote_page_id, requires_fetched_matching_page: true,
          properties_tool: 'notion_notion_update_page', properties_args: { allow_async: false, command: 'update_properties', properties: expected.properties },
          content_tool: 'notion_notion_update_page', content_args: { allow_async: false, command: 'update_content', content_updates: [{ old_str: 'REPLACE_WITH_EXACT_FETCHED_AGENT_HANDOVER', new_str: expected.body }] },
        },
        readback_expected: { task_id: record.task_id, revision: record.revision, data_source_id: record.data_source_id, matched_count: 1, ...expected },
      };
    });
  }
  fail(taskId, reason, ambiguous, noCreateAttempted = false) {
    assert(typeof reason === 'string' && reason.trim(), 'A safe failure reason is required.');
    assert(!(ambiguous && noCreateAttempted), 'Choose ambiguous or no-create-attempted, not both.');
    secretGuard(reason);
    return this.withLock(taskId, () => {
      const record = this.read(taskId);
      assert(record.sync_state !== 'synced', 'Saved revision is already verified; stage an edit before marking a new failure.');
      record.sync_state = 'pending'; record.last_error = reason.trim(); record.last_failed_at = now();
      if (ambiguous) record.ambiguous_create = true;
      if (noCreateAttempted && !record.remote_page_id) record.ambiguous_create = false;
      this.save(record); this.handover(record); return record;
    });
  }
  ack(taskId, evidence) {
    return this.withLock(taskId, () => {
      const record = this.read(taskId);
      const expected = this.expected(record);
      assert(isObject(evidence), 'Supply actual fetched read-back evidence as JSON.');
      secretGuard(evidence);
      assert(evidence.task_id === record.task_id && evidence.revision === record.revision, 'Evidence belongs to a different task or stale revision.');
      assert(UUID.test(evidence.page_id || ''), 'Evidence needs the fetched page_id.');
      assert(evidence.data_source_id === record.data_source_id, 'Read-back came from a different database datasource.');
      assert(evidence.matched_count === 1, 'Exactly one remote task-token match must be verified.');
      if (this.config.view_url) {
        const lookup = evidence.lookup;
        assert(isObject(lookup) && lookup.mode === 'view' && lookup.view_url === this.config.view_url && lookup.verified_data_source_id === record.data_source_id && lookup.view_unfiltered === true && lookup.active_complete === true && lookup.archived_complete === true, 'Read-back needs a verified unfiltered view and complete active plus archived lookup; partial scans cannot prove uniqueness.');
      }
      assert(isObject(evidence.fetched_properties), 'Evidence needs actual fetched_properties, not just a hash marker.');
      for (const [key, value] of Object.entries(expected.properties)) {
        const fetched = evidence.fetched_properties[key];
        const titleMatches = key === this.config.title_property && typeof value === 'string' && typeof fetched === 'string' && value === normalizeTitleBrackets(fetched);
        assert(titleMatches || propertyMatches(key, value, fetched, expected.properties), 'Fetched properties do not match the current requested revision.');
      }
      assert(normalizeBody(extractManagedBody(evidence.fetched_body, record.task_id)) === normalizeBody(evidence.fetched_body), 'Supply only the fetched bounded managed handover, preserving human content outside it.');
      assert(normalizeBody(evidence.fetched_body) === normalizeBody(expected.body), 'Fetched full body does not match the current requested revision.');
      const fetchedAt = Date.parse(evidence.fetched_at);
      assert(Number.isFinite(fetchedAt) && fetchedAt >= Date.parse(record.updated_at), 'Read-back timestamp must be valid and newer than the current payload.');
      if (record.remote_page_id) assert(record.remote_page_id === evidence.page_id.toLowerCase(), 'Do not acknowledge a different page for the same task.');
      const pageId = evidence.page_id.toLowerCase();
      record.sync_state = 'synced'; record.ambiguous_create = false;
      record.remote_page_id = pageId; record.remote_page_url = 'https://www.notion.so/' + pageId.replace(/-/g, '');
      record.last_error = null;
      record.receipt = { verified_at: now(), fetched_at: evidence.fetched_at, revision: record.revision, request_hash: digest(expected), matched_count: 1 };
      this.save(record); this.handover(record); return record;
    });
  }
  list() {
    const records = fs.readdirSync(this.outboxDirectory).filter(f => UUID.test(f.replace(/\.json$/, '')) && f.endsWith('.json'))
      .map(filename => this.read(filename.replace(/\.json$/, '')))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
    return {
      project_name: this.config.project_name,
      pending_count: records.filter(r => r.sync_state !== 'synced').length,
      entries: records.map(r => ({ task_id: r.task_id, revision: r.revision, task: r.payload.properties[this.config.title_property], sync_state: r.sync_state, ambiguous_create: r.ambiguous_create, attempts: r.attempts, remote_page_url: r.remote_page_url, last_error: r.last_error })),
    };
  }
}

function parseArguments(args) {
  const options = {}; let command;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument.startsWith('--')) {
      const name = argument.slice(2);
      assert(['project', 'input', 'id', 'evidence', 'reason', 'ambiguous', 'no-create-attempted', 'help'].includes(name), 'Unknown option; run --help.');
      assert(options[name] === undefined, 'Duplicate option; run --help.');
      if (name === 'ambiguous' || name === 'no-create-attempted' || name === 'help') options[name] = true;
      else { assert(args[index + 1] !== undefined && !args[index + 1].startsWith('--'), 'Option needs a value; run --help.'); options[name] = args[++index]; }
    } else { assert(!command, 'Only one command is supported; run --help.'); command = argument; }
  }
  return { command, options };
}
function main(args = process.argv.slice(2)) {
  try {
    const { command, options } = parseArguments(args);
    if (options.help || !command) { process.stdout.write(usage + '\n'); return 0; }
    const log = new ActivityLog(options.project || process.cwd());
    let result;
    switch (command) {
      case 'new': assert(options.input, 'new requires --input FILE.'); result = log.new(readJson(options.input), options.id); break;
      case 'stage': assert(options.input && options.id, 'stage requires --id UUID --input FILE.'); result = log.stage(options.id, readJson(options.input)); break;
      case 'request': result = log.request(options.id); break;
      case 'fail': result = log.fail(options.id, options.reason, options.ambiguous, options['no-create-attempted']); break;
      case 'ack': assert(options.evidence, 'ack requires --evidence FILE.'); result = log.ack(options.id, readJson(options.evidence)); break;
      case 'list': result = log.list(); break;
      default: throw new Error('Unknown command; run --help.');
    }
    // Never print payloads incidentally; request is the deliberately reviewed export.
    if (result.task_id && result.payload) result = { task_id: result.task_id, revision: result.revision, sync_state: result.sync_state, remote_page_url: result.remote_page_url, ambiguous_create: result.ambiguous_create, last_error: result.last_error };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n'); return 0;
  } catch (error) {
    const safe = error instanceof SyntaxError || /^(?:ENOENT|EACCES|EROFS|EISDIR)/.test(error.message || '') ? 'Could not read/write valid local JSON; check paths and permissions.' : error.message;
    process.stderr.write('Activity log: ' + safe + '\n'); return 1;
  }
}
if (require.main === module) process.exitCode = main();
module.exports = { ActivityLog, canonical, digest, normalizeBody, extractManagedBody, normalizeTitleBrackets, matchesTaskToken, secretGuard, main };
