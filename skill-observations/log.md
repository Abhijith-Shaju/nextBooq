# Skill Observation Log

Observations captured during task-oriented work.

**Status key:** OPEN = not yet actioned | ACTIONED (YYYY-MM-DD) = skill updated/created | DECLINED (YYYY-MM-DD) = user decided not to pursue — resolved statuses always carry their resolution date

---

## 2026-08-15

### Observation 1: Transaction concurrency tests need explicit conflict mapping

**Status:** OPEN
**Date:** 2026-08-15
**Session context:** Implementing transactional multi-document provisioning.
**Skill:** test-driven-development
**Type:** open-source
**Phase/Area:** Concurrency verification

**Issue:** A duplicate-key concurrency test on a replica set surfaced MongoDB's transient write-conflict response rather than the expected duplicate-key response.

**Suggested improvement:** For transaction-backed create operations, test and normalize both unique-index conflicts and transient write conflicts into the public conflict contract.

**Principle:** Concurrency tests should account for the database's transaction-conflict semantics, not just schema-level uniqueness errors.
