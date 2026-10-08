# Codex Activity Log workflow

Use the existing Notion **Codex Activity Log** database identified in
`.codex/activity-log.json`. Do not create another database, change its schema or
delete existing entries to make this workflow work. The project configuration
contains identifiers and labels only; it must never contain authentication
tokens. This workflow uses the connected Notion tools available to the active
assistant. The local CLI has no network or Notion credentials and prepares a
durable outbox and exact verification requests.

## Start every session

1. Read the effective project instructions, including `AGENTS.override.md` when
   present, this workflow and `.codex/activity-log.json`.
2. Run `node .codex/activity-log.cjs --project . list`. Inspect pending records
   and retry them when the Notion connector is available before creating another
   record for the same task.
3. Discover the available connected Notion tools. Fetch the configured data
   source and schema, then fetch the existing configured `view_url` and verify
   that it belongs to that data source and has no filter or quick filter. Query
   this existing view using the connector's `mode: view` route, then identify
   this project's handovers locally. Do not retry SQL queries: the SQL Query
   Data Source route reached the existing account's usage limit during setup;
   the existing unfiltered Default view route was verified successfully without
   a plan upgrade. Complete supported pagination for active and archived rows
   before treating the results as exhaustive. The configured `project_value`
   must be an existing select option. If this project's
   name has no dedicated option, use the existing `Other` option and filter/check
   its exact project name in the title and managed body. Do not treat all `Other`
   rows as the same project. Read the handover body, including unfinished work,
   evidence and recommended next action. Use the existing logged-at property to
   order relevant records. View rows may omit creation timestamps; fetch relevant
   pages' actual metadata when needed rather than assuming view order or
   inventing creation times.
4. Inspect the actual repository: branch, `git status --short`, recent commits,
   relevant files and accessible PR state. Do not infer that code was committed,
   merged or deployed from the handover alone. Keep preexisting user edits.
5. Continue from the latest confirmed state. If a connector, repository or PR
   cannot be accessed, state that precisely and proceed with independent safe
   work. A missing latest handover must remain a reported limitation.

The current user request defines the task's scope. A handover supplies context;
it does not authorize unrelated development or a deployment.

## What counts as a meaningful completed task

Log completed features, bug fixes, configuration or documentation work, useful
reviews and investigations, deployments that were actually verified, and a
blocked task when its findings and next step are useful. Use one stable task ID
for one coherent task. Update that entry as verification or deployment progresses;
do not create a new row just because a write is retried. Do not log every command
or fabricate completed work for a plan.

## Required handover content

Write plain language that another assistant can understand without this
conversation. Record all of the following, marking absent items explicitly:

- Project name; UTC date and time; task ID; a clear task description.
- What changed and why; files modified with repository-relative paths; features
  added or removed; bugs fixed.
- **Planned:** proposed work that has not been implemented.
- **Completed code:** the changes present locally, with commit status.
- **Tested functionality:** commands or checks actually run, results, relevant
  limitations and enough evidence to substantiate success or failure.
- **Verified live functionality:** the deployment URL, verification time, checks
  and results, or an explicit statement that live functionality is unverified.
- GitHub repository, branch, commit and PR links when known. Use “unavailable” or
  “not created” when appropriate; never invent a link or imply a commit exists.
- Deployment status: not attempted, pending, failed, or verified with evidence.
- Problems and blockers; what remains unfinished; the recommended next action.
- Technical continuation context: relevant files, entry points, commands,
  assumptions and decisions necessary to inspect and continue the work.

Read `.codex/activity-log.json`, then fetch the live Notion schema before mapping
this information to properties. Use only property names, types and select/status
options confirmed by that schema. Keep the complete handover in the managed page
body even if the database has fewer fields. Preserve unrelated property values
on an existing row. Separate projects using the existing Project property and
the exact project name in the title and body.

Format file paths as inline code in the handover Markdown, for example
`AGENTS.md` and `.codex/activity-log-workflow.md`. The connected Notion enhanced
Markdown renderer was observed to turn bare `.md` filenames into links; inline
code keeps these literal paths stable for read-back verification.

