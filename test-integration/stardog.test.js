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
var bun_test_1 = require("bun:test");
var stardog_js_1 = require("../src/graph/stardog.js");
var graph_test_js_1 = require("../test/graph.test.js");
var sparql_test_js_1 = require("../test/sparql.test.js");
var pull_test_ts_1 = require("../test/pull.test.ts");
var transactional_graph_test_js_1 = require("../test/transactional-graph.test.js");
var rdf_js_1 = require("../src/rdf.js");
var n3_js_1 = require("../src/graph/n3.js");
// Load environment variables and construct endpoint
var protocol = process.env.STARDOG_PROTOCOL || 'http';
var host = process.env.STARDOG_HOST || 'localhost';
var port = process.env.STARDOG_PORT || '5820';
var endpoint = "".concat(protocol, "://").concat(host, ":").concat(port);
var config = {
    endpoint: endpoint,
    username: process.env.STARDOG_USERNAME || 'admin',
    password: process.env.STARDOG_PASSWORD || 'admin',
    database: process.env.STARDOG_DATABASE || 'test'
};
// Additional configuration
var reasoning = process.env.STARDOG_REASONING === 'true';
var timeout = parseInt(process.env.STARDOG_TIMEOUT || '30000');
// Test graph IRI for integration tests
var testGraphIri = rdf_js_1.factory.namedNode('http://test.example.org/integration/graph');
// Helper to create a clean test graph
function createTestGraph() {
    return __awaiter(this, arguments, void 0, function (enableReasoning) {
        var graph, remainingQuads, _a, _i, remainingQuads_1, quad, err_1;
        if (enableReasoning === void 0) { enableReasoning = false; }
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    graph = new stardog_js_1.StardogGraph(config, testGraphIri, enableReasoning);
                    _b.label = 1;
                case 1:
                    _b.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, graph.deleteAll()];
                case 2:
                    _b.sent();
                    _a = [[]];
                    return [4 /*yield*/, graph.quads()];
                case 3:
                    remainingQuads = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                    if (remainingQuads.length > 0) {
                        for (_i = 0, remainingQuads_1 = remainingQuads; _i < remainingQuads_1.length; _i++) {
                            quad = remainingQuads_1[_i];
                            console.log(quad);
                        }
                        throw new Error("Test graph cleanup FAILED: ".concat(remainingQuads.length, " quads remain after deleteAll(). Test cannot proceed with dirty state."));
                    }
                    return [3 /*break*/, 5];
                case 4:
                    err_1 = _b.sent();
                    if (err_1 instanceof Error && err_1.message.includes('Test graph cleanup FAILED')) {
                        throw err_1; // Re-throw cleanup failures
                    }
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/, graph];
            }
        });
    });
}
// Helper to clear entire database (all graphs) between pragma tests
function clearDatabase() {
    return __awaiter(this, void 0, void 0, function () {
        var schemaGraphIri, schemaGraph, _a, testGraph, _b;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    schemaGraphIri = rdf_js_1.factory.namedNode('tag:stardog:api:context:schema');
                    schemaGraph = new stardog_js_1.StardogGraph(config, schemaGraphIri, true);
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, schemaGraph.deleteAll()];
                case 2:
                    _c.sent();
                    return [3 /*break*/, 4];
                case 3:
                    _a = _c.sent();
                    return [3 /*break*/, 4];
                case 4:
                    testGraph = new stardog_js_1.StardogGraph(config, testGraphIri, true);
                    _c.label = 5;
                case 5:
                    _c.trys.push([5, 7, , 8]);
                    return [4 /*yield*/, testGraph.deleteAll()];
                case 6:
                    _c.sent();
                    return [3 /*break*/, 8];
                case 7:
                    _b = _c.sent();
                    return [3 /*break*/, 8];
                case 8: return [2 /*return*/];
            }
        });
    });
}
// Helper to set up graph with test data (for specific quad tests)
function setupGraphWithQuads(graph, quads) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, graph.add(quads)];
                case 1:
                    _a.sent();
                    return [2 /*return*/, graph];
            }
        });
    });
}
// Helper to set up graph with foaf-social.ttl data (for pull tests)
function setupGraphWithFoafData(graph) {
    return __awaiter(this, void 0, void 0, function () {
        var n3Graph, quads, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, n3_js_1.N3Graph.fromFile('test/data/foaf-social.ttl')];
                case 1:
                    n3Graph = _b.sent();
                    _a = [[]];
                    return [4 /*yield*/, n3Graph.quads()];
                case 2:
                    quads = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                    return [4 /*yield*/, graph.add(quads)];
                case 3:
                    _b.sent();
                    return [2 /*return*/, graph];
            }
        });
    });
}
(0, bun_test_1.describe)('Stardog Integration Tests', function () {
    (0, bun_test_1.beforeAll)(function () { return __awaiter(void 0, void 0, void 0, function () {
        var testGraph, quads, _a, error_1;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0:
                    _b.trys.push([0, 3, , 4]);
                    return [4 /*yield*/, createTestGraph()];
                case 1:
                    testGraph = _b.sent();
                    _a = [[]];
                    return [4 /*yield*/, testGraph.quads()];
                case 2:
                    quads = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                    console.log("Connected to Stardog at ".concat(config.endpoint, "/").concat(config.database, " (reasoning: ").concat(reasoning, ")"));
                    return [3 /*break*/, 4];
                case 3:
                    error_1 = _b.sent();
                    console.error('Failed to connect to Stardog:', error_1);
                    throw new Error("Cannot connect to Stardog. Please ensure Stardog is running and credentials are correct. Error: ".concat(error_1));
                case 4: return [2 /*return*/];
            }
        });
    }); });
    (0, bun_test_1.afterAll)(function () { return __awaiter(void 0, void 0, void 0, function () {
        var graph, err_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    graph = new stardog_js_1.StardogGraph(config, testGraphIri, false);
                    return [4 /*yield*/, graph.deleteAll()];
                case 1:
                    _a.sent();
                    return [3 /*break*/, 3];
                case 2:
                    err_2 = _a.sent();
                    // Best effort cleanup
                    console.warn('Failed to clean up test graph:', err_2);
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // Test basic graph interface
    (0, graph_test_js_1.testGraphInterface)('StardogGraph', createTestGraph, setupGraphWithQuads);
    // Test mutable graph interface
    (0, graph_test_js_1.testMutableGraphInterface)('StardogGraph', createTestGraph);
    // Test SPARQL interface
    (0, sparql_test_js_1.testSparqlInterface)('StardogGraph', createTestGraph, setupGraphWithQuads);
    // Test SPARQL UPDATE interface
    (0, sparql_test_js_1.testSparqlUpdateInterface)('StardogGraph', createTestGraph, setupGraphWithQuads);
    // Test transactional graph interface
    (0, transactional_graph_test_js_1.testTransactionalGraphInterface)('StardogGraph', createTestGraph, function (graph) { return __awaiter(void 0, void 0, void 0, function () {
        var err_3;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 2, , 3]);
                    return [4 /*yield*/, graph.deleteAll()];
                case 1:
                    _a.sent();
                    return [3 /*break*/, 3];
                case 2:
                    err_3 = _a.sent();
                    return [3 /*break*/, 3];
                case 3: return [2 /*return*/];
            }
        });
    }); });
    // Test pull interface
    (0, pull_test_ts_1.testPullInterface)('StardogGraph', createTestGraph, setupGraphWithFoafData);
    // Stardog-specific tests
    (0, bun_test_1.describe)('Stardog-specific functionality', function () {
        (0, bun_test_1.test)('should execute operations within a transaction successfully', function () { return __awaiter(void 0, void 0, void 0, function () {
            var graph, testQuad, quads, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, createTestGraph()];
                    case 1:
                        graph = _b.sent();
                        testQuad = rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/test'), rdf_js_1.factory.namedNode('http://example.org/property'), rdf_js_1.factory.literal('test value'));
                        // Execute add operation within transaction
                        return [4 /*yield*/, graph.inTransaction(function (txGraph) { return __awaiter(void 0, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, txGraph.add([testQuad])];
                                        case 1:
                                            _a.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 2:
                        // Execute add operation within transaction
                        _b.sent();
                        _a = [[]];
                        return [4 /*yield*/, graph.quads()];
                    case 3:
                        quads = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                        (0, bun_test_1.expect)(quads.length).toBe(1);
                        (0, bun_test_1.expect)(quads[0].object.value).toBe('test value');
                        // Clean up
                        return [4 /*yield*/, graph.deleteAll()];
                    case 4:
                        // Clean up
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should rollback transaction on error', function () { return __awaiter(void 0, void 0, void 0, function () {
            var graph, testQuad, err_4, quads, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, createTestGraph()];
                    case 1:
                        graph = _b.sent();
                        testQuad = rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/test'), rdf_js_1.factory.namedNode('http://example.org/property'), rdf_js_1.factory.literal('test value'));
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, graph.inTransaction(function (txGraph) { return __awaiter(void 0, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, txGraph.add([testQuad])];
                                        case 1:
                                            _a.sent();
                                            // Force an error to trigger rollback
                                            throw new Error('Test error to trigger rollback');
                                    }
                                });
                            }); })];
                    case 3:
                        _b.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        err_4 = _b.sent();
                        (0, bun_test_1.expect)(err_4.message).toBe('Test error to trigger rollback');
                        return [3 /*break*/, 5];
                    case 5:
                        _a = [[]];
                        return [4 /*yield*/, graph.quads()];
                    case 6:
                        quads = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                        (0, bun_test_1.expect)(quads.length).toBe(0);
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should handle multiple operations within single transaction', function () { return __awaiter(void 0, void 0, void 0, function () {
            var graph, quad1, quad2, quad3, quads, _a, values;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, createTestGraph()];
                    case 1:
                        graph = _b.sent();
                        quad1 = rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/item1'), rdf_js_1.factory.namedNode('http://example.org/property'), rdf_js_1.factory.literal('value 1'));
                        quad2 = rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/item2'), rdf_js_1.factory.namedNode('http://example.org/property'), rdf_js_1.factory.literal('value 2'));
                        quad3 = rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/item3'), rdf_js_1.factory.namedNode('http://example.org/property'), rdf_js_1.factory.literal('value 3'));
                        // Execute multiple operations within single transaction
                        return [4 /*yield*/, graph.inTransaction(function (txGraph) { return __awaiter(void 0, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, txGraph.add([quad1, quad2])];
                                        case 1:
                                            _a.sent();
                                            return [4 /*yield*/, txGraph.add([quad3])];
                                        case 2:
                                            _a.sent();
                                            return [4 /*yield*/, txGraph.remove([quad2])];
                                        case 3:
                                            _a.sent(); // Remove one quad
                                            return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 2:
                        // Execute multiple operations within single transaction
                        _b.sent();
                        _a = [[]];
                        return [4 /*yield*/, graph.quads()];
                    case 3:
                        quads = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                        (0, bun_test_1.expect)(quads.length).toBe(2);
                        values = quads.map(function (q) { return q.object.value; }).sort();
                        (0, bun_test_1.expect)(values).toEqual(['value 1', 'value 3']);
                        // Clean up
                        return [4 /*yield*/, graph.deleteAll()];
                    case 4:
                        // Clean up
                        _b.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should not allow nested transactions', function () { return __awaiter(void 0, void 0, void 0, function () {
            var graph, err_5, quads, _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, createTestGraph()];
                    case 1:
                        graph = _b.sent();
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, graph.inTransaction(function (txGraph) { return __awaiter(void 0, void 0, void 0, function () {
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: 
                                        // This should fail since we're already in a transaction
                                        return [4 /*yield*/, (0, bun_test_1.expect)(txGraph.inTransaction(function () { return __awaiter(void 0, void 0, void 0, function () { return __generator(this, function (_a) {
                                                return [2 /*return*/];
                                            }); }); })).rejects.toThrow('Transaction already in progress')];
                                        case 1:
                                            // This should fail since we're already in a transaction
                                            _a.sent();
                                            return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 3:
                        _b.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        err_5 = _b.sent();
                        return [3 /*break*/, 5];
                    case 5:
                        _a = [[]];
                        return [4 /*yield*/, graph.quads()];
                    case 6:
                        quads = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                        (0, bun_test_1.expect)(quads.length).toBe(0);
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should handle SPARQL operations within transaction', function () { return __awaiter(void 0, void 0, void 0, function () {
            var graph, testQuad;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, createTestGraph()];
                    case 1:
                        graph = _a.sent();
                        testQuad = rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/person'), rdf_js_1.factory.namedNode('http://example.org/name'), rdf_js_1.factory.literal('John Doe'));
                        return [4 /*yield*/, graph.inTransaction(function (txGraph) { return __awaiter(void 0, void 0, void 0, function () {
                                var selectQuery, result, stream, bindings;
                                return __generator(this, function (_a) {
                                    switch (_a.label) {
                                        case 0: return [4 /*yield*/, txGraph.add([testQuad])];
                                        case 1:
                                            _a.sent();
                                            selectQuery = {
                                                queryType: 'SELECT',
                                                type: 'query',
                                                prefixes: {},
                                                variables: [rdf_js_1.factory.variable('name')],
                                                from: { default: [testGraphIri], named: [] },
                                                where: [{
                                                        type: 'bgp',
                                                        triples: [{
                                                                subject: rdf_js_1.factory.namedNode('http://example.org/person'),
                                                                predicate: rdf_js_1.factory.namedNode('http://example.org/name'),
                                                                object: rdf_js_1.factory.variable('name')
                                                            }]
                                                    }]
                                            };
                                            return [4 /*yield*/, txGraph.sparql(selectQuery)];
                                        case 2:
                                            result = _a.sent();
                                            (0, bun_test_1.expect)(result.resultType).toBe('bindings');
                                            return [4 /*yield*/, result.execute()];
                                        case 3:
                                            stream = _a.sent();
                                            bindings = [];
                                            return [4 /*yield*/, new Promise(function (resolve) {
                                                    stream.on('data', function (binding) { return bindings.push(binding); });
                                                    stream.on('end', function () { return resolve(); });
                                                })];
                                        case 4:
                                            _a.sent();
                                            (0, bun_test_1.expect)(bindings.length).toBe(1);
                                            (0, bun_test_1.expect)(bindings[0].get('name').value).toBe('John Doe');
                                            return [2 /*return*/];
                                    }
                                });
                            }); })];
                    case 2:
                        _a.sent();
                        // Clean up
                        return [4 /*yield*/, graph.deleteAll()];
                    case 3:
                        // Clean up
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should handle graph-specific operations', function () { return __awaiter(void 0, void 0, void 0, function () {
            var graph1Iri, graph2Iri, graph1, graph2, _a, _b, quad1, quad2, quads1, _c, quads2, _d, _e, _f;
            return __generator(this, function (_g) {
                switch (_g.label) {
                    case 0:
                        graph1Iri = rdf_js_1.factory.namedNode('http://test.example.org/graph1');
                        graph2Iri = rdf_js_1.factory.namedNode('http://test.example.org/graph2');
                        graph1 = new stardog_js_1.StardogGraph(config, graph1Iri, false);
                        graph2 = new stardog_js_1.StardogGraph(config, graph2Iri, false);
                        _g.label = 1;
                    case 1:
                        _g.trys.push([1, , 13, 20]);
                        _g.label = 2;
                    case 2:
                        _g.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, graph1.deleteAll()];
                    case 3:
                        _g.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        _a = _g.sent();
                        return [3 /*break*/, 5];
                    case 5:
                        _g.trys.push([5, 7, , 8]);
                        return [4 /*yield*/, graph2.deleteAll()];
                    case 6:
                        _g.sent();
                        return [3 /*break*/, 8];
                    case 7:
                        _b = _g.sent();
                        return [3 /*break*/, 8];
                    case 8:
                        quad1 = rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/item1'), rdf_js_1.factory.namedNode('http://example.org/property'), rdf_js_1.factory.literal('value 1'));
                        quad2 = rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/item2'), rdf_js_1.factory.namedNode('http://example.org/property'), rdf_js_1.factory.literal('value 2'));
                        // Add data to each graph
                        return [4 /*yield*/, graph1.add([quad1])];
                    case 9:
                        // Add data to each graph
                        _g.sent();
                        return [4 /*yield*/, graph2.add([quad2])];
                    case 10:
                        _g.sent();
                        _c = [[]];
                        return [4 /*yield*/, graph1.quads()];
                    case 11:
                        quads1 = __spreadArray.apply(void 0, _c.concat([_g.sent(), true]));
                        _d = [[]];
                        return [4 /*yield*/, graph2.quads()];
                    case 12:
                        quads2 = __spreadArray.apply(void 0, _d.concat([_g.sent(), true]));
                        (0, bun_test_1.expect)(quads1.length).toBe(1);
                        (0, bun_test_1.expect)(quads2.length).toBe(1);
                        (0, bun_test_1.expect)(quads1[0].object.value).toBe('value 1');
                        (0, bun_test_1.expect)(quads2[0].object.value).toBe('value 2');
                        return [3 /*break*/, 20];
                    case 13:
                        _g.trys.push([13, 15, , 16]);
                        return [4 /*yield*/, graph1.deleteAll()];
                    case 14:
                        _g.sent();
                        return [3 /*break*/, 16];
                    case 15:
                        _e = _g.sent();
                        return [3 /*break*/, 16];
                    case 16:
                        _g.trys.push([16, 18, , 19]);
                        return [4 /*yield*/, graph2.deleteAll()];
                    case 17:
                        _g.sent();
                        return [3 /*break*/, 19];
                    case 18:
                        _f = _g.sent();
                        return [3 /*break*/, 19];
                    case 19: return [7 /*endfinally*/];
                    case 20: return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should support reasoning in SPARQL queries outside transaction', function () { return __awaiter(void 0, void 0, void 0, function () {
            var graph, schemaGraphIri, schemaGraph, schemaTriples, instanceTriples, sparql, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, clearDatabase()];
                    case 1:
                        _a.sent();
                        graph = new stardog_js_1.StardogGraph(config, testGraphIri, true);
                        schemaGraphIri = rdf_js_1.factory.namedNode('tag:stardog:api:context:schema');
                        schemaGraph = new stardog_js_1.StardogGraph(config, schemaGraphIri, true);
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, , 6, 8]);
                        schemaTriples = [
                            rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/Employee'), rdf_js_1.factory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'), rdf_js_1.factory.namedNode('http://xmlns.com/foaf/0.1/Person'))
                        ];
                        return [4 /*yield*/, schemaGraph.add(schemaTriples)];
                    case 3:
                        _a.sent();
                        instanceTriples = [
                            rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/John'), rdf_js_1.factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), rdf_js_1.factory.namedNode('http://example.org/Employee'))
                        ];
                        return [4 /*yield*/, graph.add(instanceTriples)];
                    case 4:
                        _a.sent();
                        sparql = "\n          PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n          ASK WHERE {\n            <http://example.org/John> a foaf:Person .\n          }\n        ";
                        return [4 /*yield*/, graph.ask(sparql)];
                    case 5:
                        result = _a.sent();
                        (0, bun_test_1.expect)(result).toBe(true);
                        return [3 /*break*/, 8];
                    case 6: return [4 /*yield*/, clearDatabase()];
                    case 7:
                        _a.sent();
                        return [7 /*endfinally*/];
                    case 8: return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should support reasoning in SPARQL queries inside transaction', function () { return __awaiter(void 0, void 0, void 0, function () {
            var graph, schemaGraphIri, schemaGraph, _a, schemaTriples, instanceTriples, sparql, result, resultAfterCommit, error_2, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, clearDatabase()];
                    case 1:
                        _c.sent();
                        graph = new stardog_js_1.StardogGraph(config, testGraphIri, true);
                        schemaGraphIri = rdf_js_1.factory.namedNode('tag:stardog:api:context:schema');
                        schemaGraph = new stardog_js_1.StardogGraph(config, schemaGraphIri, true);
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 13, 18, 20]);
                        _c.label = 3;
                    case 3:
                        _c.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, schemaGraph.deleteAll()];
                    case 4:
                        _c.sent();
                        return [3 /*break*/, 6];
                    case 5:
                        _a = _c.sent();
                        return [3 /*break*/, 6];
                    case 6:
                        schemaTriples = [
                            rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/Manager'), rdf_js_1.factory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'), rdf_js_1.factory.namedNode('http://xmlns.com/foaf/0.1/Person'))
                        ];
                        return [4 /*yield*/, schemaGraph.add(schemaTriples)];
                    case 7:
                        _c.sent();
                        // Now start transaction for instance data
                        return [4 /*yield*/, graph.begin()];
                    case 8:
                        // Now start transaction for instance data
                        _c.sent();
                        instanceTriples = [
                            rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/Jane'), rdf_js_1.factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), rdf_js_1.factory.namedNode('http://example.org/Manager'))
                        ];
                        return [4 /*yield*/, graph.add(instanceTriples)];
                    case 9:
                        _c.sent();
                        sparql = "\n          PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n          ASK WHERE {\n            <http://example.org/Jane> a foaf:Person .\n          }\n        ";
                        return [4 /*yield*/, graph.ask(sparql)];
                    case 10:
                        result = _c.sent();
                        (0, bun_test_1.expect)(result).toBe(true);
                        return [4 /*yield*/, graph.commit()];
                    case 11:
                        _c.sent();
                        return [4 /*yield*/, graph.ask(sparql)];
                    case 12:
                        resultAfterCommit = _c.sent();
                        console.log("Reasoning ".concat(reasoning ? 'enabled' : 'disabled', ": Query result after commit = ").concat(resultAfterCommit));
                        (0, bun_test_1.expect)(resultAfterCommit).toBe(true);
                        return [3 /*break*/, 20];
                    case 13:
                        error_2 = _c.sent();
                        _c.label = 14;
                    case 14:
                        _c.trys.push([14, 16, , 17]);
                        return [4 /*yield*/, graph.rollback()];
                    case 15:
                        _c.sent();
                        return [3 /*break*/, 17];
                    case 16:
                        _b = _c.sent();
                        return [3 /*break*/, 17];
                    case 17: throw error_2;
                    case 18: return [4 /*yield*/, clearDatabase()];
                    case 19:
                        _c.sent();
                        return [7 /*endfinally*/];
                    case 20: return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should preserve explicit named graphs in quads when adding', function () { return __awaiter(void 0, void 0, void 0, function () {
            var graph1Iri, graph2Iri, namedGraphA, namedGraphB, graph, _a, quadA, quadB, sparql, result, bindings_1, stream_1, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        graph1Iri = rdf_js_1.factory.namedNode('http://test.example.org/graph1');
                        graph2Iri = rdf_js_1.factory.namedNode('http://test.example.org/graph2');
                        namedGraphA = rdf_js_1.factory.namedNode('http://example.org/namedGraphA');
                        namedGraphB = rdf_js_1.factory.namedNode('http://example.org/namedGraphB');
                        graph = new stardog_js_1.StardogGraph(config, graph1Iri, false);
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, , 10, 14]);
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 4, , 5]);
                        return [4 /*yield*/, graph.deleteAll()];
                    case 3:
                        _c.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        _a = _c.sent();
                        return [3 /*break*/, 5];
                    case 5:
                        quadA = rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/itemA'), rdf_js_1.factory.namedNode('http://example.org/property'), rdf_js_1.factory.literal('value A'), namedGraphA);
                        quadB = rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/itemB'), rdf_js_1.factory.namedNode('http://example.org/property'), rdf_js_1.factory.literal('value B'), namedGraphB);
                        // Add quads with their explicit named graphs
                        return [4 /*yield*/, graph.add([quadA, quadB])];
                    case 6:
                        // Add quads with their explicit named graphs
                        _c.sent();
                        sparql = "\n          SELECT ?s ?p ?o WHERE {\n            GRAPH <".concat(namedGraphA, "> {\n              ?s ?p ?o\n            }\n          }\n        ");
                        return [4 /*yield*/, graph.sparql({
                                queryType: 'SELECT',
                                type: 'query',
                                prefixes: {},
                                variables: [
                                    rdf_js_1.factory.variable('s'),
                                    rdf_js_1.factory.variable('p'),
                                    rdf_js_1.factory.variable('o')
                                ],
                                where: [{
                                        type: 'graph',
                                        name: namedGraphA,
                                        patterns: [{
                                                type: 'bgp',
                                                triples: [{
                                                        subject: rdf_js_1.factory.variable('s'),
                                                        predicate: rdf_js_1.factory.variable('p'),
                                                        object: rdf_js_1.factory.variable('o')
                                                    }]
                                            }]
                                    }]
                            })];
                    case 7:
                        result = _c.sent();
                        bindings_1 = [];
                        return [4 /*yield*/, result.execute()];
                    case 8:
                        stream_1 = _c.sent();
                        return [4 /*yield*/, new Promise(function (resolve) {
                                stream_1.on('data', function (binding) { return bindings_1.push(binding); });
                                stream_1.on('end', function () { return resolve(); });
                            })];
                    case 9:
                        _c.sent();
                        // Should find the quad that was explicitly added to namedGraphA
                        (0, bun_test_1.expect)(bindings_1.length).toBe(1);
                        (0, bun_test_1.expect)(bindings_1[0].get('o').value).toBe('value A');
                        return [3 /*break*/, 14];
                    case 10:
                        _c.trys.push([10, 12, , 13]);
                        return [4 /*yield*/, graph.deleteAll()];
                    case 11:
                        _c.sent();
                        return [3 /*break*/, 13];
                    case 12:
                        _b = _c.sent();
                        return [3 /*break*/, 13];
                    case 13: return [7 /*endfinally*/];
                    case 14: return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.describe)('SPARQL UPDATE in transactions', function () {
            (0, bun_test_1.test)('should execute UPDATE within transaction', function () { return __awaiter(void 0, void 0, void 0, function () {
                var graph, testQuad, quads, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0: return [4 /*yield*/, createTestGraph()];
                        case 1:
                            graph = _b.sent();
                            testQuad = rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/item'), rdf_js_1.factory.namedNode('http://example.org/property'), rdf_js_1.factory.literal('initial value'));
                            return [4 /*yield*/, graph.add([testQuad])];
                        case 2:
                            _b.sent();
                            return [4 /*yield*/, graph.inTransaction(function (txGraph) { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, txGraph.update("\n            PREFIX ex: <http://example.org/>\n            DELETE { ex:item ex:property ?old }\n            INSERT { ex:item ex:property \"updated via SPARQL UPDATE\" }\n            WHERE { ex:item ex:property ?old }\n          ")];
                                            case 1:
                                                _a.sent();
                                                return [2 /*return*/];
                                        }
                                    });
                                }); })];
                        case 3:
                            _b.sent();
                            _a = [[]];
                            return [4 /*yield*/, graph.quads()];
                        case 4:
                            quads = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                            (0, bun_test_1.expect)(quads.length).toBe(1);
                            (0, bun_test_1.expect)(quads[0].object.value).toBe('updated via SPARQL UPDATE');
                            return [4 /*yield*/, graph.deleteAll()];
                        case 5:
                            _b.sent();
                            return [2 /*return*/];
                    }
                });
            }); });
            (0, bun_test_1.test)('should rollback UPDATE on transaction failure', function () { return __awaiter(void 0, void 0, void 0, function () {
                var graph, testQuad, err_6, quads, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0: return [4 /*yield*/, createTestGraph()];
                        case 1:
                            graph = _b.sent();
                            testQuad = rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/item'), rdf_js_1.factory.namedNode('http://example.org/property'), rdf_js_1.factory.literal('original value'));
                            return [4 /*yield*/, graph.add([testQuad])];
                        case 2:
                            _b.sent();
                            _b.label = 3;
                        case 3:
                            _b.trys.push([3, 5, , 6]);
                            return [4 /*yield*/, graph.inTransaction(function (txGraph) { return __awaiter(void 0, void 0, void 0, function () {
                                    return __generator(this, function (_a) {
                                        switch (_a.label) {
                                            case 0: return [4 /*yield*/, txGraph.update("\n              PREFIX ex: <http://example.org/>\n              INSERT DATA { ex:item ex:property \"should be rolled back\" }\n            ")];
                                            case 1:
                                                _a.sent();
                                                throw new Error('Deliberate failure');
                                        }
                                    });
                                }); })];
                        case 4:
                            _b.sent();
                            return [3 /*break*/, 6];
                        case 5:
                            err_6 = _b.sent();
                            return [3 /*break*/, 6];
                        case 6:
                            _a = [[]];
                            return [4 /*yield*/, graph.quads()];
                        case 7:
                            quads = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                            (0, bun_test_1.expect)(quads.length).toBe(1);
                            (0, bun_test_1.expect)(quads[0].object.value).toBe('original value');
                            return [4 /*yield*/, graph.deleteAll()];
                        case 8:
                            _b.sent();
                            return [2 /*return*/];
                    }
                });
            }); });
            (0, bun_test_1.test)('should execute UPDATE with reasoning pragma', function () { return __awaiter(void 0, void 0, void 0, function () {
                var graph, schemaGraphIri, schemaGraph, quads, _a, verifiedQuad;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0: return [4 /*yield*/, clearDatabase()];
                        case 1:
                            _b.sent();
                            graph = new stardog_js_1.StardogGraph(config, testGraphIri, true);
                            schemaGraphIri = rdf_js_1.factory.namedNode('tag:stardog:api:context:schema');
                            schemaGraph = new stardog_js_1.StardogGraph(config, schemaGraphIri, true);
                            _b.label = 2;
                        case 2:
                            _b.trys.push([2, , 7, 9]);
                            // Add schema
                            return [4 /*yield*/, schemaGraph.add([
                                    rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/Employee'), rdf_js_1.factory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'), rdf_js_1.factory.namedNode('http://xmlns.com/foaf/0.1/Person'))
                                ])];
                        case 3:
                            // Add schema
                            _b.sent();
                            // Add instance
                            return [4 /*yield*/, graph.add([
                                    rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/John'), rdf_js_1.factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), rdf_js_1.factory.namedNode('http://example.org/Employee'))
                                ])];
                        case 4:
                            // Add instance
                            _b.sent();
                            // UPDATE using inferred type (with reasoning)
                            return [4 /*yield*/, graph.update("\n            PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n            PREFIX ex: <http://example.org/>\n            INSERT { ?person ex:verified true }\n            WHERE { ?person a foaf:Person }\n          ")];
                        case 5:
                            // UPDATE using inferred type (with reasoning)
                            _b.sent();
                            _a = [[]];
                            return [4 /*yield*/, graph.quads()];
                        case 6:
                            quads = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                            verifiedQuad = quads.find(function (q) {
                                return q.predicate.value === 'http://example.org/verified';
                            });
                            (0, bun_test_1.expect)(verifiedQuad).toBeDefined();
                            return [3 /*break*/, 9];
                        case 7: return [4 /*yield*/, clearDatabase()];
                        case 8:
                            _b.sent();
                            return [7 /*endfinally*/];
                        case 9: return [2 /*return*/];
                    }
                });
            }); });
        });
        (0, bun_test_1.describe)('Per-Query Reasoning Override (Pragma Directives)', function () {
            /**
             * Test reasoning override: disable reasoning within a reasoning transaction
             * Uses pragma directive to override transaction-level reasoning setting
             */
            (0, bun_test_1.test)('should override reasoning OFF in reasoning transaction via pragma', function () { return __awaiter(void 0, void 0, void 0, function () {
                var graph, schemaGraphIri, schemaGraph, schemaTriples, instanceTriples, askQuery, resultWithReasoning, resultWithoutReasoning, error_3, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0: return [4 /*yield*/, clearDatabase()];
                        case 1:
                            _b.sent();
                            graph = new stardog_js_1.StardogGraph(config, testGraphIri, true);
                            schemaGraphIri = rdf_js_1.factory.namedNode('tag:stardog:api:context:schema');
                            schemaGraph = new stardog_js_1.StardogGraph(config, schemaGraphIri, true);
                            _b.label = 2;
                        case 2:
                            _b.trys.push([2, 9, 14, 16]);
                            schemaTriples = [
                                rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/Employee'), rdf_js_1.factory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'), rdf_js_1.factory.namedNode('http://xmlns.com/foaf/0.1/Person'))
                            ];
                            return [4 /*yield*/, schemaGraph.add(schemaTriples)];
                        case 3:
                            _b.sent();
                            // Start reasoning transaction
                            return [4 /*yield*/, graph.begin()];
                        case 4:
                            // Start reasoning transaction
                            _b.sent();
                            instanceTriples = [
                                rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/John'), rdf_js_1.factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), rdf_js_1.factory.namedNode('http://example.org/Employee'))
                            ];
                            return [4 /*yield*/, graph.add(instanceTriples)];
                        case 5:
                            _b.sent();
                            askQuery = "\n            PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n            ASK WHERE {\n              <http://example.org/John> a foaf:Person .\n            }\n          ";
                            return [4 /*yield*/, graph.ask(askQuery)];
                        case 6:
                            resultWithReasoning = _b.sent();
                            (0, bun_test_1.expect)(resultWithReasoning).toBe(true);
                            return [4 /*yield*/, graph.ask(askQuery, { reasoning: false })];
                        case 7:
                            resultWithoutReasoning = _b.sent();
                            (0, bun_test_1.expect)(resultWithoutReasoning).toBe(false);
                            return [4 /*yield*/, graph.commit()];
                        case 8:
                            _b.sent();
                            return [3 /*break*/, 16];
                        case 9:
                            error_3 = _b.sent();
                            _b.label = 10;
                        case 10:
                            _b.trys.push([10, 12, , 13]);
                            return [4 /*yield*/, graph.rollback()];
                        case 11:
                            _b.sent();
                            return [3 /*break*/, 13];
                        case 12:
                            _a = _b.sent();
                            return [3 /*break*/, 13];
                        case 13: throw error_3;
                        case 14: return [4 /*yield*/, clearDatabase()];
                        case 15:
                            _b.sent();
                            return [7 /*endfinally*/];
                        case 16: return [2 /*return*/];
                    }
                });
            }); });
            /**
             * Test reasoning override: verify pragmas don't enable reasoning in non-reasoning transactions
             * This documents a Stardog limitation: pragmas can disable reasoning in reasoning transactions,
             * but cannot enable reasoning in non-reasoning transactions (transaction-level setting is immutable that way)
             */
            (0, bun_test_1.test)('should NOT override reasoning ON in non-reasoning transaction (Stardog limitation)', function () { return __awaiter(void 0, void 0, void 0, function () {
                var graph, schemaGraphIri, schemaGraph, schemaTriples, instanceTriples, askQuery, resultWithoutReasoning, resultWithReasoningAttempt, error_4, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0: return [4 /*yield*/, clearDatabase()];
                        case 1:
                            _b.sent();
                            graph = new stardog_js_1.StardogGraph(config, testGraphIri, false);
                            schemaGraphIri = rdf_js_1.factory.namedNode('tag:stardog:api:context:schema');
                            schemaGraph = new stardog_js_1.StardogGraph(config, schemaGraphIri, true);
                            _b.label = 2;
                        case 2:
                            _b.trys.push([2, 9, 14, 16]);
                            schemaTriples = [
                                rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/Manager'), rdf_js_1.factory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'), rdf_js_1.factory.namedNode('http://xmlns.com/foaf/0.1/Person'))
                            ];
                            return [4 /*yield*/, schemaGraph.add(schemaTriples)];
                        case 3:
                            _b.sent();
                            // Start non-reasoning transaction
                            return [4 /*yield*/, graph.begin()];
                        case 4:
                            // Start non-reasoning transaction
                            _b.sent();
                            instanceTriples = [
                                rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/Jane'), rdf_js_1.factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), rdf_js_1.factory.namedNode('http://example.org/Manager'))
                            ];
                            return [4 /*yield*/, graph.add(instanceTriples)];
                        case 5:
                            _b.sent();
                            askQuery = "\n            PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n            ASK WHERE {\n              <http://example.org/Jane> a foaf:Person .\n            }\n          ";
                            return [4 /*yield*/, graph.ask(askQuery)];
                        case 6:
                            resultWithoutReasoning = _b.sent();
                            (0, bun_test_1.expect)(resultWithoutReasoning).toBe(false);
                            return [4 /*yield*/, graph.ask(askQuery, { reasoning: true })];
                        case 7:
                            resultWithReasoningAttempt = _b.sent();
                            (0, bun_test_1.expect)(resultWithReasoningAttempt).toBe(false);
                            return [4 /*yield*/, graph.commit()];
                        case 8:
                            _b.sent();
                            return [3 /*break*/, 16];
                        case 9:
                            error_4 = _b.sent();
                            _b.label = 10;
                        case 10:
                            _b.trys.push([10, 12, , 13]);
                            return [4 /*yield*/, graph.rollback()];
                        case 11:
                            _b.sent();
                            return [3 /*break*/, 13];
                        case 12:
                            _a = _b.sent();
                            return [3 /*break*/, 13];
                        case 13: throw error_4;
                        case 14: return [4 /*yield*/, clearDatabase()];
                        case 15:
                            _b.sent();
                            return [7 /*endfinally*/];
                        case 16: return [2 /*return*/];
                    }
                });
            }); });
            /**
             * Test SELECT queries with reasoning override (disable in reasoning transaction)
             */
            (0, bun_test_1.test)('should override reasoning OFF for SELECT queries in reasoning transaction', function () { return __awaiter(void 0, void 0, void 0, function () {
                var graph, schemaGraphIri, schemaGraph, selectQuery, withReasoning, withoutReasoning, error_5, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0: return [4 /*yield*/, clearDatabase()];
                        case 1:
                            _b.sent();
                            graph = new stardog_js_1.StardogGraph(config, testGraphIri, true);
                            schemaGraphIri = rdf_js_1.factory.namedNode('tag:stardog:api:context:schema');
                            schemaGraph = new stardog_js_1.StardogGraph(config, schemaGraphIri, true);
                            _b.label = 2;
                        case 2:
                            _b.trys.push([2, 9, 14, 16]);
                            // Add schema: Developer subClassOf Employee
                            return [4 /*yield*/, schemaGraph.add([
                                    rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/Developer'), rdf_js_1.factory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'), rdf_js_1.factory.namedNode('http://example.org/Employee'))
                                ])];
                        case 3:
                            // Add schema: Developer subClassOf Employee
                            _b.sent();
                            return [4 /*yield*/, graph.begin()];
                        case 4:
                            _b.sent();
                            // Add instance: Alice is a Developer
                            return [4 /*yield*/, graph.add([
                                    rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/Alice'), rdf_js_1.factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), rdf_js_1.factory.namedNode('http://example.org/Developer'))
                                ])];
                        case 5:
                            // Add instance: Alice is a Developer
                            _b.sent();
                            selectQuery = "\n            PREFIX ex: <http://example.org/>\n            SELECT ?person WHERE {\n              ?person a ex:Employee .\n            }\n          ";
                            return [4 /*yield*/, graph.select(selectQuery)];
                        case 6:
                            withReasoning = _b.sent();
                            (0, bun_test_1.expect)(__spreadArray([], withReasoning, true).length).toBe(1);
                            return [4 /*yield*/, graph.select(selectQuery, { reasoning: false })];
                        case 7:
                            withoutReasoning = _b.sent();
                            (0, bun_test_1.expect)(__spreadArray([], withoutReasoning, true).length).toBe(0);
                            return [4 /*yield*/, graph.commit()];
                        case 8:
                            _b.sent();
                            return [3 /*break*/, 16];
                        case 9:
                            error_5 = _b.sent();
                            _b.label = 10;
                        case 10:
                            _b.trys.push([10, 12, , 13]);
                            return [4 /*yield*/, graph.rollback()];
                        case 11:
                            _b.sent();
                            return [3 /*break*/, 13];
                        case 12:
                            _a = _b.sent();
                            return [3 /*break*/, 13];
                        case 13: throw error_5;
                        case 14: return [4 /*yield*/, clearDatabase()];
                        case 15:
                            _b.sent();
                            return [7 /*endfinally*/];
                        case 16: return [2 /*return*/];
                    }
                });
            }); });
            /**
             * Test CONSTRUCT queries with reasoning override (disable in reasoning transaction)
             */
            (0, bun_test_1.test)('should override reasoning OFF for CONSTRUCT queries in reasoning transaction', function () { return __awaiter(void 0, void 0, void 0, function () {
                var graph, schemaGraphIri, schemaGraph, constructQuery, resultWithReasoning, quadsWithReasoning, _a, resultWithoutReasoning, quadsWithoutReasoning, _b, error_6, _c;
                return __generator(this, function (_d) {
                    switch (_d.label) {
                        case 0: return [4 /*yield*/, clearDatabase()];
                        case 1:
                            _d.sent();
                            graph = new stardog_js_1.StardogGraph(config, testGraphIri, true);
                            schemaGraphIri = rdf_js_1.factory.namedNode('tag:stardog:api:context:schema');
                            schemaGraph = new stardog_js_1.StardogGraph(config, schemaGraphIri, true);
                            _d.label = 2;
                        case 2:
                            _d.trys.push([2, 11, 16, 18]);
                            // Add schema: Consultant subClassOf Contractor
                            return [4 /*yield*/, schemaGraph.add([
                                    rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/Consultant'), rdf_js_1.factory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'), rdf_js_1.factory.namedNode('http://example.org/Contractor'))
                                ])];
                        case 3:
                            // Add schema: Consultant subClassOf Contractor
                            _d.sent();
                            return [4 /*yield*/, graph.begin()];
                        case 4:
                            _d.sent();
                            // Add instance: Bob is a Consultant
                            return [4 /*yield*/, graph.add([
                                    rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/Bob'), rdf_js_1.factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), rdf_js_1.factory.namedNode('http://example.org/Consultant'))
                                ])];
                        case 5:
                            // Add instance: Bob is a Consultant
                            _d.sent();
                            constructQuery = "\n            PREFIX ex: <http://example.org/>\n            CONSTRUCT { ?person a ex:Contractor }\n            WHERE { ?person a ex:Contractor }\n          ";
                            return [4 /*yield*/, graph.construct(constructQuery)];
                        case 6:
                            resultWithReasoning = _d.sent();
                            _a = [[]];
                            return [4 /*yield*/, resultWithReasoning.quads()];
                        case 7:
                            quadsWithReasoning = __spreadArray.apply(void 0, _a.concat([_d.sent(), true]));
                            (0, bun_test_1.expect)(quadsWithReasoning.length).toBe(1);
                            return [4 /*yield*/, graph.construct(constructQuery, { reasoning: false })];
                        case 8:
                            resultWithoutReasoning = _d.sent();
                            _b = [[]];
                            return [4 /*yield*/, resultWithoutReasoning.quads()];
                        case 9:
                            quadsWithoutReasoning = __spreadArray.apply(void 0, _b.concat([_d.sent(), true]));
                            (0, bun_test_1.expect)(quadsWithoutReasoning.length).toBe(0);
                            return [4 /*yield*/, graph.commit()];
                        case 10:
                            _d.sent();
                            return [3 /*break*/, 18];
                        case 11:
                            error_6 = _d.sent();
                            _d.label = 12;
                        case 12:
                            _d.trys.push([12, 14, , 15]);
                            return [4 /*yield*/, graph.rollback()];
                        case 13:
                            _d.sent();
                            return [3 /*break*/, 15];
                        case 14:
                            _c = _d.sent();
                            return [3 /*break*/, 15];
                        case 15: throw error_6;
                        case 16: return [4 /*yield*/, clearDatabase()];
                        case 17:
                            _d.sent();
                            return [7 /*endfinally*/];
                        case 18: return [2 /*return*/];
                    }
                });
            }); });
            /**
             * Test multiple queries with different reasoning settings in same transaction
             */
            (0, bun_test_1.test)('should handle multiple queries with alternating reasoning disables in same transaction', function () { return __awaiter(void 0, void 0, void 0, function () {
                var graph, schemaGraphIri, schemaGraph, query, result1, result2, result3, result4, error_7, _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0: return [4 /*yield*/, clearDatabase()];
                        case 1:
                            _b.sent();
                            graph = new stardog_js_1.StardogGraph(config, testGraphIri, true);
                            schemaGraphIri = rdf_js_1.factory.namedNode('tag:stardog:api:context:schema');
                            schemaGraph = new stardog_js_1.StardogGraph(config, schemaGraphIri, true);
                            _b.label = 2;
                        case 2:
                            _b.trys.push([2, 11, 16, 18]);
                            // Add schema: Student subClassOf Person
                            return [4 /*yield*/, schemaGraph.add([
                                    rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/Student'), rdf_js_1.factory.namedNode('http://www.w3.org/2000/01/rdf-schema#subClassOf'), rdf_js_1.factory.namedNode('http://xmlns.com/foaf/0.1/Person'))
                                ])];
                        case 3:
                            // Add schema: Student subClassOf Person
                            _b.sent();
                            return [4 /*yield*/, graph.begin()];
                        case 4:
                            _b.sent();
                            // Add instance: Charlie is a Student
                            return [4 /*yield*/, graph.add([
                                    rdf_js_1.factory.quad(rdf_js_1.factory.namedNode('http://example.org/Charlie'), rdf_js_1.factory.namedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'), rdf_js_1.factory.namedNode('http://example.org/Student'))
                                ])];
                        case 5:
                            // Add instance: Charlie is a Student
                            _b.sent();
                            query = "\n            PREFIX foaf: <http://xmlns.com/foaf/0.1/>\n            ASK WHERE {\n              <http://example.org/Charlie> a foaf:Person .\n            }\n          ";
                            return [4 /*yield*/, graph.ask(query)];
                        case 6:
                            result1 = _b.sent();
                            (0, bun_test_1.expect)(result1).toBe(true);
                            return [4 /*yield*/, graph.ask(query, { reasoning: false })];
                        case 7:
                            result2 = _b.sent();
                            (0, bun_test_1.expect)(result2).toBe(false);
                            return [4 /*yield*/, graph.ask(query, { reasoning: false })];
                        case 8:
                            result3 = _b.sent();
                            (0, bun_test_1.expect)(result3).toBe(false);
                            return [4 /*yield*/, graph.ask(query)];
                        case 9:
                            result4 = _b.sent();
                            (0, bun_test_1.expect)(result4).toBe(true);
                            return [4 /*yield*/, graph.commit()];
                        case 10:
                            _b.sent();
                            return [3 /*break*/, 18];
                        case 11:
                            error_7 = _b.sent();
                            _b.label = 12;
                        case 12:
                            _b.trys.push([12, 14, , 15]);
                            return [4 /*yield*/, graph.rollback()];
                        case 13:
                            _b.sent();
                            return [3 /*break*/, 15];
                        case 14:
                            _a = _b.sent();
                            return [3 /*break*/, 15];
                        case 15: throw error_7;
                        case 16: return [4 /*yield*/, clearDatabase()];
                        case 17:
                            _b.sent();
                            return [7 /*endfinally*/];
                        case 18: return [2 /*return*/];
                    }
                });
            }); });
        });
    });
});
