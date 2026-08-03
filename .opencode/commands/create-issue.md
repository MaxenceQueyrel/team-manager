
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
4. Assess the scope before writing sub-tasks:
   - Estimate how many components/modules (backend/optimizer/frontend/infra) and roughly how many files the work will touch, based on step 2.
   - **Small/contained** (fits one component, or a couple of files that one PR can reasonably cover and review): keep it as a **single issue** with a `## Sub-tasks` checklist (see 4a).
   - **Large/cross-cutting** (spans multiple components, or one component but several independent chunks of work — e.g. a feature that touches backend models, API, optimizer logic, and frontend UI): **split into multiple issues** (see 4b) instead of one giant checklist. The goal is that each issue corresponds to one reviewable, independently implementable PR.
   - If it's genuinely borderline, ask the user which they'd prefer rather than guessing.

   4a. **Single issue**: add a `## Sub-tasks` section at the end of the body with a markdown checklist (`- [ ] ...`) that splits the work into concrete, independently completable steps (e.g. one per affected component/module, or per logical phase: investigate → implement → test → docs). Keep each sub-task action-oriented and scoped to one file or concern where possible.

   4b. **Multiple issues**: create one **parent (tracking) issue** plus one **child issue per concrete part** (typically one per affected component, or per logical phase if a single component has several independent chunks):
   - Parent issue body: the normal template content (problem/description) plus a `## Sub-tasks` checklist where each item is a placeholder line describing one child issue (e.g. `- [ ] Backend: ...`), later replaced with a link to the real issue number.
   - Each child issue: its own filled-in template (bug or feature, whichever fits that slice of work), scoped tightly to one component/concern, with a `## Sub-tasks` checklist for its own steps if useful. Add a line near the top of the body: `Part of #<parent-issue-number>.`
   - Keep child issues independently implementable — avoid child B silently depending on undone work in child A unless unavoidable; call out the dependency explicitly in the body if it exists.
5. Create the issue(s) with `gh issue create`:
   - Title: short, specific, prefixed `[Bug]` or `[Feature]` to match the template. For child issues, prefix further with the component, e.g. `[Feature] Backend: ...`.
   - Body: the filled-in template content (pass via a heredoc file to preserve formatting, not an inline `-b` string).
   - Label: `bug` or `enhancement` per the template's frontmatter.
   - If splitting (4b): create the parent issue first, then each child issue referencing it. After all child issues exist, `gh issue edit` the parent to replace the placeholder checklist lines with real links (`- [ ] #124 Backend: ...`).
6. Report the created issue URL(s) to the user — the parent and all child issues if split. Do not push, merge, or start implementing — creating the issue(s) is the full scope of this command.
