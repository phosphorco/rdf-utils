import { test, expect, describe } from 'bun:test';
import { factory, namespace } from '../src/rdf.js';
import { ChangeSetGraph } from '../src/graph/changeset.js';
import { ImmutableSetGraph } from '../src/graph/immutable.js';
import { is } from 'immutable';

// Create default graph
const defaultGraph = factory.defaultGraph();

const EX = namespace('http://example.org/');

// Tests for ChangeSetGraph delta tracking features
describe('ChangeSetGraph - added() and removed() methods', () => {
  test('should return empty sets when no changes have been made', () => {
    const baseGraph = new ImmutableSetGraph(EX.test);
    const changesetGraph = new ChangeSetGraph(baseGraph);
    
    const added = changesetGraph.added;
    const removed = changesetGraph.removed;
    
    expect(added.size).toBe(0);
    expect(removed.size).toBe(0);
  });

  test('should track added quads immediately', () => {
    const baseGraph = new ImmutableSetGraph(EX.test);
    const changesetGraph = new ChangeSetGraph(baseGraph);
    
    const newQuad = factory.quad(EX.new, EX.property, factory.literal('new value'));
    
    changesetGraph.add([newQuad]);
    
    const added = changesetGraph.added;
    const removed = changesetGraph.removed;
    
    expect(added.size).toBe(1);
    expect(removed.size).toBe(0);
    
    const addedQuad = [...added][0];
    expect(addedQuad.subject.value).toBe('http://example.org/new');
    expect(addedQuad.predicate.value).toBe('http://example.org/property');
    expect(addedQuad.object.value).toBe('new value');
  });

  test('should track removed quads immediately', () => {
    const baseGraph = new ImmutableSetGraph(EX.test);
    const existingQuad = factory.quad(EX.existing, EX.property, factory.literal('existing value'));
    const baseWithData = baseGraph.add([existingQuad]);
    
    const changesetGraph = new ChangeSetGraph(baseWithData);
    
    changesetGraph.remove([existingQuad]);
    
    const added = changesetGraph.added;
    const removed = changesetGraph.removed;
    
    expect(added.size).toBe(0);
    expect(removed.size).toBe(1);
    
    const removedQuad = [...removed][0];
    expect(removedQuad.subject.value).toBe('http://example.org/existing');
    expect(removedQuad.predicate.value).toBe('http://example.org/property');
    expect(removedQuad.object.value).toBe('existing value');
  });

  test('should track both added and removed quads', () => {
    const baseGraph = new ImmutableSetGraph(EX.test);
    const existingQuad = factory.quad(EX.existing, EX.property, factory.literal('existing value'));
    const baseWithData = baseGraph.add([existingQuad]);
    
    const changesetGraph = new ChangeSetGraph(baseWithData);
    
    changesetGraph.remove([existingQuad]);
    
    const newQuad = factory.quad(EX.new, EX.property, factory.literal('new value'));
    changesetGraph.add([newQuad]);
    
    const added = changesetGraph.added;
    const removed = changesetGraph.removed;
    
    expect(added.size).toBe(1);
    expect(removed.size).toBe(1);
    
    const addedQuad = [...added][0];
    expect(addedQuad.subject.value).toBe('http://example.org/new');
    
    const removedQuad = [...removed][0];
    expect(removedQuad.subject.value).toBe('http://example.org/existing');
  });

  test('should track cumulative changes from original state', () => {
    const baseGraph = new ImmutableSetGraph(EX.test);
    const changesetGraph = new ChangeSetGraph(baseGraph);
    
    const quad1 = factory.quad(EX.first, EX.property, factory.literal('first value'));
    const quad2 = factory.quad(EX.second, EX.property, factory.literal('second value'));
    
    changesetGraph.add([quad1]);
    expect(changesetGraph.added.size).toBe(1);
    
    changesetGraph.add([quad2]);
    expect(changesetGraph.added.size).toBe(2);
    
    changesetGraph.remove([quad1]);
    expect(changesetGraph.added.size).toBe(1);
    expect(changesetGraph.removed.size).toBe(0);
    
    const addedQuad = [...changesetGraph.added][0];
    expect(addedQuad.subject.value).toBe('http://example.org/second');
  });
});

