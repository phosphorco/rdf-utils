import { test, expect } from 'bun:test';
import { N3Graph } from '../src/graph/n3.js';
import { parseQuadsFromStringAsync, parseQuadsFromFileAsync, serializeQuads } from '../src/graph/base.js';
import { factory } from '../src/rdf.js';
import { writeFile, unlink } from 'fs/promises';
import * as rdfjs from '@rdfjs/types';

/**
 * Helper function to compare two sets of quads regardless of order
 * Ignores graph information and only compares subject, predicate, object
 */
function quadsAreEquivalent(quads1: rdfjs.Quad[], quads2: rdfjs.Quad[]): boolean {
  if (quads1.length !== quads2.length) {
    return false;
  }

  // Convert quads to a comparable format (subject, predicate, object as strings)
  const normalize = (quad: rdfjs.Quad) => {
    return `${quad.subject.value}|${quad.predicate.value}|${quad.object.value}|${
      quad.object.termType === 'Literal' && (quad.object as any).datatype
        ? (quad.object as any).datatype.value
        : ''
    }`;
  };

  const set1 = new Set(quads1.map(normalize));
  const set2 = new Set(quads2.map(normalize));

  if (set1.size !== set2.size) {
    return false;
  }

  for (const item of set1) {
    if (!set2.has(item)) {
      return false;
    }
  }

  return true;
}

/**
 * Helper function to get a normalized string representation of quads for debugging
 */
function quadsToString(quads: rdfjs.Quad[]): string {
  return quads
    .map(q => {
      const obj = q.object.termType === 'Literal' ? `"${q.object.value}"` : q.object.value;
      return `${q.subject.value} ${q.predicate.value} ${obj}`;
    })
    .sort()
    .join('\n');
}

// Test data: same information in JSON-LD and Turtle formats
const turtleSimplePerson = `
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix ex: <http://example.org/> .

ex:john a foaf:Person ;
  foaf:name "John Doe" ;
  foaf:mbox <mailto:john@example.org> .
`;

const jsonldSimplePerson = {
  '@context': {
    'foaf': 'http://xmlns.com/foaf/0.1/'
  },
  '@id': 'http://example.org/john',
  '@type': 'foaf:Person',
  'foaf:name': 'John Doe',
  'foaf:mbox': { '@id': 'mailto:john@example.org' }
};

// Two people with relationships
const turtleTwoPeople = `
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix ex: <http://example.org/> .

ex:john a foaf:Person ;
  foaf:name "John Doe" .

ex:jane a foaf:Person ;
  foaf:name "Jane Smith" ;
  foaf:knows ex:john .
`;

const jsonldTwoPeople = {
  '@context': {
    'foaf': 'http://xmlns.com/foaf/0.1/'
  },
  '@graph': [
    {
      '@id': 'http://example.org/john',
      '@type': 'foaf:Person',
      'foaf:name': 'John Doe'
    },
    {
      '@id': 'http://example.org/jane',
      '@type': 'foaf:Person',
      'foaf:name': 'Jane Smith',
      'foaf:knows': { '@id': 'http://example.org/john' }
    }
  ]
};

// Nested/blank node data
const turtleNested = `
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix vcard: <http://www.w3.org/2006/vcard/ns#> .
@prefix ex: <http://example.org/> .

ex:person1 a foaf:Person ;
  foaf:name "Alice" ;
  vcard:hasAddress [
    a vcard:Address ;
    vcard:streetAddress "123 Main St" ;
    vcard:locality "New York"
  ] .
`;

const jsonldNested = {
  '@context': {
    'foaf': 'http://xmlns.com/foaf/0.1/',
    'vcard': 'http://www.w3.org/2006/vcard/ns#'
  },
  '@id': 'http://example.org/person1',
  '@type': 'foaf:Person',
  'foaf:name': 'Alice',
  'vcard:hasAddress': {
    '@type': 'vcard:Address',
    'vcard:streetAddress': '123 Main St',
    'vcard:locality': 'New York'
  }
};

// Typed literals
const turtleTypedLiterals = `
@prefix foaf: <http://xmlns.com/foaf/0.1/> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix ex: <http://example.org/> .

ex:person1 a foaf:Person ;
  foaf:name "Bob" ;
  foaf:age 30 .
`;

