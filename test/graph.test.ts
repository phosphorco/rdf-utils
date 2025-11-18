import { test, expect, describe } from 'bun:test';
import { Graph, ImmutableGraph, MutableGraph, TransactionalGraph } from '../src/graph.js';
import { N3Graph } from '../src/graph/n3.js';
import { ImmutableSetGraph } from '../src/graph/immutable.js';
import { factory, namespace } from '../src/rdf.js';
import type { Quad } from '../src/rdf.js';

const EX = namespace('http://example.org/');
const XSD = namespace('http://www.w3.org/2001/XMLSchema#');

// Test data
const testQuads = [
  factory.quad(EX.alice, EX.knows, EX.bob),
  factory.quad(EX.alice, EX.age, factory.literal('30', XSD.integer)),
  factory.quad(EX.bob, EX.name, factory.literal('Bob Smith', 'en'))
];

/**
 * Generic test suite for Graph interface
 */
export function testGraphInterface<G extends Graph<any>>(
  name: string,
  createGraph: () => Promise<G>,
  setupGraph: (graph: G, quads: Quad[]) => Promise<G>
) {
  describe(`${name} - Graph Interface`, () => {
    test('should return quads', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      
      const quads = [...await populatedGraph.quads()];
      expect(quads.length).toBe(3);
      
      const subjects = quads.map(q => q.subject.value);
      expect(subjects).toContain('http://example.org/alice');
      expect(subjects).toContain('http://example.org/bob');
    });

    test('should handle empty graph', async () => {
      const graph = await createGraph();
      
      const quads = [...await graph.quads()];
      expect(quads.length).toBe(0);
    });

    test('should have graph IRI', async () => {
      const graph = await createGraph();
      expect(graph.iri).toBeDefined();
      expect(graph.iri.termType).toMatch(/^(DefaultGraph|NamedNode)$/);
    });

    test('should find quads by subject', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      
      const results = [...await populatedGraph.find(EX.alice)];
      
      expect(results.length).toBe(2);
      expect(results.every(q => q.subject.equals(EX.alice))).toBe(true);
    });

    test('should find quads by predicate', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      
      const results = [...await populatedGraph.find(null, EX.knows)];
      
      expect(results.length).toBe(1);
      expect(results[0].predicate.equals(EX.knows)).toBe(true);
      expect(results[0].object.value).toBe('http://example.org/bob');
    });

    test('should find quads by object', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      
      const results = [...await populatedGraph.find(null, null, EX.bob)];
      
      expect(results.length).toBe(1);
      expect(results[0].object.equals(EX.bob)).toBe(true);
      expect(results[0].subject.value).toBe('http://example.org/alice');
    });

    test('should find quads by literal object', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      
      const literal = factory.literal('Bob Smith', 'en');
      const results = [...await populatedGraph.find(null, null, literal)];
      
      expect(results.length).toBe(1);
      expect(results[0].object.equals(literal)).toBe(true);
      expect(results[0].subject.value).toBe('http://example.org/bob');
    });

    test('should find quads by multiple patterns', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      
      const results = [...await populatedGraph.find(EX.alice, EX.knows)];
      
      expect(results.length).toBe(1);
      expect(results[0].subject.equals(EX.alice)).toBe(true);
      expect(results[0].predicate.equals(EX.knows)).toBe(true);
      expect(results[0].object.value).toBe('http://example.org/bob');
    });

    test('should find all quads when no filters provided', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      
      const results = [...await populatedGraph.find()];
      
      expect(results.length).toBe(3);
    });

    test('should return empty results when no matches found', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      
      const results = [...await populatedGraph.find(EX.nonexistent)];
      
      expect(results.length).toBe(0);
    });

    test('should return empty results when finding in empty graph', async () => {
      const graph = await createGraph();
      
      const results = [...await graph.find()];
      
      expect(results.length).toBe(0);
    });

    test('should handle null parameters correctly', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      
      // Test with explicit null values
      const results = [...await populatedGraph.find(null, null, null, null)];
      
      expect(results.length).toBe(3);
    });
  });
}

/**
 * Generic test suite for MutableGraph interface
 */
