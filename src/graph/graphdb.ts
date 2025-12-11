import { BaseQuad, Bindings, BaseQuery, Term } from '@rdfjs/types';
import * as rdfjs from '@rdfjs/types'
import { NamedNode, DefaultGraph, factory, Quad } from '../rdf';
import { MutableGraph, TransactionalGraph, QueryOptions } from '../graph';
import { BaseGraph, serializeQuads, saveQuadsToFile } from './base';
import { Query, Generator, SparqlQuery, SelectQuery, ConstructQuery, Update } from 'sparqljs';
import * as N3 from 'n3';

/**
 * Configuration for GraphDB connection
 */
export interface GraphDBConfig {
  endpoint: string;
  repositoryId: string;
}

/**
 * GraphDB implementation of MutableGraph with transaction support
 * Uses RDF4J REST API for SPARQL queries and mutations
 */
export class GraphDBGraph extends BaseGraph<false> implements MutableGraph<false>, TransactionalGraph<false> {
  public config: GraphDBConfig;
  public transactionUrl: string | null = null;
  public readonly reasoning: boolean;

  constructor(config: GraphDBConfig, iri?: NamedNode | DefaultGraph, reasoning?: boolean) {
    super(iri);
    this.config = config;
    this.transactionUrl = null;
    this.reasoning = reasoning !== undefined ? reasoning : true;
  }

  async inTransaction(fn: (graph: GraphDBGraph) => Promise<void>): Promise<void> {
    try {
      await this.begin();
      await fn(this);
      await this.commit();
    } catch (err) {
      await this.rollback();
      throw err;
    }
  }

  async sparql(query: SparqlQuery, options?: QueryOptions): Promise<BaseQuery> {
    const generator = new Generator({ prefixes: {} });
    let queryString = generator.stringify(query);

    const queryType = (query as Query).queryType;
    const contentType = this.getContentType(queryType);

    // Determine if reasoning should be enabled for this query
    const useReasoning = options?.reasoning !== undefined ? options.reasoning : this.reasoning;

    const result = await this.executeQuery(queryString, contentType, useReasoning);

    // Return appropriate BaseQuery based on query type
    if (queryType === 'SELECT') {
      return {
        resultType: 'bindings',
        execute: async () => {
          const bindings = result.results.bindings
            .filter((binding: any) => Object.keys(binding).length > 0)
            .map((binding: any) => {
              const bindingMap = new Map();
              Object.keys(binding).forEach(key => {
                const rawValue = binding[key];
                const rdfTerm = this.convertSparqlBindingToRdfTerm(rawValue);
                bindingMap.set(key, rdfTerm);
              });
              return bindingMap;
            });

          return this.createMockStream(bindings, (binding: any) => binding);
        }
      };
    } else if (queryType === 'ASK') {
      return {
        resultType: 'boolean',
        execute: async () => result.boolean
      };
    } else if (queryType === 'CONSTRUCT') {
      const constructResult = await this.executeQuery(queryString, 'application/n-triples', useReasoning);
      const quads = await this.parseNTriplesResult(constructResult as string);

      return {
        resultType: 'quads',
        execute: async () => {
          return this.createMockStream(quads, (quad: Quad) => quad);
        }
      };
    }

    throw new Error(`Unsupported query type: ${queryType}`);
  }

  async quads(): Promise<Iterable<Quad>> {
    const graphIri = this.iri.termType === 'DefaultGraph' ? '' : this.iri.value;
    const sparql = graphIri ?
      `SELECT * WHERE { GRAPH <${graphIri}> { ?s ?p ?o } }` :
      `SELECT * WHERE { ?s ?p ?o }`;

    const result = await this.executeQuery(sparql, 'application/sparql-results+json', this.reasoning);

    const quads: Quad[] = [];
    if (result.results?.bindings) {
      result.results.bindings.forEach((binding: any) => {
        const quad = factory.quad(
          factory.namedNode(binding.s.value),
          factory.namedNode(binding.p.value),
          binding.o.type === 'uri' ?
            factory.namedNode(binding.o.value) :
            factory.literal(binding.o.value),
          this.iri.termType === 'DefaultGraph' ? factory.defaultGraph() : this.iri
        );
        quads.push(quad);
      });
    }

    return quads;
  }

