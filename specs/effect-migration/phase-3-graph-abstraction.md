# Phase 3: Graph Abstraction Layer

## Overview

Phase 3 eliminates the `PromiseOrValue<T, IsSync>` polymorphism pattern by unifying all graph operations under `Effect<T, E, R>`. The current codebase distinguishes between synchronous graphs (`IsSync = true`) like `N3Graph` and asynchronous graphs (`IsSync = false`) like `StardogGraph`/`GraphDBGraph`. With Effect, this distinction becomes unnecessary - Effect handles scheduling internally, and both sync and async operations compose uniformly.

### Key Transformations

| Current Pattern | Effect Pattern |
|----------------|----------------|
| `PromiseOrValue<T, IsSync>` | `Effect.Effect<T, E, R>` |
| `IsSync` type parameter | Eliminated |
| `Promise<void>` transactions | `Effect.scoped` with type-safe state |
| Mutable `transactionId/transactionUrl` | Transaction state in `FiberRef` |
| `try/catch` in callbacks | `Effect.catchTag` with typed errors |

---

## Task 3.1: Core Graph Interface

### Description

Define the base `Graph` interface using Effect return types. This interface represents read-only graph access with all operations returning `Effect<T, GraphError>`. The IRI accessor becomes an effect to support lazy/dynamic resolution.

### Subtasks

- **3.1.1**: Define `GraphError` ADT with variants for all graph operation failures
- **3.1.2**: Define base `Graph` interface with Effect return types
- **3.1.3**: Define `Graph` as a Context.Tag service for dependency injection
- **3.1.4**: Create `GraphIri` type alias for `NamedNode | DefaultGraph`
- **3.1.5**: Define serialization options schema

### Code Examples

```typescript
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import type { Bindings } from "@rdfjs/types"
import type { DefaultGraph, NamedNode, Quad, Term } from "rdf"
import type { AskQuery, ConstructQuery, SelectQuery } from "sparqljs"

// 3.1.1: GraphError ADT
export type GraphError =
  | GraphNotFoundError
  | GraphQueryError
  | GraphSerializationError
  | GraphParseError

export class GraphNotFoundError extends Data.TaggedError("GraphNotFoundError")<{
  readonly iri: string
  readonly message: string
}> {}

export class GraphQueryError extends Data.TaggedError("GraphQueryError")<{
  readonly query: string
  readonly message: string
  readonly cause?: unknown
}> {}

export class GraphSerializationError extends Data.TaggedError("GraphSerializationError")<{
  readonly format: string
  readonly message: string
  readonly cause?: unknown
}> {}

export class GraphParseError extends Data.TaggedError("GraphParseError")<{
  readonly format: string
  readonly input: string
  readonly message: string
  readonly cause?: unknown
}> {}

// 3.1.4: GraphIri type alias
export type GraphIri = NamedNode | DefaultGraph

// 3.1.5: Serialization options
export const SerializationOptions = Schema.Struct({
  format: Schema.optional(Schema.String),
  prefixes: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
  baseIRI: Schema.optional(Schema.String)
})

export type SerializationOptions = Schema.Schema.Type<typeof SerializationOptions>

// 3.1.2: Query options
export const QueryOptions = Schema.Struct({
  reasoning: Schema.optional(Schema.Boolean)
})

export type QueryOptions = Schema.Schema.Type<typeof QueryOptions>

// 3.1.2: Core Graph interface
export interface Graph {
  readonly iri: Effect.Effect<GraphIri>

  readonly quads: () => Effect.Effect<Iterable<Quad>, GraphQueryError>

  readonly find: (
    subject?: Term | null,
    predicate?: Term | null,
    object?: Term | null,
    graph?: Term | null
  ) => Effect.Effect<Iterable<Quad>, GraphQueryError>

  readonly select: (
    query: SelectQuery | string,
    options?: QueryOptions
  ) => Effect.Effect<Iterable<Bindings>, GraphQueryError>

  readonly ask: (
    query: AskQuery | string,
    options?: QueryOptions
  ) => Effect.Effect<boolean, GraphQueryError>

  readonly construct: (
    query: ConstructQuery | string,
    options?: QueryOptions
  ) => Effect.Effect<Graph, GraphQueryError>

  readonly withIri: (iri: GraphIri | undefined) => Graph

  readonly toString: (
    options?: SerializationOptions
  ) => Effect.Effect<string, GraphSerializationError>

  readonly saveToFile: (
    path: string,
    options?: SerializationOptions
  ) => Effect.Effect<void, GraphSerializationError>
}

// 3.1.3: Graph as Context.Tag
export interface GraphService extends Graph {}

export const GraphService = Context.GenericTag<GraphService>("@rdf-utils/Graph")
```

