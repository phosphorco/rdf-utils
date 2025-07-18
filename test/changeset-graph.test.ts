import { test, expect, describe } from 'bun:test';
import { factory, namespace } from '../src/rdf.js';
import { ChangeSetGraph } from '../src/graph/changeset.js';
import { ImmutableSetGraph } from '../src/graph/immutable.js';
import { is } from 'immutable';

const EX = namespace('http://example.org/');

// Tests for ChangeSetGraph delta tracking features
describe('ChangeSetGraph - added() and removed() methods', () => {
  test('should return empty sets when no changes have been made', () => {
    const baseGraph = new ImmutableSetGraph(EX.test);
    const changesetGraph = new ChangeSetGraph(baseGraph);
    
    const added = changesetGraph.added();
    const removed = changesetGraph.removed();
    
    expect(added.size).toBe(0);
    expect(removed.size).toBe(0);
  });

  test('should track added quads immediately', () => {
    const baseGraph = new ImmutableSetGraph(EX.test);
    const changesetGraph = new ChangeSetGraph(baseGraph);
    
    const newQuad = factory.quad(EX.new, EX.property, factory.literal('new value'));
    
    changesetGraph.add([newQuad]);
    
    const added = changesetGraph.added();
    const removed = changesetGraph.removed();
    
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
    
    const added = changesetGraph.added();
    const removed = changesetGraph.removed();
    
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
    
    const added = changesetGraph.added();
    const removed = changesetGraph.removed();
    
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
    expect(changesetGraph.added().size).toBe(1);
    
    changesetGraph.add([quad2]);
    expect(changesetGraph.added().size).toBe(2);
    
    changesetGraph.remove([quad1]);
    expect(changesetGraph.added().size).toBe(1);
    expect(changesetGraph.removed().size).toBe(0);
    
    const addedQuad = [...changesetGraph.added()][0];
    expect(addedQuad.subject.value).toBe('http://example.org/second');
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
});
