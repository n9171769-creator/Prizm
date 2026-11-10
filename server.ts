import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

function getAiClient(customApiKey?: string): GoogleGenAI {
  const apiKey = (customApiKey && customApiKey.trim()) || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Gemini API Key is not configured. Please check Settings > Secrets.");
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function generateContentWithFallback(ai: GoogleGenAI, contents: any, config: any) {
  const models = ["gemini-3.8-flash", "gemini-flash-latest"];
  let lastError: any = null;

  for (const model of models) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config,
      });
      return response;
    } catch (e: any) {
      console.warn(`Model ${model} attempt failed:`, e.message || e);
      lastError = e;
    }
  }
  throw lastError || new Error("All Gemini models failed to generate content.");
}

function formatSecondsToTimestamp(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(secs / 3600);
  const mins = Math.floor((secs % 3600) / 60);
  const rem = secs % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(rem).padStart(2, "0")}`;
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

// Helper: Classify URL and extract YouTube ID or Instagram Shortcode
function classifyUrl(rawUrl: string): {
  type: "youtube" | "reel" | "url";
  platform: string;
  youtubeId?: string;
  instagramShortcode?: string;
} {
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.toLowerCase();
    const pathname = u.pathname;

    // YouTube Video / Shorts
    if (host.includes("youtube.com") || host.includes("youtu.be")) {
      let videoId = "";
      if (host.includes("youtu.be")) {
        videoId = pathname.slice(1).split("/")[0];
      } else if (pathname.startsWith("/shorts/")) {
        videoId = pathname.split("/shorts/")[1]?.split("/")[0] || "";
        return { type: "reel", platform: "YouTube Shorts", youtubeId: videoId };
      } else if (pathname.startsWith("/embed/")) {
        videoId = pathname.split("/embed/")[1]?.split("/")[0] || "";
      } else {
        videoId = u.searchParams.get("v") || "";
      }
      return { type: "youtube", platform: "YouTube Video", youtubeId: videoId || undefined };
    }

    // Instagram Reel / Post
    if (host.includes("instagram.com")) {
      const reelMatch = pathname.match(/\/(?:reel|reels|p)\/([A-Za-z0-9_-]+)/i);
      const shortcode = reelMatch?.[1] || undefined;
      if (pathname.includes("/reel/") || pathname.includes("/reels/")) {
        return { type: "reel", platform: "Instagram Reel", instagramShortcode: shortcode };
      }
      return { type: "reel", platform: "Instagram Post", instagramShortcode: shortcode };
    }

    // TikTok
    if (host.includes("tiktok.com")) {
      return { type: "reel", platform: "TikTok Video" };
    }

    // Facebook Reel / Watch
    if (host.includes("facebook.com") || host.includes("fb.watch")) {
      if (pathname.includes("/reel/") || host.includes("fb.watch") || pathname.includes("/watch")) {
        return { type: "reel", platform: "Facebook Reel / Video" };
      }
      return { type: "url", platform: "Facebook Post" };
    }

    // X / Twitter
    if (host.includes("x.com") || host.includes("twitter.com")) {
      return { type: "reel", platform: "X / Twitter Post" };
    }

    // Vimeo / Loom
    if (host.includes("vimeo.com") || host.includes("loom.com")) {
      return { type: "youtube", platform: host.includes("vimeo") ? "Vimeo Video" : "Loom Video" };
    }

    return { type: "url", platform: u.hostname.replace(/^www\./, "") };
  } catch {
    return { type: "url", platform: "Web Resource" };
  }
}

// Helper: Extract exact timestamped YouTube transcript via Innertube ANDROID Player API + JSON3/XML Captions
async function fetchYoutubeExactTranscript(
  videoId: string,
  watchHtml?: string
): Promise<{
  segments: { timestamp: string; seconds: number; text: string }[];
  fullTranscript: string;
  title?: string;
  author?: string;
  duration?: string;
  shortDescription?: string;
}> {
  const segments: { timestamp: string; seconds: number; text: string }[] = [];
  let title = "";
  let author = "";
  let duration = "";
  let shortDescription = "";

  try {
    let html = watchHtml || "";
    if (!html) {
      const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=en`, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(8000),
      });
      if (pageRes.ok) {
        html = await pageRes.text();
      }
    }

    // 1. Try Innertube ANDROID Player API (most reliable way to get captionTracks without age/cookie blocks)
    const apiKeyMatch = html.match(/"INNERTUBE_API_KEY":"([^"]+)"/);
    const innertubeKey = apiKeyMatch?.[1] || "";

    let captionTracks: any[] = [];

    if (innertubeKey) {
      try {
        const playerRes = await fetch(
          `https://www.youtube.com/youtubei/v1/player?key=${innertubeKey}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 14)",
            },
            body: JSON.stringify({
              context: {
                client: {
                  clientName: "ANDROID",
                  clientVersion: "20.10.38",
                  hl: "en",
                  gl: "US",
                },
              },
              videoId,
            }),
            signal: AbortSignal.timeout(7000),
          }
        );

        if (playerRes.ok) {
          const playerData = await playerRes.json();
          const vd = playerData?.videoDetails;
          if (vd) {
            title = vd.title || title;
            author = vd.author || author;
            shortDescription = vd.shortDescription || shortDescription;
            if (vd.lengthSeconds) {
              const s = parseInt(vd.lengthSeconds, 10);
              if (s > 0) duration = `${Math.floor(s / 60)}m ${s % 60}s`;
            }
          }
          captionTracks =
            playerData?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        }
      } catch (e) {
        console.warn("Innertube player fetch notice:", (e as any)?.message);
      }
    }

    // 2. Fallback: Extract captionTracks from watch page HTML if Innertube didn't return them
    if (captionTracks.length === 0 && html) {
      const tracksMatch = html.match(/"captionTracks":(\[[\s\S]*?\])/);
      if (tracksMatch && tracksMatch[1]) {
        try {
          captionTracks = JSON.parse(tracksMatch[1]);
        } catch {
          // ignore
        }
      }
    }

    // 3. Download and parse the selected caption track (prefer English, else first track)
    if (captionTracks.length > 0) {
      const selectedTrack =
        captionTracks.find((t: any) => t.languageCode === "en" && !t.kind) ||
        captionTracks.find((t: any) => t.languageCode?.startsWith("en")) ||
        captionTracks[0];

      const baseUrl = selectedTrack?.baseUrl?.replace(/\\u0026/g, "&");
      if (baseUrl) {
        // First try JSON3 format
        try {
          const json3Url = baseUrl.includes("fmt=")
            ? baseUrl.replace(/fmt=[^&]+/, "fmt=json3")
            : `${baseUrl}&fmt=json3`;
          const capRes = await fetch(json3Url, { signal: AbortSignal.timeout(6000) });
          if (capRes.ok) {
            const capText = await capRes.text();
            if (capText.trim().startsWith("{")) {
              const capJson = JSON.parse(capText);
              const events = capJson.events || [];
              for (const ev of events) {
                if (!ev.segs) continue;
                const lineText = decodeHtmlEntities(
                  ev.segs.map((s: any) => s.utf8 || "").join("")
                );
                if (lineText) {
                  const sec = Math.floor((ev.tStartMs || 0) / 1000);
                  segments.push({
                    timestamp: formatSecondsToTimestamp(sec),
                    seconds: sec,
                    text: lineText,
                  });
                }
              }
            }
          }
        } catch {
          // fallback to XML below
        }

        // Fallback to XML caption parsing
        if (segments.length === 0) {
          try {
            const xmlRes = await fetch(baseUrl, { signal: AbortSignal.timeout(6000) });
            if (xmlRes.ok) {
              const xml = await xmlRes.text();
              const textRegex = /<text[^>]*start=["']([\d.]+)["'][^>]*>([\s\S]*?)<\/text>/gi;
              let match;
              while ((match = textRegex.exec(xml)) !== null) {
                const sec = Math.floor(parseFloat(match[1] || "0"));
                const cleanLine = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, " "));
                if (cleanLine) {
                  segments.push({
                    timestamp: formatSecondsToTimestamp(sec),
                    seconds: sec,
                    text: cleanLine,
                  });
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }
  } catch (err) {
    console.warn("YouTube exact transcript helper notice:", (err as any)?.message);
  }

  const fullTranscript = segments
    .map((seg) => `[${seg.timestamp}] ${seg.text}`)
    .join("\n");

  return {
    segments,
    fullTranscript,
    title,
    author,
    duration,
    shortDescription,
  };
}

// Helper: Extract Instagram Reel / Post embedded caption & metadata via /embed/captioned/
async function fetchInstagramReelData(shortcode: string): Promise<{
  caption: string;
  author: string;
  thumbnailUrl: string;
}> {
  let caption = "";
  let author = "";
  let thumbnailUrl = "";

  try {
    const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
    const res = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
      signal: AbortSignal.timeout(7000),
    });

    if (res.ok) {
      const html = await res.text();
      const userMatch =
        html.match(/class=["']UsernameText["'][^>]*>([^<]+)</i) ||
        html.match(/"username":"([^"]+)"/i);
      if (userMatch?.[1]) author = decodeHtmlEntities(userMatch[1]);

      const captionMatch = html.match(/class=["']Caption["'][^>]*>([\s\S]*?)<\/div>/i);
      if (captionMatch?.[1]) {
        caption = decodeHtmlEntities(
          captionMatch[1]
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<[^>]+>/g, " ")
        );
      }

      const imgMatch = html.match(/class=["']EmbeddedMediaImage["'][^>]+src=["']([^"']+)["']/i);
      if (imgMatch?.[1]) {
        thumbnailUrl = decodeHtmlEntities(imgMatch[1]);
      }
    }
  } catch {
    // ignore
  }

  return { caption, author, thumbnailUrl };
}

// Helper: Parse general HTML meta tags & JSON-LD
function parseHtmlMetadata(html: string) {
  const getMeta = (patterns: RegExp[]): string => {
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match && match[1]) {
        return decodeHtmlEntities(match[1]);
      }
    }
    return "";
  };

  const title = getMeta([
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)["']/i,
    /<title[^>]*>([^<]+)<\/title>/i,
  ]);

  const description = getMeta([
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']+)["']/i,
  ]);

  const image = getMeta([
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
  ]);

  const author = getMeta([
    /<meta[^>]+name=["']author["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+property=["']article:author["'][^>]+content=["']([^"']+)["']/i,
    /<link[^>]+itemprop=["']name["'][^>]+content=["']([^"']+)["']/i,
  ]);

  const publishedAt = getMeta([
    /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+itemprop=["']datePublished["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+name=["']publish-date["'][^>]+content=["']([^"']+)["']/i,
  ]);

  let ytShortDescription = "";
  const shortDescMatch = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
  if (shortDescMatch && shortDescMatch[1]) {
    try {
      ytShortDescription = JSON.parse(`"${shortDescMatch[1]}"`);
    } catch {
      ytShortDescription = shortDescMatch[1].replace(/\\n/g, "\n");
    }
  }

  let ytAuthor = "";
  const authorMatch =
    html.match(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/) ||
    html.match(/"author":"((?:[^"\\]|\\.)*)"/);
  if (authorMatch && authorMatch[1]) {
    ytAuthor = authorMatch[1];
  }

  let ytLengthSeconds = "";
  const lengthMatch = html.match(/"lengthSeconds":"(\d+)"/);
  if (lengthMatch && lengthMatch[1]) {
    const secs = parseInt(lengthMatch[1], 10);
    if (!isNaN(secs) && secs > 0) {
      ytLengthSeconds = `${Math.floor(secs / 60)}m ${secs % 60}s`;
    }
  }

  const jsonLdBlocks: string[] = [];
  const jsonLdRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch;
  while ((ldMatch = jsonLdRegex.exec(html)) !== null) {
    if (ldMatch[1]) {
      jsonLdBlocks.push(ldMatch[1].trim().slice(0, 4000));
    }
  }

  const cleanBody = html
    .replace(/<script[^>]*>([\s\S]*?)<\/script>/gi, " ")
    .replace(/<style[^>]*>([\s\S]*?)<\/style>/gi, " ")
    .replace(/<noscript[^>]*>([\s\S]*?)<\/noscript>/gi, " ")
    .replace(/<svg[^>]*>([\s\S]*?)<\/svg>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    title,
    description,
    image,
    author: ytAuthor || author,
    publishedAt,
    duration: ytLengthSeconds,
    ytShortDescription,
    jsonLd: jsonLdBlocks.join("\n"),
    cleanBody: cleanBody.slice(0, 45000),
  };
}

// 0. Check API Config Status
app.get("/api/config", (req, res) => {
  res.json({
    hasApiKey: !!process.env.GEMINI_API_KEY,
  });
});

// 1. Universal URL, YouTube Video, Instagram Reel & Webpage Exact Transcript + Metadata Summarizer
app.post("/api/fetch-url", async (req, res) => {
  const { url } = req.body;
  if (!url) {
    return res.status(400).json({ error: "URL is required" });
  }

  let formattedUrl = url.trim();
  if (!/^https?:\/\//i.test(formattedUrl)) {
    formattedUrl = "https://" + formattedUrl;
  }

  const classification = classifyUrl(formattedUrl);
  let oembedData: any = null;
  let parsedHtml: ReturnType<typeof parseHtmlMetadata> | null = null;
  let rawHtmlString = "";
  let transcriptSegments: { timestamp: string; seconds: number; text: string }[] = [];
  let exactTranscriptText = "";
  let instagramCaption = "";

  try {
    // Step 1: Fetch oEmbed metadata
    const oembedEndpoints = [
      `https://noembed.com/embed?url=${encodeURIComponent(formattedUrl)}`,
      classification.youtubeId
        ? `https://www.youtube.com/oembed?url=${encodeURIComponent(formattedUrl)}&format=json`
        : null,
    ].filter(Boolean) as string[];

    for (const ep of oembedEndpoints) {
      try {
        const oeRes = await fetch(ep, { signal: AbortSignal.timeout(6000) });
        if (oeRes.ok) {
          const json = await oeRes.json();
          if (json && (json.title || json.author_name)) {
            oembedData = json;
            break;
          }
        }
      } catch {
        // continue
      }
    }

    // Step 2: Fetch direct HTML
    try {
      const htmlRes = await fetch(formattedUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: AbortSignal.timeout(8500),
      });

      if (htmlRes.ok) {
        rawHtmlString = await htmlRes.text();
        parsedHtml = parseHtmlMetadata(rawHtmlString);
      }
    } catch (e) {
      console.warn("Direct HTML fetch notice:", (e as any)?.message);
    }

    // Step 3: If YouTube Video or YouTube Shorts, run Innertube Exact Transcript Extractor
    let ytMeta: Awaited<ReturnType<typeof fetchYoutubeExactTranscript>> | null = null;
    if (classification.youtubeId) {
      ytMeta = await fetchYoutubeExactTranscript(classification.youtubeId, rawHtmlString);
      if (ytMeta.segments.length > 0) {
        transcriptSegments = ytMeta.segments;
        exactTranscriptText = ytMeta.fullTranscript;
      }
    }

    // Step 4: If Instagram Reel / Post, run Instagram Embed Caption & Audio Extractor
    let igMeta: Awaited<ReturnType<typeof fetchInstagramReelData>> | null = null;
    if (classification.instagramShortcode) {
      igMeta = await fetchInstagramReelData(classification.instagramShortcode);
      if (igMeta.caption) {
        instagramCaption = igMeta.caption;
      }
    }

    const baseTitle =
      ytMeta?.title ||
      oembedData?.title ||
      parsedHtml?.title ||
      `${classification.platform} (${formattedUrl})`;
    const baseAuthor =
      ytMeta?.author ||
      igMeta?.author ||
      oembedData?.author_name ||
      parsedHtml?.author ||
      classification.platform;
    const baseThumbnail =
      oembedData?.thumbnail_url ||
      igMeta?.thumbnailUrl ||
      (classification.youtubeId
        ? `https://i.ytimg.com/vi/${classification.youtubeId}/hqdefault.jpg`
        : parsedHtml?.image || "");
    const baseDuration = ytMeta?.duration || parsedHtml?.duration || "";
    const basePublishedAt = parsedHtml?.publishedAt || "";

    const rawContextPieces = [
      `URL: ${formattedUrl}`,
      `Platform: ${classification.platform}`,
      `Title: ${baseTitle}`,
      `Author / Creator: ${baseAuthor}`,
      baseDuration ? `Duration: ${baseDuration}` : "",
      basePublishedAt ? `Published Date: ${basePublishedAt}` : "",
      parsedHtml?.description ? `Meta Description: ${parsedHtml.description}` : "",
      ytMeta?.shortDescription || parsedHtml?.ytShortDescription
        ? `Full Video/Reel Description:\n${ytMeta?.shortDescription || parsedHtml?.ytShortDescription}`
        : "",
      instagramCaption ? `Instagram Reel Caption & Script:\n${instagramCaption}` : "",
      exactTranscriptText
        ? `Exact Verbatim Timestamped Transcript:\n${exactTranscriptText.slice(0, 35000)}`
        : "",
      parsedHtml?.jsonLd ? `Structured Metadata (JSON-LD):\n${parsedHtml.jsonLd.slice(0, 4000)}` : "",
      parsedHtml?.cleanBody && classification.type === "url"
        ? `Extracted Page Body Text:\n${parsedHtml.cleanBody.slice(0, 30000)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    // Step 5: Use Gemini 3.8 Flash with urlContext + googleSearch grounding to enrich metadata, summarize, AND reconstruct/verify exact transcript if captions were not directly embedded!
    let aiSummary = "";
    let aiKeyTakeaways: string[] = [];
    let aiEnrichedContent = "";
    let finalTitle = baseTitle;
    let finalAuthor = baseAuthor;

    const customKey = req.headers["x-gemini-api-key"] as string | undefined;
    const hasKey = !!(customKey?.trim() || process.env.GEMINI_API_KEY);

    if (hasKey) {
      try {
        const ai = getAiClient(customKey);
        const enrichPrompt = `
You are Prizm AI's Media & Transcript Intelligence Engine. Inspect the target URL and the harvested metadata/transcript below.
Target URL: ${formattedUrl}
Detected Platform: ${classification.platform}

=== HARVESTED METADATA & RAW CONTENT ===
${rawContextPieces}

=== YOUR TASK ===
1. Access the URL context and search context to inspect the full content of this ${classification.platform} source.
2. ${
          exactTranscriptText
            ? "We already extracted the verbatim timestamped caption track above. Preserve its exact details in your analysis."
            : "Extract or reconstruct the most complete, word-for-word timestamped transcript of the spoken dialogue/caption script in 'transcriptSegments' (each item with 'timestamp' like '00:05' and 'text' with the exact spoken words/lines)."
        }
3. Return a JSON object matching the schema with:
   - "title": Accurate title of the video, reel, or webpage.
   - "author": Channel name, creator handle, or publication author.
   - "publishedAt": Publication date if known.
   - "duration": Video/reel duration or read time.
   - "summary": A thorough 2-to-3 paragraph Executive Summary of the content.
   - "keyTakeaways": Array of 5 to 7 concrete bullet points summarizing key facts, arguments, statistics, or steps.
   - "transcriptSegments": Array of timestamped transcript lines ({ "timestamp": "MM:SS", "text": "Exact spoken line or script segment" }).
   - "detailedContent": A comprehensive, structured reference document capturing all facts, transcript insights, technical details, entities, and metrics.
`;

        const geminiRes = await ai.models.generateContent({
          model: "gemini-3.8-flash",
          contents: enrichPrompt,
          config: {
            tools: [{ urlContext: {} }, { googleSearch: {} }],
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                author: { type: Type.STRING },
                publishedAt: { type: Type.STRING },
                duration: { type: Type.STRING },
                summary: { type: Type.STRING },
                keyTakeaways: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
                transcriptSegments: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      timestamp: { type: Type.STRING },
                      text: { type: Type.STRING },
                    },
                    required: ["timestamp", "text"],
                  },
                },
                detailedContent: { type: Type.STRING },
              },
              required: [
                "title",
                "author",
                "summary",
                "keyTakeaways",
                "transcriptSegments",
                "detailedContent",
              ],
            },
          },
        });

        if (geminiRes.text) {
          const parsedAi = JSON.parse(geminiRes.text.trim());
          if (parsedAi.title) finalTitle = parsedAi.title;
          if (parsedAi.author) finalAuthor = parsedAi.author;
          aiSummary = parsedAi.summary || "";
          aiKeyTakeaways = Array.isArray(parsedAi.keyTakeaways) ? parsedAi.keyTakeaways : [];
          aiEnrichedContent = parsedAi.detailedContent || "";

          // If Innertube didn't find raw captions (e.g. Instagram Reel or captionless video), use the AI-extracted transcript segments
          if (
            transcriptSegments.length === 0 &&
            Array.isArray(parsedAi.transcriptSegments) &&
            parsedAi.transcriptSegments.length > 0
          ) {
            transcriptSegments = parsedAi.transcriptSegments.map((seg: any, idx: number) => ({
              timestamp: seg.timestamp || formatSecondsToTimestamp(idx * 10),
              seconds: idx * 10,
              text: seg.text,
            }));
            exactTranscriptText = transcriptSegments
              .map((s) => `[${s.timestamp}] ${s.text}`)
              .join("\n");
          }
        }
      } catch (aiErr: any) {
        console.warn("Gemini URL enrichment fallback notice:", aiErr?.message || aiErr);
      }
    }

    // Fallback if transcriptSegments is still empty for Instagram Reel with caption
    if (transcriptSegments.length === 0 && instagramCaption) {
      const lines = instagramCaption.split(/\n+/).filter(Boolean);
      transcriptSegments = lines.map((line, i) => ({
        timestamp: formatSecondsToTimestamp(i * 5),
        seconds: i * 5,
        text: line,
      }));
      exactTranscriptText = transcriptSegments
        .map((s) => `[${s.timestamp}] ${s.text}`)
        .join("\n");
    }

    const metadataHeader = [
      `=== SOURCE METADATA ===`,
      `Title: ${finalTitle}`,
      `Platform: ${classification.platform}`,
      `Author / Channel: ${finalAuthor}`,
      `Source URL: ${formattedUrl}`,
      baseDuration ? `Duration: ${baseDuration}` : "",
      basePublishedAt ? `Published: ${basePublishedAt}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    const summarySection = aiSummary
      ? `\n\n=== EXECUTIVE SUMMARY ===\n${aiSummary}\n\n=== KEY TAKEAWAYS ===\n${aiKeyTakeaways.map((t, idx) => `${idx + 1}. ${t}`).join("\n")}`
      : parsedHtml?.description
        ? `\n\n=== SUMMARY / DESCRIPTION ===\n${parsedHtml.description}`
        : "";

    const transcriptSection = exactTranscriptText
      ? `\n\n=== EXACT VERBATIM TRANSCRIPT (${transcriptSegments.length} SEGMENTS) ===\n${exactTranscriptText}`
      : "";

    const bodySection = aiEnrichedContent
      ? `\n\n=== COMPREHENSIVE CONTENT BREAKDOWN ===\n${aiEnrichedContent}`
      : parsedHtml?.cleanBody && classification.type === "url"
        ? `\n\n=== EXTRACTED PAGE TEXT ===\n${parsedHtml.cleanBody}`
        : "";

    const fullText = `${metadataHeader}${summarySection}${transcriptSection}${bodySection}`.trim();

    res.json({
      text: fullText,
      url: formattedUrl,
      type: classification.type,
      title: finalTitle,
      metadata: {
        platform: classification.platform,
        author: finalAuthor,
        publishedAt: basePublishedAt || undefined,
        duration: baseDuration || undefined,
        thumbnailUrl: baseThumbnail || undefined,
        originalUrl: formattedUrl,
        wordCount: fullText.split(/\s+/).length,
        summary:
          aiSummary ||
          parsedHtml?.description ||
          ytMeta?.shortDescription?.slice(0, 400) ||
          "Metadata and transcript extracted from source link.",
        keyTakeaways: aiKeyTakeaways.length > 0 ? aiKeyTakeaways : undefined,
        exactTranscript: exactTranscriptText || undefined,
        transcriptSegments: transcriptSegments.length > 0 ? transcriptSegments : undefined,
      },
    });
  } catch (error: any) {
    console.error("URL fetch error:", error);
    res.status(500).json({ error: error.message || "Failed to fetch URL content and transcript" });
  }
});

