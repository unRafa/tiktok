// Cloudflare Worker: backend para la página de descargas (v2, con manejo de errores).
// Rutas:
//   GET /?url=<link-tiktok>          -> JSON con título, autor, miniatura y links
//   GET /dl?u=<url-video>&n=<nombre> -> sirve el archivo como descarga

// Tu página de GitHub Pages, sin barra final y sin /nombre-del-repo.
const ALLOWED_ORIGIN = "https://unrafa.github.io";

const TIKWM = "https://www.tikwm.com";

const cors = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Vary": "Origin",
};

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });

const abs = u => (u ? (u.startsWith("http") ? u : TIKWM + u) : "");

async function handle(request) {
  const url = new URL(request.url);

  if (url.pathname === "/dl") {
    const target = url.searchParams.get("u") || "";
    let host = "";
    try { host = new URL(target).hostname; } catch {}
    if (host !== "tikwm.com" && !host.endsWith(".tikwm.com")) {
      return json({ error: "URL no permitida" }, 400);
    }
    const name = (url.searchParams.get("n") || "tiktok").replace(/[^\w\-]+/g, "_").slice(0, 60);
    const upstream = await fetch(target);
    if (!upstream.ok) return json({ error: "No se pudo obtener el archivo" }, 502);
    return new Response(upstream.body, {
      headers: {
        ...cors,
        "Content-Type": "video/mp4",
        "Content-Disposition": `attachment; filename="${name}.mp4"`,
      },
    });
  }

  const link = url.searchParams.get("url") || "";
  let h = "";
  try { h = new URL(link).hostname.replace(/^www\./, ""); } catch {}
  if (h !== "tiktok.com" && !h.endsWith(".tiktok.com")) {
    return json({ error: "Link de TikTok no válido" }, 400);
  }

  const r = await fetch(`${TIKWM}/api/?url=${encodeURIComponent(link)}&hd=1`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!r.ok) return json({ error: "El servicio de resolución respondió " + r.status }, 502);
  const res = await r.json();
  if (res.code !== 0 || !res.data) {
    return json({ error: "tikwm: " + (res.msg || "video no encontrado o privado") }, 404);
  }

  const d = res.data;
  const base = `${url.origin}/dl?n=${encodeURIComponent(d.id || "tiktok")}&u=`;
  const nowm = abs(d.hdplay || d.play);
  const wm = abs(d.wmplay);

  return json({
    title: d.title || "",
    author: d.author ? "@" + (d.author.unique_id || d.author.nickname) : "",
    thumbnail: abs(d.cover),
    no_watermark: nowm ? base + encodeURIComponent(nowm) : "",
    watermark: wm ? base + encodeURIComponent(wm) : "",
  });
}

export default {
  async fetch(request) {
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    try {
      return await handle(request);
    } catch (e) {
      return json({ error: "Error interno: " + (e && e.message ? e.message : String(e)) }, 500);
    }
  },
};
