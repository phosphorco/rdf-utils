# Phase 5: High-Level API Services

## Overview

Phase 5 implements the user-facing APIs that provide fluent, composable interfaces for RDF manipulation. These services build on the Graph abstraction from Phase 4, exposing three key capabilities:

1. **Resource Service** - Fluent builder for property-centric resource manipulation
2. **Pull Service** - Query DSL for extracting shaped data from graphs
3. **Skolemize Service** - Blank node skolemization/deskolemization with deterministic generation

These APIs transform low-level graph operations into domain-oriented workflows, following Effect's compositional patterns with `pipe`, `Effect.gen`, and service dependencies.

---

## Task 5.1: Resource Service

### Description

The Resource service provides a fluent builder pattern for resource manipulation, enabling chained property operations on RDF subjects. Unlike the current class-based implementation, the Effect version uses:

- **Immutable operations** via pipe composition
- **Effect-wrapped results** for error handling and context requirements
- **Graph service dependency** rather than direct changeset coupling

### Current Implementation Analysis

From `src/resource.ts`:
```typescript
// Current: Mutable class with direct changeset coupling
export class Resource<T extends Quad_Subject> {
  public changeset: ChangeSetGraph;
  public subject: T;

  set(predicate: NamedNode, value: ResourceValue): this { ... }
  add(predicate: NamedNode, value: ResourceValue): this { ... }
  get(predicate: NamedNode): ResourceValue | undefined { ... }
  delete(predicate: NamedNode): this { ... }
}
```

Key issues to address:
- Mutable `this` return breaks referential transparency
- Direct `ChangeSetGraph` coupling leaks implementation
- `undefined` return for missing values (should use `Option`)
- No error handling for type mismatches

### Subtasks

#### 5.1.1: Define Resource Interface and ADT

```typescript
// src/effect/Resource.ts
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { NamedNode, Quad_Subject, Quad_Object } from "../rdf"

// Resource value ADT
export type ResourceValue =
  | { readonly _tag: "Term"; readonly term: Quad_Object }
  | { readonly _tag: "Literal"; readonly value: string | number | boolean | Date }
  | { readonly _tag: "Resource"; readonly subject: Quad_Subject }

export const ResourceValue = {
  term: (term: Quad_Object): ResourceValue => ({ _tag: "Term", term }),
  literal: (value: string | number | boolean | Date): ResourceValue =>
    ({ _tag: "Literal", value }),
  resource: (subject: Quad_Subject): ResourceValue =>
    ({ _tag: "Resource", subject })
}

// Resource handle - immutable reference to a subject in a graph context
export interface ResourceHandle<S extends Quad_Subject = Quad_Subject> {
  readonly subject: S
  readonly termType: S["termType"]
  readonly value: S["value"]
}

// Resource operations interface
export interface Resource {
  readonly for: <S extends Quad_Subject>(
    subject: S
  ) => Effect.Effect<ResourceHandle<S>, never, Graph>

  readonly get: (
    handle: ResourceHandle,
    predicate: NamedNode
  ) => Effect.Effect<Option.Option<ResourceValue>, GraphError, Graph>

  readonly getAll: (
    handle: ResourceHandle,
    predicate: NamedNode
  ) => Effect.Effect<ReadonlyArray<ResourceValue>, GraphError, Graph>

  readonly set: (
    handle: ResourceHandle,
    predicate: NamedNode,
    value: ResourceValue
  ) => Effect.Effect<void, GraphError, Graph>

  readonly add: (
    handle: ResourceHandle,
    predicate: NamedNode,
    value: ResourceValue
  ) => Effect.Effect<void, GraphError, Graph>

  readonly delete: (
    handle: ResourceHandle,
    predicate: NamedNode
  ) => Effect.Effect<void, GraphError, Graph>

  readonly has: (
    handle: ResourceHandle,
    predicate: NamedNode
  ) => Effect.Effect<boolean, GraphError, Graph>

  readonly entries: (
    handle: ResourceHandle
  ) => Effect.Effect<ReadonlyArray<readonly [NamedNode, ResourceValue]>, GraphError, Graph>
}

export const Resource = Context.GenericTag<Resource>("@rdf-utils/Resource")
```

