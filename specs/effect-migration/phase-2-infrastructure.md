# Phase 2: Infrastructure Services

## Overview

Phase 2 establishes the foundational infrastructure services for the Effect TS migration. These services replace direct platform API usage (fetch, fs, console) with Effect Platform abstractions, enabling:

- **Testability**: Mock implementations for unit testing
- **Composability**: Layer-based dependency injection
- **Error handling**: Tagged errors with exhaustive pattern matching
- **Platform independence**: Same code runs on Node, Bun, and browser

### Dependencies

- **Depends on**: Phase 1 (Error ADT definitions for `HttpError`, `ParseError`, `SerializationError`, `FileSystemError`)
- **Required by**: Phase 3 (Graph Service Layer), Phase 4 (Repository Implementations)

### Current State Analysis

| Location | Current API | Effect Replacement |
|----------|-------------|-------------------|
| `src/graph/stardog.ts:289` | `fetch()` | `HttpClient.HttpClient` |
| `src/graph/graphdb.ts:212,231,262,275,292,300,330,343,499,511` | `fetch()` | `HttpClient.HttpClient` |
| `src/graph/base.ts:23` | `writeFileSync`, `readFileSync` | `FileSystem.FileSystem` |
| `src/graph/base.ts:46,77,396,519` | `console.error`, `console.warn` | `Console.Console` |
| `src/graph/base.ts:437-536` | N3 Parser, RdfXmlParser, JsonLdParser | `RdfParser` service |
| `src/graph/base.ts:250-333` | N3 Writer, JsonLdSerializer | `RdfSerializer` service |

---

## Task 2.1: HttpClient Service Layer

### Description

Replace all direct `fetch()` calls in Stardog and GraphDB implementations with Effect Platform's `HttpClient`. This provides automatic retry, timeout, error handling, and testability.

### Subtasks

#### 2.1.1: Define HTTP Error Types

Create tagged error types for HTTP operations (assumes Phase 1 provides base error ADT).

```typescript
// src/effect/errors/HttpError.ts
import * as Data from "effect/Data"

export class HttpConnectionError extends Data.TaggedError("HttpConnectionError")<{
  readonly url: string
  readonly cause: unknown
}> {}

export class HttpResponseError extends Data.TaggedError("HttpResponseError")<{
  readonly url: string
  readonly status: number
  readonly statusText: string
  readonly body?: string
}> {}

export class HttpTimeoutError extends Data.TaggedError("HttpTimeoutError")<{
  readonly url: string
  readonly timeout: number
}> {}

export type HttpError = HttpConnectionError | HttpResponseError | HttpTimeoutError
```

#### 2.1.2: Create Authenticated HttpClient Layer

Build a layer that provides an authenticated HTTP client for RDF store connections.

```typescript
// src/effect/services/AuthenticatedHttpClient.ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as HttpClient from "@effect/platform/HttpClient"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"

export interface AuthConfig {
  readonly username: string
  readonly password: string
}

export interface AuthenticatedHttpClient {
  readonly client: HttpClient.HttpClient
  readonly addAuth: (request: HttpClientRequest.HttpClientRequest) => HttpClientRequest.HttpClientRequest
}

export const AuthenticatedHttpClient = Context.GenericTag<AuthenticatedHttpClient>(
  "@rdf-utils/AuthenticatedHttpClient"
)

export const layer = (config: AuthConfig): Layer.Layer<AuthenticatedHttpClient, never, HttpClient.HttpClient> =>
  Layer.effect(
    AuthenticatedHttpClient,
    Effect.gen(function* () {
      const client = yield* HttpClient.HttpClient
      const credentials = Buffer.from(`${config.username}:${config.password}`).toString("base64")

      return {
        client,
        addAuth: (request) =>
          HttpClientRequest.setHeader(request, "Authorization", `Basic ${credentials}`)
      }
    })
  )
```

#### 2.1.3: Refactor Stardog HTTP Calls

Replace `fetch()` in `StardogGraph.beginTransaction()` and related methods.