### Gates

- [ ] `GraphError` ADT covers all failure modes from current implementations
- [ ] All methods return `Effect.Effect<T, E>` with `R = never`
- [ ] No `IsSync` type parameter anywhere in interface
- [ ] `QueryOptions` uses Schema for validation
- [ ] `bunx tsc --noEmit` passes with interface definition

---

## Task 3.2: MutableGraph Interface

### Description

Extend `Graph` with mutation operations. All mutations return `Effect<this, GraphError>` enabling method chaining while maintaining referential transparency. The `update` method handles SPARQL UPDATE operations.

### Subtasks

- **3.2.1**: Define `GraphMutationError` for write failures
- **3.2.2**: Define `MutableGraph` interface extending `Graph`
- **3.2.3**: Define `MutableGraph` Context.Tag
- **3.2.4**: Define `ImmutableGraph` interface for copy-on-write semantics

### Code Examples

```typescript
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import type { Quad } from "@rdfjs/types"
import type { Update } from "sparqljs"

// 3.2.1: Mutation-specific errors
export class GraphMutationError extends Data.TaggedError("GraphMutationError")<{
  readonly operation: "add" | "remove" | "deleteAll" | "update"
  readonly message: string
  readonly cause?: unknown
}> {}

// 3.2.2: MutableGraph interface
export interface MutableGraph extends Graph {
  readonly add: (
    quads: Iterable<Quad>
  ) => Effect.Effect<this, GraphMutationError>

  readonly remove: (
    quads: Iterable<Quad>
  ) => Effect.Effect<this, GraphMutationError>

  readonly deleteAll: () => Effect.Effect<void, GraphMutationError>

  readonly update: (
    query: Update | string,
    options?: QueryOptions
  ) => Effect.Effect<void, GraphMutationError | GraphQueryError>
}

// 3.2.3: MutableGraph Context.Tag
export interface MutableGraphService extends MutableGraph {}

export const MutableGraphService = Context.GenericTag<MutableGraphService>(
  "@rdf-utils/MutableGraph"
)

// 3.2.4: ImmutableGraph for copy-on-write semantics
export interface ImmutableGraph extends Graph {
  readonly add: (
    quads: Iterable<Quad>
  ) => Effect.Effect<ImmutableGraph, GraphMutationError>

  readonly remove: (
    quads: Iterable<Quad>
  ) => Effect.Effect<ImmutableGraph, GraphMutationError>
}

// Union type for writable graphs
export type WritableGraph = MutableGraph | ImmutableGraph
```

### Gates

- [ ] `add` and `remove` return `Effect<this>` for chaining
- [ ] `deleteAll` handles default graph restriction (fails for DefaultGraph)
- [ ] `update` accepts both parsed and string queries
- [ ] No mutable state in interface signatures

---

## Task 3.3: TransactionalGraph Interface

### Description

Define transaction semantics using a type-safe state machine. Transactions are scoped resources managed via `Effect.acquireUseRelease`. The transaction state is tracked in a `FiberRef` to avoid mutable class properties.

### Subtasks

