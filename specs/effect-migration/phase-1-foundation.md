# Phase 1: Foundation

## Overview

Phase 1 establishes the foundational Effect patterns that all subsequent phases depend on. This phase converts the library's core primitives (errors, RDF terms, factory, namespaces) to Effect-based implementations while maintaining backward compatibility through the existing API surface.

**Goals:**
1. Replace 40+ throw statements with typed `Data.TaggedError` classes
2. Convert RDF term interfaces to `Schema.TaggedClass` for automatic Equal/Hash
3. Create `RdfFactory` service via `Context.Tag` for dependency injection
4. Build type-safe namespace utilities with Effect patterns

**Non-Goals:**
- Converting Graph implementations (Phase 2)
- Modifying public API signatures (preserving compatibility)
- Adding new functionality

## Task 1.1: Error ADT

### Description

Create a comprehensive error type hierarchy using `Data.TaggedError`. All errors will be typed, composable, and provide structured information for programmatic handling.

### Error Catalog

Based on analysis of the codebase, errors fall into these categories:

| Category | Count | Source Files |
|----------|-------|--------------|
| Parse Errors | 4 | base.ts |
| Query Errors | 6 | base.ts, stardog.ts, graphdb.ts |
| Transaction Errors | 8 | stardog.ts, graphdb.ts |
| HTTP/Network Errors | 8 | stardog.ts, graphdb.ts |
| Serialization Errors | 2 | graphdb.ts |
| Binding Errors | 2 | stardog.ts, graphdb.ts |
| Graph Operation Errors | 2 | stardog.ts, graphdb.ts |

### Subtasks

#### 1.1.1: Create error module structure

Create `src/errors.ts` with the base error hierarchy:

```typescript
import * as Data from "effect/Data"

// Base error for all RDF-related errors
export class RdfError extends Data.TaggedError("RdfError")<{
  readonly message: string
  readonly cause?: unknown
}> {}
```

#### 1.1.2: Define Parse Errors

```typescript
export class SparqlParseError extends Data.TaggedError("SparqlParseError")<{
  readonly query: string
  readonly message: string
  readonly cause?: unknown
}> {}

export class UnsupportedQueryTypeError extends Data.TaggedError("UnsupportedQueryTypeError")<{
  readonly queryType: string
  readonly expectedType: string
}> {}

export class UnexpectedQueryTypeError extends Data.TaggedError("UnexpectedQueryTypeError")<{
  readonly actualType: string
  readonly expectedType: string
}> {}

export class InvalidResultTypeError extends Data.TaggedError("InvalidResultTypeError")<{
  readonly expectedType: "boolean" | "bindings" | "quads"
  readonly operation: "ask" | "select" | "construct"
}> {}

export class AsyncParsingRequiredError extends Data.TaggedError("AsyncParsingRequiredError")<{
  readonly format: string
  readonly suggestion: string
}> {}
```

#### 1.1.3: Define Transaction Errors

```typescript
export class TransactionAlreadyInProgressError extends Data.TaggedError("TransactionAlreadyInProgressError")<{
  readonly backend: "stardog" | "graphdb"
}> {}

export class NoTransactionInProgressError extends Data.TaggedError("NoTransactionInProgressError")<{
  readonly operation: "commit" | "rollback" | "update"
  readonly backend: "stardog" | "graphdb"
}> {}

export class TransactionBeginError extends Data.TaggedError("TransactionBeginError")<{
  readonly backend: "stardog" | "graphdb"
  readonly status: number
  readonly statusText: string
}> {}

export class TransactionCommitError extends Data.TaggedError("TransactionCommitError")<{
  readonly backend: "stardog" | "graphdb"
  readonly action: string
  readonly status: number
  readonly statusText: string
}> {}

export class MissingLocationHeaderError extends Data.TaggedError("MissingLocationHeaderError")<{
  readonly backend: "graphdb"
}> {}
```

#### 1.1.4: Define HTTP/Query Execution Errors

```typescript
export class QueryExecutionError extends Data.TaggedError("QueryExecutionError")<{
  readonly query: string
  readonly backend: "stardog" | "graphdb"
  readonly status: number
  readonly statusText: string
  readonly body?: string
}> {}

export class UpdateExecutionError extends Data.TaggedError("UpdateExecutionError")<{
  readonly query: string
  readonly backend: "stardog" | "graphdb"
  readonly status: number
  readonly statusText: string
  readonly body?: string
}> {}

export class QuadOperationError extends Data.TaggedError("QuadOperationError")<{
  readonly operation: "add" | "remove" | "deleteAll"
  readonly backend: "stardog" | "graphdb"
  readonly status: number
  readonly statusText: string
  readonly body?: string
}> {}

export class DeleteDefaultGraphError extends Data.TaggedError("DeleteDefaultGraphError")<{
  readonly backend: "stardog" | "graphdb"
}> {}
```