export function testMutableGraphInterface<G extends MutableGraph<any>>(
  name: string,
  createGraph: () => Promise<G>
) {
  describe(`${name} - MutableGraph Interface`, () => {
    test('should add quads and return self', async () => {
      const graph = await createGraph();
      
      const result = await graph.add(testQuads);
      expect(result as any).toBe(graph); // Should return same instance
      
      const quads = [...await graph.quads()];
      expect(quads.length).toBe(3);
    });

    test('should remove quads and return self', async () => {
      const graph = await createGraph();
      await graph.add(testQuads);
      
      const result = await graph.remove([testQuads[0]]);
      expect(result as any).toBe(graph); // Should return same instance
      
      const quads = [...await graph.quads()];
      expect(quads.length).toBe(2);
    });

    test('should handle adding duplicate quads', async () => {
      const graph = await createGraph();
      
      await graph.add([testQuads[0]]);
      await graph.add([testQuads[0]]); // Add same quad again
      
      const quads = [...await graph.quads()];
      expect(quads.length).toBe(1); // Should not duplicate
    });

    test('should handle removing non-existent quads', async () => {
      const graph = await createGraph();
      await graph.add([testQuads[0]]);
      
      await graph.remove([testQuads[1]]); // Remove quad that's not there
      
      const quads = [...await graph.quads()];
      expect(quads.length).toBe(1); // Should remain unchanged
    });
  });
}

/**
 * Generic test suite for ImmutableGraph interface
 */
export function testImmutableGraphInterface<G extends ImmutableGraph<any>>(
  name: string,
  createGraph: () => Promise<G>
) {
  describe(`${name} - ImmutableGraph Interface`, () => {
    test('should add quads and return new instance', async () => {
      const graph = await createGraph();
      
      const newGraph = await graph.add(testQuads);
      expect(newGraph).not.toBe(graph); // Should return new instance
      
      const originalQuads = [...await graph.quads()];
      const newQuads = [...await newGraph.quads()];
      
      expect(originalQuads.length).toBe(0);
      expect(newQuads.length).toBe(3);
    });

    test('should remove quads and return new instance', async () => {
      const graph = await createGraph();
      const populatedGraph = await graph.add(testQuads);
      
      const newGraph = await populatedGraph.remove([testQuads[0]]);
      expect(newGraph).not.toBe(populatedGraph); // Should return new instance
      
      const originalQuads = [...await populatedGraph.quads()];
      const newQuads = [...await newGraph.quads()];
      
      expect(originalQuads.length).toBe(3);
      expect(newQuads.length).toBe(2);
    });

    test('should handle chained operations', async () => {
      const graph = await createGraph();

      const g1 = await graph.add([testQuads[0], testQuads[1]]);
      const g2 = await g1.add([testQuads[2]]);
      const result = await g2.remove([testQuads[1]]);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(2);
      
      // Original graph should remain empty
      const originalQuads = [...await graph.quads()];
      expect(originalQuads.length).toBe(0);
    });

    test('should preserve immutability during concurrent operations', async () => {
      const graph = await createGraph();
      const baseGraph = await graph.add([testQuads[0]]);
      
      // Perform concurrent operations
      const [graph1, graph2] = await Promise.all([
        baseGraph.add([testQuads[1]]),
        baseGraph.add([testQuads[2]])
      ]);
      
      const baseQuads = [...await baseGraph.quads()];
      const quads1 = [...await graph1.quads()];
      const quads2 = [...await graph2.quads()];
      
      expect(baseQuads.length).toBe(1);
      expect(quads1.length).toBe(2);
      expect(quads2.length).toBe(2);
      
      // Each should have different second quad
      expect(quads1.find(q => q.subject.equals(EX.alice) && q.predicate.equals(EX.age))).toBeDefined();
      expect(quads2.find(q => q.subject.equals(EX.bob))).toBeDefined();
    });
  });
}



// Concrete implementation tests
testGraphInterface(
  'N3Graph',
  async () => new N3Graph(),
  async (graph, quads) => {
    await graph.add(quads);
    return graph;
  }
);

testMutableGraphInterface(
  'N3Graph',
  async () => new N3Graph()
);

testGraphInterface(
  'ImmutableSetGraph',
  async () => new ImmutableSetGraph(),
  async (graph, quads) => {
    // For immutable graphs, return a new instance with quads
    return await graph.add(quads);
  }
);

