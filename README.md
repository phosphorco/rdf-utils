# @phosphorco/rdf-utils

A TypeScript library for RDF utilities and resource management with support for multiple graph implementations and SPARQL querying.

## Installation

```bash
bun add @phosphorco/rdf-utils
```

## Features

### RDF Data Factory
Create immutable RDF terms, quads, and literals with built-in value objects.

```typescript
import { factory, namespace, XSD } from '@phosphorco/rdf-utils';

// Create namespaces
const EX = namespace('http://example.org/');
const FOAF = namespace('http://xmlns.com/foaf/0.1/');

// Create RDF terms using namespaces
const subject = EX.person1;
const predicate = EX.name;
const object = factory.literal('Alice');

// Create a quad
const quad = factory.quad(subject, predicate, object);

// Use common namespaces
const name = FOAF.name;

// Type-safe literals
const age = factory.fromJs(25); // Creates xsd:integer
const isActive = factory.fromJs(true); // Creates xsd:boolean
```

### Graph Implementations
Work with different graph backends seamlessly.

#### N3 In-Memory Graph
```typescript
import { N3Graph, factory, namespace } from '@phosphorco/rdf-utils';

const EX = namespace('http://example.org/');
const graph = new N3Graph();

// Add triples
graph.add([
  factory.quad(
    EX.alice,
    EX.name,
    factory.literal('Alice')
  )
]);

// Query the graph
const quads = graph.find(EX.alice, null, null);

// SPARQL queries
const results = await graph.select(`
  SELECT ?name WHERE {
    ?person <http://example.org/name> ?name
  }
`);
```

#### Stardog Graph Database
```typescript
import { StardogGraph, factory, namespace } from '@phosphorco/rdf-utils';

const EX = namespace('http://example.org/');
const config = {
  endpoint: 'http://localhost:5820',
  username: 'admin',
  password: 'admin',
  database: 'mydb'
};

const graph = new StardogGraph(config, EX.graph);

// Add data with transactions
await graph.begin();
await graph.add([quad]);
await graph.commit();

// Query with reasoning
const reasoningGraph = new StardogGraph(config, EX.graph, true);
```

#### Immutable Graph
```typescript
import { ImmutableSetGraph, factory, namespace } from '@phosphorco/rdf-utils';

const EX = namespace('http://example.org/');
const graph = new ImmutableSetGraph();

// Immutable operations return new instances
const newGraph = graph.add([quad]);
const filtered = newGraph.remove([quad]);

// Efficient set-based operations
const combined = graph1.data.union(graph2.data);
```

### SPARQL Support
Execute SPARQL queries across all graph implementations.

```typescript
// SELECT queries
const selectResults = await graph.select(`
  SELECT ?subject ?predicate ?object WHERE {
    ?subject ?predicate ?object
  }
`);

// ASK queries
const exists = await graph.ask(`
  ASK { ?s <http://example.org/name> "Alice" }
`);

// CONSTRUCT queries
const constructedGraph = await graph.construct(`
  CONSTRUCT { ?s <http://example.org/hasName> ?name }
  WHERE { ?s <http://example.org/name> ?name }
`);
```

### Serialization & Parsing
Import and export RDF data in various formats.

```typescript
import { N3Graph } from '@phosphorco/rdf-utils';

// Load from file
const graph = await N3Graph.fromFile('data.ttl', 'turtle');

// Load from string
const graph2 = await N3Graph.fromString(`
  @prefix ex: <http://example.org/> .
  ex:alice ex:name "Alice" .
`, 'turtle');

// Export to different formats
const turtle = graph.toString('turtle');
const ntriples = graph.toString('n-triples');
const jsonld = graph.toString('json-ld');

// Save to file
await graph.saveToFile('output.ttl', 'turtle');
```

### Fluent Node API
The Resource API provides a fluent, Map-like interface for working with 
RDF nodes, making triple manipulation as easy as working with JavaScript objects.

```typescript
import { ChangeSetGraph, Resource, factory, namespace } from '@phosphorco/rdf-utils';

const EX = namespace('http://example.org/');
const FOAF = namespace('http://xmlns.com/foaf/0.1/');

// Create a changeset graph with transactions
const changeset = new ChangeSetGraph(new ImmutableSetGraph());
const person = new Resource(changeset, EX.alice);

// Fluent property manipulation - supports both RDF terms and JS literals
person
  .set(FOAF.name, 'Alice')                    // String literal
  .set(FOAF.age, 30)                          // Number literal  
  .set(EX.department, EX.engineering)         // Named node
  .set(EX.active, true);                      // Boolean literal

// Chain operations naturally - mixed literal types
person
  .setAll(EX.skill, [
    'TypeScript',                           // String literals
    'RDF',
    'SPARQL'
  ])
  .set(FOAF.mbox, factory.namedNode('mailto:alice@example.org'))
  .set(EX.score, 95.5)                          // Decimal literal
  .set(EX.verified, true);                      // Boolean literal

// Read properties like a Map
const name = person.get(FOAF.name);       // Returns a string
const skills = person.getAll(EX.skill);   // Returns an Iterable<string>
const hasAge = person.has(FOAF.age);      // Returns a boolean

// Navigating to other entities 
// Returns a Resource with the same underlying change set
const friend = person.get(FOAF.friend);   // Returns a Resource

// Use static `with` get a Resource version of a NamedNode 
// with the same underlying changeset. 
const joe = Resource.with(person, EX.joe); // Returns a Resource

// Iterate over properties
for (const [predicate, value] of person.entries()) {
  console.log(`${predicate.value}: ${value.value}`);
}

// Builder pattern for complex entities - mixing literals and terms
const company = new Resource(changeset, EX.acmeCorp);
company
  .set(FOAF.name, 'Acme Corporation')             // String literal
  .set(EX.founded, new Date('2020-01-01'))        // Date literal (auto-converts to xsd:dateTime)
  .set(EX.employeeCount, 150)                     // Integer literal
  .set(EX.publiclyTraded, false)                  // Boolean literal
  .set(EX.ceo, EX.john)                           // Named node reference
  .setAll(EX.employee, [EX.alice, EX.bob, EX.charlie])  // Array of named nodes
  .setAll(EX.location, ['San Francisco', 'New York']);  // Array of string literals
```

#### Design Philosophy
The Resource is designed to bridge the gap between RDF's triple-based model and JavaScript's object-oriented patterns:

- **Map-like Interface**: Familiar `get()`, `set()`, `has()`, `delete()` methods
- **Fluent Chaining**: Method chaining for building complex entities
- **Type Safety**: Full TypeScript support with RDF term types
- **Lazy Evaluation**: Efficient querying with immutable data structures
- **Natural Iteration**: Standard JavaScript iteration patterns

This approach makes RDF feel as natural as working with JSON objects while maintaining the semantic richness of linked data.

## Development

```bash
# Install dependencies
bun install

# Build the library
bun run build

# Run tests
bun run test

# Run integration tests (for impls with remote servers)
bun run test:integration

# Run tests in watch mode
bun run test:watch

# Development mode
bun run dev
```