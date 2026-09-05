# /implement-issue

Implement the solution for a GitHub issue by reading its description and sub-tasks, then making the necessary code changes.

## Usage

`/implement-issue <issue-id> [additional instructions]`

Examples:
- `/implement-issue 10`
- `/implement-issue 10 prioritize the frontend changes first`
- `/implement-issue 42 skip testing, we'll verify manually`

## Steps

1. **Fetch the issue details** using `gh issue view <issue-id>` to get:
   - Issue title and full description
   - Problem statement and proposed solution
   - Component checklist to understand scope
   - Sub-tasks list that breaks down the work
   - Any labels, milestone, or related context

2. **Parse the requirements** from the issue:
   - Extract the problem being solved
   - Identify which components need changes (backend/optimizer/frontend/infra)
   - Review the sub-tasks to understand the implementation order
   - Incorporate any additional instructions provided as a second parameter

3. **Ensure a development branch exists for the issue**:
   - Check for a local or remote branch matching `<issue-id>-*` (e.g. `git branch --all | grep -E "/?<issue-id>-"`)
   - If one exists, check it out (`git checkout <branch-name>`, tracking the remote if it only exists there)
   - If none exists, create it from `dev` and switch to it with `gh issue develop <issue-id> --base dev --checkout` (this also links the branch to the issue)
   - Never implement directly on `main` or `dev`

4. **Investigate the codebase** to understand current implementation:
   - Read relevant files mentioned in the issue
   - Understand the current code structure and patterns
   - Identify all files that need to be modified

5. **Implement the solution** by:
   - Following the sub-tasks in order (or as indicated by additional instructions)
   - Making changes to necessary files using Edit/Write tools
   - Following the code style and patterns documented in CLAUDE.md
   - Writing tests if applicable (pytest for Python, etc.)

6. **Verify the implementation** by:
   - Running relevant tests (`make test-optimizer`, `make test-api`, etc.)
   - Testing the feature in the app if UI changes are involved (using `/run` skill)
   - Confirming all sub-tasks are completed

7. **Report completion** to the user with:
   - Summary of changes made
   - Test results
   - Link to the created commit(s)
   - Any blockers or deviations from the original plan

8. **Do not Create a commit, except if it is asked create one** with a clear message:
   - Reference the issue number in the commit message (e.g., "Fixes #10")
   - Write a clear summary of the changes
   - Use conventional commit format if applicable

## Notes

- This command implements the solution; it does not create the issue. Use `/create-issue` for that.
- Additional instructions (second parameter) can override or modify the implementation approach.
- Follow CLAUDE.md guidelines for code style, testing, and documentation.
- If the issue scope seems too large, break it into multiple implementation passes.
- Always run tests before committing changes.
