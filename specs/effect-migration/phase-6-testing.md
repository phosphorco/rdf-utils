# Phase 6: Testing Migration

## Overview

This phase migrates the existing Bun test runner infrastructure to @effect/vitest while preserving and enhancing test coverage. The migration transforms 9 existing generic test suite factories and 2 integration test suites into Effect-native testing patterns, enabling:

- Effect-based test execution with proper error handling
- Service mocking via Layer composition
- Time-dependent testing with TestClock
- Property-based testing integration with fast-check
- Type-safe test utilities for RDF domain

**Current State:**
- 15 test files using `bun:test`
- 9 generic test suite factories (Graph, MutableGraph, ImmutableGraph, SPARQL, SparqlUpdate, Pull, TransactionalGraph, WithIri, WithIriDataSharing)
- 2 integration test suites (Stardog, GraphDB)
- Property-based tests using fast-check

**Target State:**
- All tests migrated to @effect/vitest
- Effect-native test patterns with proper service layers
- Integration test layers for external services
- Unified property-based testing approach

---

## Task 6.1: @effect/vitest Configuration

### Description

Set up @effect/vitest as the test framework, replacing Bun's built-in test runner. This provides seamless integration between Effect and Vitest, enabling Effect-native test execution.

### Subtasks

- **6.1.1**: Install @effect/vitest and vitest dependencies
- **6.1.2**: Configure vitest.config.ts for the project
- **6.1.3**: Create test utilities module with Effect helpers
- **6.1.4**: Update package.json test scripts

### Code Examples

**6.1.1 - Installation:**
```bash
bun add -d vitest @effect/vitest @vitest/coverage-v8
```

**6.1.2 - vitest.config.ts:**
```typescript
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: ["test-integration/**/*.test.ts"],
    globals: false,
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts"]
    }
  }
})
```

**6.1.3 - vitest.integration.config.ts:**
```typescript
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    include: ["test-integration/**/*.test.ts"],
    globals: false,
    environment: "node",
    testTimeout: 60000,
    hookTimeout: 30000,
    sequence: {
      shuffle: false
    }
  }
})
```

**6.1.4 - package.json scripts:**
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:all": "vitest run && vitest run --config vitest.integration.config.ts",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Gates

- [ ] @effect/vitest installed and configured
- [ ] `bun run test` executes with vitest
- [ ] Test files can import from "@effect/vitest"
- [ ] Coverage reporting functional

---

## Task 6.2: Effect Test Utilities

### Description

Create a comprehensive test utilities module providing Effect-native helpers for testing RDF graphs, services, and assertions. This module enables consistent test patterns across all test suites.

### Subtasks

- **6.2.1**: Create test layer builders for Graph services
- **6.2.2**: Mock service factories for Stardog/GraphDB
- **6.2.3**: Assertion helpers for Effect and RDF terms
- **6.2.4**: Test data generators for RDF terms

### Code Examples

**6.2.1 - test/lib/test-layers.ts:**
```typescript
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Context from "effect/Context"
import type { Quad, NamedNode } from "../../src/rdf"

export class TestGraph extends Context.Tag("TestGraph")<
  TestGraph,
  {
    readonly iri: NamedNode
    readonly quads: () => Effect.Effect<Iterable<Quad>>
    readonly add: (quads: Quad[]) => Effect.Effect<void>
    readonly remove: (quads: Quad[]) => Effect.Effect<void>
  }
>() {}

export const makeTestGraphLayer = (
  iri: NamedNode
): Layer.Layer<TestGraph> =>
  Layer.sync(TestGraph, () => {
    let store: Quad[] = []
    return {
      iri,
      quads: () => Effect.succeed(store),
      add: (quads) =>
        Effect.sync(() => {
          store = [...store, ...quads]
        }),
      remove: (quads) =>
        Effect.sync(() => {
          store = store.filter(
            (q) => !quads.some((r) => quadEquals(q, r))
          )
        })
    }
  })
```

**6.2.2 - test/lib/mock-services.ts:**
```typescript
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { StardogService } from "../../src/services/stardog"
import { GraphDBService } from "../../src/services/graphdb"

export const MockStardogLayer = Layer.succeed(StardogService, {
  query: (sparql) => Effect.succeed([]),
  update: (sparql) => Effect.succeed(void 0),
  begin: () => Effect.succeed(void 0),
  commit: () => Effect.succeed(void 0),
  rollback: () => Effect.succeed(void 0)
})

export const MockGraphDBLayer = Layer.succeed(GraphDBService, {
  query: (sparql) => Effect.succeed([]),
  update: (sparql) => Effect.succeed(void 0),
  beginTransaction: () => Effect.succeed("mock-tx-id"),
  commitTransaction: (id) => Effect.succeed(void 0),
  rollbackTransaction: (id) => Effect.succeed(void 0)
})
```

