const TMDB_API_KEY = 'c6c6f4c1cb446e0d5c305f3fa7eeb4a9';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const BASE_URL = 'https://animefire.io';

const SEARCH_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'Referer': BASE_URL + '/'
};

const VIDEO_HEADERS = {
    'X-Requested-With': 'XMLHttpRequest',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': BASE_URL
};

// ─── Buscar anime no AnimeFire (funciona direto — Cloudflare libera HTML) ──

async function searchAnimeFire(title) {
    const slug = titleToSlug(title);
    const url = `${BASE_URL}/pesquisar/${slug}`;

    try {
        const resp = await fetch(url, { headers: SEARCH_HEADERS });
        if (!resp.ok) return [];
        const html = await resp.text();

        // Extrair links: <a href="https://animefire.io/animes/{slug}">
        // slug termina em "-todos-os-episodios"
        const items = [];
        const regex = /href="(https?:\/\/animefire\.io\/(?:animes|filmes)\/([^"]+))"/g;
        let m;
        while ((m = regex.exec(html)) !== null) {
            const fullUrl = m[1];
            const rawSlug = m[2];
            if (rawSlug.toLowerCase().includes('todos-os-episodios')) {
                // Extrair titulo do card: <h3 class="animeTitle">Nome</h3>
                const cardHtml = html.substring(Math.max(0, m.index - 500), m.index + 500);
                const titleMatch = cardHtml.match(/class="animeTitle"\s*>\s*([^<]+)</);
                const displayTitle = titleMatch ? titleMatch[1].trim() : rawSlug;

                items.push({
                    url: fullUrl,
                    rootSlug: rawSlug.replace(/-todos-os-episodios$/i, ''),
                    displayTitle: displayTitle
                });
            }
        }
        return items;
    } catch {
        return [];
    }
}

// ─── Chamar API /video/ (sem Cloudflare) ────────────────────────────────────

async function extractVideoStreams(rootSlug, episodeNum) {
    if (!rootSlug || !episodeNum) return [];

    const timestamp = Math.floor(Date.now() / 1000);
    const url = `${BASE_URL}/video/${rootSlug}/${episodeNum}?tempsubs=0&${timestamp}`;

    try {
        const resp = await fetch(url, { headers: VIDEO_HEADERS });
        if (!resp.ok) return [];

        const text = await resp.text();
        if (text.length < 30) return [];

        const json = JSON.parse(text);
        const data = json?.data;
        if (!data || data.length === 0) return [];

        return data
            .filter(item => item.src)
            .map(item => {
                let quality = 360;
                let qualityLabel = item.label || '360p';
                const numMatch = qualityLabel.match(/\d+/);
                if (numMatch) {
                    const n = parseInt(numMatch[0]);
                    quality = n >= 1080 ? 1080 : n >= 720 ? 720 : n >= 480 ? 480 : 360;
                }
                return {
                    url: item.src,
                    name: `AnimeFire ${qualityLabel}`,
                    title: qualityLabel,
                    quality: quality,
                    type: item.src.includes('.m3u8') ? 'hls' : 'mp4',
                    headers: {
                        'Referer': BASE_URL,
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                };
            });
    } catch {
        return [];
    }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function titleToSlug(title) {
    if (!title) return '';
    return title.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

// ─── AniList → titulos alternativos ─────────────────────────────────────────

async function getAniListTitles(tmdbId, mediaType) {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const tmdbUrl = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;

    const tmdbResp = await fetch(tmdbUrl);
    if (!tmdbResp.ok) return [];
    const tmdbData = await tmdbResp.json();
    const searchTitle = mediaType === 'tv' ? tmdbData.name : tmdbData.title;

    const query = `
        query ($search: String) {
            Media(search: $search, type: ANIME) {
                title { romaji english }
                synonyms
            }
        }`;

    const anilistResp = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { search: searchTitle } })
    });

    if (!anilistResp.ok) return [{ name: searchTitle, type: 'tmdb' }];
    const anilistData = await anilistResp.json();
    const media = anilistData?.data?.Media;

    const titles = [];
    if (media?.title?.romaji) titles.push({ name: media.title.romaji, type: 'romaji' });
    if (media?.title?.english && media.title.english !== media.title.romaji) {
        titles.push({ name: media.title.english, type: 'english' });
    }
    if (media?.synonyms) {
        for (const syn of media.synonyms) {
            if (!titles.some(t => t.name.toLowerCase() === syn.toLowerCase())) {
                titles.push({ name: syn, type: 'synonym' });
            }
        }
    }
    if (titles.length === 0) titles.push({ name: searchTitle, type: 'tmdb' });
    return titles;
}

// ─── getStreams ──────────────────────────────────────────────────────────────

async function getStreams(tmdbId, mediaType, season, episode) {
    const targetSeason = mediaType === 'movie' ? 1 : season;
    const targetEpisode = mediaType === 'movie' ? 1 : episode;

    try {
        // 1) Obter titulos possiveis
        const titles = await getAniListTitles(tmdbId, mediaType);
        if (!titles.length) return [];

        // 2) Para cada titulo, buscar no site → pegar slug → chamar /video/
        for (const titleInfo of titles) {
            const animeLinks = await searchAnimeFire(titleInfo.name);
            if (!animeLinks.length) continue;

            // Primeiro resultado = mais relevante
            const { rootSlug } = animeLinks[0];

            const streams = await extractVideoStreams(rootSlug, targetEpisode);
            if (streams.length > 0) {
                return streams.sort((a, b) => b.quality - a.quality);
            }
        }

        return [];
    } catch {
        return [];
    }
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