#### 1.1.5: Define Serialization/Binding Errors

```typescript
export class TermSerializationError extends Data.TaggedError("TermSerializationError")<{
  readonly termType: string
  readonly context: "sparql" | "nquads" | "turtle"
}> {}

export class InvalidSparqlBindingError extends Data.TaggedError("InvalidSparqlBindingError")<{
  readonly rawValue: unknown
  readonly backend: "stardog" | "graphdb"
}> {}
```

#### 1.1.6: Create error union types for handlers

```typescript
// Union types for exhaustive pattern matching
export type ParseError =
  | SparqlParseError
  | UnsupportedQueryTypeError
  | UnexpectedQueryTypeError
  | InvalidResultTypeError
  | AsyncParsingRequiredError

export type TransactionError =
  | TransactionAlreadyInProgressError
  | NoTransactionInProgressError
  | TransactionBeginError
  | TransactionCommitError
  | MissingLocationHeaderError

export type ExecutionError =
  | QueryExecutionError
  | UpdateExecutionError
  | QuadOperationError
  | DeleteDefaultGraphError

export type SerializationError =
  | TermSerializationError
  | InvalidSparqlBindingError

export type RdfUtilsError =
  | ParseError
  | TransactionError
  | ExecutionError
  | SerializationError
```

### Code Examples

**Creating an error:**
```typescript
import * as Effect from "effect/Effect"
import { QueryExecutionError } from "./errors"

const executeQuery = (query: string) =>
  Effect.gen(function* () {
    const response = yield* httpExecute(query)
    if (!response.ok) {
      return yield* Effect.fail(
        new QueryExecutionError({
          query,
          backend: "graphdb",
          status: response.status,
          statusText: response.statusText
        })
      )
    }
    return response
  })
```

**Handling errors with catchTag:**
```typescript
import * as Effect from "effect/Effect"
import * as Match from "effect/Match"

const handleQueryErrors = <A, R>(effect: Effect.Effect<A, RdfUtilsError, R>) =>
  effect.pipe(
    Effect.catchTags({
      QueryExecutionError: (e) =>
        Effect.logError(`Query failed on ${e.backend}: ${e.statusText}`),
      TransactionAlreadyInProgressError: (e) =>
        Effect.logWarning(`Transaction already active on ${e.backend}`)
    })
  )
```

### Gates

- [ ] All 16 error classes compile without errors
- [ ] Each error class extends `Data.TaggedError`
- [ ] Union types cover all error cases
- [ ] `bunx tsc --noEmit` passes for `src/errors.ts`
- [ ] Basic unit tests verify error construction and properties

---

## Task 1.2: RDF Term Schemas

### Description

Replace plain interfaces and classes with `Schema.TaggedClass` to get automatic `Equal`, `Hash`, `Arbitrary`, and codec support. This provides type-safe serialization and eliminates the manual `ValueObject` implementation.

### Current Implementation Analysis

The current `src/rdf.ts` has:
- `ImmutableTerm<TermType, ValueType>` base class implementing `ValueObject`
- `ImmutableLiteral` extending base with language/direction/datatype
- `ImmutableBaseQuad` for quad representation
- Manual `equals()` and `hashCode()` implementations

### Subtasks

#### 1.2.1: Create term schema module

Create `src/term.ts` with Schema-based term definitions:

```typescript
import * as Schema from "effect/Schema"
import * as Equal from "effect/Equal"
import * as Hash from "effect/Hash"

// Direction type for literals
export const Direction = Schema.Union(
  Schema.Literal("ltr"),
  Schema.Literal("rtl"),
  Schema.Literal(""),
  Schema.Null
)
export type Direction = typeof Direction.Type
```

#### 1.2.2: Define NamedNode schema

```typescript
export class NamedNode<Iri extends string = string> extends Schema.TaggedClass<NamedNode<Iri>>()(
  "NamedNode",
  {
    termType: Schema.Literal("NamedNode"),
    value: Schema.String as Schema.Schema<Iri, Iri, never>
  },
  {
    description: "An IRI reference"
  }
) {
  toString(): string {
    return this.value
  }
}

export const namedNode = <Iri extends string>(value: Iri): NamedNode<Iri> =>
  new NamedNode({ termType: "NamedNode", value })
```

#### 1.2.3: Define BlankNode schema

```typescript
export class BlankNode extends Schema.TaggedClass<BlankNode>()(
  "BlankNode",
  {
    termType: Schema.Literal("BlankNode"),
    value: Schema.String
  },
  {
    description: "A blank node identifier"
  }
) {
  toString(): string {
    return `_:${this.value}`
  }
}

export const blankNode = (value: string): BlankNode =>
  new BlankNode({ termType: "BlankNode", value })
```