**6.2.3 - test/lib/assertions.ts:**
```typescript
import * as Effect from "effect/Effect"
import type { Quad, Term } from "../../src/rdf"

export const assertQuadCount = (
  quads: Iterable<Quad>,
  expected: number
): Effect.Effect<void> =>
  Effect.sync(() => {
    const count = [...quads].length
    if (count !== expected) {
      throw new Error(`Expected ${expected} quads, got ${count}`)
    }
  })

export const assertTermEquals = (
  actual: Term,
  expected: Term
): Effect.Effect<void> =>
  Effect.sync(() => {
    if (!actual.equals(expected)) {
      throw new Error(
        `Expected term ${expected.value}, got ${actual.value}`
      )
    }
  })

export const assertQuadPresent = (
  quads: Iterable<Quad>,
  subject: Term,
  predicate: Term,
  object: Term
): Effect.Effect<void> =>
  Effect.sync(() => {
    const found = [...quads].find(
      (q) =>
        q.subject.equals(subject) &&
        q.predicate.equals(predicate) &&
        q.object.equals(object)
    )
    if (!found) {
      throw new Error(
        `Quad not found: ${subject.value} ${predicate.value} ${object.value}`
      )
    }
  })
```

**6.2.4 - Effect test pattern:**
```typescript
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { TestGraph, makeTestGraphLayer } from "./lib/test-layers"
import { factory, namespace } from "../src/rdf"

const EX = namespace("http://example.org/")

describe("Graph Operations", () => {
  const TestLayer = makeTestGraphLayer(EX.testGraph)

  it.effect("should add quads to graph", () =>
    Effect.gen(function* () {
      const graph = yield* TestGraph
      const quad = factory.quad(EX.alice, EX.knows, EX.bob)

      yield* graph.add([quad])
      const quads = yield* graph.quads()

      assert.strictEqual([...quads].length, 1)
      assert.isTrue([...quads][0].subject.equals(EX.alice))
    }).pipe(Effect.provide(TestLayer))
  )

  it.effect("should remove quads from graph", () =>
    Effect.gen(function* () {
      const graph = yield* TestGraph
      const quad = factory.quad(EX.alice, EX.knows, EX.bob)

      yield* graph.add([quad])
      yield* graph.remove([quad])
      const quads = yield* graph.quads()

      assert.strictEqual([...quads].length, 0)
    }).pipe(Effect.provide(TestLayer))
  )
})
```

### Gates

- [ ] Test layer builders created
- [ ] Mock services for Stardog/GraphDB
- [ ] Assertion helpers for Effect/RDF
- [ ] Test data generators available

---

## Task 6.3: Generic Test Suite Migration

### Description

Migrate the 9 existing generic test suite factories from Bun's test runner to @effect/vitest. These factories provide reusable test suites that can be applied to any Graph implementation.

### Subtasks

- **6.3.1**: Inventory and document all generic test suites
- **6.3.2**: Create Effect-native test suite factory pattern
- **6.3.3**: Migrate each test suite factory
- **6.3.4**: Ensure backward compatibility with sync implementations

### Existing Generic Test Suites

| Suite | File | Purpose |
|-------|------|---------|
| `testGraphInterface` | graph.test.ts | Core Graph operations (quads, find) |
| `testMutableGraphInterface` | graph.test.ts | Add/remove for mutable graphs |
| `testImmutableGraphInterface` | graph.test.ts | Immutable add/remove returns new instance |
| `testWithIriMethod` | graph.test.ts | IRI modification |
| `testWithIriDataSharing` | graph.test.ts | Mutable data sharing on IRI change |
| `testSparqlInterface` | sparql.test.ts | SELECT, ASK, CONSTRUCT queries |
| `testSparqlUpdateInterface` | sparql.test.ts | INSERT/DELETE operations |
| `testPullInterface` | pull.test.ts | Pull expression evaluation |
| `testTransactionalGraphInterface` | transactional-graph.test.ts | Transaction lifecycle |

### Code Examples

