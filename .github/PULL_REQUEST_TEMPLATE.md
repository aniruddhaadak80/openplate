---
name: Pull request
about: A change to OpenPlate
title: ""
labels: ""
assignees: ""
---

**What changed**

<!-- The behaviour, and what a user would notice. -->

**Why**

**Verification**

- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run test`
- [ ] `npm run build`
- [ ] `npm run smoke`

Paste the test summary line:

```
```

**If you touched the engine**

<!-- Before and after for one real record, so a reviewer can see the arithmetic move. -->

**If you touched an upstream adapter**

<!-- Name the institution, and say whether you verified it against the live API. -->

**Checklist**

- [ ] No new environment variable without a documented entry in `.env.example`
- [ ] No new dependency without a note on why it is needed
- [ ] No rule suppressed, no test deleted, no skipped check
- [ ] Every new control calls real logic and has a truthful failure state
- [ ] Mermaid diagrams in the README still render and still describe the code