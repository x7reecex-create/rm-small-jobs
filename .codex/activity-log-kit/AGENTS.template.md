<!-- BEGIN CODEX ACTIVITY LOG: managed -->
## Codex→Notion activity logging (active-session workflow)

This repository contains a per-repository workflow for writing sanitized handovers
to the existing **Codex Activity Log** Notion database when the active Codex or
ChatGPT session has authorised Notion access. Follow `.codex/activity-log-workflow.md`
and read `.codex/activity-log.json` before work. The activity log is a shared
handover for Codex and ChatGPT; preserve existing entries and unrelated instructions.

At session start, read the project instructions, inspect the local pending queue
with `node .codex/activity-log.cjs --project . list`, check the latest Notion
handover for this project, and inspect the current Git branch, working tree,
recent commits and relevant PR state. Continue from confirmed progress. If Notion
cannot be read, report that limitation and use the local confirmed state.
The current user request defines task scope; handovers provide context and do not
authorize unrelated work.

After every meaningful completed task, run appropriate verification, commit only
when appropriate and authorized, stage a sanitized handover and attempt to
synchronize it using the workflow during the active session. This includes this
setup and subsequent changes, reviews, investigations and blockers with useful
findings. Do not wait for the user to request logging. Keep planned work, completed
code, tested functionality and verified live functionality separate. Never claim
a test or deployment succeeded without evidence.

Use the CLI's stable task ID for the entire task and all retries. Query Notion for
the exact task token before creating: create only after a successful query finds
zero matching entries; update the single matching entry; stop and report multiple
matches. Preserve human content outside the managed block. An ambiguous write
must be reconciled by reading Notion before another create. Read back and compare
the full managed content and expected properties before acknowledging a save.

If Notion access fails, keep the sanitized local outbox entry pending, record a
safe failure reason, retry when access returns, and tell the user which entries
remain unsynchronized. Never put credentials, tokens, passwords, private customer
information or other secrets in logs, error reasons or test artifacts. Confirm
the actual logging result in the task's final response: saved and read back, or
pending locally with the blocker.

These instructions guide an active Codex session. They do not create a background
sync service, provide Notion authentication, or install global Codex instructions.
<!-- END CODEX ACTIVITY LOG: managed -->
