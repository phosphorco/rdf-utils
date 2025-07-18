# AGENT.md

This file provides guidance for AI coding agents when working with this repository.

## Development Commands

**Build**: `bun run build` - Builds TypeScript source to `dist/` with declarations
**Test**: `bun test` - Run unit tests only | `bun run test:watch` - Watch mode
**Integration Tests**: `bun run test:integration` - Run integration tests (requires Stardog)
**All Tests**: `bun run test:all` - Run both unit and integration tests
**Single Test**: `bun test test/filename.test.ts` - Run specific test file
**Dev**: `bun run dev` - Watch mode development
**Clean**: `bun run clean` - Clean build artifacts

## Architecture

TypeScript library package for resource management using Bun runtime:
- **Entry point**: `src/index.ts` - Main module exports
- **Source**: Flat structure in `src/` directory
- **Tests**: `test/` directory using Bun's built-in test runner
  - Unit tests: `test/*.test.ts`
  - Integration tests: `test/integration/` (requires external services)
- **Build**: Outputs to `dist/` with declarations and source maps
- **Target**: Node.js with ES2022 features, ESNext modules

## Code Style

- **TypeScript**: Strict mode enabled, ES2022 target
- **Imports**: Use relative imports within src (`./filename`), absolute for external packages
- **Naming**: camelCase for functions/variables, PascalCase for types/interfaces
- **Documentation**: JSDoc comments for exported functions with @param and @returns
- **Error Handling**: Standard TypeScript error patterns
- **Testing**: Bun test runner with descriptive test names and comprehensive coverage

## Agent Framework

- You are a coding agent working on a dedicated branch. Do not switch branches.
- When asked to "sync worktrees", ON THIS BRANCH commit outstanding changes 
  then perform  efficient manual rebase and conflict resolution against the `main` branch 
  only. Do not touch any other branches. There is no remote repository.

## Efficient Worktree Sync Process

### **Optimization Strategy**
Use batched operations and intelligent conflict resolution to minimize tool calls and reduce sync time from ~40 tool calls to ~5 tool calls.

### **1. Conflict Analysis (1 tool call)**
```bash
git status --porcelain | grep "^UU\|^AA\|^DD"
```
- Identify all conflicted files at once
- Add new files and changes only from this branch
- Apply standard resolution patterns immediately

### **2. Smart Conflict Resolution Patterns**
- **Lock files (bun.lock)**: Always regenerate with `bun install`
- **Package.json**: Merge dependencies, keep both versions
- **Settings files**: Union of permissions/configurations
- **Index exports**: Combine exports from both branches
- **Code files**: Use MultiEdit for batch resolution

### **3. Batch Operations (1-2 tool calls)**
- Use `MultiEdit` to resolve all code conflicts simultaneously
- Single `git add .` instead of multiple individual adds
- Run `bun install` to regenerate lock files

### **4. Parallel Validation (1 tool call)**
```bash
bun run build & bun test
```
- Validate build and tests in parallel
- Catch issues early before commit

### **5. Pre-flight Dependency Checks**
Before rebase, validate:
- All imports exist (grep for missing modules)
- Dependencies are installed
- Build/test baseline is clean

### **6. Atomic Resolution (1 tool call)**
- Single commit for all conflict resolution
- Descriptive commit message covering all changes
- Clean working tree result

## Git Workflow Guidelines

- Never make a git commit unless you are in the process of a worktree sync