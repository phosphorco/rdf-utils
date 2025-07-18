# Integration Tests

This directory contains integration tests that require external services.

## Stardog Tests

The Stardog integration tests require a running Stardog instance with valid credentials.

### Environment Setup

Create a `.env` file in the project root with the following variables:

```bash
# Stardog connection details
STARDOG_PROTOCOL=https
STARDOG_HOST=your-stardog-host.stardog.cloud
STARDOG_PORT=5820
STARDOG_DATABASE=your-database
STARDOG_USERNAME=your-username
STARDOG_PASSWORD=your-password

# Optional settings
STARDOG_REASONING=true
STARDOG_TIMEOUT=30000
```

For local development:
```bash
STARDOG_PROTOCOL=http
STARDOG_HOST=localhost
STARDOG_PORT=5820
STARDOG_DATABASE=test
STARDOG_USERNAME=admin
STARDOG_PASSWORD=admin
```

### Running Tests

```bash
# Run all integration tests
bun run test:integration

# Run only Stardog integration tests  
bun test test/integration/stardog.test.ts
```

### Requirements

- Stardog server running on the configured endpoint
- Database specified in `STARDOG_DATABASE` must exist
- User must have read/write permissions on the database
- Network access to the Stardog endpoint

### Test Cleanup

Tests automatically clean up test data using a dedicated test graph IRI. Each test uses the graph `http://test.example.org/integration/graph` to isolate test data from other graphs in the database.
