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
  SparqlQuery
} from 'sparqljs';
import type { Bindings, Term } from '@rdfjs/types';
import * as rdfjs from '@rdfjs/types';
import { MutableGraph, Graph} from '../graph';
import { NamedNode, DefaultGraph, Quad, factory } from '../rdf';
import {BaseGraph, parseQuadsFromString, parseQuadsFromFile} from './base';
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

  async sparql(query: SparqlQuery) {
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



  static async fromString(data: string, format?: string, baseIRI?: string): Promise<N3Graph> {
    const graph = new N3Graph();
    const quads = await parseQuadsFromString(data, format, baseIRI);
    await graph.add(quads);
    return graph;
  }

  static async fromFile(path: string, format?: string): Promise<N3Graph> {
    const graph = new N3Graph();
    const quads = await parseQuadsFromFile(path, format);
    await graph.add(quads);
    return graph;
  }
}