```typescript
// Before (src/graph/stardog.ts:289-302)
const response = await fetch(fullUrl, {
  method: 'POST',
  headers: {
    'Authorization': `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`,
    'Content-Type': 'application/x-www-form-urlencoded',
  },
});

// After - Effect pattern
import * as Effect from "effect/Effect"
import * as HttpClient from "@effect/platform/HttpClient"
import * as HttpClientRequest from "@effect/platform/HttpClientRequest"
import * as HttpClientResponse from "@effect/platform/HttpClientResponse"

const beginTransaction = (
  endpoint: string,
  database: string,
  reasoning: boolean
): Effect.Effect<string, HttpError, AuthenticatedHttpClient> =>
  Effect.gen(function* () {
    const { client, addAuth } = yield* AuthenticatedHttpClient

    const params = new URLSearchParams()
    if (reasoning) params.append("reasoning", "true")

    const url = `${endpoint}/${database}/transaction/begin`
    const fullUrl = params.toString() ? `${url}?${params.toString()}` : url

    const request = HttpClientRequest.post(fullUrl).pipe(
      addAuth,
      HttpClientRequest.setHeader("Content-Type", "application/x-www-form-urlencoded")
    )

    const response = yield* client.execute(request).pipe(
      Effect.mapError((e) => new HttpConnectionError({ url: fullUrl, cause: e }))
    )

    if (response.status >= 400) {
      return yield* Effect.fail(new HttpResponseError({
        url: fullUrl,
        status: response.status,
        statusText: response.statusText
      }))
    }

    const text = yield* HttpClientResponse.text(response)
    return text.trim()
  })
```

#### 2.1.4: Refactor GraphDB HTTP Calls

Replace all `fetch()` calls in `GraphDBGraph` with Effect HttpClient patterns.

```typescript
// Pattern for GraphDB query execution
const executeQuery = (
  queryString: string,
  contentType: string,
  useReasoning: boolean
): Effect.Effect<unknown, HttpError, AuthenticatedHttpClient> =>
  Effect.gen(function* () {
    const { client, addAuth } = yield* AuthenticatedHttpClient

    const url = buildQueryUrl(queryString, useReasoning)

    const request = HttpClientRequest.get(url).pipe(
      addAuth,
      HttpClientRequest.setHeader("Accept", contentType)
    )

    const response = yield* client.execute(request).pipe(
      Effect.mapError((e) => new HttpConnectionError({ url, cause: e }))
    )

    if (!response.ok) {
      return yield* Effect.fail(new HttpResponseError({
        url,
        status: response.status,
        statusText: response.statusText
      }))
    }

    // Return text for N-Triples/TriG, JSON for SPARQL results
    if (contentType === "application/n-triples" || contentType === "application/x-trigstar") {
      return yield* HttpClientResponse.text(response)
    }

    return yield* HttpClientResponse.json(response)
  })
```

### Code Examples

**Layer composition for Stardog:**

```typescript
import * as Layer from "effect/Layer"
import { FetchHttpClient } from "@effect/platform"

const StardogHttpLive = AuthenticatedHttpClient.layer({
  username: "admin",
  password: "admin"
}).pipe(
  Layer.provide(FetchHttpClient.layer)
)
```

**Testing with mock HttpClient:**

```typescript
import * as Layer from "effect/Layer"
import * as HttpClient from "@effect/platform/HttpClient"

const MockHttpClient = Layer.succeed(
  HttpClient.HttpClient,
  HttpClient.make((request) =>
    Effect.succeed({
      status: 200,
      statusText: "OK",
      headers: {},
      text: () => Effect.succeed("tx-12345"),
      json: () => Effect.succeed({ results: { bindings: [] } })
    })
  )
)
```

### Gates

- [ ] All `fetch()` calls in `stardog.ts` replaced with `HttpClient`
- [ ] All `fetch()` calls in `graphdb.ts` replaced with `HttpClient`
- [ ] `AuthenticatedHttpClient` layer implemented with Basic auth
- [ ] Error mapping from platform errors to domain `HttpError` types
- [ ] Unit tests with mock `HttpClient` layer

---

## Task 2.2: FileSystem Service Layer

### Description

Replace direct `fs` module usage (`readFileSync`, `writeFileSync`) with Effect Platform's `FileSystem` service for reading and writing RDF files.

### Subtasks

#### 2.2.1: Define FileSystem Error Types

```typescript
// src/effect/errors/FileSystemError.ts
import * as Data from "effect/Data"

export class FileNotFoundError extends Data.TaggedError("FileNotFoundError")<{
  readonly path: string
}> {}

export class FileReadError extends Data.TaggedError("FileReadError")<{
  readonly path: string
  readonly cause: unknown
}> {}

export class FileWriteError extends Data.TaggedError("FileWriteError")<{
  readonly path: string
  readonly cause: unknown
}> {}

export type FileSystemError = FileNotFoundError | FileReadError | FileWriteError
```

#### 2.2.2: Create RdfFileSystem Service

Wrap Effect Platform FileSystem with RDF-specific operations.

