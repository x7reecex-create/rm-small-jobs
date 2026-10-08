# Codex activity logging kit

This kit installs the same automatic in-session Notion logging workflow into a repository. It uses the existing Notion connector. It contains no API credential and does not run a background service.

After installation, Codex reads the repository AGENTS.md, stages a sanitized local activity entry, queries the existing Codex Activity Log by a stable task identifier, creates or updates one record, reads it back, and marks it saved only after verification. Pending records remain in the repository's ignored `.codex/activity-log/` directory.

Run `node install.cjs --repo /absolute/path/to/repository --project "Project name" --project-value Other` for a future repository. For RM Small Jobs, use `--project-value "RM Small Jobs"`. Existing instruction text and ignore rules are preserved. Read the installed `.codex/activity-log-workflow.md` for exact commands and connector operations.

Repository instructions work in future sessions that use the updated checkout and support AGENTS.md. They do not install global settings, observe private sessions from ChatGPT, guarantee assistant compliance, or retry while Codex is stopped. A background runner requires separate persistent hosting, authenticated Notion access, access to the local outbox, and configured scheduling. No such runner is enabled by this kit.

The only Notion destination is the existing database `bd9b6ca2-78da-4024-a664-59090a150b19`, datasource `b59593fc-4fb8-4957-af51-892c116028b4`. Nexus and new projects use the existing `Other` select option, with their precise project name in titles and handovers. Database entries and schema are preserved.
