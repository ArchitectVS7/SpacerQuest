/**
 * Standalone healthcheck script for Docker HEALTHCHECK directive.
 * Exits 0 if the server responds, 1 otherwise.
 */
export {};
const port = process.env.PORT || '3000';

try {
  const res = await fetch(`http://localhost:${port}/health`);
  process.exit(res.ok ? 0 : 1);
} catch {
  process.exit(1);
}
