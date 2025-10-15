import { test, expect } from "bun:test";
import * as fc from "fast-check";
import { ImmutableDataFactory, XSD, RDF, RDFS, OWL, DC, DCTERMS, FOAF, SKOS, VCARD } from "../src/rdf";
import type { Term, NamedNode, BlankNode, Literal, Variable, DefaultGraph, Quad } from "../src/rdf";

// Test data generators
const arbIri = fc.oneof(
  // HTTP/HTTPS URIs
  fc.webUrl(),
  // Common namespace IRIs
  fc.constantFrom(
    "http://example.org/test",
    "https://schema.org/Person", 
    "http://www.w3.org/2001/XMLSchema#string",
    "http://xmlns.com/foaf/0.1/name"
  ),
  // Simple IRIs
  fc.string({ minLength: 1, maxLength: 50 }).map(s => `http://example.org/${s}`)
);

const arbLiteralValue = fc.oneof(
  fc.string(),
  fc.integer().map(String),
  fc.boolean().map(String),
  fc.integer({ 
    min: -8640000000000000,  // ~271,821 BCE (JavaScript minimum)
    max: 8640000000000000    // ~275,760 CE (JavaScript maximum)
  }).map(timestamp => new Date(timestamp).toISOString())
);

const arbLanguageTag = fc.constantFrom("en", "en-US", "fr", "de", "zh-CN", "ja");

const arbDatatype = fc.constantFrom(
  "http://www.w3.org/2001/XMLSchema#string",
  "http://www.w3.org/2001/XMLSchema#integer", 
  "http://www.w3.org/2001/XMLSchema#boolean",
  "http://www.w3.org/2001/XMLSchema#dateTime"
);

const arbBlankNodeId = fc.oneof(
  fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z0-9_-]+$/.test(s)),
  fc.constant(undefined) // Let factory generate ID
);

const arbVariableName = fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[a-zA-Z][a-zA-Z0-9_]*$/.test(s));

// Term generators
const factory = new ImmutableDataFactory();

const arbNamedNode = arbIri.map(iri => factory.namedNode(iri));

const arbBlankNode = arbBlankNodeId.map(id => factory.blankNode(id));

const arbLiteral = fc.oneof(
  // Language-tagged literals
  fc.tuple(arbLiteralValue, arbLanguageTag).map(([value, lang]) => 
    factory.literal(value, lang)
  ),
  // Typed literals  
  fc.tuple(arbLiteralValue, arbDatatype).map(([value, datatype]) =>
    factory.literal(value, factory.namedNode(datatype))
  )
);

const arbVariable = arbVariableName.map(name => factory.variable(name));

const arbDefaultGraph = fc.constant(factory.defaultGraph());

const arbTerm = fc.oneof(arbNamedNode, arbBlankNode, arbLiteral, arbVariable, arbDefaultGraph);

const arbQuadSubject = fc.oneof(arbNamedNode, arbBlankNode, arbVariable);
const arbQuadPredicate = fc.oneof(arbNamedNode, arbVariable); 
const arbQuadObject = fc.oneof(arbNamedNode, arbBlankNode, arbLiteral, arbVariable);
const arbQuadGraph = fc.oneof(arbNamedNode, arbBlankNode, arbVariable, arbDefaultGraph);

const arbQuad = fc.tuple(arbQuadSubject, arbQuadPredicate, arbQuadObject, arbQuadGraph)
  .map(([s, p, o, g]) => factory.quad(s, p, o, g));

// Property tests
test("Equality Properties", () => {
  // Reflexivity: term.equals(term) is always true
  fc.assert(fc.property(arbTerm, (term) => {
    expect(term.equals(term)).toBe(true);
  }));

  // Symmetry: a.equals(b) ⟺ b.equals(a) 
  fc.assert(fc.property(arbTerm, arbTerm, (a, b) => {
    expect(a.equals(b)).toBe(b.equals(a));
  }));

  // Hash consistency: a.equals(b) ⟹ a.hashCode() === b.hashCode()
  fc.assert(fc.property(arbTerm, arbTerm, (a, b) => {
    if (a.equals(b)) {
      expect(a.hashCode()).toBe(b.hashCode());
    }
  }));

  // Null/undefined handling
  fc.assert(fc.property(arbTerm, (term) => {
    expect(term.equals(null)).toBe(false);
    expect(term.equals(undefined)).toBe(false);
  }));
});