**6.3.2 - Effect-native test suite factory pattern:**
```typescript
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { Graph, MutableGraph } from "../src/graph"
import type { Quad } from "../src/rdf"
import { factory, namespace } from "../src/rdf"

const EX = namespace("http://example.org/")
const XSD = namespace("http://www.w3.org/2001/XMLSchema#")

const testQuads = [
  factory.quad(EX.alice, EX.knows, EX.bob),
  factory.quad(EX.alice, EX.age, factory.literal("30", XSD.integer)),
  factory.quad(EX.bob, EX.name, factory.literal("Bob Smith", "en"))
]

export function testGraphInterface<G extends Graph<any>>(
  name: string,
  createGraph: () => Effect.Effect<G>,
  setupGraph: (graph: G, quads: Quad[]) => Effect.Effect<G>
) {
  describe(`${name} - Graph Interface`, () => {
    it.effect("should return quads", () =>
      Effect.gen(function* () {
        const graph = yield* createGraph()
        const populatedGraph = yield* setupGraph(graph, testQuads)

        const quads = [...yield* Effect.promise(() => populatedGraph.quads())]

        assert.strictEqual(quads.length, 3)
        const subjects = quads.map((q) => q.subject.value)
        assert.isTrue(subjects.includes("http://example.org/alice"))
        assert.isTrue(subjects.includes("http://example.org/bob"))
      })
    )

    it.effect("should handle empty graph", () =>
      Effect.gen(function* () {
        const graph = yield* createGraph()
        const quads = [...yield* Effect.promise(() => graph.quads())]

        assert.strictEqual(quads.length, 0)
      })
    )

    it.effect("should have graph IRI", () =>
      Effect.gen(function* () {
        const graph = yield* createGraph()

        assert.isDefined(graph.iri)
        assert.match(graph.iri.termType, /^(DefaultGraph|NamedNode)$/)
      })
    )

    it.effect("should find quads by subject", () =>
      Effect.gen(function* () {
        const graph = yield* createGraph()
        const populatedGraph = yield* setupGraph(graph, testQuads)

        const results = [
          ...yield* Effect.promise(() => populatedGraph.find(EX.alice))
        ]

        assert.strictEqual(results.length, 2)
        assert.isTrue(results.every((q) => q.subject.equals(EX.alice)))
      })
    )

    it.effect("should find quads by predicate", () =>
      Effect.gen(function* () {
        const graph = yield* createGraph()
        const populatedGraph = yield* setupGraph(graph, testQuads)

        const results = [
          ...yield* Effect.promise(() => populatedGraph.find(null, EX.knows))
        ]

        assert.strictEqual(results.length, 1)
        assert.isTrue(results[0].predicate.equals(EX.knows))
      })
    )

    it.effect("should find quads by object", () =>
      Effect.gen(function* () {
        const graph = yield* createGraph()
        const populatedGraph = yield* setupGraph(graph, testQuads)

        const results = [
          ...yield* Effect.promise(() =>
            populatedGraph.find(null, null, EX.bob)
          )
        ]

        assert.strictEqual(results.length, 1)
        assert.isTrue(results[0].object.equals(EX.bob))
      })
    )
  })
}
```

**6.3.3 - Mutable graph test suite:**
```typescript
export function testMutableGraphInterface<G extends MutableGraph<any>>(
  name: string,
  createGraph: () => Effect.Effect<G>
) {
  describe(`${name} - MutableGraph Interface`, () => {
    it.effect("should add quads and return self", () =>
      Effect.gen(function* () {
        const graph = yield* createGraph()

        const result = yield* Effect.promise(() => graph.add(testQuads))

        assert.strictEqual(result, graph)
        const quads = [...yield* Effect.promise(() => graph.quads())]
        assert.strictEqual(quads.length, 3)
      })
    )

    it.effect("should remove quads and return self", () =>
      Effect.gen(function* () {
        const graph = yield* createGraph()
        yield* Effect.promise(() => graph.add(testQuads))

        const result = yield* Effect.promise(() =>
          graph.remove([testQuads[0]])
        )

        assert.strictEqual(result, graph)
        const quads = [...yield* Effect.promise(() => graph.quads())]
        assert.strictEqual(quads.length, 2)
      })
    )

    it.effect("should handle adding duplicate quads", () =>
      Effect.gen(function* () {
        const graph = yield* createGraph()

        yield* Effect.promise(() => graph.add([testQuads[0]]))
        yield* Effect.promise(() => graph.add([testQuads[0]]))

        const quads = [...yield* Effect.promise(() => graph.quads())]
        assert.strictEqual(quads.length, 1)
      })
    )
  })
}
```