- **3.3.1**: Define `TransactionState` ADT with type-safe transitions
- **3.3.2**: Define `TransactionError` variants
- **3.3.3**: Define `TransactionalGraph` interface
- **3.3.4**: Implement `withTransaction` helper using `Effect.acquireUseRelease`
- **3.3.5**: Define `TransactionContext` for tracking active transaction state

### Code Examples

```typescript
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as FiberRef from "effect/FiberRef"
import * as Scope from "effect/Scope"

// 3.3.1: Transaction state machine
export type TransactionState =
  | NotStarted
  | Active
  | Committed
  | RolledBack

export class NotStarted extends Data.TaggedClass("NotStarted")<{}> {}

export class Active extends Data.TaggedClass("Active")<{
  readonly id: string  // Transaction ID or URL depending on backend
  readonly startedAt: Date
}> {}

export class Committed extends Data.TaggedClass("Committed")<{
  readonly id: string
  readonly committedAt: Date
}> {}

export class RolledBack extends Data.TaggedClass("RolledBack")<{
  readonly id: string
  readonly rolledBackAt: Date
  readonly reason?: string
}> {}

// 3.3.2: Transaction errors
export class TransactionError extends Data.TaggedError("TransactionError")<{
  readonly operation: "begin" | "commit" | "rollback"
  readonly state: TransactionState
  readonly message: string
  readonly cause?: unknown
}> {}

export class TransactionAlreadyActiveError extends Data.TaggedError(
  "TransactionAlreadyActiveError"
)<{
  readonly existingTransactionId: string
}> {}

export class NoActiveTransactionError extends Data.TaggedError(
  "NoActiveTransactionError"
)<{
  readonly attemptedOperation: "commit" | "rollback"
}> {}

// 3.3.5: Transaction context tracked via FiberRef
export interface TransactionContext {
  readonly state: TransactionState
  readonly transactionId: string | null
}

export const TransactionContext = FiberRef.unsafeMake<TransactionContext>({
  state: new NotStarted(),
  transactionId: null
})

// 3.3.3: TransactionalGraph interface
export interface TransactionalGraph extends MutableGraph {
  readonly begin: () => Effect.Effect<
    void,
    TransactionAlreadyActiveError | TransactionError
  >

  readonly commit: () => Effect.Effect<
    void,
    NoActiveTransactionError | TransactionError
  >

  readonly rollback: () => Effect.Effect<
    void,
    NoActiveTransactionError | TransactionError
  >

  readonly inTransaction: <A, E, R>(
    fn: (graph: TransactionalGraph) => Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | TransactionError, R>
}

// 3.3.3: TransactionalGraph Context.Tag
export interface TransactionalGraphService extends TransactionalGraph {}

export const TransactionalGraphService = Context.GenericTag<TransactionalGraphService>(
  "@rdf-utils/TransactionalGraph"
)

// 3.3.4: withTransaction helper using acquireUseRelease
export const withTransaction = <A, E, R>(
  graph: TransactionalGraph,
  use: (txGraph: TransactionalGraph) => Effect.Effect<A, E, R>
): Effect.Effect<A, E | TransactionError, R | Scope.Scope> =>
  Effect.acquireUseRelease(
    // Acquire: begin transaction
    Effect.gen(function* () {
      yield* graph.begin()
      return graph
    }),
    // Use: execute operations within transaction
    (txGraph) => use(txGraph),
    // Release: commit on success, rollback on failure
    (txGraph, exit) =>
      exit._tag === "Success"
        ? graph.commit().pipe(Effect.orDie)
        : graph.rollback().pipe(Effect.orDie)
  )

// Scoped variant that manages the Scope automatically
export const withTransactionScoped = <A, E, R>(
  graph: TransactionalGraph,
  use: (txGraph: TransactionalGraph) => Effect.Effect<A, E, R>
): Effect.Effect<A, E | TransactionError, R> =>
  Effect.scoped(withTransaction(graph, use))
```

