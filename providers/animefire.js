const TMDB_API_KEY = 'b64d2f3a4212a99d64a7d4485faed7b3';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const ANIMES_ONLINE_URL = 'https://animesonlinecc.to';

const HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
};

function titleToSlug(title) {
    if (!title) return '';
    return title.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

async function getTMDBInfo(tmdbId) {
    const url = `${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=pt-BR`;
    try {
        const response = await fetch(url);
        return await response.json();
    } catch { return null; }
}

async function getStreams(tmdbId, mediaType, season, episode) {
    if (mediaType !== 'tv') return [];

    try {
        const info = await getTMDBInfo(tmdbId);
        if (!info) return [];

        const slug = titleToSlug(info.name);
        
        // Padrão do AnimesOnlineCC: /episodio/nome-do-anime-temporada-X-episodio-Y
        const variations = [
            `${ANIMES_ONLINE_URL}/episodio/${slug}-temporada-${season}-episodio-${episode}`,
            `${ANIMES_ONLINE_URL}/episodio/${slug}-episodio-${episode}`,
            `${ANIMES_ONLINE_URL}/episodio/${titleToSlug(info.original_name)}-episodio-${episode}`
        ];

        for (const url of variations) {
            try {
                const response = await fetch(url, { headers: HEADERS });
                if (!response.ok) continue;

                const html = await response.text();

                // 1. Tenta achar links do Blogger (Google Video)
                // Eles geralmente estão dentro de iframes ou variáveis 'file'
                const googleVideoMatch = html.match(/"file":"(https:\/\/[^"]+googlevideo\.com[^"]+)"/);
                
                if (googleVideoMatch) {
                    let videoUrl = googleVideoMatch[1].replace(/\\/g, '');
                    return [{
                        url: videoUrl,
                        name: "AnimesOnline (Google)",
                        quality: 720,
                        type: "mp4",
                        headers: {
                            'User-Agent': HEADERS['User-Agent'],
                            'Referer': url
                        }
                    }];
                }

                // 2. Tenta achar links de m3u8 (HLS) se existirem
                const m3u8Match = html.match(/file":\s*"(https:[^"]+\.m3u8[^"]*)"/);
                if (m3u8Match) {
                    return [{
                        url: m3u8Match[1].replace(/\\/g, ''),
                        name: "AnimesOnline (HLS)",
                        quality: 720,
                        type: "hls",
                        headers: {
                            'User-Agent': HEADERS['User-Agent'],
                            'Referer': url
                        }
                    }];
                }
            } catch (e) { continue; }
        }
    } catch (e) { console.error(e); }
    return [];
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
