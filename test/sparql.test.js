"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.testSparqlInterface = testSparqlInterface;
exports.testSparqlUpdateInterface = testSparqlUpdateInterface;
var bun_test_1 = require("bun:test");
var n3_js_1 = require("../src/graph/n3.js");
var immutable_js_1 = require("../src/graph/immutable.js");
var rdf_js_1 = require("../src/rdf.js");
var EX = (0, rdf_js_1.namespace)('http://example.org/');
var FOAF = (0, rdf_js_1.namespace)('http://xmlns.com/foaf/0.1/');
var XSD = (0, rdf_js_1.namespace)('http://www.w3.org/2001/XMLSchema#');
// Test data - People and their relationships
var testQuads = [
    // Alice knows Bob and Charlie
    rdf_js_1.factory.quad(EX.alice, FOAF.knows, EX.bob),
    rdf_js_1.factory.quad(EX.alice, FOAF.knows, EX.charlie),
    // Names
    rdf_js_1.factory.quad(EX.alice, FOAF.name, rdf_js_1.factory.literal('Alice Smith')),
    rdf_js_1.factory.quad(EX.bob, FOAF.name, rdf_js_1.factory.literal('Bob Jones')),
    rdf_js_1.factory.quad(EX.charlie, FOAF.name, rdf_js_1.factory.literal('Charlie Brown')),
    // Ages
    rdf_js_1.factory.quad(EX.alice, EX.age, rdf_js_1.factory.literal('30', XSD.integer)),
    rdf_js_1.factory.quad(EX.bob, EX.age, rdf_js_1.factory.literal('25', XSD.integer)),
    // Bob knows Charlie back
    rdf_js_1.factory.quad(EX.bob, FOAF.knows, EX.charlie)
];
/**
 * Generic test suite for SPARQL functionality on Graph interface
 */
