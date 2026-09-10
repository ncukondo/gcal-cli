// Fixture for tests/integration/stdout-flush.test.ts.
//
// Writes a large payload to stdout and terminates through the same helper the
// real commands use, so the test exercises the exact exit path that used to
// truncate piped output at the 64KB kernel pipe buffer.
//
// Usage: bun tests/integration/fixtures/large-output.ts <bytes> <exitCode>
import { finish } from "../../../src/cli.ts";

const size = Number(process.argv[2] ?? 200_000);
const exitCode = Number(process.argv[3] ?? 0);

process.stdout.write("x".repeat(size));
finish({ exitCode });
