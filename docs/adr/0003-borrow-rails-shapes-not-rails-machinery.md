---
status: accepted, with parts deferred until their triggers occur
---

# Borrow the shape of Rails and 37signals conventions, not Rails' machinery

QuizQrafter has been converging on the structure of a Rails app built the 37signals way: Jobs with swappable queue adapters, a YAML locale catalogue, one log line per request, errors mapped to responses. We compared it with Basecamp's design, in particular [delegated types](https://dev.37signals.com/the-rails-delegated-type-pattern/), Concerns, and Hotwire. We decided to **borrow a convention's shape when it fits, but keep dependencies explicit and behaviour in deep modules, without rebuilding Rails' runtime machinery in TypeScript.** Several parts are deferred until a named trigger occurs. Revisit this ADR when one does.

## Already borrowed

| Rails / 37signals                              | QuizQrafter                                                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| ActiveJob, with swappable adapters             | the GenerateQuizJob module behind a queue port, with BullMQ and in-memory adapters  |
| `config/locales/en.yml` and `I18n.t`           | `packages/shared/locales/en.yml` and `t()` (i18next)                                |
| Lograge-style one line per request             | wide events, one per request and per Run (ADR 0001)                                 |
| Concerns as opt-in traits                      | errors that mark themselves `expected`, and the planned definitions per kind of Job |
| explicit service objects rather than callbacks | deep modules in `core/`, with dependencies passed in as `deps`                      |

## Left out, and why

- **ActiveRecord-style models with callbacks.** Behaviour stays in deep modules in `core/`, and Prisma is plain data access. Hidden lifecycle hooks are exactly what our explicit `deps` style avoids.
- **Runtime mixins and metaprogramming** (`method_missing`, generated scopes). TypeScript class mixins exist but fight the function-and-`deps` style. A Concern splits in two here: the _trait_ is a field or function in a type, and the _behaviour_ it unlocks is one module in `core/` that works for every kind that opts in.
- **Polymorphism as a `type` + `id` string pair.** Postgres can't enforce that. We use **exclusive-arc foreign keys** instead: one nullable foreign key per kind plus a `CHECK` that exactly one is set. Integrity stays in the database, as with the partial unique index and the job-limit transactions.
- **Rails' folder layout for its own sake** (`app/models`, `app/jobs`). Modules are grouped by noun, following `GLOSSARY.md` (`core/documents.ts`, `core/quizzes.ts`). Roles a noun plays are TypeScript types it satisfies, not folders.
- **Delegated types for small or stable things,** such as the three question types, users and config. They pay off only for the uniform core of content that shares the same actions.

## Deferred until a trigger occurs

| Idea                                                | Trigger                                                                                 | Shape agreed so far                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Delegated types** for content in a shared space   | Workspaces, or quizzes generated from several sources, become real work                 | A light envelope record (name to be decided; "Item" is a placeholder) holds the tree position, creator, Workspace and activity, and points at the content (Document, Quiz, later Assignment, Note) through exclusive-arc foreign keys. Behaviour shared by all kinds lives once, in the envelope's module. Flags only switch on behaviour that is identical across kinds, such as commentable or trashable. Behaviour that varies, such as the text a quiz is generated from, is a function each kind supplies, with a default. Any capabilities sent to the frontend are derived from those. |
| **Workspaces**, like Basecamp's Buckets             | the first shared space                                                                  | Each user first gets a personal Workspace, holding their existing Documents and Quizzes, and access moves from "owner" to "member". A single access module, replacing the inline `userId` checks, is the preparatory step.                                                                                                                                                                                                                                                                                                                                                                    |
| **Immutable content with versions**                 | users lose edits to Regenerate, or Quizzes are shared                                   | A Quiz points at immutable versions, so regenerating or editing adds a version instead of overwriting one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **A shared Job abstraction**                        | a second kind of Job                                                                    | Tracked in gideonoludeyi/quiz-qrafter#1. There are two tiers, plain and record-backed. A record-backed Job's shared `jobs` record would delegate to a per-kind record, in the same envelope-and-content shape as above.                                                                                                                                                                                                                                                                                                                                                                       |
| **Polymorphic attachments**, like Basecamp's Boosts | lightweight marks on anything, such as "this question is wrong" flags or attempt scores | a small table pointing at its target, outside the content tree                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## How to introduce kinds without a steep learning curve

