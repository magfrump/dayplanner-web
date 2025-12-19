# Code Health Pact

**"We agree to take time to improve code health periodically as we work."**

## Guidelines
1.  **Refactor as we go**: Don't let technical debt accumulate. If a file gets too large or a function too complex, break it down immediately.
2.  **Linting is Law**: Address lint warnings before they become overwhelming.
3.  **Test Hygiene**: Keep tests fast, reliable, and meaningful. Prune obsolete tests.
4.  **Periodic Reviews**: Every few major features, pause to review the architecture and perform a "health check/cleanup" cycle.

## Checklist for Health Cycles
- [ ] Run full test suite and check for slowness/flakes.
- [ ] Run linter and fix warnings.
- [ ] Check for unused files or dead code.
- [ ] Review file sizes (e.g., components > 300 lines).
- [ ] Verify directory structure makes sense.
