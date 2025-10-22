import { test, expect } from 'bun:test';
import { N3Graph } from '../src/graph/n3.js';
import { parseQuadsFromString, parseQuadsFromStringAsync, parseQuadsFromFileAsync } from '../src/graph/base.js';
import { factory } from '../src/rdf.js';
import { writeFile, unlink } from 'fs/promises';

const testRdfXml = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:foaf="http://xmlns.com/foaf/0.1/">
  <rdf:Description rdf:about="http://example.org/john">
    <foaf:name>John Doe</foaf:name>
    <foaf:mbox rdf:resource="mailto:john@example.org"/>
  </rdf:Description>
  <rdf:Description rdf:about="http://example.org/jane">
    <foaf:name>Jane Smith</foaf:name>
    <foaf:knows rdf:resource="http://example.org/john"/>
  </rdf:Description>
</rdf:RDF>`;

const testRdfXmlWithTypes = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:foaf="http://xmlns.com/foaf/0.1/"
         xmlns:xsd="http://www.w3.org/2001/XMLSchema#">
  <rdf:Description rdf:about="http://example.org/person1">
    <foaf:name>Alice</foaf:name>
    <foaf:age rdf:datatype="http://www.w3.org/2001/XMLSchema#integer">30</foaf:age>
  </rdf:Description>
</rdf:RDF>`;

test('parseQuadsFromStringAsync with RDF/XML format explicitly specified', async () => {
  const quads = await parseQuadsFromStringAsync(testRdfXml, 'application/rdf+xml');

  expect(quads.length).toBe(4); // john has 2 properties, jane has 2 properties

  // Verify subjects are present
  const subjects = quads.map(q => q.subject.value);
  expect(subjects).toContain('http://example.org/john');
  expect(subjects).toContain('http://example.org/jane');
});

test('parseQuadsFromStringAsync auto-detects RDF/XML from content', async () => {
  const quads = await parseQuadsFromStringAsync(testRdfXml);

  expect(quads.length).toBe(4);
  const subjects = quads.map(q => q.subject.value);
  expect(subjects).toContain('http://example.org/john');
});

test('parseQuadsFromStringAsync detects RDF/XML with rdf/xml MIME type', async () => {
  const quads = await parseQuadsFromStringAsync(testRdfXml, 'rdf/xml');
  expect(quads.length).toBe(4);
});

test('parseQuadsFromStringAsync detects RDF/XML with text/rdf+xml MIME type', async () => {
  const quads = await parseQuadsFromStringAsync(testRdfXml, 'text/rdf+xml');
  expect(quads.length).toBe(4);
});

test('parseQuadsFromStringAsync handles typed literals in RDF/XML', async () => {
  const quads = await parseQuadsFromStringAsync(testRdfXmlWithTypes, 'application/rdf+xml');

  expect(quads.length).toBeGreaterThanOrEqual(2);

  // Find the age property
  const ageQuad = quads.find(q => q.predicate.value.includes('age'));
  expect(ageQuad).toBeDefined();
  expect(ageQuad?.object.value).toBe('30');
  expect(ageQuad?.object.termType).toBe('Literal');
  if (ageQuad?.object.termType === 'Literal') {
    expect(ageQuad.object.datatype?.value).toBe('http://www.w3.org/2001/XMLSchema#integer');
  }
});

test('N3Graph.fromStringAsync with RDF/XML', async () => {
  const graph = await N3Graph.fromStringAsync(testRdfXml, 'application/rdf+xml');

  const quads = [...await graph.quads()];
  expect(quads.length).toBe(4);

  const subjects = quads.map(q => q.subject.value);
  expect(subjects).toContain('http://example.org/john');
  expect(subjects).toContain('http://example.org/jane');
});

test('N3Graph.fromStringAsync auto-detects RDF/XML', async () => {
  const graph = await N3Graph.fromStringAsync(testRdfXml);

  const quads = [...await graph.quads()];
  expect(quads.length).toBe(4);
});

test('parseQuadsFromFileAsync reads RDF/XML from .rdf file', async () => {
  const testFile = 'test-rdfxml.rdf';

  try {
    await writeFile(testFile, testRdfXml);

    const quads = await parseQuadsFromFileAsync(testFile);
    expect(quads.length).toBe(4);

    const subjects = quads.map(q => q.subject.value);
    expect(subjects).toContain('http://example.org/john');
  } finally {
    try {
      await unlink(testFile);
    } catch {}
  }
});

test('parseQuadsFromFileAsync auto-detects format from .rdf extension', async () => {
  const testFile = 'test.rdf';

  try {
    await writeFile(testFile, testRdfXml);

    // Should auto-detect as RDF/XML without explicit format
    const quads = await parseQuadsFromFileAsync(testFile);
    expect(quads.length).toBe(4);
  } finally {
    try {
      await unlink(testFile);
    } catch {}
  }
});

