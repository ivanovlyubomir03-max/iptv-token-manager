export default async function handler(request, response) {
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");

  if (request.method !== "POST") {
    return response.status(405).json({
      ok: false,
      message: "Използвай POST заявка."
    });
  }

  let url;
  try {
    url = new URL(request.body?.url || "");
  } catch {
    return response.status(400).json({
      ok: false,
      message: "Невалиден адрес."
    });
  }

  const allowedHosts = [
    "cdn8.stgledai.org",
    "cdn.stgledai.org",
    "cdn.gledaitv.fan"
  ];
  const supportedPath = /\.(m3u8|mpd)$/i.test(url.pathname);
  const allowedPort = url.port === "" ||
    (url.hostname === "cdn.stgledai.org" && url.port === "8082");

  if (
    url.protocol !== "https:" ||
    !allowedHosts.includes(url.hostname) ||
    !supportedPath ||
    !allowedPort ||
    url.username ||
    url.password
  ) {
    return response.status(403).json({
      ok: false,
      httpOk: false,
      verified: false,
      status: null,
      message: "Проверяват се само HTTPS адреси .m3u8/.mpd от разрешените CDN сървъри."
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const result = await fetch(url.href, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        Range: "bytes=0-4095",
        "User-Agent": "IPTV-Token-Manager/1.1",
        "Accept": "application/vnd.apple.mpegurl, application/x-mpegURL, application/dash+xml, */*"
      }
    });

    const status = result.status;
    const httpOk = status >= 200 && status < 300;
    const contentType = (result.headers.get("content-type") || "").toLowerCase();
    let snippet = "";

    // Read only a small prefix to identify a real HLS/DASH manifest.
    if (httpOk && result.body) {
      const reader = result.body.getReader();
      const chunks = [];
      let total = 0;
      try {
        while (total < 4096) {
          const part = await reader.read();
          if (part.done) break;
          const remaining = 4096 - total;
          const chunk = part.value.subarray(0, remaining);
          chunks.push(chunk);
          total += chunk.byteLength;
          if (part.value.byteLength >= remaining) break;
        }
      } finally {
        try { await reader.cancel(); } catch {}
        try { reader.releaseLock(); } catch {}
      }
      const sample = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        sample.set(chunk, offset);
        offset += chunk.byteLength;
      }
      snippet = new TextDecoder("utf-8", { fatal: false }).decode(sample)
        .replace(/^\uFEFF/, "")
        .trimStart();
    } else {
      try { await result.body?.cancel(); } catch {}
    }

    let kind = null;
    if (/^#EXTM3U\b/i.test(snippet)) {
      kind = "HLS";
    } else if (/<MPD(?:\s|>)/i.test(snippet)) {
      kind = "DASH";
    }

    let message;
    if (kind === "HLS") {
      message = "✅ Потвърден е HLS плейлист (#EXTM3U). Това потвърждава формата, но не гарантира непрекъснато възпроизвеждане.";
    } else if (kind === "DASH") {
      message = "✅ Потвърден е DASH плейлист (MPD). Това потвърждава формата, но не гарантира непрекъснато възпроизвеждане.";
    } else if (httpOk) {
      message = "⚠️ Сървърът отговори с HTTP " + status + ", но началото на съдържанието не потвърждава HLS/DASH плейлист. Адресът не се брои за потвърден.";
    } else if (status === 401 || status === 403) {
      message = "⛔ Достъпът е отказан (HTTP " + status + "). Токенът може да е изтекъл или потокът да е ограничен.";
    } else if (status >= 300 && status < 400) {
      message = "Адресът пренасочва. Той не е потвърден като работещ директен поток.";
    } else if (status === 404 || status === 410) {
      message = "Потокът не е намерен или вече не е наличен (HTTP " + status + ").";
    } else {
      message = "Сървърът върна HTTP статус " + status + ".";
    }

    return response.status(200).json({
      ok: Boolean(kind),
      httpOk,
      verified: Boolean(kind),
      kind,
      status,
      redirect: status >= 300 && status < 400,
      contentType: contentType.slice(0, 100),
      message
    });
  } catch (error) {
    return response.status(200).json({
      ok: false,
      httpOk: false,
      verified: false,
      status: null,
      message: error.name === "AbortError"
        ? "Проверката изтече по време."
        : "Адресът не можа да бъде проверен от сървъра."
    });
  } finally {
    clearTimeout(timeout);
  }
}