function testSparqlInterface(name, createGraph, setupGraph) {
    var _this = this;
    (0, bun_test_1.describe)("".concat(name, " - SPARQL Interface"), function () {
        (0, bun_test_1.test)('should execute simple SELECT query', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, populatedGraph, query, bindings, _a, names;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, createGraph()];
                    case 1:
                        graph = _b.sent();
                        return [4 /*yield*/, setupGraph(graph, testQuads)];
                    case 2:
                        populatedGraph = _b.sent();
                        query = "\n        PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n        SELECT ?name WHERE {\n          ?person foaf:name ?name .\n        }\n      ";
                        _a = [[]];
                        return [4 /*yield*/, populatedGraph.select(query)];
                    case 3:
                        bindings = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                        (0, bun_test_1.expect)(bindings.length).toBe(3);
                        // Assert that bindings.get() returns proper RDF.Term objects, not raw SPARQL results
                        bindings.forEach(function (binding) {
                            var nameTerm = binding.get('name');
                            (0, bun_test_1.expect)(nameTerm).toBeDefined();
                            (0, bun_test_1.expect)(nameTerm.termType).toBe('Literal');
                            (0, bun_test_1.expect)(typeof nameTerm.value).toBe('string');
                            // Ensure it's not a raw SPARQL result object like {type: "literal", value: "..."}
                            (0, bun_test_1.expect)(nameTerm).not.toHaveProperty('type');
                        });
                        names = bindings.map(function (b) { var _a; return (_a = b.get('name')) === null || _a === void 0 ? void 0 : _a.value; }).sort();
                        (0, bun_test_1.expect)(names).toEqual(['Alice Smith', 'Bob Jones', 'Charlie Brown']);
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should execute SELECT query with filter', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, populatedGraph, query, bindings, _a, nameTerm;
            var _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, createGraph()];
                    case 1:
                        graph = _c.sent();
                        return [4 /*yield*/, setupGraph(graph, testQuads)];
                    case 2:
                        populatedGraph = _c.sent();
                        query = "\n        PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n        PREFIX ex: <http://example.org/>\n        SELECT ?name WHERE {\n          ?person foaf:name ?name .\n          ?person ex:age ?age .\n          FILTER(?age > 26)\n        }\n      ";
                        _a = [[]];
                        return [4 /*yield*/, populatedGraph.select(query)];
                    case 3:
                        bindings = __spreadArray.apply(void 0, _a.concat([_c.sent(), true]));
                        (0, bun_test_1.expect)(bindings.length).toBe(1);
                        nameTerm = bindings[0].get('name');
                        (0, bun_test_1.expect)(nameTerm).toBeDefined();
                        (0, bun_test_1.expect)(nameTerm.termType).toBe('Literal');
                        (0, bun_test_1.expect)(typeof nameTerm.value).toBe('string');
                        // Ensure it's not a raw SPARQL result object like {type: "literal", value: "..."}
                        (0, bun_test_1.expect)(nameTerm).not.toHaveProperty('type');
                        (0, bun_test_1.expect)((_b = bindings[0].get('name')) === null || _b === void 0 ? void 0 : _b.value).toBe('Alice Smith');
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should execute SELECT query with multiple variables', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, populatedGraph, query, bindings, _a, results;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, createGraph()];
                    case 1:
                        graph = _b.sent();
                        return [4 /*yield*/, setupGraph(graph, testQuads)];
                    case 2:
                        populatedGraph = _b.sent();
                        query = "\n        PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n        PREFIX ex: <http://example.org/>\n        SELECT ?person ?name ?age WHERE {\n          ?person foaf:name ?name .\n          ?person ex:age ?age .\n        }\n      ";
                        _a = [[]];
                        return [4 /*yield*/, populatedGraph.select(query)];
                    case 3:
                        bindings = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                        (0, bun_test_1.expect)(bindings.length).toBe(2);
                        // Assert that bindings.get() returns proper RDF.Term objects per Bindings interface
                        bindings.forEach(function (binding) {
                            var personTerm = binding.get('person');
                            var nameTerm = binding.get('name');
                            var ageTerm = binding.get('age');
                            // Person URIs should be NamedNode terms, not raw SPARQL objects like {type: "uri", value: "..."}
                            (0, bun_test_1.expect)(personTerm).toBeDefined();
                            (0, bun_test_1.expect)(personTerm.termType).toBe('NamedNode');
                            (0, bun_test_1.expect)(typeof personTerm.value).toBe('string');
                            (0, bun_test_1.expect)(personTerm).not.toHaveProperty('type');
                            // Name literals should be Literal terms, not raw SPARQL objects like {type: "literal", value: "..."}
                            (0, bun_test_1.expect)(nameTerm).toBeDefined();
                            (0, bun_test_1.expect)(nameTerm.termType).toBe('Literal');
                            (0, bun_test_1.expect)(typeof nameTerm.value).toBe('string');
                            (0, bun_test_1.expect)(nameTerm).not.toHaveProperty('type');
                            // Age literals should be typed Literal terms
                            (0, bun_test_1.expect)(ageTerm).toBeDefined();
                            (0, bun_test_1.expect)(ageTerm.termType).toBe('Literal');
                            (0, bun_test_1.expect)(typeof ageTerm.value).toBe('string');
                            (0, bun_test_1.expect)(ageTerm).not.toHaveProperty('type');
                        });
                        results = bindings.map(function (b) {
                            var _a, _b, _c;
                            return ({
                                person: (_a = b.get('person')) === null || _a === void 0 ? void 0 : _a.value,
                                name: (_b = b.get('name')) === null || _b === void 0 ? void 0 : _b.value,
                                age: (_c = b.get('age')) === null || _c === void 0 ? void 0 : _c.value
                            });
                        });
                        (0, bun_test_1.expect)(results).toEqual(bun_test_1.expect.arrayContaining([
                            bun_test_1.expect.objectContaining({
                                person: EX.alice.value,
                                name: 'Alice Smith',
                                age: '30'
                            }),
                            bun_test_1.expect.objectContaining({
                                person: EX.bob.value,
                                name: 'Bob Jones',
                                age: '25'
                            })
                        ]));
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should execute ASK query - true case', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, populatedGraph, query, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, createGraph()];
                    case 1:
                        graph = _a.sent();
                        return [4 /*yield*/, setupGraph(graph, testQuads)];
                    case 2:
                        populatedGraph = _a.sent();
                        query = "\n        PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n        PREFIX ex: <http://example.org/>\n        ASK {\n          ex:alice foaf:knows ex:bob .\n        }\n      ";
                        return [4 /*yield*/, populatedGraph.ask(query)];
                    case 3:
                        result = _a.sent();
                        (0, bun_test_1.expect)(result).toBe(true);
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should execute ASK query - false case', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, populatedGraph, query, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, createGraph()];
                    case 1:
                        graph = _a.sent();
                        return [4 /*yield*/, setupGraph(graph, testQuads)];
                    case 2:
                        populatedGraph = _a.sent();
                        query = "\n        PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n        PREFIX ex: <http://example.org/>\n        ASK {\n          ex:charlie foaf:knows ex:alice .\n        }\n      ";
                        return [4 /*yield*/, populatedGraph.ask(query)];
                    case 3:
                        result = _a.sent();
                        (0, bun_test_1.expect)(result).toBe(false);
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should execute ASK query with pattern', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, populatedGraph, query, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, createGraph()];
                    case 1:
                        graph = _a.sent();
                        return [4 /*yield*/, setupGraph(graph, testQuads)];
                    case 2:
                        populatedGraph = _a.sent();
                        query = "\n        PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n        ASK {\n          ?person foaf:name \"Alice Smith\" .\n        }\n      ";
                        return [4 /*yield*/, populatedGraph.ask(query)];
                    case 3:
                        result = _a.sent();
                        (0, bun_test_1.expect)(result).toBe(true);
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should execute CONSTRUCT query', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, populatedGraph, query, resultGraph, resultQuads, _a, predicates, names;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, createGraph()];
                    case 1:
                        graph = _b.sent();
                        return [4 /*yield*/, setupGraph(graph, testQuads)];
                    case 2:
                        populatedGraph = _b.sent();
                        query = "\n        PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n        PREFIX ex: <http://example.org/>\n        CONSTRUCT {\n          ?person ex:hasName ?name .\n        } WHERE {\n          ?person foaf:name ?name .\n        }\n      ";
                        return [4 /*yield*/, populatedGraph.construct(query)];
                    case 3:
                        resultGraph = _b.sent();
                        _a = [[]];
                        return [4 /*yield*/, resultGraph.quads()];
                    case 4:
                        resultQuads = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                        (0, bun_test_1.expect)(resultQuads.length).toBe(3);
                        predicates = resultQuads.map(function (q) { return q.predicate.value; });
                        (0, bun_test_1.expect)(predicates.every(function (p) { return p === 'http://example.org/hasName'; })).toBe(true);
                        names = resultQuads.map(function (q) { return q.object.value; }).sort();
                        (0, bun_test_1.expect)(names).toEqual(['Alice Smith', 'Bob Jones', 'Charlie Brown']);
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should execute CONSTRUCT query with filter', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, populatedGraph, query, resultGraph, resultQuads, _a, subjects, objects;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, createGraph()];
                    case 1:
                        graph = _b.sent();
                        return [4 /*yield*/, setupGraph(graph, testQuads)];
                    case 2:
                        populatedGraph = _b.sent();
                        query = "\n        PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n        PREFIX ex: <http://example.org/>\n        CONSTRUCT {\n          ?person ex:isAdult true .\n        } WHERE {\n          ?person ex:age ?age .\n          FILTER(?age >= 25)\n        }\n      ";
                        return [4 /*yield*/, populatedGraph.construct(query)];
                    case 3:
                        resultGraph = _b.sent();
                        _a = [[]];
                        return [4 /*yield*/, resultGraph.quads()];
                    case 4:
                        resultQuads = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                        (0, bun_test_1.expect)(resultQuads.length).toBe(2);
                        subjects = resultQuads.map(function (q) { return q.subject.value; }).sort();
                        (0, bun_test_1.expect)(subjects).toEqual([EX.alice.value, EX.bob.value].sort());
                        objects = resultQuads.map(function (q) { return q.object.value; });
                        (0, bun_test_1.expect)(objects.every(function (o) { return o === 'true'; })).toBe(true);
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should handle empty results in SELECT', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, populatedGraph, query, bindings, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, createGraph()];
                    case 1:
                        graph = _b.sent();
                        return [4 /*yield*/, setupGraph(graph, testQuads)];
                    case 2:
                        populatedGraph = _b.sent();
                        query = "\n        PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n        PREFIX ex: <http://example.org/>\n        SELECT ?name WHERE {\n          ex:nonexistent foaf:name ?name .\n        }\n      ";
                        _a = [[]];
                        return [4 /*yield*/, populatedGraph.select(query)];
                    case 3:
                        bindings = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                        (0, bun_test_1.expect)(bindings.length).toBe(0);
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should handle empty results in CONSTRUCT', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, populatedGraph, query, resultGraph, resultQuads, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, createGraph()];
                    case 1:
                        graph = _b.sent();
                        return [4 /*yield*/, setupGraph(graph, testQuads)];
                    case 2:
                        populatedGraph = _b.sent();
                        query = "\n        PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n        PREFIX ex: <http://example.org/>\n        CONSTRUCT {\n          ?person ex:isChild true .\n        } WHERE {\n          ?person ex:age ?age .\n          FILTER(?age < 18)\n        }\n      ";
                        return [4 /*yield*/, populatedGraph.construct(query)];
                    case 3:
                        resultGraph = _b.sent();
                        _a = [[]];
                        return [4 /*yield*/, resultGraph.quads()];
                    case 4:
                        resultQuads = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                        (0, bun_test_1.expect)(resultQuads.length).toBe(0);
                        return [2 /*return*/];
                }
            });
        }); });
    });
}
/**
 * Generic test suite for SPARQL UPDATE functionality on MutableGraph interface
 */