test("Transitivity Property", () => {
  // Generate three potentially equal terms
  fc.assert(fc.property(arbIri, (iri) => {
    const a = factory.namedNode(iri);
    const b = factory.namedNode(iri);
    const c = factory.namedNode(iri);
    
    // Transitivity: a.equals(b) ∧ b.equals(c) ⟹ a.equals(c)
    if (a.equals(b) && b.equals(c)) {
      expect(a.equals(c)).toBe(true);
    }
  }));
});

test("Round-trip Properties", () => {
  // Term conversion: fromTerm(term).equals(term)
  fc.assert(fc.property(arbTerm, (term) => {
    const converted = factory.fromTerm(term as any);
    expect(converted.equals(term)).toBe(true);
  }));

  // Quad conversion: fromQuad(quad).equals(quad)
  fc.assert(fc.property(arbQuad, (quad) => {
    const converted = factory.fromQuad(quad as any);
    expect(converted.equals(quad)).toBe(true);
  }));

  // Factory idempotence: factory.namedNode(iri).equals(factory.namedNode(iri))
  fc.assert(fc.property(arbIri, (iri) => {
    const node1 = factory.namedNode(iri);
    const node2 = factory.namedNode(iri);
    expect(node1.equals(node2)).toBe(true);
  }));
});

test("NamedNode Properties", () => {
  fc.assert(fc.property(arbIri, (iri) => {
    const node = factory.namedNode(iri);
    expect(node.termType).toBe("NamedNode");
    expect(node.value).toBe(iri);
    expect(node.toString()).toBe(iri);
  }));
});

test("Literal Properties", () => {
  // String literals
  fc.assert(fc.property(arbLiteralValue, (value) => {
    const literal = factory.literal(value);
    expect(literal.termType).toBe("Literal");
    expect(literal.value).toBe(value);
    expect(literal.datatype.equals(XSD.string)).toBe(true);
    expect(literal.language).toBe("");
  }));

  // Language-tagged literals
  fc.assert(fc.property(arbLiteralValue, arbLanguageTag, (value, lang) => {
    const literal = factory.literal(value, lang);
    expect(literal.termType).toBe("Literal");
    expect(literal.value).toBe(value);
    expect(literal.language).toBe(lang);
    expect(literal.datatype.equals(XSD.langString)).toBe(true);
  }));

  // Typed literals
  fc.assert(fc.property(arbLiteralValue, arbDatatype, (value, datatypeIri) => {
    const datatype = factory.namedNode(datatypeIri);
    const literal = factory.literal(value, datatype);
    expect(literal.termType).toBe("Literal");
    expect(literal.value).toBe(value);
    expect(literal.datatype.equals(datatype)).toBe(true);
    expect(literal.language).toBe("");
  }));
});

test("BlankNode Properties", () => {
  // Auto-generated blank nodes are unique within factory instance
  fc.assert(fc.property(fc.integer({ min: 2, max: 10 }), (count) => {
    const nodes = Array.from({ length: count }, () => factory.blankNode());
    const uniqueValues = new Set(nodes.map(n => n.value));
    expect(uniqueValues.size).toBe(count);
  }));

  // Explicit blank node IDs are preserved
  fc.assert(fc.property(arbBlankNodeId.filter(id => id !== undefined), (id) => {
    const node = factory.blankNode(id!);
    expect(node.termType).toBe("BlankNode");
    expect(node.value).toBe(id);
  }));
});

test("Variable Properties", () => {
  fc.assert(fc.property(arbVariableName, (name) => {
    const variable = factory.variable(name);
    expect(variable.termType).toBe("Variable");
    expect(variable.value).toBe(name);
    expect(variable.toString()).toBe(`?${name}`);
  }));
});

test("Quad Properties", () => {
  fc.assert(fc.property(arbQuadSubject, arbQuadPredicate, arbQuadObject, arbQuadGraph, (s, p, o, g) => {
    const quad = factory.quad(s, p, o, g);
    expect(quad.termType).toBe("Quad");
    expect(quad.subject.equals(s)).toBe(true);
    expect(quad.predicate.equals(p)).toBe(true);
    expect(quad.object.equals(o)).toBe(true);
    expect(quad.graph.equals(g)).toBe(true);
  }));

  // Default graph when no graph specified
  fc.assert(fc.property(arbQuadSubject, arbQuadPredicate, arbQuadObject, (s, p, o) => {
    const quad = factory.quad(s, p, o);
    expect(quad.graph.equals(factory.defaultGraph())).toBe(true);
  }));
});

