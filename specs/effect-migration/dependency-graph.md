# Migration Dependency Graph

## Overview

This document maps the complete dependency structure for migrating `@phosphorco/rdf-utils` to Effect TS, including task-level dependencies, critical paths, and parallel work opportunities.

## Phase Dependencies

```
Phase 1: Foundation
    |
    v
Phase 2: Infrastructure
    |
    v
Phase 3: Graph Abstraction
    |
    +---> Phase 4: Graph Implementations (parallel within phase)
    |         |
    |         +---> N3Graph      (in-memory)
    |         +---> ImmutableGraph (in-memory)
    |         +---> ChangeSetGraph (in-memory, depends on ImmutableGraph)
    |         +---> StardogGraph   (remote, depends on HttpClient)
    |         +---> GraphDBGraph   (remote, depends on HttpClient)
    |
    v
Phase 5: High-Level APIs (depends on all of Phase 4)
    |
    v
Phase 6: Testing Migration
```

## Task-Level Dependencies

### Phase 1: Foundation

| Task | ID | Depends On | Description |
|------|-----|------------|-------------|
| Tagged Errors | 1.1 | - | `RdfError`, `ParseError`, `SerializeError`, `QueryError` |
| Term Types | 1.2 | 1.1 | Immutable term types with Schema definitions |
| Quad Types | 1.3 | 1.2 | Quad schema depending on terms |
| Data Factory | 1.4 | 1.2, 1.3 | `ImmutableDataFactory` as Effect service |
| Namespace Utility | 1.5 | 1.2 | `namespace()` function, standard namespaces (XSD, RDF, etc.) |

**Phase 1 Critical Path**: 1.1 -> 1.2 -> 1.3 -> 1.4

### Phase 2: Infrastructure

| Task | ID | Depends On | Description |
|------|-----|------------|-------------|
| RdfParser Service | 2.1 | 1.1, 1.3 | Abstract parser interface returning `Effect<Quad[], ParseError>` |
| N3 Parser Impl | 2.2 | 2.1 | N3.js-based parser layer |
| RdfXml Parser Impl | 2.3 | 2.1 | rdfxml-streaming-parser layer |
| JsonLd Parser Impl | 2.4 | 2.1 | jsonld-streaming-parser layer |
| RdfSerializer Service | 2.5 | 1.1, 1.3 | Abstract serializer interface returning `Effect<string, SerializeError>` |
| N3 Serializer Impl | 2.6 | 2.5 | N3.js-based serializer layer |
| JsonLd Serializer Impl | 2.7 | 2.5 | jsonld-streaming-serializer layer |
| Format Detection | 2.8 | 2.1, 2.5 | `detectFormat()` utility |
| SparqlParser Service | 2.9 | 1.1 | sparqljs-based SPARQL parsing |
| SparqlGenerator Service | 2.10 | 1.1 | sparqljs-based SPARQL generation |

**Phase 2 Parallel Opportunities**:
- 2.2, 2.3, 2.4 can run in parallel (all depend on 2.1)
- 2.6, 2.7 can run in parallel (all depend on 2.5)
- Parser track (2.1-2.4) and Serializer track (2.5-2.7) can run in parallel

### Phase 3: Graph Abstraction

| Task | ID | Depends On | Description |
|------|-----|------------|-------------|
| Graph Interface | 3.1 | 1.3, 2.1, 2.5 | `Graph<IsSync>` as Effect service interface |
| MutableGraph Interface | 3.2 | 3.1 | Extends Graph with add/remove |
| ImmutableGraph Interface | 3.3 | 3.1 | Extends Graph with immutable add/remove |
| TransactionalGraph Interface | 3.4 | 3.2 | Extends MutableGraph with begin/commit/rollback |
| SparqlExecutor Service | 3.5 | 2.9, 3.1 | Abstract SPARQL query execution |
| BaseGraph Implementation | 3.6 | 3.1, 3.5, 2.9, 2.10 | Abstract base with `prepareQuery`, `prepareUpdate` |
| QueryOptions Schema | 3.7 | 1.1 | Typed query options |

