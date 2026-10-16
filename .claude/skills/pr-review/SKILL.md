---
name: pr-review
description: Review a pull request with parallel subagents, keep only validated high-signal findings, and post them on the PR. Run it right after opening a pull request in this repository (AGENTS.md requires it), or when asked to review a PR. Usage /pr-review <PR number or URL> [--comment].
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

1. **Gate** (one `haiku` agent). Stop without reviewing if any of these holds:
   - the PR is closed, merged or a draft;
   - the change needs no review: generated or bot-made, or trivially correct, like a typo or
     version bump only;
   - the PR already has a comment containing `<!-- pr-review -->` for its current head commit
     (`gh pr view <n> --comments`).

   Claude-written PRs still get reviewed.

2. **Instruction files** (one `haiku` agent). List the paths, not the contents, of every
   `AGENTS.md` and `CLAUDE.md` that governs a changed file:
   - at the repo root;
   - in each directory on the path down to each changed file.

3. **Summary** (one `sonnet` agent). Read the PR (`gh pr view`, `gh pr diff`) and summarise what
   it changes.

4. **Review** (four agents in parallel). Each returns a list of issues, each with a description,
   its file and line, and why it was flagged (`instruction file` or `bug`).
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

5. **Validate** (one agent per issue, in parallel). Each validator gets the PR title and
   description plus the issue, and confirms with high confidence that the issue is real. For
   example, it checks that the "undefined" name really is undefined, or that the quoted rule is
   in scope for that file and really broken.
   - Use `opus` for bugs and logic, and `sonnet` for instruction-file issues.
   - Drop every issue that isn't confirmed.

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
   5. The summary comment starts with `## Code review` and ends with
      `<!-- pr-review <full head sha> -->`, which is the marker step 1 looks for.

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
