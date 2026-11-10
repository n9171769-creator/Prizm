# Synthesize — Editorial Brutalist Workbench & Complete 5-Pillar Functional Upgrade

An end-to-end architectural, functional, and visual overhaul of **Synthesize**, implementing **all 4 selected functional upgrades**, the **Universal YouTube / Social Reel / Website Metadata & Summarization Engine**, **all audited bug/flaw fixes**, and a complete **Editorial Paper & Ink Brutalist UI** in a **Collapsible 3-Pane Workbench**.

---

## User Review & Confirmed Decisions (All 4 Options + Media Metadata Summarizer Included)

> [!IMPORTANT]
> Every single option from the functional upgrades list **plus** your custom YouTube, Reel, and Website metadata & summarization engine is explicitly included below. Click **Proceed** to build all of these into the application.

### Confirmed Visual & Layout Choices
- **Visual Aesthetic**: **Editorial Paper & Ink Brutalist UI** (`#F7F5F0` archival warm paper canvas, `2px solid #111111` exposed ink borders, `4px 4px 0px #111111` hard offset shadows, `#FFE600` Acid Yellow active highlights, and `#FF2A2A` Signal Red alerts).
- **Workspace Layout**: **Collapsible 3-Pane Brutalist Workbench** with exposed structural grid lines and hard shadows (Pane 1: Notebooks & Parameters · Pane 2: Sources, Media Metadata & Editable Ground Truth · Pane 3: 8-Artifact Synthesis Studio).

### Confirmed 5 Core Functional Upgrades (All 4 Options + Your Custom Addition)

1. **[Option 1] Real Browser Text-to-Speech (TTS) Audio Playback for the 2-Host Podcast Overview**:
   - Replaces the fake progress bar timer with live Web Speech API (`window.speechSynthesis`) voice synthesis.
   - Assigns distinct voice/pitch profiles to **Host A** and **Host B**, highlights the active dialogue card in real time, supports **Play / Pause / Resume / Stop**, playback speed toggles (`1x`, `1.25x`, `1.5x`), and clicking any dialogue line to jump directly to that point in the conversation.
2. **[Option 2] Direct Inline Editing of Canonical Knowledge Facts, Stats, and Entities Before Synthesis**:
   - Adds an interactive **Edit Ground Truth** mode inside the Canonical Knowledge tab.
   - Users can directly edit, add, or delete **Key Facts**, **Metrics & Statistics**, **Timeline Events**, **Key Entities**, **Risk Matrix Items**, **Opportunities**, **Strategic Roadmap Steps**, and **Important Quotes** before (or after) generating the 8 communication artifacts.
3. **[Option 3] Multi-File Drag-and-Drop Document Batch Ingestion & Resilient URL Fallback Proxy**:
   - Enables dragging and dropping **multiple files at once** (`.pdf`, `.txt`, `.md`, `.csv`, `.json`, `.xml`) directly onto the Sources pane or inside the Ingestion Modal for instant batch extraction and ingestion.
   - Includes a multi-layer URL proxy & client-side fallback so link extraction works both on the full-stack server and on static deployments (e.g., Netlify).
4. **[Option 4] Export Artifacts as Formatted Markdown, Standalone HTML Slide Deck, and JSON**:
   - Adds a dedicated **Export & Download Suite** supporting:
     - **Formatted Markdown Report (`.md`)**: Complete canonical ground truth + all 8 synthesized communication artifacts formatted with clean Markdown headings, tables, and checklists.
     - **Standalone Interactive HTML Slide Deck (`.html`)**: A self-contained, offline-ready Brutalist presentation file with keyboard navigation (`←` / `→`), slide counter, visual recommendations, and toggleable speaker notes.
     - **Printable Executive Dossier (`Print / Save PDF`)** and **Full Project JSON Package (`.json`)**.
5. **[Option 5 — Custom Addition] Universal YouTube Video, Social Reel & Website Metadata + AI Summarization Engine**:
   - Accepts **any YouTube video or Shorts URL** (`youtube.com/watch`, `youtu.be`, `youtube.com/shorts`), **any Instagram Reel / TikTok / X / Facebook video link**, or **any Website/Article URL**.
   - Automatically fetches and displays **rich content metadata**:
     - **Title & Channel / Author / Creator**
     - **Platform Type** (`YouTube Video`, `YouTube Short`, `Instagram Reel`, `TikTok Video`, `X Post`, `Web Article`)
     - **Thumbnail Preview Image**, **Publish Date / Duration** (when available), and **Raw Description / Captions / OpenGraph / JSON-LD / oEmbed data**.
   - Immediately runs an **AI Content & Metadata Summarizer** (powered by Gemini `urlContext` + `googleSearch` grounding alongside extracted transcript/metadata) that generates an executive summary, key takeaways, and structured source transcript/notes so the user can review both the **Metadata Card**, the **AI Summary**, and the **Full Extracted Content** before or after saving to the notebook.

