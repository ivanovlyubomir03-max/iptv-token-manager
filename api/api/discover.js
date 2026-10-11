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
    page = new URL(req.body?.url || "https://www.gledaitv.live/");
  } catch {
    return res.status(400).json({
      ok: false,
      message: "Невалиден адрес."
    });
  }

  const allowedHosts = [
    "gledaitv.live",
    "www.gledaitv.live"
  ];

  if (
    page.protocol !== "https:" ||
    !allowedHosts.includes(page.hostname)
  ) {
    return res.status(403).json({
      ok: false,
      message: "Разрешен е само сайтът GledaiTV."
    });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(page.href, {
      signal: controller.signal,
      headers: {
        "User-Agent": "IPTV-Token-Manager/1.0",
        "Accept": "text/html"
      },
      redirect: "follow"
    });

    if (!response.ok) {
      return res.status(200).json({
        ok: false,
        message: "Сайтът върна HTTP " + response.status
      });
    }

    const html = (await response.text()).slice(0, 1000000);
    const links = [];
    const pattern =
      /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi;

    let match;

    while ((match = pattern.exec(html)) !== null) {
      const href = match[2]
        .replace(/&amp;/g, "&")
        .trim();

      try {
        const url = new URL(href, page);

        if (
          url.protocol !== "https:" ||
          !allowedHosts.includes(url.hostname)
        ) {
          continue;
        }

        const name = match[3]
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        if (!name || name.length > 100) {
          continue;
        }

        if (
          url.pathname === "/" ||
          /\/(категории|categories|contact|about)\/?$/i.test(url.pathname)
        ) {
          continue;
        }

        links.push({
          name,
          url: url.href,
          type: /\.(m3u8?|m3u)(?:[?#]|$)/i.test(url.href)
            ? "playlist"
            : "channel_page"
        });
      } catch {}
    }

    const unique = [
      ...new Map(links.map(item => [item.url, item])).values()
    ].slice(0, 100);

    return res.status(200).json({
      ok: true,
      count: unique.length,
      links: unique,
      message: unique.length
        ? "Намерени са " + unique.length + " публични връзки."
        : "Не са намерени подходящи връзки на тази страница."
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