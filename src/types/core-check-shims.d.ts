declare module '$env/dynamic/public' {
  export const env: Record<string, string | undefined> & {
    PUBLIC_SUPABASE_URL?: string;
    PUBLIC_SUPABASE_ANON_KEY?: string;
  };
}

declare module '$env/dynamic/private' {
  export const env: Record<string, string | undefined> & {
    SUPABASE_SERVICE_ROLE_KEY?: string;
  };
}

declare module '$env/static/public' {
  export const PUBLIC_SUPABASE_URL: string;
  export const PUBLIC_SUPABASE_ANON_KEY: string;
}

declare module '$env/static/private' {
  export const SUPABASE_SERVICE_ROLE_KEY: string;
}

declare module '@sveltejs/kit' {
  export function error(status: number, body?: unknown): never;
}
