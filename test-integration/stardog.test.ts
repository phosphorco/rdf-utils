import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { StardogGraph, StardogConfig } from '../src/graph/stardog.js';
import { testGraphInterface, testMutableGraphInterface } from '../test/graph.test.js';
import { testSparqlInterface, testSparqlUpdateInterface } from '../test/sparql.test.js';
import { testPullInterface } from "../test/pull.test.ts";
import { testTransactionalGraphInterface } from '../test/transactional-graph.test.js';
import { factory } from '../src/rdf.js';
import type { Quad } from '../src/rdf.js';
import type { MutableGraph } from '../../src/graph.js';
import { N3Graph } from '../src/graph/n3.js';

// Load environment variables and construct endpoint
const protocol = process.env.STARDOG_PROTOCOL || 'http';
const host = process.env.STARDOG_HOST || 'localhost';
const port = process.env.STARDOG_PORT || '5820';
const endpoint = `${protocol}://${host}:${port}`;

const config: StardogConfig = {
  endpoint,
  username: process.env.STARDOG_USERNAME || 'admin',
  password: process.env.STARDOG_PASSWORD || 'admin',
  database: process.env.STARDOG_DATABASE || 'test'
};

// Additional configuration
const reasoning = process.env.STARDOG_REASONING === 'true';
const timeout = parseInt(process.env.STARDOG_TIMEOUT || '30000');

// Test graph IRI for integration tests
const testGraphIri = factory.namedNode('http://test.example.org/integration/graph');

// Helper to create a clean test graph
async function createTestGraph(enableReasoning: boolean = false): Promise<StardogGraph> {
  const graph = new StardogGraph(config, testGraphIri, enableReasoning);

  // ALWAYS clean up before test starts - don't trust previous test cleanup
  try {
    await graph.deleteAll();

    // Verify cleanup worked - FAIL if it didn't
    const remainingQuads = [...await graph.quads()];
    if (remainingQuads.length > 0) {
      for(const quad of remainingQuads) {
        console.log(quad);
      }
      throw new Error(`Test graph cleanup FAILED: ${remainingQuads.length} quads remain after deleteAll(). Test cannot proceed with dirty state.`);
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('Test graph cleanup FAILED')) {
      throw err; // Re-throw cleanup failures
    }
    // Graph might not exist yet, that's ok for first run
  }

  return graph;
}

// Helper to clear entire database (all graphs) between pragma tests
async function clearDatabase(): Promise<void> {
  // Clear the schema graph
  const schemaGraphIri = factory.namedNode('tag:stardog:api:context:schema');
  const schemaGraph = new StardogGraph(config, schemaGraphIri, true);
  try {
    await schemaGraph.deleteAll();
  } catch {}

  // Clear the test graph
  const testGraph = new StardogGraph(config, testGraphIri, true);
  try {
    await testGraph.deleteAll();
  } catch {}
}

// Helper to set up graph with test data (for specific quad tests)
async function setupGraphWithQuads(graph: StardogGraph, quads: Quad[]): Promise<StardogGraph> {
  await graph.add(quads);
  return graph;
}

// Helper to set up graph with foaf-social.ttl data (for pull tests)
async function setupGraphWithFoafData(graph: StardogGraph): Promise<StardogGraph> {
  const n3Graph = await N3Graph.fromFile('test/data/foaf-social.ttl');
  const quads = [...await n3Graph.quads()];
  await graph.add(quads);
  return graph;
}