```typescript
// src/effect/services/RdfFileSystem.ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as FileSystem from "@effect/platform/FileSystem"
import * as Path from "@effect/platform/Path"

export interface RdfFileSystem {
  readonly readFile: (path: string) => Effect.Effect<string, FileSystemError>
  readonly writeFile: (path: string, content: string) => Effect.Effect<void, FileSystemError>
  readonly detectFormat: (path: string) => Effect.Effect<string | undefined>
}

export const RdfFileSystem = Context.GenericTag<RdfFileSystem>("@rdf-utils/RdfFileSystem")

export const layer: Layer.Layer<RdfFileSystem, never, FileSystem.FileSystem | Path.Path> =
  Layer.effect(
    RdfFileSystem,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      return {
        readFile: (filePath) =>
          fs.readFileString(filePath).pipe(
            Effect.mapError((e) => {
              if (e._tag === "SystemError" && e.reason === "NotFound") {
                return new FileNotFoundError({ path: filePath })
              }
              return new FileReadError({ path: filePath, cause: e })
            })
          ),

        writeFile: (filePath, content) =>
          fs.writeFileString(filePath, content).pipe(
            Effect.mapError((e) => new FileWriteError({ path: filePath, cause: e }))
          ),

        detectFormat: (filePath) =>
          Effect.sync(() => {
            const ext = path.extname(filePath).toLowerCase().slice(1)
            const formatMap: Record<string, string> = {
              ttl: "text/turtle",
              rdf: "application/rdf+xml",
              xml: "application/rdf+xml",
              n3: "text/n3",
              nq: "application/n-quads",
              trig: "application/trig",
              jsonld: "application/ld+json"
            }
            return formatMap[ext]
          })
      }
    })
  )
```

#### 2.2.3: Refactor File Operations in base.ts

Replace `saveQuadsToFile` and `parseQuadsFromFile` with Effect versions.

```typescript
// Before (src/graph/base.ts:335-338)
export async function saveQuadsToFile(quads: Iterable<Quad>, path: string, options?: { format?: string, prefixes?: any, baseIRI?: string }): Promise<void> {
  const content = await serializeQuads(quads, options);
  writeFileSync(path, content, 'utf8');
}

// After - Effect pattern
import * as Effect from "effect/Effect"

export const saveQuadsToFile = (
  quads: Iterable<Quad>,
  path: string,
  options?: SerializeOptions
): Effect.Effect<void, FileSystemError | SerializationError, RdfFileSystem | RdfSerializer> =>
  Effect.gen(function* () {
    const fs = yield* RdfFileSystem
    const serializer = yield* RdfSerializer

    const content = yield* serializer.serialize(quads, options)
    yield* fs.writeFile(path, content)
  })
```

### Code Examples

**Platform-specific layer composition:**

```typescript
import { BunContext } from "@effect/platform-bun"
import { NodeContext } from "@effect/platform-node"

// Bun runtime
const RdfFileSystemBun = RdfFileSystem.layer.pipe(
  Layer.provide(BunContext.layer)
)

// Node runtime
const RdfFileSystemNode = RdfFileSystem.layer.pipe(
  Layer.provide(NodeContext.layer)
)
```

### Gates

- [ ] `RdfFileSystem` service defined with read/write/detectFormat operations
- [ ] All `readFileSync` calls replaced with `RdfFileSystem.readFile`
- [ ] All `writeFileSync` calls replaced with `RdfFileSystem.writeFile`
- [ ] Error mapping to domain `FileSystemError` types
- [ ] Platform-agnostic layer composition

---

## Task 2.3: Console Service Layer

### Description

Replace direct `console.log`, `console.warn`, `console.error` calls with Effect's `Console` service for structured logging.

### Subtasks

#### 2.3.1: Identify Console Usage Points

Current console usage in codebase:

| File | Line | Usage | Replacement |
|------|------|-------|-------------|
| `base.ts` | 46 | `console.error("Error parsing query:", query)` | `Console.error` |
| `base.ts` | 77 | `console.error("Error parsing update:", update)` | `Console.error` |
| `stardog.ts` | 396-397 | `console.log(result.body)` | `Console.log` |
| `stardog.ts` | 519 | `console.warn` | `Console.warn` |
| `graphdb.ts` | 628 | `console.warn` | `Console.warn` |

#### 2.3.2: Replace Console Calls with Effect Console