### Transaction State Machine Diagram

```
                    begin()
    NotStarted ─────────────────> Active
                                    │
                    ┌───────────────┴───────────────┐
                    │ commit()                       │ rollback()
                    ▼                               ▼
                Committed                      RolledBack
```

### Gates

- [ ] Transaction state machine prevents invalid transitions at type level
- [ ] `withTransaction` uses `Effect.acquireUseRelease`
- [ ] Transaction ID tracked via `FiberRef`, not mutable property
- [ ] Automatic rollback on unhandled errors
- [ ] `TransactionState` is a proper ADT with exhaustive matching

---

## Task 3.4: SparqlExecutor Service

### Description

Abstract SPARQL query execution into a dedicated service. This separates query execution concerns from graph representation, enabling different backends (Stardog, GraphDB, Comunica) to be injected. The executor handles query parsing, validation, and result stream management.

### Subtasks

- **3.4.1**: Define `SparqlResult` ADT for different query result types
- **3.4.2**: Define `SparqlExecutor` interface
- **3.4.3**: Create `SparqlExecutor` Context.Tag
- **3.4.4**: Define execution options schema
- **3.4.5**: Define streaming result types for large result sets

### Code Examples

```typescript
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Stream from "effect/Stream"
import * as Schema from "effect/Schema"
import type { Bindings } from "@rdfjs/types"
import type { Quad } from "rdf"
import type { Query, SparqlQuery, Update } from "sparqljs"

// 3.4.1: SparqlResult ADT
export type SparqlResult =
  | BindingsResult
  | BooleanResult
  | QuadsResult

export class BindingsResult extends Data.TaggedClass("BindingsResult")<{
  readonly bindings: Iterable<Bindings>
}> {}

export class BooleanResult extends Data.TaggedClass("BooleanResult")<{
  readonly value: boolean
}> {}

export class QuadsResult extends Data.TaggedClass("QuadsResult")<{
  readonly quads: Iterable<Quad>
}> {}

// 3.4.4: Execution options
export const ExecutionOptions = Schema.Struct({
  reasoning: Schema.optional(Schema.Boolean),
  timeout: Schema.optional(Schema.Number),
  limit: Schema.optional(Schema.Number)
})

export type ExecutionOptions = Schema.Schema.Type<typeof ExecutionOptions>

// 3.4.5: Streaming result types
export interface StreamingBindingsResult {
  readonly _tag: "StreamingBindingsResult"
  readonly stream: Stream.Stream<Bindings, GraphQueryError>
}

export interface StreamingQuadsResult {
  readonly _tag: "StreamingQuadsResult"
  readonly stream: Stream.Stream<Quad, GraphQueryError>
}

export type StreamingSparqlResult = StreamingBindingsResult | StreamingQuadsResult

// 3.4.2: SparqlExecutor interface
export interface SparqlExecutor {
  readonly execute: (
    query: SparqlQuery,
    options?: ExecutionOptions
  ) => Effect.Effect<SparqlResult, GraphQueryError>

  readonly executeUpdate: (
    update: Update,
    options?: ExecutionOptions
  ) => Effect.Effect<void, GraphMutationError>

  readonly executeStreaming: (
    query: SparqlQuery,
    options?: ExecutionOptions
  ) => Effect.Effect<StreamingSparqlResult, GraphQueryError>
}

// 3.4.3: SparqlExecutor Context.Tag
export interface SparqlExecutorService extends SparqlExecutor {}

export const SparqlExecutorService = Context.GenericTag<SparqlExecutorService>(
  "@rdf-utils/SparqlExecutor"
)

// Layer construction helpers for different backends
export const makeSparqlExecutor = (
  config: SparqlExecutorConfig
): Effect.Effect<SparqlExecutor, never, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient

    return {
      execute: (query, options) =>
        Effect.gen(function* () {
          // Implementation varies by backend
          // ...
        }),
      executeUpdate: (update, options) =>
        Effect.gen(function* () {
          // Implementation varies by backend
          // ...
        }),
      executeStreaming: (query, options) =>
        Effect.gen(function* () {
          // Returns Stream for memory-efficient processing
          // ...
        })
    }
  })
```

