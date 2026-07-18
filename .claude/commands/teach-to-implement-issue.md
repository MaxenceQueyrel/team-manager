# /teach-to-implement-issue

Guide the user through implementing a GitHub issue themselves, tailoring the depth of guidance to their stated skill level in the relevant language(s)/area(s). Unlike `/implement-issue`, the goal here is for the **user** to write the code and learn — Claude acts as a tutor/reviewer, not an autopilot, unless the user explicitly asks Claude to implement a piece directly.

## Usage

`/teach-to-implement-issue <issue-id> <skill-level context>`

Examples:
- `/teach-to-implement-issue 10 I'm a beginner in Python but comfortable with JS`
- `/teach-to-implement-issue 42 intermediate on the backend, never touched the optimizer package`
- `/teach-to-implement-issue 17 I know React well, this is my first time with Zustand`

## Steps

1. **Fetch the issue details** using `gh issue view <issue-id>` to get the title, description, problem statement, component checklist, and sub-tasks.

2. **Parse the requirements** from the issue and identify which components are touched (backend/optimizer/frontend/infra), same as `/implement-issue`.

3. **Calibrate to the stated skill level(s)**:
   - Map the user's self-reported level per language/area to the components the issue touches.
   - For areas where they're a beginner: plan to explain more context (why a pattern exists, what a concept means), point to exact files/lines, and describe *what* to change and *why* in plain terms — but leave the typing to them.
   - For areas where they're intermediate/advanced: point more sparsely (file + function name, or a one-line hint) and let them figure out the specifics.
   - If the skill level for a needed area wasn't given, ask before proceeding.

4. **Investigate the codebase** to understand current implementation, exactly as `/implement-issue` does, so guidance can reference real files/lines rather than generic advice.

5. **Break the issue into a sequence of learning steps**, following the sub-tasks in order. For each step, present:
   - What needs to change and why (tied to the issue's goal).
   - Where to make the change (file path, function/component name, and line numbers via `file_path:line_number`).
   - Guidance appropriate to their skill level — from "here's the exact snippet to write" (only if they ask) down to "look at how the sibling function does X and adapt that pattern" (for advanced users).
   - **Do not write the code for this step yet.** Wait for the user to make an attempt or ask for the code.

6. **Loop per step** until all sub-tasks are done:
   - Wait for the user to say they've made a change.
   - When asked to **check**: read the relevant file(s), verify correctness against the issue's requirements and CLAUDE.md conventions, and give direct, specific feedback (what's right, what's off, and why) — don't just say "looks good" without checking.
   - When asked to **implement directly**: write the code for that step yourself (as `/implement-issue` would), explain what you did and why, then continue to the next step in teaching mode.
   - If the user is stuck, give a bigger hint before jumping to a full implementation — escalate gradually rather than defaulting to writing the code.

7. **Verify the full implementation** once all steps are done:
   - Run relevant tests (`make test-optimizer`, `make test-api`, etc.).
   - Test the feature in the app if UI changes are involved (using `/run` skill).
   - Confirm all sub-tasks are completed.

8. **Offer to commit**, but let the user drive:
   - Since the user wrote most of the code, ask before creating the commit rather than doing it automatically.
   - Reference the issue number in the commit message (e.g., "Fixes #10") if the user agrees to commit.

9. **Report progress** to the user with a short recap of what was learned/built, remaining sub-tasks (if paused partway), and test results.

## Notes

- Default mode is **teach**, not **do**: don't write code for a step unless the user explicitly asks you to implement it or has attempted it and asks you to fix something they're stuck on.
- Keep explanations proportional to the stated skill level — don't over-explain to someone who said they're advanced in that language, and don't under-explain to a beginner.
- Still follow CLAUDE.md guidelines (typing, docstrings, code practices) when reviewing the user's code or writing code yourself.
- If the issue scope is large, teach it sub-task by sub-task rather than dumping the whole plan at once — this keeps the loop of attempt → review manageable.
- This command does not create the issue. Use `/create-issue` for that.