**6.3.4 - Transactional graph test suite:**
```typescript
export function testTransactionalGraphInterface<
  G extends TransactionalGraph<any>
>(
  name: string,
  createGraph: () => Effect.Effect<G>,
  cleanupGraph?: (graph: G) => Effect.Effect<void>
) {
  describe(`${name} - TransactionalGraph Interface`, () => {
    it.effect("should begin, commit, and rollback transactions", () =>
      Effect.gen(function* () {
        const graph = yield* createGraph()
        if (cleanupGraph) yield* cleanupGraph(graph)

        yield* Effect.promise(() => graph.begin())
        yield* Effect.promise(() => graph.add([testQuads[0]]))
        yield* Effect.promise(() => graph.commit())

        const quads = [...yield* Effect.promise(() => graph.quads())]
        const found = quads.find(
          (q) =>
            q.subject.equals(testQuads[0].subject) &&
            q.predicate.equals(testQuads[0].predicate) &&
            q.object.equals(testQuads[0].object)
        )
        assert.isDefined(found)
      })
    )

    it.effect("should rollback transactions properly", () =>
      Effect.gen(function* () {
        const graph = yield* createGraph()
        if (cleanupGraph) yield* cleanupGraph(graph)

        yield* Effect.promise(() => graph.begin())
        const testQuad = factory.quad(
          EX["rollback-test"],
          EX.property,
          factory.literal("rollback value")
        )
        yield* Effect.promise(() => graph.add([testQuad]))
        yield* Effect.promise(() => graph.rollback())

        const quads = [...yield* Effect.promise(() => graph.quads())]
        const found = quads.find((q) =>
          q.subject.equals(EX["rollback-test"])
        )
        assert.isUndefined(found)
      })
    )
  })
}
```

### Gates

- [ ] All 9 generic test suite factories migrated
- [ ] Test suites work with both sync and async graph implementations
- [ ] Backward compatibility maintained
- [ ] Tests pass for all existing graph implementations

---

## Task 6.4: Integration Test Layers

### Description

Create Effect Layers for integration testing against real Stardog and GraphDB instances. These layers handle connection lifecycle, test isolation, and cleanup.

### Subtasks

- **6.4.1**: Create Stardog integration test layer
- **6.4.2**: Create GraphDB integration test layer
- **6.4.3**: Implement test isolation and cleanup helpers
- **6.4.4**: Configure environment-based connection settings

### Code Examples

**6.4.1 - test-integration/lib/stardog-layer.ts:**
```typescript
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import { StardogGraph, StardogConfig } from "../../src/graph/stardog"
import { factory } from "../../src/rdf"

export class StardogTestConfig extends Context.Tag("StardogTestConfig")<
  StardogTestConfig,
  StardogConfig
>() {}

export const StardogTestConfigLayer = Layer.effect(
  StardogTestConfig,
  Effect.gen(function* () {
    const protocol = yield* Config.string("STARDOG_PROTOCOL").pipe(
      Config.withDefault("http")
    )
    const host = yield* Config.string("STARDOG_HOST").pipe(
      Config.withDefault("localhost")
    )
    const port = yield* Config.string("STARDOG_PORT").pipe(
      Config.withDefault("5820")
    )
    const username = yield* Config.string("STARDOG_USERNAME").pipe(
      Config.withDefault("admin")
    )
    const password = yield* Config.string("STARDOG_PASSWORD").pipe(
      Config.withDefault("admin")
    )
    const database = yield* Config.string("STARDOG_DATABASE").pipe(
      Config.withDefault("test")
    )

    return {
      endpoint: `${protocol}://${host}:${port}`,
      username,
      password,
      database
    }
  })
)

export class StardogTestGraph extends Context.Tag("StardogTestGraph")<
  StardogTestGraph,
  StardogGraph
>() {}

export const StardogTestGraphLayer = Layer.effect(
  StardogTestGraph,
  Effect.gen(function* () {
    const config = yield* StardogTestConfig
    const testGraphIri = factory.namedNode(
      "http://test.example.org/integration/graph"
    )
    const graph = new StardogGraph(config, testGraphIri, false)

    yield* Effect.tryPromise(() => graph.deleteAll()).pipe(
      Effect.catchAll(() => Effect.succeed(void 0))
    )

    return graph
  })
)

export const StardogTestLayer = Layer.provideMerge(
  StardogTestGraphLayer,
  StardogTestConfigLayer
)
```

**6.4.2 - test-integration/lib/graphdb-layer.ts:**
```typescript
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import { GraphDBGraph, GraphDBConfig } from "../../src/graph/graphdb"
import { factory } from "../../src/rdf"