**Phase 3 Critical Path**: 3.1 -> 3.2, 3.3, 3.4 -> 3.6

### Phase 4: Graph Implementations

| Task | ID | Depends On | Description |
|------|-----|------------|-------------|
| N3Graph | 4.1 | 3.2, 3.6, 2.2 | In-memory mutable graph using N3.js Store |
| ImmutableSetGraph | 4.2 | 3.3, 3.6 | In-memory immutable graph using Immutable.js Set |
| ChangeSetGraph | 4.3 | 4.2, 3.2 | Delta tracking graph wrapping ImmutableSetGraph |
| StardogGraph | 4.4 | 3.4, 3.6, HttpClient | Stardog remote graph with transactions |
| GraphDBGraph | 4.5 | 3.4, 3.6, HttpClient | GraphDB remote graph with transactions |

**Phase 4 Parallel Opportunities**:
- 4.1, 4.2 can run in parallel (independent in-memory implementations)
- 4.4, 4.5 can run in parallel (independent remote implementations)
- 4.3 must wait for 4.2

### Phase 5: High-Level APIs

| Task | ID | Depends On | Description |
|------|-----|------------|-------------|
| Pull API | 5.1 | 4.2, 3.5 | Graph pattern extraction with CONSTRUCT |
| Resource API | 5.2 | 4.3 | Resource wrapper for ChangeSetGraph |
| Skolemize API | 5.3 | 4.3, 1.4 | Blank node skolemization |

**Phase 5 Parallel Opportunities**:
- 5.1, 5.2, 5.3 can all run in parallel once Phase 4 is complete

### Phase 6: Testing Migration

| Task | ID | Depends On | Description |
|------|-----|------------|-------------|
| Test Infrastructure | 6.1 | 4.1 | Effect test utilities, mock layers |
| Unit Test Migration | 6.2 | 6.1, 5.* | Migrate existing unit tests |
| Integration Test Migration | 6.3 | 6.1, 4.4, 4.5 | Migrate Stardog/GraphDB tests |
| Property Tests | 6.4 | 6.1, 1.2 | Add Effect-based property tests |

## Layer Composition Diagram

```
                         ┌──────────────────────────────────┐
                         │          Application             │
                         │   (Effect programs using RDF)    │
                         └──────────────────┬───────────────┘
                                            │
              ┌─────────────────────────────┼─────────────────────────────┐
              │                             │                             │
         ResourceLive                   PullLive                   SkolemizerLive
              │                             │                             │
              └─────────────────────────────┼─────────────────────────────┘
                                            │
                                       GraphLive
                                (depends on impl choice)
                                            │
        ┌───────────────────────────────────┼───────────────────────────────┐
        │                │                  │                  │            │
   N3GraphLive    ImmutableSetLive   ChangeSetLive    StardogLive    GraphDBLive
        │                │                  │                  │            │
        │                │                  │                  │            │
        └────────────────┼──────────────────┼──────────────────┼────────────┘
                         │                  │                  │
                         │           ┌──────┴──────┐           │
                         │           │             │           │
                    (in-memory)  ImmutableSetLive  │    HttpClientLive
                                                   │           │
                                              SparqlExecutorLive
                                                   │
                                            ┌──────┴──────┐
                                            │             │
                                     SparqlParserLive  SparqlGenLive
                                            │
                         ┌──────────────────┼──────────────────┐
                         │                  │                  │
                   N3ParserLive      RdfXmlParserLive   JsonLdParserLive
                         │                  │                  │
                         └──────────────────┼──────────────────┘
                                            │
                                   RdfSerializerLive
                                            │
                         ┌──────────────────┼──────────────────┐
                         │                  │                  │
                   N3SerializerLive        ...          JsonLdSerializerLive
                         │
                         └──────────────────┬──────────────────┘
                                            │
                                     DataFactoryLive
                                            │
                                       TermTypesLive
                                            │
                                       ErrorsLive
```

