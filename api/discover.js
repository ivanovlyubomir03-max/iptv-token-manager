export default async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      message: "Използвай POST заявка."
    });
  }

  const base = "https://www.gledaitv.live";

  const categories = [
    { name: "Детски", path: "/category/detski" },
    { name: "Музикални", path: "/category/muzikalni" },
    { name: "Научнопопулярни", path: "/category/nauka" },
    { name: "Национални", path: "/category/nacionalni" },
    { name: "Филмови", path: "/category/filmi" },
    { name: "Общи", path: "/category/obshti" },
    { name: "Спортни", path: "/category/sport" },
    { name: "Чуждестранни", path: "/category/worldwide" }
  ];

  const allChannels = new Map();
  const errors = [];

  for (const category of categories) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(base + category.path, {
        signal: controller.signal,
        headers: {
          "User-Agent": "IPTV-Token-Manager/1.0",
          "Accept": "text/html"
        }
      });

      if (!response.ok) {
        errors.push(category.name + ": HTTP " + response.status);
        continue;
      }

      const html = (await response.text()).slice(0, 1000000);

      const pattern =
        /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/gi;

      let match;

      while ((match = pattern.exec(html)) !== null) {
        const href = match[2]
          .replace(/&amp;/g, "&")
          .trim();

        let url;

        try {
          url = new URL(href, base);
        } catch {
          continue;
        }

        if (
          url.hostname !== "www.gledaitv.live" &&
          url.hostname !== "gledaitv.live"
        ) {
          continue;
        }

        if (!/^\/watch-tv\/\d+\//i.test(url.pathname)) {
          continue;
        }

        const name = match[3]
          .replace(/<[^>]*>/g, " ")
          .replace(/&nbsp;/gi, " ")
          .replace(/&amp;/gi, "&")
          .replace(/\s+/g, " ")
          .replace(/\s+(НА ЖИВО|На живо)$/i, "")
          .trim();

        if (!name) continue;

        url.hash = "";
        const key = url.pathname;

        if (!allChannels.has(key)) {
          allChannels.set(key, {
            name,
            category: category.name,
            url: url.href,
            type: "channel_page"
          });
        }
      }
    } catch (error) {
      errors.push(
        category.name + ": " +
        (error.name === "AbortError"
          ? "времето за изчакване изтече"
          : "страницата не може да бъде прочетена")
      );
    } finally {
      clearTimeout(timer);
    }
  }

  const channels = [...allChannels.values()]
    .sort((a, b) => a.name.localeCompare(b.name, "bg"));

  return res.status(200).json({
    ok: true,
    count: channels.length,
    links: channels,
    categories: categories.length,
    errors,
    message: channels.length
      ? "Намерени са " + channels.length +
        " различни страници на канали от " +
        categories.length + " категории."
      : "Не бяха намерени страници на канали. Провери връзката със сайта."
  });
}