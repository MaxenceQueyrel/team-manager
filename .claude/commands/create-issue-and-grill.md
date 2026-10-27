
# /create-issue-and-grill

Create a GitHub issue from a brief description. Before writing anything, ask the user questions in rounds until the issue's scope, behavior and acceptance criteria are fully agreed. Then use the repo's issue templates and break the work into clear sub-tasks.

## Usage

`/create-issue-and-grill <brief description>`

Example: `/create-issue-and-grill let managers lock a person to a project so the optimizer never reassigns them`

## Steps

1. Read the brief description and form a first guess at whether it's a **bug** or a **feature**. Read `.github/ISSUE_TEMPLATE/bug_report.md` or `.github/ISSUE_TEMPLATE/feature_request.md` (whichever fits) to learn which sections the issue will need. Those sections are the minimum the questions must cover.
2. Ground yourself in the codebase. Finding *facts* is your job, never the user's: real file paths, function names, current behavior, existing models and endpoints. Dispatch `Explore` sub-agents for anything non-trivial, and don't wait on them before the first round. A running exploration only blocks the questions that depend on its result. Do not fix the issue, only describe it.
3. **Grill the user** until you reach a shared understanding of the issue. Treat the issue as a **design tree**: every decision branches into the decisions that depend on it. Typical branches:
   - Bug vs feature (only if genuinely ambiguous).
   - The problem or user need, and who it affects.
   - Expected behavior, including edge cases and failure modes.
   - Which components are in scope (backend/optimizer/frontend/infra), and what is explicitly out of scope.
   - Data model / API / UI decisions the implementer would otherwise have to guess.
   - Acceptance criteria: how we'll know it's done.
   - Single issue vs parent + child issues (see step 5), and how to slice the children.

   Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled, meaning the questions you can ask *now* without guessing at answers you haven't heard yet. Ask the whole frontier in one round. Number each question and give your recommended answer, grounded in what you found in the codebase. Then wait for the user's answers before the next round.

   Format a round like so:

   ```
   ❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

   ➡️ <your recommended answer>

   ---

   ❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

   ➡️ <your recommended answer>
   ```

   - Word each question so "yes" accepts your recommended answer.
   - A question whose answer depends on another question still open in this round belongs to a *later* round, not this one.
   - After each round, recompute the frontier: settled decisions unblock the questions that depended on them, and new exploration results may raise new ones.
   - Never ask the user something you could look up yourself. The *decisions* are theirs: put each one to them and wait.
4. The grilling is done when the frontier is empty: every branch visited and nothing silently assumed. Then present a short summary of the agreed understanding: type, title(s), problem, expected behavior, components, acceptance criteria, single vs split, and planned sub-tasks. **Do not create anything until the user confirms this summary.** If they correct something, update the tree and ask any questions the correction opens up.
5. Fill in the chosen template's body from the agreed understanding:
   - Use the template's exact section headings.
   - For the component checklist, check only the components agreed in step 3.
   - Write the description/problem section specifically, referencing the relevant files with `path:line` where helpful.
   - Include the agreed acceptance criteria and out-of-scope items so the implementer doesn't re-open settled decisions.

   Then structure it as agreed in step 3:

   5a. **Single issue** (small/contained: one component, or a couple of files one PR can reasonably cover and review): add a `## Sub-tasks` section at the end of the body with a markdown checklist (`- [ ] ...`) that splits the work into concrete, independently completable steps (e.g. one per affected component/module, or per logical phase: investigate → implement → test → docs). Keep each sub-task action-oriented and scoped to one file or concern where possible.

   5b. **Multiple issues** (large/cross-cutting: spans multiple components, or one component with several independent chunks of work): create one **parent (tracking) issue** plus one **child issue per concrete part**, so that each issue corresponds to one reviewable, independently implementable PR:
   - Parent issue body: the normal template content (problem/description) plus a `## Sub-tasks` checklist where each item is a placeholder line describing one child issue (e.g. `- [ ] Backend: ...`), later replaced with a link to the real issue number.
   - Each child issue: its own filled-in template (bug or feature, whichever fits that slice of work), scoped tightly to one component/concern, with a `## Sub-tasks` checklist for its own steps if useful. Add a line near the top of the body: `Part of #<parent-issue-number>.`
   - Keep child issues independently implementable. Avoid child B silently depending on undone work in child A unless unavoidable, and call out the dependency explicitly in the body if it exists.
6. Create the issue(s) with `gh issue create`:
   - Title: short, specific, prefixed `[Bug]` or `[Feature]` to match the template. For child issues, prefix further with the component, e.g. `[Feature] Backend: ...`.
   - Body: the filled-in template content (pass via a heredoc file to preserve formatting, not an inline `-b` string).
   - Label: `bug` or `enhancement` per the template's frontmatter.
   - If splitting (5b): create the parent issue first, then each child issue referencing it. After all child issues exist, `gh issue edit` the parent to replace the placeholder checklist lines with real links (`- [ ] #124 Backend: ...`).
7. Report the created issue URL(s) to the user, including the parent and all child issues if split. Do not push, merge, or start implementing. Creating the issue(s) is the full scope of this command.