---

## 1. Audited Project Flaws & How We Fix Them

| # | Flaw Found in Current Codebase | Concrete Fix in This Upgrade |
| :--- | :--- | :--- |
| **1** | **Fragile URL Scraper**: `/api/fetch-url` only did a basic HTML regex strip, which fails completely on YouTube videos, Reels, SPAs, or sites with bot protection. | Upgraded to a **Multi-Stage Media & Web Intelligence Pipeline** combining oEmbed APIs (YouTube/TikTok/social), OpenGraph/JSON-LD/Meta tag parsing, YouTube caption/description extraction, CORS-friendly fallback proxies, and Gemini `urlContext` + `googleSearch` grounding to extract metadata and synthesize a rich summary for any URL. |
| **2** | **Fake Podcast Audio Player**: The Audio Overview tab only ran a `setInterval` counter without producing any sound. | Replaced with a real **Web Speech API Dual-Host Synthesizer** (`window.speechSynthesis`) that speaks Host A and Host B lines aloud with distinct voices, speed control, and click-to-seek. |
| **3** | **Read-Only Canonical Model**: Users could not fix a typo, add a missing statistic, or remove an unwanted item in the Canonical Knowledge Model before synthesizing outputs. | Added **Inline Canonical Editing** across all sections (Facts, Stats, Events, Entities, Risks, Opportunities, Timeline, Quotes) with instant state persistence. |
| **4** | **Single-File Upload Only**: The file input only read `e.target.files?.[0]` and had no drag-and-drop support on the workspace. | Added **Multi-File Drag-and-Drop Batch Ingestion** supporting simultaneous PDF, TXT, MD, CSV, JSON, and XML files with per-file status feedback. |
| **5** | **Outdated Gemini Model Strings**: `server.ts` and `App.tsx` referenced legacy/non-standard model strings (`gemini-3.7-flash`, `gemini-2.5-flash`) and passed deprecated `temperature` config. | Updated to **`gemini-3.8-flash`** (with `@google/genai` latest SDK conventions) for fast, reliable JSON schema generation and grounding. |
| **6** | **Blocking `window.alert()` Calls**: Used native `alert()` for API key saves, errors, and project deletion warnings, which breaks iframe/sandbox UX. | Replaced all `alert()` calls with a custom **Brutalist Toast Notification Bar** (`SUCCESS`, `WARNING`, `ERROR`). |
| **7** | **Broken Regex Highlighting in Document Reader**: Searching special characters or multi-page documents in the PDF/Document preview had stateful regex `/g` bugs with `.test()`. | Fixed search highlighting to use stateless case-insensitive matching with accurate match counters and auto-page jumping. |

---

## 2. User Experience & Visual Design (Editorial Brutalist UI)

### Visual Identity & Theme Tokens
- **Canvas & Surfaces**:
  - `--bg-canvas`: `#F7F5F0` (Archival Newsprint Paper)
  - `--bg-surface`: `#FFFFFF` (Stark White Card Surface)
  - `--bg-muted`: `#EAE6DF` (Warm Concrete Header Strip)
  - `--ink`: `#111111` (Pure Carbon Ink for text, `2px solid #111111` borders, and `4px 4px 0px #111111` hard offset shadows)
  - `--accent-yellow`: `#FFE600` (Acid Yellow for primary CTAs, active tabs, and search highlights)
  - `--accent-red`: `#FF2A2A` (Signal Red for critical risk badges, live audio indicators, and delete actions)
- **Typography & Hierarchy**:
  - **Display & Headings**: `Syne` & `Fraunces` (Bold editorial display headers with `text-wrap: balance`).
  - **Body Prose**: `Plus Jakarta Sans` (High-legibility body copy).
  - **Monospace & Metrics**: `JetBrains Mono` with `tabular-nums` for all statistics, index numbers (`01`, `02`), durations, and metadata.
- **Brutalist Mechanical Feel**:
  - Zero soft drop-shadows or rounded pill bloat; sharp `0px`–`2px` corners, exposed `2px` structural grid hairlines, and buttons that physically press down (`translate-x-[2px] translate-y-[2px] shadow-[2px_2px_0px_#111111]`) on click.

---

## 3. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────────────────┐
│                        TOP COMMAND BAR (Editorial Brutalist Header)                          │
│  [SYNTHESIZE]  ──  [Pane Layout Toggles: Notebooks | Workbench | Studio]  ──  [API · + New]  │
└───────────────┬─────────────────────────────────────────────┬────────────────────────────────┘
                │                                             │
