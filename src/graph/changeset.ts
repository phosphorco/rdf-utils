import {Graph, ImmutableGraph, MutableGraph, QueryOptions} from '../graph';
import { NamedNode, BlankNode, DefaultGraph, Quad, Quad_Subject, factory  } from '../rdf';
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

  constructor(graphOrIRI?: ImmutableSetGraph | NamedNode | DefaultGraph) {
    // Determine the IRI to pass to super and whether we should remap quads to this graph
    let iri: NamedNode | DefaultGraph;
    let graph: ImmutableSetGraph;

    if (!graphOrIRI) {
      // No argument provided
      graph = new ImmutableSetGraph();
      iri = graph.iri as NamedNode;
    } else if ('termType' in graphOrIRI && (graphOrIRI.termType === 'NamedNode' || graphOrIRI.termType === 'DefaultGraph')) {
      // A NamedNode or DefaultGraph was provided - user wants to target this specific graph
      graph = new ImmutableSetGraph();
      iri = graphOrIRI as NamedNode | DefaultGraph;
    } else {
      // A Graph was provided
      graph = graphOrIRI as ImmutableSetGraph;
      iri = graph.iri as NamedNode;
    }

    // Call super with the IRI
    super(iri);

    // Now set instance properties after super() has been called
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

  async sparql(query: SparqlQuery, options?: QueryOptions) {
    return await this.current.sparql(query, options);
  }

  add(quads: Iterable<rdfjs.Quad>): this {
    const delta = [...quads].map(q => {
      const g = q.graph.termType === 'DefaultGraph' ? this.iri : q.graph;
      return factory.quad(q.subject, q.predicate, q.object, g);
    });

    this.removed = this.removed.subtract(delta);
    this.added = this.added.concat(delta);
    this.current = this.current.add(delta);
    return this;
  }

  remove(quads: Iterable<rdfjs.Quad>): this {
    const delta = Set([...quads].map(q => {
      const g = q.graph.termType === 'DefaultGraph' ? this.iri : q.graph;
      return factory.quad(q.subject, q.predicate, q.object, g);
    }));

    // Add to removed, UNLESS they were present in added, in which case they are just removed from that
    this.removed = this.removed.concat(delta.subtract(this.added));

    this.added = this.added.subtract(delta);
    this.current = this.current.remove(delta);
    return this;
  }

  deleteAll(): void {
    this.remove(this.current.quads());
  }

  withIri(iri: NamedNode | DefaultGraph | undefined): this {
    const resolvedIri = iri || factory.defaultGraph();

    // Create new ChangeSetGraph with the current graph remapped to the new IRI
    const newGraph = new ChangeSetGraph(this.current.withIri(resolvedIri));

    // Remap the added/removed changesets to use the new IRI
    newGraph.added = this.added.map(q =>
      factory.quad(q.subject, q.predicate, q.object, resolvedIri)
    ) as any;
    newGraph.removed = this.removed.map(q =>
      factory.quad(q.subject, q.predicate, q.object, resolvedIri)
    ) as any;

    return newGraph as this;
  }

  /**
   * Applies this changeset's delta to another graph
   * If a target graph IRI was provided to the constructor, quads will use that as their graph component
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

  resource<T extends rdfjs.Quad_Subject>(subject: T): resource.ResourceOf<T> {
    return resource.resource(this, subject);
  }

  bnode(prefix?: string): resource.ResourceOf<BlankNode> {
    return resource.resource(this, factory.blankNode(prefix));
  }
}
