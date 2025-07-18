import { test, expect, describe } from 'bun:test';
import { Graph } from '../src/graph.ts';
import { N3Graph } from '../src/graph/n3.ts';
import { ImmutableSetGraph } from '../src/graph/immutable.ts';
import { factory, FOAF, namespace } from '../src/rdf.ts';
import { pull, PullExpr } from '../src/pull.ts';
import type { Quad, NamedNode } from '../src/rdf.ts';

// Test data namespace
const PERSON = namespace('http://example.com/person/');
const DC = namespace('http://purl.org/dc/elements/1.1/');

// Test data URIs from foaf-social.ttl
const john = PERSON.john;
const jane = PERSON.jane;
const bob = PERSON.bob;
const alice = PERSON.alice;
const charlie = PERSON.charlie;

const johnHomepage = factory.namedNode('http://johndoe.com');
const janeHomepage = factory.namedNode('http://janesmith.com');

/**
 * Generic test suite for Pull interface
 */
export function testPullInterface<G extends Graph<any>>(
  name: string,
  createGraph: () => Promise<G>,
  setupGraph: (graph: G) => Promise<G>
) {
  describe(`${name} - Pull Interface`, () => {
    
    test('should pull single property', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [FOAF.name];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(1);
      expect(quads[0].subject.equals(john)).toBe(true);
      expect(quads[0].predicate.equals(FOAF.name)).toBe(true);
      expect(quads[0].object.value).toBe('John Doe');
    });
    
    test('should pull multiple properties', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [FOAF.name, FOAF.age];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(2);
      
      const nameQuad = quads.find(q => q.predicate.equals(FOAF.name));
      const ageQuad = quads.find(q => q.predicate.equals(FOAF.age));
      
      expect(nameQuad).toBeDefined();
      expect(ageQuad).toBeDefined();
      expect(nameQuad!.object.value).toBe('John Doe');
      expect(ageQuad!.object.value).toBe('30');
    });
    
    test('should handle constraint with string value', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [[FOAF.name, 'John Doe']];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(1);
      expect(quads[0].subject.equals(john)).toBe(true);
      expect(quads[0].predicate.equals(FOAF.name)).toBe(true);
      expect(quads[0].object.value).toBe('John Doe');
    });
    
    test('should handle constraint with number value', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);

      const pullExpr: PullExpr = [[FOAF.age, 30]];
      const result = await pull(populatedGraph, pullExpr, john);

      const quads = [...await result.quads()];
      expect(quads.length).toBe(1);
      expect(quads[0].subject.equals(john)).toBe(true);
      expect(quads[0].predicate.equals(FOAF.age)).toBe(true);
      expect(quads[0].object.value).toBe('30');
    });
    
    test('should handle constraint with boolean value', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [[FOAF.active, true]];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(1);
      expect(quads[0].subject.equals(john)).toBe(true);
      expect(quads[0].predicate.equals(FOAF.active)).toBe(true);
      expect(quads[0].object.value).toBe('true');
    });
    
    test('should handle constraint with false boolean value', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [[FOAF.active, false]];
      const result = await pull(populatedGraph, pullExpr, bob);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(1);
      expect(quads[0].subject.equals(bob)).toBe(true);
      expect(quads[0].predicate.equals(FOAF.active)).toBe(true);
      expect(quads[0].object.value).toBe('false');
    });
    
    test('should handle constraint with NamedNode value', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [[FOAF.knows, jane]];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(1);
      expect(quads[0].subject.equals(john)).toBe(true);
      expect(quads[0].predicate.equals(FOAF.knows)).toBe(true);
      expect(quads[0].object.equals(jane)).toBe(true);
    });
    
    test('should handle constraint with undefined value (variable)', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [[FOAF.name, undefined]];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(1);
      expect(quads[0].subject.equals(john)).toBe(true);
      expect(quads[0].predicate.equals(FOAF.name)).toBe(true);
      expect(quads[0].object.value).toBe('John Doe');
    });
    
    test('should handle mixed property types', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,                   // Simple property
        [FOAF.age, 30],             // Constraint with number
        [FOAF.knows, undefined]      // Constraint with variable
      ];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(3);
      
      const nameQuad = quads.find(q => q.predicate.equals(FOAF.name));
      const ageQuad = quads.find(q => q.predicate.equals(FOAF.age));
      const knowsQuad = quads.find(q => q.predicate.equals(FOAF.knows));
      
      expect(nameQuad).toBeDefined();
      expect(ageQuad).toBeDefined();
      expect(knowsQuad).toBeDefined();
      expect(nameQuad!.object.value).toBe('John Doe');
      expect(ageQuad!.object.value).toBe('30');
      expect(knowsQuad!.object.equals(jane)).toBe(true);
    });
    
    test('should handle multiple relationships', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      // Jane knows both John and Bob
      const pullExpr: PullExpr = [FOAF.knows];
      const result = await pull(populatedGraph, pullExpr, jane);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(2);
      
      const objects = quads.map(q => q.object.value);
      expect(objects).toContain(john.value);
      expect(objects).toContain(bob.value);
    });
    
    test('should handle non-existent property', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const nonExistentProp = factory.namedNode('http://example.org/nonexistent');
      const pullExpr: PullExpr = [nonExistentProp];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(0);
    });
    
    test('should handle non-existent starting resource', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const nonExistentResource = factory.namedNode('http://example.org/nonexistent');
      const pullExpr: PullExpr = [FOAF.name];
      const result = await pull(populatedGraph, pullExpr, nonExistentResource);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(0);
    });
    
    test('should handle failed constraint match', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [[FOAF.name, 'Wrong Name']];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(0);
    });
    
    test('should handle constraint with wrong type', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [[FOAF.age, 'thirty']]; // String instead of number
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(0);
    });
    
    test('should handle multiple constraints', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        [FOAF.name, 'John Doe'],
        [FOAF.age, 30]
      ];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(2);
      
      const nameQuad = quads.find(q => q.predicate.equals(FOAF.name));
      const ageQuad = quads.find(q => q.predicate.equals(FOAF.age));
      
      expect(nameQuad).toBeDefined();
      expect(ageQuad).toBeDefined();
      expect(nameQuad!.object.value).toBe('John Doe');
      expect(ageQuad!.object.value).toBe('30');
    });
    
    test('should handle partial constraint match', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        [FOAF.name, 'John Doe'],  // This matches
        [FOAF.age, 25]            // This doesn't match (John is 30)
      ];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(0); // No quads should be returned when not all constraints match
    });
    
    test('should work without explicit starting resource', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [FOAF.name];
      const result = await pull(populatedGraph, pullExpr); // No starting resource
      
      const quads = [...await result.quads()];
      expect(quads.length).toBeGreaterThan(0); // Should find names from any resource
    });
    
    test('should handle person without email property', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      // Charlie doesn't have an email in the test data
      const pullExpr: PullExpr = [FOAF.email];
      const result = await pull(populatedGraph, pullExpr, charlie);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(0);
    });
    
    test('should handle different property combinations for different people', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      // Test Alice who has friends but no knows relationships
      const pullExpr: PullExpr = [FOAF.name, FOAF.friend];
      const result = await pull(populatedGraph, pullExpr, alice);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(3); // 1 name + 2 friends (jane and bob)
      
      const nameQuad = quads.find(q => q.predicate.equals(FOAF.name));
      const friendQuads = quads.filter(q => q.predicate.equals(FOAF.friend));
      
      expect(nameQuad).toBeDefined();
      expect(nameQuad!.object.value).toBe('Alice Johnson');
      expect(friendQuads.length).toBe(2);
      
      const friendObjects = friendQuads.map(q => q.object.value);
      expect(friendObjects).toContain(jane.value);
      expect(friendObjects).toContain(bob.value);
    });
    
    test('should handle complex property combinations', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,                   // Simple property
        FOAF.age,                    // Simple property
        [FOAF.knows, jane],         // Constraint with NamedNode
        [FOAF.email, undefined]      // Constraint with variable
      ];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(4);
      
      const predicates = quads.map(q => q.predicate.value);
      expect(predicates).toContain(FOAF.name.value);
      expect(predicates).toContain(FOAF.age.value);
      expect(predicates).toContain(FOAF.knows.value);
      expect(predicates).toContain(FOAF.email.value);
    });
    
    test('should handle constraint matching homepage URI', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [[FOAF.homepage, johnHomepage]];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(1);
      expect(quads[0].subject.equals(john)).toBe(true);
      expect(quads[0].predicate.equals(FOAF.homepage)).toBe(true);
      expect(quads[0].object.equals(johnHomepage)).toBe(true);
    });
    
    // Wildcard tests
    test('should pull all properties with wildcard', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = ['*'];
      const result = await pull(populatedGraph, pullExpr, john);

      const quads = [...await result.quads()];
      expect(quads.length).toBe(8); // John has 8 properties including rdf:type
      
      const predicates = quads.map(q => q.predicate.value);
      expect(predicates).toContain(FOAF.name.value);
      expect(predicates).toContain(FOAF.age.value);
      expect(predicates).toContain(FOAF.email.value);
      expect(predicates).toContain(FOAF.active.value);
      expect(predicates).toContain(FOAF.knows.value);
      expect(predicates).toContain(FOAF.friend.value);
      expect(predicates).toContain(FOAF.homepage.value);
      expect(predicates).toContain('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
    });
    
    test('should handle wildcard with specific properties', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = ['*', FOAF.name];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(8); // Should not duplicate the name property
      
      const nameQuads = quads.filter(q => q.predicate.equals(FOAF.name));
      expect(nameQuads.length).toBe(1);
      expect(nameQuads[0].object.value).toBe('John Doe');
    });
    
    test('should handle wildcard with constraints', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = ['*', [FOAF.age, 30]];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(8); // All properties since constraint matches
      
      const ageQuad = quads.find(q => q.predicate.equals(FOAF.age));
      expect(ageQuad).toBeDefined();
      expect(ageQuad!.object.value).toBe('30');
    });
    
    test('should handle wildcard with failing constraint', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = ['*', [FOAF.age, 25]]; // John's age is 30, not 25
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(0); // No results when constraint fails
    });
    
    test('should handle wildcard for person with different properties', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = ['*'];
      const result = await pull(populatedGraph, pullExpr, charlie);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(5); // Charlie has 5 properties: name, age, active, knows + rdf:type
      
      const predicates = quads.map(q => q.predicate.value);
      expect(predicates).toContain(FOAF.name.value);
      expect(predicates).toContain(FOAF.age.value);
      expect(predicates).toContain(FOAF.active.value);
      expect(predicates).toContain(FOAF.knows.value);
      expect(predicates).toContain('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
      
      // Charlie should not have email or homepage
      expect(predicates).not.toContain(FOAF.email.value);
      expect(predicates).not.toContain(FOAF.homepage.value);
    });
    
    test('should handle wildcard for person with multiple relationships', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = ['*'];
      const result = await pull(populatedGraph, pullExpr, jane);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(9); // Jane has 9 properties including 2 knows relationships
      
      const knowsQuads = quads.filter(q => q.predicate.equals(FOAF.knows));
      expect(knowsQuads.length).toBe(2); // Jane knows John and Bob
      
      const knowsObjects = knowsQuads.map(q => q.object.value);
      expect(knowsObjects).toContain(john.value);
      expect(knowsObjects).toContain(bob.value);
    });
    
    test('should handle wildcard without starting resource', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = ['*'];
      const result = await pull(populatedGraph, pullExpr); // No starting resource
      
      const quads = [...await result.quads()];
      expect(quads.length).toBeGreaterThan(0); // Should find all triples in the graph
      
      // Should contain triples from all subjects
      const subjects = new Set(quads.map(q => q.subject.value));
      expect(subjects.size).toBeGreaterThan(1); // Multiple subjects
    });
    
    test('should handle wildcard for non-existent resource', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const nonExistentResource = factory.namedNode('http://example.org/nonexistent');
      const pullExpr: PullExpr = ['*'];
      const result = await pull(populatedGraph, pullExpr, nonExistentResource);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(0);
    });
    
    test('should handle mixed wildcard and specific constraint patterns', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        '*',                        // All properties
        [FOAF.name, 'John Doe'],   // Specific constraint
        [FOAF.knows, undefined]     // Variable constraint
      ];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(8); // All John's properties since constraints match
      
      const nameQuad = quads.find(q => q.predicate.equals(FOAF.name));
      expect(nameQuad).toBeDefined();
      expect(nameQuad!.object.value).toBe('John Doe');
    });
    
    test('should handle wildcard with variable constraints', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        '*',
        [FOAF.age, undefined]   // Should match any age value
      ];
      const result = await pull(populatedGraph, pullExpr, bob);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(9); // All Bob's properties
      
      const ageQuad = quads.find(q => q.predicate.equals(FOAF.age));
      expect(ageQuad).toBeDefined();
      expect(ageQuad!.object.value).toBe('35');
    });
    
    // Nested lookup tests
    test('should handle basic nested lookup', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,
        [FOAF.knows, [FOAF.name]]  // Get name of people John knows
      ];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(3); // John's name + Jane's name + link node
      
      const johnNameQuad = quads.find(q => q.subject.equals(john) && q.predicate.equals(FOAF.name));
      const janeNameQuad = quads.find(q => q.subject.equals(jane) && q.predicate.equals(FOAF.name));
      const link = quads.find(q => q.predicate.equals(FOAF.knows));

      expect(link).toBeDefined();
      expect(johnNameQuad).toBeDefined();
      expect(johnNameQuad!.object.value).toBe('John Doe');
      expect(janeNameQuad).toBeDefined();
      expect(janeNameQuad!.object.value).toBe('Jane Smith');
    });
    
    test('should handle nested lookup with multiple properties', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,
        [FOAF.knows, [FOAF.name, FOAF.age]]  // Get name and age of people John knows
      ];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(4); // John's name + Jane's name + Jane's age + link
      
      const johnNameQuad = quads.find(q => q.subject.equals(john) && q.predicate.equals(FOAF.name));
      const janeNameQuad = quads.find(q => q.subject.equals(jane) && q.predicate.equals(FOAF.name));
      const janeAgeQuad = quads.find(q => q.subject.equals(jane) && q.predicate.equals(FOAF.age));
      
      expect(johnNameQuad).toBeDefined();
      expect(johnNameQuad!.object.value).toBe('John Doe');
      expect(janeNameQuad).toBeDefined();
      expect(janeNameQuad!.object.value).toBe('Jane Smith');
      expect(janeAgeQuad).toBeDefined();
      expect(janeAgeQuad!.object.value).toBe('25');
    });
    
    test('should handle nested lookup with wildcard', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,
        [FOAF.knows, ['*']]  // Get all properties of people John knows
      ];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(11); // John's name (1) + Jane's all properties (9) + link(1)
      
      const johnQuads = quads.filter(q => q.subject.equals(john));
      const janeQuads = quads.filter(q => q.subject.equals(jane));
      
      expect(johnQuads.length).toBe(2);
      expect(janeQuads.length).toBe(9);
      
      // Verify John has his name
      expect(johnQuads[0].predicate.equals(FOAF.name)).toBe(true);
      expect(johnQuads[0].object.value).toBe('John Doe');
      
      // Verify Jane has all her properties
      const janePredicates = janeQuads.map(q => q.predicate.value);
      expect(janePredicates).toContain(FOAF.name.value);
      expect(janePredicates).toContain(FOAF.age.value);
      expect(janePredicates).toContain(FOAF.email.value);
      expect(janePredicates).toContain('http://www.w3.org/1999/02/22-rdf-syntax-ns#type');
    });
    
    test('should handle multiple nested lookups', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,
        [FOAF.knows, [FOAF.name]],    // People John knows
        [FOAF.friend, [FOAF.name]]    // People John is friends with
      ];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(5); // John's name + Jane's name + Bob's name + 2 links.
      
      const johnNameQuad = quads.find(q => q.subject.equals(john) && q.predicate.equals(FOAF.name));
      const janeNameQuad = quads.find(q => q.subject.equals(jane) && q.predicate.equals(FOAF.name));
      const bobNameQuad = quads.find(q => q.subject.equals(bob) && q.predicate.equals(FOAF.name));
      
      expect(johnNameQuad).toBeDefined();
      expect(johnNameQuad!.object.value).toBe('John Doe');
      expect(janeNameQuad).toBeDefined();
      expect(janeNameQuad!.object.value).toBe('Jane Smith');
      expect(bobNameQuad).toBeDefined();
      expect(bobNameQuad!.object.value).toBe('Bob Wilson');
    });
    
    test('should handle nested lookup with constraints', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,
        [FOAF.knows, [FOAF.name, [FOAF.age, 25]]]  // Get name of people John knows who are 25
      ];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(4); // John's name + Jane's name + Jane's age constraint + link
      
      const johnNameQuad = quads.find(q => q.subject.equals(john) && q.predicate.equals(FOAF.name));
      const janeNameQuad = quads.find(q => q.subject.equals(jane) && q.predicate.equals(FOAF.name));
      const janeAgeQuad = quads.find(q => q.subject.equals(jane) && q.predicate.equals(FOAF.age));
      
      expect(johnNameQuad).toBeDefined();
      expect(johnNameQuad!.object.value).toBe('John Doe');
      expect(janeNameQuad).toBeDefined();
      expect(janeNameQuad!.object.value).toBe('Jane Smith');
      expect(janeAgeQuad).toBeDefined();
      expect(janeAgeQuad!.object.value).toBe('25');
    });
    
    test('should handle nested lookup with failing constraints', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,
        [FOAF.knows, [FOAF.name, [FOAF.age, 30]]]  // Get name of people John knows who are 30 (none)
      ];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(1); // Only John's name (Jane is 25, not 30)
      
      const johnNameQuad = quads.find(q => q.subject.equals(john) && q.predicate.equals(FOAF.name));
      expect(johnNameQuad).toBeDefined();
      expect(johnNameQuad!.object.value).toBe('John Doe');
    });
    
    test('should handle nested lookup with person having multiple relationships', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,
        [FOAF.knows, [FOAF.name]]  // Get names of people Jane knows
      ];
      const result = await pull(populatedGraph, pullExpr, jane);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(5); // Jane's name + John's name + Bob's name + 2 links
      
      const janeNameQuad = quads.find(q => q.subject.equals(jane) && q.predicate.equals(FOAF.name));
      const johnNameQuad = quads.find(q => q.subject.equals(john) && q.predicate.equals(FOAF.name));
      const bobNameQuad = quads.find(q => q.subject.equals(bob) && q.predicate.equals(FOAF.name));
      
      expect(janeNameQuad).toBeDefined();
      expect(janeNameQuad!.object.value).toBe('Jane Smith');
      expect(johnNameQuad).toBeDefined();
      expect(johnNameQuad!.object.value).toBe('John Doe');
      expect(bobNameQuad).toBeDefined();
      expect(bobNameQuad!.object.value).toBe('Bob Wilson');
    });
    
    test('should handle nested lookup with non-existent relationship', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,
        [FOAF.knows, [FOAF.name]]  // Alice doesn't know anyone
      ];
      const result = await pull(populatedGraph, pullExpr, alice);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(1); // Alice's name

      const aliceNameQuad = quads.find(q => q.subject.equals(alice) && q.predicate.equals(FOAF.name));

      expect(aliceNameQuad).toBeDefined();
      expect(aliceNameQuad!.object.value).toBe('Alice Johnson');

    });
    
    test('should handle nested lookup with empty nested expression', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,
        [FOAF.knows, []]  // Empty nested expression
      ];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(2); // Only John's name + link
      
      const johnNameQuad = quads.find(q => q.subject.equals(john) && q.predicate.equals(FOAF.name));
      expect(johnNameQuad).toBeDefined();
      expect(johnNameQuad!.object.value).toBe('John Doe');
    });
    
    test('should handle deep nested lookup', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,
        [FOAF.knows, [FOAF.name, [FOAF.knows, [FOAF.name]]]]  // John -> Jane -> John/Bob
      ];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(6); // John name + John/jane link + jane name + jane/john link + jane/bob link + bob name.
      
      const subjects = new Set(quads.map(q => q.subject.value));
      expect(subjects.size).toBe(3); // John, Jane, Bob
      expect(subjects).toContain(john.value);
      expect(subjects).toContain(jane.value);
      expect(subjects).toContain(bob.value);
    });

    test('should handle nested lookup with no starting resource', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        [FOAF.knows, [FOAF.name]]  // Get names of people that anyone knows
      ];
      const result = await pull(populatedGraph, pullExpr); // No starting resource
      
      const quads = [...await result.quads()];
      expect(quads.length).toBeGreaterThan(0); // Should find nested relationships
      
      // Should include people who are known by others
      const subjects = new Set(quads.map(q => q.subject.value));
      expect(subjects).toContain(jane.value); // Jane is known by John and Bob
      expect(subjects).toContain(john.value); // John is known by Jane and Charlie
      expect(subjects).toContain(bob.value); // Bob is known by Jane
    });
    
    test('should handle nested lookup with person having no relationships', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,
        [FOAF.knows, [FOAF.name]]  // Alice doesn't have 'knows' relationships
      ];
      const result = await pull(populatedGraph, pullExpr, alice);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(1); // Only Alice's name
      
      const aliceNameQuad = quads.find(q => q.subject.equals(alice) && q.predicate.equals(FOAF.name));
      expect(aliceNameQuad).toBeDefined();
      expect(aliceNameQuad!.object.value).toBe('Alice Johnson');
    });
    
    // Recursive pull tests
    test('should handle recursive pull with basic syntax', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,
        [FOAF.knows, '...']  // Follow knows relationships recursively
      ];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBeGreaterThan(3); // Should include John -> Jane -> John/Bob paths
      
      // Should include all people reachable from John through knows relationships
      const subjects = new Set(quads.map(q => q.subject.value));
      expect(subjects).toContain(john.value);
      expect(subjects).toContain(jane.value); // John knows Jane
      expect(subjects).toContain(bob.value);   // Jane knows Bob
      expect(subjects).not.toContain(charlie.value); // Charlie knows John, but John doesn't know Charlie
    });
    
    test('should handle recursive pull with cycle detection', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,
        [FOAF.knows, '...']  // Should not infinite loop on circular relationships
      ];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      // Should not infinite loop and should include all reachable nodes
      const subjects = new Set(quads.map(q => q.subject.value));
      expect(subjects).toContain(john.value);
      expect(subjects).toContain(jane.value);
      expect(subjects).toContain(bob.value);
      expect(subjects).not.toContain(charlie.value); // Charlie knows John, but John doesn't know Charlie
    });
    
    test('should handle recursive pull with multiple relationship types', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,
        [FOAF.knows, '...'],
        [FOAF.friend, '...']
      ];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBeGreaterThan(5); // Should follow both knows and friend relationships
      
      const subjects = new Set(quads.map(q => q.subject.value));
      expect(subjects).toContain(john.value);
      expect(subjects).toContain(jane.value); // John knows Jane
      expect(subjects).toContain(bob.value); // John is friends with Bob
    });
    
    test('should handle recursive pull from isolated node', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,
        [FOAF.knows, '...']  // Alice has no knows relationships
      ];
      const result = await pull(populatedGraph, pullExpr, alice);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBe(1); // Only Alice's name
      
      const aliceNameQuad = quads.find(q => q.subject.equals(alice) && q.predicate.equals(FOAF.name));
      expect(aliceNameQuad).toBeDefined();
      expect(aliceNameQuad!.object.value).toBe('Alice Johnson');
    });
    
    test('should handle recursive pull with mixed recursive and non-recursive patterns', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,
        [FOAF.knows, '...'],  // Recursive knows
        [FOAF.friend, [FOAF.name]]  // Non-recursive friend
      ];
      const result = await pull(populatedGraph, pullExpr, john);

      const quads = [...await result.quads()];
      expect(quads.length).toBeGreaterThan(4); // Multiple relationship types
      
      const subjects = new Set(quads.map(q => q.subject.value));
      expect(subjects).toContain(john.value);
      expect(subjects).toContain(jane.value); // Through knows (recursive)
      expect(subjects).toContain(bob.value); // Through friend (direct) and knows (recursive via Jane)
    });
    
    test('should handle recursive pull with no starting resource', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,
        [FOAF.knows, '...']  // Find all recursive knows relationships
      ];
      const result = await pull(populatedGraph, pullExpr); // No starting resource

      const quads = [...await result.quads()];
      expect(quads.length).toBe(10); // Should find all foaf:knows relationships & names
      
      // Should include all people who are part of knows relationships
      const subjects = new Set(quads.map(q => q.subject.value));
      expect(subjects).toContain(john.value);
      expect(subjects).toContain(jane.value);
      expect(subjects).toContain(bob.value);
      expect(subjects).toContain(charlie.value); // Charlie should be included since no starting resource

      const objects = new Set(quads.map(q => q.object.value));
      expect(objects).toContain("Charlie Brown");
      expect(objects).toContain("John Doe");
      expect(objects).toContain("Alice Johnson");
      expect(objects).toContain("Jane Smith");
      expect(objects).toContain("Bob Wilson");
    });
    
    test('should handle recursive pull with transitive closure', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        [FOAF.knows, '...']  // Get all transitive knows relationships
      ];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBeGreaterThan(1); // Should include transitive relationships
      
      // Should include direct and indirect knows relationships
      const knowsQuads = quads.filter(q => q.predicate.equals(FOAF.knows));
      expect(knowsQuads.length).toBeGreaterThan(1); // More than just direct relationships
      
      const objects = new Set(knowsQuads.map(q => q.object.value));
      expect(objects).toContain(jane.value); // Direct: John knows Jane
      expect(objects).toContain(bob.value); // Indirect: John knows Jane, Jane knows Bob
    });
    
    test('should handle recursive pull combined with property selection', async () => {
      const graph = await createGraph();
      const populatedGraph = await setupGraph(graph);
      
      const pullExpr: PullExpr = [
        FOAF.name,
        FOAF.age,
        [FOAF.knows, '...']  // Recursive knows plus specific properties
      ];
      const result = await pull(populatedGraph, pullExpr, john);
      
      const quads = [...await result.quads()];
      expect(quads.length).toBeGreaterThan(5); // Properties plus recursive relationships
      
      const subjects = new Set(quads.map(q => q.subject.value));
      expect(subjects).toContain(john.value);
      expect(subjects).toContain(jane.value);
      expect(subjects).toContain(bob.value);
      expect(subjects).not.toContain(charlie.value); // Charlie knows John, but John doesn't know Charlie
      
      // Should include properties of all connected people
      const johnNameQuad = quads.find(q => q.subject.equals(john) && q.predicate.equals(FOAF.name));
      const janeNameQuad = quads.find(q => q.subject.equals(jane) && q.predicate.equals(FOAF.name));
      
      expect(johnNameQuad).toBeDefined();
      expect(janeNameQuad).toBeDefined();
    });
  });
}