#### 5.1.2: Implement ResourceLive Layer

```typescript
// src/effect/Resource.ts (continued)
import * as Layer from "effect/Layer"
import * as Array from "effect/Array"
import { Graph, GraphError } from "./Graph"
import { factory } from "../rdf"

export const ResourceLive: Layer.Layer<Resource, never, Graph> = Layer.effect(
  Resource,
  Effect.gen(function* () {
    const graph = yield* Graph

    const toResourceValue = (term: Quad_Object): ResourceValue => {
      if (term.termType === "NamedNode" || term.termType === "BlankNode") {
        return ResourceValue.resource(term)
      }
      return ResourceValue.term(term)
    }

    const fromResourceValue = (value: ResourceValue): Quad_Object => {
      switch (value._tag) {
        case "Term": return value.term
        case "Resource": return value.subject
        case "Literal": return factory.fromJs(value.value)
      }
    }

    return Resource.of({
      for: (subject) => Effect.succeed({
        subject,
        termType: subject.termType,
        value: subject.value
      }),

      get: (handle, predicate) => Effect.gen(function* () {
        const quads = yield* graph.find(handle.subject, predicate, null)
        const first = Array.head([...quads])
        return Option.map(first, (q) => toResourceValue(q.object))
      }),

      getAll: (handle, predicate) => Effect.gen(function* () {
        const quads = yield* graph.find(handle.subject, predicate, null)
        return Array.map([...quads], (q) => toResourceValue(q.object))
      }),

      set: (handle, predicate, value) => Effect.gen(function* () {
        const existing = yield* graph.find(handle.subject, predicate, null)
        yield* graph.remove([...existing])
        const quad = factory.quad(handle.subject, predicate, fromResourceValue(value))
        yield* graph.add([quad])
      }),

      add: (handle, predicate, value) => Effect.gen(function* () {
        const quad = factory.quad(handle.subject, predicate, fromResourceValue(value))
        yield* graph.add([quad])
      }),

      delete: (handle, predicate) => Effect.gen(function* () {
        const existing = yield* graph.find(handle.subject, predicate, null)
        yield* graph.remove([...existing])
      }),

      has: (handle, predicate) => Effect.gen(function* () {
        const quads = yield* graph.find(handle.subject, predicate, null)
        return Array.isNonEmptyArray([...quads])
      }),

      entries: (handle) => Effect.gen(function* () {
        const quads = yield* graph.find(handle.subject, null, null)
        return Array.map([...quads], (q) =>
          [q.predicate as NamedNode, toResourceValue(q.object)] as const
        )
      })
    })
  })
)
```

#### 5.1.3: Builder Pattern with Pipe Composition

Provide a fluent DSL using standalone functions and pipe:

```typescript
// src/effect/Resource.ts (continued)

// Builder operations - composable via pipe
export const set = (predicate: NamedNode, value: ResourceValue) =>
  (handle: ResourceHandle): Effect.Effect<ResourceHandle, GraphError, Resource | Graph> =>
    Effect.gen(function* () {
      const resource = yield* Resource
      yield* resource.set(handle, predicate, value)
      return handle
    })

export const add = (predicate: NamedNode, value: ResourceValue) =>
  (handle: ResourceHandle): Effect.Effect<ResourceHandle, GraphError, Resource | Graph> =>
    Effect.gen(function* () {
      const resource = yield* Resource
      yield* resource.add(handle, predicate, value)
      return handle
    })

export const remove = (predicate: NamedNode) =>
  (handle: ResourceHandle): Effect.Effect<ResourceHandle, GraphError, Resource | Graph> =>
    Effect.gen(function* () {
      const resource = yield* Resource
      yield* resource.delete(handle, predicate)
      return handle
    })

// Convenience for creating resource handles
export const forSubject = <S extends Quad_Subject>(subject: S) =>
  Effect.gen(function* () {
    const resource = yield* Resource
    return yield* resource.for(subject)
  })
```

### Code Examples

