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
    "cdn8.stgledai.org"
  ];

  if (
    url.protocol !== "https:" ||
    !allowedHosts.includes(url.hostname) ||
    url.username ||
    url.password
  ) {
    return response.status(403).json({
      ok: false,
      message: "Адресът не е разрешен за проверка."
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
        Range: "bytes=0-0",
        "User-Agent": "IPTV-Token-Manager/1.0"
      }
    });

    const status = result.status;

    try {
      await result.body?.cancel();
    } catch {}

    return response.status(200).json({
      ok: status >= 200 && status < 300,
      status,
      redirect: status >= 300 && status < 400,
      message:
        status >= 200 && status < 300
          ? "Сървърът отговори успешно."
          : status >= 300 && status < 400
            ? "Адресът пренасочва към друг адрес."
            : `Сървърът върна HTTP статус ${status}.`
    });
  } catch (error) {
    return response.status(200).json({
      ok: false,
      status: null,
      message:
        error.name === "AbortError"
          ? "Проверката изтече по време."
          : "Адресът не можа да бъде проверен."
    });
  } finally {
    clearTimeout(timeout);
  }
}