#### 1.2.4: Define Literal schema

```typescript
// Forward reference for datatype
const LiteralDatatype = Schema.suspend((): Schema.Schema<NamedNode> => NamedNode)

export class Literal extends Schema.TaggedClass<Literal>()(
  "Literal",
  {
    termType: Schema.Literal("Literal"),
    value: Schema.String,
    language: Schema.String.pipe(Schema.propertySignature, Schema.withDefault(() => "")),
    direction: Direction.pipe(Schema.propertySignature, Schema.withDefault(() => null)),
    datatype: LiteralDatatype
  },
  {
    description: "A literal value with optional language tag and datatype"
  }
) {
  toString(): string {
    if (this.language) {
      return `"${this.value}"@${this.language}`
    }
    if (this.datatype.value !== "http://www.w3.org/2001/XMLSchema#string") {
      return `"${this.value}"^^<${this.datatype.value}>`
    }
    return `"${this.value}"`
  }
}
```

#### 1.2.5: Define Variable schema

```typescript
export class Variable extends Schema.TaggedClass<Variable>()(
  "Variable",
  {
    termType: Schema.Literal("Variable"),
    value: Schema.String
  },
  {
    description: "A SPARQL variable"
  }
) {
  toString(): string {
    return `?${this.value}`
  }
}

export const variable = (value: string): Variable =>
  new Variable({ termType: "Variable", value })
```

#### 1.2.6: Define DefaultGraph schema

```typescript
export class DefaultGraph extends Schema.TaggedClass<DefaultGraph>()(
  "DefaultGraph",
  {
    termType: Schema.Literal("DefaultGraph"),
    value: Schema.Literal("")
  },
  {
    description: "The default graph"
  }
) {
  toString(): string {
    return ""
  }
}

// Singleton instance
export const defaultGraph = (): DefaultGraph =>
  new DefaultGraph({ termType: "DefaultGraph", value: "" })
```

#### 1.2.7: Define Quad schema with RDF-star support

```typescript
// Term union for subject/object positions (includes Quad for RDF-star)
export type QuadSubject = NamedNode | BlankNode | Variable | Quad
export type QuadPredicate = NamedNode | Variable
export type QuadObject = NamedNode | BlankNode | Literal | Variable | Quad
export type QuadGraph = NamedNode | BlankNode | Variable | DefaultGraph

// Recursive schema for RDF-star triple terms
export class Quad extends Schema.TaggedClass<Quad>()(
  "Quad",
  {
    termType: Schema.Literal("Quad"),
    value: Schema.Literal(""),
    subject: Schema.suspend((): Schema.Schema<QuadSubject> => QuadSubjectSchema),
    predicate: Schema.suspend((): Schema.Schema<QuadPredicate> => QuadPredicateSchema),
    object: Schema.suspend((): Schema.Schema<QuadObject> => QuadObjectSchema),
    graph: Schema.suspend((): Schema.Schema<QuadGraph> => QuadGraphSchema)
  },
  {
    description: "An RDF quad (triple with graph)"
  }
) {
  equals(other: unknown): boolean {
    if (!(other instanceof Quad)) return false
    return Equal.equals(this.subject, other.subject) &&
           Equal.equals(this.predicate, other.predicate) &&
           Equal.equals(this.object, other.object) &&
           Equal.equals(this.graph, other.graph)
  }

  [Hash.symbol](): number {
    return Hash.combine(Hash.hash(this.subject))(
      Hash.combine(Hash.hash(this.predicate))(
        Hash.combine(Hash.hash(this.object))(
          Hash.hash(this.graph)
        )
      )
    )
  }
}

// Union schemas for quad positions
const QuadSubjectSchema = Schema.Union(NamedNode, BlankNode, Variable, Schema.suspend(() => Quad))
const QuadPredicateSchema = Schema.Union(NamedNode, Variable)
const QuadObjectSchema = Schema.Union(NamedNode, BlankNode, Literal, Variable, Schema.suspend(() => Quad))
const QuadGraphSchema = Schema.Union(NamedNode, BlankNode, Variable, DefaultGraph)
```

#### 1.2.8: Define Term union schema

```typescript
export const Term = Schema.Union(
  NamedNode,
  BlankNode,
  Literal,
  Variable,
  DefaultGraph,
  Quad
)
export type Term = typeof Term.Type
```

### Code Examples

**Using Schema decode for parsing:**
```typescript
import * as Schema from "effect/Schema"
import { NamedNode, Literal } from "./term"

// Parse from JSON
const parseNamedNode = Schema.decodeUnknown(NamedNode)

const result = parseNamedNode({
  termType: "NamedNode",
  value: "http://example.org/resource"
})
// Effect<NamedNode, ParseError, never>
```

