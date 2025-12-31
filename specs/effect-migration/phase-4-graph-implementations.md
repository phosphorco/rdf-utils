# Phase 4: Graph Implementations

## Overview

Phase 4 transforms each concrete graph implementation into an Effect Layer that provides the `Graph` service. Each implementation encapsulates its specific storage mechanism (N3.Store, Immutable.js Set, remote HTTP endpoints) while exposing a uniform `Graph` interface.

Key design principles:
- Each graph is a `Layer<Graph, ConfigError | HttpError, Requirements>`
- In-memory graphs (N3Graph, ImmutableSetGraph) use `Ref` for state management
- Remote graphs (StardogGraph, GraphDBGraph) implement transaction state machines
- ChangeSetGraph wraps another Graph and tracks deltas
- All async operations return `Effect` instead of `Promise`

## Task 4.1: N3GraphLive Layer

### Description

N3Graph wraps an N3.Store for in-memory quad storage with Comunica for SPARQL execution. The Effect version uses `Ref<n3.Store>` for state management and converts all operations to Effect.

### Subtasks

#### 4.1.1: Create N3Graph Module Structure

```typescript
// src/effect/graph/n3.ts
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as n3 from "n3"
import type { QueryEngine } from "@comunica/query-sparql"
import type { Graph, GraphConfig } from "../Graph"
import type { Quad, NamedNode, DefaultGraph } from "../../rdf"

export class N3GraphError extends Data.TaggedError("N3GraphError")<{
  readonly operation: string
  readonly cause?: unknown
}> {}
```

#### 4.1.2: Implement N3GraphLive Layer

```typescript
export interface N3GraphConfig {
  readonly iri?: NamedNode | DefaultGraph
}

export const N3GraphConfig = Context.GenericTag<N3GraphConfig>("@rdf-utils/N3GraphConfig")

const make = Effect.gen(function* () {
  const config = yield* Effect.serviceOption(N3GraphConfig)
  const iri = config.pipe(
    Option.flatMap(c => Option.fromNullable(c.iri)),
    Option.getOrElse(() => factory.defaultGraph())
  )

  const storeRef = yield* Ref.make(new n3.Store([], { factory }))
  const queryEngine = yield* Effect.sync(() => new QueryEngine())

  return Graph.of({
    iri,

    quads: Effect.gen(function* () {
      const store = yield* Ref.get(storeRef)
      return store.match(null, null, null, null).toArray()
    }),

    find: (subject, predicate, object, graph) =>
      Effect.gen(function* () {
        const store = yield* Ref.get(storeRef)
        return store.match(subject, predicate, object, graph)
      }),

    add: (quads) =>
      Effect.gen(function* () {
        yield* Ref.update(storeRef, (store) => {
          for (const quad of quads) {
            const g = quad.graph.termType === "DefaultGraph" ? iri : quad.graph
            store.addQuad(factory.quad(quad.subject, quad.predicate, quad.object, g))
          }
          return store
        })
      }),

    remove: (quads) =>
      Effect.gen(function* () {
        yield* Ref.update(storeRef, (store) => {
          for (const quad of quads) {
            const g = quad.graph.termType === "DefaultGraph" ? iri : quad.graph
            store.removeQuad(factory.quad(quad.subject, quad.predicate, quad.object, g))
          }
          return store
        })
      }),

    deleteAll: Effect.gen(function* () {
      yield* Ref.update(storeRef, (store) => {
        const quads = store.match(null, null, null, null)
        for (const quad of quads) {
          store.removeQuad(quad)
        }
        return store
      })
    }),

    sparql: (query, options) =>
      Effect.tryPromise({
        try: async () => {
          const store = await Effect.runPromise(Ref.get(storeRef))
          return queryEngine.query(translate(query), { sources: [store] })
        },
        catch: (error) => new N3GraphError({ operation: "sparql", cause: error })
      }),

    withIri: (newIri) =>
      // Returns a view into the same store with different IRI
      Effect.succeed(/* Create new Graph pointing to same storeRef */)
  })
})

export const N3GraphLive: Layer.Layer<Graph, never, never> =
  Layer.effect(Graph, make)

export const N3GraphLiveConfig = (config: N3GraphConfig): Layer.Layer<Graph, never, never> =>
  Layer.effect(Graph, make).pipe(
    Layer.provide(Layer.succeed(N3GraphConfig, config))
  )
```

#### 4.1.3: Wire up SPARQL Execution (Comunica)

The Comunica QueryEngine is stateless and can be created once. SPARQL operations:

```typescript
// SELECT query execution
const executeSelect = (query: SelectQuery, options?: QueryOptions) =>
  Effect.gen(function* () {
    const store = yield* Ref.get(storeRef)
    const result = yield* Effect.tryPromise({
      try: () => queryEngine.query(translate(query), { sources: [store] }),
      catch: (e) => new SparqlError({ operation: "select", cause: e })
    })

    if (result.resultType !== "bindings") {
      return yield* Effect.fail(new SparqlError({
        operation: "select",
        cause: "Expected bindings result"
      }))
    }

    // Stream bindings to array
    return yield* Effect.tryPromise({
      try: async () => {
        const bindings: Bindings[] = []
        const stream = await result.execute()
        for await (const binding of stream) {
          bindings.push(binding)
        }
        return bindings
      },
      catch: (e) => new SparqlError({ operation: "select-execute", cause: e })
    })
  })

// UPDATE query execution
const executeUpdate = (query: Update, options?: QueryOptions) =>
  Effect.gen(function* () {
    const store = yield* Ref.get(storeRef)
    const generator = new Generator({ prefixes: query.prefixes, sparqlStar: true })
    const queryString = generator.stringify(query)

    yield* Effect.tryPromise({
      try: () => queryEngine.queryVoid(queryString, { sources: [store] }),
      catch: (e) => new SparqlError({ operation: "update", cause: e })
    })
  })
```