- **Start with a discriminated union and an exhaustive `switch`** on the kind (`satisfies never`). The compiler then lists every place a new kind must be handled.
- **Move to per-kind definitions** (`defineJob` or similar) only when the `switch` statements start hurting: about four or more kinds, or the same `switch` in three or more places.
- **When definitions arrive,** each kind's definition lives in its noun module. One typed registry (`Record<Kind, Definition>`) lists every kind. Fields are written out explicitly, never spread in from nested traits. One contract test runs against every registered kind.
- **The first new kind, such as Assignment, is added by hand.** A recipe of every file to touch is written from that experience. A scaffold script or an agent skill is only built if the second addition is painful too.

## Still open

- **HTML over the wire (Hotwire or HTMX with server-rendered Hono JSX) or the React app.** It would remove the JSON API, the client stores and the per-kind components that every new feature needs today. Against it: rewriting the frontend, losing React-only niceties, and weaker offline support. It is decided mostly by mobile (Hotwire Native or React Native) and offline needs. The cheap first step is a prototype of one screen. Switching needs its own ADR.
- **Interactivity, whichever way the above goes,** is written as generic behaviours configured per use, as Stimulus controllers are. In React that means headless components (as Base UI already provides) and hooks configured through props and data attributes, not one-off components per feature.
- **The domain model for Workspaces and composite sources:** the envelope's name, who owns a shared Document, whether a Quiz is generated from one item or several, whether the job limit is per user or per Workspace, and whether Quizzes are versioned. Settle these, and add them to `GLOSSARY.md`, before building anything under "Deferred".

## Risks to weigh when a trigger occurs

**Across all of them:**

- **They pull each other in.** Shared content needs versions; Workspaces need the access module; a shared `jobs` record has the same envelope shape. Done together, they are a large rewrite with several data migrations. Take one trigger at a time, and ship and stabilise each step before the next.
- **A deferral only works if the trigger is noticed.** Check this ADR when planning any feature that touches Workspaces, a new kind of content, or a new kind of Job.
- **The domain-model questions above decide most of this.** Building any deferred item before they are answered is where the risk concentrates.

**Per idea:**

- **Delegated types:**
    - Every create, copy and delete writes two records and needs a transaction, or orphans appear.
    - A feed that mixes kinds needs one query per kind to avoid N+1 loads.
    - Exclusive arcs add a column and a `CHECK` change to the busiest table for every new kind.
    - The envelope tends to collect columns that only some kinds use, drifting back into single-table inheritance, and its module into a catch-all.
    - Behaviour is harder to find: it is spread across the envelope module, the kind, and the registry.
    - Moving existing Documents and Quizzes under envelopes is a risky data migration.
- **Workspaces:**
    - Every query pays for a membership check, and one forgotten check is a data leak.
    - Membership brings endless product questions: roles, invitations, leaving, ownership after leaving, deletion across shared content.
    - A per-user job limit can be dodged with many Workspaces; a per-Workspace limit can be hogged by one member.
    - Storage keys are per user and would need a new layout and a file migration.
- **Versions:**
    - Storage grows with every save, so retention or pruning is needed.
    - Reads get an extra pointer to keep correct.
    - Versions don't solve two people editing at once; that needs locking or merging.
    - Erasing a user's data means finding every version.
- **A shared Job abstraction:**
    - Generic machinery can burden simple Jobs, or tempt a record-backed one to skip its run-ownership guard.
    - Queue messages outlive deployments, so a registry by kind needs versioned or compatible message formats.
    - Moving to a shared `jobs` table migrates the table the business rules depend on.
- **Polymorphic attachments:**
    - Either orphans (`type` + `id`) or a column per target kind (exclusive arcs).
    - Each new kind of mark tends to bring its own table and UI.
- **Introducing kinds:**
    - Exhaustive `switch`es spread until someone notices the threshold has passed.
    - A recipe, scaffold script or agent skill goes stale unless it is maintained, and a stale one is worse than none.
- **HTML over the wire:**
    - A partial move leaves two frontends, two test styles and two sets of patterns, possibly for a long time.
    - Hono has none of Rails' Turbo helpers, broadcasting, form builders or fragment caching. We would write that glue ourselves, which is the "rebuilding Rails" trap this ADR warns against.
    - It costs offline support and today's frontend work.
- **Generic behaviours:** a component made generic for one use tends to grow options for imagined cases, and becomes harder to change than two specific ones would have been.

## Consequences

- New features follow the noun-first module layout. Reviews and agents should not add Rails-like models, callbacks or mixins, or `type` + `id` polymorphic columns.
- Adding a kind of content touches more places than in Rails (the schema, a core module, an API route, the shared schema and the frontend). That is accepted for now. The recipe, and possibly HTML over the wire, are the planned remedies.
