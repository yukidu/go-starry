// Cloudflare's bundled D1 generic currently exposes `meta` as unknown for run().
// Narrow the zero-argument run() overload to the field this Worker actually reads.
interface D1PreparedStatement {
  run(): Promise<{ meta: { changes: number } }>;
}