### Gates

- [ ] `Layer.effect(Graph, make)` compiles with no type errors
- [ ] `Ref<n3.Store>` properly encapsulates mutable state
- [ ] SPARQL queries execute through Comunica
- [ ] `withIri` creates view sharing same store

---

## Task 4.2: ImmutableSetGraphLive Layer

### Description

ImmutableSetGraph uses Immutable.js `Set<Quad>` for storage. The Effect version uses `Ref<Set<Quad>>` where mutations return new Sets. Quads require custom hashing via a wrapper for proper Set equality.

### Subtasks

#### 4.2.1: QuadWrapper for Proper Hashing

Immutable.js requires `hashCode()` and `equals()` for custom value equality:

```typescript
// src/effect/graph/immutable.ts
import { Set, ValueObject } from "immutable"
import * as Ref from "effect/Ref"

class QuadWrapper implements ValueObject {
  constructor(readonly quad: Quad) {}

  equals(other: unknown): boolean {
    if (!(other instanceof QuadWrapper)) return false
    return this.quad.equals(other.quad)
  }

  hashCode(): number {
    // Combine hashes of all quad components
    let hash = 17
    hash = hash * 31 + hashString(this.quad.subject.value)
    hash = hash * 31 + hashString(this.quad.predicate.value)
    hash = hash * 31 + hashString(this.quad.object.value)
    hash = hash * 31 + hashString(this.quad.graph.value)
    return hash | 0
  }
}

const hashString = (str: string): number => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0
  }
  return hash
}
```

#### 4.2.2: Implement ImmutableSetGraphLive Layer

```typescript
export interface ImmutableSetGraphConfig {
  readonly iri?: NamedNode | DefaultGraph
  readonly initialQuads?: Iterable<Quad>
}

export const ImmutableSetGraphConfig =
  Context.GenericTag<ImmutableSetGraphConfig>("@rdf-utils/ImmutableSetGraphConfig")

const make = Effect.gen(function* () {
  const config = yield* Effect.serviceOption(ImmutableSetGraphConfig)
  const iri = config.pipe(
    Option.flatMap(c => Option.fromNullable(c.iri)),
    Option.getOrElse(() => factory.defaultGraph())
  )

  const initialQuads = config.pipe(
    Option.flatMap(c => Option.fromNullable(c.initialQuads)),
    Option.getOrElse(() => [] as Iterable<Quad>)
  )

  const dataRef = yield* Ref.make(Set(Array.from(initialQuads).map(q => new QuadWrapper(q))))
  const queryEngine = yield* Effect.sync(() => new QueryEngine())

  // Helper to unwrap QuadWrappers
  const unwrapQuads = (wrappers: Set<QuadWrapper>): Quad[] =>
    wrappers.toArray().map(w => w.quad)

  return Graph.of({
    iri,

    quads: Effect.gen(function* () {
      const data = yield* Ref.get(dataRef)
      return unwrapQuads(data)
    }),

    find: (subject, predicate, object, graph) =>
      Effect.gen(function* () {
        const data = yield* Ref.get(dataRef)
        return unwrapQuads(data.filter(w => {
          const q = w.quad
          if (subject && !q.subject.equals(subject)) return false
          if (predicate && !q.predicate.equals(predicate)) return false
          if (object && !q.object.equals(object)) return false
          if (graph && !q.graph.equals(graph)) return false
          return true
        }))
      }),

    add: (quads) =>
      Ref.update(dataRef, (data) =>
        data.withMutations(mutable => {
          for (const quad of quads) {
            const g = quad.graph.termType === "DefaultGraph" ? iri : quad.graph
            mutable.add(new QuadWrapper(
              factory.quad(quad.subject, quad.predicate, quad.object, g)
            ))
          }
        })
      ),

    remove: (quads) =>
      Ref.update(dataRef, (data) =>
        data.withMutations(mutable => {
          for (const quad of quads) {
            const g = quad.graph.termType === "DefaultGraph" ? iri : quad.graph
            mutable.remove(new QuadWrapper(
              factory.quad(quad.subject, quad.predicate, quad.object, g)
            ))
          }
        })
      ),

    deleteAll: Ref.set(dataRef, Set<QuadWrapper>()),

    // SPARQL via Comunica using RDF/JS Source interface
    sparql: (query, options) =>
      Effect.gen(function* () {
        const data = yield* Ref.get(dataRef)
        // Create Source adapter for Comunica
        const source = createSource(data)
        return yield* Effect.tryPromise({
          try: () => queryEngine.query(translate(query), { sources: [source] }),
          catch: (e) => new ImmutableGraphError({ operation: "sparql", cause: e })
        })
      }),

    withIri: (newIri) =>
      // ImmutableSetGraph can share the Ref since mutations create new Sets
      Effect.succeed(/* Create new Graph pointing to same dataRef */)
  })
})

export const ImmutableSetGraphLive: Layer.Layer<Graph, never, never> =
  Layer.effect(Graph, make)
```

#### 4.2.3: RDF/JS Source Adapter for Comunica