describe('ChangeSetGraph - constructor with graph IRI', () => {
  test('should accept a NamedNode as graph IRI', () => {
    const graphIRI = EX.namedGraph;
    const changesetGraph = new ChangeSetGraph(graphIRI);

    expect(changesetGraph.iri).toBe(graphIRI);
    expect(changesetGraph.added.size).toBe(0);
    expect(changesetGraph.removed.size).toBe(0);
  });

  test('should track changes when initialized with graph IRI', () => {
    const graphIRI = EX.namedGraph;
    const changesetGraph = new ChangeSetGraph(graphIRI);

    const newQuad = factory.quad(EX.subject, EX.predicate, factory.literal('value'));
    changesetGraph.add([newQuad]);

    expect(changesetGraph.added.size).toBe(1);
    expect(changesetGraph.removed.size).toBe(0);
  });

  test('should accept DefaultGraph as graph target', () => {
    const changesetGraph = new ChangeSetGraph(defaultGraph);

    expect(changesetGraph.iri.termType).toBe('DefaultGraph');
    expect(changesetGraph.added.size).toBe(0);
    expect(changesetGraph.removed.size).toBe(0);
  });

  test('should track changes when initialized with DefaultGraph', () => {
    const changesetGraph = new ChangeSetGraph(defaultGraph);

    const newQuad = factory.quad(EX.subject, EX.predicate, factory.literal('value'));
    changesetGraph.add([newQuad]);

    expect(changesetGraph.added.size).toBe(1);
    expect(changesetGraph.removed.size).toBe(0);
  });
});