## Critical Path Analysis

The **critical path** determines minimum migration time:

```
1.1 (Errors)
  │
  v
1.2 (Terms)
  │
  v
1.3 (Quads)
  │
  v
2.1 (RdfParser) ────────────> 2.5 (RdfSerializer)
  │                               │
  v                               v
3.1 (Graph Interface) <───────────┘
  │
  v
3.6 (BaseGraph)
  │
  v
4.1 (N3Graph) OR 4.2 (ImmutableSetGraph)  <- First working graph
  │
  v
5.* (High-Level APIs)
  │
  v
6.2 (Test Migration)
```

**Estimated Critical Path Length**: 12-15 task completions

**Bottleneck Tasks** (many dependents):
- 1.2 (Terms) - everything depends on term types
- 3.1 (Graph Interface) - all implementations depend on this
- 3.6 (BaseGraph) - all graph implementations extend this

## Parallel Work Opportunities

### Maximum Parallelism Points

| Phase | Parallel Tasks | Workers |
|-------|---------------|---------|
| 2 | Parser impls (2.2, 2.3, 2.4) | 3 |
| 2 | Serializer impls (2.6, 2.7) | 2 |
| 2 | Parser track + Serializer track | 2 |
| 4 | In-memory graphs (4.1, 4.2) | 2 |
| 4 | Remote graphs (4.4, 4.5) | 2 |
| 5 | All high-level APIs (5.1, 5.2, 5.3) | 3 |
| 6 | Unit + Integration tests | 2 |

### Recommended Work Streams

**Stream A (Core)**: 1.1 -> 1.2 -> 1.3 -> 3.1 -> 3.6 -> 4.1
**Stream B (Infrastructure)**: 2.1 -> 2.2 -> 2.5 -> 2.6
**Stream C (Secondary Impls)**: 4.2 -> 4.3 -> 5.2

## Risk Mitigation

### Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| N3.js Store incompatibility | Medium | High | Create adapter layer; fallback to pure Effect impl |
| SPARQL algebra translation | Low | Medium | Keep sparqlalgebrajs, wrap in Effect |
| Streaming parser complexity | Medium | Medium | Use Effect.Stream for async parsers |
| Remote graph HTTP errors | Low | Low | Effect error channels handle this naturally |
| Transaction state management | Medium | High | Use Effect.Scope for transaction lifecycle |

### Dependency Risks

| External Dep | Risk | Mitigation |
|--------------|------|------------|
| `n3` | API changes | Pin version, abstract behind service |
| `@comunica/query-sparql` | Heavy dependency | Lazy load, consider alternatives |
| `sparqljs` | Parser quirks | Wrap in try/catch Effect |
| `stardog` SDK | Callback-based | Convert to Effect.tryPromise |

### Migration Risks

| Risk | Mitigation |
|------|------------|
| Breaking API changes | Maintain dual exports during migration |
| Test coverage gaps | Mirror existing tests 1:1 first |
| Performance regression | Benchmark critical paths |

## Backwards Compatibility Strategy

### Phase 1-2: Parallel Implementation

```typescript
// Old API (preserved)
export function parseQuadsFromString(data: string): Quad[] { ... }

// New Effect API (added)
export const parseQuads = (data: string): Effect.Effect<Quad[], ParseError, RdfParser> =>
  Effect.gen(function* () {
    const parser = yield* RdfParser
    return yield* parser.parse(data)
  })
```

### Phase 3-4: Adapter Pattern

