import {Graph, ImmutableGraph, MutableGraph} from '../graph';
import { NamedNode, BlankNode, Quad, Quad_Subject, factory  } from '../rdf';
import { BaseGraph } from './base';
import { SparqlQuery } from 'sparqljs';
import * as rdfjs from '@rdfjs/types';
import { Set } from 'immutable';
import { ImmutableSetGraph } from './immutable';
import * as n3 from 'n3';
import * as resource from '../resource';

export class ChangeSetGraph extends BaseGraph<true> {
  public current: ImmutableSetGraph;
  public added: Set<Quad>;
  public removed: Set<Quad>;

  constructor(graph?: ImmutableSetGraph) {
    if(!graph) graph = new ImmutableSetGraph();
    super(graph.iri as NamedNode);
    this.current = graph;
    this.added = Set<Quad>();
    this.removed = Set<Quad>();
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
    const delta = [...quads].map(factory.fromQuad);
    this.removed = this.removed.subtract(delta);
    this.added = this.added.concat(delta);
    this.current = this.current.add(delta);
    return this;
  }

  remove(quads: Iterable<rdfjs.Quad>): this {
    const delta = Set([...quads].map(factory.fromQuad));

    // Add to removed, UNLESS they were present in added, in which case they are just removed from that
    this.removed = this.removed.concat(delta.subtract(this.added));

    this.added = this.added.subtract(delta);
    this.current = this.current.remove(delta);
    return this;
  }

  deleteAll(): void {
    this.remove(this.current.quads());
  }

  /**
   * Applies this changeset's delta to another graph
   */
  async applyDelta<T extends MutableGraph<any> | ImmutableGraph<any>>(other: T): Promise<T> {

    if (this.added.size > 0) {
      other = await other.add(this.added) as T;
    }
    if (this.removed.size > 0) {
      other = await other.remove(this.removed) as T;
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

  resource<T extends Quad_Subject>(subject: T): resource.ResourceOf<T> {
    return resource.resource(this, subject);
  }

  bnode(prefix?: string): resource.ResourceOf<BlankNode> {
    return resource.resource(this, factory.blankNode(prefix));
  }
}