describe('ChangeSetGraph - applyDelta() method', () => {
  test('should apply delta to create identical graph when no changes', async () => {
    const originalGraph = new ImmutableSetGraph(EX.test);
    const changesetGraph = new ChangeSetGraph(originalGraph);

    const resultGraph = await changesetGraph.applyDelta(originalGraph);

    expect(is(resultGraph.data, changesetGraph.current.data)).toBe(true);
  });

  test('should apply delta to create identical graph with additions', async () => {
    const originalGraph = new ImmutableSetGraph(EX.test);
    const changesetGraph = new ChangeSetGraph(originalGraph);
    
    const newQuad = factory.quad(EX.subject, EX.predicate, factory.literal('object value'));
    
    changesetGraph.add([newQuad]);
    
    const resultGraph = await changesetGraph.applyDelta(originalGraph);
    
    expect(is(resultGraph.data, changesetGraph.current.data)).toBe(true);
  });

  test('should apply delta to create identical graph with removals', async () => {
    const existingQuad = factory.quad(EX.existing, EX.property, factory.literal('existing value'));
    
    const originalGraph = new ImmutableSetGraph(EX.test);
    const originalWithData = originalGraph.add([existingQuad]);
    const changesetGraph = new ChangeSetGraph(originalWithData);
    
    changesetGraph.remove([existingQuad]);
    
    const resultGraph = await changesetGraph.applyDelta(originalWithData);
    
    expect(is(resultGraph.data, changesetGraph.current.data)).toBe(true);
  });

  test('should apply delta to create identical graph with both additions and removals', async () => {
    const existingQuad = factory.quad(EX.existing, EX.property, factory.literal('existing value'));
    
    const originalGraph = new ImmutableSetGraph(EX.test);
    const originalWithData = originalGraph.add([existingQuad]);
    const changesetGraph = new ChangeSetGraph(originalWithData);
    
    changesetGraph.remove([existingQuad]);
    
    const newQuad = factory.quad(EX.new, EX.property, factory.literal('new value'));
    changesetGraph.add([newQuad]);
    
    const resultGraph = await changesetGraph.applyDelta(originalWithData);
    
    expect(is(resultGraph.data, changesetGraph.current.data)).toBe(true);
  });

  test('should apply delta to create identical graph with complex changes', async () => {
    const quad1 = factory.quad(EX.subject1, EX.property, factory.literal('value1'));
    const quad2 = factory.quad(EX.subject2, EX.property, factory.literal('value2'));
    const quad3 = factory.quad(EX.subject3, EX.property, factory.literal('value3'));

    const originalGraph = new ImmutableSetGraph(EX.test);
    const originalWithData = originalGraph.add([quad1, quad2]);
    const changesetGraph = new ChangeSetGraph(originalWithData);

    changesetGraph.remove([quad1]);
    changesetGraph.add([quad3]);

    const resultGraph = await changesetGraph.applyDelta(originalWithData);

    expect(is(resultGraph.data, changesetGraph.current.data)).toBe(true);
  });

  test('should remap graph component when graph IRI is provided', async () => {
    const targetGraphIRI = EX.myNamedGraph;
    const changesetGraph = new ChangeSetGraph(targetGraphIRI);

    const quad1 = factory.quad(EX.subject1, EX.property, factory.literal('value1'));
    const quad2 = factory.quad(EX.subject2, EX.property, factory.literal('value2'));

    changesetGraph.add([quad1, quad2]);

    const targetGraph = new ImmutableSetGraph(EX.otherGraph);
    const resultGraph = await changesetGraph.applyDelta(targetGraph);

    // Check that quads were added with the target graph IRI
    const quads = [...resultGraph.quads()];
    expect(quads.length).toBe(2);

    for (const quad of quads) {
      expect(quad.graph.equals(targetGraphIRI)).toBe(true);
    }
  });

  test('should remap graph component for removals when graph IRI is provided', async () => {
    const targetGraphIRI = EX.myNamedGraph;

    // Create a base graph with a quad in the target graph
    const baseGraph = new ImmutableSetGraph(EX.baseGraph);
    const quad = factory.quad(EX.subject, EX.predicate, factory.literal('value'), targetGraphIRI);
    const baseWithData = baseGraph.add([quad]);

    // Create a changeset with graph IRI and remove the quad
    const changesetGraph = new ChangeSetGraph(targetGraphIRI);

    // Add a quad with default graph that should be remapped to targetGraphIRI for removal
    const quadToRemove = factory.quad(EX.subject, EX.predicate, factory.literal('value'));
    changesetGraph.remove([quadToRemove]);

    const resultGraph = await changesetGraph.applyDelta(baseWithData);

    // The quad should be removed (because it's remapped to have the target graph IRI)
    const quads = [...resultGraph.quads()];
    expect(quads.length).toBe(0);
  });

  test('should work with both additions and removals when graph IRI is provided', async () => {
    const targetGraphIRI = EX.myNamedGraph;
    const changesetGraph = new ChangeSetGraph(targetGraphIRI);

    // Create base graph with data
    const existingQuad = factory.quad(EX.existing, EX.property, factory.literal('existing'), targetGraphIRI);
    const baseGraph = new ImmutableSetGraph(EX.baseGraph);
    const baseWithData = baseGraph.add([existingQuad]);

    // Create another quad to remove with default graph (will be remapped to target graph)
    const quadToRemove = factory.quad(EX.existing, EX.property, factory.literal('existing'));
    changesetGraph.remove([quadToRemove]);

    const newQuad = factory.quad(EX.new, EX.property, factory.literal('new'));
    changesetGraph.add([newQuad]);

    const resultGraph = await changesetGraph.applyDelta(baseWithData);

    const quads = [...resultGraph.quads()];
    expect(quads.length).toBe(1);

    const resultQuad = quads[0];
    expect(resultQuad.subject.equals(EX.new)).toBe(true);
    expect(resultQuad.graph.equals(targetGraphIRI)).toBe(true);
  });

  test('should remap graph component to DefaultGraph when provided', async () => {
    const changesetGraph = new ChangeSetGraph(defaultGraph);

    const quad1 = factory.quad(EX.subject1, EX.property, factory.literal('value1'));
    const quad2 = factory.quad(EX.subject2, EX.property, factory.literal('value2'));

    changesetGraph.add([quad1, quad2]);

    // Create target graph with defaultGraph as its IRI so DefaultGraph quads stay as DefaultGraph
    const targetGraph = new ImmutableSetGraph(defaultGraph);
    const resultGraph = await changesetGraph.applyDelta(targetGraph);

    // Check that quads were added with DefaultGraph
    const quads = [...resultGraph.quads()];
    expect(quads.length).toBe(2);

    for (const quad of quads) {
      expect(quad.graph.termType).toBe('DefaultGraph');
    }
  });

  test('should remap graph component for removals when DefaultGraph is provided', async () => {
    // Create a base graph with quads in the default graph
    const baseGraph = new ImmutableSetGraph(EX.baseGraph);
    const quad = factory.quad(EX.subject, EX.predicate, factory.literal('value'), defaultGraph);
    const baseWithData = baseGraph.add([quad]);

    // Create a changeset with DefaultGraph target and remove the quad
    const changesetGraph = new ChangeSetGraph(defaultGraph);
    const quadToRemove = factory.quad(EX.subject, EX.predicate, factory.literal('value'));
    changesetGraph.remove([quadToRemove]);

    const resultGraph = await changesetGraph.applyDelta(baseWithData);

    // The quad should be removed (because it's remapped to have the default graph)
    const quads = [...resultGraph.quads()];
    expect(quads.length).toBe(0);
  });

  test('should work with both additions and removals when DefaultGraph is provided', async () => {
    const changesetGraph = new ChangeSetGraph(defaultGraph);

    // Create base graph with defaultGraph as its IRI and add data
    const existingQuad = factory.quad(EX.existing, EX.property, factory.literal('existing'), defaultGraph);
    const baseGraph = new ImmutableSetGraph(defaultGraph);
    const baseWithData = baseGraph.add([existingQuad]);

    // Create another quad to remove with default graph
    const quadToRemove = factory.quad(EX.existing, EX.property, factory.literal('existing'));
    changesetGraph.remove([quadToRemove]);

    const newQuad = factory.quad(EX.new, EX.property, factory.literal('new'));
    changesetGraph.add([newQuad]);

    const resultGraph = await changesetGraph.applyDelta(baseWithData);

    const quads = [...resultGraph.quads()];
    expect(quads.length).toBe(1);

    const resultQuad = quads[0];
    expect(resultQuad.subject.equals(EX.new)).toBe(true);
    expect(resultQuad.graph.termType).toBe('DefaultGraph');
  });
});
