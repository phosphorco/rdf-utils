import {BaseQuad, Bindings, BaseQuery, Term } from '@rdfjs/types';
import * as rdfjs from '@rdfjs/types'
import { NamedNode, DefaultGraph, factory, Quad } from '../rdf';
import { MutableGraph, TransactionalGraph, QueryOptions } from '../graph';
import { BaseGraph, serializeQuads, saveQuadsToFile } from './base';
import { Query, Generator, SparqlQuery, SelectQuery, ConstructQuery, Update } from 'sparqljs';
import * as stardog from 'stardog';
import * as N3 from 'n3';

/**
 * Configuration for Stardog connection
 */
export interface StardogConfig {
  endpoint: string;
  username: string;
  password: string;
  database: string;
}

/**
 * Stardog implementation of MutableGraph with transaction support
 */
export class StardogGraph extends BaseGraph<false> implements MutableGraph<false>, TransactionalGraph<false> {
  public config: StardogConfig;
  public connection: stardog.Connection;
  public transactionId: string | null = null;
  public readonly reasoning: boolean;

  constructor(config: StardogConfig, iri?: NamedNode | DefaultGraph, reasoning?: boolean) {
    super(iri);
    this.config = config;
    this.transactionId = null;
    this.reasoning = reasoning || false;
    this.connection = StardogGraph.getConnection(config);
  }

  static getConnection(config: StardogConfig): stardog.Connection {
    return new stardog.Connection({
      username: config.username,
      password: config.password,
      endpoint: config.endpoint
    });
  }