```typescript
import type { Source, Stream } from "@rdfjs/types"
import { Readable } from "stream"

const createSource = (data: Set<QuadWrapper>): Source<Quad> => ({
  match: (subject, predicate, object, graph): Stream<Quad> => {
    const filtered = data.filter(w => {
      const q = w.quad
      if (subject && !q.subject.equals(subject)) return false
      if (predicate && !q.predicate.equals(predicate)) return false
      if (object && !q.object.equals(object)) return false
      if (graph && !q.graph.equals(graph)) return false
      return true
    })
    return Readable.from(unwrapQuads(filtered))
  }
})
```

### Gates

- [ ] QuadWrapper properly implements `ValueObject`
- [ ] Set operations use immutable updates via `withMutations`
- [ ] Comunica integration works via Source adapter
- [ ] `Ref<Set<QuadWrapper>>` encapsulates state

---

## Task 4.3: ChangeSetGraphLive Layer

### Description

ChangeSetGraph tracks additions and removals as deltas against a base graph. The Effect version uses `Ref` for the current state plus added/removed Sets. This enables applying deltas to other graphs.

### Subtasks

#### 4.3.1: ChangeSet State Model

```typescript
// src/effect/graph/changeset.ts
import { Set } from "immutable"

interface ChangeSetState {
  readonly current: Set<QuadWrapper>
  readonly added: Set<QuadWrapper>
  readonly removed: Set<QuadWrapper>
}

export class ChangeSetGraphError extends Data.TaggedError("ChangeSetGraphError")<{
  readonly operation: string
  readonly cause?: unknown
}> {}
```

#### 4.3.2: Implement ChangeSetGraphLive Layer

```typescript
export interface ChangeSetGraphConfig {
  readonly iri?: NamedNode | DefaultGraph
  readonly baseGraph?: Graph  // Optional base graph to track changes against
}

export const ChangeSetGraphConfig =
  Context.GenericTag<ChangeSetGraphConfig>("@rdf-utils/ChangeSetGraphConfig")

const make = Effect.gen(function* () {
  const config = yield* Effect.serviceOption(ChangeSetGraphConfig)
  const iri = config.pipe(
    Option.flatMap(c => Option.fromNullable(c.iri)),
    Option.getOrElse(() => factory.defaultGraph())
  )

  // Initialize from base graph if provided
  const initialQuads = yield* config.pipe(
    Option.flatMap(c => Option.fromNullable(c.baseGraph)),
    Option.match({
      onNone: () => Effect.succeed(Set<QuadWrapper>()),
      onSome: (graph) => graph.quads.pipe(
        Effect.map(qs => Set(Array.from(qs).map(q => new QuadWrapper(q))))
      )
    })
  )

  const stateRef = yield* Ref.make<ChangeSetState>({
    current: initialQuads,
    added: Set<QuadWrapper>(),
    removed: Set<QuadWrapper>()
  })

  const queryEngine = yield* Effect.sync(() => new QueryEngine())

  return Graph.of({
    iri,

    quads: Effect.gen(function* () {
      const state = yield* Ref.get(stateRef)
      return unwrapQuads(state.current)
    }),

    find: (subject, predicate, object, graph) =>
      Effect.gen(function* () {
        const state = yield* Ref.get(stateRef)
        return unwrapQuads(state.current.filter(w => {
          const q = w.quad
          if (subject && !q.subject.equals(subject)) return false
          if (predicate && !q.predicate.equals(predicate)) return false
          if (object && !q.object.equals(object)) return false
          if (graph && !q.graph.equals(graph)) return false
          return true
        }))
      }),

    add: (quads) =>
      Ref.update(stateRef, (state) => {
        const delta = Array.from(quads).map(q => {
          const g = q.graph.termType === "DefaultGraph" ? iri : q.graph
          return new QuadWrapper(factory.quad(q.subject, q.predicate, q.object, g))
        })
        const deltaSet = Set(delta)

        return {
          current: state.current.union(deltaSet),
          added: state.added.union(deltaSet.subtract(state.removed)),
          removed: state.removed.subtract(deltaSet)
        }
      }),

    remove: (quads) =>
      Ref.update(stateRef, (state) => {
        const delta = Array.from(quads).map(q => {
          const g = q.graph.termType === "DefaultGraph" ? iri : q.graph
          return new QuadWrapper(factory.quad(q.subject, q.predicate, q.object, g))
        })
        const deltaSet = Set(delta)

        return {
          current: state.current.subtract(deltaSet),
          added: state.added.subtract(deltaSet),
          removed: state.removed.union(deltaSet.subtract(state.added))
        }
      }),

    deleteAll: Effect.gen(function* () {
      const state = yield* Ref.get(stateRef)
      yield* Ref.set(stateRef, {
        current: Set<QuadWrapper>(),
        added: Set<QuadWrapper>(),
        removed: state.current  // Everything becomes removed
      })
    }),

    sparql: (query, options) =>
      Effect.gen(function* () {
        const state = yield* Ref.get(stateRef)
        const source = createSource(state.current)
        return yield* Effect.tryPromise({
          try: () => queryEngine.query(translate(query), { sources: [source] }),
          catch: (e) => new ChangeSetGraphError({ operation: "sparql", cause: e })
        })
      }),

    withIri: (newIri) =>
      Effect.succeed(/* Create view with same stateRef but different IRI mapping */)
  })
})

export const ChangeSetGraphLive: Layer.Layer<Graph, never, never> =
  Layer.effect(Graph, make)
```

#### 4.3.3: Delta Application

