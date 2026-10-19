---
description: Deliver a GitHub issue and all its sub-issues end-to-end — branches, parallel implementer sub-agents, integration, review, verification — ending with one PR to review.
argument-hint: <issue-id> [additional instructions]
---

# /deliver-issue

Orchestrate the full delivery of a GitHub issue and, if it is a parent/tracking issue, all of its child issues. It goes from branch creation to a single pull request into `dev` that the user reviews at the end. You are the **orchestrator**. Delegate the coding to `issue-implementer` sub-agents and the review to an `issue-reviewer` sub-agent. You plan, create branches and worktrees, merge, verify, and open the PR.

## Usage

`/deliver-issue <issue-id> [additional instructions]`

Examples:
- `/deliver-issue 104`: parent issue, so all children ship in one PR
- `/deliver-issue 102`: single issue, so one implementer, review, and PR
- `/deliver-issue 109 show me the plan and wait for my go before implementing`
- `/deliver-issue 104 do it sequentially, no parallel worktrees`

Additional instructions override the defaults below. Pass the parts relevant to each sub-agent to that sub-agent.

## Model

```
dev
 └── <parent>-<slug>              integration branch (gh issue develop), the PR head
      ├── <child-a>-<slug>        local branch in .worktrees/<child-a>, merged --no-ff
      ├── <child-b>-<slug>        local branch in .worktrees/<child-b>, merged --no-ff
      └── …                       later waves branch off the integration tip
```

Each child is merged with `--no-ff`. The user can therefore review the single PR one issue at a time with `git log --first-parent`.

## Steps

### 1. Load the issue tree

- `git fetch origin`. Require a clean working tree (`git status --porcelain`). If it is dirty, stop and ask the user.
- `gh issue view <id> --json number,title,body,labels,state`.
- Discover children by taking the union of:
  - `#<n>` references in the parent body's `## Sub-tasks` checklist;
  - native sub-issues: `gh api repos/{owner}/{repo}/issues/<id>/sub_issues --jq '.[].number'`;
  - `gh issue list --state all --search '"Part of #<id>" in:body' --json number,title,state`.
- For each child, run `gh issue view <child> --json number,title,body,state`. Skip children that are already closed and mention them in the report.
- If there are no open children, this is **single-issue mode**. Treat the issue itself as the only unit of work and skip worktrees (see 4b).

### 2. Plan the waves

Build a dependency graph between children:
- Explicit dependencies in the bodies ("depends on #x", "after #x", "requires #x", "blocked by #x", "covered by #x").
- Implicit dependencies: a frontend issue that consumes endpoints, fields or types introduced by a backend or optimizer sibling depends on that sibling. A "foundation", "shell" or "shared primitives" issue precedes the issues that build on it.
- File overlap: if two independent children will clearly edit the same files, put them in different waves to avoid painful conflicts.

Group the children into **waves**. Every child in a wave depends only on earlier waves. Run at most **3 implementers concurrently**. Split a larger wave into batches. If there is a dependency cycle, or the ordering is genuinely unclear, ask the user.

Print the plan as a short table: wave, issue, title, depends on, branch name. Continue without waiting unless the additional instructions ask you to wait.

### 3. Create the integration branch

- Look for an existing branch with `git branch --all | grep -E "(^|/)<id>-"`. If it exists, check it out (tracking the remote if needed). If it is behind `origin/dev`, `git merge origin/dev` (never rebase a pushed branch).
- Otherwise run `gh issue develop <id> --base dev --checkout`.
- Call this `PARENT_BRANCH`. The main checkout stays on it for the whole run. Never commit to `dev` or `main`.

### 4a. Run each wave (parent mode)

For each wave, in order:

1. **Resume check.** Skip a child whose work is already on `PARENT_BRANCH` (`git log PARENT_BRANCH --grep "#<child>"` shows its commits or merge). If its local branch exists with unmerged commits, reuse it and tell the implementer to continue from there.
2. **Create a worktree per child** from the current integration tip:
   `git worktree add -b <child>-<slug> .worktrees/<child> <PARENT_BRANCH>`
   The slug is the child title in lower case, with the `[Feature]`/`[Bug]` prefix dropped, non-alphanumerics turned into `-`, and a maximum of 60 characters.
3. **Spawn the implementers for the wave in parallel**: one `Agent` call per child in a single message, `subagent_type: issue-implementer`, `run_in_background: true`. The prompt must contain:
   - `ISSUE: <child>`, `PARENT: <id>`
   - `WORKDIR: <absolute path to .worktrees/<child>>`, `BRANCH: <child>-<slug>`
   - `CONTEXT FROM EARLIER ISSUES:` the `SUMMARY` and `INTERFACES FOR DEPENDENTS` sections from the reports of the issues it depends on
   - `EXTRA INSTRUCTIONS:` the relevant parts of the user's additional instructions

   Wait for every implementer in the wave to finish. Do not guess their results.