export class GraphDBTestConfig extends Context.Tag("GraphDBTestConfig")<
  GraphDBTestConfig,
  GraphDBConfig
>() {}

export const GraphDBTestConfigLayer = Layer.effect(
  GraphDBTestConfig,
  Effect.gen(function* () {
    const protocol = yield* Config.string("GRAPHDB_PROTOCOL").pipe(
      Config.withDefault("http")
    )
    const host = yield* Config.string("GRAPHDB_HOST").pipe(
      Config.withDefault("localhost")
    )
    const port = yield* Config.string("GRAPHDB_PORT").pipe(
      Config.withDefault("7200")
    )
    const repository = yield* Config.string("GRAPHDB_REPOSITORY").pipe(
      Config.withDefault("test")
    )

    return {
      endpoint: `${protocol}://${host}:${port}`,
      repository
    }
  })
)

export class GraphDBTestGraph extends Context.Tag("GraphDBTestGraph")<
  GraphDBTestGraph,
  GraphDBGraph
>() {}

export const GraphDBTestGraphLayer = Layer.effect(
  GraphDBTestGraph,
  Effect.gen(function* () {
    const config = yield* GraphDBTestConfig
    const testGraphIri = factory.namedNode(
      "http://test.example.org/integration/graph"
    )
    const graph = new GraphDBGraph(config, testGraphIri)

    yield* Effect.tryPromise(() => graph.deleteAll()).pipe(
      Effect.catchAll(() => Effect.succeed(void 0))
    )

    return graph
  })
)

export const GraphDBTestLayer = Layer.provideMerge(
  GraphDBTestGraphLayer,
  GraphDBTestConfigLayer
)
```

**6.4.3 - test-integration/lib/test-isolation.ts:**
```typescript
import * as Effect from "effect/Effect"
import * as Scope from "effect/Scope"
import type { MutableGraph, TransactionalGraph } from "../../src/graph"

export const withCleanGraph = <G extends MutableGraph<any>>(
  graph: G
): Effect.Effect<G, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.tryPromise(() => graph.deleteAll()).pipe(
      Effect.map(() => graph),
      Effect.catchAll(() => Effect.succeed(graph))
    ),
    (g) =>
      Effect.tryPromise(() => g.deleteAll()).pipe(
        Effect.catchAll(() => Effect.succeed(void 0))
      )
  )

export const withTransaction = <G extends TransactionalGraph<any>, A>(
  graph: G,
  operation: (g: G) => Effect.Effect<A>
): Effect.Effect<A> =>
  Effect.acquireUseRelease(
    Effect.tryPromise(() => graph.begin()),
    () => operation(graph),
    (_, exit) =>
      exit._tag === "Success"
        ? Effect.tryPromise(() => graph.commit())
        : Effect.tryPromise(() => graph.rollback())
  )
```

**6.4.4 - Integration test example:**
```typescript
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { StardogTestGraph, StardogTestLayer } from "./lib/stardog-layer"
import { withCleanGraph } from "./lib/test-isolation"
import { factory, namespace } from "../src/rdf"

const EX = namespace("http://example.org/")

describe("Stardog Integration Tests", () => {
  it.effect("should add and query quads", () =>
    Effect.gen(function* () {
      const graph = yield* StardogTestGraph

      const quad = factory.quad(
        EX.test,
        EX.property,
        factory.literal("test value")
      )

      yield* Effect.tryPromise(() => graph.add([quad]))
      const quads = [...yield* Effect.tryPromise(() => graph.quads())]

      assert.strictEqual(quads.length, 1)
      assert.strictEqual(quads[0].object.value, "test value")
    }).pipe(Effect.scoped, Effect.provide(StardogTestLayer))
  )

  it.effect("should execute SPARQL queries", () =>
    Effect.gen(function* () {
      const graph = yield* StardogTestGraph

      const quad = factory.quad(
        EX.alice,
        EX.knows,
        EX.bob
      )
      yield* Effect.tryPromise(() => graph.add([quad]))

      const result = yield* Effect.tryPromise(() =>
        graph.ask(`
          PREFIX ex: <http://example.org/>
          ASK { ex:alice ex:knows ex:bob }
        `)
      )

      assert.isTrue(result)
    }).pipe(Effect.scoped, Effect.provide(StardogTestLayer))
  )
})
```

### Gates

- [ ] Stardog integration layer created and working
- [ ] GraphDB integration layer created and working
- [ ] Test isolation with automatic cleanup
- [ ] Environment-based configuration
- [ ] All existing integration tests migrated

---

## Task 6.5: Property-Based Testing

### Description

Integrate fast-check with Effect for property-based testing of RDF term invariants. This ensures correctness across a wide range of inputs.

### Subtasks

- **6.5.1**: Create Effect-native property test helpers
- **6.5.2**: Migrate existing property tests
- **6.5.3**: Add property tests for Effect-based operations
- **6.5.4**: Integrate with @effect/vitest

### Code Examples

**6.5.1 - test/lib/property-helpers.ts:**
```typescript
import * as Effect from "effect/Effect"
import * as fc from "fast-check"
import { factory, namespace } from "../../src/rdf"
import type { Term, NamedNode, BlankNode, Literal, Quad } from "../../src/rdf"