```typescript
// Additional service method for applying deltas
export interface ChangeSetGraph extends Graph {
  readonly getAdded: Effect.Effect<readonly Quad[], never, never>
  readonly getRemoved: Effect.Effect<readonly Quad[], never, never>
  readonly applyDelta: <R, E>(target: Graph) => Effect.Effect<void, E, R>
}

// Implementation within make:
const getAdded = Effect.gen(function* () {
  const state = yield* Ref.get(stateRef)
  return unwrapQuads(state.added)
})

const getRemoved = Effect.gen(function* () {
  const state = yield* Ref.get(stateRef)
  return unwrapQuads(state.removed)
})

const applyDelta = <R, E>(target: Graph) =>
  Effect.gen(function* () {
    const state = yield* Ref.get(stateRef)

    if (!state.added.isEmpty()) {
      yield* target.add(unwrapQuads(state.added))
    }

    if (!state.removed.isEmpty()) {
      yield* target.remove(unwrapQuads(state.removed))
    }
  })
```

### Gates

- [ ] Delta tracking properly handles add-then-remove and remove-then-add
- [ ] `applyDelta` correctly applies changes to target graph
- [ ] State transitions are atomic via `Ref.update`

---

## Task 4.4: StardogGraphLive Layer

### Description

StardogGraph connects to a remote Stardog triplestore via HTTP. Key aspects:
- Transaction state machine (Idle -> Active -> Committed/RolledBack)
- HTTP operations wrapped in Effect
- Reasoning pragma support
- Auto-commit for operations outside explicit transactions

### Subtasks

#### 4.4.1: Transaction State Machine

```typescript
// src/effect/graph/stardog.ts
import * as Data from "effect/Data"
import * as Match from "effect/Match"

// Transaction states as discriminated union
type TransactionState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Active"; readonly transactionId: string }

export class TransactionError extends Data.TaggedError("TransactionError")<{
  readonly operation: "begin" | "commit" | "rollback"
  readonly state: TransactionState
  readonly message: string
}> {}

export class StardogHttpError extends Data.TaggedError("StardogHttpError")<{
  readonly status: number
  readonly statusText: string
  readonly body?: string
}> {}

export class StardogQueryError extends Data.TaggedError("StardogQueryError")<{
  readonly query: string
  readonly cause: unknown
}> {}
```

#### 4.4.2: Configuration and Layer

```typescript
export interface StardogGraphConfig {
  readonly endpoint: string
  readonly username: string
  readonly password: string
  readonly database: string
  readonly iri?: NamedNode | DefaultGraph
  readonly reasoning?: boolean
}

export const StardogGraphConfig =
  Context.GenericTag<StardogGraphConfig>("@rdf-utils/StardogGraphConfig")

export const StardogGraphConfigLive = (
  options?: {
    endpoint?: Config.Config<string>
    username?: Config.Config<string>
    password?: Config.Config<Redacted.Redacted>
    database?: Config.Config<string>
  }
): Layer.Layer<StardogGraphConfig, ConfigError, never> =>
  Layer.effect(
    StardogGraphConfig,
    Effect.gen(function* () {
      const endpoint = yield* (options?.endpoint ?? Config.string("STARDOG_ENDPOINT"))
      const username = yield* (options?.username ?? Config.string("STARDOG_USERNAME"))
      const password = yield* (options?.password ?? Config.redacted("STARDOG_PASSWORD"))
      const database = yield* (options?.database ?? Config.string("STARDOG_DATABASE"))

      return {
        endpoint,
        username,
        password: Redacted.value(password),
        database,
        reasoning: false
      }
    })
  )
```

#### 4.4.3: Implement StardogGraphLive Layer