**Automatic equality:**
```typescript
import * as Equal from "effect/Equal"
import { namedNode, literal } from "./term"

const n1 = namedNode("http://example.org/a")
const n2 = namedNode("http://example.org/a")

console.log(Equal.equals(n1, n2)) // true

// Works in Set/Map
import { HashSet } from "effect"
const set = HashSet.make(n1, n2)
console.log(HashSet.size(set)) // 1
```

### Gates

- [ ] All term classes extend `Schema.TaggedClass`
- [ ] Terms implement `Equal.symbol` and `Hash.symbol`
- [ ] Quad supports recursive RDF-star triple terms
- [ ] Schema decode/encode roundtrips correctly
- [ ] `bunx tsc --noEmit` passes for `src/term.ts`
- [ ] Unit tests verify equality, hashing, and serialization

---

## Task 1.3: RdfFactory Service

### Description

Replace the singleton `export const factory = new ImmutableDataFactory()` with a service accessed via `Context.Tag`. This enables:
- Dependency injection for testing
- Configurable blank node generation
- Future extensibility (custom term implementations)

### Subtasks

#### 1.3.1: Define RdfFactory interface

Create `src/RdfFactory.ts`:

```typescript
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as RDFJS from "@rdfjs/types"
import {
  NamedNode,
  BlankNode,
  Literal,
  Variable,
  DefaultGraph,
  Quad,
  Term,
  Direction,
  namedNode,
  blankNode,
  variable,
  defaultGraph
} from "./term"

export interface RdfFactory {
  readonly namedNode: <Iri extends string>(value: Iri) => NamedNode<Iri>
  readonly blankNode: (value?: string) => BlankNode
  readonly literal: (
    value: string,
    languageOrDatatype?: string | NamedNode | RDFJS.DirectionalLanguage
  ) => Literal
  readonly variable: (value: string) => Variable
  readonly defaultGraph: () => DefaultGraph
  readonly quad: (
    subject: RDFJS.Quad_Subject,
    predicate: RDFJS.Quad_Predicate,
    object: RDFJS.Quad_Object,
    graph?: RDFJS.Quad_Graph
  ) => Quad
  readonly fromTerm: (original: RDFJS.Term) => Term
  readonly fromQuad: (original: RDFJS.Quad) => Quad
  readonly fromJs: (value: unknown) => Term
  readonly toJs: (term: Term) => unknown
}
```

#### 1.3.2: Create RdfFactory Tag

```typescript
export const RdfFactory = Context.GenericTag<RdfFactory>("@rdf-utils/RdfFactory")
```

#### 1.3.3: Implement ImmutableRdfFactory

