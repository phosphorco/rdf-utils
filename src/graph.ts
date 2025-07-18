import { NamedNode, Quad, BaseQuad, Term, Variable, DefaultGraph, factory } from 'rdf';
import * as rdfjs from '@rdfjs/types';
import type { Bindings } from "@rdfjs/types" ;
import {AskQuery, ConstructQuery, SelectQuery} from 'sparqljs';

export type PromiseOrValue<T, IsSync> = IsSync extends true ? T : Promise<T>;

export interface Graph<IsSync> {
  iri: NamedNode | DefaultGraph;

  quads(): PromiseOrValue<Iterable<Quad>, IsSync>;
  find(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null): PromiseOrValue<Iterable<Quad>, IsSync>;
  select(query: SelectQuery | string): Promise<Iterable<Bindings>>;
  ask(query: AskQuery | string): Promise<boolean>;
  construct(query: ConstructQuery | string): Promise<Graph<true>>;
  
  // Serialization methods
  toString(format?: string): PromiseOrValue<string, IsSync>;
  saveToFile(path: string, format?: string): PromiseOrValue<void, IsSync>;
}

export interface MutableGraph<IsSync> extends Graph<IsSync> {
  add(quads: Iterable<rdfjs.Quad>): PromiseOrValue<this, IsSync>;
  remove(quads: Iterable<rdfjs.Quad>): PromiseOrValue<this, IsSync>;
  deleteAll(): PromiseOrValue<void, IsSync>;
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