  async find(subject?: Term | null, predicate?: Term | null, object?: Term | null, graph?: Term | null): Promise<Iterable<Quad>> {
    // Create variables for undefined/null terms, use actual terms for provided ones
    const sVar = subject || factory.variable('s');
    const pVar = predicate || factory.variable('p');
    const oVar = object || factory.variable('o');

    // Determine graph context
    const graphContext = graph || (this.iri.termType === 'DefaultGraph' ? undefined : this.iri);

    // Build the CONSTRUCT query
    const query: ConstructQuery = {
      queryType: 'CONSTRUCT',
      type: 'query',
      prefixes: {},
      template: [{
        subject: factory.variable('s') as any,
        predicate: factory.variable('p') as any,
        object: factory.variable('o') as any
      }],
      where: []
    };

    // Add FROM clause for named graphs
    if (graphContext && graphContext.termType !== 'DefaultGraph') {
      query.from = {
        default: [graphContext as any],
        named: []
      };
    }

    // Add BIND statements for known values
    if (subject) {
      query.where!.push({
        type: 'bind',
        variable: factory.variable('s') as any,
        expression: subject as any
      });
    }
    if (predicate) {
      query.where!.push({
        type: 'bind',
        variable: factory.variable('p') as any,
        expression: predicate as any
      });
    }
    if (object) {
      query.where!.push({
        type: 'bind',
        variable: factory.variable('o') as any,
        expression: object as any
      });
    }

    // Add basic graph pattern (no GRAPH clause needed with FROM)
    query.where!.push({
      type: 'bgp',
      triples: [{
        subject: sVar as any,
        predicate: pVar as any,
        object: oVar as any
      }]
    });

    // Use the existing construct method to handle everything
    const resultGraph = await this.construct(query);
    return resultGraph.quads();
  }

  async add(quads: Iterable<Quad>): Promise<this> {
    await this.processQuads(quads, 'add');
    return this;
  }

  async remove(quads: Iterable<Quad>): Promise<this> {
    await this.processQuads(quads, 'remove');
    return this;
  }

  async begin(): Promise<void> {
    if (this.transactionUrl) {
      throw new Error('Transaction already in progress');
    }

    this.transactionUrl = await this.beginTransaction();
  }

  async commit(): Promise<void> {
    if (!this.transactionUrl) {
      throw new Error('No transaction in progress');
    }

    await this.updateTransaction('COMMIT');
    this.transactionUrl = null;
  }

  async rollback(): Promise<void> {
    if (!this.transactionUrl) {
      throw new Error('No transaction in progress');
    }

    await fetch(this.transactionUrl, { method: 'DELETE' });
    this.transactionUrl = null;
  }

  withIri(iri: NamedNode | DefaultGraph | undefined): this {
    const resolvedIri = iri || factory.defaultGraph();
    const newGraph = new GraphDBGraph(this.config, resolvedIri, this.reasoning);
    // Inherit the transaction state from the current graph
    newGraph.transactionUrl = this.transactionUrl;
    return newGraph as this;
  }

