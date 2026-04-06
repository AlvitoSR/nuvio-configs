const TMDB_API_KEY = 'c6c6f4c1cb446e0d5c305f3fa7eeb4a9';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const BASE_URL = 'https://animefire.io';

const PROXY = 'https://api.codetabs.com/v1/proxy/?quest=';
const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': BASE_URL,
    'Accept-Language': 'pt-BR,pt;q=0.9'
};

// ─── Proxy wrapper ──────────────────────────────────────────────────────────

async function proxyFetch(url, options = {}) {
    try {
        const proxyUrl = PROXY + encodeURIComponent(url);
        const resp = await fetch(proxyUrl, options);
        if (!resp.ok) return null;
        const text = await resp.text();
        if (!text || text.length < 50) return null;
        if (text.includes('cf-') || text.includes('error code')) return null;
        return text;
    } catch {
        return null;
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

function qualityFromLabel(label) {
    const m = (label || '').match(/\d+/);
    if (!m) return 360;
    const n = parseInt(m[0]);
    return n === 1080 ? 1080 : n === 720 ? 720 : n === 480 ? 480 : 360;
}

// Extrai o "root slug" de uma URL do AnimeFire.
// Ex: https://animefire.io/animes/spy-x-family-s3-dublado-todos-os-episodios
//   -> spy-x-family-s3-dublado
function extractRootSlug(animePageUrl) {
    const path = animePageUrl.replace(`${BASE_URL}/`, '').replace(/\/$/, '');
    // /animes/{slug}-todos-os-episodios  ou  /filmes/{slug}-todos-os-episodios
    const parts = path.split('/');
    if (parts.length < 2) return null;

    const fullSlug = parts[1]; // spy-x-family-s3-dublado-todos-os-episodios
    // Remover sufixo -todos-os-episodios
    return fullSlug.replace(/-todos-os-episodios$/i, '');
}

// ─── AniList: buscar titulo do anime via TMDB ────────────────────────────────

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

// ─── AnimeFire: buscar anime pelo titulo (via proxy) ─────────────────────────

async function searchAnimeFire(title) {
    const slug = titleToSlug(title);
    const url = `${BASE_URL}/pesquisar/${slug}`;

    const html = await proxyFetch(url, { headers: HEADERS });
    if (!html) return [];

    // Extrai URLs da pagina principal: /animes/{slug}-todos-os-episodios
    const links = [];
    const regex = /href="(https?:\/\/animefire\.io\/(?:animes|filmes)\/([^"?#]+)\/?\??)"/g;
    let m;
    while ((m = regex.exec(html)) !== null) {
        const fullUrl = m[1].replace(/\/$/, '');
        const slugPart = m[2];
        // Pega apenas os links principais (contem -todos-os-episodios)
        if (slugPart.toLowerCase().includes('todos-os-episodios') && !links.find(l => l.url === fullUrl)) {
            links.push({ url: fullUrl, rootSlug: extractRootSlug(fullUrl) });
        }
    }
    return links;
}

// ─── Extrator Lightspeed: chama API /video/ via proxy ────────────────────────

async function extractLightspeedStreams(rootSlug, episodeNum, refererUrl) {
    if (!rootSlug || !episodeNum) return [];

    const timestamp = Math.floor(Date.now() / 1000);
    const xhrUrl = `${BASE_URL}/video/${rootSlug}/${episodeNum}?tempsubs=0&${timestamp}`;

    const text = await proxyFetch(xhrUrl, {
        headers: { ...HEADERS, 'X-Requested-With': 'XMLHttpRequest' }
    });
    if (!text) return [];

    let json;
    try {
        json = JSON.parse(text);
    } catch {
        return [];
    }

    const data = json?.data || [];

    return data
        .filter(item => item.src)
        .map(item => ({
            url: item.src,
            name: `AnimeFire ${item.label || '360p'}`,
            title: `EP ${episodeNum}`,
            quality: qualityFromLabel(item.label),
            type: (item.src && item.src.includes('.m3u8')) ? 'hls' : 'mp4',
            headers: {
                'Referer': refererUrl || BASE_URL,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }));
}

// ─── getStreams: ponto de entrada principal ───────────────────────────────────

async function getStreams(tmdbId, mediaType, season, episode) {
    const targetSeason = mediaType === 'movie' ? 1 : season;
    const targetEpisode = mediaType === 'movie' ? 1 : episode;

    try {
        const titles = await getAniListTitles(tmdbId, mediaType);
        if (!titles.length) return [];

        for (const titleInfo of titles) {
            const animeLinks = await searchAnimeFire(titleInfo.name);
            if (!animeLinks.length) continue;

            // Primeiro link = mais relevante
            const { rootSlug } = animeLinks[0];

            if (mediaType === 'movie') {
                const streams = await extractLightspeedStreams(rootSlug, 1, `${BASE_URL}/filmes/`);
                if (streams.length) return streams.sort((a, b) => b.quality - a.quality);
            } else {
                const streams = await extractLightspeedStreams(rootSlug, targetEpisode, `${BASE_URL}/animes/`);
                if (streams.length) return streams.sort((a, b) => b.quality - a.quality);
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
