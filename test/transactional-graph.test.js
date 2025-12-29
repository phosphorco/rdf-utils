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
exports.testTransactionalGraphInterface = testTransactionalGraphInterface;
var bun_test_1 = require("bun:test");
var rdf_js_1 = require("../src/rdf.js");
var EX = (0, rdf_js_1.namespace)('http://example.org/');
var XSD = (0, rdf_js_1.namespace)('http://www.w3.org/2001/XMLSchema#');
// Test data
var testQuads = [
    rdf_js_1.factory.quad(EX.alice, EX.knows, EX.bob),
    rdf_js_1.factory.quad(EX.alice, EX.age, rdf_js_1.factory.literal('30', XSD.integer)),
    rdf_js_1.factory.quad(EX.bob, EX.name, rdf_js_1.factory.literal('Bob Smith', 'en'))
];
/**
 * Generic test suite for TransactionalGraph interface
 */
function testTransactionalGraphInterface(name, createGraph, cleanupGraph) {
    var _this = this;
    (0, bun_test_1.describe)("".concat(name, " - TransactionalGraph Interface"), function () {
        (0, bun_test_1.test)('should begin, commit, and rollback transactions', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, quads, _a, addedQuad;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, createGraph()];
                    case 1:
                        graph = _b.sent();
                        if (!cleanupGraph) return [3 /*break*/, 3];
                        return [4 /*yield*/, cleanupGraph(graph)];
                    case 2:
                        _b.sent();
                        _b.label = 3;
                    case 3: 
                    // Begin transaction
                    return [4 /*yield*/, graph.begin()];
                    case 4:
                        // Begin transaction
                        _b.sent();
                        // Add data in transaction
                        return [4 /*yield*/, graph.add([testQuads[0]])];
                    case 5:
                        // Add data in transaction
                        _b.sent();
                        // Commit transaction
                        return [4 /*yield*/, graph.commit()];
                    case 6:
                        // Commit transaction
                        _b.sent();
                        _a = [[]];
                        return [4 /*yield*/, graph.quads()];
                    case 7:
                        quads = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                        addedQuad = quads.find(function (quad) {
                            return quad.subject.value === testQuads[0].subject.value &&
                                quad.predicate.value === testQuads[0].predicate.value &&
                                quad.object.value === testQuads[0].object.value;
                        });
                        (0, bun_test_1.expect)(addedQuad).toBeDefined();
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should rollback transactions properly', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, testQuad, quads, _a, rolledBackQuad;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, createGraph()];
                    case 1:
                        graph = _b.sent();
                        if (!cleanupGraph) return [3 /*break*/, 3];
                        return [4 /*yield*/, cleanupGraph(graph)];
                    case 2:
                        _b.sent();
                        _b.label = 3;
                    case 3: 
                    // Begin transaction
                    return [4 /*yield*/, graph.begin()];
                    case 4:
                        // Begin transaction
                        _b.sent();
                        testQuad = rdf_js_1.factory.quad(EX['rollback-test'], EX.property, rdf_js_1.factory.literal('rollback value'));
                        return [4 /*yield*/, graph.add([testQuad])];
                    case 5:
                        _b.sent();
                        // Rollback transaction
                        return [4 /*yield*/, graph.rollback()];
                    case 6:
                        // Rollback transaction
                        _b.sent();
                        _a = [[]];
                        return [4 /*yield*/, graph.quads()];
                    case 7:
                        quads = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                        rolledBackQuad = quads.find(function (quad) {
                            return quad.subject.equals(EX['rollback-test']) &&
                                quad.predicate.equals(EX.property) &&
                                quad.object.value === 'rollback value';
                        });
                        (0, bun_test_1.expect)(rolledBackQuad).toBeUndefined();
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should handle transaction state properly', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, createGraph()];
                    case 1:
                        graph = _a.sent();
                        if (!cleanupGraph) return [3 /*break*/, 3];
                        return [4 /*yield*/, cleanupGraph(graph)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3: 
                    // Should throw if trying to commit without begin
                    return [4 /*yield*/, (0, bun_test_1.expect)(graph.commit()).rejects.toThrow()];
                    case 4:
                        // Should throw if trying to commit without begin
                        _a.sent();
                        // Should throw if trying to rollback without begin
                        return [4 /*yield*/, (0, bun_test_1.expect)(graph.rollback()).rejects.toThrow()];
                    case 5:
                        // Should throw if trying to rollback without begin
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should see changes within transaction scope', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, testQuad, quadsInTx, _a, ourQuad, quadsAfterRollback, _b, quadAfterRollback;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, createGraph()];
                    case 1:
                        graph = _c.sent();
                        if (!cleanupGraph) return [3 /*break*/, 3];
                        return [4 /*yield*/, cleanupGraph(graph)];
                    case 2:
                        _c.sent();
                        _c.label = 3;
                    case 3: 
                    // Begin transaction
                    return [4 /*yield*/, graph.begin()];
                    case 4:
                        // Begin transaction
                        _c.sent();
                        testQuad = rdf_js_1.factory.quad(EX.test, EX.property, rdf_js_1.factory.literal('test value'));
                        return [4 /*yield*/, graph.add([testQuad])];
                    case 5:
                        _c.sent();
                        _a = [[]];
                        return [4 /*yield*/, graph.quads()];
                    case 6:
                        quadsInTx = __spreadArray.apply(void 0, _a.concat([_c.sent(), true]));
                        ourQuad = quadsInTx.find(function (quad) {
                            return quad.subject.equals(EX.test) &&
                                quad.predicate.equals(EX.property) &&
                                quad.object.value === 'test value';
                        });
                        (0, bun_test_1.expect)(ourQuad).toBeDefined();
                        (0, bun_test_1.expect)(ourQuad === null || ourQuad === void 0 ? void 0 : ourQuad.subject.value).toBe(EX.test.value);
                        (0, bun_test_1.expect)(ourQuad === null || ourQuad === void 0 ? void 0 : ourQuad.predicate.value).toBe(EX.property.value);
                        (0, bun_test_1.expect)(ourQuad === null || ourQuad === void 0 ? void 0 : ourQuad.object.value).toBe('test value');
                        // Rollback transaction
                        return [4 /*yield*/, graph.rollback()];
                    case 7:
                        // Rollback transaction
                        _c.sent();
                        _b = [[]];
                        return [4 /*yield*/, graph.quads()];
                    case 8:
                        quadsAfterRollback = __spreadArray.apply(void 0, _b.concat([_c.sent(), true]));
                        quadAfterRollback = quadsAfterRollback.find(function (quad) {
                            return quad.subject.equals(EX.test) &&
                                quad.predicate.equals(EX.property) &&
                                quad.object.value === 'test value';
                        });
                        (0, bun_test_1.expect)(quadAfterRollback).toBeUndefined();
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should commit transactions properly', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, testQuad, quads, _a, committedQuad;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, createGraph()];
                    case 1:
                        graph = _b.sent();
                        if (!cleanupGraph) return [3 /*break*/, 3];
                        return [4 /*yield*/, cleanupGraph(graph)];
                    case 2:
                        _b.sent();
                        _b.label = 3;
                    case 3: return [4 /*yield*/, graph.begin()];
                    case 4:
                        _b.sent();
                        testQuad = rdf_js_1.factory.quad(EX.committed, EX.property, rdf_js_1.factory.literal('committed value'));
                        return [4 /*yield*/, graph.add([testQuad])];
                    case 5:
                        _b.sent();
                        return [4 /*yield*/, graph.commit()];
                    case 6:
                        _b.sent();
                        _a = [[]];
                        return [4 /*yield*/, graph.quads()];
                    case 7:
                        quads = __spreadArray.apply(void 0, _a.concat([_b.sent(), true]));
                        committedQuad = quads.find(function (quad) {
                            return quad.subject.equals(EX.committed) &&
                                quad.predicate.equals(EX.property) &&
                                quad.object.value === 'committed value';
                        });
                        (0, bun_test_1.expect)(committedQuad).toBeDefined();
                        (0, bun_test_1.expect)(committedQuad === null || committedQuad === void 0 ? void 0 : committedQuad.object.value).toBe('committed value');
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should handle operations without explicit transactions', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, testQuadsForAuto, quads, _a, auto1, auto2, quadsAfterRemove, _b, removedQuad, remainingQuad;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, createGraph()];
                    case 1:
                        graph = _c.sent();
                        if (!cleanupGraph) return [3 /*break*/, 3];
                        return [4 /*yield*/, cleanupGraph(graph)];
                    case 2:
                        _c.sent();
                        _c.label = 3;
                    case 3:
                        testQuadsForAuto = [
                            rdf_js_1.factory.quad(EX.auto1, EX.property, rdf_js_1.factory.literal('auto value 1')),
                            rdf_js_1.factory.quad(EX.auto2, EX.property, rdf_js_1.factory.literal('auto value 2'))
                        ];
                        // Operations should auto-create and commit transactions
                        return [4 /*yield*/, graph.add(testQuadsForAuto)];
                    case 4:
                        // Operations should auto-create and commit transactions
                        _c.sent();
                        _a = [[]];
                        return [4 /*yield*/, graph.quads()];
                    case 5:
                        quads = __spreadArray.apply(void 0, _a.concat([_c.sent(), true]));
                        auto1 = quads.find(function (quad) { return quad.object.value === 'auto value 1'; });
                        auto2 = quads.find(function (quad) { return quad.object.value === 'auto value 2'; });
                        (0, bun_test_1.expect)(auto1).toBeDefined();
                        (0, bun_test_1.expect)(auto2).toBeDefined();
                        // Remove one quad
                        return [4 /*yield*/, graph.remove([testQuadsForAuto[0]])];
                    case 6:
                        // Remove one quad
                        _c.sent();
                        _b = [[]];
                        return [4 /*yield*/, graph.quads()];
                    case 7:
                        quadsAfterRemove = __spreadArray.apply(void 0, _b.concat([_c.sent(), true]));
                        removedQuad = quadsAfterRemove.find(function (quad) { return quad.object.value === 'auto value 1'; });
                        remainingQuad = quadsAfterRemove.find(function (quad) { return quad.object.value === 'auto value 2'; });
                        (0, bun_test_1.expect)(removedQuad).toBeUndefined();
                        (0, bun_test_1.expect)(remainingQuad).toBeDefined();
                        return [2 /*return*/];
                }
            });
        }); });
        (0, bun_test_1.test)('should DELETE data that was ADDed in the same transaction', function () { return __awaiter(_this, void 0, void 0, function () {
            var graph, graphNode, node, quad, afterAdd, afterAddResults, afterDelete, afterDeleteResults, afterCommit, afterCommitResults, e_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, createGraph()];
                    case 1:
                        graph = _a.sent();
                        if (!cleanupGraph) return [3 /*break*/, 3];
                        return [4 /*yield*/, cleanupGraph(graph)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, , 11, 15]);
                        return [4 /*yield*/, graph.begin()];
                    case 4:
                        _a.sent();
                        console.log("graph IRI:" + graph.iri.value);
                        graphNode = graph.iri;
                        node = EX.exampleNode;
                        quad = rdf_js_1.factory.quad(node, EX.definition, rdf_js_1.factory.literal('test definition sparql'), graphNode // Explicit graph component - this is key!
                        );
                        return [4 /*yield*/, graph.add([quad])];
                    case 5:
                        _a.sent();
                        return [4 /*yield*/, graph.select("SELECT ?def WHERE { <".concat(node.value, "> <").concat(EX.definition.value, "> ?def }"))];
                    case 6:
                        afterAdd = _a.sent();
                        afterAddResults = __spreadArray([], afterAdd, true);
                        (0, bun_test_1.expect)(afterAddResults.length).toBe(1);
                        // DELETE the same quad within the same transaction
                        return [4 /*yield*/, graph.remove([quad])];
                    case 7:
                        // DELETE the same quad within the same transaction
                        _a.sent();
                        return [4 /*yield*/, graph.select("SELECT ?def WHERE { <".concat(node.value, "> <").concat(EX.definition.value, "> ?def }"))];
                    case 8:
                        afterDelete = _a.sent();
                        afterDeleteResults = __spreadArray([], afterDelete, true);
                        (0, bun_test_1.expect)(afterDeleteResults.length).toBe(0);
                        return [4 /*yield*/, graph.commit()];
                    case 9:
                        _a.sent();
                        return [4 /*yield*/, graph.select("SELECT ?def WHERE { <".concat(node.value, "> <").concat(EX.definition.value, "> ?def }"))];
                    case 10:
                        afterCommit = _a.sent();
                        afterCommitResults = __spreadArray([], afterCommit, true);
                        (0, bun_test_1.expect)(afterCommitResults.length).toBe(0);
                        return [3 /*break*/, 15];
                    case 11:
                        _a.trys.push([11, 13, , 14]);
                        return [4 /*yield*/, graph.rollback()];
                    case 12:
                        _a.sent();
                        return [3 /*break*/, 14];
                    case 13:
                        e_1 = _a.sent();
                        return [3 /*break*/, 14];
                    case 14: return [7 /*endfinally*/];
                    case 15: return [2 /*return*/];
                }
            });
        }); });
    });
}
