import * as RDFJS from '@rdfjs/types';
import { ValueObject, hash, is, Seq, Collection } from 'immutable'
import { Readable } from 'stream';

export type Term = RDFJS.Term & ValueObject;
export type NamedNode<Iri extends string = string> = RDFJS.NamedNode<Iri> & ValueObject;
export type BlankNode = RDFJS.BlankNode & ValueObject;
export type Literal = RDFJS.Literal & ValueObject;
export type Variable = RDFJS.Variable & ValueObject;
export type DefaultGraph = RDFJS.DefaultGraph & ValueObject;
export type BaseQuad = RDFJS.BaseQuad & ValueObject;
export type Quad = RDFJS.Quad & ValueObject;
export type Quad_Subject = RDFJS.Quad_Subject & ValueObject;
export type Quad_Predicate = RDFJS.Quad_Predicate & ValueObject;
export type Quad_Object = RDFJS.Quad_Object & ValueObject;
export type Quad_Graph = RDFJS.Quad_Graph & ValueObject;

class ImmutableTerm<TermType extends string, ValueType extends string> implements ValueObject {
  public termType: TermType;
  public value: ValueType;

  constructor(termType: TermType, value: ValueType) {
    this.value = value;
    this.termType = termType;
  }

  equals(other: RDFJS.Term | null | undefined): boolean {
    if(!other) return false;
    if(this.termType != other.termType) return false;
    return is(this.value, other.value);
  }

  hashCode(): number {
    return hash(this.value);
  }

  toString(): string {
    switch (this.termType) {
      case "NamedNode":
        return `${this.value}`;
      case "Variable":
        return `?${this.value}`;
      default:
        return `[${this.termType} ${this.value}]`;
    }
  }
}

type Direction =  'ltr' | 'rtl' | '' | null;

class ImmutableLiteral extends ImmutableTerm<"Literal", string> implements Literal {
  public language: string;
  public direction: Direction;
  public datatype: NamedNode;

  constructor(value: string, datatype: NamedNode, language?: string, direction?: Direction) {
    super( "Literal", value);
    this.datatype = datatype;
    this.language = language || '';
    this.direction = direction || null;
  }

  toString(): string {
    if(is(this.value, XSD.string)) {
      return `"${this.value}"`;
    } else {
      return `"${this.value}"^^${this.datatype}`;
    }
  }

}

function hashCombine(...args: number[]): number {
  var hash = 0;
  for(const arg of args) {
    hash = (hash * 31) ^ arg;
  }
  return hash | 0;
}

class ImmutableBaseQuad implements BaseQuad {
  public termType: "Quad" = "Quad";
  public value: "" = "";
  public subject: Term;
  public predicate: Term;
  public object: Term;
  public graph: Term;

  constructor(subject: Term, predicate: Term, object: Term, graph: Term) {
    this.subject = subject;
    this.predicate = predicate;
    this.object = object;
    this.graph = graph;
  }

  equals(other: RDFJS.Term | null | undefined): boolean {
    if(!other) return false;
    if(this.termType != other.termType) return false;
    return this.graph.equals(other.graph) &&
        this.subject.equals(other.subject) &&
        this.object.equals(other.object) &&
        this.predicate.equals(other.predicate);
  }

  hashCode(): number {
    return hashCombine(
        this.graph.hashCode(),
        this.subject.hashCode(),
        this.predicate.hashCode(),
        this.object.hashCode());
  }
}

export function namespace(baseUri: string): { [key: string]: NamedNode } {
  return new Proxy({} as { [key: string]: NamedNode }, {
    get(target, property) {
      if (typeof property === 'string') {
        return new ImmutableTerm("NamedNode", baseUri + property);
      }
      return undefined;
    },
    has(target, property) {
      return typeof property === 'string';
    },
    ownKeys(target) {
      // Return empty array since we don't have predefined keys
      return [];
    }
  });
}

export const XSD = namespace('http://www.w3.org/2001/XMLSchema#');
export const RDF = namespace('http://www.w3.org/1999/02/22-rdf-syntax-ns#');
export const RDFS = namespace('http://www.w3.org/2000/01/rdf-schema#');
export const OWL = namespace('http://www.w3.org/2002/07/owl#');
export const DC = namespace('http://purl.org/dc/elements/1.1/');
export const DCTERMS = namespace('http://purl.org/dc/terms/');
export const FOAF = namespace('http://xmlns.com/foaf/0.1/');
export const SKOS = namespace('http://www.w3.org/2004/02/skos/core#');
export const VCARD = namespace('http://www.w3.org/2006/vcard/ns#');

export const globalPrefixMap: Record<string, string> = {
  xsd: 'http://www.w3.org/2001/XMLSchema#',
  rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
  owl: 'http://www.w3.org/2002/07/owl#'
}

export class ImmutableDataFactory implements RDFJS.DataFactory {

  protected bnodeIdx = 0;

  blankNode(value?: string): BlankNode {
    value = value ? value : `bnode_${this.bnodeIdx++}`;
    return new ImmutableTerm("BlankNode", value);
  }

  defaultGraph(): DefaultGraph {
    return new ImmutableTerm("DefaultGraph", "");
  }