```typescript
// Before (src/graph/base.ts:46-47)
} catch (err) {
  console.error("Error parsing query:", query);
  throw err;
}

// After - Effect pattern
import * as Effect from "effect/Effect"
import * as Console from "effect/Console"

const prepareQuery = (query: Query | string, expectedType: string) =>
  Effect.gen(function* () {
    const parsedQuery = yield* Effect.try({
      try: () => typeof query === "string"
        ? new Parser({ prefixes: globalPrefixMap, sparqlStar: true }).parse(query)
        : query,
      catch: (err) => err
    }).pipe(
      Effect.tapError((err) =>
        Console.error("Error parsing query:", query)
      ),
      Effect.mapError((err) => new QueryParseError({ query: String(query), cause: err }))
    )

    // ... rest of query preparation
  })
```

#### 2.3.3: Structured Logging Pattern

For production use, integrate with Effect's structured logging:

```typescript
import * as Effect from "effect/Effect"
import * as Logger from "effect/Logger"

// Add query context to logs
const executeQuery = (queryString: string) =>
  Effect.gen(function* () {
    yield* Effect.logDebug("Executing query").pipe(
      Effect.annotateLogs({
        query: queryString.slice(0, 100),
        queryType: "SELECT"
      })
    )

    // ... execute query

    yield* Effect.logInfo("Query completed").pipe(
      Effect.annotateLogs({
        resultCount: results.length
      })
    )
  })
```

### Gates

- [ ] All `console.error` calls replaced with `Console.error` or `Effect.logError`
- [ ] All `console.warn` calls replaced with `Console.warn` or `Effect.logWarning`
- [ ] All `console.log` calls replaced with `Console.log` or `Effect.logDebug`
- [ ] Structured logging with annotations for query context
- [ ] No direct `console.*` usage in Effect-migrated code

---

## Task 2.4: RdfParser Service

### Description

Create a unified `RdfParser` service that wraps N3, RdfXmlParser, and JsonLdParser, providing a single interface for parsing all supported RDF formats.

### Subtasks

#### 2.4.1: Define Parser Error Types

```typescript
// src/effect/errors/ParseError.ts
import * as Data from "effect/Data"

export class ParseError extends Data.TaggedError("ParseError")<{
  readonly format: string
  readonly input: string
  readonly cause: unknown
}> {}

export class UnsupportedFormatError extends Data.TaggedError("UnsupportedFormatError")<{
  readonly format: string
  readonly supportedFormats: readonly string[]
}> {}
```

#### 2.4.2: Define RdfParser Service Interface

```typescript
// src/effect/services/RdfParser.ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import type * as rdfjs from "@rdfjs/types"

export type RdfFormat =
  | "text/turtle"
  | "text/turtle*"
  | "application/n-triples"
  | "application/n-quads"
  | "application/trig"
  | "application/trig*"
  | "application/rdf+xml"
  | "application/ld+json"
  | "text/n3"

export interface ParseOptions {
  readonly format?: RdfFormat
  readonly baseIRI?: string
}

export interface RdfParser {
  readonly parse: (
    data: string,
    options?: ParseOptions
  ) => Effect.Effect<readonly rdfjs.Quad[], ParseError | UnsupportedFormatError>

  readonly detectFormat: (
    data: string,
    filePath?: string
  ) => Effect.Effect<RdfFormat | undefined>
}

export const RdfParser = Context.GenericTag<RdfParser>("@rdf-utils/RdfParser")
```

#### 2.4.3: Implement N3 Parser Wrapper

```typescript
// src/effect/services/RdfParser/n3.ts
import * as Effect from "effect/Effect"
import * as n3 from "n3"
import { factory } from "../../rdf"

export const parseWithN3 = (
  data: string,
  format: string | undefined,
  baseIRI: string | undefined
): Effect.Effect<readonly rdfjs.Quad[], ParseError> =>
  Effect.try({
    try: () => {
      const parser = new n3.Parser({ format, baseIRI, factory })
      return parser.parse(data)
    },
    catch: (cause) => new ParseError({
      format: format ?? "unknown",
      input: data.slice(0, 200),
      cause
    })
  })
```

#### 2.4.4: Implement RDF/XML Parser Wrapper

