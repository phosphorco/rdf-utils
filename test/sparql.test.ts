import { test, expect, describe } from 'bun:test';
import { Graph, ImmutableGraph, MutableGraph } from '../src/graph.js';
import { N3Graph } from '../src/graph/n3.js';
import { ImmutableSetGraph } from '../src/graph/immutable.js';
import { factory, namespace } from '../src/rdf.js';
import type { Quad } from '../src/rdf.js';
import type { Update } from 'sparqljs';

const EX = namespace('http://example.org/');
const FOAF = namespace('http://xmlns.com/foaf/0.1/');
const XSD = namespace('http://www.w3.org/2001/XMLSchema#');

// Test data - People and their relationships
const testQuads = [
  // Alice knows Bob and Charlie
  factory.quad(EX.alice, FOAF.knows, EX.bob),
  factory.quad(EX.alice, FOAF.knows, EX.charlie),
  
  // Names
  factory.quad(EX.alice, FOAF.name, factory.literal('Alice Smith')),
  factory.quad(EX.bob, FOAF.name, factory.literal('Bob Jones')),
  factory.quad(EX.charlie, FOAF.name, factory.literal('Charlie Brown')),
  
  // Ages
  factory.quad(EX.alice, EX.age, factory.literal('30', XSD.integer)),
  factory.quad(EX.bob, EX.age, factory.literal('25', XSD.integer)),
  
  // Bob knows Charlie back
  factory.quad(EX.bob, FOAF.knows, EX.charlie)
];

/**
 * Generic test suite for SPARQL functionality on Graph interface
 */