```typescript
import { Effect, pipe } from "effect"
import * as Resource from "./effect/Resource"
import { FOAF, factory } from "./rdf"

// Basic usage with Effect.gen
const updatePerson = Effect.gen(function* () {
  const resource = yield* Resource.Resource
  const handle = yield* resource.for(factory.namedNode("http://example.org/alice"))

  yield* resource.set(handle, FOAF.name, Resource.ResourceValue.literal("Alice Smith"))
  yield* resource.add(handle, FOAF.knows, Resource.ResourceValue.resource(
    factory.namedNode("http://example.org/bob")
  ))

  const name = yield* resource.get(handle, FOAF.name)
  return name
})

// Fluent builder with pipe
const createPerson = (iri: string, name: string, friends: string[]) =>
  pipe(
    Resource.forSubject(factory.namedNode(iri)),
    Effect.flatMap(
      pipe(
        Resource.set(FOAF.name, Resource.ResourceValue.literal(name)),
        // Chain multiple friends
        ...friends.map(friend =>
          Resource.add(FOAF.knows, Resource.ResourceValue.resource(factory.namedNode(friend)))
        )
      )
    )
  )

// With type-safe RDF types
const typedResource = pipe(
  Resource.forSubject(factory.namedNode("http://example.org/doc1")),
  Effect.flatMap(
    pipe(
      Resource.set(RDF.type, Resource.ResourceValue.resource(FOAF.Document)),
      Resource.set(DCTERMS.title, Resource.ResourceValue.literal("My Document")),
      Resource.set(DCTERMS.created, Resource.ResourceValue.literal(new Date()))
    )
  )
)
```

### Gates

- [ ] `Resource` interface defined with all operations returning `Effect`
- [ ] `ResourceValue` ADT handles Term, Literal, and nested Resource cases
- [ ] `ResourceLive` layer implemented with `Graph` dependency
- [ ] Builder functions (`set`, `add`, `remove`) composable via `pipe`
- [ ] No mutable state in implementation
- [ ] All operations use `Option` for missing values (not `undefined`)
- [ ] Unit tests cover CRUD operations and edge cases

---

## Task 5.2: Pull Query Service

### Description

The Pull service provides a declarative DSL for querying and shaping data from RDF graphs. It compiles expression trees into SPARQL CONSTRUCT queries, returning focused subgraphs.

### Current Implementation Analysis

From `src/pull.ts`:
```typescript
// Current: Loosely typed expression format
export type PullExpr = PullExprProperty[];
export type PullExprProperty =
  | NamedNode           // Simple property
  | '*'                 // Wildcard
  | RecurseExpr         // [NamedNode, '...']
  | NestedExpr          // [NamedNode, PullExpr]
  | ConstraintExpr      // [NamedNode, ConstraintValue]

// Builds SPARQL CONSTRUCT from expression
export async function pull(graph: Graph<any>, pull: PullExpr, startingResource?: NamedNode): Promise<ImmutableSetGraph>
```

Key issues:
- Array/tuple syntax is hard to type correctly
- No ADT for expression nodes
- Mixes query building with execution
- Direct Promise return instead of Effect

### Subtasks

#### 5.2.1: Define Pull DSL ADT with Data.TaggedEnum

```typescript
// src/effect/Pull.ts
import * as Data from "effect/Data"
import type { NamedNode } from "../rdf"

// Pull expression ADT
export type PullExpr = Data.TaggedEnum<{
  // Select a single property
  Property: { readonly predicate: NamedNode }

  // Select all properties (wildcard)
  Wildcard: {}

  // Recursive traversal via property path
  Recurse: { readonly predicate: NamedNode }

  // Nested pull expression
  Nested: { readonly predicate: NamedNode; readonly expr: ReadonlyArray<PullExpr> }

  // Constraint on property value
  Constraint: {
    readonly predicate: NamedNode
    readonly value: ConstraintValue
  }
}>

export const PullExpr = Data.taggedEnum<PullExpr>()

// Constraint values
export type ConstraintValue =
  | NamedNode
  | string
  | number
  | boolean
  | undefined  // undefined = required but any value

// Smart constructors for ergonomic DSL
export const property = (predicate: NamedNode): PullExpr =>
  PullExpr.Property({ predicate })

export const wildcard: PullExpr = PullExpr.Wildcard({})

export const recurse = (predicate: NamedNode): PullExpr =>
  PullExpr.Recurse({ predicate })

export const nested = (predicate: NamedNode, ...expr: ReadonlyArray<PullExpr>): PullExpr =>
  PullExpr.Nested({ predicate, expr })

export const constraint = (predicate: NamedNode, value: ConstraintValue): PullExpr =>
  PullExpr.Constraint({ predicate, value })

// Type-safe array builder
export const expr = (...properties: ReadonlyArray<PullExpr>): ReadonlyArray<PullExpr> =>
  properties
```

