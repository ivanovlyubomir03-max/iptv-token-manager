module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      message: "Използвай POST заявка."
    });
  }

  const input = req.body && req.body.url;
  if (!input || typeof input !== "string" || input.length > 2048) {
    return res.status(400).json({
      ok: false,
      message: "Не е подаден валиден адрес на канал."
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

  const liveChannel = (
    ["gledaitv.live", "www.gledaitv.live"].includes(pageUrl.hostname) &&
    /^\/watch-tv\/\d+(?:\/|$)/i.test(pageUrl.pathname)
  );
  const fanChannel = (
    ["gledaitv.fan", "www.gledaitv.fan"].includes(pageUrl.hostname) &&
    /^\/[a-z0-9-]+-live-tv\.html$/i.test(pageUrl.pathname)
  );

  if (
    pageUrl.protocol !== "https:" ||
    pageUrl.port ||
    pageUrl.username ||
    pageUrl.password ||
    !(liveChannel || fanChannel)
  ) {
    return res.status(403).json({
      ok: false,
      message: "Разрешени са само валидни страници на канали от gledaitv.live или gledaitv.fan."
    });
  }

  try {
    const response = await fetch(pageUrl.href, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; IPTV-Token-Manager/1.0)",
        "Accept": "text/html,application/xhtml+xml"
      },
      signal: AbortSignal.timeout(10000),
      redirect: "error"
    });

    if (!response.ok) {
      return res.status(200).json({
        ok: false,
        message: "Сайтът върна HTTP " + response.status +
          ". Сървърът не успя да прочете страницата."
      });
    }

    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    if (!contentType.includes("text/html")) {
      return res.status(200).json({
        ok: false,
        message: "Полученият отговор не е HTML страница."
      });
    }

    const html = (await response.text()).slice(0, 1500000);
    const normalized = html
      .replace(/\\u0026/gi, "&")
      .replace(/\\u003a/gi, ":")
      .replace(/\\u002f/gi, "/")
      .replace(/\\\\u0026/gi, "&")
      .replace(/\\\\u003a/gi, ":")
      .replace(/\\\\\//g, "/")
      .replace(/&amp;/gi, "&")
      .replace(/\\x3a/gi, ":")
      .replace(/\\x2f/gi, "/");

    const pattern = /(?:https?:\/\/[^"'\s<>\\]+|\/\/[^"'\s<>\\]+|\/[^"'\s<>]+)\.(?:m3u8|mpd)(?:\?[^"'\s<>]*)?/gi;
    const matches = normalized.match(pattern) || [];

    // Also inspect a small number of same-site JavaScript files. Some public pages
    // keep player configuration in a script rather than inline HTML. This does not
    // execute scripts, access cookies, or bypass player/DRM restrictions.
    const scriptPaths = [];
    const scriptPattern = /<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
    let scriptMatch;
    while ((scriptMatch = scriptPattern.exec(html)) && scriptPaths.length < 6) {
      try {
        const scriptUrl = new URL(scriptMatch[1], pageUrl);
        if (scriptUrl.protocol === "https:" &&
            scriptUrl.hostname === pageUrl.hostname &&
            !scriptUrl.username && !scriptUrl.password &&
            !scriptPaths.includes(scriptUrl.href)) scriptPaths.push(scriptUrl.href);
      } catch {}
    }
    for (const scriptUrl of scriptPaths) {
      try {
        const scriptResponse = await fetch(scriptUrl, {
          headers: {"User-Agent":"Mozilla/5.0 (compatible; IPTV-Token-Manager/1.0)", "Accept":"application/javascript,text/javascript,*/*"},
          signal: AbortSignal.timeout(3500),
          redirect: "error"
        });
        if (!scriptResponse.ok) continue;
        const scriptType = (scriptResponse.headers.get("content-type") || "").toLowerCase();
        if (scriptType && !/(javascript|ecmascript|text\/plain|octet-stream)/i.test(scriptType)) continue;
        const scriptText = (await scriptResponse.text()).slice(0, 500000);
        matches.push(...(scriptText.match(pattern) || []));
      } catch {}
    }
    const streams = [];

    for (const match of matches) {
      try {
        const streamUrl = new URL(match, pageUrl);
        if (
          ["https:", "http:"].includes(streamUrl.protocol) &&
          !streamUrl.username &&
          !streamUrl.password &&
          !streams.includes(streamUrl.href)
        ) {
          streams.push(streamUrl.href);
        }
      } catch {
        // Ignore malformed candidates.
      }
    }

    return res.status(200).json({
      ok: true,
      page: pageUrl.href,
      count: streams.length,
      streams,
      message: streams.length
        ? "Открити са възможни видеоадреси в достъпния HTML."
        : "Не са открити директни видеоадреси в достъпния HTML. Възможно е плеърът да се зарежда отделно или потокът да изисква разрешен достъп."
    });
  } catch (error) {
    return res.status(200).json({
      ok: false,
      message: error.name === "TimeoutError" || error.name === "AbortError"
        ? "Времето за изчакване изтече при прочитане на страницата."
        : "Страницата не можа да бъде прочетена. Възможно е сайтът да блокира сървърни заявки."
    });
  }
};