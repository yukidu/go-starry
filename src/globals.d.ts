interface D1Meta { changes?: number; [key: string]: unknown }
interface D1Result<T = unknown> { results?: T[]; success?: boolean; meta?: D1Meta }
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}
interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
}
interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}
interface Request {
  readonly cf?: { country?: string };
}

declare module "qrcode-svg" {
  export default class QRCode {
    constructor(options: { content: string; padding?: number; width?: number; height?: number; ecl?: string; join?: boolean });
    svg(): string;
  }
}