#### 5.2.2: Implement Query Compilation and Execution

```typescript
// src/effect/Pull.ts (continued)
import * as Effect from "effect/Effect"
import * as Context from "effect/Context"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import * as Array from "effect/Array"
import { Graph, GraphError } from "./Graph"
import type { ConstructQuery, Pattern, Triple } from "sparqljs"
import { factory, Quad, Variable } from "../rdf"

// Pull service interface
export interface Pull {
  readonly execute: (
    expr: ReadonlyArray<PullExpr>,
    startingResource?: NamedNode
  ) => Effect.Effect<Graph, GraphError, Graph>
}

export const Pull = Context.GenericTag<Pull>("@rdf-utils/Pull")

// Internal state for query building
interface BuildState {
  readonly variableCounter: number
  readonly template: ReadonlyArray<Quad>
  readonly bgpTriples: ReadonlyArray<Triple>
  readonly optionalPatterns: ReadonlyArray<Pattern>
}

const initialState: BuildState = {
  variableCounter: 0,
  template: [],
  bgpTriples: [],
  optionalPatterns: []
}

// Variable generation (pure)
const freshVar = (state: BuildState, prefix: string = "v"): [Variable, BuildState] => {
  const variable = factory.variable(`${prefix}_${state.variableCounter}`)
  return [variable, { ...state, variableCounter: state.variableCounter + 1 }]
}

// Pattern builders
const bgp = (triples: ReadonlyArray<Triple>): Pattern => ({
  type: "bgp",
  triples: [...triples]
})

const optional = (...patterns: ReadonlyArray<Pattern>): Pattern => ({
  type: "optional",
  patterns: [...patterns]
})

// Compile expression to SPARQL patterns
const compileExpr = (
  expr: PullExpr,
  subject: Variable,
  state: BuildState
): BuildState =>
  Match.value(expr).pipe(
    Match.tag("Property", ({ predicate }) => {
      const [object, s1] = freshVar(state, "val")
      const triple = factory.quad(subject, predicate, object)
      return {
        ...s1,
        template: [...s1.template, triple],
        optionalPatterns: [...s1.optionalPatterns, optional(bgp([triple]))]
      }
    }),

    Match.tag("Wildcard", () => {
      const [predicate, s1] = freshVar(state, "pred")
      const [object, s2] = freshVar(s1, "obj")
      const triple = factory.quad(subject, predicate, object)
      return {
        ...s2,
        template: [...s2.template, triple],
        bgpTriples: [...s2.bgpTriples, triple]
      }
    }),

    Match.tag("Recurse", ({ predicate }) => {
      const [object, s1] = freshVar(state, "recur")
      const triple = factory.quad(subject, predicate, object)
      // Note: Actual implementation needs property path handling
      return {
        ...s1,
        template: [...s1.template, triple],
        optionalPatterns: [...s1.optionalPatterns, optional(bgp([triple]))]
      }
    }),

    Match.tag("Nested", ({ predicate, expr: nestedExpr }) => {
      const [object, s1] = freshVar(state, "nested")
      const linkTriple = factory.quad(subject, predicate, object)

      // Recursively compile nested expression
      const nestedState = Array.reduce(
        nestedExpr,
        { ...s1, template: [...s1.template, linkTriple] },
        (acc, e) => compileExpr(e, object, acc)
      )

      return {
        ...nestedState,
        optionalPatterns: [
          ...nestedState.optionalPatterns,
          optional(bgp([linkTriple]), ...nestedState.optionalPatterns)
        ]
      }
    }),

    Match.tag("Constraint", ({ predicate, value }) => {
      const object = value === undefined
        ? (() => { const [v, _] = freshVar(state, "val"); return v })()
        : typeof value === "object" && "termType" in value
          ? value
          : factory.fromJs(value)

      const triple = factory.quad(subject, predicate, object)
      return {
        ...state,
        template: [...state.template, triple],
        bgpTriples: [...state.bgpTriples, triple]
      }
    }),

    Match.exhaustive
  )

// Build complete CONSTRUCT query
const buildQuery = (
  exprs: ReadonlyArray<PullExpr>,
  root: Variable | NamedNode
): ConstructQuery => {
  const [subject, initialWithSubject] = freshVar(initialState, "subj")

  // Compile all expressions
  const finalState = Array.reduce(
    exprs,
    initialWithSubject,
    (acc, e) => compileExpr(e, subject, acc)
  )

  // Build recursive root pattern
  const rootPattern: Triple = {
    subject: root,
    predicate: { type: "path", pathType: "*", items: [factory.namedNode("urn:no-such-property")] },
    object: subject
  }

  return {
    type: "query",
    queryType: "CONSTRUCT",
    prefixes: {},
    template: [...finalState.template],
    where: [
      bgp([...finalState.bgpTriples, rootPattern]),
      ...finalState.optionalPatterns
    ]
  }
}

// Live implementation
export const PullLive: Layer.Layer<Pull, never, Graph> = Layer.effect(
  Pull,
  Effect.gen(function* () {
    const graph = yield* Graph

    return Pull.of({
      execute: (exprs, startingResource) => Effect.gen(function* () {
        const root = startingResource ?? factory.variable("root")
        const query = buildQuery(exprs, root)

        const result = yield* graph.construct(query)

        // Filter out sentinel values (RDF.filterMe pattern from original)
        return yield* filterSentinels(result)
      })
    })
  })
)

// Filter sentinel/marker nodes from result
const filterSentinels = (graph: Graph) =>
  Effect.gen(function* () {
    // Implementation would filter quads with filterMe sentinel
    return graph
  })
```