const XSD = namespace("http://www.w3.org/2001/XMLSchema#")

export const arbIri = fc.oneof(
  fc.webUrl(),
  fc.constantFrom(
    "http://example.org/test",
    "https://schema.org/Person",
    "http://www.w3.org/2001/XMLSchema#string"
  ),
  fc
    .string({ minLength: 1, maxLength: 50 })
    .map((s) => `http://example.org/${encodeURIComponent(s)}`)
)

export const arbLiteralValue = fc.oneof(
  fc.string(),
  fc.integer().map(String),
  fc.boolean().map(String)
)

export const arbLanguageTag = fc.constantFrom(
  "en",
  "en-US",
  "fr",
  "de",
  "zh-CN"
)

export const arbDatatype = fc.constantFrom(
  XSD.string.value,
  XSD.integer.value,
  XSD.boolean.value,
  XSD.dateTime.value
)

export const arbNamedNode: fc.Arbitrary<NamedNode> = arbIri.map((iri) =>
  factory.namedNode(iri)
)

export const arbBlankNode: fc.Arbitrary<BlankNode> = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => /^[a-zA-Z0-9_-]+$/.test(s))
  .map((id) => factory.blankNode(id))

export const arbLiteral: fc.Arbitrary<Literal> = fc.oneof(
  fc
    .tuple(arbLiteralValue, arbLanguageTag)
    .map(([value, lang]) => factory.literal(value, lang)),
  fc
    .tuple(arbLiteralValue, arbDatatype)
    .map(([value, dt]) => factory.literal(value, factory.namedNode(dt)))
)

export const arbTerm: fc.Arbitrary<Term> = fc.oneof(
  arbNamedNode,
  arbBlankNode,
  arbLiteral
)

export const arbQuad: fc.Arbitrary<Quad> = fc
  .tuple(
    fc.oneof(arbNamedNode, arbBlankNode),
    arbNamedNode,
    fc.oneof(arbNamedNode, arbBlankNode, arbLiteral),
    fc.oneof(arbNamedNode, fc.constant(factory.defaultGraph()))
  )
  .map(([s, p, o, g]) => factory.quad(s, p, o, g))
```

**6.5.2 - test/lib/effect-property.ts:**
```typescript
import * as Effect from "effect/Effect"
import * as fc from "fast-check"

export const effectProperty = <A>(
  arb: fc.Arbitrary<A>,
  predicate: (a: A) => Effect.Effect<void>
): Effect.Effect<void> =>
  Effect.sync(() => {
    fc.assert(
      fc.property(arb, (a) => {
        Effect.runSync(predicate(a))
      })
    )
  })

export const effectProperty2 = <A, B>(
  arbA: fc.Arbitrary<A>,
  arbB: fc.Arbitrary<B>,
  predicate: (a: A, b: B) => Effect.Effect<void>
): Effect.Effect<void> =>
  Effect.sync(() => {
    fc.assert(
      fc.property(arbA, arbB, (a, b) => {
        Effect.runSync(predicate(a, b))
      })
    )
  })
```

**6.5.3 - Migrated property tests:**
```typescript
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as fc from "fast-check"
import {
  arbTerm,
  arbNamedNode,
  arbLiteral,
  arbQuad,
  arbIri
} from "./lib/property-helpers"
import { effectProperty, effectProperty2 } from "./lib/effect-property"
import { factory, XSD } from "../src/rdf"

