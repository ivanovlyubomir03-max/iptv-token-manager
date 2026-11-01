// Dynamic M3U playlist. Bulgarian-language and Bulgaria-based channels are listed first.
const SOURCES = {
  all: "https://iptv-org.github.io/iptv/index.category.m3u",
  bulgaria: "https://iptv-org.github.io/iptv/countries/bg.m3u",
  bulgarianLanguage: "https://iptv-org.github.io/iptv/languages/bul.m3u"
};

const GROUP_NAMES = {
  Animation: "Детски / Анимация", Kids: "Детски", Movies: "Филмови",
  Music: "Музикални", Documentary: "Документални", Sports: "Спортни",
  Science: "Наука", Outdoor: "Природа и животни", Family: "Семейни",
  Entertainment: "Развлекателни", General: "Общи", News: "Новини",
  Education: "Образователни", Travel: "Пътешествия", Culture: "Култура",
  Relax: "Релакс", Lifestyle: "Начин на живот", Comedy: "Комедийни",
  Series: "Сериали", Classic: "Класически", Public: "Обществени",
  Auto: "Автомобили", Cooking: "Кулинарни", Business: "Бизнес",
  Weather: "Времето", Legislative: "Парламентарни", Religious: "Религиозни",
  Shop: "Телешопинг", Interactive: "Интерактивни"
};

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "IPTV-Token-Manager/2.0",
        "Accept": "application/vnd.apple.mpegurl, application/x-mpegURL, text/plain, */*"
      }
    });
    if (!response.ok) throw new Error("HTTP " + response.status + " from " + url);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function parseEntries(source) {
  const lines = source.replace(/^\uFEFF/, "").split(/\r?\n/);
  const entries = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("#EXTINF")) continue;
    const block = [lines[i]];
    let streamUrl = "";
    while (i + 1 < lines.length) {
      const line = lines[++i].trim();
      if (!line) continue;
      block.push(line);
      if (!line.startsWith("#")) { streamUrl = line; break; }
    }
    if (streamUrl && /^https?:\/\//i.test(streamUrl)) entries.push({ block, streamUrl });
  }
  return entries;
}

function setGroup(extinf, group) {
  const safeGroup = group.replace(/"/g, "");
  if (/\bgroup-title="[^"]*"/i.test(extinf)) {
    return extinf.replace(/\bgroup-title="[^"]*"/i, 'group-title="' + safeGroup + '"');
  }
  const comma = extinf.indexOf(",");
  if (comma < 0) return extinf + ' group-title="' + safeGroup + '"';
  return extinf.slice(0, comma) + ' group-title="' + safeGroup + '"' + extinf.slice(comma);
}

function prepare(entries, mode) {
  return entries.map(entry => {
    const block = [...entry.block];
    let group = "Други";
    if (mode === "bulgaria") {
      group = "🇧🇬 Български";
    } else {
      const match = block[0].match(/\bgroup-title="([^"]*)"/i);
      if (match) {
        const original = match[1].split(";")[0].trim();
        group = GROUP_NAMES[original] || original || "Други";
      }
    }
    block[0] = setGroup(block[0], group);
    return { block, streamUrl: entry.streamUrl };
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    return res.status(405).send("Method not allowed");
  }
  res.setHeader("Content-Type", "audio/x-mpegurl; charset=utf-8");
  res.setHeader("Content-Disposition", 'inline; filename="iptv-org-combined.m3u"');
  res.setHeader("Cache-Control", "public, s-maxage=600, stale-while-revalidate=1800");
  res.setHeader("Access-Control-Allow-Origin", "*");

  try {
    const [allResult, bgResult, languageResult] = await Promise.allSettled([
      fetchText(SOURCES.all),
      fetchText(SOURCES.bulgaria),
      fetchText(SOURCES.bulgarianLanguage)
    ]);
    if (allResult.status !== "fulfilled") {
      throw allResult.reason || new Error("The main iptv-org playlist is unavailable.");
    }

    const allEntries = prepare(parseEntries(allResult.value), "all");
    const bgEntries = bgResult.status === "fulfilled"
      ? prepare(parseEntries(bgResult.value), "bulgaria") : [];
    const languageEntries = languageResult.status === "fulfilled"
      ? prepare(parseEntries(languageResult.value), "bulgaria") : [];

    const output = ["#EXTM3U"];
    const seen = new Set();
    let count = 0;
    let bgCount = 0;

    // Bulgarian-language and Bulgaria-based channels first, then worldwide channels.
    for (const entry of [...bgEntries, ...languageEntries, ...allEntries]) {
      const key = entry.streamUrl.trim();
      if (seen.has(key)) continue;
      seen.add(key);
      output.push(...entry.block);
      count++;
      if (entry.block[0].includes('group-title="🇧🇬 Български"')) bgCount++;
    }

    res.setHeader("X-Playlist-Channels", String(count));
    res.setHeader("X-Bulgarian-Channels", String(bgCount));
    res.setHeader("X-Playlist-Source", "iptv-org");
    if (req.method === "HEAD") return res.status(200).end();
    return res.status(200).send(output.join("\n") + "\n");
  } catch (error) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.status(502).send("#EXTM3U\n# Playlist update failed: " +
      String(error && error.message ? error.message : error).replace(/[\r\n]/g, " ") + "\n");
  }
}