#### 5.2.3: Result Transformation Utilities

```typescript
// src/effect/Pull.ts (continued)

// Transform pull results to different shapes
export const toArray = <A>(
  result: Graph,
  transform: (quads: Iterable<Quad>) => A
): Effect.Effect<ReadonlyArray<A>, GraphError> =>
  Effect.gen(function* () {
    const quads = yield* Effect.succeed(result.quads())
    return [transform(quads)]
  })

// Group results by subject
export const groupBySubject = (result: Graph) =>
  Effect.gen(function* () {
    const quads = [...(yield* Effect.succeed(result.quads()))]
    return Array.groupBy(quads, (q) => q.subject.value)
  })

// Extract single resource
export const single = (result: Graph, subject: NamedNode) =>
  Effect.gen(function* () {
    const quads = [...(yield* Effect.succeed(result.quads()))]
    return Array.filter(quads, (q) => q.subject.equals(subject))
  })
```

### Code Examples

```typescript
import { Effect, pipe } from "effect"
import * as Pull from "./effect/Pull"
import { FOAF, DCTERMS, factory } from "./rdf"

// Define a pull expression using the DSL
const personPull = Pull.expr(
  Pull.property(FOAF.name),
  Pull.property(FOAF.mbox),
  Pull.nested(FOAF.knows,
    Pull.property(FOAF.name),
    Pull.constraint(RDF.type, FOAF.Person)
  ),
  Pull.recurse(FOAF.member)
)

// Execute the pull
const fetchPerson = (iri: string) =>
  Effect.gen(function* () {
    const pull = yield* Pull.Pull
    const result = yield* pull.execute(
      personPull,
      factory.namedNode(iri)
    )
    return yield* Pull.groupBySubject(result)
  })

// Complex query with constraints
const findDocuments = Pull.expr(
  Pull.wildcard,
  Pull.constraint(RDF.type, FOAF.Document),
  Pull.constraint(DCTERMS.creator, undefined), // Required but any value
  Pull.nested(DCTERMS.hasPart,
    Pull.property(DCTERMS.title),
    Pull.property(DCTERMS.format)
  )
)

// Provide layers and run
const program = pipe(
  fetchPerson("http://example.org/alice"),
  Effect.provide(Pull.PullLive),
  Effect.provide(GraphLive)
)
```