### Gates

- [ ] `SparqlResult` ADT covers all SPARQL result types
- [ ] Streaming support for large result sets
- [ ] `SparqlExecutor` is a Context.Tag service
- [ ] Execution options validated via Schema
- [ ] No direct HTTP/backend dependencies in interface

---

## Task 3.5: QueryPreparation Service

### Description

Centralize query parsing, validation, and transformation. This service handles converting string queries to parsed AST, injecting graph context (FROM clauses), applying prefixes, and substituting variable bindings.

### Subtasks

- **3.5.1**: Define `QueryPreparationError` variants
- **3.5.2**: Define `QueryPreparation` interface
- **3.5.3**: Create `QueryPreparation` Context.Tag
- **3.5.4**: Implement graph context injection (FROM clause handling)
- **3.5.5**: Implement variable binding substitution

### Code Examples

```typescript
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import type {
  AskQuery,
  ConstructQuery,
  Query,
  SelectQuery,
  SparqlQuery,
  Update
} from "sparqljs"
import type { Term } from "@rdfjs/types"

// 3.5.1: Query preparation errors
export class QueryParseError extends Data.TaggedError("QueryParseError")<{
  readonly queryString: string
  readonly position?: { line: number; column: number }
  readonly message: string
  readonly cause?: unknown
}> {}

export class QueryValidationError extends Data.TaggedError("QueryValidationError")<{
  readonly query: SparqlQuery
  readonly expectedType: string
  readonly actualType: string
  readonly message: string
}> {}

export type QueryPreparationError = QueryParseError | QueryValidationError

// 3.5.2: QueryPreparation interface
export interface QueryPreparation {
  readonly parseQuery: (
    queryString: string
  ) => Effect.Effect<SparqlQuery, QueryParseError>

  readonly parseUpdate: (
    updateString: string
  ) => Effect.Effect<Update, QueryParseError>

  readonly prepareSelect: (
    query: SelectQuery | string,
    graphIri?: GraphIri
  ) => Effect.Effect<SelectQuery, QueryPreparationError>

  readonly prepareAsk: (
    query: AskQuery | string,
    graphIri?: GraphIri
  ) => Effect.Effect<AskQuery, QueryPreparationError>

  readonly prepareConstruct: (
    query: ConstructQuery | string,
    graphIri?: GraphIri
  ) => Effect.Effect<ConstructQuery, QueryPreparationError>

  readonly prepareUpdate: (
    update: Update | string,
    graphIri?: GraphIri
  ) => Effect.Effect<Update, QueryPreparationError>

  readonly stringify: (query: SparqlQuery | Update) => Effect.Effect<string>

  readonly substituteBindings: (
    query: SparqlQuery,
    bindings: ReadonlyMap<string, Term>
  ) => Effect.Effect<SparqlQuery>
}

// 3.5.3: QueryPreparation Context.Tag
export interface QueryPreparationService extends QueryPreparation {}

export const QueryPreparationService = Context.GenericTag<QueryPreparationService>(
  "@rdf-utils/QueryPreparation"
)

// Default implementation using sparqljs
export const makeQueryPreparation = (
  prefixes: Record<string, string>
): QueryPreparation => ({
  parseQuery: (queryString) =>
    Effect.try({
      try: () => {
        const parser = new Parser({ prefixes, sparqlStar: true })
        return parser.parse(queryString)
      },
      catch: (error) =>
        new QueryParseError({
          queryString,
          message: String(error),
          cause: error
        })
    }),

  parseUpdate: (updateString) =>
    Effect.try({
      try: () => {
        const parser = new Parser({ prefixes, sparqlStar: true })
        return parser.parse(updateString) as Update
      },
      catch: (error) =>
        new QueryParseError({
          queryString: updateString,
          message: String(error),
          cause: error
        })
    }),

  prepareSelect: (query, graphIri) =>
    Effect.gen(function* () {
      const parsed = typeof query === "string"
        ? yield* this.parseQuery(query)
        : query

      if (parsed.type !== "query" || parsed.queryType !== "SELECT") {
        return yield* Effect.fail(
          new QueryValidationError({
            query: parsed,
            expectedType: "SELECT",
            actualType: parsed.type === "query" ? parsed.queryType : parsed.type,
            message: `Expected SELECT query`
          })
        )
      }

      // Inject graph context via FROM clause
      return injectGraphContext(parsed, graphIri) as SelectQuery
    }),

  // Similar implementations for prepareAsk, prepareConstruct, prepareUpdate...

  stringify: (query) =>
    Effect.sync(() => {
      const generator = new Generator({ prefixes, sparqlStar: true })
      return generator.stringify(query)
    }),

  substituteBindings: (query, bindings) =>
    Effect.sync(() => substituteVariables(query, bindings))
})

// Helper: inject FROM clause for graph context
const injectGraphContext = <Q extends Query>(
  query: Q,
  graphIri?: GraphIri
): Q => {
  if (!graphIri || graphIri.termType === "DefaultGraph") {
    return query
  }

  return {
    ...query,
    from: {
      default: [...(query.from?.default ?? []), graphIri],
      named: query.from?.named ?? []
    }
  }
}
```

