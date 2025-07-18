import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { StardogGraph, StardogConfig } from '../src/graph/stardog.js';
import { testGraphInterface, testMutableGraphInterface } from '../test/graph.test.js';
import { testSparqlInterface } from '../test/sparql.test.js';
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
async function createTestGraph(): Promise<StardogGraph> {
  const graph = new StardogGraph(testGraphIri, config, reasoning);
  
  // ALWAYS clean up before test starts - don't trust previous test cleanup
  try {
    await graph.deleteAll();
    
    // Verify cleanup worked - FAIL if it didn't
    const remainingQuads = [...await graph.quads()];
    if (remainingQuads.length > 0) {
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
      const graph = new StardogGraph(testGraphIri, config, reasoning);
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


    test('should handle graph-specific operations', async () => {
      // Create a separate graph for this test
      const graph1Iri = factory.namedNode('http://test.example.org/graph1');
      const graph2Iri = factory.namedNode('http://test.example.org/graph2');
      
      const graph1 = new StardogGraph(graph1Iri, config, reasoning);
      const graph2 = new StardogGraph(graph2Iri, config, reasoning);
      
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
  });
});