### Gates

- [ ] `PullExpr` ADT defined with `Data.TaggedEnum`
- [ ] Smart constructors (`property`, `nested`, `recurse`, `constraint`, `wildcard`)
- [ ] Query compiler produces valid SPARQL CONSTRUCT
- [ ] `Pull` service interface with `execute` method
- [ ] `PullLive` layer depends on `Graph`
- [ ] Result transformation utilities (`groupBySubject`, `single`)
- [ ] Pattern exhaustiveness via `Match.exhaustive`
- [ ] Unit tests for DSL compilation and execution

---

## Task 5.3: Skolemize Service

### Description

The Skolemize service replaces blank nodes with deterministic skolem IRIs, enabling RDF round-tripping through systems that don't preserve blank node identity. The Effect version adds:

- **Deterministic generation** via configurable ID generator
- **Deskolemization** to restore blank nodes
- **Scoped counter** for test reproducibility

### Current Implementation Analysis

From `src/graph.ts`:
```typescript
// Current: Global mutable counter, async function
let skolemCounter = 0;
export async function skolemize<T extends WritableGraph<any>>(
  graph: T,
  prefix: string
): Promise<T> {
  const nodes: Record<string, NamedNode> = {};
  // ... replaces blank nodes with skolem IRIs
}
```

Key issues:
- Global mutable counter breaks reproducibility
- No deskolemize function
- Prefix handling is inconsistent (concatenates graph IRI)
- Async but doesn't need to be for in-memory graphs

### Subtasks

#### 5.3.1: Define Skolemize Service Interface

```typescript
// src/effect/Skolemize.ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import * as Record from "effect/Record"
import type { BlankNode, NamedNode, Quad } from "../rdf"
import { Graph, GraphError } from "./Graph"

// Skolem configuration
export interface SkolemConfig {
  readonly prefix: string
  readonly includeGraphIri: boolean
}

export const SkolemConfig = Context.GenericTag<SkolemConfig>("@rdf-utils/SkolemConfig")

// Default config
export const defaultConfig: SkolemConfig = {
  prefix: ".well-known/genid/",
  includeGraphIri: true
}

// Skolem mapping for deskolemization
export interface SkolemMapping {
  readonly skolemToBlank: Record<string, BlankNode>
  readonly blankToSkolem: Record<string, NamedNode>
}

// Service interface
export interface Skolemize {
  readonly skolemize: (
    graph: Graph
  ) => Effect.Effect<readonly [Graph, SkolemMapping], GraphError, Graph>

  readonly deskolemize: (
    graph: Graph,
    mapping: SkolemMapping
  ) => Effect.Effect<Graph, GraphError, Graph>

  readonly isSkolemIri: (iri: NamedNode) => boolean
}

export const Skolemize = Context.GenericTag<Skolemize>("@rdf-utils/Skolemize")
```

#### 5.3.2: Implement Deterministic ID Generation

```typescript
// src/effect/Skolemize.ts (continued)

// Scoped counter for deterministic IDs
const makeSkolemCounter = Effect.gen(function* () {
  const counter = yield* Ref.make(0)

  return {
    next: Effect.gen(function* () {
      const current = yield* Ref.get(counter)
      yield* Ref.set(counter, current + 1)
      return current
    }),
    reset: Ref.set(counter, 0)
  }
})

// Hash-based deterministic ID (alternative strategy)
const hashBlankNode = (bnode: BlankNode, salt: string): string => {
  // Simple deterministic hash - could use crypto for better distribution
  const input = `${salt}:${bnode.value}`
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36)
}
```

#### 5.3.3: Implement Skolemize/Deskolemize Operations