### Gates

- [ ] Parse errors include position information when available
- [ ] Validation errors specify expected vs actual query type
- [ ] Graph context injection handles both NamedNode and DefaultGraph
- [ ] RDF-star syntax enabled via `sparqlStar: true`
- [ ] Global prefix map merged with query prefixes

---

## Task 3.6: Graph Factory Service

### Description

Provide a factory service for creating graph instances from various sources (strings, files, URIs). This centralizes format detection, parsing, and graph construction.

### Subtasks

- **3.6.1**: Define `GraphFactory` interface
- **3.6.2**: Create `GraphFactory` Context.Tag
- **3.6.3**: Implement format detection logic
- **3.6.4**: Support RDF-star formats

### Code Examples

```typescript
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import type { FileSystem } from "@effect/platform"

// Format detection
export const RdfFormat = Schema.Literal(
  "text/turtle",
  "text/turtle*",
  "application/n-triples",
  "application/n-triples*",
  "application/n-quads",
  "application/n-quads*",
  "application/trig",
  "application/trig*",
  "application/rdf+xml",
  "application/ld+json"
)

export type RdfFormat = Schema.Schema.Type<typeof RdfFormat>

export interface GraphFactory {
  readonly fromString: (
    data: string,
    options?: { format?: RdfFormat; baseIRI?: string }
  ) => Effect.Effect<Graph, GraphParseError>

  readonly fromFile: (
    path: string,
    options?: { format?: RdfFormat }
  ) => Effect.Effect<Graph, GraphParseError>

  readonly empty: (iri?: GraphIri) => Effect.Effect<MutableGraph>

  readonly detectFormat: (
    content: string,
    filePath?: string
  ) => Effect.Effect<RdfFormat | undefined>
}

export interface GraphFactoryService extends GraphFactory {}

export const GraphFactoryService = Context.GenericTag<GraphFactoryService>(
  "@rdf-utils/GraphFactory"
)

// Layer that provides GraphFactory with FileSystem dependency
export const GraphFactoryLive = Layer.effect(
  GraphFactoryService,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem

    return {
      fromString: (data, options) =>
        Effect.gen(function* () {
          const format = options?.format ?? (yield* detectFormatFromContent(data))
          const quads = yield* parseQuads(data, format, options?.baseIRI)
          return makeN3Graph(quads)
        }),

      fromFile: (path, options) =>
        Effect.gen(function* () {
          const content = yield* fs.readFileString(path)
          const format = options?.format ?? (yield* detectFormatFromPath(path, content))
          const quads = yield* parseQuads(content, format)
          return makeN3Graph(quads)
        }),

      empty: (iri) => Effect.succeed(makeN3Graph([], iri)),

      detectFormat: (content, filePath) =>
        Effect.sync(() => detectFormatImpl(content, filePath))
    }
  })
)
```

