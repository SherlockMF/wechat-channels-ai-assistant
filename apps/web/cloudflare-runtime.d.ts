declare module "cloudflare:workers" {
  export const env: unknown;
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}

interface D1Database {}
interface R2Bucket {}