  fromQuad(original: RDFJS.Quad): Quad {
    if('hashCode' in original && 'equals' in original) {
      return original as Quad;
    }

    // Recursively convert subject if it's a Quad (triple term)
    const s = original.subject.termType === 'Quad'
      ? this.fromQuad(original.subject as RDFJS.Quad)
      : this.fromTerm(original.subject);

    // Predicate is always NamedNode or Variable
    const p = this.fromTerm(original.predicate);

    // Recursively convert object if it's a Quad (triple term)
    const o = original.object.termType === 'Quad'
      ? this.fromQuad(original.object as RDFJS.Quad)
      : this.fromTerm(original.object);

    const g = original.graph ? this.fromTerm(original.graph) : this.defaultGraph();

    return new ImmutableBaseQuad(s, p, o, g) as Quad;
  }

  /**
   * Creates a triple term (RDF-star / RDF 1.2) - a quad that can be used as subject or object of another quad.
   * Triple terms are quads in the default graph with termType "Quad".
   * @param subject - The subject of the triple term
   * @param predicate - The predicate of the triple term
   * @param object - The object of the triple term
   * @returns A Quad suitable for use as a triple term
   */
  tripleTerm(subject: RDFJS.Quad_Subject, predicate: RDFJS.Quad_Predicate, object: RDFJS.Quad_Object): Quad {
    return this.quad(subject, predicate, object, this.defaultGraph());
  }

  fromTerm(original: RDFJS.NamedNode): NamedNode;
  fromTerm(original: RDFJS.BlankNode): BlankNode;
  fromTerm(original: RDFJS.Literal): Literal;
  fromTerm(original: RDFJS.Variable): Variable;
  fromTerm(original: RDFJS.DefaultGraph): DefaultGraph;
  fromTerm(original: RDFJS.Quad): Quad;
  fromTerm(original: RDFJS.Quad_Subject): Quad_Subject;
  fromTerm(original: RDFJS.Quad_Predicate): Quad_Predicate;
  fromTerm(original: RDFJS.Quad_Object): Quad_Object;
  fromTerm(original: RDFJS.Quad_Graph): Quad_Graph;
  fromTerm(original: RDFJS.NamedNode | RDFJS.BlankNode | RDFJS.Literal | RDFJS.Variable | RDFJS.DefaultGraph | RDFJS.Quad): NamedNode | BlankNode | Literal | Variable | DefaultGraph | Quad {
    switch(original.termType) {
      case "NamedNode": return new ImmutableTerm('NamedNode', original.value);
      case "Variable": return new ImmutableTerm('Variable', original.value);
      case "BlankNode": return new ImmutableTerm('BlankNode', original.value);
      case "DefaultGraph": return new ImmutableTerm('DefaultGraph', original.value);
      case "Literal":
        const dt = this.fromTerm(original.datatype);
        return new ImmutableLiteral(original.value, dt, original.language, original.direction);
      case "Quad": return this.fromQuad(original);
    }

  }

  fromJs(value: any): Quad_Object {
    if (value instanceof Date) {
      return this.literal(value.toISOString(), XSD.dateTime);
    }
    if (typeof value === 'object' && value !== null && 'termType' in value) {
      return value as Quad_Object;
    }
    if (typeof value === 'string') {
      return this.literal(value);
    }
    if (typeof value === 'number') {
      if (Number.isInteger(value)) {
        return this.literal(value.toString(), XSD.integer);
      } else {
        return this.literal(value.toString(), XSD.decimal);
      }
    }
    if (typeof value === 'boolean') {
      return this.literal(value.toString(), XSD.boolean);
    }
    // Fallback: convert to string
    return this.literal(String(value));
  }

  toJs(term: RDFJS.Term): NamedNode | string | number | boolean | Date {
    if (term.termType === 'Literal') {
      const literal = term as Literal;
      if (literal.datatype.equals(XSD.string)) return literal.value;
      if (literal.datatype.equals(XSD.integer)) return parseInt(literal.value);
      if (literal.datatype.equals(XSD.decimal)) return parseFloat(literal.value);
      if (literal.datatype.equals(XSD.boolean)) return literal.value === 'true';
      if (literal.datatype.equals(XSD.dateTime)) return new Date(literal.value);
      return literal.value;
    }
    return term as NamedNode;
  }

  literal(value: string, languageOrDatatype?: string | NamedNode | RDFJS.DirectionalLanguage): Literal {

    var language = '';
    var datatype: NamedNode;
    var direction = null;

    if(!languageOrDatatype) {
      datatype = XSD.string;
    } else if(typeof languageOrDatatype === 'string') {
      datatype = XSD.langString;
      language = languageOrDatatype;
    } else if("language" in languageOrDatatype) {
      datatype = XSD.langString;
      direction = languageOrDatatype.direction;
    } else {
      datatype = languageOrDatatype;
    }
    return new ImmutableLiteral(value, datatype, language, direction);
  }

  namedNode<Iri extends string = string>(value: Iri): NamedNode<Iri> {
    return new ImmutableTerm("NamedNode", value);
  }

  quad(subject: RDFJS.Quad_Subject, predicate: RDFJS.Quad_Predicate, object: RDFJS.Quad_Object, graph?: RDFJS.Quad_Graph): Quad {
    const s = this.fromTerm(subject);
    const p = this.fromTerm(predicate);
    const o = this.fromTerm(object);
    const g = graph ? this.fromTerm(graph) : this.defaultGraph();

    return new ImmutableBaseQuad(s, p, o, g) as Quad;
  }

  variable(value: string): Variable {
    return new ImmutableTerm("Variable", value);
  }
}

export const factory = new ImmutableDataFactory();