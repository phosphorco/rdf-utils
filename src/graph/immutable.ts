import { Set, ValueObject } from 'immutable';
import { QueryEngine } from '@comunica/query-sparql';
import { translate } from 'sparqlalgebrajs';
import {  SparqlQuery } from 'sparqljs';
import type { Source, Stream, Term } from '@rdfjs/types';
import * as rdfjs from '@rdfjs/types';
import { ImmutableGraph, QueryOptions } from '../graph';
import { NamedNode, DefaultGraph, Quad, factory } from '../rdf';
import { BaseGraph } from './base';
import { Readable } from 'stream';
import * as n3 from 'n3';

export class ImmutableSetGraph extends BaseGraph<true> implements ImmutableGraph<true>, Source<Quad>, ValueObject {
  public data: Set<Quad>;
  private queryEngine: QueryEngine;

  constructor(iri?: NamedNode | DefaultGraph, quads?: Iterable<Quad> | Set<Quad>) {
    super(iri);
    if (quads && Set.isSet(quads)) {
      this.data = quads as Set<Quad>;
    } else {
      this.data = quads ? Set(quads) : Set<Quad>();
    }
    this.queryEngine = new QueryEngine();
  }

  quads() {
    return this.data.values();
  }

  find(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null): Iterable<Quad> {
    return this.data.filter(quad => {
      if (subject && !quad.subject.equals(subject)) return false;
      if (predicate && !quad.predicate.equals(predicate)) return false;
      if (object && !quad.object.equals(object)) return false;
      if (graph && !quad.graph.equals(graph)) return false;
      return true;
    });
  }

  match(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null): Stream<Quad> {
    return Readable.from(this.find(subject, predicate, object, graph));
  }

  async sparql(query: SparqlQuery, options?: QueryOptions) {
    return await this.queryEngine.query(translate(query), { sources: [this] });
  }

  add(quads: Iterable<rdfjs.Quad>): this {
    const newQuadsSet = this.data.withMutations(mutableSet => {
      for (const quad of quads) {
        const g = quad.graph.termType === 'DefaultGraph' ? this.iri : quad.graph;
        mutableSet = mutableSet.add(factory.quad(quad.subject, quad.predicate, quad.object, g));
      }
    });

    return new ImmutableSetGraph(this.iri as NamedNode, newQuadsSet) as this;
  }

  remove(quads: Iterable<rdfjs.Quad>): this {
    const newQuadsSet = this.data.withMutations(mutableSet => {
      for (const quad of quads) {
        const g = quad.graph.termType === 'DefaultGraph' ? this.iri : quad.graph;
        mutableSet = mutableSet.remove(factory.quad(quad.subject, quad.predicate, quad.object, g));
      }
    });

    return new ImmutableSetGraph(this.iri as NamedNode, newQuadsSet) as this;
  }



  equals(other: unknown): boolean {
    if (!(other instanceof ImmutableSetGraph)) return false;
    return this.data.equals(other.data);
  }

  hashCode(): number {
    return this.data.hashCode();
  }
}