describe("RDF Term Properties", () => {
  it.effect("equality is reflexive", () =>
    effectProperty(arbTerm, (term) =>
      Effect.sync(() => {
        assert.isTrue(term.equals(term))
      })
    )
  )

  it.effect("equality is symmetric", () =>
    effectProperty2(arbTerm, arbTerm, (a, b) =>
      Effect.sync(() => {
        assert.strictEqual(a.equals(b), b.equals(a))
      })
    )
  )

  it.effect("hash consistency", () =>
    effectProperty2(arbTerm, arbTerm, (a, b) =>
      Effect.sync(() => {
        if (a.equals(b)) {
          assert.strictEqual(a.hashCode(), b.hashCode())
        }
      })
    )
  )

  it.effect("null/undefined handling", () =>
    effectProperty(arbTerm, (term) =>
      Effect.sync(() => {
        assert.isFalse(term.equals(null))
        assert.isFalse(term.equals(undefined))
      })
    )
  )
})

describe("NamedNode Properties", () => {
  it.effect("preserves IRI value", () =>
    effectProperty(arbIri, (iri) =>
      Effect.sync(() => {
        const node = factory.namedNode(iri)
        assert.strictEqual(node.termType, "NamedNode")
        assert.strictEqual(node.value, iri)
      })
    )
  )
})

describe("Literal Properties", () => {
  it.effect("string literals have correct datatype", () =>
    effectProperty(
      fc.string(),
      (value) =>
        Effect.sync(() => {
          const literal = factory.literal(value)
          assert.strictEqual(literal.termType, "Literal")
          assert.strictEqual(literal.value, value)
          assert.isTrue(literal.datatype.equals(XSD.string))
          assert.strictEqual(literal.language, "")
        })
    )
  )
})

describe("Quad Properties", () =>
  it.effect("preserves all components", () =>
    effectProperty(arbQuad, (quad) =>
      Effect.sync(() => {
        assert.strictEqual(quad.termType, "Quad")
        assert.isDefined(quad.subject)
        assert.isDefined(quad.predicate)
        assert.isDefined(quad.object)
        assert.isDefined(quad.graph)
      })
    )
  )
)

describe("Factory Consistency", () => {
  it.effect("same inputs produce equal outputs", () =>
    effectProperty(arbIri, (iri) =>
      Effect.sync(() => {
        const node1 = factory.namedNode(iri)
        const node2 = factory.namedNode(iri)
        assert.isTrue(node1.equals(node2))
      })
    )
  )
})

describe("Immutability Properties", () => {
  it.effect("terms preserve values after creation", () =>
    effectProperty(arbTerm, (term) =>
      Effect.sync(() => {
        const originalValue = term.value
        const originalTermType = term.termType

        assert.strictEqual(term.value, originalValue)
        assert.strictEqual(term.termType, originalTermType)
        assert.strictEqual(term.value, originalValue)
      })
    )
  )
})
```

**6.5.4 - Graph property tests:**
```typescript
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as fc from "fast-check"
import { arbQuad } from "./lib/property-helpers"
import { N3Graph } from "../src/graph/n3"
import { ImmutableSetGraph } from "../src/graph/immutable"

describe("Graph Property Tests", () => {
  it.effect("add then remove returns empty graph", () =>
    Effect.gen(function* () {
      fc.assert(
        fc.property(fc.array(arbQuad, { maxLength: 10 }), (quads) => {
          const graph = new N3Graph()
          graph.add(quads)
          graph.remove(quads)
          const remaining = [...graph.quads()]
          return remaining.length === 0
        })
      )
    })
  )

  it.effect("immutable add preserves original", () =>
    Effect.gen(function* () {
      fc.assert(
        fc.property(fc.array(arbQuad, { maxLength: 10 }), (quads) => {
          const original = new ImmutableSetGraph()
          const modified = original.add(quads)

          const originalQuads = [...original.quads()]
          const modifiedQuads = [...modified.quads()]

          return (
            originalQuads.length === 0 && modifiedQuads.length === quads.length
          )
        })
      )
    })
  )

  it.effect("find returns subset of quads", () =>
    Effect.gen(function* () {
      fc.assert(
        fc.property(fc.array(arbQuad, { maxLength: 10 }), (quads) => {
          const graph = new N3Graph()
          graph.add(quads)

          const allQuads = [...graph.quads()]
          if (allQuads.length === 0) return true

          const firstSubject = allQuads[0].subject
          const found = [...graph.find(firstSubject)]

          return found.every((q) => q.subject.equals(firstSubject))
        })
      )
    })
  )
})
```

### Gates

- [ ] Effect-native property test helpers created
- [ ] Existing property tests migrated
- [ ] Property tests for Graph operations
- [ ] Integration with @effect/vitest working
- [ ] All property tests passing

---

## Task 6.6: Time-Dependent Testing

### Description

Implement time-dependent testing patterns using Effect's TestClock for operations that involve timeouts, delays, or scheduling.

### Subtasks

- **6.6.1**: Identify time-dependent operations in the codebase
- **6.6.2**: Create TestClock-based test utilities
- **6.6.3**: Add tests for timeout scenarios

### Code Examples

**6.6.1 - TestClock usage for transaction timeouts:**
```typescript
import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as TestClock from "effect/TestClock"
import * as Duration from "effect/Duration"