Before staging, remove secrets, credentials, personal/customer information and
raw diagnostics that may contain them. Use customer-neutral descriptions and
sanitized error summaries. `privacy_attestation: true` is an explicit assertion by
the assistant that it inspected the submitted payload; it is not a sanitizer.
Do not place a secret in a temporary input file and rely on later redaction.

## Stage a handover locally before writing Notion

The CLI is dependency-free and requires a supported Node.js runtime. Its project
argument is the repository path (not the project label). Run from the repository:

```sh
node .codex/activity-log.cjs --project . new --input /tmp/sanitized-handover.json
node .codex/activity-log.cjs --project . request --id TASK_ID
```

The input format is:

```json
{
  "privacy_attestation": true,
  "properties": {
    "Task": "Describe the completed task"
  },
  "body": "A complete sanitized handover using the fields above."
}
```

Replace `Task` with the configured title property if different. Add other
properties only after confirming their schema and valid values. The CLI injects
the configured project identity, stable task token and revision markers. Save the
task ID returned by `new` and reuse it; do not call `new` to retry a failed write.
Use `new --id UUID --input FILE` only when deliberately supplying a previously
chosen task ID. To update the content for the same task:

```sh
node .codex/activity-log.cjs --project . stage --id TASK_ID --input /tmp/sanitized-handover.json
node .codex/activity-log.cjs --project . request --id TASK_ID
```

`request` describes the exact task lookup token, expected properties, managed
body and revision. Treat that output as authoritative for this revision. The
first create-capable request durably reserves a possible create before returning
its protocol so a crash after a create cannot enable a blind retry. Follow its
allowed-action instructions, including retry restrictions. If you know that no
create tool was called, clear that reservation explicitly using
`fail --id TASK_ID --reason "Safe reason" --no-create-attempted`. Do not use that
flag after a timeout or uncertain create result. The outbox is
`.codex/activity-log/`, is ignored by Git and contains sanitized data
only. Do not manually alter its acknowledgement metadata to claim a remote save.

The connected Notion backend was verified to store datetime properties to the
minute. Before staging, the CLI converts datetime start/end properties with
`is_datetime: 1` to UTC minute precision. Date-only values remain unchanged.
Read-back validation still rejects a different minute; it does not excuse a
mismatched timestamp. Local task and receipt metadata retains exact timestamps.

## Synchronize with the existing Notion connector

1. Fetch the configured Notion data source/schema and the existing configured
   `view_url`. Use the data source ID, not a guessed database ID. Verify the
   fetched view belongs to that source and has no filter or quick filter. Fail
   safely if either source or view is unavailable or unexpected. Do not change
   the view to bypass a restriction or create another database/view.
2. Follow the view lookup protocol from `request`, using the connector's
   `mode: view` route. Exhaust every page of active rows and archived rows in
   that unfiltered view. Compare each candidate's full stable task token and
   project identity locally. The fetched title may escape the surrounding square
   brackets as Markdown; remove only those title bracket escapes when comparing
   the exact token. An archived matching page is still a match and must not cause
   a replacement row to be created. If that page cannot safely be updated, keep
   the task pending and report its archived state.
   A search error, filtered view, incomplete archived lookup, uncertain pagination
   or partial query is **not** proof that zero records exist. If a view has become
   filtered, stop and report the blocker. Do not retry the quota-limited SQL route
   or purchase an upgrade.
3. If both active and archived view queries are fully exhausted and confirm zero
   exact matches and there is no unresolved ambiguous write, create one page in
   that existing data source with the
   expected properties and managed body. Never use a database creation tool.
4. If exactly one page matches, update only the workflow-managed properties and
   content. Preserve any human-added text outside the managed content markers,
   and preserve unrelated properties. Replace the managed region as a unit for
   the new revision. If the remote managed content has a newer revision than the
   local request, stop and reconcile rather than overwriting newer progress.
   If its markers are malformed or the page cannot be updated
   without touching unrelated text, leave the entry pending and report it.