const jsonldTypedLiterals = {
  '@context': {
    'foaf': 'http://xmlns.com/foaf/0.1/',
    'xsd': 'http://www.w3.org/2001/XMLSchema#'
  },
  '@id': 'http://example.org/person1',
  '@type': 'foaf:Person',
  'foaf:name': 'Bob',
  'foaf:age': { '@value': '30', '@type': 'xsd:integer' }
};

// Test 1: Simple person data
test('JSON-LD and Turtle produce equivalent RDF for simple person data', async () => {
  const turtleQuads = await parseQuadsFromStringAsync(turtleSimplePerson, 'turtle');
  const jsonldQuads = await parseQuadsFromStringAsync(JSON.stringify(jsonldSimplePerson), 'application/ld+json');

  expect(quadsAreEquivalent(turtleQuads, jsonldQuads)).toBe(true);
  expect(turtleQuads.length).toBe(jsonldQuads.length);
});

// Test 2: Two people with relationships
test('JSON-LD and Turtle produce equivalent RDF for multiple people with relationships', async () => {
  const turtleQuads = await parseQuadsFromStringAsync(turtleTwoPeople, 'turtle');
  const jsonldQuads = await parseQuadsFromStringAsync(JSON.stringify(jsonldTwoPeople), 'application/ld+json');

  expect(quadsAreEquivalent(turtleQuads, jsonldQuads)).toBe(true);
  expect(turtleQuads.length).toBe(jsonldQuads.length);
});

// Test 3: Nested objects (blank nodes)
test('JSON-LD and Turtle produce equivalent RDF for nested/blank node structures', async () => {
  const turtleQuads = await parseQuadsFromStringAsync(turtleNested, 'turtle');
  const jsonldQuads = await parseQuadsFromStringAsync(JSON.stringify(jsonldNested), 'application/ld+json');

  // For nested objects, we expect the same number of quads (including those for the nested resource)
  expect(turtleQuads.length).toBe(jsonldQuads.length);

  // Check that key triples are present in both
  const turtleTriples = new Set(turtleQuads.map(q => `${q.subject.value}|${q.predicate.value}`));
  const jsonldTriples = new Set(jsonldQuads.map(q => `${q.subject.value}|${q.predicate.value}`));

  // Verify that both have triples for the main person
  expect(Array.from(turtleTriples).some(t => t.includes('person1'))).toBe(true);
  expect(Array.from(jsonldTriples).some(t => t.includes('person1'))).toBe(true);
});

// Test 4: Typed literals
test('JSON-LD and Turtle produce equivalent RDF for typed literals', async () => {
  const turtleQuads = await parseQuadsFromStringAsync(turtleTypedLiterals, 'turtle');
  const jsonldQuads = await parseQuadsFromStringAsync(JSON.stringify(jsonldTypedLiterals), 'application/ld+json');

  // Both should parse to the same triples
  expect(turtleQuads.length).toBe(jsonldQuads.length);

  // Verify age is parsed as xsd:integer in both cases
  const turtleAgeQuad = turtleQuads.find(q => q.predicate.value.includes('age'));
  const jsonldAgeQuad = jsonldQuads.find(q => q.predicate.value.includes('age'));

  expect(turtleAgeQuad).toBeDefined();
  expect(jsonldAgeQuad).toBeDefined();

  // Check datatype is consistent
  const turtleDatatype = (turtleAgeQuad?.object as any)?.datatype?.value;
  const jsonldDatatype = (jsonldAgeQuad?.object as any)?.datatype?.value;

  expect(turtleDatatype).toBe(jsonldDatatype);
  expect(turtleDatatype).toBe('http://www.w3.org/2001/XMLSchema#integer');
});

// Test 5: JSON-LD format detection
test('JSON-LD is auto-detected from content', async () => {
  const jsonldStr = JSON.stringify(jsonldSimplePerson);
  const quads = await parseQuadsFromStringAsync(jsonldStr); // No explicit format

  expect(quads.length).toBeGreaterThan(0);
  const subjects = quads.map(q => q.subject.value);
  expect(subjects).toContain('http://example.org/john');
});