```typescript
// src/effect/services/RdfParser/rdfxml.ts
import * as Effect from "effect/Effect"
import { RdfXmlParser } from "rdfxml-streaming-parser"
import { factory } from "../../rdf"

export const parseRdfXml = (
  data: string,
  baseIRI: string | undefined
): Effect.Effect<readonly rdfjs.Quad[], ParseError> =>
  Effect.async<readonly rdfjs.Quad[], ParseError>((resume) => {
    const quads: rdfjs.Quad[] = []
    const parser = new RdfXmlParser({ baseIRI, dataFactory: factory })

    parser.on("data", (quad: rdfjs.Quad) => {
      quads.push(quad)
    })

    parser.on("end", () => {
      resume(Effect.succeed(quads))
    })

    parser.on("error", (error: Error) => {
      resume(Effect.fail(new ParseError({
        format: "application/rdf+xml",
        input: data.slice(0, 200),
        cause: error
      })))
    })

    parser.write(data)
    parser.end()
  })
```

#### 2.4.5: Implement JSON-LD Parser Wrapper

```typescript
// src/effect/services/RdfParser/jsonld.ts
import * as Effect from "effect/Effect"
import { JsonLdParser } from "jsonld-streaming-parser"
import { factory } from "../../rdf"

export const parseJsonLd = (
  data: string,
  baseIRI: string | undefined
): Effect.Effect<readonly rdfjs.Quad[], ParseError> =>
  Effect.async<readonly rdfjs.Quad[], ParseError>((resume) => {
    const quads: rdfjs.Quad[] = []
    const parser = new JsonLdParser({ dataFactory: factory })

    parser.on("data", (quad: rdfjs.Quad) => {
      quads.push(quad)
    })

    parser.on("end", () => {
      resume(Effect.succeed(quads))
    })

    parser.on("error", (error: Error) => {
      resume(Effect.fail(new ParseError({
        format: "application/ld+json",
        input: data.slice(0, 200),
        cause: error
      })))
    })

    parser.write(Buffer.from(data, "utf8"))
    parser.end()
  })
```

#### 2.4.6: Implement RdfParser Layer

```typescript
// src/effect/services/RdfParser/index.ts
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import { RdfParser, RdfFormat, ParseOptions } from "./types"
import { parseWithN3 } from "./n3"
import { parseRdfXml } from "./rdfxml"
import { parseJsonLd } from "./jsonld"
import { detectFormat } from "./detect"

const SUPPORTED_FORMATS: readonly RdfFormat[] = [
  "text/turtle",
  "text/turtle*",
  "application/n-triples",
  "application/n-quads",
  "application/trig",
  "application/trig*",
  "application/rdf+xml",
  "application/ld+json",
  "text/n3"
]

export const layer: Layer.Layer<RdfParser> = Layer.succeed(
  RdfParser,
  RdfParser.of({
    parse: (data, options) =>
      Effect.gen(function* () {
        const format = options?.format ?? (yield* detectFormat(data))

        if (!format) {
          // Default to Turtle for unknown formats
          return yield* parseWithN3(data, undefined, options?.baseIRI)
        }

        return yield* Match.value(format).pipe(
          Match.when("application/rdf+xml", () =>
            parseRdfXml(data, options?.baseIRI)
          ),
          Match.when("application/ld+json", () =>
            parseJsonLd(data, options?.baseIRI)
          ),
          Match.orElse(() =>
            parseWithN3(data, format, options?.baseIRI)
          )
        )
      }),

    detectFormat: (data, filePath) => detectFormat(data, filePath)
  })
)
```

### Code Examples

**Usage pattern:**

```typescript
import * as Effect from "effect/Effect"
import { RdfParser } from "./services/RdfParser"

const loadGraph = (data: string) =>
  Effect.gen(function* () {
    const parser = yield* RdfParser
    const quads = yield* parser.parse(data, { format: "text/turtle" })
    return quads
  })

// With layer
const program = loadGraph(turtleData).pipe(
  Effect.provide(RdfParser.layer)
)
```

### Gates

- [ ] `RdfParser` service interface defined
- [ ] N3 parser wrapped with Effect error handling
- [ ] RDF/XML parser wrapped with Effect.async for streaming
- [ ] JSON-LD parser wrapped with Effect.async for streaming
- [ ] Format auto-detection from content and file extension
- [ ] All supported formats: Turtle, N-Triples, N-Quads, TriG, RDF/XML, JSON-LD
- [ ] RDF-star formats (Turtle*, TriG*) supported via N3

---

## Task 2.5: RdfSerializer Service

### Description

Create a unified `RdfSerializer` service that wraps N3 Writer and JsonLdSerializer, providing a single interface for serializing RDF to all supported formats.

### Subtasks

#### 2.5.1: Define Serialization Error Types

```typescript
// src/effect/errors/SerializationError.ts
import * as Data from "effect/Data"

export class SerializationError extends Data.TaggedError("SerializationError")<{
  readonly format: string
  readonly quadCount: number
  readonly cause: unknown
}> {}
```

