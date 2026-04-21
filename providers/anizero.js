var __defProp = Object.defineProperty;
var __defProps = Object.defineProperties;
var __getOwnPropDescs = Object.getOwnPropertyDescriptors;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
var __spreadProps = (a, b) => __defProps(a, __getOwnPropDescs(b));
var __async = (__this, __arguments, generator) => {
  return new Promise((resolve, reject) => {
    var fulfilled = (value) => {
      try {
        step(generator.next(value));
      } catch (e) {
        reject(e);
      }
    };
    var rejected = (value) => {
      try {
        step(generator.throw(value));
      } catch (e) {
        reject(e);
      }
    };
    var step = (x) => x.done ? resolve(x.value) : Promise.resolve(x.value).then(fulfilled, rejected);
    step((generator = generator.apply(__this, __arguments)).next());
  });
};
const TMDB_API_KEY = "b64d2f3a4212a99d64a7d4485faed7b3";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const ANIZERO_BASE = "https://anizero.org";
const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
  "Referer": "https://anizero.org/"
};
const CACHE = {};
function titleToSlug(title) {
  if (!title) return "";
  return title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
function sleep(ms) {
  return __async(this, null, function* () {
    return new Promise((resolve) => setTimeout(resolve, ms));
  });
}
function getTMDBInfo(tmdbId, mediaType) {
  return __async(this, null, function* () {
    const cacheKey = `tmdb_${tmdbId}_${mediaType}`;
    if (CACHE[cacheKey]) return CACHE[cacheKey];
    try {
      const endpoint = mediaType === "tv" ? "tv" : "movie";
      const ptRes = yield fetch(
        `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=pt-BR`
      );
      const ptData = yield ptRes.json();
      const ptTitle = mediaType === "tv" ? ptData.name : ptData.title;
      const origTitle = mediaType === "tv" ? ptData.original_name : ptData.original_title;
      const enRes = yield fetch(
        `${TMDB_BASE_URL}/${endpoint}/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US`
      );
      const enData = yield enRes.json();
      const enTitle = mediaType === "tv" ? enData.name : enData.title;
      let seasons = [];
      if (mediaType === "tv") {
        const seasonRes = yield fetch(
          `${TMDB_BASE_URL}/tv/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=seasons`
        );
        const seasonData = yield seasonRes.json();
        seasons = (seasonData.seasons || []).filter((s) => s.season_number > 0);
      }
      const result = { ptTitle, origTitle, enTitle, seasons };
      CACHE[cacheKey] = result;
      return result;
    } catch (e) {
      return null;
    }
  });
}
function getAniListTitles(searchTitle) {
  return __async(this, null, function* () {
    var _a, _b, _c;
    if (!searchTitle) return [];
    const cacheKey = `anilist_${searchTitle}`;
    if (CACHE[cacheKey]) return CACHE[cacheKey];
    try {
      const query = `
            query ($search: String) {
                Media(search: $search, type: ANIME) {
                    title { romaji english }
                    synonyms
                }
            }
        `;
      const res = yield fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables: { search: searchTitle } })
      });
      const data = yield res.json();
      const media = (_a = data == null ? void 0 : data.data) == null ? void 0 : _a.Media;
      if (!media) return [];
      const titles = [];
      if ((_b = media.title) == null ? void 0 : _b.romaji) titles.push(media.title.romaji);
      if (((_c = media.title) == null ? void 0 : _c.english) && media.title.english !== media.title.romaji) {
        titles.push(media.title.english);
      }
      if (media.synonyms) {
        for (const syn of media.synonyms) {
          if (syn && syn.length > 2 && syn.length < 80 && /^[a-zA-Z0-9\s\-:!?.']+$/.test(syn)) {
            titles.push(syn);
          }
        }
      }
      CACHE[cacheKey] = titles;
      return titles;
    } catch (e) {
      return [];
    }
  });
}
function fetchAnizeroSearch(query) {
  return __async(this, null, function* () {
    try {
      const url = `${ANIZERO_BASE}/?s=${encodeURIComponent(query)}`;
      const res = yield fetch(url, { headers: HEADERS });
      if (!res.ok) return "";
      return yield res.text();
    } catch (e) {
      return "";
    }
  });
}
function extractVideoLinks(html) {
  const ids = [];
  const seen = /* @__PURE__ */ new Set();
  const regex = /href="(?:https?:\/\/anizero\.org)?\/video\/(\d+)\/"/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      ids.push(m[1]);
    }
  }
  return ids;
}
function extractAnimeLinks(html) {
  const links = [];
  const seen = /* @__PURE__ */ new Set();
  const regex = /href="(https?:\/\/anizero\.org\/anime\/([^/"]+)\/?)"/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const url = m[1].endsWith("/") ? m[1] : m[1] + "/";
    if (!seen.has(url)) {
      seen.add(url);
      links.push(url);
    }
  }
  return links;
}
function getFirstEpisodeId(animeTitle) {
  return __async(this, null, function* () {
    const queries = [
      `${animeTitle} epis\xF3dio 1`,
      `${animeTitle} episodio 1`,
      `${animeTitle} ep 1`,
      animeTitle
    ];
    for (const q of queries) {
      yield sleep(300);
      const html = yield fetchAnizeroSearch(q);
      if (!html) continue;
      const videoIds = extractVideoLinks(html);
      if (videoIds.length > 0) {
        for (const id of videoIds.slice(0, 3)) {
          const epNum = yield getEpisodeNumber(id);
          if (epNum === 1) return parseInt(id);
        }
      }
    }
    return null;
  });
}
function getEpisodeNumber(videoId) {
  return __async(this, null, function* () {
    try {
      const res = yield fetch(`${ANIZERO_BASE}/video/${videoId}/`, { headers: HEADERS });
      const html = yield res.text();
      const m = html.match(/Epis[oó]dio\s+(\d+)/i);
      if (m) return parseInt(m[1]);
      const bc = html.match(/>\s*0*(\d+)\s*<\/a>\s*<\/li>\s*<\/ol>/i);
      if (bc) return parseInt(bc[1]);
    } catch (e) {
    }
    return null;
  });
}
function findVideoId(title, episodeNumber) {
  return __async(this, null, function* () {
    const padded = String(episodeNumber).padStart(2, "0");
    const searchQueries = [
      `${title} epis\xF3dio ${episodeNumber}`,
      `${title} episodio ${episodeNumber}`,
      `${title} ${padded}`,
      `${title} ep ${episodeNumber}`
    ];
    for (const q of searchQueries) {
      yield sleep(200);
      const html = yield fetchAnizeroSearch(q);
      if (!html) continue;
      const ids = extractVideoLinks(html);
      if (ids.length === 0) continue;
      for (const id of ids.slice(0, 5)) {
        const num = yield getEpisodeNumber(id);
        if (num === episodeNumber) return id;
      }
      if (ids.length > 0) return ids[0];
    }
    const ep1Id = yield getFirstEpisodeId(title);
    if (ep1Id) {
      const targetId = ep1Id + (episodeNumber - 1);
      const epNum = yield getEpisodeNumber(String(targetId));
      if (epNum === episodeNumber) return String(targetId);
    }
    return null;
  });
}
function extractStream(videoId, referer) {
  return __async(this, null, function* () {
    var _a, _b;
    try {
      const pageUrl = `${ANIZERO_BASE}/video/${videoId}/`;
      const res = yield fetch(pageUrl, { headers: HEADERS });
      const html = yield res.text();
      const m3u8Patterns = [
        // jwplayer setup
        new RegExp(`jwplayer\\s*\\([^)]*\\)\\s*\\.setup\\s*\\(\\s*\\{[^}]{0,500}["']file["']\\s*:\\s*["'](https?:\\/\\/[^"']+\\.m3u8[^"']*)['"]`, "is"),
        // file: "url"
        /["']file["']\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/i,
        // source: "url"  
        /["']source["']\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/i,
        // src: "url"
        /["']src["']\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/i,
        // url: "url"
        /["']url["']\s*:\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/i,
        // videoUrl = "..."  
        /(?:var|let|const)\s+\w*[Vv]ideo[Uu]rl\w*\s*=\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/i,
        // playerSrc = "..."
        /(?:var|let|const)\s+\w*[Ss]rc\w*\s*=\s*["'](https?:\/\/[^"']+\.m3u8[^"']*)['"]/i,
        // Generic m3u8 URL in any string literal
        /["'`](https?:\/\/[^"'`\s]{10,}\.m3u8(?:[^"'`\s]*)?)['"` ]/
      ];
      for (const pattern of m3u8Patterns) {
        const m = html.match(pattern);
        if (m && m[1]) {
          return { url: m[1], type: "hls" };
        }
      }
      const mp4Patterns = [
        /["']file["']\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)['"]/i,
        /["']src["']\s*:\s*["'](https?:\/\/[^"']+\.mp4[^"']*)['"]/i,
        /["'`](https?:\/\/[^"'`\s]{10,}\.mp4(?:[^"'`\s]*)?)['"` ]/
      ];
      for (const pattern of mp4Patterns) {
        const m = html.match(pattern);
        if (m && m[1]) {
          return { url: m[1], type: "mp4" };
        }
      }
      const iframeMatch = html.match(/<iframe[^>]+src\s*=\s*["']([^"']+)['"]/i);
      if (iframeMatch && iframeMatch[1]) {
        const iframeUrl = iframeMatch[1].startsWith("//") ? "https:" + iframeMatch[1] : iframeMatch[1];
        if (!iframeUrl.includes("facebook") && !iframeUrl.includes("youtube")) {
          try {
            const iframeRes = yield fetch(iframeUrl, {
              headers: __spreadProps(__spreadValues({}, HEADERS), { Referer: pageUrl })
            });
            const iframeHtml = yield iframeRes.text();
            for (const p of m3u8Patterns) {
              const m = iframeHtml.match(p);
              if (m && m[1]) return { url: m[1], type: "hls" };
            }
            for (const p of mp4Patterns) {
              const m = iframeHtml.match(p);
              if (m && m[1]) return { url: m[1], type: "mp4" };
            }
            const deepIframe = iframeHtml.match(/<iframe[^>]+src\s*=\s*["']([^"']+)['"]/i);
            if (deepIframe && deepIframe[1]) {
              const deepUrl = deepIframe[1].startsWith("//") ? "https:" + deepIframe[1] : deepIframe[1];
              const deepRes = yield fetch(deepUrl, {
                headers: __spreadProps(__spreadValues({}, HEADERS), { Referer: iframeUrl })
              });
              const deepHtml = yield deepRes.text();
              for (const p of m3u8Patterns) {
                const m = deepHtml.match(p);
                if (m && m[1]) return { url: m[1], type: "hls" };
              }
              for (const p of mp4Patterns) {
                const m = deepHtml.match(p);
                if (m && m[1]) return { url: m[1], type: "mp4" };
              }
            }
          } catch (e) {
          }
        }
      }
      const postIdMatch = html.match(/["']post_id["']\s*:\s*(\d+)/i) || html.match(/var\s+postId\s*=\s*(\d+)/i) || html.match(/data-post-id\s*=\s*["'](\d+)['"]/i);
      const nonceMatch = html.match(/["']nonce["']\s*:\s*["']([a-f0-9]+)['"]/i) || html.match(/var\s+nonce\s*=\s*["']([a-f0-9]+)['"]/i);
      const actionMatch = html.match(/["']action["']\s*:\s*["']([^"']+)['"]/i);
      if (postIdMatch && nonceMatch) {
        try {
          const ajaxData = new URLSearchParams({
            action: actionMatch ? actionMatch[1] : "get_video",
            post_id: postIdMatch[1],
            nonce: nonceMatch[1]
          });
          const ajaxRes = yield fetch(`${ANIZERO_BASE}/wp-admin/admin-ajax.php`, {
            method: "POST",
            headers: __spreadProps(__spreadValues({}, HEADERS), {
              "Content-Type": "application/x-www-form-urlencoded",
              "X-Requested-With": "XMLHttpRequest"
            }),
            body: ajaxData.toString()
          });
          const ajaxText = yield ajaxRes.text();
          try {
            const ajaxJson = JSON.parse(ajaxText);
            const streamUrl = ((_a = ajaxJson == null ? void 0 : ajaxJson.data) == null ? void 0 : _a.url) || (ajaxJson == null ? void 0 : ajaxJson.url) || ((_b = ajaxJson == null ? void 0 : ajaxJson.data) == null ? void 0 : _b.file) || (ajaxJson == null ? void 0 : ajaxJson.file);
            if (streamUrl) {
              return {
                url: streamUrl,
                type: streamUrl.includes(".m3u8") ? "hls" : "mp4"
              };
            }
          } catch (e) {
          }
          for (const p of m3u8Patterns) {
            const m = ajaxText.match(p);
            if (m && m[1]) return { url: m[1], type: "hls" };
          }
        } catch (e) {
        }
      }
      return null;
    } catch (e) {
      return null;
    }
  });
}
function getStreams(tmdbId, mediaType, season, episode) {
  return __async(this, null, function* () {
    const targetSeason = mediaType === "movie" ? 1 : season;
    const targetEpisode = mediaType === "movie" ? 1 : episode;
    try {
      const info = yield getTMDBInfo(tmdbId, mediaType);
      if (!info) return [];
      const { ptTitle, origTitle, enTitle, seasons } = info;
      let absoluteEpisode = targetEpisode;
      if (mediaType === "tv" && targetSeason > 1 && seasons.length > 0) {
        let totalBefore = 0;
        for (const s of seasons) {
          if (s.season_number > 0 && s.season_number < targetSeason) {
            totalBefore += s.episode_count || 0;
          }
        }
        if (totalBefore > 0) absoluteEpisode = totalBefore + targetEpisode;
      }
      const titlesToTry = [];
      if (ptTitle) titlesToTry.push(ptTitle);
      if (origTitle && origTitle !== ptTitle) titlesToTry.push(origTitle);
      if (enTitle && enTitle !== ptTitle && enTitle !== origTitle) titlesToTry.push(enTitle);
      if (mediaType === "tv") {
        const anilistSearch = enTitle || origTitle || ptTitle;
        const anilistTitles = yield getAniListTitles(anilistSearch);
        for (const t of anilistTitles) {
          if (!titlesToTry.some((x) => x.toLowerCase() === t.toLowerCase())) {
            titlesToTry.push(t);
          }
        }
      }
      const streams = [];
      for (const title of titlesToTry.slice(0, 5)) {
        let videoId = yield findVideoId(title, absoluteEpisode);
        if (!videoId && absoluteEpisode !== targetEpisode) {
          yield sleep(300);
          videoId = yield findVideoId(title, targetEpisode);
        }
        if (!videoId) continue;
        const streamInfo = yield extractStream(videoId, `${ANIZERO_BASE}/`);
        if (!streamInfo) continue;
        const streamName = streamInfo.type === "hls" ? "Anizero Legendado HD" : "Anizero Legendado";
        streams.push({
          url: streamInfo.url,
          headers: {
            "Referer": `${ANIZERO_BASE}/`,
            "User-Agent": HEADERS["User-Agent"]
          },
          name: streamName,
          title: mediaType === "tv" ? `${ptTitle || title} S${targetSeason} EP${targetEpisode}` : ptTitle || title,
          quality: 1080,
          type: streamInfo.type
        });
        break;
      }
      if (streams.length === 0 || true) {
        for (const title of titlesToTry.slice(0, 3)) {
          const dubTitle = `${title} Dublado`;
          let videoId = yield findVideoId(dubTitle, absoluteEpisode);
          if (!videoId && absoluteEpisode !== targetEpisode) {
            yield sleep(200);
            videoId = yield findVideoId(dubTitle, targetEpisode);
          }
          if (!videoId) continue;
          const streamInfo = yield extractStream(videoId, `${ANIZERO_BASE}/`);
          if (!streamInfo) continue;
          streams.push({
            url: streamInfo.url,
            headers: {
              "Referer": `${ANIZERO_BASE}/`,
              "User-Agent": HEADERS["User-Agent"]
            },
            name: "Anizero Dublado HD",
            title: mediaType === "tv" ? `${ptTitle || title} Dublado S${targetSeason} EP${targetEpisode}` : `${ptTitle || title} Dublado`,
            quality: 1080,
            type: streamInfo.type
          });
          break;
        }
      }
      return streams;
    } catch (e) {
      return [];
    }
  });
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}
