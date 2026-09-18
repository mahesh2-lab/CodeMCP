---
description: Code cleanliness guidelines — no duplicated logic, right-sized complexity, minimal/meaningful comments, no dead code. Load whenever generating, editing, or reviewing source code, or when a CodeBroom cleanup pass is requested.
applyTo: '**/*.{js,jsx,ts,tsx,py,go,rb,java,cs,cpp,c,h,php,rs,swift,kt}'
---

# Code Cleanliness Guidelines

Apply these rules whenever writing, editing, or reviewing code in this
repo, regardless of language. Prioritize clarity and simplicity over
cleverness. Never change external behavior or public signatures to
satisfy these rules — flag that separately instead.

## 1. No repeated code (DRY)
- Before writing new code, check whether similar logic already exists
  nearby (same file, same module). If it does, extract a shared
  function/helper instead of copy-pasting.
- If you spot 3+ near-identical blocks while touching a file, refactor
  them into one function, even if not explicitly asked.
- Prefer small, composable functions over duplicated inline logic.
- If duplication might be intentional (e.g. two similar-looking
  validators for genuinely different domains), don't collapse them —
  note the ambiguity instead of guessing.

## 2. Match complexity to the problem
- Don't introduce design patterns, abstraction layers, config systems,
  or extra classes for problems a plain function or a few lines can
  solve.
- Ask: would a mid-level engineer solve this with fewer moving parts?
  If yes, simplify.
- Avoid premature generalization (e.g. a plugin system for one use
  case). Solve today's problem; leave clear seams for later, not
  scaffolding for hypothetical futures.

## 3. Comments: minimal and meaningful
- Do not add comments that restate what the code already says
  (e.g. `// increment i` above `i++`).
- Remove commented-out code entirely; rely on git history instead.
- Only comment on WHY, not WHAT — a non-obvious business rule, a
  workaround, a perf tradeoff. Function/variable names should make the
  "what" self-evident.
- Prefer descriptive names over explanatory comments; if a comment only
  exists because a name is unclear, rename instead of keeping it.

## 4. General hygiene
- Remove dead code, unused imports/variables/parameters, and
  unreachable branches.
- Keep functions short and single-purpose; split anything doing more
  than one clear thing.
- Keep naming and formatting consistent with the rest of the file/repo.
- Work incrementally on one concern at a time so changes stay
  reviewable, rather than rewriting a whole file at once.