#### 2.5.2: Define RdfSerializer Service Interface

```typescript
// src/effect/services/RdfSerializer.ts
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import type * as rdfjs from "@rdfjs/types"

export interface SerializeOptions {
  readonly format?: string
  readonly prefixes?: Record<string, string>
  readonly baseIRI?: string
}

export interface RdfSerializer {
  readonly serialize: (
    quads: Iterable<rdfjs.Quad>,
    options?: SerializeOptions
  ) => Effect.Effect<string, SerializationError>
}

export const RdfSerializer = Context.GenericTag<RdfSerializer>("@rdf-utils/RdfSerializer")
```

#### 2.5.3: Implement N3 Serializer Wrapper

```typescript
// src/effect/services/RdfSerializer/n3.ts
import * as Effect from "effect/Effect"
import * as n3 from "n3"
import { globalPrefixMap } from "../../rdf"

const containsTripleTerms = (quads: rdfjs.Quad[]): boolean =>
  quads.some((q) => q.subject.termType === "Quad" || q.object.termType === "Quad")

const toStarFormat = (format: string | undefined): string | undefined => {
  if (!format) return undefined
  const formatMap: Record<string, string> = {
    "text/turtle": "text/turtle*",
    "turtle": "turtle*",
    "application/trig": "application/trig*",
    "trig": "trig*",
    "application/n-triples": "application/n-triples*",
    "n-triples": "n-triples*",
    "application/n-quads": "application/n-quads*",
    "n-quads": "n-quads*"
  }
  return formatMap[format.toLowerCase()] || format
}

export const serializeWithN3 = (
  quads: rdfjs.Quad[],
  options?: SerializeOptions
): Effect.Effect<string, SerializationError> =>
  Effect.async<string, SerializationError>((resume) => {
    let format = options?.format
    const prefixes = { ...globalPrefixMap, ...options?.prefixes }

    if (options?.baseIRI) {
      prefixes[""] = options.baseIRI
    }

    // Auto-detect RDF-star format
    if (containsTripleTerms(quads)) {
      format = toStarFormat(format)
    }

    // Sort quads for consistent output
    const sortedQuads = [...quads].sort((a, b) => {
      if (a.graph.value !== b.graph.value) return a.graph.value.localeCompare(b.graph.value)
      if (a.subject.value !== b.subject.value) return a.subject.value.localeCompare(b.subject.value)
      if (a.predicate.value !== b.predicate.value) return a.predicate.value.localeCompare(b.predicate.value)
      return 0
    })

    const writer = new n3.Writer({ format, prefixes })

    for (const quad of sortedQuads) {
      writer.addQuad(quad)
    }

    writer.end((error, result) => {
      if (error) {
        resume(Effect.fail(new SerializationError({
          format: format ?? "unknown",
          quadCount: quads.length,
          cause: error
        })))
      } else {
        resume(Effect.succeed(result))
      }
    })
  })
```

#### 2.5.4: Implement JSON-LD Serializer Wrapper

```typescript
// src/effect/services/RdfSerializer/jsonld.ts
import * as Effect from "effect/Effect"
import { JsonLdSerializer } from "jsonld-streaming-serializer"

export const serializeToJsonLd = (
  quads: rdfjs.Quad[],
  prefixes: Record<string, string>,
  baseIRI?: string
): Effect.Effect<string, SerializationError> =>
  Effect.async<string, SerializationError>((resume) => {
    const chunks: string[] = []

    // Build context from prefixes
    const context: Record<string, string> = {}
    for (const [prefix, iri] of Object.entries(prefixes)) {
      if (typeof iri === "string" && prefix !== "") {
        context[prefix] = iri
      }
    }

    const serializer = new JsonLdSerializer({
      baseIRI,
      context,
      space: "  "
    })

    serializer.on("data", (chunk: Buffer) => {
      chunks.push(chunk.toString("utf8"))
    })

    serializer.on("end", () => {
      resume(Effect.succeed(chunks.join("")))
    })

    serializer.on("error", (error: Error) => {
      resume(Effect.fail(new SerializationError({
        format: "application/ld+json",
        quadCount: quads.length,
        cause: error
      })))
    })

    for (const quad of quads) {
      serializer.write(quad)
    }
    serializer.end()
  })
```

#### 2.5.5: Implement RdfSerializer Layer

