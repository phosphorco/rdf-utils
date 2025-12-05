"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
Object.defineProperty(exports, "__esModule", { value: true });
var sparqljs_1 = require("sparqljs");
var rdf_js_1 = require("./src/rdf.js");
var query = "\n  PREFIX ex: <http://example.org/>\n  INSERT DATA {\n    ex:subject ex:predicate \"value\" .\n  }\n";
var parser = new sparqljs_1.Parser({ prefixes: rdf_js_1.globalPrefixMap });
var parsed = parser.parse(query);
// Inject graph context like prepareUpdate does
var graphIri = rdf_js_1.factory.namedNode('http://test.example.org/graph');
// Wrap patterns in GRAPH
function wrapInGraph(patterns, graphIri) {
    return patterns.map(function (pattern) {
        if (pattern.type === 'graph')
            return pattern;
        if (pattern.type === 'bgp') {
            return { type: 'graph', name: graphIri, triples: pattern.triples };
        }
        return pattern;
    });
}
parsed.updates = parsed.updates.map(function (op) {
    if ('updateType' in op && op.updateType === 'insert' && op.insert) {
        return __assign(__assign({}, op), { insert: wrapInGraph(op.insert, graphIri) });
    }
    return op;
});
console.log("After injection:", JSON.stringify(parsed, null, 2));
var generator = new sparqljs_1.Generator({ prefixes: parsed.prefixes });
var generated = generator.stringify(parsed);
console.log("\nGenerated SPARQL:\n", generated);
