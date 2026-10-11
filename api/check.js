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
    const body = request.body;
    url = new URL(body?.url || "");
  } catch {
    return response.status(400).json({
      ok: false,
      message: "Невалиден адрес."
    });
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return response.status(400).json({
      ok: false,
      message: "Разрешени са само HTTP и HTTPS адреси."
    });
  }

  if (
    url.username ||
    url.password ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".localhost") ||
    url.hostname.endsWith(".local") ||
    !url.hostname.includes(".")
  ) {
    return response.status(400).json({
      ok: false,
      message: "Този адрес не е разрешен за проверка."
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const result = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: controller.signal,
      headers: {
        "Range": "bytes=0-0",
        "User-Agent": "IPTV-Token-Manager/1.0"
      }
    });

    const status = result.status;
    const isRedirect = status >= 300 && status < 400;

    try {
      await result.body?.cancel();
    } catch {}

    return response.status(200).json({
      ok: status >= 200 && status < 300,
      status,
      redirect: isRedirect,
      message: isRedirect
        ? "Адресът пренасочва към друг адрес."
        : status >= 200 && status < 300
          ? "Сървърът отговори успешно."
          : `Сървърът върна HTTP статус ${status}.`
    });
  } catch (error) {
    return response.status(200).json({
      ok: false,
      status: null,
      message: error.name === "AbortError"
        ? "Проверката изтече по време."
        : "Адресът не можа да бъде проверен."
    });
  } finally {
    clearTimeout(timeout);
  }
}