┌───────────────▼──────────────────┐ ┌────────────────────────▼───────────────┐ ┌──────────────▼─────────────────────────┐
│ PANE 1: NOTEBOOKS & PARAMETERS   │ │ PANE 2: SOURCES & CANONICAL WORKBENCH  │ │ PANE 3: MULTI-OUTPUT STUDIO (8 TABS)   │
│ (Collapsible Left Rail)          │ │ (Collapsible Center Workbench)         │ │ (Collapsible Right Output Stage)       │
├──────────────────────────────────┤ ├────────────────────────────────────────┤ ├────────────────────────────────────────┤
│ • Notebook Selector & Search     │ │ • TAB 01: INGESTED SOURCES             │ │ • 01. EXECUTIVE BRIEF (Copy / Print)   │
│ • Transformation Parameters:     │ │   - Multi-File Drag & Drop Batch Zone  │ │ • 02. RISK ADVISORY (Checklist)        │
│   - Audience / Tone / Language   │ │   - YouTube / Reel / Web Metadata Card │ │ • 03. LINKEDIN POST (Copy)             │
│   - Detail Level / Domain        │ │     (Thumbnail, Author, Platform,      │ │ • 04. X / TWITTER THREAD (Tweet Cards) │
│ • Export & Download Suite:       │ │      AI Summary + Extracted Content)   │ │ • 05. SLIDE DECK (HTML Deck Export)    │
│   - Export Markdown (.md)        │ │   - Paginated Doc Reader & Search      │ │ • 06. INFOGRAPHIC BLUEPRINT & METRICS  │
│   - Export HTML Slide Deck       │ │ • TAB 02: CANONICAL GROUND TRUTH       │ │ • 07. VIDEO STORYBOARD & SCRIPT        │
│   - Export JSON (.json)          │ │   - Inline Fact/Stat/Entity/Risk Edit  │ │ • 08. 2-HOST PODCAST (Live Web Speech  │
│   - Print / PDF Briefing         │ │ • TAB 03: GROUNDED RESEARCH CHAT       │ │       TTS Audio, 1x-1.5x, Scrubbing)   │
└───────────────┬──────────────────┘ └────────────────────────┬───────────────┘ └──────────────┬─────────────────────────┘
                │                                             │                                │
                └─────────────────────────────────────────────┼────────────────────────────────┘
                                                              │
                                    ┌─────────────────────────▼─────────────────────────┐
                                    │   EXPRESS SERVER + STATIC CLIENT FALLBACK ENGINE  │
                                    ├───────────────────────────────────────────────────┤
                                    │ • POST /api/fetch-url:                            │
                                    │   1. Detects YouTube / Reel / Short / Web URL     │
                                    │   2. Extracts oEmbed, OpenGraph, JSON-LD & Text   │
                                    │   3. Runs Gemini 3.8 Flash with urlContext &      │
                                    │      googleSearch grounding to build Metadata +   │
                                    │      Executive Summary + Detailed Transcript/Body │
                                    │ • POST /api/draft-prompt (AI Reference Generator) │
                                    │ • POST /api/analyze (Canonical JSON Extraction)   │
                                    │ • POST /api/transform (8-Artifact JSON Synthesis) │
                                    │ • POST /api/chat (Strictly Grounded Q&A)          │
                                    └───────────────────────────────────────────────────┘
```

### Universal Link, YouTube & Reel Metadata + Summarization Flow

1. **Platform & Media Detection**:
   - Parses input URL to identify `youtube` (`youtube.com/watch`, `youtu.be`, `youtube.com/shorts`), `reel` (`instagram.com/reel`, `tiktok.com`, `facebook.com/reel`, `x.com`, `twitter.com`), or `web` (any article, documentation, or webpage).
2. **Metadata Harvesting**:
   - Queries platform oEmbed endpoints (e.g., `noembed.com/embed?url=...` and YouTube oEmbed) + HTML `<meta property="og:*">`, `<meta name="twitter:*">`, `<title>`, and JSON-LD structured data to capture `title`, `author`, `platform`, `thumbnailUrl`, and raw page/video description.
3. **AI Grounded Summarization (`urlContext` + `googleSearch`)**:
   - Sends the URL and harvested metadata to `gemini-3.8-flash` configured with `tools: [{ urlContext: {} }, { googleSearch: {} }]` (and a resilient client-side fallback when running on static hosting).
   - Returns a structured JSON payload containing:
     - `metadata`: `{ title, author, platform, publishedDate, duration, thumbnailUrl, url }`
     - `summary`: Concise executive summary & key takeaways of the video, reel, or webpage.
     - `content`: Comprehensive extracted breakdown, transcript notes, facts, and figures ready for Canonical Knowledge analysis.
4. **Rich Source Card Display**:
   - Renders a Brutalist **Media Intelligence Card** on each ingested URL/YouTube/Reel source showing its thumbnail, platform badge, author/channel, collapsible **AI Executive Summary**, and full **Extracted Content / Transcript Preview**.