```typescript
// Existing class-based Graph
export class N3Graph extends BaseGraph<true> { ... }

// Effect service wrapping existing implementation
export const N3GraphLive = Layer.effect(
  Graph,
  Effect.gen(function* () {
    const graph = new N3Graph()
    return {
      quads: () => Effect.succeed(graph.quads()),
      find: (s, p, o, g) => Effect.succeed(graph.find(s, p, o, g)),
      // ... wrap all methods
    }
  })
)
```

### Phase 5: Dual Export

```typescript
// Legacy promise-based
export async function pull(graph: Graph<any>, expr: PullExpr): Promise<ImmutableSetGraph>

// Effect-based
export const pullEffect = (expr: PullExpr): Effect.Effect<ImmutableSetGraph, QueryError, Graph> =>
  Effect.gen(function* () { ... })
```

## Milestones

### Milestone 1: Core Types Compile

**Included**:
- Tasks 1.1-1.5 (Foundation)
- Basic Schema definitions for all RDF types

**Gate Criteria**:
- `bun run build` succeeds
- All term types have Effect Schema definitions
- `Data.TaggedError` classes for all error types
- Factory service interface defined

**Verification**:
```bash
bun run build
# Check: No type errors
# Check: dist/rdf.js contains Term, Quad exports
```

### Milestone 2: Services Wire Up

**Included**:
- Tasks 2.1-2.10 (Infrastructure)
- Tasks 3.1-3.7 (Graph Abstraction)
- All service interfaces defined

**Gate Criteria**:
- All `Context.Tag` definitions compile
- Layer types are correct (no requirement leakage)
- Service interfaces have `Requirements = never`

**Verification**:
```typescript
// This must type-check:
const program = Effect.gen(function* () {
  const parser = yield* RdfParser
  const serializer = yield* RdfSerializer
  const graph = yield* Graph
  // ...
})
// Type: Effect<void, Error, RdfParser | RdfSerializer | Graph>
```

### Milestone 3: In-Memory Graphs Work

**Included**:
- Tasks 4.1 (N3Graph)
- Tasks 4.2 (ImmutableSetGraph)
- Tasks 4.3 (ChangeSetGraph)

**Gate Criteria**:
- All in-memory graph tests pass
- `add`, `remove`, `find`, `quads` operations work
- SPARQL queries work against in-memory graphs
- Serialization round-trips work

**Verification**:
```bash
bun test test/graph.test.ts
bun test test/changeset-graph.test.ts
# All tests pass
```

### Milestone 4: Remote Graphs Work

**Included**:
- Tasks 4.4 (StardogGraph)
- Tasks 4.5 (GraphDBGraph)

**Gate Criteria**:
- Integration tests pass (with running databases)
- Transaction lifecycle (begin/commit/rollback) works
- HTTP errors surface as Effect errors
- Reasoning toggle works

**Verification**:
```bash
bun run test:integration
# All Stardog + GraphDB tests pass
```

### Milestone 5: High-Level APIs Work

**Included**:
- Tasks 5.1 (Pull)
- Tasks 5.2 (Resource)
- Tasks 5.3 (Skolemize)

**Gate Criteria**:
- `pull()` API returns correct subgraphs
- `resource()` API provides fluent mutations
- `skolemize()` replaces blank nodes correctly
- All high-level API tests pass

**Verification**:
```bash
bun test test/pull.test.ts
bun test test/resource.test.ts
bun test test/skolemize.test.ts
# All tests pass
```

### Milestone 6: Full Test Coverage

**Included**:
- Tasks 6.1-6.4 (Testing)
- All existing tests migrated
- Property tests added

**Gate Criteria**:
- `bun test` passes all tests
- `bun run test:integration` passes all integration tests
- No regressions from original implementation
- Coverage >= original coverage

**Verification**:
```bash
bun run test:all
# All tests pass
# No test files remain unmigrated
```