```typescript
const XSD_STRING = namedNode("http://www.w3.org/2001/XMLSchema#string")
const XSD_LANG_STRING = namedNode("http://www.w3.org/2001/XMLSchema#langString")
const XSD_INTEGER = namedNode("http://www.w3.org/2001/XMLSchema#integer")
const XSD_DECIMAL = namedNode("http://www.w3.org/2001/XMLSchema#decimal")
const XSD_BOOLEAN = namedNode("http://www.w3.org/2001/XMLSchema#boolean")
const XSD_DATETIME = namedNode("http://www.w3.org/2001/XMLSchema#dateTime")

const makeImmutableRdfFactory = (): RdfFactory => {
  let bnodeIdx = 0

  const factory: RdfFactory = {
    namedNode: <Iri extends string>(value: Iri) => namedNode(value),

    blankNode: (value?: string) => {
      const id = value ?? `bnode_${bnodeIdx++}`
      return blankNode(id)
    },

    literal: (value, languageOrDatatype) => {
      let language = ""
      let datatype: NamedNode
      let direction: Direction = null

      if (!languageOrDatatype) {
        datatype = XSD_STRING
      } else if (typeof languageOrDatatype === "string") {
        datatype = XSD_LANG_STRING
        language = languageOrDatatype
      } else if ("language" in languageOrDatatype) {
        datatype = XSD_LANG_STRING
        language = languageOrDatatype.language
        direction = languageOrDatatype.direction ?? null
      } else {
        datatype = factory.fromTerm(languageOrDatatype) as NamedNode
      }

      return new Literal({
        termType: "Literal",
        value,
        language,
        direction,
        datatype
      })
    },

    variable: (value) => variable(value),

    defaultGraph: () => defaultGraph(),

    quad: (subject, predicate, object, graph) => {
      const s = factory.fromTerm(subject) as Quad["subject"]
      const p = factory.fromTerm(predicate) as Quad["predicate"]
      const o = factory.fromTerm(object) as Quad["object"]
      const g = graph ? factory.fromTerm(graph) as Quad["graph"] : factory.defaultGraph()

      return new Quad({
        termType: "Quad",
        value: "",
        subject: s,
        predicate: p,
        object: o,
        graph: g
      })
    },

    fromTerm: (original) => {
      switch (original.termType) {
        case "NamedNode":
          return namedNode(original.value)
        case "BlankNode":
          return blankNode(original.value)
        case "Literal":
          return factory.literal(
            original.value,
            original.language || factory.fromTerm(original.datatype) as NamedNode
          )
        case "Variable":
          return variable(original.value)
        case "DefaultGraph":
          return defaultGraph()
        case "Quad":
          return factory.fromQuad(original as RDFJS.Quad)
        default:
          throw new Error(`Unknown term type: ${(original as any).termType}`)
      }
    },

    fromQuad: (original) => {
      const s = original.subject.termType === "Quad"
        ? factory.fromQuad(original.subject as RDFJS.Quad)
        : factory.fromTerm(original.subject)
      const p = factory.fromTerm(original.predicate)
      const o = original.object.termType === "Quad"
        ? factory.fromQuad(original.object as RDFJS.Quad)
        : factory.fromTerm(original.object)
      const g = original.graph
        ? factory.fromTerm(original.graph)
        : factory.defaultGraph()

      return new Quad({
        termType: "Quad",
        value: "",
        subject: s as Quad["subject"],
        predicate: p as Quad["predicate"],
        object: o as Quad["object"],
        graph: g as Quad["graph"]
      })
    },

    fromJs: (value) => {
      if (value instanceof Date) {
        return factory.literal(value.toISOString(), XSD_DATETIME)
      }
      if (typeof value === "object" && value !== null && "termType" in value) {
        return factory.fromTerm(value as RDFJS.Term)
      }
      if (typeof value === "string") {
        return factory.literal(value)
      }
      if (typeof value === "number") {
        return Number.isInteger(value)
          ? factory.literal(value.toString(), XSD_INTEGER)
          : factory.literal(value.toString(), XSD_DECIMAL)
      }
      if (typeof value === "boolean") {
        return factory.literal(value.toString(), XSD_BOOLEAN)
      }
      return factory.literal(String(value))
    },

    toJs: (term) => {
      if (term._tag === "Literal") {
        const lit = term as Literal
        if (lit.datatype.value === XSD_STRING.value) return lit.value
        if (lit.datatype.value === XSD_INTEGER.value) return parseInt(lit.value)
        if (lit.datatype.value === XSD_DECIMAL.value) return parseFloat(lit.value)
        if (lit.datatype.value === XSD_BOOLEAN.value) return lit.value === "true"
        if (lit.datatype.value === XSD_DATETIME.value) return new Date(lit.value)
        return lit.value
      }
      return term
    }
  }

  return factory
}
```

#### 1.3.4: Create Live layer

```typescript
export const RdfFactoryLive: Layer.Layer<RdfFactory> = Layer.succeed(
  RdfFactory,
  makeImmutableRdfFactory()
)
```

#### 1.3.5: Create Test layer with predictable blank nodes

```typescript
export const RdfFactoryTest = (prefix: string = "test"): Layer.Layer<RdfFactory> =>
  Layer.succeed(RdfFactory, {
    ...makeImmutableRdfFactory(),
    blankNode: (() => {
      let idx = 0
      return (value?: string) => blankNode(value ?? `${prefix}_${idx++}`)
    })()
  })
```

#### 1.3.6: Create accessor effect

```typescript
export const rdfFactory: Effect.Effect<RdfFactory, never, RdfFactory> = RdfFactory
```

### Code Examples

**Using the factory service:**
```typescript
import * as Effect from "effect/Effect"
import { RdfFactory, RdfFactoryLive } from "./RdfFactory"

const program = Effect.gen(function* () {
  const factory = yield* RdfFactory

  const subject = factory.namedNode("http://example.org/subject")
  const predicate = factory.namedNode("http://example.org/predicate")
  const object = factory.literal("Hello, World!")

  return factory.quad(subject, predicate, object)
})

// Run with live implementation
Effect.runSync(program.pipe(Effect.provide(RdfFactoryLive)))
```

**Testing with predictable blank nodes:**
```typescript
import { RdfFactoryTest } from "./RdfFactory"

const testProgram = Effect.gen(function* () {
  const factory = yield* RdfFactory
  const b1 = factory.blankNode()
  const b2 = factory.blankNode()

  // With RdfFactoryTest("test"), these will be test_0, test_1
  return [b1.value, b2.value]
})

const result = Effect.runSync(testProgram.pipe(Effect.provide(RdfFactoryTest("test"))))
// ["test_0", "test_1"]
```

### Gates