```typescript
// src/effect/services/RdfSerializer/index.ts
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Match from "effect/Match"
import { RdfSerializer, SerializeOptions } from "./types"
import { serializeWithN3 } from "./n3"
import { serializeToJsonLd } from "./jsonld"
import { globalPrefixMap } from "../../rdf"

export const layer: Layer.Layer<RdfSerializer> = Layer.succeed(
  RdfSerializer,
  RdfSerializer.of({
    serialize: (quads, options) => {
      const quadArray = [...quads]
      const prefixes = { ...globalPrefixMap, ...options?.prefixes }

      return Match.value(options?.format).pipe(
        Match.when("application/ld+json", () =>
          serializeToJsonLd(quadArray, prefixes, options?.baseIRI)
        ),
        Match.when("json-ld", () =>
          serializeToJsonLd(quadArray, prefixes, options?.baseIRI)
        ),
        Match.orElse(() =>
          serializeWithN3(quadArray, options)
        )
      )
    }
  })
)
```

### Gates

- [ ] `RdfSerializer` service interface defined
- [ ] N3 Writer wrapped with Effect.async
- [ ] JSON-LD Serializer wrapped with Effect.async
- [ ] Auto-detection of RDF-star format when quads contain triple terms
- [ ] Prefix handling and baseIRI support
- [ ] Sorted output for deterministic serialization
- [ ] All supported formats: Turtle, N-Triples, N-Quads, TriG, JSON-LD

---

## Task 2.6: Infrastructure Layer Composition

### Description

Compose all infrastructure services into a unified `InfrastructureLive` layer that can be provided to the application.

### Subtasks

#### 2.6.1: Create Infrastructure Module

```typescript
// src/effect/infrastructure/index.ts
import * as Layer from "effect/Layer"
import { FetchHttpClient } from "@effect/platform"
import { BunContext } from "@effect/platform-bun"
import { NodeContext } from "@effect/platform-node"

import { RdfParser } from "../services/RdfParser"
import { RdfSerializer } from "../services/RdfSerializer"
import { RdfFileSystem } from "../services/RdfFileSystem"
import { AuthenticatedHttpClient, AuthConfig } from "../services/AuthenticatedHttpClient"

// Parser and Serializer (no platform dependencies)
export const RdfServicesLive = Layer.merge(
  RdfParser.layer,
  RdfSerializer.layer
)

// FileSystem (requires platform context)
export const FileSystemLive = RdfFileSystem.layer

// HTTP Client (requires HttpClient and auth config)
export const makeHttpClientLive = (config: AuthConfig) =>
  AuthenticatedHttpClient.layer(config).pipe(
    Layer.provide(FetchHttpClient.layer)
  )

// Complete infrastructure for Bun runtime
export const makeBunInfrastructure = (authConfig?: AuthConfig) =>
  Layer.mergeAll(
    RdfServicesLive,
    FileSystemLive,
    authConfig ? makeHttpClientLive(authConfig) : Layer.empty
  ).pipe(
    Layer.provide(BunContext.layer)
  )

// Complete infrastructure for Node runtime
export const makeNodeInfrastructure = (authConfig?: AuthConfig) =>
  Layer.mergeAll(
    RdfServicesLive,
    FileSystemLive,
    authConfig ? makeHttpClientLive(authConfig) : Layer.empty
  ).pipe(
    Layer.provide(NodeContext.layer)
  )
```

#### 2.6.2: Export Public API

```typescript
// src/effect/index.ts
// Services
export { RdfParser, type ParseOptions, type RdfFormat } from "./services/RdfParser"
export { RdfSerializer, type SerializeOptions } from "./services/RdfSerializer"
export { RdfFileSystem } from "./services/RdfFileSystem"
export { AuthenticatedHttpClient, type AuthConfig } from "./services/AuthenticatedHttpClient"

// Errors
export { ParseError, UnsupportedFormatError } from "./errors/ParseError"
export { SerializationError } from "./errors/SerializationError"
export { FileNotFoundError, FileReadError, FileWriteError, type FileSystemError } from "./errors/FileSystemError"
export { HttpConnectionError, HttpResponseError, HttpTimeoutError, type HttpError } from "./errors/HttpError"

// Infrastructure Layers
export {
  RdfServicesLive,
  FileSystemLive,
  makeHttpClientLive,
  makeBunInfrastructure,
  makeNodeInfrastructure
} from "./infrastructure"
```

### Code Examples

**Application entry point:**

