import { test, expect, describe } from 'bun:test';
import { skolemize } from '../src/graph.js';
import { ChangeSetGraph } from '../src/graph/changeset.js';
import { ImmutableSetGraph } from '../src/graph/immutable.js';
import { factory, namespace } from '../src/rdf.js';

const EX = namespace('http://example.org/');
const FOAF = namespace('http://xmlns.com/foaf/0.1/');

describe('skolemize', () => {
  test('should convert blank nodes to named nodes', async () => {
    const changeset = new ChangeSetGraph();
    const bnode = factory.blankNode('b1');

    // Add a triple with a blank node subject
    changeset.add([factory.quad(bnode, FOAF.name, factory.literal('Alice'))]);

    const result = await skolemize(changeset, 'skolem:');

    console.log("result:");
    console.log(result.toString())

    const quads = [...await result.quads()];
    
    expect(quads).toHaveLength(1);
    expect(quads[0].subject.termType).toBe('NamedNode');
    expect(quads[0].subject.value).toMatch(/^skolem:\d+$/);
    expect(quads[0].predicate).toEqual(FOAF.name);
    expect(quads[0].object).toEqual(factory.literal('Alice'));
  });

  test('should convert blank node objects to named nodes', async () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const bnode = factory.blankNode('b1');
    
    // Add a triple with a blank node object
    changeset.add([factory.quad(EX.alice, FOAF.knows, bnode)]);
    
    const result = await skolemize(changeset, 'skolem:');
    const quads = [...await result.quads()];
    
    expect(quads).toHaveLength(1);
    expect(quads[0].subject).toEqual(EX.alice);
    expect(quads[0].predicate).toEqual(FOAF.knows);
    expect(quads[0].object.termType).toBe('NamedNode');
    expect(quads[0].object.value).toMatch(/^skolem:\d+$/);
  });

  test('should handle multiple blank nodes with unique replacements', async () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const bnode1 = factory.blankNode('b1');
    const bnode2 = factory.blankNode('b2');
    
    changeset.add([
      factory.quad(bnode1, FOAF.name, factory.literal('Alice')),
      factory.quad(bnode2, FOAF.name, factory.literal('Bob')),
      factory.quad(bnode1, FOAF.knows, bnode2)
    ]);
    
    const result = await skolemize(changeset, 'skolem:');
    const quads = [...await result.quads()];
    
    expect(quads).toHaveLength(3);
    
    // All should be named nodes now
    const subjects = quads.map(q => q.subject).filter(s => s.termType === 'NamedNode');
    const objects = quads.map(q => q.object).filter(o => o.termType === 'NamedNode');
    
    expect(subjects).toHaveLength(3);
    expect(objects).toHaveLength(1);
    
    // The same blank node should map to the same named node
    const aliceQuads = quads.filter(q => 
      q.predicate.equals(FOAF.name) && 
      q.object.equals(factory.literal('Alice'))
    );
    const knowsQuads = quads.filter(q => q.predicate.equals(FOAF.knows));
    
    expect(aliceQuads[0].subject).toEqual(knowsQuads[0].subject);
  });

  test('should preserve named nodes unchanged', async () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const bnode = factory.blankNode('b1');
    
    changeset.add([
      factory.quad(EX.alice, FOAF.name, factory.literal('Alice')),
      factory.quad(bnode, FOAF.name, factory.literal('Bob')),
      factory.quad(EX.alice, FOAF.knows, bnode)
    ]);
    
    const result = await skolemize(changeset, 'skolem:');
    const quads = [...await result.quads()];
    
    // EX.alice should remain unchanged
    const aliceQuads = quads.filter(q => q.subject.equals(EX.alice));
    expect(aliceQuads).toHaveLength(2);
    expect(aliceQuads[0].subject).toEqual(EX.alice);
    expect(aliceQuads[1].subject).toEqual(EX.alice);
  });

  test('should incorporate graph IRI into prefix when present', async () => {
    const namedGraph = factory.namedNode('http://example.org/graph1');
    const changeset = new ChangeSetGraph(new ImmutableSetGraph(namedGraph));
    const bnode = factory.blankNode('b1');
    
    changeset.add([factory.quad(bnode, FOAF.name, factory.literal('Alice'))]);
    
    const result = await skolemize(changeset, 'skolem:');
    const quads = [...await result.quads()];
    
    expect(quads[0].subject.value).toMatch(/^http:\/\/example\.org\/graph1skolem:\d+$/);
  });

  test('should handle empty graphs', async () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    
    const result = await skolemize(changeset, 'skolem:');
    const quads = [...await result.quads()];
    
    expect(quads).toHaveLength(0);
  });

  test('should handle graphs with no blank nodes', async () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    
    changeset.add([
      factory.quad(EX.alice, FOAF.name, factory.literal('Alice')),
      factory.quad(EX.bob, FOAF.name, factory.literal('Bob')),
      factory.quad(EX.alice, FOAF.knows, EX.bob)
    ]);
    
    const result = await skolemize(changeset, 'skolem:');
    const quads = [...await result.quads()];
    
    // Should be identical to original
    expect(quads).toHaveLength(3);
    expect(quads.every(q => 
      q.subject.termType === 'NamedNode' && 
      (q.object.termType === 'NamedNode' || q.object.termType === 'Literal')
    )).toBe(true);
  });

  test('should generate unique identifiers across multiple calls', async () => {
    const changeset1 = new ChangeSetGraph(new ImmutableSetGraph());
    const changeset2 = new ChangeSetGraph(new ImmutableSetGraph());
    
    changeset1.add([factory.quad(factory.blankNode('b1'), FOAF.name, factory.literal('Alice'))]);
    changeset2.add([factory.quad(factory.blankNode('b1'), FOAF.name, factory.literal('Bob'))]);
    
    const result1 = await skolemize(changeset1, 'skolem:');
    const result2 = await skolemize(changeset2, 'skolem:');
    
    const quads1 = [...await result1.quads()];
    const quads2 = [...await result2.quads()];
    
    // Should have different skolem URIs even though blank node labels were the same
    expect(quads1[0].subject.value).not.toEqual(quads2[0].subject.value);
  });
});