- [ ] `RdfFactory` interface matches current `ImmutableDataFactory` API
- [ ] `RdfFactoryLive` layer provides production implementation
- [ ] `RdfFactoryTest` layer provides predictable blank node generation
- [ ] All factory methods produce correct term types
- [ ] `fromTerm`/`fromQuad` correctly handle RDF-star nested quads
- [ ] `bunx tsc --noEmit` passes for `src/RdfFactory.ts`
- [ ] Unit tests verify all factory methods

---

## Task 1.4: Namespace Service

### Description

Create a type-safe namespace utility that replaces the current Proxy-based `namespace()` function. The new implementation will:
- Provide strongly typed namespace access
- Support common RDF vocabularies (XSD, RDF, RDFS, OWL, etc.)
- Work with the RdfFactory service

### Subtasks

#### 1.4.1: Define namespace builder

Create `src/Namespace.ts`:

```typescript
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { NamedNode, namedNode } from "./term"

export interface NamespaceBuilder<Base extends string> {
  readonly baseIri: Base
  readonly term: <Local extends string>(local: Local) => NamedNode<`${Base}${Local}`>
}

export const namespace = <Base extends string>(baseIri: Base): NamespaceBuilder<Base> => ({
  baseIri,
  term: <Local extends string>(local: Local) => namedNode(`${baseIri}${local}` as `${Base}${Local}`)
})
```

#### 1.4.2: Define Proxy-based dynamic namespace (backward compatible)

```typescript
export type DynamicNamespace<Base extends string> = {
  readonly [K in string]: NamedNode<`${Base}${K}`>
}

export const dynamicNamespace = <Base extends string>(baseIri: Base): DynamicNamespace<Base> =>
  new Proxy({} as DynamicNamespace<Base>, {
    get(_, property): NamedNode<`${Base}${string}`> | undefined {
      if (typeof property === "string") {
        return namedNode(`${baseIri}${property}`)
      }
      return undefined
    },
    has(_, property): boolean {
      return typeof property === "string"
    },
    ownKeys(): string[] {
      return []
    }
  })
```

#### 1.4.3: Define standard vocabularies

```typescript
// XSD namespace
export const XSD_BASE = "http://www.w3.org/2001/XMLSchema#" as const
export const XSD = dynamicNamespace(XSD_BASE)

// Common XSD terms (for type inference)
export const xsd = {
  string: namedNode(`${XSD_BASE}string`),
  integer: namedNode(`${XSD_BASE}integer`),
  decimal: namedNode(`${XSD_BASE}decimal`),
  boolean: namedNode(`${XSD_BASE}boolean`),
  dateTime: namedNode(`${XSD_BASE}dateTime`),
  date: namedNode(`${XSD_BASE}date`),
  time: namedNode(`${XSD_BASE}time`),
  double: namedNode(`${XSD_BASE}double`),
  float: namedNode(`${XSD_BASE}float`),
  langString: namedNode(`${XSD_BASE}langString`),
  anyURI: namedNode(`${XSD_BASE}anyURI`)
} as const

// RDF namespace
export const RDF_BASE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#" as const
export const RDF = dynamicNamespace(RDF_BASE)

export const rdf = {
  type: namedNode(`${RDF_BASE}type`),
  Property: namedNode(`${RDF_BASE}Property`),
  Statement: namedNode(`${RDF_BASE}Statement`),
  subject: namedNode(`${RDF_BASE}subject`),
  predicate: namedNode(`${RDF_BASE}predicate`),
  object: namedNode(`${RDF_BASE}object`),
  first: namedNode(`${RDF_BASE}first`),
  rest: namedNode(`${RDF_BASE}rest`),
  nil: namedNode(`${RDF_BASE}nil`),
  List: namedNode(`${RDF_BASE}List`)
} as const

// RDFS namespace
export const RDFS_BASE = "http://www.w3.org/2000/01/rdf-schema#" as const
export const RDFS = dynamicNamespace(RDFS_BASE)

export const rdfs = {
  Class: namedNode(`${RDFS_BASE}Class`),
  Resource: namedNode(`${RDFS_BASE}Resource`),
  subClassOf: namedNode(`${RDFS_BASE}subClassOf`),
  subPropertyOf: namedNode(`${RDFS_BASE}subPropertyOf`),
  domain: namedNode(`${RDFS_BASE}domain`),
  range: namedNode(`${RDFS_BASE}range`),
  label: namedNode(`${RDFS_BASE}label`),
  comment: namedNode(`${RDFS_BASE}comment`),
  seeAlso: namedNode(`${RDFS_BASE}seeAlso`),
  isDefinedBy: namedNode(`${RDFS_BASE}isDefinedBy`)
} as const

// OWL namespace
export const OWL_BASE = "http://www.w3.org/2002/07/owl#" as const
export const OWL = dynamicNamespace(OWL_BASE)

export const owl = {
  Class: namedNode(`${OWL_BASE}Class`),
  ObjectProperty: namedNode(`${OWL_BASE}ObjectProperty`),
  DatatypeProperty: namedNode(`${OWL_BASE}DatatypeProperty`),
  AnnotationProperty: namedNode(`${OWL_BASE}AnnotationProperty`),
  Ontology: namedNode(`${OWL_BASE}Ontology`),
  imports: namedNode(`${OWL_BASE}imports`),
  sameAs: namedNode(`${OWL_BASE}sameAs`),
  differentFrom: namedNode(`${OWL_BASE}differentFrom`),
  equivalentClass: namedNode(`${OWL_BASE}equivalentClass`),
  equivalentProperty: namedNode(`${OWL_BASE}equivalentProperty`)
} as const

// DC namespace
export const DC_BASE = "http://purl.org/dc/elements/1.1/" as const
export const DC = dynamicNamespace(DC_BASE)

// DCTERMS namespace
export const DCTERMS_BASE = "http://purl.org/dc/terms/" as const
export const DCTERMS = dynamicNamespace(DCTERMS_BASE)

// FOAF namespace
export const FOAF_BASE = "http://xmlns.com/foaf/0.1/" as const
export const FOAF = dynamicNamespace(FOAF_BASE)

// SKOS namespace
export const SKOS_BASE = "http://www.w3.org/2004/02/skos/core#" as const
export const SKOS = dynamicNamespace(SKOS_BASE)

// VCARD namespace
export const VCARD_BASE = "http://www.w3.org/2006/vcard/ns#" as const
export const VCARD = dynamicNamespace(VCARD_BASE)
```

