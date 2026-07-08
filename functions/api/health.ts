type Env = {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
};

export const onRequestGet: PagesFunction<Env> = async ({ env }) => {
  return Response.json({
    ok: true,
    provider: env.OPENAI_API_KEY ? "openai" : "local",
    model: env.OPENAI_MODEL || "gpt-5.4-mini"
  });
};
