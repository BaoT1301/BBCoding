# Knowledge Routing Protocol

Do not write ephemeral files to the root `.claude/docs` folder. You must strictly route your output:

## 1. Core Specifications (`.claude/docs/core/`)

If you finalize an API contract or infrastructure design, write it here.

## 2. Task Queues (`.claude/docs/tasks/`)

* **Active Sprints:** Short-term execution checklists go in `.claude/docs/tasks/active_task.md`.
* **Active Epics:** Unfinished master ledgers go in `.claude/docs/tasks/epics/`.
* **Archived Epics:** 100% completed ledgers MUST be moved to `.claude/docs/tasks/archives/`.

## 3. Review Queue (`.claude/docs/reviews/`)

When an engineer finishes a feature, they must write a "State Sync Draft" here detailing what dependencies, `.claude` files, or `README.md` files need updating.

## 4. Squash & Archive (`.claude/docs/archives/`)

When you complete a task, you must squash the implementation details into 2-3 sentences and write it to a NEW file located at `.claude/docs/archives/adrs/[YYYY-MM-DD]-[feature-name].md`. Do NOT append to a single monolithic file.

## 5. Purge

Never leave temporary test results or "summary" files in the repository. Delete them immediately after squashing.

## 6. Issue Tracking & Archiving (`.claude/docs/issues/`)

* **Active Blocks:** All current, unresolved blockers must be logged in `.claude/docs/issues/issues.md`.
* **Resolved Archive:** When an issue is fixed, it must not remain in the active queue. It must be moved to `.claude/docs/issues/archives/[feature_name]-resolved.md`.
