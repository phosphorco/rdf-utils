import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { GraphDBGraph, GraphDBConfig } from '../src/graph/graphdb.js';
import { testGraphInterface, testMutableGraphInterface } from '../test/graph.test.js';
import { testSparqlInterface, testSparqlUpdateInterface } from '../test/sparql.test.js';
import { testPullInterface } from "../test/pull.test.ts";
import { testTransactionalGraphInterface } from '../test/transactional-graph.test.js';
import { factory } from '../src/rdf.js';
import type { Quad } from '../src/rdf.js';
import { N3Graph } from '../src/graph/n3.js';

// Load environment variables and construct endpoint
const protocol = process.env.GRAPHDB_PROTOCOL!;
const host = process.env.GRAPHDB_HOST!;
const port = process.env.GRAPHDB_PORT!;
const endpoint = `${protocol}://${host}:${port}`;
const repositoryId = process.env.GRAPHDB_REPOSITORY!;

const config: GraphDBConfig = {
  endpoint,
  repositoryId
};

// Additional configuration
const reasoning = process.env.GRAPHDB_REASONING === 'true';
const timeout = parseInt(process.env.GRAPHDB_TIMEOUT!);

// Test graph IRI for integration tests
const testGraphIri = factory.namedNode(process.env.TEST_GRAPH_IRI!);

// Helper to create a clean test graph
async function createTestGraph(enableReasoning: boolean = true): Promise<GraphDBGraph> {
  const graph = new GraphDBGraph(config, testGraphIri, enableReasoning);

  // ALWAYS clean up before test starts - don't trust previous test cleanup
  try {
    await graph.deleteAll();
    // Note: GraphDB may have system triples that cannot be deleted (e.g., reasoning-related data).
    // We attempt cleanup but don't validate that the graph is completely empty.
  } catch (err) {
    // Graph might not exist yet, that's ok for first run
  }

  return graph;
}

// Helper to set up graph with test data (for specific quad tests)
async function setupGraphWithQuads(graph: GraphDBGraph, quads: Quad[]): Promise<GraphDBGraph> {
  await graph.add(quads);
  return graph;
}

// Helper to set up graph with foaf-social.ttl data (for pull tests)
async function setupGraphWithFoafData(graph: GraphDBGraph): Promise<GraphDBGraph> {
  const n3Graph = await N3Graph.fromFile('test/data/foaf-social.ttl');
  const quads = [...await n3Graph.quads()];
  await graph.add(quads);
  return graph;
}

