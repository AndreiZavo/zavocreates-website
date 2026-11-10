export interface Env {
  ASSETS: Fetcher;
  AI: Ai;
  TURNSTILE_SECRET: string;
  RESEND_API_KEY: string;
  CONTACT_TO: string;
  CONTACT_FROM: string;
}

export default {
  async fetch(req: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    return env.ASSETS.fetch(req);
  },
};