```typescript
// src/effect/Skolemize.ts (continued)
import * as Array from "effect/Array"
import { factory } from "../rdf"

export const SkolemizeLive: Layer.Layer<Skolemize, never, SkolemConfig> = Layer.effect(
  Skolemize,
  Effect.gen(function* () {
    const config = yield* SkolemConfig
    const counter = yield* makeSkolemCounter

    const buildPrefix = (graphIri: NamedNode | DefaultGraph): string => {
      if (config.includeGraphIri && graphIri.termType === "NamedNode") {
        return `${graphIri.value}${config.prefix}`
      }
      return config.prefix
    }

    return Skolemize.of({
      skolemize: (graph) => Effect.gen(function* () {
        const graphService = yield* Graph
        const prefix = buildPrefix(graph.iri)

        const skolemToBlank: Record<string, BlankNode> = {}
        const blankToSkolem: Record<string, NamedNode> = {}

        const getSkolem = (bnode: BlankNode): Effect.Effect<NamedNode> =>
          Effect.gen(function* () {
            if (bnode.value in blankToSkolem) {
              return blankToSkolem[bnode.value]
            }
            const id = yield* counter.next
            const skolem = factory.namedNode(`${prefix}${id}`)
            skolemToBlank[skolem.value] = bnode
            blankToSkolem[bnode.value] = skolem
            return skolem
          })

        const quads = [...(yield* graphService.quads())]
        const replacements: Array<{ old: Quad; new: Quad }> = []

        for (const q of quads) {
          const hasBlankSubject = q.subject.termType === "BlankNode"
          const hasBlankObject = q.object.termType === "BlankNode"

          if (hasBlankSubject || hasBlankObject) {
            const newSubject = hasBlankSubject
              ? yield* getSkolem(q.subject as BlankNode)
              : q.subject
            const newObject = hasBlankObject
              ? yield* getSkolem(q.object as BlankNode)
              : q.object

            replacements.push({
              old: q,
              new: factory.quad(newSubject, q.predicate, newObject, q.graph)
            })
          }
        }

        // Apply replacements
        if (replacements.length > 0) {
          yield* graphService.remove(replacements.map(r => r.old))
          yield* graphService.add(replacements.map(r => r.new))
        }

        const mapping: SkolemMapping = { skolemToBlank, blankToSkolem }
        return [graph, mapping] as const
      }),

      deskolemize: (graph, mapping) => Effect.gen(function* () {
        const graphService = yield* Graph
        const quads = [...(yield* graphService.quads())]
        const replacements: Array<{ old: Quad; new: Quad }> = []

        for (const q of quads) {
          const subjectSkolem = q.subject.termType === "NamedNode"
            ? Record.get(mapping.skolemToBlank, q.subject.value)
            : undefined
          const objectSkolem = q.object.termType === "NamedNode"
            ? Record.get(mapping.skolemToBlank, q.object.value)
            : undefined

          if (subjectSkolem || objectSkolem) {
            replacements.push({
              old: q,
              new: factory.quad(
                subjectSkolem ?? q.subject,
                q.predicate,
                objectSkolem ?? q.object,
                q.graph
              )
            })
          }
        }

        if (replacements.length > 0) {
          yield* graphService.remove(replacements.map(r => r.old))
          yield* graphService.add(replacements.map(r => r.new))
        }

        return graph
      }),

      isSkolemIri: (iri) => iri.value.includes(config.prefix)
    })
  })
)

// Default layer with standard config
export const SkolemizeDefault = SkolemizeLive.pipe(
  Layer.provide(Layer.succeed(SkolemConfig, defaultConfig))
)
```

### Code Examples

