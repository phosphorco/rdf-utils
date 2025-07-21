import { ChangeSetGraph } from './graph/changeset';
import { factory } from './rdf';
import { NamedNode, Quad_Subject, Term } from '@rdfjs/types';

class Resource<T extends Quad_Subject> {
  public changeset: ChangeSetGraph;
  public subject: T;

  public get termType() { return this.subject.termType }
  public get value() { return this.subject.value; }

  constructor(changeset: ChangeSetGraph, subject: T) {
    this.changeset = changeset;
    this.subject = subject;
  }

  equals(other: Term | null | undefined): boolean {
    if (!other) return false;
    if (other.termType !== this.subject.termType) return false;
    return other.value === this.subject.value;
  }

  set(predicate: NamedNode, value: ResourceValue): this {
    // Remove existing values for this predicate
    const existing = [...this.changeset.find(this.subject, predicate, null)];
    if (existing.length > 0) {
      this.changeset.remove(existing);
    }
    
    // Add new value
    const term = factory.fromJs(value);
    const quad = factory.quad(this.subject, predicate, term);
    this.changeset.add([quad]);
    
    return this;
  }

  add(predicate: NamedNode, value: ResourceValue): this {

    // Add new value
    const term = factory.fromJs(value);
    const quad = factory.quad(this.subject, predicate, term);
    this.changeset.add([quad]);

    return this;
  }

  get(predicate: NamedNode): ResourceValue | undefined {
    const quads = [...this.changeset.find(this.subject, predicate, null)];
    if (quads.length === 0) return undefined;
    
    const objectTerm = quads[0].object;


    // Special case: if it's a NamedNode, return a new Resource
    if (objectTerm.termType === 'NamedNode' || objectTerm.termType === 'BlankNode') {
      return resource(this.changeset, objectTerm);
    }

    // Convert RDF term back to JS value
    return factory.toJs(objectTerm);
  }

  getAll(predicate: NamedNode): Iterable<ResourceValue> {
    const quads = [...this.changeset.find(this.subject, predicate, null)];
    return quads.map(quad => {
      const objectTerm = quad.object;
      if (objectTerm.termType === 'NamedNode' || objectTerm.termType === 'BlankNode') {
        return resource(this.changeset, objectTerm);
      }
      return factory.toJs(objectTerm);
    });
  }

  setAll(predicate: NamedNode, values: ResourceValue[]): this {
    // Remove existing values
    const existing = [...this.changeset.find(this.subject, predicate, null)];
    if (existing.length > 0) {
      this.changeset.remove(existing);
    }
    
    // Add new values
    const quads = values.map(value => {
      const term = factory.fromJs(value);
      return factory.quad(this.subject, predicate, term);
    });
    this.changeset.add(quads);
    
    return this;
  }

  has(predicate: NamedNode): boolean {
    const quads = [...this.changeset.find(this.subject, predicate, null)];
    return quads.length > 0;
  }

  delete(predicate: NamedNode): this {
    const existing = [...this.changeset.find(this.subject, null)];
    if (existing.length > 0) {
      this.changeset.remove(existing);
    }
    return this;
  }

  entries(): Iterable<[NamedNode, ResourceValue]> {
    const quads = [...this.changeset.find(this.subject, null, null)];
    return quads.map(quad => {
      const predicate = quad.predicate as NamedNode;
      const objectTerm = quad.object;
      let value: ResourceValue;
      
      if (objectTerm.termType === 'NamedNode' || objectTerm.termType === 'BlankNode') {
        value = resource(this.changeset, objectTerm);
      } else {
        value = factory.toJs(objectTerm);
      }
      
      return [predicate, value];
    });
  }
}

export type ResourceOf<T extends Quad_Subject> = Resource<T> & T;

export function resource<T extends Quad_Subject>(changeset: ChangeSetGraph, subject: T): ResourceOf<T> {
  // Ugly cast, HOWEVER, we know it's guaranteed to work.
  return new Resource<T>(changeset, subject) as unknown as ResourceOf<T>;
}

export type ResourceValue = Quad_Subject | string | number | boolean | Date;