```typescript
const make = Effect.gen(function* () {
  const config = yield* StardogGraphConfig
  const httpClient = yield* HttpClient.HttpClient
  const iri = config.iri ?? factory.defaultGraph()

  const txStateRef = yield* Ref.make<TransactionState>({ _tag: "Idle" })

  // Auth header
  const authHeader = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`

  // Begin transaction
  const begin = Effect.gen(function* () {
    const state = yield* Ref.get(txStateRef)

    if (state._tag === "Active") {
      return yield* Effect.fail(new TransactionError({
        operation: "begin",
        state,
        message: "Transaction already in progress"
      }))
    }

    const url = `${config.endpoint}/${config.database}/transaction/begin`
    const params = config.reasoning ? "?reasoning=true" : ""

    const response = yield* httpClient.post(`${url}${params}`, {
      headers: {
        "Authorization": authHeader,
        "Content-Type": "application/x-www-form-urlencoded"
      }
    }).pipe(
      Effect.flatMap(res =>
        res.status >= 400
          ? Effect.fail(new StardogHttpError({
              status: res.status,
              statusText: res.statusText
            }))
          : res.text
      )
    )

    yield* Ref.set(txStateRef, { _tag: "Active", transactionId: response.trim() })
  })

  // Commit transaction
  const commit = Effect.gen(function* () {
    const state = yield* Ref.get(txStateRef)

    if (state._tag !== "Active") {
      return yield* Effect.fail(new TransactionError({
        operation: "commit",
        state,
        message: "No transaction in progress"
      }))
    }

    yield* httpClient.post(
      `${config.endpoint}/${config.database}/transaction/commit/${state.transactionId}`,
      { headers: { "Authorization": authHeader } }
    ).pipe(
      Effect.flatMap(res =>
        res.status >= 400
          ? Effect.fail(new StardogHttpError({ status: res.status, statusText: res.statusText }))
          : Effect.void
      )
    )

    yield* Ref.set(txStateRef, { _tag: "Idle" })
  })

  // Rollback transaction
  const rollback = Effect.gen(function* () {
    const state = yield* Ref.get(txStateRef)

    if (state._tag !== "Active") {
      return yield* Effect.fail(new TransactionError({
        operation: "rollback",
        state,
        message: "No transaction in progress"
      }))
    }

    yield* httpClient.post(
      `${config.endpoint}/${config.database}/transaction/rollback/${state.transactionId}`,
      { headers: { "Authorization": authHeader } }
    ).pipe(
      Effect.catchAll(() => Effect.void)  // Rollback should not fail
    )

    yield* Ref.set(txStateRef, { _tag: "Idle" })
  })

  // Execute with auto-transaction if needed
  const withTransaction = <A, E>(
    operation: (txId: string) => Effect.Effect<A, E, never>
  ): Effect.Effect<A, E | TransactionError | StardogHttpError, never> =>
    Effect.gen(function* () {
      const state = yield* Ref.get(txStateRef)

      if (state._tag === "Active") {
        return yield* operation(state.transactionId)
      }

      // Auto-transaction
      yield* begin
      const newState = yield* Ref.get(txStateRef)
      if (newState._tag !== "Active") {
        return yield* Effect.die("Transaction begin did not activate")
      }

      const result = yield* operation(newState.transactionId).pipe(
        Effect.tapError(() => rollback),
        Effect.tap(() => commit)
      )

      return result
    })

  return TransactionalGraph.of({
    iri,
    begin,
    commit,
    rollback,

    inTransaction: (fn) =>
      Effect.acquireUseRelease(
        begin,
        () => fn,
        (_, exit) => Exit.isSuccess(exit) ? commit : rollback
      ),

    quads: Effect.gen(function* () {
      const graphIri = iri.termType === "DefaultGraph" ? "" : iri.value
      const sparql = graphIri
        ? `SELECT * WHERE { GRAPH <${graphIri}> { ?s ?p ?o } }`
        : `SELECT * WHERE { ?s ?p ?o }`

      // ... execute query and parse results
    }),

    add: (quads) =>
      withTransaction((txId) =>
        Effect.gen(function* () {
          const quadArray = Array.from(quads)
          if (quadArray.length === 0) return

          const nquads = yield* serializeQuads(quadArray, { format: "N-Quads" })

          yield* httpClient.post(
            `${config.endpoint}/${config.database}/${txId}/add`,
            {
              headers: {
                "Authorization": authHeader,
                "Content-Type": "application/n-quads"
              },
              body: nquads
            }
          )
        })
      ),

    remove: (quads) =>
      withTransaction((txId) =>
        Effect.gen(function* () {
          const quadArray = Array.from(quads)
          if (quadArray.length === 0) return

          const nquads = yield* serializeQuads(quadArray, { format: "N-Quads" })

          yield* httpClient.post(
            `${config.endpoint}/${config.database}/${txId}/remove`,
            {
              headers: {
                "Authorization": authHeader,
                "Content-Type": "application/n-quads"
              },
              body: nquads
            }
          )
        })
      ),

    // ... other methods
  })
})

export const StardogGraphLive: Layer.Layer<
  TransactionalGraph,
  ConfigError,
  StardogGraphConfig | HttpClient.HttpClient
> = Layer.effect(TransactionalGraph, make)
```

### Gates

- [ ] Transaction state machine prevents invalid transitions
- [ ] `begin` fails if already in transaction
- [ ] `commit`/`rollback` fail if not in transaction
- [ ] Auto-transaction wraps operations correctly
- [ ] HTTP errors are properly typed

---

## Task 4.5: GraphDBGraphLive Layer

### Description

GraphDBGraph connects to Ontotext GraphDB via the RDF4J REST API. Key differences from Stardog:
- Transaction URLs from Location header
- RDF-star support via TriG-star format
- Different endpoint structure

### Subtasks

#### 4.5.1: GraphDB-Specific Errors

```typescript
// src/effect/graph/graphdb.ts
export class GraphDBHttpError extends Data.TaggedError("GraphDBHttpError")<{
  readonly status: number
  readonly statusText: string
  readonly body?: string
}> {}

export class GraphDBTransactionError extends Data.TaggedError("GraphDBTransactionError")<{
  readonly operation: "begin" | "commit" | "rollback"
  readonly message: string
}> {}

export class GraphDBRdfStarError extends Data.TaggedError("GraphDBRdfStarError")<{
  readonly message: string
  readonly cause?: unknown
}> {}
```

#### 4.5.2: Configuration

```typescript
export interface GraphDBGraphConfig {
  readonly endpoint: string
  readonly repositoryId: string
  readonly iri?: NamedNode | DefaultGraph
  readonly reasoning?: boolean
}

export const GraphDBGraphConfig =
  Context.GenericTag<GraphDBGraphConfig>("@rdf-utils/GraphDBGraphConfig")

export const GraphDBGraphConfigLive = (
  options?: {
    endpoint?: Config.Config<string>
    repositoryId?: Config.Config<string>
  }
): Layer.Layer<GraphDBGraphConfig, ConfigError, never> =>
  Layer.effect(
    GraphDBGraphConfig,
    Effect.gen(function* () {
      const endpoint = yield* (options?.endpoint ?? Config.string("GRAPHDB_ENDPOINT"))
      const repositoryId = yield* (options?.repositoryId ?? Config.string("GRAPHDB_REPOSITORY"))

      return {
        endpoint,
        repositoryId,
        reasoning: true  // GraphDB defaults to reasoning on
      }
    })
  )