  async inTransaction(fn: (graph: StardogGraph) => Promise<void>): Promise<void> {
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
    const generator = new Generator({prefixes: {"stardog": "stardog"}});
    let queryString = generator.stringify(query);

    // Handle Stardog-specific special values that must appear without angle brackets
    // Stardog context values like 'stardog:context:all' are vendor-specific extensions
    // that violate standard SPARQL grammar but are accepted by Stardog
    queryString = queryString.replace(/<(stardog:context:\w+)>/g, '$1');

    // Apply reasoning pragma if explicitly specified in options
    // This overrides the graph-level reasoning setting and works in transactions
    if (options?.reasoning !== undefined) {
      const pragma = options.reasoning ? '#pragma reasoning on' : '#pragma reasoning off';
      queryString = pragma + '\n' + queryString;
    }

    const queryType = (query as Query).queryType;
    const contentType = this.getContentType(queryType);

    const result = await this.executeQuery(queryString, contentType);

    // Return appropriate BaseQuery based on query type
    if (queryType === 'SELECT') {
      return {
        resultType: 'bindings',
        execute: async () => {
          const bindings = result.body.results.bindings
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
        execute: async () => result.body.boolean
      };
    } else if (queryType === 'CONSTRUCT') {
      const constructResult = await this.executeQuery(queryString, 'application/n-triples');
      const quads = await this.parseNTriplesResult(constructResult);

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

    const result = await this.executeQuery(sparql, 'application/sparql-results+json');
    
    const quads: Quad[] = [];
    if (result.body?.results?.bindings) {
      result.body.results.bindings.forEach((binding: any) => {
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
    if (this.transactionId) {
      throw new Error('Transaction already in progress');
    }
    
    this.transactionId = await this.beginTransaction();
  }

  async commit(): Promise<void> {
    if (!this.transactionId) {
      throw new Error('No transaction in progress');
    }
    
    await stardog.db.transaction.commit(this.connection, this.config.database, this.transactionId);
    this.transactionId = null;
  }

  async rollback(): Promise<void> {
    if (!this.transactionId) {
      throw new Error('No transaction in progress');
    }

    await stardog.db.transaction.rollback(this.connection, this.config.database, this.transactionId);
    this.transactionId = null;
  }

  withIri(iri: NamedNode | DefaultGraph | undefined): this {
    const resolvedIri = iri || factory.defaultGraph();
    const newGraph = new StardogGraph(this.config, resolvedIri, this.reasoning);
    // Inherit the transaction state from the current graph
    newGraph.transactionId = this.transactionId;
    return newGraph as this;
  }

  /**
   * Execute operation within a transaction (create if needed)
   */
  private async executeWithTransaction<T>(
    operation: (txId: string) => Promise<T>
  ): Promise<T> {
    if (this.transactionId) {
      return operation(this.transactionId);
    }
    
    const txId = await this.beginTransaction();
    
    try {
      const result = await operation(txId);
      await stardog.db.transaction.commit(this.connection, this.config.database, txId);
      return result;
    } catch (err) {
      await stardog.db.transaction.rollback(this.connection, this.config.database, txId);
      throw err;
    }
  }

  /**
   * Begin a transaction using HTTP endpoint to support reasoning parameter
   */
  private async beginTransaction(): Promise<string> {
    const params = new URLSearchParams();
    if (this.reasoning) {
      params.append('reasoning', 'true');
    }

    const url = `${this.config.endpoint}/${this.config.database}/transaction/begin`;
    const fullUrl = params.toString() ? `${url}?${params.toString()}` : url;

    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${this.config.username}:${this.config.password}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to begin transaction: ${response.status} ${response.statusText}`);
    }

    const responseText = await response.text();
    return responseText.trim();
  }

  /**
   * Delete all quads from this graph
   */
  async deleteAll(): Promise<void> {
    if (this.iri.termType !== 'DefaultGraph') {
      await stardog.db.graph.doDelete(this.connection, this.config.database, this.iri.value, {});
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
    let queryString = generator.stringify(parsedUpdate);

    // Handle Stardog-specific special values
    queryString = queryString.replace(/<(stardog:context:\w+)>/g, '$1');

    // Apply reasoning pragma if specified
    if (options?.reasoning !== undefined) {
      const pragma = options.reasoning ? '#pragma reasoning on' : '#pragma reasoning off';
      queryString = pragma + '\n' + queryString;
    }

    await this.executeUpdate(queryString);
  }

  /**
   * Execute a SPARQL UPDATE query string
   */
  private async executeUpdate(queryString: string): Promise<void> {
    if (this.transactionId) {
      const result = await stardog.query.executeInTransaction(
        this.connection,
        this.config.database,
        this.transactionId,
        queryString,
        { accept: 'application/sparql-results+json' as any },
        { reasoning: this.reasoning }
      );
      if (!result.ok) {
        throw new Error(`Update failed: ${result.statusText}`);
      }
    } else {
      await this.executeWithTransaction(async (txId) => {
        const result = await stardog.query.executeInTransaction(
          this.connection,
          this.config.database,
          txId,
          queryString,
          { accept: 'application/sparql-results+json' as any },
          { reasoning: this.reasoning }
        );
        if (!result.ok) {
          throw new Error(`Update failed: ${result.statusText}`);
        }
      });
    }
  }

  /**
   * Unified query execution handling both transaction and non-transaction cases
   *
   * Note: If the query contains a pragma directive (#pragma reasoning on/off),
   * it will override the graph-level reasoning setting.
   */
  private async executeQuery(queryString: string, contentType: string): Promise<any> {

    //console.log(`Executing query: ${this.reasoning}\n ${queryString}`);
    const result = this.transactionId ?
      await stardog.query.executeInTransaction(
        this.connection,
        this.config.database,
        this.transactionId,
        queryString,
        { accept: contentType as any },
        {reasoning: this.reasoning}
      ) :
      await stardog.query.execute(
        this.connection,
        this.config.database,
        queryString,
        contentType as any,
        {reasoning: this.reasoning}
      );

    if (!result.ok) {
      console.log(result.body);
      console.log(queryString);
      throw new Error(`Query failed: ${result.statusText}`);
    }

    return result;
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
  private async parseNTriplesResult(result: any): Promise<Quad[]> {
    const parser = new N3.Parser({ format: 'N-Triples' });
    const quads: Quad[] = [];

    if (result.body && typeof result.body === 'string') {
      await new Promise<void>((resolve, reject) => {
        parser.parse(result.body as string, (error, quad) => {
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
      if(quad.graph && quad.graph.termType == 'NamedNode') {
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
    
    await this.executeWithTransaction(async (txId) => {
      const dbOperation = operation === 'add' ? stardog.db.add : stardog.db.remove;
      // @ts-expect-error - Stardog types require encoding but omitting it works
      await dbOperation(this.connection, this.config.database, txId, nquads, { 
        contentType: 'application/n-quads' 
      });
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