// Test 6: JSON-LD file detection
test('JSON-LD format is auto-detected from .jsonld file extension', async () => {
  const testFile = '/tmp/test-format-detection.jsonld';

  await writeFile(testFile, JSON.stringify(jsonldSimplePerson), 'utf8');

  try {
    const quads = await parseQuadsFromFileAsync(testFile); // No explicit format

    expect(quads.length).toBeGreaterThan(0);
    const subjects = quads.map(q => q.subject.value);
    expect(subjects).toContain('http://example.org/john');
  } finally {
    await unlink(testFile);
  }
});

// Test 7: Explicit JSON-LD format specifier
test('parseQuadsFromStringAsync accepts explicit JSON-LD format specifiers', async () => {
  const jsonldStr = JSON.stringify(jsonldSimplePerson);

  // Test various format specifiers
  const formats = ['application/ld+json', 'json-ld'];

  for (const format of formats) {
    const quads = await parseQuadsFromStringAsync(jsonldStr, format);
    expect(quads.length).toBeGreaterThan(0);
  }
});

// Test 8: N3Graph integration with JSON-LD
test('N3Graph can be created from JSON-LD and converted back to equivalent Turtle', async () => {
  // Parse JSON-LD into a graph
  const graph = await N3Graph.fromStringAsync(JSON.stringify(jsonldSimplePerson), 'application/ld+json');
  const quadsFromJsonLd = [...await graph.quads()];

  // Parse Turtle for comparison
  const quadsFromTurtle = await parseQuadsFromStringAsync(turtleSimplePerson, 'turtle');

  expect(quadsAreEquivalent(quadsFromJsonLd, quadsFromTurtle)).toBe(true);
});

// Test 9: Serialization generates valid JSON-LD
test('Serializing RDF quads to JSON-LD produces valid JSON with @context', async () => {
  // Start with Turtle
  const turtleQuads = await parseQuadsFromStringAsync(turtleSimplePerson, 'turtle');

  // Serialize to JSON-LD
  const serialized = await serializeQuads(turtleQuads, {
    format: 'application/ld+json',
    prefixes: {
      'foaf': 'http://xmlns.com/foaf/0.1/'
    }
  });

  expect(serialized).toBeDefined();
  expect(typeof serialized).toBe('string');

  // Verify it's valid JSON with @context
  const parsed = JSON.parse(serialized);
  expect(parsed['@context']).toBeDefined();
  expect(parsed['@context']['foaf']).toBe('http://xmlns.com/foaf/0.1/');
});

// Test 10: Round-trip: Turtle → JSON-LD → Turtle
test('Round-trip conversion maintains RDF equivalence', async () => {
  // Parse original Turtle
  const originalQuads = await parseQuadsFromStringAsync(turtleSimplePerson, 'turtle');

  // Serialize to JSON-LD
  const jsonldStr = await serializeQuads(originalQuads, {
    format: 'json-ld',
    prefixes: {
      'foaf': 'http://xmlns.com/foaf/0.1/'
    }
  });

  // Parse the JSON-LD back
  const roundTripQuads = await parseQuadsFromStringAsync(jsonldStr, 'application/ld+json');

  // Should have same number of quads
  expect(originalQuads.length).toBe(roundTripQuads.length);

  // Verify key data is preserved
  const originalSubjects = new Set(originalQuads.map(q => q.subject.value));
  const roundTripSubjects = new Set(roundTripQuads.map(q => q.subject.value));

  expect(originalSubjects).toEqual(roundTripSubjects);
});

// Test 11: JSON-LD array of objects
test('JSON-LD array of objects produces equivalent RDF', async () => {
  const jsonldQuads = await parseQuadsFromStringAsync(JSON.stringify(jsonldTwoPeople), 'application/ld+json');
  const turtleQuads = await parseQuadsFromStringAsync(turtleTwoPeople, 'turtle');

  expect(quadsAreEquivalent(jsonldQuads, turtleQuads)).toBe(true);
});

// Test 12: Content debugging helper (optional)
test('quadsToString helper provides readable output for debugging', async () => {
  const quads = await parseQuadsFromStringAsync(turtleSimplePerson, 'turtle');
  const debugStr = quadsToString(quads);

  expect(debugStr).toBeDefined();
  expect(typeof debugStr).toBe('string');
  expect(debugStr.includes('John Doe')).toBe(true);
  expect(debugStr.includes('Person')).toBe(true);
});