#### 1.4.4: Define global prefix map

```typescript
export const globalPrefixMap: Record<string, string> = {
  xsd: XSD_BASE,
  rdf: RDF_BASE,
  rdfs: RDFS_BASE,
  owl: OWL_BASE,
  dc: DC_BASE,
  dcterms: DCTERMS_BASE,
  foaf: FOAF_BASE,
  skos: SKOS_BASE,
  vcard: VCARD_BASE
}

// Prefix expansion utility
export const expandPrefix = (
  prefixedName: string,
  prefixes: Record<string, string> = globalPrefixMap
): NamedNode | null => {
  const colonIndex = prefixedName.indexOf(":")
  if (colonIndex === -1) return null

  const prefix = prefixedName.slice(0, colonIndex)
  const local = prefixedName.slice(colonIndex + 1)

  const baseIri = prefixes[prefix]
  if (!baseIri) return null

  return namedNode(`${baseIri}${local}`)
}

// Prefix contraction utility
export const contractIri = (
  iri: string,
  prefixes: Record<string, string> = globalPrefixMap
): string => {
  for (const [prefix, baseIri] of Object.entries(prefixes)) {
    if (iri.startsWith(baseIri)) {
      return `${prefix}:${iri.slice(baseIri.length)}`
    }
  }
  return iri
}
```

#### 1.4.5: Create Namespace service for custom prefixes

```typescript
export interface NamespaceRegistry {
  readonly prefixes: Record<string, string>
  readonly register: (prefix: string, baseIri: string) => NamespaceRegistry
  readonly expand: (prefixedName: string) => NamedNode | null
  readonly contract: (iri: string) => string
  readonly namespace: <Base extends string>(prefix: string, baseIri: Base) => DynamicNamespace<Base>
}

export const NamespaceRegistry = Context.GenericTag<NamespaceRegistry>(
  "@rdf-utils/NamespaceRegistry"
)

const makeNamespaceRegistry = (
  initialPrefixes: Record<string, string> = globalPrefixMap
): NamespaceRegistry => {
  const prefixes = { ...initialPrefixes }

  const registry: NamespaceRegistry = {
    prefixes,
    register: (prefix, baseIri) => {
      return makeNamespaceRegistry({ ...prefixes, [prefix]: baseIri })
    },
    expand: (prefixedName) => expandPrefix(prefixedName, prefixes),
    contract: (iri) => contractIri(iri, prefixes),
    namespace: <Base extends string>(prefix: string, baseIri: Base) => {
      prefixes[prefix] = baseIri
      return dynamicNamespace(baseIri)
    }
  }

  return registry
}

export const NamespaceRegistryLive: Layer.Layer<NamespaceRegistry> = Layer.succeed(
  NamespaceRegistry,
  makeNamespaceRegistry()
)
```

### Code Examples

**Using typed namespaces:**
```typescript
import { xsd, rdf, rdfs } from "./Namespace"

// Type-safe access - IDE completion works
const typeProperty = rdf.type      // NamedNode<"http://www.w3.org/1999/02/22-rdf-syntax-ns#type">
const stringType = xsd.string      // NamedNode<"http://www.w3.org/2001/XMLSchema#string">
const labelProp = rdfs.label       // NamedNode<"http://www.w3.org/2000/01/rdf-schema#label">
```