testImmutableGraphInterface(
  'ImmutableSetGraph',
  async () => new ImmutableSetGraph()
);

/**
 * Generic test suite for withIri method
 */
export function testWithIriMethod<G extends Graph<any>>(
  name: string,
  createGraph: () => Promise<G>,
  setupGraph: (graph: G, quads: Quad[]) => Promise<G>
) {
  describe(`${name} - withIri method`, () => {
    test('should change the IRI of the graph', async () => {
      const graph = await createGraph();
      const newIri = EX.myGraph;

      const updatedGraph = graph.withIri(newIri);

      expect(updatedGraph.iri.equals(newIri)).toBe(true);
      expect(graph.iri).not.toBe(updatedGraph.iri); // Different IRI objects
    });

    test('should preserve graph content when changing IRI', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      const newIri = EX.newGraph;

      const updatedGraph = populatedGraph.withIri(newIri);

      const originalQuads = [...await populatedGraph.quads()];
      const updatedQuads = [...await updatedGraph.quads()];

      expect(updatedQuads.length).toBe(originalQuads.length);
    });

    test('should convert undefined to DefaultGraph', async () => {
      const graph = await createGraph();
      const updatedGraph = graph.withIri(undefined);

      expect(updatedGraph.iri.termType).toBe('DefaultGraph');
    });

    test('should return same type as original graph', async () => {
      const graph = await createGraph();
      const newIri = EX.anotherGraph;

      const updatedGraph = graph.withIri(newIri);

      expect(updatedGraph).toBeInstanceOf(graph.constructor);
    });

    test('should support chaining withIri calls', async () => {
      const graph = await createGraph();
      const iri1 = EX.graph1;
      const iri2 = EX.graph2;

      const g1 = graph.withIri(iri1);
      const g2 = g1.withIri(iri2);

      expect(g1.iri.equals(iri1)).toBe(true);
      expect(g2.iri.equals(iri2)).toBe(true);
    });

    test('should not affect original graph when changing IRI', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      const originalIri = populatedGraph.iri;
      const newIri = EX.different;

      const updatedGraph = populatedGraph.withIri(newIri);

      // Original should remain unchanged
      expect(populatedGraph.iri).toBe(originalIri);
      expect(populatedGraph.iri.equals(updatedGraph.iri)).toBe(false);
    });
  });
}

/**
 * Generic test suite for withIri with data sharing (mutable graphs)
 */
export function testWithIriDataSharing<G extends Graph<any>>(
  name: string,
  createGraph: () => Promise<G>,
  setupGraph: (graph: G, quads: Quad[]) => Promise<G>,
  isMutable: boolean
) {
  if (!isMutable) return; // Skip for immutable graphs

  describe(`${name} - withIri data sharing`, () => {
    test('should share data between original and withIri graph (mutable)', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, [testQuads[0]]);

      const graphWithNewIri = populatedGraph.withIri(EX.newGraph);

      // Add to the new graph
      await graphWithNewIri.add([testQuads[1]]);

      // Both should have the new quad (shared data)
      const originalQuads = [...await populatedGraph.quads()];
      const newQuads = [...await graphWithNewIri.quads()];

      expect(originalQuads.length).toBe(2);
      expect(newQuads.length).toBe(2);
    });
  });
}

// Tests for withIri on N3Graph
testWithIriMethod(
  'N3Graph',
  async () => new N3Graph(),
  async (graph, quads) => {
    await graph.add(quads);
    return graph;
  }
);

testWithIriDataSharing(
  'N3Graph',
  async () => new N3Graph(),
  async (graph, quads) => {
    await graph.add(quads);
    return graph;
  },
  true // N3Graph is mutable
);

// Tests for withIri on ImmutableSetGraph
testWithIriMethod(
  'ImmutableSetGraph',
  async () => new ImmutableSetGraph(),
  async (graph, quads) => {
    return await graph.add(quads);
  }
);

testWithIriDataSharing(
  'ImmutableSetGraph',
  async () => new ImmutableSetGraph(),
  async (graph, quads) => {
    return await graph.add(quads);
  },
  false // ImmutableSetGraph is immutable
);

