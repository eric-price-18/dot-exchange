declare namespace Cloudflare {
  interface Env {
    PUBLIC_SITE_ORIGIN?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