describe('Stardog Integration Tests', () => {
  beforeAll(async () => {
    // Test connection
    try {
      const testGraph = await createTestGraph();
      const quads = [...await testGraph.quads()];
      console.log(`Connected to Stardog at ${config.endpoint}/${config.database} (reasoning: ${reasoning})`);
    } catch (error) {
      console.error('Failed to connect to Stardog:', error);
      throw new Error(`Cannot connect to Stardog. Please ensure Stardog is running and credentials are correct. Error: ${error}`);
    }
  });

  afterAll(async () => {
    // Clean up test graph
    try {
      const graph = new StardogGraph(config, testGraphIri, false);
      await graph.deleteAll();
    } catch (err) {
      // Best effort cleanup
      console.warn('Failed to clean up test graph:', err);
    }
  });

  // Test basic graph interface
  testGraphInterface(
    'StardogGraph',
    createTestGraph,
    setupGraphWithQuads
  );

  // Test mutable graph interface
  testMutableGraphInterface(
    'StardogGraph',
    createTestGraph
  );

  // Test SPARQL interface
  testSparqlInterface(
    'StardogGraph',
    createTestGraph,
    setupGraphWithQuads
  );

  // Test SPARQL UPDATE interface
  testSparqlUpdateInterface(
    'StardogGraph',
    createTestGraph,
    setupGraphWithQuads
  );

  // Test transactional graph interface
  testTransactionalGraphInterface(
    'StardogGraph',
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
    'StardogGraph',
    createTestGraph,
    setupGraphWithFoafData
  );

   // Stardog-specific tests
  describe('Stardog-specific functionality', () => {

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
        expect(err.message).toBe('Test error to trigger rollback');
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
      
      const graph1 = new StardogGraph(config, graph1Iri, false);
      const graph2 = new StardogGraph(config, graph2Iri, false);
      
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

    test('should support reasoning in SPARQL queries outside transaction', async () => {
      await clearDatabase();

      const graph = new StardogGraph(config, testGraphIri, true);

      // Create schema graph for Stardog reasoning
      const schemaGraphIri = factory.namedNode('tag:stardog:api:context:schema');
      const schemaGraph = new StardogGraph(config, schemaGraphIri, true);

      try {
        
        // Add schema (class hierarchy) to the schema graph
        const schemaTriples = [
          factory.quad(
            factory.namedNode('http://example.org/Employee'),
            factory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
            factory.namedNode('http://xmlns.com/foaf/0.1/Person')
          )
        ];
        
        await schemaGraph.add(schemaTriples);
        
        // Add instance data to the regular graph
        const instanceTriples = [
          factory.quad(
            factory.namedNode('http://example.org/John'),
            factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
            factory.namedNode('http://example.org/Employee')
          )
        ];
        
        await graph.add(instanceTriples);
        
        // Test reasoning: if reasoning is enabled, John should be inferred to be a Person
        // because Employee subClassOf Person and John is an Employee
        const sparql = `
          PREFIX foaf: <http://xmlns.com/foaf/0.1/>
          ASK WHERE {
            <http://example.org/John> a foaf:Person .
          }
        `;
        
        const result = await graph.ask(sparql);

        expect(result).toBe(true);

      } finally {
        await clearDatabase();
      }
    });

    test('should support reasoning in SPARQL queries inside transaction', async () => {
      await clearDatabase();

      const graph = new StardogGraph(config, testGraphIri, true);

      // Create schema graph for Stardog reasoning
      const schemaGraphIri = factory.namedNode('tag:stardog:api:context:schema');
      const schemaGraph = new StardogGraph(config, schemaGraphIri, true);

      try {
        // Clean up and setup schema outside of transaction
        try { await schemaGraph.deleteAll(); } catch {}

        // Add schema (class hierarchy) to the schema graph
        const schemaTriples = [
          factory.quad(
            factory.namedNode('http://example.org/Manager'),
            factory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
            factory.namedNode('http://xmlns.com/foaf/0.1/Person')
          )
        ];

        await schemaGraph.add(schemaTriples);

        // Now start transaction for instance data
        await graph.begin();

        // Add instance data within transaction
        const instanceTriples = [
          factory.quad(
            factory.namedNode('http://example.org/Jane'),
            factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
            factory.namedNode('http://example.org/Manager')
          )
        ];

        await graph.add(instanceTriples);

        // Test reasoning within transaction
        const sparql = `
          PREFIX foaf: <http://xmlns.com/foaf/0.1/>
          ASK WHERE {
            <http://example.org/Jane> a foaf:Person .
          }
        `;

        const result = await graph.ask(sparql);

        expect(result).toBe(true);

        await graph.commit();

        // Test reasoning still works after commit
        const resultAfterCommit = await graph.ask(sparql);
        console.log(`Reasoning ${reasoning ? 'enabled' : 'disabled'}: Query result after commit = ${resultAfterCommit}`);

        expect(resultAfterCommit).toBe(true);

      } catch (error) {
        try { await graph.rollback(); } catch {}
        throw error;
      } finally {
        await clearDatabase();
      }
    });

    test('should preserve explicit named graphs in quads when adding', async () => {
      // Bug test: quads with explicit named graphs should keep their graph IRIs,
      // not get overwritten with the graph's IRI

      const graph1Iri = factory.namedNode('http://test.example.org/graph1');
      const graph2Iri = factory.namedNode('http://test.example.org/graph2');
      const namedGraphA = factory.namedNode('http://example.org/namedGraphA');
      const namedGraphB = factory.namedNode('http://example.org/namedGraphB');

      const graph = new StardogGraph(config, graph1Iri, false);

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

      test('should execute UPDATE with reasoning pragma', async () => {
        await clearDatabase();

        const graph = new StardogGraph(config, testGraphIri, true);
        const schemaGraphIri = factory.namedNode('tag:stardog:api:context:schema');
        const schemaGraph = new StardogGraph(config, schemaGraphIri, true);

        try {
          // Add schema
          await schemaGraph.add([
            factory.quad(
              factory.namedNode('http://example.org/Employee'),
              factory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
              factory.namedNode('http://xmlns.com/foaf/0.1/Person')
            )
          ]);

          // Add instance
          await graph.add([
            factory.quad(
              factory.namedNode('http://example.org/John'),
              factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
              factory.namedNode('http://example.org/Employee')
            )
          ]);

          // UPDATE using inferred type (with reasoning)
          await graph.update(`
            PREFIX foaf: <http://xmlns.com/foaf/0.1/>
            PREFIX ex: <http://example.org/>
            INSERT { ?person ex:verified true }
            WHERE { ?person a foaf:Person }
          `);

          // Should have added the verified triple (John inferred as Person)
          const quads = [...await graph.quads()];
          const verifiedQuad = quads.find(q =>
            q.predicate.value === 'http://example.org/verified'
          );
          expect(verifiedQuad).toBeDefined();

        } finally {
          await clearDatabase();
        }
      });
    });

    describe('Per-Query Reasoning Override (Pragma Directives)', () => {
      /**
       * Test reasoning override: disable reasoning within a reasoning transaction
       * Uses pragma directive to override transaction-level reasoning setting
       */
      test('should override reasoning OFF in reasoning transaction via pragma', async () => {
        await clearDatabase();

        const graph = new StardogGraph(config, testGraphIri, true); // reasoning=true for graph

        // Create schema graph for reasoning rules
        const schemaGraphIri = factory.namedNode('tag:stardog:api:context:schema');
        const schemaGraph = new StardogGraph(config, schemaGraphIri, true);

        try {

          // Add schema: Employee subClassOf Person
          const schemaTriples = [
            factory.quad(
              factory.namedNode('http://example.org/Employee'),
              factory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
              factory.namedNode('http://xmlns.com/foaf/0.1/Person')
            )
          ];

          await schemaGraph.add(schemaTriples);

          // Start reasoning transaction
          await graph.begin();

          // Add instance data: John is an Employee
          const instanceTriples = [
            factory.quad(
              factory.namedNode('http://example.org/John'),
              factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
              factory.namedNode('http://example.org/Employee')
            )
          ];

          await graph.add(instanceTriples);

          // Query to check if John is a Person (would be inferred with reasoning)
          const askQuery = `
            PREFIX foaf: <http://xmlns.com/foaf/0.1/>
            ASK WHERE {
              <http://example.org/John> a foaf:Person .
            }
          `;

          // Query WITH reasoning enabled (default) - should be true
          const resultWithReasoning = await graph.ask(askQuery);
          expect(resultWithReasoning).toBe(true);

          // Query WITH reasoning DISABLED via pragma - should be false
          const resultWithoutReasoning = await graph.ask(askQuery, { reasoning: false });
          expect(resultWithoutReasoning).toBe(false);

          await graph.commit();

        } catch (error) {
          try { await graph.rollback(); } catch {}
          throw error;
        } finally {
          await clearDatabase();
        }
      });

      /**
       * Test reasoning override: verify pragmas don't enable reasoning in non-reasoning transactions
       * This documents a Stardog limitation: pragmas can disable reasoning in reasoning transactions,
       * but cannot enable reasoning in non-reasoning transactions (transaction-level setting is immutable that way)
       */
      test('should NOT override reasoning ON in non-reasoning transaction (Stardog limitation)', async () => {
        await clearDatabase();

        const graph = new StardogGraph(config, testGraphIri, false); // reasoning=false for graph

        // Create schema graph for reasoning rules
        const schemaGraphIri = factory.namedNode('tag:stardog:api:context:schema');
        const schemaGraph = new StardogGraph(config, schemaGraphIri, true);

        try {

          // Add schema: Manager subClassOf Person
          const schemaTriples = [
            factory.quad(
              factory.namedNode('http://example.org/Manager'),
              factory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
              factory.namedNode('http://xmlns.com/foaf/0.1/Person')
            )
          ];

          await schemaGraph.add(schemaTriples);

          // Start non-reasoning transaction
          await graph.begin();

          // Add instance data: Jane is a Manager
          const instanceTriples = [
            factory.quad(
              factory.namedNode('http://example.org/Jane'),
              factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
              factory.namedNode('http://example.org/Manager')
            )
          ];

          await graph.add(instanceTriples);

          // Query to check if Jane is a Person (would be inferred with reasoning)
          const askQuery = `
            PREFIX foaf: <http://xmlns.com/foaf/0.1/>
            ASK WHERE {
              <http://example.org/Jane> a foaf:Person .
            }
          `;

          // Query with default (no reasoning) - should be false
          const resultWithoutReasoning = await graph.ask(askQuery);
          expect(resultWithoutReasoning).toBe(false);

          // Query WITH reasoning pragma override - Stardog limitation: pragma cannot enable
          // reasoning within a non-reasoning transaction. Result should still be false.
          const resultWithReasoningAttempt = await graph.ask(askQuery, { reasoning: true });
          expect(resultWithReasoningAttempt).toBe(false);

          await graph.commit();

        } catch (error) {
          try { await graph.rollback(); } catch {}
          throw error;
        } finally {
          await clearDatabase();
        }
      });

      /**
       * Test SELECT queries with reasoning override (disable in reasoning transaction)
       */
      test('should override reasoning OFF for SELECT queries in reasoning transaction', async () => {
        await clearDatabase();

        const graph = new StardogGraph(config, testGraphIri, true); // reasoning=true

        const schemaGraphIri = factory.namedNode('tag:stardog:api:context:schema');
        const schemaGraph = new StardogGraph(config, schemaGraphIri, true);

        try {

          // Add schema: Developer subClassOf Employee
          await schemaGraph.add([
            factory.quad(
              factory.namedNode('http://example.org/Developer'),
              factory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
              factory.namedNode('http://example.org/Employee')
            )
          ]);

          await graph.begin();

          // Add instance: Alice is a Developer
          await graph.add([
            factory.quad(
              factory.namedNode('http://example.org/Alice'),
              factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
              factory.namedNode('http://example.org/Developer')
            )
          ]);

          const selectQuery = `
            PREFIX ex: <http://example.org/>
            SELECT ?person WHERE {
              ?person a ex:Employee .
            }
          `;

          // With reasoning (default): should find Alice (inferred as Employee)
          const withReasoning = await graph.select(selectQuery);
          expect([...withReasoning].length).toBe(1);

          // Without reasoning via pragma: should find nothing (Alice not directly typed as Employee)
          const withoutReasoning = await graph.select(selectQuery, { reasoning: false });
          expect([...withoutReasoning].length).toBe(0);

          await graph.commit();

        } catch (error) {
          try { await graph.rollback(); } catch {}
          throw error;
        } finally {
          await clearDatabase();
        }
      });

      /**
       * Test CONSTRUCT queries with reasoning override (disable in reasoning transaction)
       */
      test('should override reasoning OFF for CONSTRUCT queries in reasoning transaction', async () => {
        await clearDatabase();

        const graph = new StardogGraph(config, testGraphIri, true); // reasoning=true

        const schemaGraphIri = factory.namedNode('tag:stardog:api:context:schema');
        const schemaGraph = new StardogGraph(config, schemaGraphIri, true);

        try {

          // Add schema: Consultant subClassOf Contractor
          await schemaGraph.add([
            factory.quad(
              factory.namedNode('http://example.org/Consultant'),
              factory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
              factory.namedNode('http://example.org/Contractor')
            )
          ]);

          await graph.begin();

          // Add instance: Bob is a Consultant
          await graph.add([
            factory.quad(
              factory.namedNode('http://example.org/Bob'),
              factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
              factory.namedNode('http://example.org/Consultant')
            )
          ]);

          const constructQuery = `
            PREFIX ex: <http://example.org/>
            CONSTRUCT { ?person a ex:Contractor }
            WHERE { ?person a ex:Contractor }
          `;

          // With reasoning (default): should construct triple for Bob
          const resultWithReasoning = await graph.construct(constructQuery);
          const quadsWithReasoning = [...await resultWithReasoning.quads()];
          expect(quadsWithReasoning.length).toBe(1);

          // Without reasoning via pragma: should construct nothing
          const resultWithoutReasoning = await graph.construct(constructQuery, { reasoning: false });
          const quadsWithoutReasoning = [...await resultWithoutReasoning.quads()];
          expect(quadsWithoutReasoning.length).toBe(0);

          await graph.commit();

        } catch (error) {
          try { await graph.rollback(); } catch {}
          throw error;
        } finally {
          await clearDatabase();
        }
      });

      /**
       * Test multiple queries with different reasoning settings in same transaction
       */
      test('should handle multiple queries with alternating reasoning disables in same transaction', async () => {
        await clearDatabase();

        const graph = new StardogGraph(config, testGraphIri, true); // reasoning=true

        const schemaGraphIri = factory.namedNode('tag:stardog:api:context:schema');
        const schemaGraph = new StardogGraph(config, schemaGraphIri, true);

        try {

          // Add schema: Student subClassOf Person
          await schemaGraph.add([
            factory.quad(
              factory.namedNode('http://example.org/Student'),
              factory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'),
              factory.namedNode('http://xmlns.com/foaf/0.1/Person')
            )
          ]);

          await graph.begin();

          // Add instance: Charlie is a Student
          await graph.add([
            factory.quad(
              factory.namedNode('http://example.org/Charlie'),
              factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
              factory.namedNode('http://example.org/Student')
            )
          ]);

          const query = `
            PREFIX foaf: <http://xmlns.com/foaf/0.1/>
            ASK WHERE {
              <http://example.org/Charlie> a foaf:Person .
            }
          `;

          // First query with default reasoning enabled
          const result1 = await graph.ask(query);
          expect(result1).toBe(true);

          // Second query with reasoning disabled via pragma
          const result2 = await graph.ask(query, { reasoning: false });
          expect(result2).toBe(false);

          // Third query with reasoning disabled again
          const result3 = await graph.ask(query, { reasoning: false });
          expect(result3).toBe(false);

          // Fourth query back to default (reasoning enabled)
          const result4 = await graph.ask(query);
          expect(result4).toBe(true);

          await graph.commit();

        } catch (error) {
          try { await graph.rollback(); } catch {}
          throw error;
        } finally {
          await clearDatabase();
        }
      });
    });
  });
});