describe(`Manual test`, () => {

  test('Sparql should work', async () => {

    const q = `
    CONSTRUCT {
      ?subj_3_r <http://xmlns.com/foaf/0.1/name> ?val_4_r.
      ?subj_3_r <http://xmlns.com/foaf/0.1/knows> ?recur_object_5_r.
    }
    WHERE {
      <http://example.com/person/john> (<http://xmlns.com/foaf/0.1/knows>*) ?subj_3.
      OPTIONAL { ?subj_3 <http://xmlns.com/foaf/0.1/name> ?val_4. }
      OPTIONAL { ?subj_3 <http://xmlns.com/foaf/0.1/knows> ?recur_object_5. }
      BIND(IF(BOUND(?subj_3), ?subj_3, <http://www.w3.org/1999/02/22-rdf-syntax-ns#filterMe>) AS ?subj_3_r)
      BIND(IF(BOUND(?val_4), ?val_4, <http://www.w3.org/1999/02/22-rdf-syntax-ns#filterMe>) AS ?val_4_r)
      BIND(IF(BOUND(?recur_object_5), ?recur_object_5, <http://www.w3.org/1999/02/22-rdf-syntax-ns#filterMe>) AS ?recur_object_5_r)
    }
     
`

    const g = await N3Graph.fromFile('test/data/foaf-social.ttl');
    const result = await g.construct(q);

  });
});

// Apply tests to concrete implementations
testPullInterface(
  'N3Graph',
  async () => new N3Graph(),
  async (graph) => {
    return await N3Graph.fromFile('test/data/foaf-social.ttl');
  }
);

testPullInterface(
  'ImmutableSetGraph',
  async () => new ImmutableSetGraph(),
  async (graph) => {
    const n3Graph = await N3Graph.fromFile('test/data/foaf-social.ttl');
    const quads = [...await n3Graph.quads()];
    return await graph.add(quads);
  }
);
