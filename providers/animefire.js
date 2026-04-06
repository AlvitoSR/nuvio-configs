const TMDB_API_KEY = 'b64d2f3a4212a99d64a7d4485faed7b3';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';

// CDN direto do AnimeFire (sem Cloudflare)
const LIGHTSPEED_SERVERS = ['lightspeedst.net'];

function titleToSlug(title) {
    if (!title) return '';
    return title.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
}

async function testUrl(url) {
    try {
        const response = await fetch(url, {
            method: 'HEAD',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://animefire.io/'
            }
        });
        return response.ok || response.status === 206;
    } catch {
        return false;
    }
}

async function getTMDBTitle(tmdbId, mediaType) {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const url = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.json();
        return mediaType === 'tv' ? data.name : data.title;
    } catch {
        return null;
    }
}

async function getAniListTitles(tmdbId, mediaType) {
    const endpoint = mediaType === 'tv' ? 'tv' : 'movie';
    const tmdbUrl = `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`;

    const tmdbResponse = await fetch(tmdbUrl);
    if (!tmdbResponse.ok) return [];
    const tmdbData = await tmdbResponse.json();
    const searchTitle = mediaType === 'tv' ? tmdbData.name : tmdbData.title;

    const query = `
        query ($search: String) {
            Media(search: $search, type: ANIME) {
                title { romaji english }
                synonyms
            }
        }`;

    const anilistResponse = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { search: searchTitle } })
    });

    if (!anilistResponse.ok) return [{ name: searchTitle, type: 'tmdb' }];
    const anilistData = await anilistResponse.json();
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

function generateSlugVariations(baseTitle, season) {
    const baseSlug = titleToSlug(baseTitle);
    const variations = [];
    const seen = {};

    function add(slug) {
        if (!seen[slug]) {
            seen[slug] = true;
            variations.push(slug);
        }
    }

    add(baseSlug);

    // Season suffix for season > 1
    if (season > 1) {
        add(baseSlug + '-' + season);
        add(baseSlug + '-season-' + season);
        add(baseSlug + '-s' + season);
    }

    // Reduced slugs for long titles
    const words = baseSlug.split('-');
    if (words.length > 3) {
        for (let i = 3; i < words.length; i++) {
            const reduced = words.slice(0, i).join('-');
            add(reduced);
            if (season > 1) {
                add(reduced + '-' + season);
            }
        }
    }

    return variations;
}

async function getStreams(tmdbId, mediaType, season, episode) {
    const targetSeason = mediaType === 'movie' ? 1 : season;
    const targetEpisode = mediaType === 'movie' ? 1 : episode;
    const epNum = targetEpisode.toString();

    // Try TMDB title + AniList titles
    const tmdbTitle = await getTMDBTitle(tmdbId, mediaType);
    const titles = await getAniListTitles(tmdbId, mediaType);

    const allNames = [];
    if (tmdbTitle && !allNames.some(t => t.toLowerCase() === tmdbTitle.toLowerCase())) {
        allNames.push(tmdbTitle);
    }
    for (const t of titles) {
        if (!allNames.some(existing => existing.toLowerCase() === t.name.toLowerCase())) {
            allNames.push(t.name);
        }
    }

    const streams = [];
    const seenUrls = new Set();

    for (const titleName of allNames) {
        const slugVariations = generateSlugVariations(titleName, targetSeason);

        for (const slug of slugVariations) {
            for (const server of LIGHTSPEED_SERVERS) {
                // Quality levels — matches lightspeedst.net folder structure
                const qualities = [
                    { folder: 'hd', label: '720p', quality: 720 },
                    { folder: 'sd', label: '360p', quality: 360 }
                ];

                for (const q of qualities) {
                    const url = `https://${server}/s1/mp4/${slug}/${q.folder}/${epNum}.mp4`;

                    if (seenUrls.has(url)) continue;

                    if (await testUrl(url)) {
                        seenUrls.add(url);
                        streams.push({
                            url: url,
                            name: `AnimeFire ${q.label}`,
                            title: `${titleName} S${targetSeason} EP${targetEpisode}`,
                            quality: q.quality,
                            type: 'mp4',
                            headers: {
                                'Referer': 'https://animefire.io/',
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                                'Range': 'bytes=0-'
                            }
                        });
                    }
                }

                // Stop if we already found streams for this slug
                if (streams.length > 0) break;
            }

            if (streams.length > 0) break;
        }

        if (streams.length > 0) break;
    }

    return streams.sort((a, b) => b.quality - a.quality);
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { getStreams };
} else {
    global.getStreams = getStreams;
}
