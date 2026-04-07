// FIXED VERSION - compatible with Nuvio
// problema anterior: export errado + estrutura incompatível

const slugCache = new Map();

function normalize(str) {
  return (str || "")
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isJunkTitle(title) {
  const t = normalize(title);
  return (
    t.includes('film') ||
    t.includes('movie') ||
    t.includes('especial') ||
    t.includes('ova') ||
    t.includes('ona') ||
    t.includes('episode of') ||
    t.includes('recap')
  );
}

function pickBest(streams, type) {
  const filtered = streams
    .filter(s => s.title === type)
    .sort((a, b) => b.quality - a.quality);

  if (filtered.length === 0) return [];

  const best = filtered[0];
  const fallback = filtered.find(s => s.quality < best.quality);

  return fallback ? [best, fallback] : [best];
}

async function searchAnime(query) {
  const res = await fetch(`https://animefire.net/pesquisar/${encodeURIComponent(query)}`);
  const html = await res.text();

  const items = Array.from(html.matchAll(/href=\"([^\"]+)\"[^>]*alt=\"([^\"]+)\"/g))
    .map(m => ({ url: m[1], title: m[2] }));

  let filtered = items.filter(i => !isJunkTitle(i.title));

  const qn = normalize(query);
  const exact = filtered.find(i => normalize(i.title) === qn);
  if (exact) return [exact];

  return filtered.slice(0, 5);
}

async function getEpisodeStreams(slug, ep) {
  const res = await fetch(`https://animefire.net/${slug}/${ep}`);
  const html = await res.text();

  const streams = [];

  const matches = Array.from(html.matchAll(/(360|480|720|1080)p.*?(dublado|legendado).*?(https?:[^\"']+)/gi));

  for (const m of matches) {
    const quality = parseInt(m[1]);
    const type = m[2].toLowerCase() === 'dublado' ? 'Dublado' : 'Legendado';
    const url = m[3];

    streams.push({
      title: type,
      quality,
      url
    });
  }

  return streams;
}

// 🔥 EXPORT CORRETO PRA NUVIO
export default {
  name: "AnimeFire",

  async getStreams({ title, season, episode, tmdbId }) {
    const ep = episode || 1;

    if (slugCache.has(tmdbId)) {
      const slug = slugCache.get(tmdbId);
      const s = await getEpisodeStreams(slug, ep);
      return [...pickBest(s, 'Legendado'), ...pickBest(s, 'Dublado')];
    }

    const results = await searchAnime(title);

    for (const item of results) {
      const slug = item.url.replace('https://animefire.net/', '').replace(/\/$/, '');

      const streams = await getEpisodeStreams(slug, ep);

      if (streams.length > 0) {
        slugCache.set(tmdbId, slug);
        return [...pickBest(streams, 'Legendado'), ...pickBest(streams, 'Dublado')];
      }
    }

    return [];
  }
};
