import { test, expect } from 'bun:test';
import { N3Graph } from '../src/graph/n3.js';
import { factory } from '../src/rdf.js';
import { writeFile, readFile, unlink } from 'fs/promises';

const testTurtle = `
@prefix ex: <http://example.org/> .
ex:subject ex:predicate "test value" .
ex:subject ex:hasNumber 42 .
`;

const testNTriples = `
<http://example.org/subject> <http://example.org/predicate> "test value" .
<http://example.org/subject> <http://example.org/hasNumber> "42"^^<http://www.w3.org/2001/XMLSchema#integer> .
`;

test('N3Graph toString() with default format', async () => {
  const graph = new N3Graph();
  
  // Add some test data
  await graph.add([
    factory.quad(
      factory.namedNode('http://example.org/subject'),
      factory.namedNode('http://example.org/predicate'),
      factory.literal('test value')
    )
  ]);
  
  const result = await graph.toString();
  expect(result).toContain('http://example.org/subject');
  expect(result).toContain('http://example.org/predicate');
  expect(result).toContain('test value');
});

test('N3Graph toString() with turtle format', async () => {
  const graph = new N3Graph();
  
  await graph.add([
    factory.quad(
      factory.namedNode('http://example.org/subject'),
      factory.namedNode('http://example.org/predicate'),
      factory.literal('test value')
    )
  ]);
  
  const result = await graph.toString('turtle');
  expect(result).toContain('<http://example.org/subject>');
  expect(result).toContain('<http://example.org/predicate>');
  expect(result).toContain('"test value"');
});

test('N3Graph static fromString() parsing', async () => {
  const graph = await N3Graph.fromString(testTurtle, 'turtle');
  
  const quads = [...await graph.quads()];
  expect(quads.length).toBe(2);
  
  const subjects = quads.map(q => q.subject.value);
  expect(subjects.every(s => s === 'http://example.org/subject')).toBe(true);
});

test('N3Graph static fromString()', async () => {
  const graph = await N3Graph.fromString(testTurtle, 'turtle');
  
  const quads = [...await graph.quads()];
  expect(quads.length).toBe(2);
});

test('N3Graph file operations', async () => {
  const testFile = 'test-output.ttl';
  
  try {
    // Create graph and add data
    const graph = new N3Graph();
    await graph.add([
      factory.quad(
        factory.namedNode('http://example.org/subject'),
        factory.namedNode('http://example.org/predicate'),
        factory.literal('test value')
      )
    ]);
    
    // Save to file
    await graph.saveToFile(testFile, 'turtle');
    
    // Verify file exists and has content
    const content = await readFile(testFile, 'utf8');
    expect(content).toContain('http://example.org/subject');
    
    // Load from file into new graph
    const newGraph = await N3Graph.fromFile(testFile);
    
    const quads = [...await newGraph.quads()];
    expect(quads.length).toBe(1);
    
    // Test static fromFile
    const graphFromFile = await N3Graph.fromFile(testFile);
    const quadsFromFile = [...await graphFromFile.quads()];
    expect(quadsFromFile.length).toBe(1);
    
  } finally {
    // Cleanup
    try {
      await unlink(testFile);
    } catch {}
  }
});

test('N3Graph round-trip serialization', async () => {
  const original = await N3Graph.fromString(testTurtle, 'turtle');
  const serialized = await original.toString('turtle');
  const roundTrip = await N3Graph.fromString(serialized, 'turtle');
  
  const originalQuads = [...await original.quads()];
  const roundTripQuads = [...await roundTrip.quads()];
  
  expect(roundTripQuads.length).toBe(originalQuads.length);
});

test('N3Graph round-trip to TTL file', async () => {
  const testFile = 'test-roundtrip.ttl';
  
  try {
    // Create original graph with test data
    const original = new N3Graph();
    await original.add([
      factory.quad(
        factory.namedNode('http://example.org/alice'),
        factory.namedNode('http://example.org/knows'),
        factory.namedNode('http://example.org/bob')
      ),
      factory.quad(
        factory.namedNode('http://example.org/alice'),
        factory.namedNode('http://example.org/age'),
        factory.literal('30', factory.namedNode('http://www.w3.org/2001/XMLSchema#integer'))
      ),
      factory.quad(
        factory.namedNode('http://example.org/bob'),
        factory.namedNode('http://example.org/name'),
        factory.literal('Bob Smith', 'en')
      )
    ]);
    
    // Save to TTL file
    await original.saveToFile(testFile, 'turtle');
    
    // Load back from TTL file
    const roundTrip = await N3Graph.fromFile(testFile, 'turtle');
    
    // Compare quads
    const originalQuads = [...await original.quads()];
    const roundTripQuads = [...await roundTrip.quads()];
    
    expect(roundTripQuads.length).toBe(originalQuads.length);
    expect(roundTripQuads.length).toBe(3);
    
    // Verify specific triples are preserved
    const roundTripValues = roundTripQuads.map(q => ({
      subject: q.subject.value,
      predicate: q.predicate.value,
      object: q.object.value,
      objectType: q.object.termType
    }));
    
    expect(roundTripValues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          subject: 'http://example.org/alice',
          predicate: 'http://example.org/knows',
          object: 'http://example.org/bob',
          objectType: 'NamedNode'
        }),
        expect.objectContaining({
          subject: 'http://example.org/alice',
          predicate: 'http://example.org/age',
          object: '30',
          objectType: 'Literal'
        }),
        expect.objectContaining({
          subject: 'http://example.org/bob',
          predicate: 'http://example.org/name',
          object: 'Bob Smith',
          objectType: 'Literal'
        })
      ])
    );
    
  } finally {
    // Cleanup
    try {
      await unlink(testFile);
    } catch {}
  }
});