## Type Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW                                       │
└─────────────────────────────────────────────────────────────────────────────┘

  Input (string/file)
        │
        v
  ┌─────────────────┐
  │   RdfParser     │  Effect<Quad[], ParseError, FileSystem | HttpClient>
  │   (Service)     │
  └────────┬────────┘
           │
           v
  ┌─────────────────┐
  │   Quad[]        │  Schema.Array(QuadSchema)
  │   (Data)        │
  └────────┬────────┘
           │
           v
  ┌─────────────────┐
  │   Graph         │  Effect<Graph, never, GraphProvider>
  │   (Service)     │
  │                 │  Methods return Effect<Result, Error, never>
  │   - quads()     │  -> Effect<Iterable<Quad>, never, never>
  │   - find()      │  -> Effect<Iterable<Quad>, never, never>
  │   - select()    │  -> Effect<Iterable<Bindings>, QueryError, never>
  │   - construct() │  -> Effect<Graph, QueryError, never>
  │   - add()       │  -> Effect<Graph, MutationError, never>
  │   - remove()    │  -> Effect<Graph, MutationError, never>
  └────────┬────────┘
           │
           v
  ┌─────────────────┐
  │   Pull/Resource │  High-level APIs
  │   (Functions)   │
  │                 │
  │   pull()        │  Effect<ImmutableSetGraph, QueryError, Graph>
  │   resource()    │  Effect<Resource, never, ChangeSetGraph>
  │   skolemize()   │  Effect<Graph, never, Graph>
  └────────┬────────┘
           │
           v
  ┌─────────────────┐
  │   RdfSerializer │  Effect<string, SerializeError, never>
  │   (Service)     │
  └────────┬────────┘
           │
           v
  Output (string/file)


┌─────────────────────────────────────────────────────────────────────────────┐
│                              TYPE HIERARCHY                                  │
└─────────────────────────────────────────────────────────────────────────────┘

  Term (base)
    ├── NamedNode<Iri extends string>
    ├── BlankNode
    ├── Literal
    │     ├── value: string
    │     ├── datatype: NamedNode
    │     └── language?: string
    ├── Variable
    ├── DefaultGraph
    └── Quad (triple term for RDF-star)
          ├── subject: Quad_Subject
          ├── predicate: Quad_Predicate
          ├── object: Quad_Object
          └── graph: Quad_Graph

  Quad_Subject = NamedNode | BlankNode | Quad
  Quad_Predicate = NamedNode | Variable
  Quad_Object = NamedNode | BlankNode | Literal | Quad
  Quad_Graph = NamedNode | BlankNode | DefaultGraph | Variable


┌─────────────────────────────────────────────────────────────────────────────┐
│                              ERROR HIERARCHY                                 │
└─────────────────────────────────────────────────────────────────────────────┘

  RdfError (base)
    ├── ParseError
    │     ├── format: string
    │     └── cause: unknown
    ├── SerializeError
    │     ├── format: string
    │     └── cause: unknown
    ├── QueryError
    │     ├── query: string
    │     └── cause: unknown
    ├── MutationError
    │     └── cause: unknown
    ├── TransactionError
    │     ├── phase: "begin" | "commit" | "rollback"
    │     └── cause: unknown
    └── ConnectionError
          ├── endpoint: string
          └── cause: unknown
```

## Implementation Order Summary

For a single developer, recommended order:

1. **Week 1**: Foundation (1.1-1.5)
2. **Week 2**: Infrastructure (2.1-2.10)
3. **Week 3**: Graph Abstraction (3.1-3.7)
4. **Week 4**: In-Memory Graphs (4.1-4.3)
5. **Week 5**: Remote Graphs (4.4-4.5)
6. **Week 6**: High-Level APIs (5.1-5.3)
7. **Week 7-8**: Testing Migration (6.1-6.4)

For two developers:

**Developer A** (Core Path): 1.* -> 3.* -> 4.1 -> 4.4 -> 5.1
**Developer B** (Infrastructure): 2.* -> 4.2 -> 4.3 -> 4.5 -> 5.2, 5.3

Sync points: After Phase 1, after 3.6, after Phase 4
