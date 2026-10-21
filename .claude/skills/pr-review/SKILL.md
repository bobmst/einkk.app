---
name: pr-review
description: Review a pull request with subagents sized to the change (one reviewer for docs-only or other no-logic changes, up to four for risky ones), keep only validated high-signal findings, and post them on the PR. Run it right after opening a pull request in this repository (AGENTS.md requires it), or when asked to review a PR. Usage /pr-review <PR number or URL> [--comment].
---

# PR review

A multi-agent review of one pull request. It is adapted from Anthropic's `/code-review`
command for Claude Code
(https://github.com/anthropics/claude-code/blob/main/plugins/code-review/commands/code-review.md),
with changes for these repositories:
- The instruction files are `AGENTS.md` as well as `CLAUDE.md`.
- Comments are posted with `gh api`, not an MCP comment tool.
- `gh` acts as the repository owner, so earlier reviews are found by a marker in the comment, not
  by the comment's author.

## Input

- **Target:** a PR number or URL. With neither, use the PR for the current branch
  (`gh pr view --json number`).
- **`--comment`:** post the result on the PR. Without it, print the result only. The rule in
  AGENTS.md runs it with `--comment`.

## Rules for every agent

Pass these rules to every subagent you launch:
- Tools work. Don't test them, and don't make exploratory calls.
- Call a tool only when the task needs it.
- Use `gh` for GitHub. Don't use web fetch.
- Every reviewer and validator gets the PR's title and description, so it knows what the author
  meant to do.

Start with a task list of the steps below.

## Steps

Steps 1–3 are lookups. Do them yourself with `gh`; they need no agent.

1. **Gate.** Stop without reviewing if any of these holds:
   - the PR is closed, merged or a draft;
   - the change needs no review: generated or bot-made, or trivially correct, like a typo or
     version bump only;
   - the PR already has a comment containing `<!-- pr-review <full head sha> -->` for its current head commit
     (`gh pr view <n> --comments`).

   Claude-written PRs still get reviewed.

2. **Instruction files.** List the paths, not the contents, of every `AGENTS.md` and
   `CLAUDE.md` that governs a changed file:
   - at the repo root;
   - in each directory on the path down to each changed file.

3. **Size the change.** Read the PR's files and diff stats (`gh pr view <n> --json files`, then
   `gh pr diff <n>`), and pick the smallest tier that fits.

   | Tier | When | Reviewers |
   |---|---|---|
   | **S** | No logic changes: docs, comments, instruction or skill text, test-only changes, renames, constants or config values, wording in UI text | one `sonnet` agent: instruction-file compliance plus anything that breaks (a wrong path, a broken link or reference, a test that can't pass) |
   | **M** | Logic changes confined to one module or feature, roughly under 300 changed lines of code | one `sonnet` agent for instruction-file compliance, and one `opus` agent for bugs and logic in the changed code |
   | **L** | Any of: writes to the DB or a schema/migration change; secrets, auth or anything security-sensitive; published outputs or a contract (outbox documents, schemas, the public site's data path); the forecast model; several modules; or over roughly 300 changed lines of code | the four reviewers below |

   When unsure between two tiers, take the larger. Say which tier you chose and why, in one line,
   before launching anything.

4. **Review** (the tier's agents, in parallel). Each returns a list of issues, each with a
   description, its file and line, and why it was flagged (`instruction file` or `bug`). Tier L
   uses all four; tiers S and M use the agents the table names, with the same instructions as
   the matching ones here.
   - **Agents 1 and 2** (`sonnet`): instruction-file compliance. A rule applies to a file only if
     its instruction file sits in that file's directory or a parent of it.
   - **Agent 3** (`opus`): obvious bugs, reading only the diff. Flag only significant bugs that
     the diff alone proves.
   - **Agent 4** (`opus`): problems in the introduced code: wrong logic, security holes, broken
     edge cases. Only issues inside the changed code.

   **High signal only.** Flag only:
   - code that won't compile, parse or type-check (syntax or type errors, missing imports,
     unresolved names);
   - logic that gives wrong results for every input, not just some;
   - a clear instruction-file violation whose rule you can quote word for word.

   **Never flag:**
   - style or quality opinions;
   - problems that depend on particular inputs or state;
   - suggestions or improvements;
   - anything you are not sure is real.

   A false positive costs the reviewer more than a miss.

5. **Validate** (only when step 4 found issues). Confirm with high confidence that each issue
   is real, and drop every one that isn't.
   - When one file read or one search settles it, check it yourself. Examples: the "undefined"
     name really is undefined; the quoted rule is in scope for that file and really broken.
   - Otherwise launch one validator per issue, in parallel. Give each the PR title and
     description plus the issue. Use `opus` for bugs and logic, and `sonnet` for
     instruction-file issues.

6. **Report.** Print the confirmed issues, each with a one-line description. With none, print:
   "No issues found. Checked for bugs and AGENTS.md / CLAUDE.md compliance." Without
   `--comment`, stop here.

7. **Post** (with `--comment` only):
   1. Draft every comment first and check it for duplicates: one comment per issue.
   2. **No issues:** post a summary with `gh pr comment <n> --body-file <file>`.
   3. **Issues found:** post one inline comment per issue on the head commit:

      ```bash
      gh api repos/<owner>/<repo>/pulls/<n>/comments \
        -f commit_id=<full head sha> -f path=<file> -F line=<line> -f side=RIGHT \
        -f body="<comment>"
      ```

      Then post the summary comment listing them.
   4. In each inline comment:
      - Describe the issue briefly.
      - Add a `suggestion` block only for a small fix (under 6 lines, one place) that resolves
        the issue completely. Otherwise describe the fix in words.
      - Cite what you rely on with a permalink to the full commit sha, with at least one line of
        context on each side. Example:
        `https://github.com/<owner>/<repo>/blob/<full sha>/AGENTS.md#L10-L14`
   5. The summary comment starts with `## Code review` and names the tier, e.g. "Tier S (docs
      only): one reviewer". It ends with `<!-- pr-review <full head sha> -->`, which is the
      marker step 1 looks for.

## False positives (never flag these)

- Pre-existing issues: problems in lines the PR didn't change.
- Code that looks wrong but is correct.
- Nitpicks a senior engineer would leave alone.
- Anything the linter, type checker or CI would catch. Don't run them to check.
- General quality points, such as test coverage or hardening, unless an instruction file
  requires them.
- A rule the code silences on purpose, e.g. with a lint-ignore comment.

## After the review

Tell the user what was posted, with links. Don't fix the findings unless the user asks. If they
do, push the fixes to the same branch, and reply on each comment's thread with what changed.
