export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      message: "Използвай POST заявка."
    });
  }

  let page;

  try {
    page = new URL(req.body?.url || "");
  } catch {
    return res.status(400).json({
      ok: false,
      message: "Невалиден адрес."
    });
  }

  const allowed = [
    "gledaitv.live",
    "www.gledaitv.live"
  ];

  if (
    page.protocol !== "https:" ||
    !allowed.includes(page.hostname)
  ) {
    return res.status(403).json({
      ok: false,
      message: "Този сайт не е разрешен."
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    8000
  );

  try {
    const response = await fetch(page, {
      signal: controller.signal,
      headers: {
        "User-Agent": "IPTV-Token-Manager/1.0",
        "Accept": "text/html"
      },
      redirect: "error"
    });

    if (!response.ok) {
      return res.status(200).json({
        ok: false,
        message: "Страницата върна HTTP " + response.status
      });
    }

    const html = (await response.text()).slice(0, 1000000);
    const links = [];
    const pattern =
      /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi;

    let match;

    while ((match = pattern.exec(html)) !== null) {
      const href = match[2].replace(/&amp;/g, "&").trim();

      if (!/\.(m3u8?|m3u)(?:[?#]|$)/i.test(href)) {
        continue;
      }

      try {
        const url = new URL(href, page);

        if (!["http:", "https:"].includes(url.protocol)) {
          continue;
        }

        const name = match[3]
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        links.push({
          name: name || "Телевизионен поток",
          url: url.href
        });
      } catch {}

      if (links.length >= 50) break;
    }

    const unique = [
      ...new Map(links.map(x => [x.url, x])).values()
    ];

    return res.status(200).json({
      ok: true,
      count: unique.length,
      links: unique,
      message: unique.length
        ? "Намерени са публични playlist връзки."
        : "Не са намерени директни публични M3U/M3U8 връзки."
    });

  } catch (error) {
    return res.status(200).json({
      ok: false,
      message: error.name === "AbortError"
        ? "Изтече времето за проверка."
        : "Страницата не може да бъде прочетена."
    });

  } finally {
    clearTimeout(timer);
  }
}