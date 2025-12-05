import { NamedNode, Quad, BaseQuad, Term, Variable, DefaultGraph, Quad_Object, Quad_Subject, BlankNode, factory } from 'rdf';
import * as rdfjs from '@rdfjs/types';
import type { Bindings } from "@rdfjs/types" ;
import {AskQuery, ConstructQuery, SelectQuery, Update} from 'sparqljs';
import Immutable from "immutable";
import {ChangeSetGraph} from "./graph/changeset";

export type PromiseOrValue<T, IsSync> = IsSync extends true ? T : Promise<T>;

/**
 * Options for SPARQL query execution
 */
export interface QueryOptions {
  /**
   * Enable or disable reasoning for this query (overrides graph-level setting)
   */
  reasoning?: boolean;
}

export interface Graph<IsSync> {
  iri: NamedNode | DefaultGraph;

  quads(): PromiseOrValue<Iterable<Quad>, IsSync>;
  find(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null): PromiseOrValue<Iterable<Quad>, IsSync>;
  select(query: SelectQuery | string, options?: QueryOptions): Promise<Iterable<Bindings>>;
  ask(query: AskQuery | string, options?: QueryOptions): Promise<boolean>;
  construct(query: ConstructQuery | string, options?: QueryOptions): Promise<Graph<true>>;
  withIri(iri: NamedNode | DefaultGraph | undefined): this;

  // Serialization methods
  toString(options?: { format?: string, prefixes?: any, baseIRI?: string }): PromiseOrValue<string, IsSync>;
  saveToFile(path: string, options?: { format?: string, prefixes?: any, baseIRI?: string }): PromiseOrValue<void, IsSync>;
}

export interface MutableGraph<IsSync> extends Graph<IsSync> {
  add(quads: Iterable<rdfjs.Quad>): PromiseOrValue<this, IsSync>;
  remove(quads: Iterable<rdfjs.Quad>): PromiseOrValue<this, IsSync>;
  deleteAll(): PromiseOrValue<void, IsSync>;
  update(query: Update | string, options?: QueryOptions): Promise<void>;
}

export interface ImmutableGraph<IsSync> extends Graph<IsSync> {
  add(quads: Iterable<rdfjs.Quad>): PromiseOrValue<this, IsSync>;
  remove(quads: Iterable<rdfjs.Quad>): PromiseOrValue<this, IsSync>;
}

export interface TransactionalGraph<IsSync> extends MutableGraph<IsSync> {
  begin(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
}

export type WritableGraph<T> = MutableGraph<T> | ImmutableGraph<T>;

let skolemCounter = 0;
export async function skolemize<T extends WritableGraph<any>>(graph: T, prefix: string): Promise<T> {

  const nodes: Record<string, NamedNode> = {};

  if(graph.iri.termType != "DefaultGraph") {
    prefix = graph.iri.value + prefix;
  }

  function replace(bnode: rdfjs.BlankNode): NamedNode {
    if(!(bnode.value in nodes)) {
      nodes[bnode.value] = factory.namedNode(`${prefix}${skolemCounter++}`);
    }
    return nodes[bnode.value];
  }

  let changeset = new ChangeSetGraph();

  for(const q of await graph.quads()) {
    if(q.subject.termType === "BlankNode" || q.object.termType === "BlankNode") {
      const newQ = factory.quad(
          q.subject.termType === "BlankNode" ? replace(q.subject) : q.subject,
          q.predicate,
          q.object.termType === "BlankNode" ? replace(q.object) : q.object,
          q.graph
      );
      changeset = changeset.add([newQ]).remove([q]);
    }
  }

  return await changeset.applyDelta(graph);

}