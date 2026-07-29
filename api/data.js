import { Redis } from "@upstash/redis";

const redis = new Redis({
  url:
    process.env.UPSTASH_REDIS_REST_KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL,
  token:
    process.env.UPSTASH_REDIS_REST_KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN,
});

const DB_KEY = "ambiguo:database:v1";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const data = await redis.get(DB_KEY);

      return res.status(200).json({
        ok: true,
        data: data || null,
      });
    }

    if (req.method === "POST") {
      const body = req.body;

      if (!body || typeof body !== "object") {
        return res.status(400).json({
          ok: false,
          error: "Database non valido.",
        });
      }

      await redis.set(DB_KEY, body);

      return res.status(200).json({
        ok: true,
        savedAt: new Date().toISOString(),
      });
    }

    return res.status(405).json({
      ok: false,
      error: "Metodo non consentito.",
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Errore server.",
    });
  }
}