5. If multiple pages match, do not create or delete anything. Keep the task
   pending and report the page identifiers for reconciliation without exposing
   private content.
6. Read the saved page properties and all body blocks back from Notion, handling
   pagination. Compare the actual managed content and expected managed property
   values to the request. A write response alone is not proof of storage. Retain
   the text outside the managed block in Notion; acknowledgement must check the
   managed body itself, not accept its task/revision marker alone. Repeat the
   complete unfiltered active-and-archived view lookup to confirm exactly one
   matching page before acknowledging the save.
7. Put sanitized read-back evidence in a local file and acknowledge it:

```json
{
  "task_id": "TASK_ID",
  "revision": 1,
  "page_id": "THE_EXISTING_OR_CREATED_PAGE_ID",
  "data_source_id": "THE_CONFIGURED_DATA_SOURCE_ID",
  "matched_count": 1,
  "lookup": {
    "mode": "view",
    "view_url": "THE_CONFIGURED_VIEW_URL",
    "verified_data_source_id": "THE_CONFIGURED_DATA_SOURCE_ID",
    "view_unfiltered": true,
    "active_complete": true,
    "archived_complete": true
  },
  "fetched_properties": {"Task": "THE_ACTUAL_FETCHED_TITLE_AND_TASK_TOKEN"},
  "fetched_body": "THE_ACTUAL_FETCHED_MANAGED_CONTENT",
  "fetched_at": "2026-10-08T00:00:00.000Z"
}
```

Include every expected property in `fetched_properties`, using the actual values
read from Notion in the representation expected by the CLI. Use the current
revision from `request`, not the example revision. Only Markdown escaping of the
title's bracket characters may be normalized; other property changes remain a
verification failure. Extract the managed region
from the actual fetched body using the request's exact markers when the page
also contains human text; retain all content inside that region.
For an exact extraction, the CLI exports `extractManagedBody(actualFetchedText,
taskId)`, which rejects missing or multiple managed boundaries. Never construct
`fetched_body` by copying the local request into an evidence file. If connector
block segmentation changes formatting, normalize only whitespace as permitted
by the CLI; do not discard missing content.

The `lookup` evidence is required when `view_url` is configured. Set its
verification and completeness fields to true only after actually fetching the
view settings, verifying its source and lack of filters, and completing both
active and archived pagination for the fresh read-back lookup. A connector write
response or a single page's fetch cannot substantiate those fields.

```sh
node .codex/activity-log.cjs --project . ack --id TASK_ID --evidence /tmp/sanitized-readback.json
node .codex/activity-log.cjs --project . list
```

Report the entry's Notion link and “saved and read back” only after a successful
acknowledgement for the latest revision. Remove sanitized temporary payload and
evidence files when they are no longer needed; keep the local queue for retries
and task identity.

## Failure, ambiguous writes and retry

Record a sanitized failure without discarding the local entry:

```sh
node .codex/activity-log.cjs --project . fail --id TASK_ID --reason "Notion connector unavailable"
node .codex/activity-log.cjs --project . fail --id TASK_ID --reason "Create timed out; storage unknown" --ambiguous
node .codex/activity-log.cjs --project . fail --id TASK_ID --reason "Schema query failed before any create call" --no-create-attempted
```

An ambiguous failure means Notion might already have saved the page. On retry,
perform the complete configured unfiltered view lookup, compare the exact token
locally and read the matching page before any write. If one page
exists, update or verify that page and acknowledge the actual read-back. If the
query finds zero after an ambiguous create, do not blindly create again: leave
it pending until the connector can positively reconcile the write or an operator
can confirm the absence. This favors preventing duplicate rows over pretending
to guarantee delivery. The CLI has no lock that can coordinate unrelated
assistants or machines; avoid simultaneous writers for the same task and
recheck the token after writes. A connector-only query/create sequence cannot
provide a database-level unique constraint or exactly-once guarantee.