function testSparqlUpdateInterface(name, createGraph, setupGraph) {
    var _this = this;
    (0, bun_test_1.describe)("".concat(name, " - SPARQL UPDATE Interface"), function () {
        (0, bun_test_1.test)('INSERT DATA adds triples', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, quads, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, createGraph()];
                    case 1:
                        graph = _b.sent();
                        return [4 /*yield*/, graph.update("\n        PREFIX ex: <http://example.org/>\n        INSERT DATA {\n          ex:subject ex:predicate \"value\" .\n        }\n      ")];
                    case 2:
                        _b.sent();
                        _a = [[]];
                        return [4 /*yield*/, graph.quads()];
                    case 3:
                        quads = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                        (0, bun_test_1.expect)(quads.length).toBe(1);
                        (0, bun_test_1.expect)(quads[0].subject.value).toBe('http://example.org/subject');
                        (0, bun_test_1.expect)(quads[0].predicate.value).toBe('http://example.org/predicate');
                        (0, bun_test_1.expect)(quads[0].object.value).toBe('value');
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('DELETE DATA removes triples', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, _a, before, _b, after, _c, remaining, _d, aliceKnowsBob;
            return __generator(this, function (_e) {
                switch (_e.label) {
                    case 0:
                        _a = setupGraph;
                        return [4 /*yield*/, createGraph()];
                    case 1: return [4 /*yield*/, _a.apply(void 0, [_e.sent(), testQuads])];
                    case 2:
                        graph = _e.sent();
                        _b = [[]];
                        return [4 /*yield*/, graph.quads()];
                    case 3:
                        before = __spreadArray.apply(void 0, _b.concat([_e.sent(), true])).length;
                        return [4 /*yield*/, graph.update("\n        PREFIX ex: <http://example.org/>\n        PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n        DELETE DATA {\n          ex:alice foaf:knows ex:bob .\n        }\n      ")];
                    case 4:
                        _e.sent();
                        _c = [[]];
                        return [4 /*yield*/, graph.quads()];
                    case 5:
                        after = __spreadArray.apply(void 0, _c.concat([_e.sent(), true])).length;
                        (0, bun_test_1.expect)(after).toBe(before - 1);
                        _d = [[]];
                        return [4 /*yield*/, graph.quads()];
                    case 6:
                        remaining = __spreadArray.apply(void 0, _d.concat([_e.sent(), true]));
                        aliceKnowsBob = remaining.find(function (q) {
                            return q.subject.value === EX.alice.value &&
                                q.predicate.value === FOAF.knows.value &&
                                q.object.value === EX.bob.value;
                        });
                        (0, bun_test_1.expect)(aliceKnowsBob).toBeUndefined();
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('DELETE WHERE with pattern matching', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, _a, quads, _b, knowsTriples;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _a = setupGraph;
                        return [4 /*yield*/, createGraph()];
                    case 1: return [4 /*yield*/, _a.apply(void 0, [_c.sent(), testQuads])];
                    case 2:
                        graph = _c.sent();
                        return [4 /*yield*/, graph.update("\n        PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n        DELETE WHERE {\n          ?s foaf:knows ?o .\n        }\n      ")];
                    case 3:
                        _c.sent();
                        _b = [[]];
                        return [4 /*yield*/, graph.quads()];
                    case 4:
                        quads = __spreadArray.apply(void 0, _b.concat([_c.sent(), true]));
                        knowsTriples = quads.filter(function (q) {
                            return q.predicate.value === FOAF.knows.value;
                        });
                        (0, bun_test_1.expect)(knowsTriples.length).toBe(0);
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('INSERT-DELETE combined operation', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, _a, quads, _b, aliceName;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        _a = setupGraph;
                        return [4 /*yield*/, createGraph()];
                    case 1: return [4 /*yield*/, _a.apply(void 0, [_c.sent(), testQuads])];
                    case 2:
                        graph = _c.sent();
                        return [4 /*yield*/, graph.update("\n        PREFIX ex: <http://example.org/>\n        PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n        DELETE { ?person foaf:name ?oldName }\n        INSERT { ?person foaf:name \"Updated Name\" }\n        WHERE {\n          ?person foaf:name ?oldName .\n          FILTER(?person = ex:alice)\n        }\n      ")];
                    case 3:
                        _c.sent();
                        _b = [[]];
                        return [4 /*yield*/, graph.quads()];
                    case 4:
                        quads = __spreadArray.apply(void 0, _b.concat([_c.sent(), true]));
                        aliceName = quads.find(function (q) {
                            return q.subject.value === EX.alice.value &&
                                q.predicate.value === FOAF.name.value;
                        });
                        (0, bun_test_1.expect)(aliceName === null || aliceName === void 0 ? void 0 : aliceName.object.value).toBe('Updated Name');
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('no-op when WHERE matches nothing', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, _a, before, _b, after, _c;
            return __generator(this, function (_d) {
                switch (_d.label) {
                    case 0:
                        _a = setupGraph;
                        return [4 /*yield*/, createGraph()];
                    case 1: return [4 /*yield*/, _a.apply(void 0, [_d.sent(), testQuads])];
                    case 2:
                        graph = _d.sent();
                        _b = [[]];
                        return [4 /*yield*/, graph.quads()];
                    case 3:
                        before = __spreadArray.apply(void 0, _b.concat([_d.sent(), true])).length;
                        return [4 /*yield*/, graph.update("\n        PREFIX ex: <http://example.org/>\n        DELETE { ?s ?p ?o }\n        WHERE {\n          ex:nonexistent ?p ?o .\n          ?s ?p ?o .\n        }\n      ")];
                    case 4:
                        _d.sent();
                        _c = [[]];
                        return [4 /*yield*/, graph.quads()];
                    case 5:
                        after = __spreadArray.apply(void 0, _c.concat([_d.sent(), true])).length;
                        (0, bun_test_1.expect)(after).toBe(before);
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('rejects invalid syntax', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, createGraph()];
                    case 1:
                        graph = _a.sent();
                        return [4 /*yield*/, (0, bun_test_1.expect)(graph.update('INVALID SYNTAX HERE')).rejects.toThrow()];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
    });
}
// Test against concrete implementations
testSparqlInterface('N3Graph', function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
    return [2 /*return*/, new n3_js_1.N3Graph()];
}); }); }, function (graph, quads) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, graph.add(quads)];
            case 1:
                _a.sent();
                return [2 /*return*/, graph];
        }
    });
}); });
testSparqlInterface('ImmutableSetGraph', function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
    return [2 /*return*/, new immutable_js_1.ImmutableSetGraph()];
}); }); }, function (graph, quads) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0: return [4 /*yield*/, graph.add(quads)];
            case 1: return [2 /*return*/, _a.sent()];
        }
    });
}); });
// Test SPARQL UPDATE on MutableGraph implementations
testSparqlUpdateInterface('N3Graph', function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
    return [2 /*return*/, new n3_js_1.N3Graph()];
}); }); }, function (graph, quads) { return __awaiter(void 0, void 0, void 0, function () {
    return __generator(this, function (_a) {
        graph.add(quads);
        return [2 /*return*/, graph];
    });
}); });
