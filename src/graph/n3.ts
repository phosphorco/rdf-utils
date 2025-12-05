import * as n3 from 'n3';
import { QueryEngine } from '@comunica/query-sparql';
import { translate }from 'sparqlalgebrajs';
import {
  Parser,
  Generator,
  SelectQuery,
  AskQuery,
  ConstructQuery,
  Query,
  SparqlQuery,
  Update
} from 'sparqljs';
import type { Bindings, Term } from '@rdfjs/types';
import * as rdfjs from '@rdfjs/types';
import { MutableGraph, Graph, QueryOptions} from '../graph';
import { NamedNode, DefaultGraph, Quad, factory } from '../rdf';
import {BaseGraph, parseQuadsFromString, parseQuadsFromFile, parseQuadsFromStringAsync, parseQuadsFromFileAsync} from './base';
import {BaseQuad} from "n3";

export class N3Graph extends BaseGraph<true> implements MutableGraph<true> {
  private store: n3.Store<Quad, n3.Quad, Quad, Quad>;
  private queryEngine: QueryEngine;

  constructor(iri?: NamedNode) {
    super(iri);
    this.store = new n3.Store([], {factory: factory});
    this.queryEngine = new QueryEngine();
  }

  quads() {
    return this.store.match(null, null, null, null).toArray();
  }

  find(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null): Iterable<Quad> {

    //@ts-ignore - The type signatures for N3 store.match are incorrect
    // Apprently they accidentally use the N3.Term types (which are specific concrete classes) rather than the correct rdfjs.Term.
    // However, regular rdfjs.Term instance should work per the actual code.
    return this.store.match(subject, predicate, object, graph);
  }

  async sparql(query: SparqlQuery, options?: QueryOptions) {
    return await this.queryEngine.query(translate(query), { sources: [this.store] });
  }

  add(quads: Iterable<rdfjs.Quad>): this {
    for (const quad of quads) {
      const g = quad.graph.termType === 'DefaultGraph' ? this.iri : quad.graph;
      this.store.addQuad(factory.quad(quad.subject, quad.predicate, quad.object, g));
    }

    return this;
  }

  remove(quads: Iterable<rdfjs.Quad>): this {
    for (const quad of quads) {
      const g = quad.graph.termType === 'DefaultGraph' ? this.iri : quad.graph;
      this.store.removeQuad(factory.quad(quad.subject, quad.predicate, quad.object, g));
    }

    return this;
  }

  deleteAll(): void {
    // Remove all quads from this graph's context
    const quadsToRemove = this.store.match(null, null, null, null);
    for (const quad of quadsToRemove) {
      this.store.removeQuad(quad);
    }
  }

  async update(query: Update | string, options?: QueryOptions): Promise<void> {
    const parsedUpdate = this.prepareUpdate(query);
    const generator = new Generator({ prefixes: parsedUpdate.prefixes });
    const queryString = generator.stringify(parsedUpdate);

    await this.queryEngine.queryVoid(queryString, { sources: [this.store] });
  }

  withIri(iri: NamedNode | DefaultGraph | undefined): this {
    const newGraph = new N3Graph(iri as NamedNode | undefined);
    // Share the same store and queryEngine
    newGraph.store = this.store;
    newGraph.queryEngine = this.queryEngine;
    return newGraph as this;
  }

  static fromString(data: string, format?: string, baseIRI?: string): N3Graph {
    const graph = new N3Graph();
    const quads = parseQuadsFromString(data, format, baseIRI);
    graph.add(quads);
    return graph;
  }

  static fromFile(path: string, format?: string): N3Graph {
    const graph = new N3Graph();
    const quads = parseQuadsFromFile(path, format);
    graph.add(quads);
    return graph;
  }

  /**
   * Creates a new N3Graph from RDF data asynchronously. Supports RDF/XML, Turtle, N3, N-Quads, and TriG formats.
   * @param data - The RDF data as a string
   * @param format - Optional format (MIME type or format name). If not provided, will be detected from content.
   * @param baseIRI - Optional base IRI for relative IRIs
   * @returns Promise that resolves to a new N3Graph instance
   */
  static async fromStringAsync(data: string, format?: string, baseIRI?: string): Promise<N3Graph> {
    const graph = new N3Graph();
    const quads = await parseQuadsFromStringAsync(data, format, baseIRI);
    graph.add(quads);
    return graph;
  }

  /**
   * Creates a new N3Graph from an RDF file asynchronously. Automatically detects format from file extension or content.
   * @param path - Path to the RDF file
   * @param format - Optional explicit format (MIME type or format name)
   * @returns Promise that resolves to a new N3Graph instance
   */
  static async fromFileAsync(path: string, format?: string): Promise<N3Graph> {
    const graph = new N3Graph();
    const quads = await parseQuadsFromFileAsync(path, format);
    graph.add(quads);
    return graph;
  }
}