```typescript
import { Effect, pipe } from "effect"
import * as Skolemize from "./effect/Skolemize"
import { factory, FOAF } from "./rdf"

// Basic skolemization
const skolemizeGraph = Effect.gen(function* () {
  const skolem = yield* Skolemize.Skolemize
  const graph = yield* Graph.Graph

  // Add data with blank nodes
  const bnode = factory.blankNode("person1")
  yield* graph.add([
    factory.quad(bnode, FOAF.name, factory.literal("Alice")),
    factory.quad(bnode, RDF.type, FOAF.Person)
  ])

  // Skolemize - replaces blank nodes with IRIs
  const [skolemized, mapping] = yield* skolem.skolemize(graph)

  // Later: restore blank nodes
  const restored = yield* skolem.deskolemize(skolemized, mapping)
  return restored
})

// Round-trip through external system
const roundTrip = (externalStore: ExternalStore) =>
  Effect.gen(function* () {
    const skolem = yield* Skolemize.Skolemize
    const graph = yield* Graph.Graph

    // Skolemize before sending to external system
    const [skolemized, mapping] = yield* skolem.skolemize(graph)

    // Serialize and send (external systems often can't preserve blank node identity)
    yield* externalStore.upload(yield* skolemized.toString())

    // Fetch back and deskolemize
    const fetched = yield* externalStore.download()
    const parsed = yield* Graph.parse(fetched)
    const restored = yield* skolem.deskolemize(parsed, mapping)

    return restored
  })

// Custom prefix configuration
const customSkolem = pipe(
  skolemizeGraph,
  Effect.provide(Skolemize.SkolemizeLive),
  Effect.provide(Layer.succeed(Skolemize.SkolemConfig, {
    prefix: "urn:uuid:",
    includeGraphIri: false
  }))
)
```

### Gates

- [ ] `Skolemize` interface with `skolemize`, `deskolemize`, `isSkolemIri`
- [ ] `SkolemConfig` for customizable prefix and behavior
- [ ] `SkolemMapping` preserves bidirectional blank-to-skolem relationship
- [ ] Deterministic ID generation via scoped `Ref` counter
- [ ] Round-trip semantics: `deskolemize(skolemize(g)) === g`
- [ ] `SkolemizeDefault` layer with standard configuration
- [ ] Unit tests verify:
  - Unique IDs across blank nodes
  - Consistent mapping for same blank node
  - Round-trip preservation
  - Custom prefix handling

---

## Phase Gates

- [ ] Resource API provides fluent builder pattern with `pipe` composition
- [ ] Pull DSL uses `Data.TaggedEnum` for type-safe AST
- [ ] Pull compiles to valid SPARQL CONSTRUCT queries
- [ ] Skolemize preserves round-trip semantics
- [ ] All services depend on `Graph` abstraction (no direct implementation coupling)
- [ ] `bunx tsc --noEmit` passes
- [ ] `bun test` passes for new modules
- [ ] No mutable global state (all state in `Ref` or service context)

---

## Dependencies

### Depends On
- **Phase 1**: Core types (`NamedNode`, `Quad`, `factory`)
- **Phase 2**: Namespace utilities
- **Phase 3**: Graph interface (`Graph`, `MutableGraph`)
- **Phase 4**: Graph implementations (`ImmutableGraph`, `ChangeSetGraph`)

### Required By
- **Application code**: These are the primary user-facing APIs
- **Phase 6+**: Higher-level abstractions (if planned)

---

## File Structure

```
src/effect/
  Resource.ts       # Resource service, builder functions, ResourceValue ADT
  Pull.ts           # Pull service, PullExpr ADT, query compiler
  Skolemize.ts      # Skolemize service, SkolemConfig, SkolemMapping
  index.ts          # Re-exports all Phase 5 modules

test/effect/
  Resource.test.ts
  Pull.test.ts
  Skolemize.test.ts
```

---

## Migration Notes

### Breaking Changes from Current API

1. **Resource**: Class-based `new Resource(changeset, subject)` becomes `Resource.for(subject)` returning `Effect`
2. **Pull**: Function signature changes from `pull(graph, expr, start)` to service-based `Pull.execute(expr, start)`
3. **Skolemize**: Global function becomes service with configurable behavior

### Compatibility Layer

Consider providing adapters for gradual migration:

```typescript
// src/compat/resource.ts
export const legacyResource = <T extends Quad_Subject>(
  changeset: ChangeSetGraph,
  subject: T
): ResourceOf<T> => {
  // Wrap Effect-based implementation in synchronous facade
  // Only for migration period
}
```
