import { test, expect, describe } from 'bun:test';
import { Resource } from '../src/resource.js';
import { ChangeSetGraph } from '../src/graph/changeset.js';
import { ImmutableSetGraph } from '../src/graph/immutable.js';
import { factory, namespace } from '../src/rdf.js';

const EX = namespace('http://example.org/');
const FOAF = namespace('http://xmlns.com/foaf/0.1/');

describe('Resource', () => {
  test('should create a Resource with changeset and subject', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const resource = new Resource(changeset, EX.alice);
    
    expect(resource).toBeDefined();
  });

  test('should set and get string values', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const resource = new Resource(changeset, EX.alice);
    
    resource.set(FOAF.name, 'Alice Smith');
    const name = resource.get(FOAF.name);
    
    expect(name).toBe('Alice Smith');
  });

  test('should set and get number values', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const resource = new Resource(changeset, EX.alice);
    
    resource.set(EX.age, 30);
    const age = resource.get(EX.age);
    
    expect(age).toBe(30);
  });

  test('should set and get boolean values', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const resource = new Resource(changeset, EX.alice);
    
    resource.set(EX.active, true);
    const active = resource.get(EX.active);
    
    expect(active).toBe(true);
  });

  test('should set and get Date values', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const resource = new Resource(changeset, EX.alice);
    
    const date = new Date('2023-01-01T00:00:00Z');
    resource.set(EX.created, date);
    const created = resource.get(EX.created);
    
    expect(created).toEqual(date);
  });

  test('should set and get NamedNode values as Resources', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const resource = new Resource(changeset, EX.alice);
    
    resource.set(FOAF.knows, EX.bob);
    const friend = resource.get(FOAF.knows);
    
    expect(friend).toBeInstanceOf(Resource);
  });

  test('should support fluent chaining', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const resource = new Resource(changeset, EX.alice);
    
    const result = resource
      .set(FOAF.name, 'Alice Smith')
      .set(EX.age, 30)
      .set(EX.active, true);
    
    expect(result).toBe(resource);
    expect(resource.get(FOAF.name)).toBe('Alice Smith');
    expect(resource.get(EX.age)).toBe(30);
    expect(resource.get(EX.active)).toBe(true);
  });

  test('should setAll and getAll multiple values', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const resource = new Resource(changeset, EX.alice);
    
    resource.setAll(EX.skill, ['TypeScript', 'RDF', 'SPARQL']);
    const skills = [...resource.getAll(EX.skill)];
    
    expect(skills).toEqual(['TypeScript', 'RDF', 'SPARQL']);
  });

  test('should check if property exists with has()', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const resource = new Resource(changeset, EX.alice);
    
    expect(resource.has(FOAF.name)).toBe(false);
    
    resource.set(FOAF.name, 'Alice Smith');
    expect(resource.has(FOAF.name)).toBe(true);
  });

  test('should delete properties', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const resource = new Resource(changeset, EX.alice);
    
    resource.set(FOAF.name, 'Alice Smith');
    expect(resource.has(FOAF.name)).toBe(true);
    
    resource.delete(FOAF.name);
    expect(resource.has(FOAF.name)).toBe(false);
  });

  test('should replace existing values when setting', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const resource = new Resource(changeset, EX.alice);
    
    resource.set(FOAF.name, 'Alice Smith');
    resource.set(FOAF.name, 'Alice Johnson');
    
    expect(resource.get(FOAF.name)).toBe('Alice Johnson');
  });

  test('should iterate over entries', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const resource = new Resource(changeset, EX.alice);
    
    resource.set(FOAF.name, 'Alice Smith');
    resource.set(EX.age, 30);
    
    const entries = [...resource.entries()];
    expect(entries).toHaveLength(2);
    
    const nameEntry = entries.find(([pred]) => pred.equals(FOAF.name));
    const ageEntry = entries.find(([pred]) => pred.equals(EX.age));
    
    expect(nameEntry?.[1]).toBe('Alice Smith');
    expect(ageEntry?.[1]).toBe(30);
  });

  test('should create Resource with static with() method', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const alice = new Resource(changeset, EX.alice);
    
    const bob = Resource.with(alice, EX.bob);
    
    expect(bob).toBeInstanceOf(Resource);
    expect(bob).not.toBe(alice);
  });

  test('should handle decimal numbers correctly', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const resource = new Resource(changeset, EX.alice);
    
    resource.set(EX.score, 95.5);
    const score = resource.get(EX.score);
    
    expect(score).toBe(95.5);
  });

  test('should return undefined for non-existent properties', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const resource = new Resource(changeset, EX.alice);
    
    expect(resource.get(FOAF.name)).toBeUndefined();
  });

  test('should return empty iterable for non-existent properties with getAll', () => {
    const changeset = new ChangeSetGraph(new ImmutableSetGraph());
    const resource = new Resource(changeset, EX.alice);
    
    const results = [...resource.getAll(EX.skill)];
    expect(results).toEqual([]);
  });
});