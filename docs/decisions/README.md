# Architectural Decision Records

No historical ADRs were present when this documentation was introduced. The [architecture guide](../ARCHITECTURE.md) describes current implementation evidence; it is not a claim that past decisions were formally approved.

Create an ADR when an agreed change materially affects module boundaries, persistence/migration strategy, authentication, hosting, or state management. Routine bug fixes and isolated UI changes do not need one.

Use `NNNN-short-title.md` and include:

1. Title and status: proposed, accepted, superseded, or rejected.
2. Actual decision date, when known.
3. Context and constraints supported by the repository or discussion.
4. The decision and meaningful alternatives considered.
5. Consequences, compatibility/migration needs, and links to relevant implementation or discussion.

Records: [0001 single container image](0001-single-container-image.md), [0002 in-place schema upgrades](0002-in-place-schema-upgrades.md).

Do not invent dates, authors, approval, or rejected alternatives. Until accepted, a proposal must not be presented as the current architecture. Update affected guides when an accepted decision is implemented; link superseding records rather than rewriting history.