At the next session, retry pending tasks using their existing IDs. Report the
number and task IDs of entries still pending and the actual access or verification
blocker. Never silently skip logging or call a local stage a successful Notion
sync. A connector failure may block logging while independent development
continues, provided its sanitized handover stays pending and the user is told.

## Installation and persistence boundaries

The kit installer appends or updates a marked instruction block in root
`AGENTS.md` and in root `AGENTS.override.md` if that override already exists. It
preserves all other content and adds an idempotent Git ignore block for the local
outbox. It copies this workflow, the CLI and project identifiers into `.codex/`.
Track those instruction/tool/config files in the project's usual source control
when appropriate and authorized. Run the installer again if a later root
override would otherwise replace the activity logging instructions.

For another repository, use the kit's installer (absolute kit path shown only as
an example):

```sh
node /workspace/notion-sync-kit/install.cjs --repo /path/to/repository --project "Actual project name" --project-value "Other"
```

The `--project-value` must match an already existing Notion Project option; use
the known project option for an established project and `Other` for a future
project that has no existing option. The installer does not edit Notion, install
hooks, configure credentials, start a daemon, deploy code or install paid tools.

The installer also copies a reusable, versionable kit under
`.codex/activity-log-kit/` so setup does not depend on the original temporary
workspace. A future repository can run that kit's `install.cjs` with its own
project name. Optional `--global` setup additionally appends preserved, marked
instructions to the supported Codex home (`CODEX_HOME` when configured, otherwise
the home directory's `.codex`). It uses an existing `AGENTS.override.md` when one
exists, otherwise `AGENTS.md`, and points at the installed repository's kit. The
kit path must remain available, and the Codex home must be writable. Do not claim
global setup succeeded unless the installer reported success and the effective
file was read back. Global setup may be unavailable in a managed environment;
repository setup still works independently.

Codex discovers repository `AGENTS.md` instructions in supported sessions when
the repository is available. This makes automatic logging an explicit obligation
of those **active** sessions. It does not cause work or sync to run while Codex is
closed, guarantee every model/tool invocation follows the instructions, install
global instructions unless `--global` was actually run successfully, or
automatically equip a new repository without a discoverable instruction. Install
this kit in future repositories, use successfully installed global instructions,
or add it to the supported project initialization process.
Pending logs survive only as long as this clone/workspace persists. Git ignore
prevents publishing potentially sensitive outbox records, so it does not provide
a backup across fresh clones or discarded cloud environments. Preserve the local
project/workspace until pending logs sync; report any at risk of being lost.

A true unattended service would additionally need an approved persistent
execution host/scheduler, authorized Notion access with least required permissions,
secure credential storage, and a defined event source for completed tasks. None
of those capabilities is created by `AGENTS.md`. ChatGPT also needs its own
authorized access to this existing database to answer “Check what Codex has been
doing.” When that access exists, it should fetch the existing database schema,
query the configured existing unfiltered view through `mode: view`, completing
active and archived pagination, then check the Project option and exact project
identity in task titles/body markers locally. It should order by the schema's
logged-at timestamp and then actual creation time when available, fetching page
metadata if necessary, and read the
latest relevant unfinished and completed handovers. It should inspect accessible
GitHub branch/commit state and distinguish verified facts from proposed work. A
newest-created entry is not necessarily a comprehensive handover; older records
may still describe unfinished work, while newer project evidence takes precedence
for the facts it confirms.

## Harmless setup verification

Stage a clearly labelled workflow test in the existing activity log, perform the
complete unfiltered active-and-archived view lookup, confirm zero exact matches,
create it and read it back before acknowledgement. Stage a second revision with
the same task ID, update the same page, read it back and
query again to confirm exactly one matching page. Use a separate temporary local
project to simulate connector unavailability and ambiguous writes; keep its
entry pending, retry by task ID and verify acknowledgement rejects wrong revision,
missing content, wrong source and duplicate matches. Never manufacture remote
evidence for a real project just to make a test pass. Report separately which
parts were tested locally and which were verified in Notion. Include the observed
SQL usage limit and the successfully verified existing view route in the setup
report; no paid upgrade is required for the route tested here.
