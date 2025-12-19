import { test, expect, describe } from 'bun:test';
import { TransactionalGraph } from '../src/graph.js';
import { factory, namespace } from '../src/rdf.js';
import type { Quad } from '../src/rdf.js';
import { ChangeSetGraph } from '../src/graph/changeset.js';
import { ImmutableSetGraph } from '../src/graph/immutable.js';

const EX = namespace('http://example.org/');
const XSD = namespace('http://www.w3.org/2001/XMLSchema#');

// Test data
const testQuads = [
  factory.quad(EX.alice, EX.knows, EX.bob),
  factory.quad(EX.alice, EX.age, factory.literal('30', XSD.integer)),
  factory.quad(EX.bob, EX.name, factory.literal('Bob Smith', 'en'))
];

/**
 * Generic test suite for TransactionalGraph interface
 */
export function testTransactionalGraphInterface<G extends TransactionalGraph<any>>(
  name: string,
  createGraph: () => Promise<G>,
  cleanupGraph?: (graph: G) => Promise<void>
) {
  describe(`${name} - TransactionalGraph Interface`, () => {
    test('should begin, commit, and rollback transactions', async () => {
      const graph = await createGraph();
      if (cleanupGraph) await cleanupGraph(graph);

      // Begin transaction
      await graph.begin();

      // Add data in transaction
      await graph.add([testQuads[0]]);

      // Commit transaction
      await graph.commit();

      // Data should be persisted
      const quads = [...await graph.quads()];
      const addedQuad = quads.find(quad =>
          quad.subject.value === testQuads[0].subject.value &&
          quad.predicate.value === testQuads[0].predicate.value &&
          quad.object.value === testQuads[0].object.value
      );
      expect(addedQuad).toBeDefined();
    });

    test('should rollback transactions properly', async () => {
      const graph = await createGraph();
      if (cleanupGraph) await cleanupGraph(graph);

      // Begin transaction
      await graph.begin();

      // Add data in transaction
      const testQuad = factory.quad(EX['rollback-test'], EX.property, factory.literal('rollback value'));
      await graph.add([testQuad]);

      // Rollback transaction
      await graph.rollback();

      // Data should not be persisted
      const quads = [...await graph.quads()];
      const rolledBackQuad = quads.find(quad =>
          quad.subject.equals(EX['rollback-test']) &&
          quad.predicate.equals(EX.property) &&
          quad.object.value === 'rollback value'
      );
      expect(rolledBackQuad).toBeUndefined();
    });

    test('should handle transaction state properly', async () => {
      const graph = await createGraph();
      if (cleanupGraph) await cleanupGraph(graph);

      // Should throw if trying to commit without begin
      await expect(graph.commit()).rejects.toThrow();

      // Should throw if trying to rollback without begin
      await expect(graph.rollback()).rejects.toThrow();
    });

    test('should see changes within transaction scope', async () => {
      const graph = await createGraph();
      if (cleanupGraph) await cleanupGraph(graph);

      // Begin transaction
      await graph.begin();

      // Add some data in transaction
      const testQuad = factory.quad(EX.test, EX.property, factory.literal('test value'));

      await graph.add([testQuad]);

      // Data should be visible within transaction
      const quadsInTx = [...await graph.quads()];

      // Check that our new quad exists in the transaction
      const ourQuad = quadsInTx.find(quad =>
          quad.subject.equals(EX.test) &&
          quad.predicate.equals(EX.property) &&
          quad.object.value === 'test value'
      );

      expect(ourQuad).toBeDefined();
      expect(ourQuad?.subject.value).toBe(EX.test.value);
      expect(ourQuad?.predicate.value).toBe(EX.property.value);
      expect(ourQuad?.object.value).toBe('test value');

      // Rollback transaction
      await graph.rollback();

      // Data should be gone after rollback
      const quadsAfterRollback = [...await graph.quads()];
      const quadAfterRollback = quadsAfterRollback.find(quad =>
          quad.subject.equals(EX.test) &&
          quad.predicate.equals(EX.property) &&
          quad.object.value === 'test value'
      );

      expect(quadAfterRollback).toBeUndefined();
    });

    test('should commit transactions properly', async () => {
      const graph = await createGraph();
      if (cleanupGraph) await cleanupGraph(graph);

      await graph.begin();

      const testQuad = factory.quad(EX.committed, EX.property, factory.literal('committed value'));

      await graph.add([testQuad]);
      await graph.commit();

      // Data should persist after commit
      const quads = [...await graph.quads()];
      const committedQuad = quads.find(quad =>
          quad.subject.equals(EX.committed) &&
          quad.predicate.equals(EX.property) &&
          quad.object.value === 'committed value'
      );

      expect(committedQuad).toBeDefined();
      expect(committedQuad?.object.value).toBe('committed value');
    });

    test('should handle operations without explicit transactions', async () => {
      const graph = await createGraph();
      if (cleanupGraph) await cleanupGraph(graph);

      const testQuadsForAuto = [
        factory.quad(EX.auto1, EX.property, factory.literal('auto value 1')),
        factory.quad(EX.auto2, EX.property, factory.literal('auto value 2'))
      ];

      // Operations should auto-create and commit transactions
      await graph.add(testQuadsForAuto);

      const quads = [...await graph.quads()];
      const auto1 = quads.find(quad => quad.object.value === 'auto value 1');
      const auto2 = quads.find(quad => quad.object.value === 'auto value 2');

      expect(auto1).toBeDefined();
      expect(auto2).toBeDefined();

      // Remove one quad
      await graph.remove([testQuadsForAuto[0]]);

      const quadsAfterRemove = [...await graph.quads()];
      const removedQuad = quadsAfterRemove.find(quad => quad.object.value === 'auto value 1');
      const remainingQuad = quadsAfterRemove.find(quad => quad.object.value === 'auto value 2');

      expect(removedQuad).toBeUndefined();
      expect(remainingQuad).toBeDefined();
    });

    test('should DELETE data that was ADDed in the same transaction', async () => {
      const graph = await createGraph();
      if (cleanupGraph) await cleanupGraph(graph);

      try {

        await graph.begin();

        console.log("graph IRI:" + graph.iri.value);

        // ADD a quad with EXPLICIT graph component (matching necromancy test structure)
        const graphNode = graph.iri;
        const node = EX.exampleNode;
        const quad = factory.quad(
           node,
            EX.definition,
            factory.literal('test definition sparql'),
            graphNode  // Explicit graph component - this is key!
        );
        await graph.add([quad]);

        // Verify it exists within the transaction using SPARQL SELECT
        const afterAdd = await graph.select(
            `SELECT ?def WHERE { <${node.value}> <${EX.definition.value}> ?def }`
        );
        const afterAddResults = [...afterAdd];
        expect(afterAddResults.length).toBe(1);

        // DELETE the same quad within the same transaction
        await graph.remove([quad]);

        // Check within transaction using SPARQL SELECT - DELETE should remove the data
        const afterDelete = await graph.select(
            `SELECT ?def WHERE { <${node.value}> <${EX.definition.value}> ?def }`
        );

        const afterDeleteResults = [...afterDelete];
        expect(afterDeleteResults.length).toBe(0);

        await graph.commit();

        // After commit - the data should be gone
        const afterCommit = await graph.select(
            `SELECT ?def WHERE { <${node.value}> <${EX.definition.value}> ?def }`
        );
        const afterCommitResults = [...afterCommit];
        expect(afterCommitResults.length).toBe(0);

      } finally {
        try { await graph.rollback() } catch(e) { }
      }
    });


  });

}