### Gates

- [ ] Format detection handles file extensions and content sniffing
- [ ] RDF-star formats properly detected (embedded `<<` `>>` syntax)
- [ ] JSON-LD format detected from `@context`
- [ ] RDF/XML format detected from XML structure

---

## Phase Gates

### Type Safety

- [ ] `Graph` interface uses `Effect<T, E, R>` not `PromiseOrValue`
- [ ] No `IsSync` type parameter anywhere in codebase
- [ ] Transaction state machine prevents invalid state transitions at compile time
- [ ] All errors are tagged error classes extending `Data.TaggedError`

### Architecture

- [ ] `SparqlExecutor` is a Context.Tag service, not a method on Graph
- [ ] `QueryPreparation` handles all query parsing/validation
- [ ] Transaction state tracked via `FiberRef`, not mutable properties
- [ ] `withTransaction` helper uses `Effect.acquireUseRelease`

### Testing

- [ ] `bunx tsc --noEmit` passes with all interface definitions
- [ ] Interface tests pass using mock implementations
- [ ] Transaction state machine tests cover all valid transitions
- [ ] Transaction tests verify automatic rollback on error

### Backward Compatibility

- [ ] Existing synchronous patterns can be adapted (Effect.sync wrapping)
- [ ] Promise-based code can bridge via `Effect.promise` / `Effect.runPromise`

---

## Dependencies

### Depends On

- **Phase 1**: Error ADT base classes, Term Schemas for RDF terms
- **Phase 2**: Query error types (`GraphQueryError` extends Phase 2 patterns)

### Required By

- **Phase 4**: Concrete implementations (StardogGraph, GraphDBGraph, N3Graph)
- **Phase 5**: Higher-level APIs (ChangeSetGraph, Resource utilities)

---

## Migration Path

### From Current to Effect

```typescript
// Current: PromiseOrValue with IsSync
interface Graph<IsSync> {
  quads(): PromiseOrValue<Iterable<Quad>, IsSync>
}

// Effect: Unified interface
interface Graph {
  readonly quads: () => Effect.Effect<Iterable<Quad>, GraphQueryError>
}

// Current: Mutable transaction state
class StardogGraph {
  transactionId: string | null = null

  async begin() {
    this.transactionId = await this.beginTransaction()
  }
}

// Effect: FiberRef-based state
const withTransaction = Effect.gen(function* () {
  const state = yield* FiberRef.get(TransactionContext)
  // State tracked in fiber, not object property
})

// Current: try/catch callbacks
async inTransaction(fn) {
  try {
    await this.begin()
    await fn(this)
    await this.commit()
  } catch (err) {
    await this.rollback()
    throw err
  }
}

// Effect: acquireUseRelease
const withTransaction = Effect.acquireUseRelease(
  graph.begin(),
  (txGraph) => use(txGraph),
  (txGraph, exit) => exit._tag === "Success" ? graph.commit() : graph.rollback()
)
```

---

## Open Questions

1. **Graph Identity**: Should `withIri` return a new Graph instance or mutate? Current returns new, Effect should preserve this.

2. **Streaming**: Should `quads()` return `Stream<Quad>` for large graphs, or keep `Effect<Iterable<Quad>>`? Consider separate `streamQuads()` method.

3. **Reasoning Parameter**: Currently passed per-query. Should reasoning be a separate capability/service?

4. **Backend Configuration**: Should backend-specific config (Stardog pragmas, GraphDB infer parameter) be abstracted or exposed?