**Using dynamic namespaces:**
```typescript
import { dynamicNamespace } from "./Namespace"

const EX = dynamicNamespace("http://example.org/")
const subject = EX.subject         // NamedNode<"http://example.org/subject">
const customProp = EX.customProp   // NamedNode<"http://example.org/customProp">
```

**Using the registry service:**
```typescript
import * as Effect from "effect/Effect"
import { NamespaceRegistry, NamespaceRegistryLive } from "./Namespace"

const program = Effect.gen(function* () {
  const registry = yield* NamespaceRegistry

  // Register custom namespace
  const updatedRegistry = registry.register("ex", "http://example.org/")

  // Expand prefixed name
  const expanded = updatedRegistry.expand("ex:resource")
  // NamedNode<"http://example.org/resource">

  // Contract IRI
  const contracted = updatedRegistry.contract("http://www.w3.org/1999/02/22-rdf-syntax-ns#type")
  // "rdf:type"

  return { expanded, contracted }
})

Effect.runSync(program.pipe(Effect.provide(NamespaceRegistryLive)))
```

### Gates

- [ ] `namespace()` and `dynamicNamespace()` produce correctly typed NamedNodes
- [ ] Standard vocabularies (XSD, RDF, RDFS, OWL, etc.) are properly defined
- [ ] `expandPrefix()` correctly expands prefixed names
- [ ] `contractIri()` correctly contracts IRIs to prefixed form
- [ ] `NamespaceRegistry` service supports custom prefix registration
- [ ] `bunx tsc --noEmit` passes for `src/Namespace.ts`
- [ ] Unit tests verify namespace expansion and contraction

---

## Phase Gates

Before proceeding to Phase 2, verify all of the following:

### Compilation Gates
- [ ] `bunx tsc --noEmit` passes with no errors
- [ ] All new modules have correct ESM exports in `src/index.ts`
- [ ] Type inference works correctly in IDE

### Error Module Gates
- [ ] `src/errors.ts` exports all 16 error classes
- [ ] All errors extend `Data.TaggedError`
- [ ] Union types are correctly defined
- [ ] Errors can be constructed and matched with `catchTag`

### Term Module Gates
- [ ] `src/term.ts` exports all term classes
- [ ] All terms extend `Schema.TaggedClass`
- [ ] Terms implement `Equal` and `Hash` protocols
- [ ] Quad supports nested quads (RDF-star)
- [ ] Schema encode/decode roundtrips correctly

### Factory Module Gates
- [ ] `src/RdfFactory.ts` exports `RdfFactory` tag and layers
- [ ] `RdfFactoryLive` provides production implementation
- [ ] `RdfFactoryTest` provides testable implementation
- [ ] All factory methods produce correct terms
- [ ] `fromTerm`/`fromQuad` handle all term types

### Namespace Module Gates
- [ ] `src/Namespace.ts` exports namespace utilities
- [ ] Standard vocabularies are correctly defined
- [ ] Dynamic namespaces work via Proxy
- [ ] `NamespaceRegistry` service is functional
- [ ] Prefix expansion/contraction works correctly

### Test Gates
- [ ] Unit tests exist for error construction
- [ ] Unit tests exist for term equality and hashing
- [ ] Unit tests exist for factory methods
- [ ] Unit tests exist for namespace utilities
- [ ] `bun test` passes

---

## Dependencies

### This Phase Depends On
- Effect library (`effect` package)
- Existing RDF/JS types (`@rdfjs/types` package)

### Phases That Depend On This
- **Phase 2: Graph Layer** - Uses `RdfFactory` service and error types
- **Phase 3: SPARQL Operations** - Uses error types for query failures
- **Phase 4: Platform Integration** - Uses all foundation types

### Migration Strategy

This phase creates new modules alongside existing code:
1. New modules: `errors.ts`, `term.ts`, `RdfFactory.ts`, `Namespace.ts`
2. Existing `rdf.ts` remains unchanged initially
3. Gradual adoption: Import new types where needed
4. Full migration: Replace `rdf.ts` exports with new modules

### File Structure After Phase 1

```
src/
  errors.ts          # NEW - Error ADT
  term.ts            # NEW - RDF term schemas
  RdfFactory.ts      # NEW - Factory service
  Namespace.ts       # NEW - Namespace utilities
  rdf.ts             # UNCHANGED - Legacy (deprecated after Phase 4)
  graph.ts           # UNCHANGED
  graph/
    base.ts          # UNCHANGED
    ...
  index.ts           # MODIFIED - Add new exports
```
