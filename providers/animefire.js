const TMDB_API_KEY = 'b64d2f3a4212a99d64a7d4485faed7b3';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const GOYABU_URL = 'https://goyabu.com';

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
        const epPadded = episode.toString().padStart(2, '0');
        
        // No Goyabu, a URL geralmente segue este padrão simples:
        // goyabu.com/anime-nome-episodio-01
        const variations = [
            `${GOYABU_URL}/${slug}-episodio-${epPadded}`,
            `${GOYABU_URL}/${slug}-temporada-${season}-episodio-${epPadded}`
        ];

        for (const url of variations) {
            const response = await fetch(url);
            if (!response.ok) continue;

            const html = await response.text();
            
            // O Goyabu costuma esconder o vídeo em tags <source> ou scripts simples
            const videoMatch = html.match(/file":\s*"([^"]+)"/) || html.match(/<source src="([^"]+)"/);
            
            if (videoMatch) {
                return [{
                    url: videoMatch[1].replace(/\\/g, ''),
                    name: "Goyabu Player",
                    quality: 720,
                    type: videoMatch[1].includes('m3u8') ? 'hls' : 'mp4'
                }];
            }
        }
    } catch (e) { console.error(e); }
    return [];
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
