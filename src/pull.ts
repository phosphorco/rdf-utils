import {
  NamedNode,
  factory,
  Variable,
  RDF,
  Quad,
  Term,
  Literal,
  Quad_Subject, Quad_Object
} from './rdf';
import * as rdfjs from '@rdfjs/types';
import { Graph } from './graph';
import {
  ConstructQuery,
  SelectQuery,
  Triple,
  Pattern,
  BgpPattern,
  BindPattern,
  FilterPattern,
  PropertyPath,
  Expression, VariableTerm, Generator, OptionalPattern
} from 'sparqljs';
import * as sparqljs from 'sparqljs';
import { Map, is, Seq } from 'immutable'
import {N3Graph} from "./graph/n3";
import {ImmutableSetGraph} from "./graph/immutable";

export type ConstraintValue = NamedNode | string | number | boolean | undefined;
export type RecurseExpr = [NamedNode, '...'];
export type NestedExpr = [NamedNode, PullExpr];
export type ConstraintExpr = [NamedNode, ConstraintValue];
export type PullExpr = PullExprProperty[];
export type PullExprProperty = NamedNode | '*' | RecurseExpr | NestedExpr | ConstraintExpr;

export async function pull(graph: Graph<any>, pull: PullExpr, startingResource?: NamedNode): Promise<ImmutableSetGraph> {

  const root = startingResource || getVar('root');
  const { patterns, template } = build(pull, root);

  // Required because some SPARQL impls (e.g. Stardog) yield incorrect results when variables used in a CONSTRUCT are unbound
  const safeTemplate: Quad[] = [];
  const bindPatterns: Record<string, BindPattern> = {};
  for(const q of template) {

    function safe(term: rdfjs.Quad_Subject | rdfjs.Quad_Object) {
      let safeTerm = term;
      if (term.termType === 'Variable') {
        safeTerm = factory.variable(term.value + "_r");
        if (!(term.value in bindPatterns)) {
          bindPatterns[term.value] = bind(safeTerm, ifExpr(boundExpr(term), term, RDF.filterMe))
        }
      }
      return safeTerm;
    }
    safeTemplate.push(factory.quad(safe(q.subject) as Quad_Subject, q.predicate, safe(q.object)));
  }

  const query: ConstructQuery = {
    type: 'query',
    queryType: 'CONSTRUCT',
    prefixes: {},
    template: safeTemplate,
    where: [...patterns, ...Object.values(bindPatterns)]
  }

  const generator = new Generator();

  const result = await graph.construct(query);
  const filtered = Seq(result.quads()).filter(({subject, predicate, object}) =>
      !(is(subject, RDF.filterMe) || is(object, RDF.filterMe))
  ).toSet();

  return new ImmutableSetGraph(result.iri, filtered);
}

function build(expr: PullExpr, root: Variable | NamedNode) {

  const subject = getVar('subj');

  // We use this to normalize to the recursive lookup form
  let recurTriple: sparqljs.Triple = {
    subject: root,
    predicate: {type: 'path', pathType: "*", items: [RDF.noSuchProperty]},
    object: subject
  }

  const template: Quad[] = [];
  const bgpTriples: sparqljs.Triple[] = [];
  const patterns: Pattern[] = [];

  function processProperty(predicate: NamedNode) {
    const object = getVar('val');
    const t = factory.quad(subject, predicate, object);
    template.push(t);
    patterns.push(optional(bgp([t])));
  }

  // Process a wildcard property (*) - also optional by default
  function processWildcard() {
    const predicate = getVar();
    const object = getVar();
    const t = factory.quad(subject, predicate, object);
    template.push(t);
    bgpTriples.push(t);
  }

  // Process a recursive expression ([NamedNode, '...'])
  function processRecurse(predicate: NamedNode) {
    recurTriple = {
      subject: root,
      predicate: {
        type: "path",
        pathType: "*",
        items: [predicate]
      },
      object: subject,
    };
    const object = getVar('recur_object');
    const t = factory.quad(subject, predicate, object);
    template.push(t);
    patterns.push(optional(bgp([t])));
  }

  // Process a nested expression ([NamedNode, PullExpr]) - also optional by default
  function processNested(expr: NestedExpr) {
    const [predicate, nestedExpr] = expr;
    const object = getVar('nested');
    const link = factory.quad(subject, predicate, object)
    template.push(link);
    const nested = build(nestedExpr, object);
    template.push(...nested.template);
    patterns.push(optional(bgp([link]), ...nested.patterns));
  }

  // Process a constraint expression ([NamedNode, value]) - these are required
  function processConstraint(predicate: NamedNode, value: ConstraintValue) {
    let object: Term;
    if (value === undefined) {
      object = getVar('val');
    } else if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number') {
      object = factory.fromJs(value) as Literal;
    } else {
      object = value;
    }
    const t = factory.quad(subject, predicate, object);
    template.push(t);
    bgpTriples.push(t);
  }

  // Build required and optional triple patterns
  for (const prop of expr) {
    if (prop === '*') {
      processWildcard();
    } else if ('termType' in prop && prop.termType === 'NamedNode') {
      processProperty(prop);
    } else if (Array.isArray(prop)) {
      const [predicate, value] = prop;
      if (value === '...') {
        processRecurse(predicate);
      } else if (Array.isArray(value)) {
        processNested(prop as NestedExpr);
      } else {
        processConstraint(predicate, value);
      }
    }
  }

  // Always have a recursive triple to normalize naming & lookup
  bgpTriples.push(recurTriple);

  return {
    patterns: [bgp(bgpTriples), ...patterns] as Pattern[],
    template: template
  }

}

let variableCounter = 0;
function getVar(prefix: string = 'v') {
  return factory.variable(`${prefix}_${variableCounter++}`);
}


function bgp(triples: sparqljs.Triple[]) : Pattern {
  return {
    type: "bgp",
    triples: triples
  }
}

function optional(...patterns: Pattern[]) : OptionalPattern {
  return {type: 'optional', patterns: patterns};
}

function optionalsFromQuads(triples: rdfjs.Quad[]) : Pattern[] {
  return triples.map(triple => optional(bgp([triple])));
}

function bind(v: rdfjs.Variable, expr: Expression): BindPattern {
  return {type: 'bind', expression: expr, variable: v};
}

function ifExpr(...args: [Expression, Expression, Expression]): Expression {
  return {type: 'operation', operator: 'if', args: args};
}

function boundExpr(v: rdfjs.Variable): Expression {
  return {type: 'operation', operator: 'bound', args: [v]};
}