```typescript
// example/main.ts
import * as Effect from "effect/Effect"
import { BunRuntime } from "@effect/platform-bun"
import { makeBunInfrastructure } from "@phosphorco/rdf-utils/effect"
import { RdfParser, RdfSerializer, RdfFileSystem } from "@phosphorco/rdf-utils/effect"

const program = Effect.gen(function* () {
  const fs = yield* RdfFileSystem
  const parser = yield* RdfParser
  const serializer = yield* RdfSerializer

  // Read, parse, transform, serialize, write
  const content = yield* fs.readFile("input.ttl")
  const quads = yield* parser.parse(content, { format: "text/turtle" })

  // Transform quads...

  const output = yield* serializer.serialize(quads, { format: "application/ld+json" })
  yield* fs.writeFile("output.jsonld", output)
})

const InfrastructureLive = makeBunInfrastructure()

program.pipe(
  Effect.provide(InfrastructureLive),
  BunRuntime.runMain
)
```

### Gates

- [ ] `RdfServicesLive` layer combines parser and serializer
- [ ] `FileSystemLive` layer wraps platform FileSystem
- [ ] `makeHttpClientLive` factory for authenticated HTTP
- [ ] `makeBunInfrastructure` for Bun runtime
- [ ] `makeNodeInfrastructure` for Node runtime
- [ ] Public API exports all services, errors, and layers

---

## Phase Gates

### Functional Requirements

- [ ] HttpClient abstraction handles Basic auth, POST/GET/PUT/DELETE
- [ ] HttpClient abstraction propagates errors as tagged types
- [ ] FileSystem abstraction handles read/write string operations
- [ ] FileSystem abstraction detects format from file extension
- [ ] Console abstraction replaces all `console.*` calls
- [ ] RdfParser supports Turtle, N-Triples, N-Quads, TriG, RDF/XML, JSON-LD
- [ ] RdfParser supports RDF-star formats (Turtle*, TriG*)
- [ ] RdfSerializer supports Turtle, N-Triples, N-Quads, TriG, JSON-LD
- [ ] RdfSerializer auto-detects when RDF-star format is needed

### Technical Requirements

- [ ] `bunx tsc --noEmit` passes with no errors
- [ ] All unit tests pass: `bun test test/`
- [ ] No direct `fetch()` calls in Effect-migrated code
- [ ] No direct `fs` module imports in Effect-migrated code
- [ ] No direct `console.*` calls in Effect-migrated code
- [ ] All errors are tagged using `Data.TaggedError`
- [ ] All services use `Requirements = never` pattern

### Documentation

- [ ] JSDoc comments on all public service interfaces
- [ ] Layer composition examples in code comments
- [ ] Error handling patterns documented

---

## Dependencies

### Phase 1 Dependencies (Required)

This phase assumes Phase 1 has defined the following error base types:

```typescript
// Expected from Phase 1
export class RdfError extends Data.TaggedError("RdfError")<{
  readonly message: string
  readonly cause?: unknown
}> {}
```

### External Package Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `effect` | `^3.x` | Core Effect runtime |
| `@effect/platform` | `^0.x` | Platform abstractions |
| `@effect/platform-bun` | `^0.x` | Bun runtime layer |
| `@effect/platform-node` | `^0.x` | Node runtime layer |
| `n3` | `^1.26.0` | Turtle/N-Quads parsing (existing) |
| `rdfxml-streaming-parser` | `^3.1.0` | RDF/XML parsing (existing) |
| `jsonld-streaming-parser` | `^5.0.0` | JSON-LD parsing (existing) |
| `jsonld-streaming-serializer` | `^4.0.0` | JSON-LD serialization (existing) |

### Package.json Updates

```json
{
  "dependencies": {
    "effect": "^3.14.0",
    "@effect/platform": "^0.77.0"
  },
  "devDependencies": {
    "@effect/platform-bun": "^0.55.0",
    "@effect/platform-node": "^0.72.0"
  }
}
```

---

## File Structure

After Phase 2 completion:

```
src/
  effect/
    errors/
      HttpError.ts
      FileSystemError.ts
      ParseError.ts
      SerializationError.ts
      index.ts
    services/
      AuthenticatedHttpClient.ts
      RdfFileSystem.ts
      RdfParser/
        index.ts
        types.ts
        n3.ts
        rdfxml.ts
        jsonld.ts
        detect.ts
      RdfSerializer/
        index.ts
        types.ts
        n3.ts
        jsonld.ts
    infrastructure/
      index.ts
    index.ts
  graph/
    base.ts          # Modified: imports Effect services
    stardog.ts       # Modified: uses HttpClient
    graphdb.ts       # Modified: uses HttpClient
    n3.ts
    ...
```
