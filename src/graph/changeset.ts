import {Graph, ImmutableGraph, MutableGraph} from '../graph';
import { NamedNode, Quad  } from '../rdf';
import { BaseGraph } from './base';
import { SparqlQuery } from 'sparqljs';
import * as rdfjs from '@rdfjs/types';
import { Set } from 'immutable';
import { ImmutableSetGraph } from './immutable';
import * as n3 from 'n3';

export class ChangeSetGraph extends BaseGraph<true> {
  private original: ImmutableSetGraph;
  public current: ImmutableSetGraph;

  constructor(graph: ImmutableSetGraph) {
    super(graph.iri as NamedNode);
    this.original = graph;
    this.current = graph;
  }


  quads(): Iterable<Quad> {
    return this.current.quads();
  }

  find(subject?: rdfjs.Term | null, predicate?: rdfjs.Term | null, object?: rdfjs.Term | null, graph?: rdfjs.Term | null): Iterable<Quad> {
    return this.current.find(subject, predicate, object, graph);
  }

  async sparql(query: SparqlQuery) {
    return await this.current.sparql(query);
  }

  add(quads: Iterable<rdfjs.Quad>): this {
    this.current = this.current.add(quads);
    return this;
  }

  remove(quads: Iterable<rdfjs.Quad>): this {
    this.current = this.current.remove(quads);
    return this;
  }

  deleteAll(): void {
    this.current = new ImmutableSetGraph(this.iri as NamedNode);
  }

  /**
   * Returns quads that have been added since the original state
   */
  added(): Set<Quad> {
    return this.current.data.subtract(this.original.data);
  }

  /**
   * Returns quads that have been removed since the original state
   */
  removed(): Set<Quad> {
    return this.original.data.subtract(this.current.data);
  }

  /**
   * Applies this changeset's delta to another graph
   */
  async applyDelta<T extends MutableGraph<any> | ImmutableGraph<any>>(other: T): Promise<T> {
    const added = this.added();
    const removed = this.removed();
    
    if (added.size > 0) {
      other = await other.add(added) as T;
    }
    if (removed.size > 0) {
      other = await other.remove(removed) as T;
    }
    
    return other;
  }

  toString(format?: string): string {
    return new n3.Writer({ format }).quadsToString([...this.quads()]);
  }

  saveToFile(path: string, format?: string): void {
    const content = new n3.Writer({ format }).quadsToString([...this.quads()]);
    require('fs').writeFileSync(path, content, 'utf8');
  }
}