// 2. Extract Canonical Knowledge
app.post("/api/analyze", async (req, res) => {
  const { sources, params } = req.body;
  if (!sources || !Array.isArray(sources) || sources.length === 0) {
    return res.status(400).json({ error: "Sources are required and must be an array" });
  }

  try {
    const customKey = req.headers["x-gemini-api-key"] as string | undefined;
    const ai = getAiClient(customKey);
    const combinedSources = sources
      .map(
        (src, index) =>
          `--- SOURCE DOCUMENT #${index + 1} (${src.title || "Untitled"}) [Type: ${src.type || "text"}] ---\n${src.content}`
      )
      .join("\n\n");

    const prompt = `
Analyze the following source document(s) deeply and construct a Canonical Knowledge Representation that acts as the absolute ground truth.
No assumptions, extrapolations, or hallucinations are allowed. Every single item returned must be strictly derived from facts in the source text.

=== PARSING PARAMETERS ===
Target Audience: ${params?.audience || "General Professional"}
Tone/Style: ${params?.tone || "Professional & Formal"}
Language: ${params?.language || "English"}
Communication Objective: ${params?.objective || "Informative Synthesis"}
Detail Level: ${params?.detailLevel || "Balanced"}
Domain context: ${params?.domain || "Corporate Operations"}

=== SOURCE DOCUMENTS ===
${combinedSources}

=== INSTRUCTIONS ===
1. Analyze the text under the lens of the target audience and domain context.
2. Extract the key facts, chronological/important events, statistics, critical entities, risks, opportunities, recommendations, timeline, and important quotes.
3. Your final response must be formatted as a JSON object matching the requested schema. Ensure the fields are populated in the requested language: ${params?.language || "English"}.
`;

    const response = await generateContentWithFallback(ai, prompt, {
      systemInstruction:
        "You are Prizm AI's enterprise research analyst specializing in grounded synthesis. Your goal is to extract facts, statistics, entities, and timelines with absolute fidelity to the source documents.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          mainObjective: { type: Type.STRING },
          keyFacts: { type: Type.ARRAY, items: { type: Type.STRING } },
          keyEvents: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                event: { type: Type.STRING },
                date: { type: Type.STRING },
                description: { type: Type.STRING },
              },
              required: ["event", "description"],
            },
          },
          statistics: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                metric: { type: Type.STRING },
                value: { type: Type.STRING },
                context: { type: Type.STRING },
              },
              required: ["metric", "value"],
            },
          },
          importantEntities: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                role: { type: Type.STRING },
                description: { type: Type.STRING },
              },
              required: ["name", "role", "description"],
            },
          },
          risks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                risk: { type: Type.STRING },
                impact: { type: Type.STRING },
                mitigation: { type: Type.STRING },
              },
              required: ["risk", "impact"],
            },
          },
          opportunities: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                opportunity: { type: Type.STRING },
                benefit: { type: Type.STRING },
              },
              required: ["opportunity", "benefit"],
            },
          },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
          timeline: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                step: { type: Type.STRING },
                timeframe: { type: Type.STRING },
                description: { type: Type.STRING },
              },
              required: ["step", "description"],
            },
          },
          importantQuotes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                quote: { type: Type.STRING },
                attribution: { type: Type.STRING },
              },
              required: ["quote"],
            },
          },
        },
        required: [
          "title",
          "mainObjective",
          "keyFacts",
          "keyEvents",
          "statistics",
          "importantEntities",
          "risks",
          "opportunities",
          "recommendations",
          "timeline",
          "importantQuotes",
        ],
      },
    });

    if (!response.text) {
      throw new Error("No response text returned from Gemini");
    }

    const data = JSON.parse(response.text.trim());
    res.json(data);
  } catch (error: any) {
    console.error("Analysis API error:", error);
    res.status(500).json({ error: error.message || "Failed to analyze source documents" });
  }
});

