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
        Range: "bytes=0-0",
        "User-Agent": "IPTV-Token-Manager/1.0"
      }
    });

    const status = result.status;
    try {
      await result.body?.cancel();
    } catch {}

    let message;
    if (status >= 200 && status < 300) {
      message = "✅ Сървърът отговори успешно. Това не гарантира, че плеърът може да възпроизведе потока.";
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
      ok: status >= 200 && status < 300,
      status,
      redirect: status >= 300 && status < 400,
      message
    });
  } catch (error) {
    return response.status(200).json({
      ok: false,
      status: null,
      message: error.name === "AbortError"
        ? "Проверката изтече по време."
        : "Адресът не можа да бъде проверен от сървъра."
    });
  } finally {
    clearTimeout(timeout);
  }
}