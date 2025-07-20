import { test, expect, describe } from 'bun:test';
import { resource as makeResource } from '../src/resource.js';
import { ChangeSetGraph } from '../src/graph/changeset.js';
import { ImmutableSetGraph } from '../src/graph/immutable.js';
import { factory, namespace } from '../src/rdf.js';

const EX = namespace('http://example.org/');
const FOAF = namespace('http://xmlns.com/foaf/0.1/');

describe('Blank Node Resources', () => {
  test('should create blank node resource via bnode() method', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const bnodeResource = changeset.bnode();

    expect(bnodeResource).toBeDefined();
    expect(bnodeResource.termType).toBe('BlankNode');
    expect(bnodeResource.value).toMatch(/^bnode_\d+$/); // Actual format used
  });

  test('should create blank node resource with custom prefix', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const bnodeResource = changeset.bnode('custom');

    expect(bnodeResource.termType).toBe('BlankNode');
    expect(bnodeResource.value).toMatch(/^custom/);
  });

  test('should set and get properties on blank node resources', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const person = changeset.bnode();

    person.set(FOAF.name, 'Anonymous Person');
    person.set(EX.age, 25);

    expect(person.get(FOAF.name)).toBe('Anonymous Person');
    expect(person.get(EX.age)).toBe(25);
  });

  test('should handle blank nodes as object values', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const alice = makeResource(changeset, EX.alice);
    const anonymousFriend = changeset.bnode();

    anonymousFriend.set(FOAF.name, 'Unknown Friend');
    alice.set(FOAF.knows, anonymousFriend);

    const friend = alice.get(FOAF.knows);
    expect(friend).toBeDefined();
    expect(friend.termType).toBe('BlankNode');
    expect(friend.get(FOAF.name)).toBe('Unknown Friend');
  });

  test('should support fluent chaining with blank nodes', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const person = changeset.bnode();

    const result = person
      .set(FOAF.name, 'Anonymous')
      .set(EX.age, 30)
      .set(EX.active, true);

    expect(result).toBe(person);
    expect(person.get(FOAF.name)).toBe('Anonymous');
    expect(person.get(EX.age)).toBe(30);
    expect(person.get(EX.active)).toBe(true);
  });

  test('should handle multiple blank nodes independently', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const person1 = changeset.bnode();
    const person2 = changeset.bnode();

    person1.set(FOAF.name, 'Person One');
    person2.set(FOAF.name, 'Person Two');

    expect(person1.get(FOAF.name)).toBe('Person One');
    expect(person2.get(FOAF.name)).toBe('Person Two');
    expect(person1.value).not.toBe(person2.value);
  });

  test('should support getAll with blank nodes', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const person = changeset.bnode();
    const friend1 = changeset.bnode();
    const friend2 = changeset.bnode();

    friend1.set(FOAF.name, 'Friend One');
    friend2.set(FOAF.name, 'Friend Two');

    person.setAll(FOAF.knows, [friend1, friend2]);

    const friends = [...person.getAll(FOAF.knows)];
    expect(friends).toHaveLength(2);
    expect(friends.every(f => f.termType === 'BlankNode')).toBe(true);
    
    const friendNames = friends.map(f => f.get(FOAF.name)).sort();
    expect(friendNames).toEqual(['Friend One', 'Friend Two']);
  });

  test('should check has() with blank node properties', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const person = changeset.bnode();

    expect(person.has(FOAF.name)).toBe(false);

    person.set(FOAF.name, 'Anonymous');
    expect(person.has(FOAF.name)).toBe(true);
  });

  test('should delete properties from blank nodes', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const person = changeset.bnode();

    person.set(FOAF.name, 'Anonymous');
    expect(person.has(FOAF.name)).toBe(true);

    person.delete(FOAF.name);
    expect(person.has(FOAF.name)).toBe(false);
  });

  test('should iterate entries for blank nodes', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const person = changeset.bnode();

    person.set(FOAF.name, 'Anonymous');
    person.set(EX.age, 25);

    const entries = [...person.entries()];
    expect(entries).toHaveLength(2);

    const nameEntry = entries.find(([pred]) => pred.equals(FOAF.name));
    const ageEntry = entries.find(([pred]) => pred.equals(EX.age));
    
    expect(nameEntry?.[1]).toBe('Anonymous');
    expect(ageEntry?.[1]).toBe(25);
  });

  test('should handle blank node equality correctly', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const bnode = factory.blankNode('test');
    const resource1 = makeResource(changeset, bnode);
    const resource2 = makeResource(changeset, bnode);

    expect(resource1.equals(resource2)).toBe(true);
    expect(resource1.equals(bnode)).toBe(true);

    const differentBnode = factory.blankNode('other');
    const resource3 = makeResource(changeset, differentBnode);
    expect(resource1.equals(resource3)).toBe(false);
  });

  test('should handle mixed named nodes and blank nodes', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const alice = makeResource(changeset, EX.alice);
    const anonymousFriend = changeset.bnode();
    const bob = makeResource(changeset, EX.bob);

    alice.set(FOAF.name, 'Alice');
    anonymousFriend.set(FOAF.name, 'Unknown');
    bob.set(FOAF.name, 'Bob');

    alice.setAll(FOAF.knows, [anonymousFriend, bob]);

    const friends = [...alice.getAll(FOAF.knows)];
    expect(friends).toHaveLength(2);

    const friendTypes = friends.map(f => f.termType).sort();
    expect(friendTypes).toEqual(['BlankNode', 'NamedNode']);
  });

  test('should work with changeset resource() method for blank nodes', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const bnode = factory.blankNode('test');
    const resource = changeset.resource(bnode);

    expect(resource.termType).toBe('BlankNode');
    expect(resource.value).toBe('test');

    resource.set(FOAF.name, 'Test Person');
    expect(resource.get(FOAF.name)).toBe('Test Person');
  });
});