it.effect("should timeout long-running transactions", () =>
  Effect.gen(function* () {
    const longOperation = Effect.sleep(Duration.seconds(30)).pipe(
      Effect.as("completed")
    )

    const withTimeout = longOperation.pipe(
      Effect.timeout(Duration.seconds(5)),
      Effect.option
    )

    const fiber = yield* Effect.fork(withTimeout)

    yield* TestClock.adjust(Duration.seconds(5))

    const result = yield* Fiber.join(fiber)

    assert.isTrue(result._tag === "None")
  })
)

it.effect("should complete before timeout", () =>
  Effect.gen(function* () {
    const quickOperation = Effect.sleep(Duration.seconds(2)).pipe(
      Effect.as("completed")
    )

    const withTimeout = quickOperation.pipe(
      Effect.timeout(Duration.seconds(5)),
      Effect.option
    )

    const fiber = yield* Effect.fork(withTimeout)

    yield* TestClock.adjust(Duration.seconds(2))

    const result = yield* Fiber.join(fiber)

    assert.isTrue(result._tag === "Some")
    assert.strictEqual(result.value, "completed")
  })
)
```

**6.6.2 - Connection retry testing:**
```typescript
import { assert, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as TestClock from "effect/TestClock"
import * as Duration from "effect/Duration"
import * as Schedule from "effect/Schedule"

it.effect("should retry connection with exponential backoff", () =>
  Effect.gen(function* () {
    let attempts = 0

    const failingOperation = Effect.sync(() => {
      attempts++
      if (attempts < 3) {
        throw new Error("Connection failed")
      }
      return "connected"
    })

    const withRetry = failingOperation.pipe(
      Effect.retry(
        Schedule.exponential(Duration.seconds(1)).pipe(
          Schedule.compose(Schedule.recurs(5))
        )
      )
    )

    const fiber = yield* Effect.fork(withRetry)

    yield* TestClock.adjust(Duration.seconds(1))
    yield* TestClock.adjust(Duration.seconds(2))

    const result = yield* Fiber.join(fiber)

    assert.strictEqual(result, "connected")
    assert.strictEqual(attempts, 3)
  })
)
```

### Gates

- [ ] Time-dependent operations identified
- [ ] TestClock utilities created
- [ ] Timeout scenario tests added
- [ ] Retry logic tests added

---

## Phase Gates

- [ ] @effect/vitest installed and configured
- [ ] All 9 generic test suite factories migrated
- [ ] All existing tests migrated or have equivalent coverage
- [ ] Integration test layers for Stardog and GraphDB
- [ ] Property-based tests for RDF term invariants
- [ ] Time-dependent testing with TestClock
- [ ] `bun run test` passes with all unit tests
- [ ] `bun run test:integration` passes with integration tests
- [ ] Test coverage >= existing coverage
- [ ] CI pipeline updated for new test runner

---

## Dependencies

| Phase | Dependency Type | Description |
|-------|-----------------|-------------|
| Phase 1 | Required | Core Effect infrastructure must be in place |
| Phase 2 | Required | Graph interfaces must be Effect-native |
| Phase 3 | Required | RDF services needed for integration tests |
| Phase 4 | Required | SPARQL services for query testing |
| Phase 5 | Partial | Effect-based graphs to test against |

---

## Migration Order

1. **Phase 6.1**: Infrastructure setup (can start immediately)
2. **Phase 6.2**: Test utilities (requires Phase 6.1)
3. **Phase 6.3**: Generic test suites (requires Phase 6.2, parallel work possible)
4. **Phase 6.4**: Integration layers (requires Phase 6.2, can parallel with 6.3)
5. **Phase 6.5**: Property tests (requires Phase 6.2)
6. **Phase 6.6**: Time-dependent tests (requires Phase 6.2)

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Breaking existing tests | Maintain parallel test runs during migration |
| Integration test flakiness | Add retry logic and proper cleanup |
| Coverage regression | Track coverage metrics before and after |
| CI pipeline changes | Update incrementally with feature flags |
| Async/sync compatibility | Wrap Promise-based APIs in Effect.promise |