4. **Handle the reports.**
   - `done`: merge it.
   - `partial` with no dependents: merge it and carry the gap into the PR notes.
   - `blocked`, or `partial` while later waves depend on the missing part: stop and ask the user whether to continue without it, give extra guidance and retry (resume the agent with `SendMessage`), or abort.
5. **Merge into the integration branch**, one child at a time, in the main checkout:
   `git merge --no-ff <child>-<slug> -m "Merge #<child>: <child title>"`
   On conflict, resolve it yourself using both issues' intent: read both sides and keep both behaviours, never just take one side. Then `git add` the files and run `git commit --no-edit`.
6. **Smoke-test the integration** after the wave is merged. Run `make test`, plus `make lint-frontend` if the frontend changed. If something broke from the combination, spawn an `issue-implementer` in fix mode: `WORKDIR` = repo root, `BRANCH` = `PARENT_BRANCH`, the failing output, and the issues involved. Fix this before starting the next wave.
7. **Clean up** each merged child: `git worktree remove .worktrees/<child>` and `git branch -d <child>-<slug>`. Keep the worktrees of blocked or partial children for inspection.

### 4b. Single-issue mode

Spawn one `issue-implementer` (foreground is fine) with `ISSUE: <id>`, `WORKDIR` = repo root, `BRANCH` = `PARENT_BRANCH`, and the additional instructions. Handle its report as in 4a.4.

### 5. Review and fix loop

- Spawn `issue-reviewer` with `BASE: origin/dev`, `HEAD: <PARENT_BRANCH>`, `ISSUES:` the parent and all delivered children, and `IMPLEMENTER NOTES:` every report's `DEVIATIONS / OPEN QUESTIONS`.
- If the verdict is `needs-fixes`, spawn an `issue-implementer` in **fix mode** on the main checkout with the blocking and should-fix findings verbatim. Then review again.
- Allow at most **2 fix rounds**. Unresolved findings go into the PR body. Nits are listed but not fixed unless they are trivial.

### 6. Final verification (you, in the main checkout)

Run every command and record pass or fail for each:
- `make test`
- `make lint-backend` and `uv run ruff format --check optimizer/src backend/src`
- `make typecheck-optimizer typecheck-backend`
- If the frontend changed: `make lint-frontend`, `bun run --cwd=frontend build`, and `make test-e2e`. e2e needs Docker. If it cannot run for environmental reasons, record it as **not run** with the reason. Never record it as passed.
- If there are visual changes that e2e does not cover and the user asked for visual checks, use the `/run` skill to screenshot the affected pages.

If a check fails because of the change, go back to a fix-mode implementer once. If it still fails, open the PR as a **draft** and say why.

### 7. Open the pull request

- `git push -u origin <PARENT_BRANCH>` (never force-push).
- If a PR already exists for the branch (`gh pr view <PARENT_BRANCH>`), update it with `gh pr edit --body-file`. Otherwise run `gh pr create --base dev --head <PARENT_BRANCH> --title "<parent title without [Feature]/[Bug] prefix>" --body-file <file>`. Add `--draft` if step 5 or step 6 left blocking problems.
- PR body (write it to a file in the scratchpad):

  ```
  ## Summary
  <3–6 bullets on the overall change, grounded in the diff>

  ## Delivered issues
  ### #<child> <title>
  <2–4 bullets from the implementer report, with key files>
  (one subsection per child, in merge order; omit this section in single-issue mode)

  ## Related issues
  Closes #<id>
  Closes #<child>   (one line each, only for fully delivered issues; use "Relates to" for partial ones)

  ## Sub-tasks
  <the parent's checklist with accurate [x]/[ ], based on the reviewer's coverage>

  ## Test plan
  - [x]/[ ] <each command from step 6 and its result; e2e "not run: <reason>" if applicable>

  ## Review notes
  <unresolved reviewer findings, implementer deviations, open questions, or "None">

  Review per issue: `git log --first-parent dev..<PARENT_BRANCH>`

  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  ```

### 8. Report to the user

- The PR URL, and whether it is a draft.
- A table of each issue → status → merge commit.
- Verification results and the review outcome (number of rounds, any open findings).
- Everything that needs a human decision. Put this first if anything exists.
- Any leftover worktrees or branches and why they were kept.

## Rules

- Never merge the PR, push to `dev` or `main`, force-push, or skip hooks (`--no-verify`).
- Never fabricate results. Every ticked box and every "pass" must come from a report, a command you ran, or the reviewer's coverage.
- Keep your own context lean. Let sub-agents read the code, and act on their reports.
- Re-running the command on the same issue resumes the work: existing branches, merged children and an open PR are detected and reused.