```

#### 4.5.3: Implement GraphDBGraphLive Layer

```typescript
type GraphDBTxState =
  | { readonly _tag: "Idle" }
  | { readonly _tag: "Active"; readonly transactionUrl: string }

const make = Effect.gen(function* () {
  const config = yield* GraphDBGraphConfig
  const httpClient = yield* HttpClient.HttpClient
  const iri = config.iri ?? factory.defaultGraph()

  const txStateRef = yield* Ref.make<GraphDBTxState>({ _tag: "Idle" })

  const getRepositoryUrl = () =>
    `${config.endpoint}/repositories/${config.repositoryId}`

  const getStatementsUrl = () =>
    `${getRepositoryUrl()}/statements`

  // Begin transaction - get URL from Location header
  const begin = Effect.gen(function* () {
    const state = yield* Ref.get(txStateRef)

    if (state._tag === "Active") {
      return yield* Effect.fail(new GraphDBTransactionError({
        operation: "begin",
        message: "Transaction already in progress"
      }))
    }

    const response = yield* httpClient.post(
      `${getRepositoryUrl()}/transactions`,
      {}
    ).pipe(
      Effect.flatMap(res =>
        res.status >= 400
          ? Effect.fail(new GraphDBHttpError({
              status: res.status,
              statusText: res.statusText
            }))
          : Effect.succeed(res)
      )
    )

    const locationHeader = response.headers.get("Location")
    if (!locationHeader) {
      return yield* Effect.fail(new GraphDBTransactionError({
        operation: "begin",
        message: "No Location header in transaction response"
      }))
    }

    yield* Ref.set(txStateRef, { _tag: "Active", transactionUrl: locationHeader })
  })

  // Commit transaction
  const commit = Effect.gen(function* () {
    const state = yield* Ref.get(txStateRef)

    if (state._tag !== "Active") {
      return yield* Effect.fail(new GraphDBTransactionError({
        operation: "commit",
        message: "No transaction in progress"
      }))
    }

    yield* httpClient.put(`${state.transactionUrl}?action=COMMIT`, {}).pipe(
      Effect.flatMap(res =>
        res.status >= 400
          ? Effect.fail(new GraphDBHttpError({ status: res.status, statusText: res.statusText }))
          : Effect.void
      )
    )

    yield* Ref.set(txStateRef, { _tag: "Idle" })
  })

  // Rollback transaction
  const rollback = Effect.gen(function* () {
    const state = yield* Ref.get(txStateRef)

    if (state._tag !== "Active") {
      return yield* Effect.fail(new GraphDBTransactionError({
        operation: "rollback",
        message: "No transaction in progress"
      }))
    }

    yield* httpClient.delete(state.transactionUrl).pipe(
      Effect.catchAll(() => Effect.void)
    )

    yield* Ref.set(txStateRef, { _tag: "Idle" })
  })

  // RDF-star aware quad serialization
  const serializeForGraphDB = (quads: readonly Quad[]): Effect.Effect<string, GraphDBRdfStarError> =>
    Effect.tryPromise({
      try: () => serializeQuads(quads, { format: "application/trig*" }),
      catch: (e) => new GraphDBRdfStarError({
        message: "Failed to serialize RDF-star quads",
        cause: e
      })
    })

  // Parse TriG-star response (handles RDF-star triple terms)
  const parseTriGStar = (content: string): Effect.Effect<readonly Quad[], GraphDBRdfStarError> =>
    Effect.tryPromise({
      try: async () => {
        const parser = new N3.Parser({ format: "application/trig*" })
        const quads: Quad[] = []

        return new Promise<readonly Quad[]>((resolve, reject) => {
          parser.parse(content, (error, quad) => {
            if (error) reject(error)
            else if (quad) quads.push(factory.fromQuad(quad))
            else resolve(quads)
          })
        })
      },
      catch: (e) => new GraphDBRdfStarError({
        message: "Failed to parse TriG-star response",
        cause: e
      })
    })

  // Execute query
  const executeQuery = (queryString: string, contentType: string, useReasoning: boolean) =>
    Effect.gen(function* () {
      const state = yield* Ref.get(txStateRef)

      const response = yield* Match.value(state).pipe(
        Match.when({ _tag: "Active" }, (s) =>
          httpClient.put(
            `${s.transactionUrl}?action=QUERY&infer=${useReasoning}`,
            {
              headers: {
                "Content-Type": "application/sparql-query",
                "Accept": contentType
              },
              body: queryString
            }
          )
        ),
        Match.when({ _tag: "Idle" }, () => {
          const params = new URLSearchParams()
          params.append("query", queryString)
          params.append("infer", useReasoning ? "true" : "false")

          return httpClient.get(
            `${getRepositoryUrl()}?${params.toString()}`,
            { headers: { "Accept": contentType } }
          )
        }),
        Match.exhaustive
      )

      if (response.status >= 400) {
        return yield* Effect.fail(new GraphDBHttpError({
          status: response.status,
          statusText: response.statusText,
          body: yield* response.text
        }))
      }

      // For CONSTRUCT, parse TriG-star
      if (contentType === "application/x-trigstar") {
        const text = yield* response.text
        return yield* parseTriGStar(text)
      }

      // For SELECT/ASK, parse JSON
      return yield* response.json
    })

  // Process quads for add/remove
  const withTransaction = <A, E>(
    operation: (txUrl: string) => Effect.Effect<A, E, never>
  ) =>
    Effect.gen(function* () {
      const state = yield* Ref.get(txStateRef)

      if (state._tag === "Active") {
        return yield* operation(state.transactionUrl)
      }

      yield* begin
      const newState = yield* Ref.get(txStateRef)
      if (newState._tag !== "Active") {
        return yield* Effect.die("Transaction begin did not activate")
      }

      return yield* operation(newState.transactionUrl).pipe(
        Effect.tapError(() => rollback),
        Effect.tap(() => commit)
      )
    })

  return TransactionalGraph.of({
    iri,
    begin,
    commit,
    rollback,

    inTransaction: (fn) =>
      Effect.acquireUseRelease(
        begin,
        () => fn,
        (_, exit) => Exit.isSuccess(exit) ? commit : rollback
      ),

    quads: Effect.gen(function* () {
      const graphIri = iri.termType === "DefaultGraph" ? "" : iri.value
      const sparql = graphIri
        ? `CONSTRUCT { ?s ?p ?o } WHERE { GRAPH <${graphIri}> { ?s ?p ?o } }`
        : `CONSTRUCT { ?s ?p ?o } WHERE { ?s ?p ?o }`

      const quads = yield* executeQuery(sparql, "application/x-trigstar", config.reasoning ?? true)
      return quads
    }),

    add: (quads) =>
      withTransaction((txUrl) =>
        Effect.gen(function* () {
          const quadArray = Array.from(quads)
          if (quadArray.length === 0) return

          const data = yield* serializeForGraphDB(quadArray)

          yield* httpClient.put(
            `${txUrl}?action=ADD`,
            {
              headers: { "Content-Type": "application/x-trigstar" },
              body: data
            }
          ).pipe(
            Effect.flatMap(res =>
              res.status >= 400
                ? Effect.fail(new GraphDBHttpError({
                    status: res.status,
                    statusText: res.statusText
                  }))
                : Effect.void
            )
          )
        })
      ),

    remove: (quads) =>
      withTransaction((txUrl) =>
        Effect.gen(function* () {
          const quadArray = Array.from(quads)
          if (quadArray.length === 0) return

          // Use SPARQL DELETE DATA for proper transaction isolation
          const deleteQuery = buildDeleteDataQuery(quadArray, iri)

          yield* httpClient.put(
            `${txUrl}?action=UPDATE`,
            {
              headers: { "Content-Type": "application/sparql-update" },
              body: deleteQuery
            }
          ).pipe(
            Effect.flatMap(res =>
              res.status >= 400
                ? Effect.fail(new GraphDBHttpError({
                    status: res.status,
                    statusText: res.statusText
                  }))
                : Effect.void
            )
          )
        })
      ),

    // ... other methods
  })
})

