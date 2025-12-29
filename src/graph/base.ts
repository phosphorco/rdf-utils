import {
  Query,
  Generator,
  Parser,
  AskQuery,
  ConstructQuery,
  DescribeQuery, Update,
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
import { Graph, PromiseOrValue, QueryOptions } from '../graph';
import * as n3 from 'n3';
import { writeFileSync, readFileSync } from 'fs';
import { RdfXmlParser } from 'rdfxml-streaming-parser';
import { JsonLdParser } from 'jsonld-streaming-parser';
import { JsonLdSerializer } from 'jsonld-streaming-serializer';

export abstract class BaseGraph<IsSync> implements Graph<IsSync> {
  iri: NamedNode | DefaultGraph;

  constructor(iri?: NamedNode | DefaultGraph) {
    this.iri = iri || factory.defaultGraph();
  }

  abstract sparql(query: SparqlQuery, options?: QueryOptions): Promise<BaseQuery>;
  abstract quads(): PromiseOrValue<Iterable<Quad>, IsSync>;
  abstract find(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null): PromiseOrValue<Iterable<Quad>, IsSync>;
  abstract withIri(iri: NamedNode | DefaultGraph | undefined): this;

  protected prepareQuery(query: Query | string, expectedType: string): Query {
    let parsedQuery: SelectQuery | AskQuery | ConstructQuery | DescribeQuery | Update;
    try {
      // Enable sparqlStar for RDF-star / SPARQL-star triple term syntax support
      parsedQuery = typeof query === 'string' ? new Parser({prefixes: globalPrefixMap, sparqlStar: true}).parse(query) : query;
    } catch (err) {
      console.error("Error parsing query:", query);
      throw err;
    }
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

  protected prepareUpdate(update: Update | string): Update {
    let parsedUpdate: Update;
    try {
      // Enable sparqlStar for RDF-star / SPARQL-star triple term syntax support
      parsedUpdate = typeof update === 'string'
        ? new Parser({prefixes: globalPrefixMap, sparqlStar: true}).parse(update) as Update
        : update;
    } catch (err) {
      console.error("Error parsing update:", update);
      throw err;
    }

    if (parsedUpdate.type !== 'update') {
      throw new Error(`Expected update query, got ${parsedUpdate.type}`);
    }

    // Inject graph context for INSERT DATA / DELETE DATA operations
    // For these operations, we need to wrap triples in a GRAPH pattern
    if (this.iri.termType === 'NamedNode') {
      const graphIri = this.iri as NamedNode;
      parsedUpdate.updates = parsedUpdate.updates.map(op => {
        if ('updateType' in op) {
          // For insert/delete (INSERT DATA / DELETE DATA), wrap triples in GRAPH pattern
          if (op.updateType === 'insert' && op.insert) {
            return {
              ...op,
              insert: this.wrapInGraph(op.insert, graphIri)
            } as typeof op;
          }
          if (op.updateType === 'delete' && op.delete) {
            return {
              ...op,
              delete: this.wrapInGraph(op.delete, graphIri)
            } as typeof op;
          }
          // For insertdelete (DELETE/INSERT WHERE), set the graph property
          if (op.updateType === 'insertdelete' && !op.graph) {
            return { ...op, graph: graphIri } as typeof op;
          }
          // For deletewhere, wrap the delete patterns in GRAPH
          if (op.updateType === 'deletewhere' && op.delete) {
            return {
              ...op,
              delete: this.wrapInGraph(op.delete, graphIri)
            } as typeof op;
          }
        }
        return op;
      });
    }

    parsedUpdate.prefixes = {...globalPrefixMap, ...parsedUpdate.prefixes};
    return parsedUpdate;
  }

  /**
   * Wraps quad patterns in a GRAPH pattern for INSERT DATA / DELETE DATA
   */
  private wrapInGraph(patterns: any[], graphIri: NamedNode): any[] {
    return patterns.map(pattern => {
      // If already a graph pattern, skip
      if (pattern.type === 'graph') {
        return pattern;
      }
      // Wrap bgp patterns in a graph pattern
      if (pattern.type === 'bgp') {
        return {
          type: 'graph',
          name: graphIri,
          triples: pattern.triples
        };
      }
      // For other patterns, return as-is
      return pattern;
    });
  }

  async ask(query: AskQuery | string, options?: QueryOptions): Promise<boolean> {
    const q = this.prepareQuery(query, "ASK");
    const sparqlQ = await this.sparql(q, options);
    if(sparqlQ.resultType !== 'boolean') { throw new Error("Invalid result type.")}
    return await sparqlQ.execute(query) as boolean;
  }

  async construct(query: ConstructQuery | string, options?: QueryOptions): Promise<Graph<true>> {
    const q = this.prepareQuery(query, "CONSTRUCT");
    const sparqlQ = await this.sparql(q, options);
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

  async select(query: SelectQuery | string, options?: QueryOptions): Promise<Iterable<Bindings>> {
    const q = this.prepareQuery(query, "SELECT");
    const sparqlQ = await this.sparql(q, options);
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

/**
 * Checks if any quad in the iterable contains triple terms (embedded quads) in subject or object position.
 * Used to determine if RDF-star serialization format is needed.
 */
function containsTripleTerms(quads: rdfjs.Quad[]): boolean {
  for (const q of quads) {
    if (q.subject.termType === 'Quad' || q.object.termType === 'Quad') {
      return true;
    }
  }
  return false;
}

/**
 * Converts a standard RDF format to its RDF-star variant for N3.js
 */
function toStarFormat(format: string | undefined): string | undefined {
  if (!format) return undefined;

  // Map standard formats to star variants
  const formatMap: Record<string, string> = {
    'text/turtle': 'text/turtle*',
    'turtle': 'turtle*',
    'application/trig': 'application/trig*',
    'trig': 'trig*',
    'application/n-triples': 'application/n-triples*',
    'n-triples': 'n-triples*',
    'application/n-quads': 'application/n-quads*',
    'n-quads': 'n-quads*',
  };

  return formatMap[format.toLowerCase()] || format;
}

export async function serializeQuads(quads: Iterable<Quad>, options?: { format?: string, prefixes?: any, baseIRI?: string }): Promise<string> {
  let format = options?.format;
  const prefixes = {...globalPrefixMap, ...options?.prefixes };
  if(options?.baseIRI) {
    prefixes[""] = options.baseIRI;
  }

  const quadArray = [...quads];

  // Handle JSON-LD serialization separately
  if (format === 'application/ld+json' || format === 'json-ld') {
    return serializeQuadsToJsonLd(quadArray, prefixes, options?.baseIRI);
  }

  // Auto-detect if we need RDF-star format
  if (containsTripleTerms(quadArray)) {
    format = toStarFormat(format);
  }

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

/**
 * Serializes RDF quads to JSON-LD format with an inline context based on prefixes
 * @param quads - Array of RDF quads
 * @param prefixes - Prefix map to generate @context
 * @param baseIRI - Optional base IRI
 * @returns Promise that resolves to JSON-LD string
 */
async function serializeQuadsToJsonLd(quads: rdfjs.Quad[], prefixes: any, baseIRI?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const jsonldQuads: string[] = [];

    // Build context from prefixes
    const context: any = {};
    for (const [prefix, iri] of Object.entries(prefixes)) {
      if (typeof iri === 'string' && prefix !== '') {
        context[prefix] = iri;
      }
    }

    const serializer = new JsonLdSerializer({
      baseIRI,
      context,
      space: '  ' // Use 2-space indentation
    });

    serializer.on('data', (chunk: Buffer) => {
      jsonldQuads.push(chunk.toString('utf8'));
    });

    serializer.on('end', () => {
      // Combine the JSON-LD chunks into the final result
      const result = jsonldQuads.join('');
      resolve(result);
    });

    serializer.on('error', (error: Error) => {
      reject(error);
    });

    // Write quads to serializer
    for (const quad of quads) {
      serializer.write(quad);
    }
    serializer.end();
  });
}

export async function saveQuadsToFile(quads: Iterable<Quad>, path: string, options?: { format?: string, prefixes?: any, baseIRI?: string }): Promise<void> {
  const content = await serializeQuads(quads, options);
  writeFileSync(path, content, 'utf8');
}

/**
 * Detects the RDF format from a MIME type, file extension, or content
 * @param format - Explicit format string (MIME type or format name)
 * @param filePath - Optional file path to detect format from extension
 * @param content - Optional content to analyze for format detection
 * @returns Normalized format string or undefined
 */
function detectFormat(format?: string, filePath?: string, content?: string): string | undefined {
  // If format is explicitly provided, normalize and return it
  if (format) {
    // Normalize common RDF/XML MIME types
    if (format === 'application/rdf+xml' || format === 'text/rdf+xml' || format === 'rdf/xml' || format === 'rdfxml') {
      return 'application/rdf+xml';
    }
    // Normalize trig format (including star variants)
    if (format === 'application/trig' || format === 'trig') {
      return 'application/trig';
    }
    if (format === 'application/trig*' || format === 'trig*' || format === 'trigstar') {
      return 'application/trig*';
    }
    // Normalize turtle format (including star variants)
    if (format === 'text/turtle*' || format === 'turtle*' || format === 'turtlestar') {
      return 'text/turtle*';
    }
    // Normalize JSON-LD format
    if (format === 'application/ld+json' || format === 'application/json' || format === 'json-ld') {
      return 'application/ld+json';
    }
    // Return other formats as-is for n3 parser
    return format;
  }

  // Detect from file extension
  if (filePath) {
    const extension = filePath.toLowerCase().split('.').pop();
    if (extension === 'rdf' || extension === 'rdfxml' || extension === 'xml') {
      return 'application/rdf+xml';
    }
    if (extension === 'trig') {
      return 'application/trig';
    }
    if (extension === 'ttl') {
      return 'text/turtle';
    }
    if (extension === 'n3') {
      return 'text/n3';
    }
    if (extension === 'nq') {
      return 'application/n-quads';
    }
    if (extension === 'jsonld') {
      return 'application/ld+json';
    }
  }

  // Detect from content
  if (content) {
    const trimmedContent = content.trim();

    // Check for RDF/XML markers (XML format)
    if (trimmedContent.startsWith('<')) {
      // But not if it starts with << which is RDF-star syntax
      if (!trimmedContent.startsWith('<<') && (trimmedContent.includes('<rdf:RDF') || trimmedContent.includes('<RDF'))) {
        return 'application/rdf+xml';
      }
    }

    // Check for JSON-LD markers (JSON format with @context)
    if (trimmedContent.startsWith('{') || trimmedContent.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmedContent);
        if (parsed && (parsed['@context'] || (Array.isArray(parsed) && parsed.some(item => item['@context'])))) {
          return 'application/ld+json';
        }
      } catch {
        // Not valid JSON, continue
      }
    }

    // Detect RDF-star syntax (embedded triples with << >>)
    if (trimmedContent.includes('<<') && trimmedContent.includes('>>')) {
      return 'text/turtle*';
    }
  }

  return undefined;
}

/**
 * Parses RDF data from a string. For RDF/XML format, use parseQuadsFromStringAsync instead.
 * @param data - The RDF data as a string
 * @param format - The format of the data (MIME type or format name)
 * @param baseIRI - Optional base IRI for relative IRIs
 * @returns Array of RDF quads
 * @throws Error if trying to parse RDF/XML synchronously (use parseQuadsFromStringAsync instead)
 */
export function parseQuadsFromString(data: string, format?: string, baseIRI?: string): rdfjs.Quad[] {
  const detectedFormat = detectFormat(format, undefined, data);

  // RDF/XML requires async parsing
  if (detectedFormat === 'application/rdf+xml') {
    throw new Error('RDF/XML format requires async parsing. Use parseQuadsFromStringAsync instead.');
  }

  // Use n3 parser for other formats
  const parser = new n3.Parser({ format: detectedFormat, baseIRI, factory });
  return parser.parse(data);
}

/**
 * Parses RDF data from a string asynchronously. Supports RDF/XML, Turtle, N3, N-Quads, TriG, and JSON-LD formats.
 * @param data - The RDF data as a string
 * @param format - The format of the data (MIME type or format name)
 * @param baseIRI - Optional base IRI for relative IRIs
 * @returns Promise that resolves to an array of RDF quads
 */
export async function parseQuadsFromStringAsync(data: string, format?: string, baseIRI?: string): Promise<rdfjs.Quad[]> {
  const detectedFormat = detectFormat(format, undefined, data);

  // Use RDF/XML parser for RDF/XML format
  if (detectedFormat === 'application/rdf+xml') {
    const quads: rdfjs.Quad[] = [];

    return new Promise((resolve, reject) => {
      const parser = new RdfXmlParser({ baseIRI, dataFactory: factory });

      parser.on('data', (quad: rdfjs.Quad) => {
        quads.push(quad);
      });

      parser.on('end', () => {
        resolve(quads);
      });

      parser.on('error', (error: Error) => {
        reject(error);
      });

      parser.write(data);
      parser.end();
    });
  }

  // Use JSON-LD parser for JSON-LD format
  if (detectedFormat === 'application/ld+json') {
    const quads: rdfjs.Quad[] = [];

    return new Promise((resolve, reject) => {
      const parser = new JsonLdParser({ dataFactory: factory });

      parser.on('data', (quad: rdfjs.Quad) => {
        quads.push(quad);
      });

      parser.on('end', () => {
        resolve(quads);
      });

      parser.on('error', (error: Error) => {
        reject(error);
      });

      // Write data as chunks to the streaming parser
      parser.write(Buffer.from(data, 'utf8'));
      parser.end();
    });
  }

  // Use n3 parser for other formats (synchronously)
  const parser = new n3.Parser({ format: detectedFormat, baseIRI, factory });
  return Promise.resolve(parser.parse(data));
}

export function parseQuadsFromFile(path: string, format?: string): rdfjs.Quad[] {
  const content = readFileSync(path, 'utf8');
  const detectedFormat = detectFormat(format, path, content);

  // RDF/XML requires async parsing
  if (detectedFormat === 'application/rdf+xml') {
    throw new Error('RDF/XML format requires async parsing. Use parseQuadsFromFileAsync instead.');
  }

  return parseQuadsFromString(content, detectedFormat);
}

/**
 * Parses RDF data from a file asynchronously. Automatically detects format from file extension or content.
 * @param path - Path to the RDF file
 * @param format - Optional explicit format (MIME type or format name)
 * @returns Promise that resolves to an array of RDF quads
 */
export async function parseQuadsFromFileAsync(path: string, format?: string): Promise<rdfjs.Quad[]> {
  const content = readFileSync(path, 'utf8');
  const detectedFormat = detectFormat(format, path, content);
  return parseQuadsFromStringAsync(content, detectedFormat);
}