test("Factory Consistency", () => {
  // Same inputs produce equal outputs
  fc.assert(fc.property(arbIri, (iri) => {
    const factory1 = new ImmutableDataFactory();
    const factory2 = new ImmutableDataFactory();
    const node1 = factory1.namedNode(iri);
    const node2 = factory2.namedNode(iri);
    expect(node1.equals(node2)).toBe(true);
  }));

  // Blank node counters are isolated between factories
  fc.assert(fc.property(fc.constant(null), () => {
    const factory1 = new ImmutableDataFactory();
    const factory2 = new ImmutableDataFactory();
    const node1a = factory1.blankNode();
    const node2a = factory2.blankNode();
    const node1b = factory1.blankNode();
    
    // Different factories can produce same auto-generated IDs
    expect(node1a.value).toBe(node2a.value);
    // Same factory produces different IDs
    expect(node1a.value).not.toBe(node1b.value);
  }));
});

test("Immutability Properties", () => {
  // All terms preserve their values after creation
  fc.assert(fc.property(arbTerm, (term) => {
    const originalValue = term.value;
    const originalTermType = term.termType;
    
    // Values should remain consistent across multiple accesses
    expect(term.value).toBe(originalValue);
    expect(term.termType).toBe(originalTermType);
    expect(term.value).toBe(originalValue); // Second access
    expect(term.termType).toBe(originalTermType); // Second access
  }));
  
  // Specific term type immutability checks
  fc.assert(fc.property(arbNamedNode, (node) => {
    const originalValue = node.value;
    expect(node.termType).toBe("NamedNode");
    expect(node.value).toBe(originalValue);
  }));
  
  fc.assert(fc.property(arbBlankNode, (node) => {
    const originalValue = node.value;
    expect(node.termType).toBe("BlankNode");
    expect(node.value).toBe(originalValue);
  }));
  
  fc.assert(fc.property(arbLiteral, (literal) => {
    const originalValue = literal.value;
    const originalLanguage = literal.language;
    const originalDatatype = literal.datatype;
    expect(literal.termType).toBe("Literal");
    expect(literal.value).toBe(originalValue);
    expect(literal.language).toBe(originalLanguage);
    expect(literal.datatype.equals(originalDatatype)).toBe(true);
  }));
  
  fc.assert(fc.property(arbVariable, (variable) => {
    const originalValue = variable.value;
    expect(variable.termType).toBe("Variable");
    expect(variable.value).toBe(originalValue);
  }));
  
  fc.assert(fc.property(arbDefaultGraph, (graph) => {
    const originalValue = graph.value;
    expect(graph.termType).toBe("DefaultGraph");
    expect(graph.value).toBe(originalValue);
  }));
  
  // Quad immutability - all components remain consistent
  fc.assert(fc.property(arbQuad, (quad) => {
    const originalSubject = quad.subject;
    const originalPredicate = quad.predicate;
    const originalObject = quad.object;
    const originalGraph = quad.graph;
    
    expect(quad.termType).toBe("Quad");
    expect(quad.subject.equals(originalSubject)).toBe(true);
    expect(quad.predicate.equals(originalPredicate)).toBe(true);
    expect(quad.object.equals(originalObject)).toBe(true);
    expect(quad.graph.equals(originalGraph)).toBe(true);
    
    // Multiple accesses return same results
    expect(quad.subject.equals(originalSubject)).toBe(true);
    expect(quad.predicate.equals(originalPredicate)).toBe(true);
  }));
  
  // Input modifications don't affect created terms
  fc.assert(fc.property(fc.string(), (str) => {
    let mutableStr = str;
    const literal = factory.literal(mutableStr);
    mutableStr = "modified";
    expect(literal.value).toBe(str);
  }));
  
  fc.assert(fc.property(arbIri, (iri) => {
    let mutableIri = iri;
    const node = factory.namedNode(mutableIri);
    mutableIri = "http://modified.example.org";
    expect(node.value).toBe(iri);
  }));
});

test("Namespace Proxy Properties", () => {
  // Namespace proxies generate consistent NamedNodes
  fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 20 }), (localName) => {
    const node1 = XSD[localName];
    const node2 = XSD[localName];
    expect(node1.equals(node2)).toBe(true);
    expect(node1.value).toBe(`http://www.w3.org/2001/XMLSchema#${localName}`);
  }));

  // Test all exported namespaces
  const namespaces = [XSD, RDF, RDFS, OWL, DC, DCTERMS, FOAF, SKOS, VCARD];
  fc.assert(fc.property(fc.string({ minLength: 1, maxLength: 20 }), (localName) => {
    namespaces.forEach(ns => {
      const node = ns[localName];
      expect(node.termType).toBe("NamedNode");
      expect(node.value).toContain(localName);
    });
  }));
});