export const GraphDBGraphLive: Layer.Layer<
  TransactionalGraph,
  ConfigError,
  GraphDBGraphConfig | HttpClient.HttpClient
> = Layer.effect(TransactionalGraph, make)
```

#### 4.5.4: RDF-star SPARQL Term Serialization

```typescript
const termToSparql = (term: Term): string =>
  Match.value(term).pipe(
    Match.when({ termType: "NamedNode" }, (t) => `<${t.value}>`),
    Match.when({ termType: "BlankNode" }, (t) => `_:${t.value}`),
    Match.when({ termType: "Literal" }, (t) => {
      const lit = t as Literal
      let result = `"${escapeSparqlString(lit.value)}"`
      if (lit.language) {
        result += `@${lit.language}`
      } else if (lit.datatype && lit.datatype.value !== "http://www.w3.org/2001/XMLSchema#string") {
        result += `^^<${lit.datatype.value}>`
      }
      return result
    }),
    Match.when({ termType: "Quad" }, (t) => {
      // RDF-star / SPARQL-star triple term syntax
      const q = t as Quad
      return `<< ${termToSparql(q.subject)} ${termToSparql(q.predicate)} ${termToSparql(q.object)} >>`
    }),
    Match.orElse((t) => { throw new Error(`Cannot serialize term type ${t.termType}`) })
  )

const buildDeleteDataQuery = (quads: readonly Quad[], graphIri: NamedNode | DefaultGraph): string => {
  // Group by graph
  const byGraph = new Map<string, Quad[]>()
  for (const quad of quads) {
    const graphKey = quad.graph.termType === "DefaultGraph" ? "" : quad.graph.value
    const existing = byGraph.get(graphKey) ?? []
    byGraph.set(graphKey, [...existing, quad])
  }

  let query = "DELETE DATA {\n"
  for (const [graphIri, graphQuads] of byGraph) {
    if (graphIri) {
      query += `  GRAPH <${graphIri}> {\n`
      for (const quad of graphQuads) {
        query += `    ${termToSparql(quad.subject)} ${termToSparql(quad.predicate)} ${termToSparql(quad.object)} .\n`
      }
      query += "  }\n"
    } else {
      for (const quad of graphQuads) {
        query += `  ${termToSparql(quad.subject)} ${termToSparql(quad.predicate)} ${termToSparql(quad.object)} .\n`
      }
    }
  }
  query += "}"
  return query
}
```

### Gates

- [ ] Transaction URL extracted from Location header
- [ ] RDF-star triple terms serialize correctly (`<< s p o >>`)
- [ ] TriG-star parsing handles embedded quads
- [ ] DELETE DATA uses SPARQL UPDATE for transaction isolation

---

## Task 4.6: Graph Layer Composition Patterns

### Description

Show how to compose graph layers with infrastructure layers (HttpClient, Config) for different deployment scenarios.

### Subtasks

#### 4.6.1: In-Memory Graph Composition

```typescript
import { Layer } from "effect"
import { N3GraphLive, N3GraphConfig } from "./graph/n3"
import { ImmutableSetGraphLive, ImmutableSetGraphConfig } from "./graph/immutable"