describe('GraphDB Integration Tests', () => {

  beforeAll(async () => {
    // Test connection
    try {
      const testGraph = await createTestGraph(true);
      const quads = [...await testGraph.quads()];
      console.log(`Connected to GraphDB at ${config.endpoint}/repositories/${config.repositoryId}`);
    } catch (error) {
      console.error('Failed to connect to GraphDB:', error);
      throw new Error(`Cannot connect to GraphDB. Please ensure GraphDB is running and repository exists. Error: ${error}`);
    }
  });

  afterAll(async () => {
    // Clean up test graph
    try {
      const graph = new GraphDBGraph(config, testGraphIri, false);
      await graph.deleteAll();
    } catch (err) {
      // Best effort cleanup
      console.warn('Failed to clean up test graph:', err);
    }
  });

  // Test basic graph interface
  testGraphInterface(
    'GraphDBGraph',
    createTestGraph,
    setupGraphWithQuads
  );

  // Test mutable graph interface
  testMutableGraphInterface(
    'GraphDBGraph',
    createTestGraph
  );

  // Test SPARQL interface
  testSparqlInterface(
    'GraphDBGraph',
    createTestGraph,
    setupGraphWithQuads
  );

  // Test SPARQL UPDATE interface
  testSparqlUpdateInterface(
    'GraphDBGraph',
    createTestGraph,
    setupGraphWithQuads
  );

  // Test transactional graph interface
  testTransactionalGraphInterface(
    'GraphDBGraph',
    createTestGraph,
    async (graph) => {
      try {
        await graph.deleteAll();
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  );

  // Test pull interface
  testPullInterface(
    'GraphDBGraph',
    createTestGraph,
    setupGraphWithFoafData
  );

  // GraphDB-specific tests
  describe('GraphDB-specific functionality', () => {

    describe('SPARQL UPDATE in transactions', () => {
      test('should execute UPDATE within transaction', async () => {
        const graph = await createTestGraph();

        const testQuad = factory.quad(
          factory.namedNode('http://example.org/item'),
          factory.namedNode('http://example.org/property'),
          factory.literal('initial value')
        );

        await graph.add([testQuad]);

        await graph.inTransaction(async (txGraph) => {
          await txGraph.update(`
            PREFIX ex: <http://example.org/>
            DELETE { ex:item ex:property ?old }
            INSERT { ex:item ex:property "updated via SPARQL UPDATE" }
            WHERE { ex:item ex:property ?old }
          `);
        });

        const quads = [...await graph.quads()];
        expect(quads.length).toBe(1);
        expect(quads[0].object.value).toBe('updated via SPARQL UPDATE');

        await graph.deleteAll();
      });

      test('should rollback UPDATE on transaction failure', async () => {
        const graph = await createTestGraph();

        const testQuad = factory.quad(
          factory.namedNode('http://example.org/item'),
          factory.namedNode('http://example.org/property'),
          factory.literal('original value')
        );

        await graph.add([testQuad]);

        try {
          await graph.inTransaction(async (txGraph) => {
            await txGraph.update(`
              PREFIX ex: <http://example.org/>
              INSERT DATA { ex:item ex:property "should be rolled back" }
            `);
            throw new Error('Deliberate failure');
          });
        } catch (err) {
          // Expected
        }

        const quads = [...await graph.quads()];
        expect(quads.length).toBe(1);
        expect(quads[0].object.value).toBe('original value');

        await graph.deleteAll();
      });

      test('should execute UPDATE outside transaction (direct)', async () => {
        const graph = await createTestGraph();

        // Execute UPDATE directly without transaction
        await graph.update(`
          PREFIX ex: <http://example.org/>
          INSERT DATA {
            ex:item1 ex:property "value 1" .
            ex:item2 ex:property "value 2" .
          }
        `);

        const quads = [...await graph.quads()];
        expect(quads.length).toBe(2);

        await graph.deleteAll();
      });
    });

    test('should execute operations within a transaction successfully', async () => {
      const graph = await createTestGraph();

      const testQuad = factory.quad(
        factory.namedNode('http://example.org/test'),
        factory.namedNode('http://example.org/property'),
        factory.literal('test value')
      );

      // Execute add operation within transaction
      await graph.inTransaction(async (txGraph) => {
        await txGraph.add([testQuad]);
      });

      // Verify data was committed
      const quads = [...await graph.quads()];
      expect(quads.length).toBe(1);
      expect(quads[0].object.value).toBe('test value');

      // Clean up
      await graph.deleteAll();
    });

    test('should rollback transaction on error', async () => {
      const graph = await createTestGraph();

      const testQuad = factory.quad(
        factory.namedNode('http://example.org/test'),
        factory.namedNode('http://example.org/property'),
        factory.literal('test value')
      );

      try {
        await graph.inTransaction(async (txGraph) => {
          await txGraph.add([testQuad]);
          // Force an error to trigger rollback
          throw new Error('Test error to trigger rollback');
        });
      } catch (err) {
        expect((err as Error).message).toBe('Test error to trigger rollback');
      }

      // Verify data was rolled back
      const quads = [...await graph.quads()];
      expect(quads.length).toBe(0);
    });

    test('should handle multiple operations within single transaction', async () => {
      const graph = await createTestGraph();

      const quad1 = factory.quad(
        factory.namedNode('http://example.org/item1'),
        factory.namedNode('http://example.org/property'),
        factory.literal('value 1')
      );

      const quad2 = factory.quad(
        factory.namedNode('http://example.org/item2'),
        factory.namedNode('http://example.org/property'),
        factory.literal('value 2')
      );

      const quad3 = factory.quad(
        factory.namedNode('http://example.org/item3'),
        factory.namedNode('http://example.org/property'),
        factory.literal('value 3')
      );

      // Execute multiple operations within single transaction
      await graph.inTransaction(async (txGraph) => {
        await txGraph.add([quad1, quad2]);
        await txGraph.add([quad3]);
        await txGraph.remove([quad2]); // Remove one quad
      });

      // Verify final state
      const quads = [...await graph.quads()];
      expect(quads.length).toBe(2);

      const values = quads.map(q => q.object.value).sort();
      expect(values).toEqual(['value 1', 'value 3']);

      // Clean up
      await graph.deleteAll();
    });

    test('should not allow nested transactions', async () => {
      const graph = await createTestGraph();

      try {
        await graph.inTransaction(async (txGraph) => {
          // This should fail since we're already in a transaction
          await expect(txGraph.inTransaction(async () => {})).rejects.toThrow('Transaction already in progress');
        });
      } catch (err) {
        // Transaction should still rollback properly
      }

      // Verify graph is still clean
      const quads = [...await graph.quads()];
      expect(quads.length).toBe(0);
    });

    test('should handle SPARQL operations within transaction', async () => {
      const graph = await createTestGraph();

      const testQuad = factory.quad(
        factory.namedNode('http://example.org/person'),
        factory.namedNode('http://example.org/name'),
        factory.literal('John Doe')
      );

      await graph.inTransaction(async (txGraph) => {
        await txGraph.add([testQuad]);

        // Execute SPARQL query within the same transaction
        const selectQuery = {
          queryType: 'SELECT' as const,
          type: 'query' as const,
          prefixes: {},
          variables: [factory.variable('name') as any],
          from: {default: [testGraphIri], named: []},
          where: [{
            type: 'bgp' as const,
            triples: [{
              subject: factory.namedNode('http://example.org/person') as any,
              predicate: factory.namedNode('http://example.org/name') as any,
              object: factory.variable('name') as any
            }]
          }]
        };

        const result = await txGraph.sparql(selectQuery);
        expect(result.resultType).toBe('bindings');

        // Execute the query and check results
        const stream = await result.execute();
        const bindings: any[] = [];

        await new Promise<void>((resolve) => {
          stream.on('data', (binding: any) => bindings.push(binding));
          stream.on('end', () => resolve());
        });

        expect(bindings.length).toBe(1);
        expect(bindings[0].get('name').value).toBe('John Doe');
      });

      // Clean up
      await graph.deleteAll();
    });

    test('should handle graph-specific operations', async () => {
      // Create a separate graph for this test
      const graph1Iri = factory.namedNode('http://test.example.org/graph1');
      const graph2Iri = factory.namedNode('http://test.example.org/graph2');

      const graph1 = new GraphDBGraph(config, graph1Iri, false);
      const graph2 = new GraphDBGraph(config, graph2Iri, false);

      try {
        // Clean up
        try { await graph1.deleteAll(); } catch {}
        try { await graph2.deleteAll(); } catch {}

        const quad1 = factory.quad(
          factory.namedNode('http://example.org/item1'),
          factory.namedNode('http://example.org/property'),
          factory.literal('value 1')
        );

        const quad2 = factory.quad(
          factory.namedNode('http://example.org/item2'),
          factory.namedNode('http://example.org/property'),
          factory.literal('value 2')
        );

        // Add data to each graph
        await graph1.add([quad1]);
        await graph2.add([quad2]);

        // Each graph should only see its own data
        const quads1 = [...await graph1.quads()];
        const quads2 = [...await graph2.quads()];

        expect(quads1.length).toBe(1);
        expect(quads2.length).toBe(1);
        expect(quads1[0].object.value).toBe('value 1');
        expect(quads2[0].object.value).toBe('value 2');

      } finally {
        // Clean up
        try { await graph1.deleteAll(); } catch {}
        try { await graph2.deleteAll(); } catch {}
      }
    });

    test('should preserve explicit named graphs in quads when adding', async () => {
      // Bug test: quads with explicit named graphs should keep their graph IRIs,
      // not get overwritten with the graph's IRI

      const graph1Iri = factory.namedNode('http://test.example.org/graph1');
      const namedGraphA = factory.namedNode('http://example.org/namedGraphA');
      const namedGraphB = factory.namedNode('http://example.org/namedGraphB');

      const graph = new GraphDBGraph(config, graph1Iri, false);

      try {
        // Clean up
        try { await graph.deleteAll(); } catch {}

        // Create quads with explicit named graphs
        const quadA = factory.quad(
          factory.namedNode('http://example.org/itemA'),
          factory.namedNode('http://example.org/property'),
          factory.literal('value A'),
          namedGraphA
        );

        const quadB = factory.quad(
          factory.namedNode('http://example.org/itemB'),
          factory.namedNode('http://example.org/property'),
          factory.literal('value B'),
          namedGraphB
        );

        // Add quads with their explicit named graphs
        await graph.add([quadA, quadB]);

        // Query for quads in namedGraphA - should find quadA with its explicit graph
        const sparql = `
          SELECT ?s ?p ?o WHERE {
            GRAPH <${namedGraphA}> {
              ?s ?p ?o
            }
          }
        `;

        const result = await graph.sparql({
          queryType: 'SELECT',
          type: 'query',
          prefixes: {},
          variables: [
            factory.variable('s') as any,
            factory.variable('p') as any,
            factory.variable('o') as any
          ],
          where: [{
            type: 'graph',
            name: namedGraphA as any,
            patterns: [{
              type: 'bgp',
              triples: [{
                subject: factory.variable('s') as any,
                predicate: factory.variable('p') as any,
                object: factory.variable('o') as any
              }]
            }]
          }]
        });

        const bindings: any[] = [];
        const stream = await result.execute();

        await new Promise<void>((resolve) => {
          stream.on('data', (binding: any) => bindings.push(binding));
          stream.on('end', () => resolve());
        });

        // Should find the quad that was explicitly added to namedGraphA
        expect(bindings.length).toBe(1);
        expect(bindings[0].get('o').value).toBe('value A');

      } finally {
        // Clean up
        try { await graph.deleteAll(); } catch {}
      }
    });

    test('should support per-query reasoning control via infer parameter', async () => {
      const graph = new GraphDBGraph(config, testGraphIri, true); // reasoning=true for graph
      const defaultGraph = new GraphDBGraph(config, undefined, true); // Query default graph for inferred triples

      try {
        // Clean up
        try { await graph.deleteAll(); } catch {}

        // Define namespaces for schema relationships
        const rdfs = 'http://www.w3.org/2000/01/rdf-schema#';
        const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
        const ex = 'http://example.org/';

        // Add schema: Employee is a subclass of Person
        const subClassOfQuad = factory.quad(
          factory.namedNode(`${ex}Employee`),
          factory.namedNode(`${rdfs}subClassOf`),
          factory.namedNode(`${ex}Person`)
        );

        // Add instance: john is an Employee (explicit)
        const typeQuad = factory.quad(
          factory.namedNode(`${ex}john`),
          factory.namedNode(`${rdf}type`),
          factory.namedNode(`${ex}Employee`)
        );

        await graph.add([subClassOfQuad, typeQuad]);

        // Query for ENTAILED data (not explicitly added)
        // john should be inferred as a Person because Employee subClassOf Person
        const entailedQuery = `
          ASK WHERE {
            <${ex}john> <${rdf}type> <${ex}Person> .
          }
        `;

        // POSITIVE TEST: With reasoning enabled (default), should find entailed triple
        const resultWithReasoning = await defaultGraph.ask(entailedQuery);
        expect(resultWithReasoning).toBe(true);

        // NEGATIVE TEST: With reasoning disabled, should NOT find entailed triple
        const resultWithoutReasoning = await defaultGraph.ask(entailedQuery, { reasoning: false });
        expect(resultWithoutReasoning).toBe(false);

        // VALIDATION: Explicit data should still be accessible with reasoning disabled
        const explicitQuery = `
          ASK WHERE {
            <${ex}john> <${rdf}type> <${ex}Employee> .
          }
        `;
        const resultExplicitWithoutReasoning = await graph.ask(explicitQuery, { reasoning: false });
        expect(resultExplicitWithoutReasoning).toBe(true);

      } finally {
        try { await graph.deleteAll(); } catch {}
      }
    });

    test('should execute simple ASK query for explicitly added triple', async () => {
      const graph = await createTestGraph(false); // No reasoning needed for explicit data

      try {
        // Add a single simple triple
        const testQuad = factory.quad(
          factory.namedNode('http://example.org/alice'),
          factory.namedNode('http://xmlns.com/foaf/0.1/name'),
          factory.literal('Alice')
        );

        await graph.add([testQuad]);

        // Test 1: ASK for the triple that exists - should return true
        const queryForExistingTriple = `
          ASK WHERE {
            <http://example.org/alice> <http://xmlns.com/foaf/0.1/name> "Alice" .
          }
        `;
        const resultExists = await graph.ask(queryForExistingTriple);
        expect(resultExists).toBe(true);

        // Test 2: ASK for a triple that doesn't exist - should return false
        const queryForNonExistingTriple = `
          ASK WHERE {
            <http://example.org/bob> <http://xmlns.com/foaf/0.1/name> "Bob" .
          }
        `;
        const resultNotExists = await graph.ask(queryForNonExistingTriple);
        expect(resultNotExists).toBe(false);

        // Test 3: ASK for partial match (property exists but not with that object) - should return false
        const queryForDifferentObject = `
          ASK WHERE {
            <http://example.org/alice> <http://xmlns.com/foaf/0.1/name> "Eve" .
          }
        `;
        const resultDifferentObject = await graph.ask(queryForDifferentObject);
        expect(resultDifferentObject).toBe(false);

      } finally {
        try { await graph.deleteAll(); } catch {}
      }
    });

    test('BUG: reasoning: false option should be respected for in-transaction queries', async () => {
      // This test demonstrates the bug where the infer parameter is not passed
      // to GraphDB when executing SPARQL queries within a transaction context.
      // The bug causes { reasoning: false } to be silently ignored, and GraphDB
      // defaults to infer=true.
      //
      // Root cause: In src/graph/graphdb.ts executeQuery(), the transaction path
      // uses `${this.transactionUrl}?action=QUERY` without the infer parameter,
      // while the non-transaction path correctly uses buildQueryUrl() which adds ?infer=true|false

      const graph = new GraphDBGraph(config, testGraphIri, true); // default reasoning=true
      const defaultGraph = new GraphDBGraph(config, undefined, true);

      try {
        // Clean up
        try { await graph.deleteAll(); } catch {}

        // Define namespaces for schema relationships
        const rdfs = 'http://www.w3.org/2000/01/rdf-schema#';
        const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
        const ex = 'http://example.org/reasoning-tx-bug/';

        // Add schema: Employee is a subclass of Person
        const subClassOfQuad = factory.quad(
          factory.namedNode(`${ex}Employee`),
          factory.namedNode(`${rdfs}subClassOf`),
          factory.namedNode(`${ex}Person`)
        );

        // Add instance: john is an Employee (explicit)
        const typeQuad = factory.quad(
          factory.namedNode(`${ex}john`),
          factory.namedNode(`${rdf}type`),
          factory.namedNode(`${ex}Employee`)
        );

        await graph.add([subClassOfQuad, typeQuad]);

        // Query for ENTAILED data (not explicitly added)
        // john should be inferred as a Person because Employee subClassOf Person
        const entailedQuery = `
          ASK WHERE {
            <${ex}john> <${rdf}type> <${ex}Person> .
          }
        `;

        // FIRST: Verify the test setup works outside transactions
        // With reasoning enabled, should find entailed triple
        const resultWithReasoningOutsideTx = await defaultGraph.ask(entailedQuery, { reasoning: true });
        expect(resultWithReasoningOutsideTx).toBe(true);

        // Without reasoning, should NOT find entailed triple (outside transaction)
        const resultWithoutReasoningOutsideTx = await defaultGraph.ask(entailedQuery, { reasoning: false });
        expect(resultWithoutReasoningOutsideTx).toBe(false);

        // NOW: Test inside a transaction - this is where the bug manifests
        await graph.inTransaction(async (txGraph) => {
          const txDefaultGraph = txGraph.withIri(undefined);

          // With reasoning: true inside transaction - should find entailed triple
          const resultWithReasoningInTx = await txDefaultGraph.ask(entailedQuery, { reasoning: true });
          expect(resultWithReasoningInTx).toBe(true);

          // BUG: With reasoning: false inside transaction - should NOT find entailed triple
          // But due to the bug, this returns true because infer param is not passed
          const resultWithoutReasoningInTx = await txDefaultGraph.ask(entailedQuery, { reasoning: false });

          // This assertion will FAIL until the bug is fixed:
          // Expected: false (no inferred data when reasoning is disabled)
          // Actual (buggy): true (reasoning: false is ignored, infer defaults to true)
          expect(resultWithoutReasoningInTx).toBe(false);
        });

      } finally {
        try { await graph.deleteAll(); } catch {}
      }
    });

    test('should handle entailed data within transaction and rollback both explicit and entailed triples', async () => {
      // Enable reasoning for this graph so entailment works
      const graph = new GraphDBGraph(config, testGraphIri, true);

      // Clean up before test
      try { await graph.deleteAll(); } catch {}

      // Define namespaces
      const rdfs = 'http://www.w3.org/2000/01/rdf-schema#';
      const rdf = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#';
      const ex = 'http://example.org/';

      // Add schema: define Employee as a subclass of Person (goes to named graph)
      const q1 = factory.quad(
          factory.namedNode(`${ex}Employee`),
          factory.namedNode(`${rdfs}subClassOf`),
          factory.namedNode(`${ex}Person`)
      );

      // Add instance: john is an Employee (goes to named graph)
      const q2 = factory.quad(
          factory.namedNode(`${ex}john`),
          factory.namedNode(`${rdf}type`),
          factory.namedNode(`${ex}Employee`)
      );

      await graph.add([q1]);

      const baseData = async function(graph) {
        const results = await graph.select(`
          PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
          PREFIX ex: <http://example.org/>
          PREFIX rdfs: <http://www.w3.org/2000/01/rdf-schema#>
          
          SELECT ?c WHERE {
            ?c rdfs:subClassOf ex:Person.
          }
        `);

        return [...results].length;
      }

      const entailedData = async function(graph) {
        const results = await graph.select(`
          PREFIX rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#>
          PREFIX ex: <http://example.org/>
          
          SELECT ?p WHERE {
            ?p a ex:Person.
          }
        `);

        return [...results].length;
      }

      const readGraph = graph.withIri(undefined);
      expect(await baseData(readGraph)).toBe(1);
      expect(await entailedData(readGraph)).toBe(0);

      expect(async () => {
        await graph.inTransaction(async function (graph) {

          const readGraph = graph.withIri(undefined);

          await graph.add([q2]);

          expect(await baseData(readGraph)).toBe(1);
          expect(await entailedData(readGraph)).toBe(1);

          throw new Error("Deliberate failure!");

        });
      }
      ).toThrow();


      expect(await baseData(readGraph)).toBe(1);
      expect(await entailedData(readGraph)).toBe(0);

    });

  });
});