// 3. Transform Canonical Knowledge into Communication Artifacts (With Generative Visual Slides & Infographic Data)
app.post("/api/transform", async (req, res) => {
  const { canonical, params } = req.body;
  if (!canonical) {
    return res.status(400).json({ error: "Canonical knowledge is required" });
  }

  try {
    const customKey = req.headers["x-gemini-api-key"] as string | undefined;
    const ai = getAiClient(customKey);
    const audience = params?.audience || "General Professional";
    const tone = params?.tone || "Professional & Formal";
    const language = params?.language || "English";
    const objective = params?.objective || "Informative Synthesis";
    const detailLevel = params?.detailLevel || "Balanced";
    const domain = params?.domain || "Corporate Operations";

    const prompt = `
You are the transformation engine of Prizm AI. Transform the Canonical Knowledge Model below into 8 synchronized, publication-ready communication artifacts.
Strictly rely ONLY on the facts present in the Canonical Model.

=== CANONICAL KNOWLEDGE MODEL (GROUND TRUTH) ===
${JSON.stringify(canonical, null, 2)}

=== OUTPUT INSTRUCTIONS ===
Language: ${language} | Target Audience: ${audience} | Tone: ${tone} | Domain: ${domain} | Objective: ${objective} | Detail Level: ${detailLevel}

=== SPECIAL INSTRUCTIONS FOR GENERATIVE SLIDES & GENERATIVE INFOGRAPHIC ===
- For **presentation.slides** (6 to 8 slides):
  Do NOT just describe a visual idea! For EVERY slide, generate actual structured visual data:
  - "subtitle": A crisp 1-line analytical kicker for the slide.
  - "visualType": Choose one of "bar-chart", "metric-grid", "process-flow", "comparison-split", or "radial-gauge" so the slide renders a real interactive graphic.
  - "chartData": Provide 3 to 4 concrete data points ({ "label": "Metric/Phase Name", "value": number between 10 and 100 for bar/gauge scaling, "displayValue": "Exact stat/value string e.g. 98% or 12 GB" }) derived from the Canonical Model!
  - "speakerNotes": Write a natural, engaging spoken presenter script (2-4 sentences) that can be read aloud by our live TTS Keynote presenter.
- For **infographic**:
  Generate a complete, visual data-poster structure:
  - "subheadline": A bold analytical subtitle.
  - "keyMetrics": 4 to 6 key metrics, each with "label", "value", "percentage" (number 10-100 for visual gauge rendering), and "trend" (e.g. "CRITICAL", "+42%", "PRIORITY").
  - "sections": 3 to 4 visual sections, each with "title", "content", "visualType" ("bar", "progress", "cards", or "flow"), and "metrics" (2-3 items with "label", "value", and "percentage" 10-100).
  - "processSteps": 4 sequential workflow/roadmap steps ({ "step": "Phase Title", "detail": "Concrete action" }).
`;

    const response = await generateContentWithFallback(ai, prompt, {
      systemInstruction:
        "You are Prizm AI's enterprise content transformation specialist. Generate complete, publication-ready communication artifacts and structured visual data charts grounded strictly in the Canonical Knowledge Model.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          executiveSummary: {
            type: Type.OBJECT,
            properties: {
              purpose: { type: Type.STRING },
              keyFindings: { type: Type.ARRAY, items: { type: Type.STRING } },
              criticalRisks: { type: Type.ARRAY, items: { type: Type.STRING } },
              recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
              conclusion: { type: Type.STRING },
            },
            required: ["purpose", "keyFindings", "criticalRisks", "recommendations", "conclusion"],
          },
          advisory: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              background: { type: Type.STRING },
              situationOverview: { type: Type.STRING },
              impactAssessment: { type: Type.STRING },
              recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
              actionItems: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["title", "background", "situationOverview", "impactAssessment", "recommendations", "actionItems"],
          },
          linkedInPost: {
            type: Type.OBJECT,
            properties: {
              hook: { type: Type.STRING },
              insights: { type: Type.ARRAY, items: { type: Type.STRING } },
              takeaways: { type: Type.ARRAY, items: { type: Type.STRING } },
              cta: { type: Type.STRING },
            },
            required: ["hook", "insights", "takeaways", "cta"],
          },
          twitterThread: {
            type: Type.OBJECT,
            properties: {
              threadTitle: { type: Type.STRING },
              tweets: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    index: { type: Type.INTEGER },
                    content: { type: Type.STRING },
                  },
                  required: ["index", "content"],
                },
              },
            },
            required: ["threadTitle", "tweets"],
          },
          presentation: {
            type: Type.OBJECT,
            properties: {
              slides: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    slideNumber: { type: Type.INTEGER },
                    title: { type: Type.STRING },
                    subtitle: { type: Type.STRING },
                    content: { type: Type.ARRAY, items: { type: Type.STRING } },
                    visualType: { type: Type.STRING },
                    chartData: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          label: { type: Type.STRING },
                          value: { type: Type.NUMBER },
                          displayValue: { type: Type.STRING },
                        },
                        required: ["label", "value", "displayValue"],
                      },
                    },
                    visualRecommendation: { type: Type.STRING },
                    speakerNotes: { type: Type.STRING },
                  },
                  required: [
                    "slideNumber",
                    "title",
                    "subtitle",
                    "content",
                    "visualType",
                    "chartData",
                    "visualRecommendation",
                    "speakerNotes",
                  ],
                },
              },
            },
            required: ["slides"],
          },
          infographic: {
            type: Type.OBJECT,
            properties: {
              headline: { type: Type.STRING },
              subheadline: { type: Type.STRING },
              sections: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    content: { type: Type.STRING },
                    visualType: { type: Type.STRING },
                    metrics: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          label: { type: Type.STRING },
                          value: { type: Type.STRING },
                          percentage: { type: Type.NUMBER },
                        },
                        required: ["label", "value", "percentage"],
                      },
                    },
                  },
                  required: ["title", "content", "visualType", "metrics"],
                },
              },
              keyMetrics: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: { type: Type.STRING },
                    value: { type: Type.STRING },
                    percentage: { type: Type.NUMBER },
                    trend: { type: Type.STRING },
                  },
                  required: ["label", "value", "percentage", "trend"],
                },
              },
              processSteps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    step: { type: Type.STRING },
                    detail: { type: Type.STRING },
                  },
                  required: ["step", "detail"],
                },
              },
              visualLayout: { type: Type.STRING },
              iconsRecommendation: { type: Type.STRING },
              colorSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: [
              "headline",
              "subheadline",
              "sections",
              "keyMetrics",
              "processSteps",
              "visualLayout",
              "iconsRecommendation",
              "colorSuggestions",
            ],
          },
          videoPackage: {
            type: Type.OBJECT,
            properties: {
              videoTitle: { type: Type.STRING },
              duration: { type: Type.STRING },
              fullScript: { type: Type.STRING },
              storyboard: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    sceneNumber: { type: Type.INTEGER },
                    storyboardDescription: { type: Type.STRING },
                    narration: { type: Type.STRING },
                    visualRecommendations: { type: Type.STRING },
                    subtitles: { type: Type.STRING },
                  },
                  required: ["sceneNumber", "storyboardDescription", "narration", "visualRecommendations", "subtitles"],
                },
              },
            },
            required: ["videoTitle", "duration", "fullScript", "storyboard"],
          },
          audioOverview: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              hosts: { type: Type.ARRAY, items: { type: Type.STRING } },
              script: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    speaker: { type: Type.STRING },
                    dialogue: { type: Type.STRING },
                  },
                  required: ["speaker", "dialogue"],
                },
              },
            },
            required: ["title", "hosts", "script"],
          },
        },
        required: [
          "executiveSummary",
          "advisory",
          "linkedInPost",
          "twitterThread",
          "presentation",
          "infographic",
          "videoPackage",
          "audioOverview",
        ],
      },
    });

    if (!response.text) {
      throw new Error("No response returned from Gemini");
    }

    const data = JSON.parse(response.text.trim());
    res.json(data);
  } catch (error: any) {
    console.error("Transformation API error:", error);
    res.status(500).json({ error: error.message || "Failed to transform canonical knowledge" });
  }
});

