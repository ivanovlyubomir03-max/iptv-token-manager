module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      message: "Използвай POST заявка."
    });
  }

  const input = req.body && req.body.url;

  if (!input || typeof input !== "string") {
    return res.status(400).json({
      ok: false,
      message: "Не е подаден адрес на канал."
    });
  }

  let pageUrl;

  try {
    pageUrl = new URL(input);
  } catch {
    return res.status(400).json({
      ok: false,
      message: "Невалиден адрес."
    });
  }

  // Разрешаваме проверка само на страниците
  // на сайта gledaitv.live.
  if (
    pageUrl.protocol !== "https:" ||
    !["gledaitv.live", "www.gledaitv.live"].includes(
      pageUrl.hostname
    )
  ) {
    return res.status(403).json({
      ok: false,
      message: "Адресът на страницата не е разрешен."
    });
  }

  try {
    const response = await fetch(pageUrl.href, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "text/html,application/xhtml+xml"
      },
      signal: AbortSignal.timeout(12000),
      redirect: "error"
    });

    if (!response.ok) {
      return res.status(200).json({
        ok: false,
        message:
          "Сайтът върна HTTP " +
          response.status +
          ". Сървърът не успя да прочете страницата."
      });
    }

    const contentType =
      response.headers.get("content-type") || "";

    if (!contentType.includes("text/html")) {
      return res.status(200).json({
        ok: false,
        message: "Полученият отговор не е HTML страница."
      });
    }

    const html = await response.text();

    // Търсим публично посочени видеоадреси
    // в HTML кода на страницата.
    const normalized = html
      .replace(/\\u0026/gi, "&")
      .replace(/\\\//g, "/")
      .replace(/&amp;/gi, "&");

    const pattern =
      /(?:https?:\/\/[^"'`\s<>]+|\/[^"'`\s<>]+)\.(?:m3u8|mpd)(?:\?[^"'`\s<>]*)?/gi;

    const matches = normalized.match(pattern) || [];
    const streams = [];

    for (const match of matches) {
      try {
        const streamUrl = new URL(match, pageUrl);

        if (
          ["https:", "http:"].includes(streamUrl.protocol) &&
          !streams.includes(streamUrl.href)
        ) {
          streams.push(streamUrl.href);
        }
      } catch {
        // Пропускаме невалидните адреси.
      }
    }

    return res.status(200).json({
      ok: true,
      page: pageUrl.href,
      count: streams.length,
      streams,
      message: streams.length
        ? "Открити са възможни видеоадреси."
        : "Не са открити директни видеоадреси в HTML кода. Възможно е потокът да се зарежда динамично или да изисква разрешен достъп."
    });

  } catch (error) {
    return res.status(200).json({
      ok: false,
      message:
        "Страницата не можа да бъде прочетена. " +
        "Възможно е сайтът да блокира сървърните заявки."
    });
  }
};