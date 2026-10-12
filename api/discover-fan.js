export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      message: "Използвай POST заявка."
    });
  }

  let requestedUrl;
  try {
    requestedUrl = new URL(req.body?.url || "https://www.gledaitv.fan/bulgaria-tv-channels.html");
  } catch {
    return res.status(400).json({
      ok: false,
      message: "Невалиден адрес."
    });
  }

  if (
    requestedUrl.protocol !== "https:" ||
    !["gledaitv.fan", "www.gledaitv.fan"].includes(requestedUrl.hostname) ||
    requestedUrl.username ||
    requestedUrl.password
  ) {
    return res.status(403).json({
      ok: false,
      message: "Разрешени са само адреси от gledaitv.fan."
    });
  }

  const base = "https://www.gledaitv.fan";
  const pages = [1, 2, 3].map(page => {
    const url = new URL("/bulgaria-tv-channels.html", base);
    if (page > 1) url.searchParams.set("sayfa", String(page));
    return { page, url: url.href };
  });

  const allChannels = new Map();
  const errors = [];

  function decodeText(value) {
    return value
      .replace(/&amp;/gi, "&")
      .replace(/&nbsp;/gi, " ")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  await Promise.all(pages.map(async page => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(page.url, {
        signal: controller.signal,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; IPTV-Token-Manager/1.0)",
          "Accept": "text/html,application/xhtml+xml"
        }
      });

      if (!response.ok) {
        errors.push("Страница " + page.page + ": HTTP " + response.status);
        return;
      }

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("text/html")) {
        errors.push("Страница " + page.page + ": отговорът не е HTML.");
        return;
      }

      const html = (await response.text()).slice(0, 1500000);
      const anchors = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi;
      let match;

      while ((match = anchors.exec(html)) !== null) {
        const href = match[2].replace(/&amp;/gi, "&").trim();
        let channelUrl;

        try {
          channelUrl = new URL(href, base);
        } catch {
          continue;
        }

        if (
          channelUrl.protocol !== "https:" ||
          !["gledaitv.fan", "www.gledaitv.fan"].includes(channelUrl.hostname) ||
          !/^[a-z0-9-]+-live-tv\.html$/i.test(channelUrl.pathname.slice(1))
        ) {
          continue;
        }

        const anchorHtml = match[3];
        const altMatch = anchorHtml.match(/\balt\s*=\s*(["'])(.*?)\1/i);
        const name = decodeText(anchorHtml) ||
          (altMatch ? decodeText(altMatch[2]) : "");

        if (!name || /^HD$/i.test(name) || name.length > 100) continue;

        channelUrl.search = "";
        channelUrl.hash = "";
        const key = channelUrl.pathname.toLowerCase();

        if (!allChannels.has(key)) {
          allChannels.set(key, {
            name: name.replace(/^HD\s+/i, "").trim(),
            category: "Български канали",
            url: channelUrl.href,
            type: "channel_page"
          });
        }
      }
    } catch (error) {
      errors.push(
        "Страница " + page.page + ": " +
        (error.name === "AbortError"
          ? "времето за изчакване изтече"
          : "страницата не може да бъде прочетена")
      );
    } finally {
      clearTimeout(timer);
    }
  }));

  const channels = [...allChannels.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "bg"));

  return res.status(channels.length ? 200 : 502).json({
    ok: channels.length > 0,
    count: channels.length,
    links: channels,
    pagesChecked: pages.length,
    errors,
    message: channels.length
      ? "Намерени са " + channels.length + " страници на български канали от GledaiTV Fan."
      : "Не бяха намерени страници. " +
        (errors.length ? errors.join("; ") : "Провери дали сайтът е достъпен от сървъра.")
  });
}