// 4. Dedicated On-Demand Generative Visual Slides or Infographic Endpoint
app.post("/api/generate-visual", async (req, res) => {
  const { canonical, params, targetType, customDirective } = req.body;
  if (!canonical || !targetType) {
    return res.status(400).json({ error: "Canonical model and targetType ('slides' | 'infographic') are required" });
  }

  try {
    const customKey = req.headers["x-gemini-api-key"] as string | undefined;
    const ai = getAiClient(customKey);

    if (targetType === "slides") {
      const prompt = `
You are Prizm AI's Generative Keynote Designer. Generate a complete, visually-driven Presentation Slide Deck (6 to 8 slides) strictly grounded in the Canonical Knowledge Model below.
${customDirective ? `USER CUSTOMIZATION DIRECTIVE: "${customDirective}"` : ""}
Audience: ${params?.audience || "General Professional"} | Tone: ${params?.tone || "Professional"} | Language: ${params?.language || "English"}

=== CANONICAL GROUND TRUTH ===
${JSON.stringify(canonical, null, 2)}

For EVERY slide, generate:
- "slideNumber": sequential integer
- "title": Bold headline
- "subtitle": Analytical sub-kicker
- "content": 3 to 4 crisp bullet points
- "visualType": one of "bar-chart", "metric-grid", "process-flow", "comparison-split", or "radial-gauge"
- "chartData": 3 to 4 concrete visual data points ({ "label": string, "value": number between 12 and 100, "displayValue": string })
- "visualRecommendation": Brief caption for the rendered chart
- "speakerNotes": Spoken keynote narration (3-4 natural sentences) ready for live voice synthesis.
`;
      const response = await generateContentWithFallback(ai, prompt, {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            slides: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  slideNumber: { type: Type.INTEGER },
                  title: { type: Type.STRING },
                  subtitle: { type: Type.STRING },
                  content: { type: Type.ARRAY, items: { type: Type.STRING } },
                  visualType: { type: Type.STRING },
                  chartData: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING },
                        value: { type: Type.NUMBER },
                        displayValue: { type: Type.STRING },
                      },
                      required: ["label", "value", "displayValue"],
                    },
                  },
                  visualRecommendation: { type: Type.STRING },
                  speakerNotes: { type: Type.STRING },
                },
                required: [
                  "slideNumber",
                  "title",
                  "subtitle",
                  "content",
                  "visualType",
                  "chartData",
                  "visualRecommendation",
                  "speakerNotes",
                ],
              },
            },
          },
          required: ["slides"],
        },
      });
      return res.json(JSON.parse((response.text || "{}").trim()));
    } else {
      const prompt = `
You are Prizm AI's Generative Infographic Engine. Generate a complete, data-dense Visual Infographic Poster strictly grounded in the Canonical Knowledge Model below.
${customDirective ? `USER CUSTOMIZATION DIRECTIVE: "${customDirective}"` : ""}
Audience: ${params?.audience || "General Professional"} | Tone: ${params?.tone || "Professional"} | Language: ${params?.language || "English"}

=== CANONICAL GROUND TRUTH ===
${JSON.stringify(canonical, null, 2)}

Generate:
- "headline": Bold poster title
- "subheadline": Analytical deck subtitle
- "keyMetrics": 4 to 6 high-impact KPI blocks with "label", "value", "percentage" (10-100), and "trend"
- "sections": 4 visual data modules, each with "title", "content", "visualType" ("bar", "progress", "cards", or "flow"), and "metrics" (3 data rows with "label", "value", "percentage" 10-100)
- "processSteps": 4 sequential roadmap/architecture steps ({ "step": string, "detail": string })
- "visualLayout": Layout title
- "iconsRecommendation": Key iconography
- "colorSuggestions": 4 hex color codes
`;
      const response = await generateContentWithFallback(ai, prompt, {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            headline: { type: Type.STRING },
            subheadline: { type: Type.STRING },
            sections: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  title: { type: Type.STRING },
                  content: { type: Type.STRING },
                  visualType: { type: Type.STRING },
                  metrics: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING },
                        value: { type: Type.STRING },
                        percentage: { type: Type.NUMBER },
                      },
                      required: ["label", "value", "percentage"],
                    },
                  },
                },
                required: ["title", "content", "visualType", "metrics"],
              },
            },
            keyMetrics: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  label: { type: Type.STRING },
                  value: { type: Type.STRING },
                  percentage: { type: Type.NUMBER },
                  trend: { type: Type.STRING },
                },
                required: ["label", "value", "percentage", "trend"],
              },
            },
            processSteps: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  step: { type: Type.STRING },
                  detail: { type: Type.STRING },
                },
                required: ["step", "detail"],
              },
            },
            visualLayout: { type: Type.STRING },
            iconsRecommendation: { type: Type.STRING },
            colorSuggestions: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: [
            "headline",
            "subheadline",
            "sections",
            "keyMetrics",
            "processSteps",
            "visualLayout",
            "iconsRecommendation",
            "colorSuggestions",
          ],
        },
      });
      return res.json(JSON.parse((response.text || "{}").trim()));
    }
  } catch (error: any) {
    console.error("Visual generation error:", error);
    res.status(500).json({ error: error.message || "Failed to generate visual artifact" });
  }
});