// Simple in-memory graph - no dependencies
const N3Live = N3GraphLive

// With specific IRI
const N3WithIriLive = N3GraphLive.pipe(
  Layer.provide(Layer.succeed(N3GraphConfig, {
    iri: factory.namedNode("http://example.org/myGraph")
  }))
)

// ImmutableSet with initial data
const ImmutableWithDataLive = ImmutableSetGraphLive.pipe(
  Layer.provide(Layer.succeed(ImmutableSetGraphConfig, {
    initialQuads: myQuads
  }))
)
```

#### 4.6.2: Remote Graph Composition

```typescript
import { FetchHttpClient } from "@effect/platform"
import { BunContext } from "@effect/platform-bun"
import { NodeContext } from "@effect/platform-node"

// Stardog with full configuration
const StardogLive = StardogGraphLive.pipe(
  Layer.provide(StardogGraphConfigLive()),
  Layer.provide(FetchHttpClient.layer)
)

// GraphDB with custom config
const GraphDBLive = GraphDBGraphLive.pipe(
  Layer.provide(Layer.succeed(GraphDBGraphConfig, {
    endpoint: "http://localhost:7200",
    repositoryId: "my-repo",
    reasoning: true
  })),
  Layer.provide(FetchHttpClient.layer)
)

// Full application layer for Bun runtime
const AppLive = Layer.mergeAll(
  StardogLive,
  GraphDBLive
).pipe(
  Layer.provide(BunContext.layer)
)
```

#### 4.6.3: Testing Layers

```typescript
// Test layer with mock HTTP responses
const TestHttpClient = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make({
    execute: (request) =>
      Effect.succeed(HttpClientResponse.fromWeb(
        request,
        new Response(JSON.stringify({ results: { bindings: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
        })
      ))
  })
)

const TestStardogLive = StardogGraphLive.pipe(
  Layer.provide(Layer.succeed(StardogGraphConfig, {
    endpoint: "http://localhost:5820",
    username: "admin",
    password: "admin",
    database: "test"
  })),
  Layer.provide(TestHttpClient)
)
```

#### 4.6.4: Multi-Graph Scenarios

```typescript
// Tag for different graph instances
class SourceGraph extends Context.Tag("SourceGraph")<SourceGraph, Graph>() {}
class TargetGraph extends Context.Tag("TargetGraph")<TargetGraph, Graph>() {}

// Copy operation using both graphs
const copyGraph = Effect.gen(function* () {
  const source = yield* SourceGraph
  const target = yield* TargetGraph

  const quads = yield* source.quads
  yield* target.add(quads)
})

// Layer composition for multi-graph
const MultiGraphLive = Layer.mergeAll(
  Layer.effect(SourceGraph, Effect.gen(function* () {
    const graph = yield* Graph
    return graph  // Use Graph as SourceGraph
  })).pipe(Layer.provide(GraphDBLive)),

  Layer.effect(TargetGraph, Effect.gen(function* () {
    const graph = yield* Graph
    return graph  // Use Graph as TargetGraph
  })).pipe(Layer.provide(StardogLive))
)
```

### Gates

- [ ] In-memory graphs work without HttpClient
- [ ] Remote graphs properly compose with platform layers
- [ ] Test layers allow mocking HTTP responses
- [ ] Multi-graph scenarios type-check correctly

---

## Phase Gates

- [ ] Each graph implementation is a `Layer<Graph>` or `Layer<TransactionalGraph>`
- [ ] N3Graph and ImmutableSetGraph work offline (no network dependencies)
- [ ] ChangeSetGraph tracks deltas and can apply them to other graphs
- [ ] StardogGraph and GraphDBGraph handle HTTP errors with tagged errors
- [ ] Transaction state machine prevents invalid transitions (begin twice, commit without begin)
- [ ] RDF-star triple terms serialize and parse correctly in GraphDB
- [ ] `bunx tsc --noEmit` passes
- [ ] Integration tests pass for StardogGraph and GraphDBGraph
- [ ] Unit tests pass for N3Graph, ImmutableSetGraph, and ChangeSetGraph

## Dependencies

- **Depends on**:
  - Phase 1: Core RDF Types (Quad, factory, NamedNode, etc.)
  - Phase 2: Graph Service Interface
  - Phase 3: SPARQL Query Types and Parsing
- **Required by**:
  - Phase 5: Graph Operations (skolemize, merge, diff)
  - Phase 6: Resource API

## File Structure

```
src/effect/graph/
  index.ts           # Re-exports all graph implementations
  n3.ts              # N3GraphLive
  immutable.ts       # ImmutableSetGraphLive
  changeset.ts       # ChangeSetGraphLive
  stardog.ts         # StardogGraphLive
  graphdb.ts         # GraphDBGraphLive
  errors.ts          # Shared error types
  quad-wrapper.ts    # QuadWrapper for Immutable.js
```

## Migration Strategy

1. Implement N3GraphLive first (simplest, most frequently used)
2. Implement ImmutableSetGraphLive (shares QuadWrapper)
3. Implement ChangeSetGraphLive (depends on ImmutableSetGraph patterns)
4. Implement StardogGraphLive (remote, transaction state machine)
5. Implement GraphDBGraphLive (remote, RDF-star)
6. Write integration tests for remote graphs
7. Deprecate class-based implementations
