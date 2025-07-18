import { ChangeSetGraph } from './graph/changeset';
import { factory } from './rdf';
import { NamedNode, Term } from '@rdfjs/types';




export class Resource implements NamedNode {
  private changeset: ChangeSetGraph;

  public termType: "NamedNode" = "NamedNode";
  public value: string;
  
  constructor(changeset: ChangeSetGraph, subject: NamedNode) {

    this.changeset = changeset;
    this.value = subject.value;
  }

  equals(other: Term | null | undefined): boolean {
    if (!other) return false;
    if (other.termType !== "NamedNode") return false;
    return other.value === this.value;
  }

  static with(resource: Resource, subject: NamedNode): Resource {
    return new Resource(resource.changeset, subject);
  }

  set(predicate: NamedNode, value: ResourceValue): this {
    // Remove existing values for this predicate
    const existing = [...this.changeset.find(this, predicate, null)];
    if (existing.length > 0) {
      this.changeset.remove(existing);
    }
    
    // Add new value
    const term = factory.fromJs(value);
    const quad = factory.quad(this, predicate, term);
    this.changeset.add([quad]);
    
    return this;
  }

  get(predicate: NamedNode): ResourceValue | undefined {
    const quads = [...this.changeset.find(this, predicate, null)];
    if (quads.length === 0) return undefined;
    
    const objectTerm = quads[0].object;
    
    // Special case: if it's a NamedNode, return a new Resource
    if (objectTerm.termType === 'NamedNode') {
      return new Resource(this.changeset, objectTerm as NamedNode);
    }
    
    // Convert RDF term back to JS value
    return factory.toJs(objectTerm);
  }

  getAll(predicate: NamedNode): Iterable<ResourceValue> {
    const quads = [...this.changeset.find(this, predicate, null)];
    return quads.map(quad => {
      const objectTerm = quad.object;
      if (objectTerm.termType === 'NamedNode') {
        return new Resource(this.changeset, objectTerm as NamedNode);
      }
      return factory.toJs(objectTerm);
    });
  }

  setAll(predicate: NamedNode, values: ResourceValue[]): this {
    // Remove existing values
    const existing = [...this.changeset.find(this, predicate, null)];
    if (existing.length > 0) {
      this.changeset.remove(existing);
    }
    
    // Add new values
    const quads = values.map(value => {
      const term = factory.fromJs(value);
      return factory.quad(this, predicate, term);
    });
    this.changeset.add(quads);
    
    return this;
  }

  has(predicate: NamedNode): boolean {
    const quads = [...this.changeset.find(this, predicate, null)];
    return quads.length > 0;
  }

  delete(predicate: NamedNode): this {
    const existing = [...this.changeset.find(this, null)];
    if (existing.length > 0) {
      this.changeset.remove(existing);
    }
    return this;
  }

  entries(): Iterable<[NamedNode, ResourceValue]> {
    const quads = [...this.changeset.find(this, null, null)];
    return quads.map(quad => {
      const predicate = quad.predicate as NamedNode;
      const objectTerm = quad.object;
      let value: ResourceValue;
      
      if (objectTerm.termType === 'NamedNode') {
        value = new Resource(this.changeset, objectTerm as NamedNode);
      } else {
        value = factory.toJs(objectTerm);
      }
      
      return [predicate, value];
    });
  }
}

export type ResourceValue = Resource | NamedNode | string | number | boolean | Date;