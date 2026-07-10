
# /create-issue

Create a GitHub issue from a brief description, using the repo's issue templates, and break the work into clear sub-tasks.

## Usage

`/create-issue <brief description>`

Example: `/create-issue the assignment score isn't recalculated when a person's skills change`

## Steps

1. Read the brief description and decide whether it's a **bug** or a **feature**:
   - Read `.github/ISSUE_TEMPLATE/bug_report.md` or `.github/ISSUE_TEMPLATE/feature_request.md` (whichever fits) to get the exact section structure.
   - If genuinely ambiguous, ask the user rather than guessing.
2. Investigate the codebase as needed (Explore/Grep/Read) to ground the issue in reality — real file paths, function names, current behavior — rather than writing something generic. Do not fix the issue, only describe it.
3. Fill in the chosen template's body:
   - Use the template's exact section headings.
   - For the component checklist, check only the components actually affected (backend/optimizer/frontend/infra), based on what you found in step 2.
   - Write the description/problem section specifically, referencing the relevant files with `path:line` where helpful.
4. Add a `## Sub-tasks` section at the end of the body with a markdown checklist (`- [ ] ...`) that splits the work into concrete, independently completable steps (e.g. one per affected component/module, or per logical phase: investigate → implement → test → docs). Keep each sub-task action-oriented and scoped to one file or concern where possible.
5. Create the issue with `gh issue create`:
   - Title: short, specific, prefixed `[Bug]` or `[Feature]` to match the template.
   - Body: the filled-in template content from steps 3–4 (pass via a heredoc file to preserve formatting, not an inline `-b` string).
   - Label: `bug` or `enhancement` per the template's frontmatter.
6. Report the created issue URL to the user. Do not push, merge, or start implementing — creating the issue is the full scope of this command.
