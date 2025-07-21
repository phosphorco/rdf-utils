import { BaseQuad, Bindings, BaseQuery, Term } from '@rdfjs/types';
import * as rdfjs from '@rdfjs/types'
import { NamedNode, factory, Quad } from '../rdf';
import { MutableGraph, TransactionalGraph } from '../graph';
import { BaseGraph, serializeQuads, saveQuadsToFile } from './base';
import { Query, Generator, SparqlQuery, SelectQuery, ConstructQuery } from 'sparqljs';
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
  private transactionId: string | null = null;
  private readonly reasoning: boolean;

  constructor(iri: NamedNode, config: StardogConfig, reasoning?: boolean) {
    super(iri);
    this.config = config;
    this.transactionId = null;
    this.reasoning = reasoning || false;
    this.connection = new stardog.Connection({
      username: config.username,
      password: config.password,
      endpoint: config.endpoint
    });
  }

  async sparql(query: SparqlQuery): Promise<BaseQuery> {
    const generator = new Generator();
    const queryString = generator.stringify(query);
    
    // Determine content type based on query type
    const contentType = (query as Query).queryType === 'CONSTRUCT' || (query as Query).queryType === 'DESCRIBE' 
      ? 'application/n-triples' 
      : 'application/sparql-results+json';
    
    // Execute query based on type
    const result = this.transactionId ? 
      await stardog.query.executeInTransaction(
        this.connection, 
        this.config.database, 
        this.transactionId, 
        queryString, 
        { accept: contentType as any },
        {}
      ) :
      await stardog.query.execute(
        this.connection, 
        this.config.database, 
        queryString, 
        contentType as any
      );

    if (!result.ok) {
      throw new Error(`Query failed: ${result.statusText}`);
    }

    // Check if this is an Update query (not supported)
    if ('updateType' in query) {
      throw new Error('Update queries are not supported. Use add/delete methods instead.');
    }

    // Return appropriate BaseQuery based on query type
    if ((query as Query).queryType === 'SELECT') {
      return {
        resultType: 'bindings',
        execute: async () => {
          // Convert bindings to Map format and return as stream
          const bindings = result.body.results.bindings.map((binding: any) => {
            const bindingMap = new Map();
            Object.keys(binding).forEach(key => {
              bindingMap.set(key, binding[key]);
            });
            return bindingMap;
          });
          
          // Return a mock stream that base.ts expects
          const stream = {
            on: (event: string, handler: Function) => {
              if (event === 'data') {
                bindings.forEach((binding: any) => handler(binding));
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
      };
    } else if ((query as Query).queryType === 'ASK') {
      return {
        resultType: 'boolean',
        execute: async () => result.body.boolean
      };
    } else if ((query as Query).queryType === 'CONSTRUCT') {
      // For CONSTRUCT queries, we need to parse the result as N-Triples
      const constructResult = this.transactionId ?
        await stardog.query.executeInTransaction(
          this.connection,
          this.config.database,
          this.transactionId,
          queryString,
          { accept: 'application/n-triples' },
          {}
        ) :
        await stardog.query.execute(
          this.connection,
          this.config.database,
          queryString,
          'application/n-triples'
        );

      if (!constructResult.ok) {
        throw new Error(`CONSTRUCT query failed: ${constructResult.statusText}`);
      }

      // Parse N-Triples and create a readable stream
      const parser = new N3.Parser({ format: 'N-Triples' });
      const quads: Quad[] = [];

      if (constructResult.body && typeof constructResult.body === 'string') {
        await new Promise<void>((resolve, reject) => {
          parser.parse(constructResult.body as string, (error, quad) => {
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

      return {
        resultType: 'quads',
        execute: async () => {
          // Return a mock stream-like object
          const stream = {
            on: (event: string, handler: Function) => {
              if (event === 'data') {
                quads.forEach(quad => handler(quad));
              } else if (event === 'end') {
                setTimeout(() => handler(), 0);
              }
              return stream;
            }
          };
          return stream as any;
        }
      };
    }

    throw new Error(`Unsupported query type: ${(query as Query).queryType}`);
  }

  async quads(): Promise<Iterable<Quad>> {
    const graphIri = this.iri.termType === 'DefaultGraph' ? '' : this.iri.value;
    const sparql = graphIri ? 
      `SELECT * WHERE { GRAPH <${graphIri}> { ?s ?p ?o } }` :
      `SELECT * WHERE { ?s ?p ?o }`;
    
    const result = await this.executeSparqlQuery(sparql);
    
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
    const quadArray = Array.from(quads);
    if (quadArray.length === 0) {
      return this;
    }
    
    // Serialize quads with proper graph context
    const quadWithGraph = quadArray.map(quad => {
      const graphIri = this.iri.termType === 'DefaultGraph' ? factory.defaultGraph() : this.iri;
      return factory.quad(quad.subject, quad.predicate, quad.object, graphIri);
    });
    
    const nquads = await serializeQuads(quadWithGraph, 'N-Quads');
    
    await this.executeWithTransaction(async (txId) => {
      // @ts-expect-error - Stardog types require encoding but omitting it works
      await stardog.db.add(this.connection, this.config.database, txId, nquads, { 
        contentType: 'application/n-quads' 
      });
    });

    return this;
  }

  async remove(quads: Iterable<Quad>): Promise<this> {
    const quadArray = Array.from(quads);
    if (quadArray.length === 0) {
      return this;
    }
    
    // Serialize quads with proper graph context
    const quadWithGraph = quadArray.map(quad => {
      const graphIri = this.iri.termType === 'DefaultGraph' ? factory.defaultGraph() : this.iri;
      return factory.quad(quad.subject, quad.predicate, quad.object, graphIri);
    });
    
    const nquads = await serializeQuads(quadWithGraph, 'N-Quads');
    
    await this.executeWithTransaction(async (txId) => {
      // @ts-expect-error - Stardog types require encoding but omitting it works
      await stardog.db.remove(this.connection, this.config.database, txId, nquads, { 
        contentType: 'application/n-quads' 
      });
    });

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
   * Execute SPARQL query with proper transaction handling
   */
  private async executeSparqlQuery(sparql: string): Promise<any> {
    return this.transactionId ? 
      await stardog.query.executeInTransaction(
        this.connection, 
        this.config.database, 
        this.transactionId, 
        sparql, 
        { accept: 'application/sparql-results+json' as any }, 
        {}
      ) :
      await stardog.query.execute(
        this.connection, 
        this.config.database, 
        sparql, 
        'application/sparql-results+json' as any
      );
  }

  /**
   * Create a new transactional graph instance
   */
  createTransaction(reasoning?: boolean): StardogGraph {
    return new StardogGraph(this.iri as NamedNode, this.config, reasoning);
  }

  async toString(format?: string): Promise<string> {
    return serializeQuads(await this.quads(), format);
  }

  async saveToFile(path: string, format?: string): Promise<void> {
    return saveQuadsToFile(await this.quads(), path, format);
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
}