  /**
   * Delete all quads from this graph
   */
  async deleteAll(): Promise<void> {
    if (this.iri.termType !== 'DefaultGraph') {
      const statementsUrl = this.getStatementsUrl();
      const graphParam = `?graph=${encodeURIComponent(`<${this.iri.value}>`)}`
      const response = await fetch(`${statementsUrl}${graphParam}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error(`Failed to delete all quads: ${response.status} ${response.statusText}`);
      }
    } else {
      throw new Error('Cannot delete all quads from default graph');
    }
  }

  /**
   * Execute a SPARQL UPDATE query (INSERT, DELETE, INSERT-DELETE, DELETE WHERE)
   */
  async update(query: Update | string, options?: QueryOptions): Promise<void> {
    const parsedUpdate = this.prepareUpdate(query);
    const generator = new Generator({ prefixes: parsedUpdate.prefixes });
    const queryString = generator.stringify(parsedUpdate);

    await this.executeUpdate(queryString, options);
  }

  /**
   * Execute a SPARQL UPDATE query string
   */
  private async executeUpdate(queryString: string, options?: QueryOptions): Promise<void> {
    const useReasoning = options?.reasoning ?? this.reasoning;

    if (this.transactionUrl) {
      const response = await fetch(`${this.transactionUrl}?action=UPDATE`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/sparql-update' },
        body: queryString,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Update failed: ${response.status} ${response.statusText}\n${text}`);
      }
    } else {
      // Direct update without transaction - use SPARQL Update endpoint
      const url = this.getStatementsUrl();

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sparql-update' },
        body: queryString,
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Update failed: ${response.status} ${response.statusText}\n${text}`);
      }
    }
  }

  /**
   * Unified query execution handling both transaction and non-transaction cases
   */
  private async executeQuery(queryString: string, contentType: string, useReasoning: boolean): Promise<any> {
    const response = this.transactionUrl ?
      await fetch(`${this.transactionUrl}?action=QUERY&infer=${useReasoning}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/sparql-query',
          'Accept': contentType,
        },
        body: queryString,
      }) :
      await fetch(this.buildQueryUrl(queryString, useReasoning), {
        method: 'GET',
        headers: {
          'Accept': contentType,
        },
      });

    if (!response.ok) {
      throw new Error(`Query failed: ${response.status} ${response.statusText}`);
    }

    // For CONSTRUCT queries, return the text directly
    if (contentType === 'application/n-triples') {
      return await response.text();
    }

    // For SELECT/ASK queries, parse JSON
    return await response.json();
  }

  /**
   * Update a transaction with a specific action
   */
  private async updateTransaction(action: string, txUrl?: string): Promise<void> {
    const url = txUrl || this.transactionUrl;
    if (!url) {
      throw new Error('No transaction in progress');
    }

    const updateUrl = `${url}?action=${action}`;
    const response = await fetch(updateUrl, { method: 'PUT' });

    if (!response.ok) {
      throw new Error(`Failed to ${action} transaction: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * Begin a new transaction and return the transaction URL
   */
  private async beginTransaction(): Promise<string> {
    const url = `${this.config.endpoint}/repositories/${this.config.repositoryId}/transactions`;

    const response = await fetch(url, {
      method: 'POST',
    });

    if (!response.ok) {
      throw new Error(`Failed to begin transaction: ${response.status} ${response.statusText}`);
    }

    // Transaction URL is in the Location header
    const locationHeader = response.headers.get('Location');
    if (!locationHeader) {
      throw new Error('No Location header in transaction response');
    }

    return locationHeader;
  }

  /**
   * Get the repository query endpoint URL
   */
  private getRepositoryUrl(): string {
    return `${this.config.endpoint}/repositories/${this.config.repositoryId}`;
  }

  /**
   * Get the statements endpoint URL for mutations
   */
  private getStatementsUrl(): string {
    return `${this.getRepositoryUrl()}/statements`;
  }

  /**
   * Build the query URL with infer parameter
   */
  private buildQueryUrl(queryString: string, useReasoning: boolean): string {
    const params = new URLSearchParams();
    params.append('query', queryString);
    params.append('infer', useReasoning ? 'true' : 'false');

    return `${this.getRepositoryUrl()}?${params.toString()}`;
  }

  /**
   * Execute operation within a transaction (create if needed)
   */
  private async executeWithTransaction<T>(
    operation: (txUrl: string) => Promise<T>
  ): Promise<T> {
    if (this.transactionUrl) {
      return operation(this.transactionUrl);
    }

    await this.begin();

    try {
      const result = await operation(this.transactionUrl!);
      await this.commit();
      return result;
    } catch (err) {
      await this.rollback();
      throw err;
    }
  }

  /**
   * Create a mock stream that base.ts expects
   */
  private createMockStream(items: any[], itemHandler: (item: any) => any): any {
    const stream = {
      on: (event: string, handler: Function) => {
        if (event === 'data') {
          items.forEach(item => handler(itemHandler(item)));
        } else if (event === 'end') {
          setTimeout(() => handler(), 0);
        } else if (event === 'error') {
          // Store error handler for potential use
        }
        return stream;
      }
    };
    return stream as any;
  }

  /**
   * Parse N-Triples result into Quad array
   */
  private async parseNTriplesResult(result: string): Promise<Quad[]> {
    const parser = new N3.Parser({ format: 'N-Triples' });
    const quads: Quad[] = [];

    if (result && typeof result === 'string') {
      await new Promise<void>((resolve, reject) => {
        parser.parse(result as string, (error, quad) => {
          if (error) {
            reject(error);
          } else if (quad) {
            quads.push(factory.fromQuad(quad));
          } else {
            resolve();
          }
        });
      });
    }

    return quads;
  }

  /**
   * Apply graph context to quads
   */
  private applyGraphContext(quads: Quad[]): Quad[] {
    return quads.map(quad => {
      let g: NamedNode | DefaultGraph;
      if (quad.graph && quad.graph.termType == 'NamedNode') {
        g = factory.namedNode(quad.graph.value);
      } else if (this.iri.termType === 'DefaultGraph') {
        g = factory.defaultGraph();
      } else {
        g = this.iri;
      }
      return factory.quad(quad.subject, quad.predicate, quad.object, g);
    });
  }

  /**
   * Get content type based on query type
   */
  private getContentType(queryType: string): string {
    return queryType === 'CONSTRUCT' || queryType === 'DESCRIBE'
      ? 'application/n-triples'
      : 'application/sparql-results+json';
  }

  /**
   * Process quads for add/remove operations
   */
  private async processQuads(quads: Iterable<Quad>, operation: 'add' | 'remove'): Promise<void> {
    const quadArray = Array.from(quads);
    if (quadArray.length === 0) {
      return;
    }

    const quadWithGraph = this.applyGraphContext(quadArray);
    const nquads = await serializeQuads(quadWithGraph, { format: 'N-Quads' });

    await this.executeWithTransaction(async (txUrl) => {
      // When txUrl is provided, we're in a transaction context
      // Use PUT with action parameter for transaction mutations
      const method = 'PUT';
      const action = operation === 'add' ? 'ADD' : 'DELETE';
      const url = `${txUrl}?action=${action}`;

      const response = await fetch(url, {
        method: method,
        headers: {
          'Content-Type': 'application/n-quads',
        },
        body: nquads,
      });

      if (!response.ok) {
        throw new Error(`Failed to ${operation} quads: ${response.status} ${response.statusText}\n${await response.text()}`);
      }
     });
  }

  /**
   * Convert raw SPARQL binding value to proper RDF/JS Term
   */
  private convertSparqlBindingToRdfTerm(rawValue: any): Term {
    if (!rawValue || typeof rawValue !== 'object') {
      throw new Error(`Invalid SPARQL binding value: ${rawValue}`);
    }

    switch (rawValue.type) {
      case 'uri':
        return factory.namedNode(rawValue.value);

      case 'literal':
        if (rawValue.datatype) {
          return factory.literal(rawValue.value, factory.namedNode(rawValue.datatype));
        } else if (rawValue['xml:lang']) {
          return factory.literal(rawValue.value, rawValue['xml:lang']);
        } else {
          return factory.literal(rawValue.value);
        }

      case 'bnode':
        return factory.blankNode(rawValue.value);

      default:
        console.warn(`Unknown SPARQL binding type: ${rawValue.type}`, rawValue);
        // Fallback: try to create a literal
        return factory.literal(String(rawValue.value || rawValue));
    }
  }
}