// 5. Draft Prompt Reference Report
app.post("/api/draft-prompt", async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: "Prompt/Question is required" });
  }

  try {
    const customKey = req.headers["x-gemini-api-key"] as string | undefined;
    const ai = getAiClient(customKey);
    const systemPrompt = `
You are an expert encyclopedia and academic writer for Prizm AI. Expand the user's short query or question into an exceptionally detailed, comprehensive, structured, and factual reference document.

User query/question: "${prompt}"

Instructions:
1. Write a comprehensive, factual background report (at least 800-1500 words) covering all facets of this topic.
2. Structure the document with professional headings (Overview, Key Technical Aspects, Main Challenges/Risks, Strategic Implications, and Facts & Figures).
3. Include realistic, high-quality, illustrative facts, statistics, and industry standards.
`;

    const response = await generateContentWithFallback(ai, systemPrompt, {
      systemInstruction:
        "You are Prizm AI's research report drafting assistant. Your output should be a highly detailed, comprehensive, structured reference text.",
    });

    res.json({ text: response.text || "No content could be drafted." });
  } catch (error: any) {
    console.error("Draft Prompt API error:", error);
    res.status(500).json({ error: error.message || "Failed to generate comprehensive report" });
  }
});

// 6. Grounded Chat with sources
app.post("/api/chat", async (req, res) => {
  const { canonical, history, question } = req.body;
  if (!canonical || !question) {
    return res.status(400).json({ error: "Canonical knowledge and question are required" });
  }

  try {
    const customKey = req.headers["x-gemini-api-key"] as string | undefined;
    const ai = getAiClient(customKey);

    const formattedHistory = (history || [])
      .map((msg: any) => `${msg.sender === "user" ? "User" : "Assistant"}: ${msg.text}`)
      .join("\n");

    const prompt = `
You are Prizm AI's grounded research partner. Answer the user's question with absolute fidelity to the provided Ground Truth Knowledge model.

=== GROUND TRUTH KNOWLEDGE ===
${JSON.stringify(canonical, null, 2)}

=== CONVERSATION HISTORY ===
${formattedHistory}

=== USER QUESTION ===
${question}

=== STRICT INSTRUCTIONS ===
1. Answer relying ONLY on the facts, statistics, risks, entities, timeline, and quotes in the Ground Truth Knowledge model.
2. If the question cannot be answered using the Ground Truth, state clearly: "I cannot answer this based on the provided source materials because [reason]."
`;

    const response = await generateContentWithFallback(ai, prompt, {
      systemInstruction:
        "You are Prizm AI's research partner grounded strictly in user-supplied documents.",
    });

    res.json({ answer: response.text || "No response generated." });
  } catch (error: any) {
    console.error("Chat API error:", error);
    res.status(500).json({ error: error.message || "Failed to generate answer" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Prizm AI Server running on http://localhost:${PORT}`);
  });
}

startServer();
