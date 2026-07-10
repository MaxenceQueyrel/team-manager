# /create-pull-request

Create a GitHub pull request for the current branch by combining the linked issue's description with the actual code changes made.

## Usage

`/create-pull-request <issue-id> [additional instructions]`

Examples:
- `/create-pull-request 10`
- `/create-pull-request 10 mention that the migration needs to run manually`

## Steps

1. **Fetch the issue details** using `gh issue view <issue-id>` to get its title, problem statement, proposed solution, component checklist, and sub-tasks. This is the source of truth for *why* the change exists and *what scope* was intended.

2. **Inspect the current branch's changes**:
   - `git status` to see the working tree state.
   - `git log main..HEAD` (or the repo's actual base branch) to see the commits that will be included.
   - `git diff main...HEAD` to see the full set of changes.
   - If there are uncommitted changes, tell the user and ask whether to commit them first — do not commit on their behalf without confirmation.
   - If the branch has no commits ahead of the base branch, stop and tell the user there's nothing to open a PR for.

3. **Reconcile the issue with the diff**:
   - Check off the sub-tasks from the issue that are actually completed by the diff; leave unaddressed ones unchecked.
   - Note any changes present in the diff that go beyond the issue's stated scope, and any issue sub-tasks that were *not* addressed.
   - Incorporate any additional instructions provided as a second parameter.

4. **Draft the PR body** with:
   - `## Summary` — a few bullet points describing what changed and why, grounded in the actual diff (real file paths, function/component names), not a restatement of the issue.
   - `## Related issue` — `Closes #<issue-id>` (only use `Closes` if the diff fully addresses the issue; otherwise use `Relates to #<issue-id>`).
   - `## Sub-tasks` — the issue's checklist reproduced with accurate `[x]`/`[ ]` state based on step 3.
   - `## Test plan` — a markdown checklist of how the change was/should be verified (tests run, manual steps), based on what's evidenced in the diff/commits (test files added/changed, `make test-*` runs) rather than invented steps.

5. **Push and create the PR**:
   - Confirm with the user before pushing if the branch has no upstream tracking branch yet, or before any force-push.
   - `git push -u origin <branch>` if needed.
   - Title: short, specific, ideally reusing the issue's title (drop any `[Bug]`/`[Feature]` prefix — that belongs on the issue, not the PR).
   - Body: the drafted content from step 4, passed via a heredoc file to `gh pr create --body-file` to preserve formatting.
   - Base branch: the repo's default branch (`main`), unless the user says otherwise.

6. **Report the created PR URL** to the user, along with a short note on any scope mismatches found in step 3 (issue sub-tasks left unaddressed, or diff changes beyond the issue's scope).

## Notes

- This command creates the PR; it does not implement the solution. Use `/implement-issue` for that.
- Never fabricate test results or sub-task completion — base every checked box on evidence from the diff, commit messages, or test output, not assumption.
- Do not merge the PR — creating it is the full scope of this command.
