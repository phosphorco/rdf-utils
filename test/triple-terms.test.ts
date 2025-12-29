import { test, expect, describe } from 'bun:test';
import { factory, namespace, XSD } from '../src/rdf.js';
import { N3Graph } from '../src/graph/n3.js';
import { ImmutableSetGraph } from '../src/graph/immutable.js';
import { parseQuadsFromString, parseQuadsFromStringAsync, serializeQuads } from '../src/graph/base.js';
import type { Quad } from '../src/rdf.js';

const EX = namespace('http://example.org/');

describe('Triple Terms / RDF-star Support', () => {

  describe('Factory Methods', () => {

    test('factory.tripleTerm() creates a quad for use as triple term', () => {
      const tripleTerm = factory.tripleTerm(EX.alice, EX.knows, EX.bob);

      expect(tripleTerm.termType).toBe('Quad');
      expect(tripleTerm.value).toBe('');
      expect(tripleTerm.subject.equals(EX.alice)).toBe(true);
      expect(tripleTerm.predicate.equals(EX.knows)).toBe(true);
      expect(tripleTerm.object.equals(EX.bob)).toBe(true);
      expect(tripleTerm.graph.termType).toBe('DefaultGraph');
    });

    test('factory.quad() accepts triple term as object', () => {
      const innerTriple = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const outerQuad = factory.quad(EX.statement1, EX.confidence, innerTriple);

      expect(outerQuad.object.termType).toBe('Quad');
      expect((outerQuad.object as Quad).subject.equals(EX.alice)).toBe(true);
      expect((outerQuad.object as Quad).predicate.equals(EX.knows)).toBe(true);
      expect((outerQuad.object as Quad).object.equals(EX.bob)).toBe(true);
    });

    test('factory.quad() accepts triple term as subject', () => {
      const innerTriple = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const outerQuad = factory.quad(innerTriple, EX.confidence, factory.literal('0.9', XSD.decimal));

      expect(outerQuad.subject.termType).toBe('Quad');
      expect((outerQuad.subject as Quad).subject.equals(EX.alice)).toBe(true);
      expect((outerQuad.subject as Quad).predicate.equals(EX.knows)).toBe(true);
      expect((outerQuad.subject as Quad).object.equals(EX.bob)).toBe(true);
    });

    test('factory.fromQuad() recursively converts embedded quads in object', () => {
      // Create a plain object that looks like a quad with embedded quad
      const plainQuad = {
        termType: 'Quad' as const,
        value: '' as const,
        subject: { termType: 'NamedNode' as const, value: 'http://example.org/s1', equals: () => false },
        predicate: { termType: 'NamedNode' as const, value: 'http://example.org/p1', equals: () => false },
        object: {
          termType: 'Quad' as const,
          value: '' as const,
          subject: { termType: 'NamedNode' as const, value: 'http://example.org/alice', equals: () => false },
          predicate: { termType: 'NamedNode' as const, value: 'http://example.org/knows', equals: () => false },
          object: { termType: 'NamedNode' as const, value: 'http://example.org/bob', equals: () => false },
          graph: { termType: 'DefaultGraph' as const, value: '' as const, equals: () => false }
        },
        graph: { termType: 'DefaultGraph' as const, value: '' as const, equals: () => false }
      };

      const converted = factory.fromQuad(plainQuad as any);

      expect(converted.object.termType).toBe('Quad');
      expect('hashCode' in converted.object).toBe(true);
      expect((converted.object as Quad).subject.value).toBe('http://example.org/alice');
    });

    test('factory.fromQuad() recursively converts embedded quads in subject', () => {
      const plainQuad = {
        termType: 'Quad' as const,
        value: '' as const,
        subject: {
          termType: 'Quad' as const,
          value: '' as const,
          subject: { termType: 'NamedNode' as const, value: 'http://example.org/alice', equals: () => false },
          predicate: { termType: 'NamedNode' as const, value: 'http://example.org/knows', equals: () => false },
          object: { termType: 'NamedNode' as const, value: 'http://example.org/bob', equals: () => false },
          graph: { termType: 'DefaultGraph' as const, value: '' as const, equals: () => false }
        },
        predicate: { termType: 'NamedNode' as const, value: 'http://example.org/confidence', equals: () => false },
        object: { termType: 'Literal' as const, value: '0.9', language: '', datatype: { termType: 'NamedNode' as const, value: 'http://www.w3.org/2001/XMLSchema#decimal', equals: () => false }, equals: () => false },
        graph: { termType: 'DefaultGraph' as const, value: '' as const, equals: () => false }
      };

      const converted = factory.fromQuad(plainQuad as any);

      expect(converted.subject.termType).toBe('Quad');
      expect('hashCode' in converted.subject).toBe(true);
      expect((converted.subject as Quad).subject.value).toBe('http://example.org/alice');
    });

  });

  describe('Equality and HashCode', () => {

    test('triple term equality works for identical embedded triples', () => {
      const triple1 = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const triple2 = factory.tripleTerm(EX.alice, EX.knows, EX.bob);

      expect(triple1.equals(triple2)).toBe(true);
    });

    test('triple term equality fails for different embedded triples', () => {
      const triple1 = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const triple2 = factory.tripleTerm(EX.alice, EX.knows, EX.charlie);

      expect(triple1.equals(triple2)).toBe(false);
    });

    test('quads with triple term objects have correct equality', () => {
      const inner1 = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const inner2 = factory.tripleTerm(EX.alice, EX.knows, EX.bob);

      const quad1 = factory.quad(inner1, EX.confidence, factory.literal('0.9'));
      const quad2 = factory.quad(inner2, EX.confidence, factory.literal('0.9'));

      expect(quad1.equals(quad2)).toBe(true);
    });

    test('quads with different triple term objects are not equal', () => {
      const inner1 = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const inner2 = factory.tripleTerm(EX.alice, EX.knows, EX.charlie);

      const quad1 = factory.quad(inner1, EX.confidence, factory.literal('0.9'));
      const quad2 = factory.quad(inner2, EX.confidence, factory.literal('0.9'));

      expect(quad1.equals(quad2)).toBe(false);
    });

    test('triple terms have consistent hashCode', () => {
      const triple1 = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const triple2 = factory.tripleTerm(EX.alice, EX.knows, EX.bob);

      expect(triple1.hashCode()).toBe(triple2.hashCode());
    });

    test('different triple terms typically have different hashCode', () => {
      const triple1 = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const triple2 = factory.tripleTerm(EX.charlie, EX.knows, EX.dave);

      // Note: hash collision is possible but extremely unlikely for different triples
      expect(triple1.hashCode()).not.toBe(triple2.hashCode());
    });

    test('nested triple terms have correct equality', () => {
      // Create nested: << << :a :b :c >> :p :o >>
      const innerTriple = factory.tripleTerm(EX.a, EX.b, EX.c);
      const nested1 = factory.tripleTerm(innerTriple, EX.p, EX.o);
      const nested2 = factory.tripleTerm(factory.tripleTerm(EX.a, EX.b, EX.c), EX.p, EX.o);

      expect(nested1.equals(nested2)).toBe(true);
    });

  });

  describe('N3Graph Operations', () => {

    test('N3Graph can add quads with triple term objects', () => {
      const graph = new N3Graph();
      const innerTriple = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const quad = factory.quad(innerTriple, EX.confidence, factory.literal('0.9', XSD.decimal));

      graph.add([quad]);

      const quads = [...graph.quads()];
      expect(quads.length).toBe(1);
      expect(quads[0].subject.termType).toBe('Quad');
    });

    test('N3Graph can add quads with triple term subjects', () => {
      const graph = new N3Graph();
      const innerTriple = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const quad = factory.quad(innerTriple, EX.confidence, factory.literal('0.9', XSD.decimal));

      graph.add([quad]);

      const quads = [...graph.quads()];
      expect(quads.length).toBe(1);
      const subject = quads[0].subject as Quad;
      expect(subject.subject.equals(EX.alice)).toBe(true);
      expect(subject.predicate.equals(EX.knows)).toBe(true);
      expect(subject.object.equals(EX.bob)).toBe(true);
    });

    test('N3Graph preserves triple terms through add/quads cycle', () => {
      const graph = new N3Graph();
      const innerTriple = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const originalQuad = factory.quad(innerTriple, EX.source, EX.socialNetwork);

      graph.add([originalQuad]);
      const retrievedQuads = [...graph.quads()];

      expect(retrievedQuads.length).toBe(1);
      expect(retrievedQuads[0].equals(originalQuad)).toBe(true);
    });

    test('N3Graph can find quads by triple term subject', () => {
      const graph = new N3Graph();
      const innerTriple = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const quad1 = factory.quad(innerTriple, EX.confidence, factory.literal('0.9', XSD.decimal));
      const quad2 = factory.quad(EX.other, EX.value, factory.literal('test'));

      graph.add([quad1, quad2]);

      // Find by the triple term subject
      const found = [...graph.find(innerTriple)];
      expect(found.length).toBe(1);
      expect(found[0].predicate.equals(EX.confidence)).toBe(true);
    });

  });

  describe('ImmutableSetGraph Operations', () => {

    test('ImmutableSetGraph can add quads with triple term objects', () => {
      let graph = new ImmutableSetGraph();
      const innerTriple = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const quad = factory.quad(innerTriple, EX.confidence, factory.literal('0.9', XSD.decimal));

      graph = graph.add([quad]);

      const quads = [...graph.quads()];
      expect(quads.length).toBe(1);
      expect(quads[0].subject.termType).toBe('Quad');
    });

    test('ImmutableSetGraph preserves triple terms through add/quads cycle', () => {
      let graph = new ImmutableSetGraph();
      const innerTriple = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const originalQuad = factory.quad(innerTriple, EX.source, EX.socialNetwork);

      graph = graph.add([originalQuad]);
      const retrievedQuads = [...graph.quads()];

      expect(retrievedQuads.length).toBe(1);
      expect(retrievedQuads[0].equals(originalQuad)).toBe(true);
    });

    test('ImmutableSetGraph can find quads by triple term subject', () => {
      let graph = new ImmutableSetGraph();
      const innerTriple = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const quad1 = factory.quad(innerTriple, EX.confidence, factory.literal('0.9', XSD.decimal));
      const quad2 = factory.quad(EX.other, EX.value, factory.literal('test'));

      graph = graph.add([quad1, quad2]);

      const found = [...graph.find(innerTriple)];
      expect(found.length).toBe(1);
      expect(found[0].predicate.equals(EX.confidence)).toBe(true);
    });

    test('ImmutableSetGraph deduplicates quads with same triple terms', () => {
      let graph = new ImmutableSetGraph();
      const innerTriple1 = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const innerTriple2 = factory.tripleTerm(EX.alice, EX.knows, EX.bob);

      const quad1 = factory.quad(innerTriple1, EX.confidence, factory.literal('0.9'));
      const quad2 = factory.quad(innerTriple2, EX.confidence, factory.literal('0.9'));

      graph = graph.add([quad1, quad2]);

      const quads = [...graph.quads()];
      expect(quads.length).toBe(1);
    });

  });

  describe('Parsing', () => {

    test('parseQuadsFromString parses Turtle-star syntax', () => {
      const turtleStar = `
        @prefix ex: <http://example.org/> .
        << ex:alice ex:knows ex:bob >> ex:confidence 0.9 .
      `;

      const quads = parseQuadsFromString(turtleStar, 'turtle*');

      expect(quads.length).toBe(1);
      expect(quads[0].subject.termType).toBe('Quad');
      expect((quads[0].subject as Quad).subject.value).toBe('http://example.org/alice');
      expect((quads[0].subject as Quad).predicate.value).toBe('http://example.org/knows');
      expect((quads[0].subject as Quad).object.value).toBe('http://example.org/bob');
    });

    test('parseQuadsFromStringAsync parses Turtle-star syntax', async () => {
      const turtleStar = `
        @prefix ex: <http://example.org/> .
        << ex:alice ex:knows ex:bob >> ex:source ex:socialNetwork .
      `;

      const quads = await parseQuadsFromStringAsync(turtleStar, 'turtle*');

      expect(quads.length).toBe(1);
      expect(quads[0].subject.termType).toBe('Quad');
    });

    test('auto-detects RDF-star syntax from content', async () => {
      const turtleStar = `
        @prefix ex: <http://example.org/> .
        << ex:alice ex:knows ex:bob >> ex:confidence "0.9" .
      `;

      // Should auto-detect turtle* format
      const quads = await parseQuadsFromStringAsync(turtleStar);

      expect(quads.length).toBe(1);
      expect(quads[0].subject.termType).toBe('Quad');
    });

    test('parses nested triple terms', async () => {
      const nestedTurtleStar = `
        @prefix ex: <http://example.org/> .
        << << ex:alice ex:knows ex:bob >> ex:confidence "0.9" >> ex:source ex:trustModel .
      `;

      const quads = await parseQuadsFromStringAsync(nestedTurtleStar, 'turtle*');

      expect(quads.length).toBe(1);
      expect(quads[0].subject.termType).toBe('Quad');
      // The nested triple term
      const outerTriple = quads[0].subject as Quad;
      expect(outerTriple.subject.termType).toBe('Quad');
    });

  });

  describe('Serialization', () => {

    test('serializeQuads outputs Turtle-star for quads with triple terms', async () => {
      const innerTriple = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const quad = factory.quad(innerTriple, EX.confidence, factory.literal('0.9', XSD.decimal));

      const serialized = await serializeQuads([quad], { format: 'text/turtle' });

      // Should contain the << >> syntax
      expect(serialized).toContain('<<');
      expect(serialized).toContain('>>');
    });

    test('round-trip: parse and serialize preserves triple terms', async () => {
      const original = `
        @prefix ex: <http://example.org/> .
        << ex:alice ex:knows ex:bob >> ex:confidence "0.9" .
      `;

      const quads = await parseQuadsFromStringAsync(original, 'turtle*');
      const reserialized = await serializeQuads(quads, { format: 'text/turtle' });
      const reparsed = await parseQuadsFromStringAsync(reserialized, 'turtle*');

      expect(reparsed.length).toBe(quads.length);
      expect(reparsed[0].subject.termType).toBe('Quad');

      const originalTriple = quads[0].subject as Quad;
      const reparsedTriple = reparsed[0].subject as Quad;

      expect(reparsedTriple.subject.value).toBe(originalTriple.subject.value);
      expect(reparsedTriple.predicate.value).toBe(originalTriple.predicate.value);
      expect(reparsedTriple.object.value).toBe(originalTriple.object.value);
    });

  });

  describe('SPARQL with Triple Terms', () => {

    test('SPARQL SELECT can query quads with triple term subjects', async () => {
      const graph = new N3Graph();
      const innerTriple = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const quad = factory.quad(innerTriple, EX.confidence, factory.literal('0.9', XSD.decimal));

      graph.add([quad]);

      // Query for all quads (triple terms are opaque in standard SPARQL)
      const results = await graph.select(`
        SELECT ?s ?p ?o WHERE {
          ?s ?p ?o .
        }
      `);

      const bindings = [...results];
      expect(bindings.length).toBeGreaterThan(0);
    });

    test('SPARQL CONSTRUCT preserves triple terms', async () => {
      const graph = new N3Graph();
      const innerTriple = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const quad = factory.quad(innerTriple, EX.confidence, factory.literal('0.9', XSD.decimal));

      graph.add([quad]);

      const result = await graph.construct(`
        CONSTRUCT { ?s ?p ?o }
        WHERE { ?s ?p ?o }
      `);

      const quads = [...result.quads()];
      expect(quads.length).toBe(1);
      // The subject should still be a triple term
      expect(quads[0].subject.termType).toBe('Quad');
    });

    test('SPARQL ASK returns true for graph with triple terms', async () => {
      const graph = new N3Graph();
      const innerTriple = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      const quad = factory.quad(innerTriple, EX.confidence, factory.literal('0.9', XSD.decimal));

      graph.add([quad]);

      const result = await graph.ask(`
        ASK { ?s ?p ?o }
      `);

      expect(result).toBe(true);
    });

  });

  describe('Real-world Usage Patterns', () => {

    test('annotating a statement with confidence value', () => {
      const graph = new N3Graph();

      // Create the statement "Alice knows Bob"
      const statement = factory.tripleTerm(EX.alice, EX.knows, EX.bob);

      // Annotate with confidence
      const annotation = factory.quad(statement, EX.confidence, factory.literal('0.95', XSD.decimal));

      graph.add([annotation]);

      const quads = [...graph.quads()];
      expect(quads.length).toBe(1);

      // Can retrieve and examine the annotation
      const retrieved = quads[0];
      expect(retrieved.subject.termType).toBe('Quad');
      expect(retrieved.predicate.equals(EX.confidence)).toBe(true);
      expect(retrieved.object.value).toBe('0.95');
    });

    test('annotating a statement with provenance', () => {
      const graph = new N3Graph();

      // The original statement
      const statement = factory.tripleTerm(EX.alice, EX.age, factory.literal('30', XSD.integer));

      // Multiple annotations for the same statement
      graph.add([
        factory.quad(statement, EX.source, EX.database),
        factory.quad(statement, EX.timestamp, factory.literal('2024-01-15', XSD.date)),
        factory.quad(statement, EX.author, EX.dataEntry1)
      ]);

      const quads = [...graph.quads()];
      expect(quads.length).toBe(3);

      // All quads should reference the same statement
      for (const q of quads) {
        expect(q.subject.termType).toBe('Quad');
        expect((q.subject as Quad).subject.equals(EX.alice)).toBe(true);
      }
    });

    test('representing uncertain knowledge', () => {
      const graph = new N3Graph();

      // "Alice might know Bob" - uncertain relationship
      const mightKnow = factory.tripleTerm(EX.alice, EX.knows, EX.bob);
      graph.add([
        factory.quad(mightKnow, EX.certainty, factory.literal('possible')),
        factory.quad(mightKnow, EX.evidenceStrength, factory.literal('weak'))
      ]);

      // "Alice definitely works at Company" - certain relationship
      const worksAt = factory.tripleTerm(EX.alice, EX.worksAt, EX.company);
      graph.add([
        factory.quad(worksAt, EX.certainty, factory.literal('confirmed')),
        factory.quad(worksAt, EX.evidenceStrength, factory.literal('strong'))
      ]);

      const quads = [...graph.quads()];
      expect(quads.length).toBe(4);
    });

    test('temporal annotations on statements', () => {
      const graph = new N3Graph();

      // "Alice worked at Company from 2020 to 2023"
      const employment = factory.tripleTerm(EX.alice, EX.worksAt, EX.company);
      graph.add([
        factory.quad(employment, EX.startDate, factory.literal('2020-01-01', XSD.date)),
        factory.quad(employment, EX.endDate, factory.literal('2023-12-31', XSD.date))
      ]);

      // Verify we can query and find temporal bounds
      const found = [...graph.find(employment)];
      expect(found.length).toBe(2);

      const predicates = found.map(q => q.predicate.value);
      expect(predicates).toContain('http://example.org/startDate');
      expect(predicates).toContain('http://example.org/endDate');
    });

  });

});