test('parseQuadsFromFileAsync respects explicit format over extension', async () => {
  const testFile = 'test.rdf';

  try {
    // Write RDF/XML content to a .rdf file
    await writeFile(testFile, testRdfXml);

    // Parse with explicit format
    const quads = await parseQuadsFromFileAsync(testFile, 'application/rdf+xml');
    expect(quads.length).toBe(4);
  } finally {
    try {
      await unlink(testFile);
    } catch {}
  }
});

test('N3Graph.fromFileAsync reads RDF/XML files', async () => {
  const testFile = 'test-graph.rdf';

  try {
    await writeFile(testFile, testRdfXml);

    const graph = await N3Graph.fromFileAsync(testFile);
    const quads = [...await graph.quads()];

    expect(quads.length).toBe(4);
  } finally {
    try {
      await unlink(testFile);
    } catch {}
  }
});

test('Format detection recognizes .trig files as TriG format', async () => {
  const trigData = `@prefix ex: <http://example.org/> .
<http://example.org/graph1> {
  ex:subject ex:predicate "value" .
}`;

  const testFile = 'test.trig';

  try {
    await writeFile(testFile, trigData);

    // Should detect as TriG format
    const quads = await parseQuadsFromFileAsync(testFile);
    expect(quads.length).toBeGreaterThan(0);
  } finally {
    try {
      await unlink(testFile);
    } catch {}
  }
});

test('Format detection recognizes .ttl files as Turtle format', async () => {
  const turtleData = `
@prefix ex: <http://example.org/> .
ex:subject ex:predicate "value" .`;

  const testFile = 'test.ttl';

  try {
    await writeFile(testFile, turtleData);

    // Should detect as Turtle format
    const quads = await parseQuadsFromFileAsync(testFile);
    expect(quads.length).toBeGreaterThan(0);
  } finally {
    try {
      await unlink(testFile);
    } catch {}
  }
});

test('Format detection recognizes .n3 files as N3 format', async () => {
  const n3Data = `
@prefix ex: <http://example.org/> .
ex:subject ex:predicate "value" .`;

  const testFile = 'test.n3';

  try {
    await writeFile(testFile, n3Data);

    // Should detect as N3 format
    const quads = await parseQuadsFromFileAsync(testFile);
    expect(quads.length).toBeGreaterThan(0);
  } finally {
    try {
      await unlink(testFile);
    } catch {}
  }
});

test('Format detection recognizes .nq files as N-Quads format', async () => {
  const nquadsData = `
<http://example.org/subject> <http://example.org/predicate> "value" .`;

  const testFile = 'test.nq';

  try {
    await writeFile(testFile, nquadsData);

    // Should detect as N-Quads format
    const quads = await parseQuadsFromFileAsync(testFile);
    expect(quads.length).toBeGreaterThan(0);
  } finally {
    try {
      await unlink(testFile);
    } catch {}
  }
});

test('parseQuadsFromStringAsync handles RDF/XML with baseIRI', async () => {
  const rdfXmlWithRelativeIri = `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
         xmlns:foaf="http://xmlns.com/foaf/0.1/">
  <rdf:Description rdf:about="john">
    <foaf:name>John</foaf:name>
  </rdf:Description>
</rdf:RDF>`;

  const baseIRI = 'http://example.org/';
  const quads = await parseQuadsFromStringAsync(rdfXmlWithRelativeIri, 'application/rdf+xml', baseIRI);

  expect(quads.length).toBeGreaterThan(0);
  // Relative IRI should be resolved against baseIRI
  expect(quads[0].subject.value).toBe('http://example.org/john');
});

test('N3Graph round-trip: RDF/XML -> Graph -> Turtle', async () => {
  const originalGraph = await N3Graph.fromStringAsync(testRdfXml, 'application/rdf+xml');

  const turtle = await originalGraph.toString('turtle');
  expect(turtle).toContain('http://example.org/john');
  expect(turtle).toContain('http://example.org/jane');

  const roundTripGraph = await N3Graph.fromStringAsync(turtle, 'turtle');

  const originalQuads = [...await originalGraph.quads()];
  const roundTripQuads = [...await roundTripGraph.quads()];

  expect(roundTripQuads.length).toBe(originalQuads.length);
});

test('Sync parseQuadsFromString throws for RDF/XML', () => {
  expect(() => {
    // @ts-ignore - Testing runtime behavior
    parseQuadsFromString(testRdfXml, 'application/rdf+xml');
  }).toThrow('RDF/XML format requires async parsing');
});

test('Sync N3Graph.fromString works with non-RDF/XML formats', () => {
  const turtleData = `
@prefix ex: <http://example.org/> .
ex:subject ex:predicate "value" .`;

  const graph = N3Graph.fromString(turtleData, 'turtle');
  expect(graph).toBeDefined();
});