export function testSparqlInterface<G extends Graph<any>>(
  name: string,
  createGraph: () => Promise<G>,
  setupGraph: (graph: G, quads: Quad[]) => Promise<G>
) {
  describe(`${name} - SPARQL Interface`, () => {
    
    test('should execute simple SELECT query', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        SELECT ?name WHERE {
          ?person foaf:name ?name .
        }
      `;
      
      const bindings = [...await populatedGraph.select(query)];
      expect(bindings.length).toBe(3);
      
      // Assert that bindings.get() returns proper RDF.Term objects, not raw SPARQL results
      bindings.forEach(binding => {
        const nameTerm = binding.get('name');
        expect(nameTerm).toBeDefined();
        expect(nameTerm!.termType).toBe('Literal');
        expect(typeof nameTerm!.value).toBe('string');
        // Ensure it's not a raw SPARQL result object like {type: "literal", value: "..."}
        expect(nameTerm).not.toHaveProperty('type');
      });
      
      const names = bindings.map(b => b.get('name')?.value).sort();
      expect(names).toEqual(['Alice Smith', 'Bob Jones', 'Charlie Brown']);
    });

    test('should execute SELECT query with filter', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        PREFIX ex: <http://example.org/>
        SELECT ?name WHERE {
          ?person foaf:name ?name .
          ?person ex:age ?age .
          FILTER(?age > 26)
        }
      `;
      
      const bindings = [...await populatedGraph.select(query)];
      expect(bindings.length).toBe(1);
      
      // Assert proper RDF.Term is returned from bindings.get()
      const nameTerm = bindings[0].get('name');
      expect(nameTerm).toBeDefined();
      expect(nameTerm!.termType).toBe('Literal');
      expect(typeof nameTerm!.value).toBe('string');
      // Ensure it's not a raw SPARQL result object like {type: "literal", value: "..."}
      expect(nameTerm).not.toHaveProperty('type');
      
      expect(bindings[0].get('name')?.value).toBe('Alice Smith');
    });

    test('should execute SELECT query with multiple variables', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        PREFIX ex: <http://example.org/>
        SELECT ?person ?name ?age WHERE {
          ?person foaf:name ?name .
          ?person ex:age ?age .
        }
      `;
      
      const bindings = [...await populatedGraph.select(query)];
      expect(bindings.length).toBe(2);
      
      // Assert that bindings.get() returns proper RDF.Term objects per Bindings interface
      bindings.forEach(binding => {
        const personTerm = binding.get('person');
        const nameTerm = binding.get('name');
        const ageTerm = binding.get('age');
        
        // Person URIs should be NamedNode terms, not raw SPARQL objects like {type: "uri", value: "..."}
        expect(personTerm).toBeDefined();
        expect(personTerm!.termType).toBe('NamedNode');
        expect(typeof personTerm!.value).toBe('string');
        expect(personTerm).not.toHaveProperty('type');
        
        // Name literals should be Literal terms, not raw SPARQL objects like {type: "literal", value: "..."}
        expect(nameTerm).toBeDefined();
        expect(nameTerm!.termType).toBe('Literal');
        expect(typeof nameTerm!.value).toBe('string');
        expect(nameTerm).not.toHaveProperty('type');
        
        // Age literals should be typed Literal terms
        expect(ageTerm).toBeDefined();
        expect(ageTerm!.termType).toBe('Literal');
        expect(typeof ageTerm!.value).toBe('string');
        expect(ageTerm).not.toHaveProperty('type');
      });
      
      // Check that we have both person and their data
      const results = bindings.map(b => ({
        person: b.get('person')?.value,
        name: b.get('name')?.value,
        age: b.get('age')?.value
      }));
      
      expect(results).toEqual(expect.arrayContaining([
        expect.objectContaining({
          person: EX.alice.value,
          name: 'Alice Smith',
          age: '30'
        }),
        expect.objectContaining({
          person: EX.bob.value,
          name: 'Bob Jones',
          age: '25'
        })
      ]));
    });

    test('should execute ASK query - true case', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        PREFIX ex: <http://example.org/>
        ASK {
          ex:alice foaf:knows ex:bob .
        }
      `;
      
      const result = await populatedGraph.ask(query);
      expect(result).toBe(true);
    });

    test('should execute ASK query - false case', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        PREFIX ex: <http://example.org/>
        ASK {
          ex:charlie foaf:knows ex:alice .
        }
      `;
      
      const result = await populatedGraph.ask(query);
      expect(result).toBe(false);
    });

    test('should execute ASK query with pattern', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        ASK {
          ?person foaf:name "Alice Smith" .
        }
      `;
      
      const result = await populatedGraph.ask(query);
      expect(result).toBe(true);
    });

    test('should execute CONSTRUCT query', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        PREFIX ex: <http://example.org/>
        CONSTRUCT {
          ?person ex:hasName ?name .
        } WHERE {
          ?person foaf:name ?name .
        }
      `;
      
      const resultGraph = await populatedGraph.construct(query);
      const resultQuads = [...await resultGraph.quads()];
      
      expect(resultQuads.length).toBe(3);
      
      // Check that all results have the new predicate
      const predicates = resultQuads.map(q => q.predicate.value);
      expect(predicates.every(p => p === 'http://example.org/hasName')).toBe(true);
      
      // Check that we have the expected names
      const names = resultQuads.map(q => q.object.value).sort();
      expect(names).toEqual(['Alice Smith', 'Bob Jones', 'Charlie Brown']);
    });

    test('should execute CONSTRUCT query with filter', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        PREFIX ex: <http://example.org/>
        CONSTRUCT {
          ?person ex:isAdult true .
        } WHERE {
          ?person ex:age ?age .
          FILTER(?age >= 25)
        }
      `;
      
      const resultGraph = await populatedGraph.construct(query);
      const resultQuads = [...await resultGraph.quads()];
      
      expect(resultQuads.length).toBe(2);
      
      // Check subjects are Alice and Bob (both >= 25)
      const subjects = resultQuads.map(q => q.subject.value).sort();
      expect(subjects).toEqual([EX.alice.value, EX.bob.value].sort());
      
      // Check all objects are boolean true
      const objects = resultQuads.map(q => q.object.value);
      expect(objects.every(o => o === 'true')).toBe(true);
    });

    test('should handle empty results in SELECT', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        PREFIX ex: <http://example.org/>
        SELECT ?name WHERE {
          ex:nonexistent foaf:name ?name .
        }
      `;
      
      const bindings = [...await populatedGraph.select(query)];
      expect(bindings.length).toBe(0);
    });

    test('should handle empty results in CONSTRUCT', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph, testQuads);
      
      const query = `
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        PREFIX ex: <http://example.org/>
        CONSTRUCT {
          ?person ex:isChild true .
        } WHERE {
          ?person ex:age ?age .
          FILTER(?age < 18)
        }
      `;
      
      const resultGraph = await populatedGraph.construct(query);
      const resultQuads = [...await resultGraph.quads()];
      
      expect(resultQuads.length).toBe(0);
    });
  });
}

/**
 * Generic test suite for SPARQL UPDATE functionality on MutableGraph interface
 */
export function testSparqlUpdateInterface<G extends MutableGraph<any>>(
  name: string,
  createGraph: () => Promise<G>,
  setupGraph: (graph: G, quads: Quad[]) => Promise<G>
) {
  describe(`${name} - SPARQL UPDATE Interface`, () => {

    test('INSERT DATA adds triples', async () => {
      const graph = await createGraph();

      await graph.update(`
        PREFIX ex: <http://example.org/>
        INSERT DATA {
          ex:subject ex:predicate "value" .
        }
      `);

      const quads = [...await graph.quads()];
      expect(quads.length).toBe(1);
      expect(quads[0].subject.value).toBe('http://example.org/subject');
      expect(quads[0].predicate.value).toBe('http://example.org/predicate');
      expect(quads[0].object.value).toBe('value');
    });

    test('DELETE DATA removes triples', async () => {
      const graph = await setupGraph(await createGraph(), testQuads);
      const before = [...await graph.quads()].length;

      await graph.update(`
        PREFIX ex: <http://example.org/>
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        DELETE DATA {
          ex:alice foaf:knows ex:bob .
        }
      `);

      const after = [...await graph.quads()].length;
      expect(after).toBe(before - 1);

      // Verify the specific triple is gone
      const remaining = [...await graph.quads()];
      const aliceKnowsBob = remaining.find(q =>
        q.subject.value === EX.alice.value &&
        q.predicate.value === FOAF.knows.value &&
        q.object.value === EX.bob.value
      );
      expect(aliceKnowsBob).toBeUndefined();
    });

    test('DELETE WHERE with pattern matching', async () => {
      const graph = await setupGraph(await createGraph(), testQuads);

      await graph.update(`
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        DELETE WHERE {
          ?s foaf:knows ?o .
        }
      `);

      const quads = [...await graph.quads()];
      const knowsTriples = quads.filter(q =>
        q.predicate.value === FOAF.knows.value
      );
      expect(knowsTriples.length).toBe(0);
    });

    test('INSERT-DELETE combined operation', async () => {
      const graph = await setupGraph(await createGraph(), testQuads);

      await graph.update(`
        PREFIX ex: <http://example.org/>
        PREFIX foaf: <http://xmlns.com/foaf/0.1/>
        DELETE { ?person foaf:name ?oldName }
        INSERT { ?person foaf:name "Updated Name" }
        WHERE {
          ?person foaf:name ?oldName .
          FILTER(?person = ex:alice)
        }
      `);

      const quads = [...await graph.quads()];
      const aliceName = quads.find(q =>
        q.subject.value === EX.alice.value &&
        q.predicate.value === FOAF.name.value
      );
      expect(aliceName?.object.value).toBe('Updated Name');
    });

    test('no-op when WHERE matches nothing', async () => {
      const graph = await setupGraph(await createGraph(), testQuads);
      const before = [...await graph.quads()].length;

      await graph.update(`
        PREFIX ex: <http://example.org/>
        DELETE { ?s ?p ?o }
        WHERE {
          ex:nonexistent ?p ?o .
          ?s ?p ?o .
        }
      `);

      const after = [...await graph.quads()].length;
      expect(after).toBe(before);
    });

    test('rejects invalid syntax', async () => {
      const graph = await createGraph();

      await expect(graph.update('INVALID SYNTAX HERE')).rejects.toThrow();
    });
  });
}

// Test against concrete implementations
testSparqlInterface(
  'N3Graph',
  async () => new N3Graph(),
  async (graph, quads) => {
    await graph.add(quads);
    return graph;
  }
);

testSparqlInterface(
  'ImmutableSetGraph',
  async () => new ImmutableSetGraph(),
  async (graph, quads) => {
    return await graph.add(quads);
  }
);

// Test SPARQL UPDATE on MutableGraph implementations
testSparqlUpdateInterface(
  'N3Graph',
  async () => new N3Graph(),
  async (graph, quads) => {
    graph.add(quads);
    return graph;
  }
);