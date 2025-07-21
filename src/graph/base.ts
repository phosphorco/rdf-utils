import {
  Query,
  Generator,
  Parser,
  AskQuery,
  ConstructQuery,
  SelectQuery, SparqlQuery
} from 'sparqljs';
import {
  NamedNode,
  BaseQuad,
  DefaultGraph,
  factory,
  Quad,
  Term,
  globalPrefixMap
} from '../rdf';
import {BaseQuery, Bindings, ResultStream} from "@rdfjs/types";
import * as rdfjs from "@rdfjs/types"
import { Graph, PromiseOrValue } from '../graph';
import * as n3 from 'n3';
import { writeFileSync, readFileSync } from 'fs';

export abstract class BaseGraph<IsSync> implements Graph<IsSync> {
  iri: NamedNode | DefaultGraph;

  constructor(iri?: NamedNode | DefaultGraph) {
    this.iri = iri || factory.defaultGraph();
  }

  abstract sparql(query: SparqlQuery): Promise<BaseQuery>;
  abstract quads(): PromiseOrValue<Iterable<Quad>, IsSync>;
  abstract find(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null): PromiseOrValue<Iterable<Quad>, IsSync>;

  protected prepareQuery(query: Query | string, expectedType: string): Query {
    const parsedQuery = typeof query === 'string' ? new Parser().parse(query) : query;
    if(parsedQuery.type !== 'query') {
      throw new Error(`Unsupported query type ${parsedQuery.type}`);
    }
    if(parsedQuery.queryType !== expectedType) {
      throw new Error(`Unexpected query type ${parsedQuery.queryType}`);
    }

    if (this.iri.termType !== 'DefaultGraph') {
      if(!parsedQuery.from) {
        parsedQuery.from = {default: [], named: []}
      }
      parsedQuery.from.default.push(this.iri);
    }

    parsedQuery.prefixes = {...globalPrefixMap, ...parsedQuery.prefixes};

    return parsedQuery;
  }

  async ask(query: AskQuery | string): Promise<boolean> {
    const q = this.prepareQuery(query, "ASK");
    const sparqlQ = await this.sparql(q);
    if(sparqlQ.resultType !== 'boolean') { throw new Error("Invalid result type.")}
    return await sparqlQ.execute(query) as boolean;
  }

  async construct(query: ConstructQuery | string): Promise<Graph<true>> {
    const q = this.prepareQuery(query, "CONSTRUCT");
    const sparqlQ = await this.sparql(q);
    if(sparqlQ.resultType !== 'quads') { throw new Error("Invalid result type.")}
    const stream = await sparqlQ.execute(query) as ResultStream<rdfjs.Quad>;
    return new Promise(async (resolve, reject) => {
      // Import N3Graph dynamically to avoid circular dependency
      const { N3Graph } = await import('./n3.js');
      const resultGraph = new N3Graph();
      stream.on('end', () => {
        resolve(resultGraph);
      });
      stream.on('error', err => reject(err));
      stream.on('data', (chunk: rdfjs.Quad) => {
        resultGraph.add([chunk]);
      })
    })
  }

  async select(query: SelectQuery | string): Promise<Iterable<Bindings>> {
    const q = this.prepareQuery(query, "SELECT");
    const sparqlQ = await this.sparql(q);
    if(sparqlQ.resultType !== 'bindings') { throw new Error("Invalid result type.")}
    const stream = await sparqlQ.execute(query) as ResultStream<Bindings>;

    return new Promise((resolve, reject) => {
      const bindings: Bindings[] = [];

      stream.on('end', () => {
        resolve(bindings);
      });
      stream.on('error', err => reject(err));
      stream.on('data', (binding: Bindings) => {
        bindings.push(binding)
      })
    })
  }

  toString(options?: { format?: string, prefixes?: any, baseIRI?: string }): PromiseOrValue<string, IsSync> {
    const baseIRI = options?.baseIRI || (this.iri.termType === 'NamedNode' ? this.iri.value : undefined);
    const quads = this.quads();
    
    if (quads instanceof Promise) {
      return quads.then(q => serializeQuads(q, { ...options, baseIRI })) as PromiseOrValue<string, IsSync>;
    } else {
      return serializeQuads(quads, { ...options, baseIRI }) as PromiseOrValue<string, IsSync>;
    }
  }

  saveToFile(path: string, options?: { format?: string, prefixes?: any, baseIRI?: string }): PromiseOrValue<void, IsSync> {
    const baseIRI = options?.baseIRI || (this.iri.termType === 'NamedNode' ? this.iri.value : undefined);
    const quads = this.quads();
    
    if (quads instanceof Promise) {
      return quads.then(q => saveQuadsToFile(q, path, { ...options, baseIRI })) as PromiseOrValue<void, IsSync>;
    } else {
      return saveQuadsToFile(quads, path, { ...options, baseIRI }) as PromiseOrValue<void, IsSync>;
    }
  }

}

// Helper functions for implementations to use

export async function serializeQuads(quads: Iterable<Quad>, options?: { format?: string, prefixes?: any, baseIRI?: string }): Promise<string> {
  const format = options?.format;
  const prefixes = {...globalPrefixMap, ...options?.prefixes };
  if(options?.baseIRI) {
    prefixes[""] = options.baseIRI;
  }

  const quadArray = [...quads];

  quadArray.sort((a, b) => {
    if(a.graph.value != b.graph.value) return a.graph.value.localeCompare(b.graph.value);
    if(a.subject.value != b.subject.value) return a.subject.value.localeCompare(b.subject.value);
    if(a.predicate.value != b.predicate.value) return a.predicate.value.localeCompare(b.predicate.value);
    return 0;
  })

  const writer = new n3.Writer({ format, prefixes });

  for(const quad of quadArray) {
    writer.addQuad(quad);
  }

  return new Promise((resolve, reject) =>
      writer.end((error, result) => (error ? reject(error) : resolve(result)))
  );

}

export async function saveQuadsToFile(quads: Iterable<Quad>, path: string, options?: { format?: string, prefixes?: any, baseIRI?: string }): Promise<void> {
  const content = await serializeQuads(quads, options);
  writeFileSync(path, content, 'utf8');
}

export async function parseQuadsFromString(data: string, format?: string, baseIRI?: string): Promise<rdfjs.Quad[]> {
  const parser = new n3.Parser({ format, baseIRI, factory });
  
  return new Promise((resolve, reject) => {
    const quads: rdfjs.Quad[] = [];
    
    parser.parse(data, (error, quad, prefixes) => {
      if (error) {
        reject(error);
      } else if (quad) {
        quads.push(quad);
      } else {
        // Parsing complete
        resolve(quads);
      }
    });
  });
}

export async function parseQuadsFromFile(path: string, format?: string): Promise<rdfjs.Quad[]> {
  const content = readFileSync(path, 'utf8');
  return parseQuadsFromString(content, format);
}