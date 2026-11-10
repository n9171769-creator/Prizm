import React, { useState, useEffect, useRef } from "react";
import { SAMPLE_PROJECTS } from "./data";
import {
  Project,
  SourceDocument,
  SourceMetadata,
  TranscriptSegment,
  CanonicalKnowledge,
  Slide,
  SlideChartDatum,
  Infographic,
  ChatMessage,
  GenerationParams,
} from "./types";
import {
  Sparkles,
  Plus,
  Trash2,
  FileText,
  AlertTriangle,
  Send,
  Play,
  Pause,
  Square,
  Copy,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Settings2,
  MessageSquare,
  Cpu,
  Eye,
  BookOpen,
  Download,
  RefreshCw,
  Sliders,
  Shield,
  Layers,
  Check,
  PlusCircle,
  Search,
  ZoomIn,
  ZoomOut,
  Edit3,
  Upload,
  Globe,
  Film,
  Printer,
  Code,
  FileCode,
  Volume2,
  PanelLeftClose,
  PanelLeftOpen,
  Maximize2,
  Minimize2,
  BarChart3,
  PieChart,
  GitBranch,
  FileAudio,
} from "lucide-react";

interface ToastNotification {
  id: string;
  type: "success" | "warning" | "error";
  message: string;
}

interface PendingUploadedFile {
  name: string;
  content: string;
  wordCount: number;
  fileType: string;
}

function detectUrlPlatformClient(rawUrl: string): {
  type: "youtube" | "reel" | "url";
  platform: string;
  youtubeId?: string;
} {
  try {
    const u = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`);
    const host = u.hostname.toLowerCase();
    const pathname = u.pathname;

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
    if (host.includes("instagram.com")) {
      return {
        type: "reel",
        platform: pathname.includes("/reel") ? "Instagram Reel" : "Instagram Post",
      };
    }
    if (host.includes("tiktok.com")) {
      return { type: "reel", platform: "TikTok Video" };
    }
    if (host.includes("facebook.com") || host.includes("fb.watch")) {
      return { type: "reel", platform: "Facebook Reel / Video" };
    }
    if (host.includes("x.com") || host.includes("twitter.com")) {
      return { type: "reel", platform: "X / Twitter Post" };
    }
    return { type: "url", platform: u.hostname.replace(/^www\./, "") };
  } catch {
    return { type: "url", platform: "Web Resource" };
  }
}

// Helper: Ensure every slide has rich generative chartData even on legacy sample projects
function getEnrichedSlideVisualData(
  slide: Slide,
  slideIdx: number,
  canonical?: CanonicalKnowledge
): {
  visualType: NonNullable<Slide["visualType"]>;
  chartData: SlideChartDatum[];
} {
  const visualTypes: NonNullable<Slide["visualType"]>[] = [
    "bar-chart",
    "radial-gauge",
    "metric-grid",
    "process-flow",
    "comparison-split",
  ];
  const chosenType =
    slide.visualType && visualTypes.includes(slide.visualType as any)
      ? (slide.visualType as NonNullable<Slide["visualType"]>)
      : visualTypes[slideIdx % visualTypes.length];

  if (slide.chartData && slide.chartData.length > 0) {
    return { visualType: chosenType, chartData: slide.chartData };
  }

  // Synthesize concrete visual data from Canonical statistics/timeline/content if not yet populated
  const stats = canonical?.statistics || [];
  if (stats.length > 0) {
    const derived: SlideChartDatum[] = stats.slice(0, 4).map((st, idx) => {
      const numericMatch = st.value.match(/(\d+(?:\.\d+)?)/);
      const parsedNum = numericMatch ? parseFloat(numericMatch[1]) : (idx + 1) * 22;
      const clamped = Math.max(18, Math.min(100, parsedNum > 100 ? 85 - idx * 12 : parsedNum));
      return {
        label: st.metric,
        value: Math.round(clamped),
        displayValue: st.value,
      };
    });
    return { visualType: chosenType, chartData: derived };
  }

  const fallbackFromBullets: SlideChartDatum[] = slide.content.slice(0, 4).map((pt, i) => ({
    label: pt.split(/[:—-]/)[0].slice(0, 26) || `Phase 0${i + 1}`,
    value: [92, 76, 64, 85][i % 4],
    displayValue: [`P${i + 1} · High`, `Active`, `Verified`, `Core`][i % 4],
  }));

  return { visualType: chosenType, chartData: fallbackFromBullets };
}

export default function App() {
  // Projects State
  const [projects, setProjects] = useState<Project[]>(() => {
    const saved = localStorage.getItem("synthesize_projects");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch (e) {
        console.error("Failed to parse projects from localStorage", e);
      }
    }
    return SAMPLE_PROJECTS;
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string>(() => {
    return projects[0]?.id || "";
  });

  const currentProject = projects.find((p) => p.id === selectedProjectId) || projects[0];

  // Collapsible 3-Pane Workbench State
  const [showSidebarPane, setShowSidebarPane] = useState(true);
  const [expandedPane, setExpandedPane] = useState<"none" | "left" | "right">("none");
  const [notebookSearch, setNotebookSearch] = useState("");

  // Workspace Sub-Tab State
  const [leftTab, setLeftTab] = useState<"sources" | "canonical" | "chat">("sources");
  const [rightTab, setRightTab] = useState<
    "summary" | "advisory" | "linkedin" | "twitter" | "presentation" | "infographic" | "video" | "audio"
  >("summary");

  // Toast Notification System
  const [toasts, setToasts] = useState<ToastNotification[]>([]);
  const addToast = (message: string, type: "success" | "warning" | "error" = "success") => {
    const id = "toast-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6);
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  };

  // Source Creation & Universal Media / Transcript State
  const [newSourceTitle, setNewSourceTitle] = useState("");
  const [newSourceContent, setNewSourceContent] = useState("");
  const [newSourceUrl, setNewSourceUrl] = useState("");
  const [newSourceType, setNewSourceType] = useState<SourceDocument["type"]>("text");
  const [newSourceMetadata, setNewSourceMetadata] = useState<SourceMetadata | undefined>(undefined);
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  const [urlFetchError, setUrlFetchError] = useState("");
  const [showAddSourceModal, setShowAddSourceModal] = useState(false);
  const [sourceMethod, setSourceMethod] = useState<"url" | "file" | "ai" | "manual">("url");

  // Multi-File Drag-and-Drop Batch Upload State
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [fileError, setFileError] = useState("");
  const [fileSuccessMessage, setFileSuccessMessage] = useState("");
  const [pendingFiles, setPendingFiles] = useState<PendingUploadedFile[]>([]);
  const [isDraggingOverWorkspace, setIsDraggingOverWorkspace] = useState(false);

  // Direct Prompt / AI Topic Research State
  const [directPromptText, setDirectPromptText] = useState("");
  const [isDraftingPrompt, setIsDraftingPrompt] = useState(false);
  const [promptDraftError, setPromptDraftError] = useState("");

  // Inline Canonical Ground Truth Editing State
  const [isEditingCanonical, setIsEditingCanonical] = useState(false);
  const [newFactInput, setNewFactInput] = useState("");

  // New Project Modal State
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  // API Settings Override State
  const [customGeminiKey, setCustomGeminiKey] = useState(
    () => localStorage.getItem("user_gemini_api_key") || ""
  );
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [isServerKeyAvailable, setIsServerKeyAvailable] = useState(true);
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  // Loading & Error States
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isTransforming, setIsTransforming] = useState(false);
  const [isGeneratingSlides, setIsGeneratingSlides] = useState(false);
  const [isGeneratingInfographic, setIsGeneratingInfographic] = useState(false);
  const [actionError, setActionError] = useState("");

  // Generative Visual Slides & Infographic Studio State
  const [slideDirective, setSlideDirective] = useState("");
  const [slideTheme, setSlideTheme] = useState<"acid" | "blueprint" | "crimson">("acid");
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isSlideKeynotePlaying, setIsSlideKeynotePlaying] = useState(false);
  const isSlideKeynoteRef = useRef<boolean>(false);

  const [infographicDirective, setInfographicDirective] = useState("");
  const [infographicTheme, setInfographicTheme] = useState<"acid" | "blueprint" | "crimson">("acid");
  const [isInfographicNarrating, setIsInfographicNarrating] = useState(false);
  const [activeInfographicSection, setActiveInfographicSection] = useState<number | null>(null);
  const isInfographicNarratingRef = useRef<boolean>(false);

  // Grounded Chat State
  const [chatInputs, setChatInputs] = useState<{ [projectId: string]: string }>({});
  const [chatHistories, setChatHistories] = useState<{ [projectId: string]: ChatMessage[] }>({});
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Real Web Speech API Dual-Host Podcast Player State
  const [isPodcastPlaying, setIsPodcastPlaying] = useState(false);
  const [podcastProgress, setPodcastProgress] = useState(0);
  const [currentPodcastLine, setCurrentPodcastLine] = useState(0);
  const [podcastSpeed, setPodcastSpeed] = useState<number>(1);
  const podcastIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPlayingRef = useRef<boolean>(false);
  const podcastSpeedRef = useRef<number>(1);

  // Clipboard & Checklist States
  const [copiedStates, setCopiedStates] = useState<{ [key: string]: boolean }>({});
  const [checkedActionItems, setCheckedActionItems] = useState<{ [key: string]: boolean }>({});

  // Document Reader, Transcript Drawer & Media Summary Collapse States
  const [previewSourceId, setPreviewSourceId] = useState<string | null>(null);
  const [expandedTranscriptIds, setExpandedTranscriptIds] = useState<{ [id: string]: boolean }>({});
  const [expandedSummaryIds, setExpandedSummaryIds] = useState<{ [id: string]: boolean }>({});
  const [transcriptSearchQuery, setTranscriptSearchQuery] = useState<{ [id: string]: string }>({});
  const [pdfZoom, setPdfZoom] = useState<number>(100);
  const [pdfPage, setPdfPage] = useState<number>(1);
  const [pdfSearch, setPdfSearch] = useState<string>("");

  const getAuthHeaders = () => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const savedKey = localStorage.getItem("user_gemini_api_key") || customGeminiKey;
    if (savedKey.trim()) {
      headers["x-gemini-api-key"] = savedKey.trim();
    }
    return headers;
  };

  // Static hosting direct Gemini fallback schemas
  const ANALYZE_SCHEMA = {
    type: "OBJECT",
    properties: {
      title: { type: "STRING" },
      mainObjective: { type: "STRING" },
      keyFacts: { type: "ARRAY", items: { type: "STRING" } },
      keyEvents: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            event: { type: "STRING" },
            date: { type: "STRING" },
            description: { type: "STRING" },
          },
          required: ["event", "description"],
        },
      },
      statistics: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            metric: { type: "STRING" },
            value: { type: "STRING" },
            context: { type: "STRING" },
          },
          required: ["metric", "value"],
        },
      },
      importantEntities: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            name: { type: "STRING" },
            role: { type: "STRING" },
            description: { type: "STRING" },
          },
          required: ["name", "role", "description"],
        },
      },
      risks: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            risk: { type: "STRING" },
            impact: { type: "STRING" },
            mitigation: { type: "STRING" },
          },
          required: ["risk", "impact"],
        },
      },
      opportunities: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            opportunity: { type: "STRING" },
            benefit: { type: "STRING" },
          },
          required: ["opportunity", "benefit"],
        },
      },
      recommendations: { type: "ARRAY", items: { type: "STRING" } },
      timeline: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            step: { type: "STRING" },
            timeframe: { type: "STRING" },
            description: { type: "STRING" },
          },
          required: ["step", "description"],
        },
      },
      importantQuotes: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            quote: { type: "STRING" },
            attribution: { type: "STRING" },
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
  };

  // Direct client-side fallback when deployed to static hosts without Node backend
  const callGeminiDirectly = async (endpoint: string, body: any, apiKey: string) => {
    if (!apiKey || !apiKey.trim()) {
      throw new Error(
        "No Gemini API key supplied. Click the API Key button in the top bar to connect your key."
      );
    }

    let prompt = "";
    let systemInstruction = "";
    let responseMimeType = "text/plain";
    let responseSchema: any = null;

    if (endpoint === "/api/fetch-url") {
      const { url: targetUrl } = body;
      const classification = detectUrlPlatformClient(targetUrl);
      let oembedInfo: any = null;
      try {
        const oe = await fetch(
          `https://noembed.com/embed?url=${encodeURIComponent(targetUrl)}`
        );
        if (oe.ok) oembedInfo = await oe.json();
      } catch {
        // ignore
      }

      prompt = `
You are Prizm AI's Media & Exact Transcript Intelligence Engine. Analyze this ${classification.platform} link:
URL: ${targetUrl}
Platform: ${classification.platform}
Detected Title: ${oembedInfo?.title || ""}
Detected Author/Channel: ${oembedInfo?.author_name || ""}

Return a JSON object with:
- "title": Full title of the video, reel, or webpage
- "author": Channel, creator, or author name
- "publishedAt": Timeframe or date if known
- "duration": Duration or read time estimate
- "summary": A detailed 2-3 paragraph Executive Summary
- "keyTakeaways": Array of 5 key bullet takeaways
- "transcriptSegments": Array of 10-20 exact timestamped spoken transcript segments ({ "timestamp": "00:12", "text": "Exact spoken words..." })
- "detailedContent": Comprehensive 800+ word reference breakdown of all facts, transcript details, and context.
`;
      responseMimeType = "application/json";
      responseSchema = {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          author: { type: "STRING" },
          publishedAt: { type: "STRING" },
          duration: { type: "STRING" },
          summary: { type: "STRING" },
          keyTakeaways: { type: "ARRAY", items: { type: "STRING" } },
          transcriptSegments: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                timestamp: { type: "STRING" },
                text: { type: "STRING" },
              },
              required: ["timestamp", "text"],
            },
          },
          detailedContent: { type: "STRING" },
        },
        required: [
          "title",
          "author",
          "summary",
          "keyTakeaways",
          "transcriptSegments",
          "detailedContent",
        ],
      };
    } else if (endpoint === "/api/draft-prompt") {
      const { prompt: userPrompt } = body;
      systemInstruction =
        "You are Prizm AI's research report drafting assistant. Write a comprehensive, structured reference text.";
      prompt = `Expand the user's topic into an exceptionally detailed reference document (800-1500 words): "${userPrompt}"`;
    } else if (endpoint === "/api/analyze") {
      const { sources, params = {} } = body;
      const combinedSources = sources
        .map(
          (src: any, index: number) =>
            `--- SOURCE DOCUMENT #${index + 1} (${src.title || "Untitled"}) ---\n${src.content}`
        )
        .join("\n\n");
      systemInstruction =
        "You are Prizm AI's enterprise research analyst specializing in grounded synthesis.";
      prompt = `Analyze the following sources deeply into a Canonical Knowledge Model in ${params.language || "English"}:\n\n${combinedSources}`;
      responseMimeType = "application/json";
      responseSchema = ANALYZE_SCHEMA;
    } else if (endpoint === "/api/chat") {
      const { canonical, history, question } = body;
      const formattedHistory = (history || [])
        .map((msg: any) => `${msg.sender === "user" ? "User" : "Assistant"}: ${msg.text}`)
        .join("\n");
      systemInstruction =
        "You are Prizm AI's research partner grounded strictly in the provided Ground Truth Knowledge.";
      prompt = `=== GROUND TRUTH ===\n${JSON.stringify(canonical, null, 2)}\n\n=== HISTORY ===\n${formattedHistory}\n\n=== QUESTION ===\n${question}`;
    }

    const modelsToTry = ["gemini-3.8-flash", "gemini-2.5-flash"];
    let lastErr: any = null;

    for (const modelName of modelsToTry) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
        const payload: any = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {},
        };

        if (systemInstruction) {
          payload.systemInstruction = { parts: [{ text: systemInstruction }] };
        }
        if (responseMimeType === "application/json") {
          payload.generationConfig.responseMimeType = "application/json";
          if (responseSchema) {
            payload.generationConfig.responseSchema = responseSchema;
          }
        }

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const errText = await response.text();
          throw new Error(errText || response.statusText);
        }

        const result = await response.json();
        const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) throw new Error("Empty response from Gemini API.");

        if (endpoint === "/api/fetch-url") {
          const parsed = JSON.parse(rawText.trim());
          const classification = detectUrlPlatformClient(body.url);
          const segments: TranscriptSegment[] = Array.isArray(parsed.transcriptSegments)
            ? parsed.transcriptSegments
            : [];
          const exactTranscript = segments.map((s) => `[${s.timestamp}] ${s.text}`).join("\n");
          const fullText = `=== SOURCE METADATA ===\nTitle: ${parsed.title}\nPlatform: ${classification.platform}\nAuthor: ${parsed.author}\nURL: ${body.url}\n\n=== EXECUTIVE SUMMARY ===\n${parsed.summary}\n\n=== EXACT VERBATIM TRANSCRIPT ===\n${exactTranscript}\n\n=== COMPREHENSIVE EXTRACTED CONTENT ===\n${parsed.detailedContent}`;
          return {
            text: fullText,
            url: body.url,
            type: classification.type,
            title: parsed.title,
            metadata: {
              platform: classification.platform,
              author: parsed.author,
              publishedAt: parsed.publishedAt || undefined,
              duration: parsed.duration || undefined,
              thumbnailUrl: classification.youtubeId
                ? `https://i.ytimg.com/vi/${classification.youtubeId}/hqdefault.jpg`
                : undefined,
              originalUrl: body.url,
              wordCount: fullText.split(/\s+/).length,
              summary: parsed.summary,
              keyTakeaways: parsed.keyTakeaways,
              exactTranscript,
              transcriptSegments: segments,
            },
          };
        } else if (endpoint === "/api/draft-prompt") {
          return { text: rawText };
        } else if (endpoint === "/api/chat") {
          return { answer: rawText };
        } else {
          return JSON.parse(rawText.trim());
        }
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error("Direct Gemini request failed.");
  };

  const safeFetch = async (url: string, options: RequestInit) => {
    let response: Response;
    try {
      response = await fetch(url, options);
    } catch (e: any) {
      const key = localStorage.getItem("user_gemini_api_key") || customGeminiKey;
      if (key && key.trim()) {
        return await callGeminiDirectly(url, JSON.parse(options.body as string), key);
      }
      throw e;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || contentType.includes("text/html")) {
      const key = localStorage.getItem("user_gemini_api_key") || customGeminiKey;
      if (key && key.trim()) {
        return await callGeminiDirectly(url, JSON.parse(options.body as string), key);
      }
      if (contentType.includes("text/html")) {
        throw new Error(
          "Static hosting detected without backend server. Click the API Key Settings icon in the top bar to connect your Gemini API Key."
        );
      }
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server responded with status ${response.status}`);
    }

    return await response.json();
  };

  useEffect(() => {
    const checkApiKey = async () => {
      try {
        const response = await fetch("/api/config");
        const data = await response.json();
        setHasApiKey(data.hasApiKey);
        setIsServerKeyAvailable(data.hasApiKey);
      } catch {
        setHasApiKey(false);
        setIsServerKeyAvailable(false);
      }
    };
    checkApiKey();
  }, []);

  useEffect(() => {
    localStorage.setItem("synthesize_projects", JSON.stringify(projects));
  }, [projects]);

  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [chatHistories, selectedProjectId]);

  const stopAllSpeech = () => {
    isPlayingRef.current = false;
    isSlideKeynoteRef.current = false;
    isInfographicNarratingRef.current = false;
    setIsPodcastPlaying(false);
    setIsSlideKeynotePlaying(false);
    setIsInfographicNarrating(false);
    setActiveInfographicSection(null);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    if (podcastIntervalRef.current) {
      clearInterval(podcastIntervalRef.current);
      podcastIntervalRef.current = null;
    }
  };

  useEffect(() => {
    setCurrentSlideIndex(0);
    setIsEditingCanonical(false);
    stopAllSpeech();
    setPodcastProgress(0);
    setCurrentPodcastLine(0);
    return () => {
      stopAllSpeech();
    };
  }, [selectedProjectId]);

  // 1. Live Auto-Advancing Voice Keynote Player for Generative Slides (Just like the Podcast!)
  const speakSlideKeynote = (slideIdx: number) => {
    const slides = currentProject?.artifacts?.presentation?.slides || [];
    if (slideIdx >= slides.length || !isSlideKeynoteRef.current) {
      stopAllSpeech();
      return;
    }

    setCurrentSlideIndex(slideIdx);
    const slide = slides[slideIdx];
    const narrationText = `${slide.title}. ${slide.subtitle || ""}. ${slide.speakerNotes || slide.content.join(". ")}`;
    const hasSynth = typeof window !== "undefined" && "speechSynthesis" in window;

    if (hasSynth) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(narrationText);
      utterance.rate = 1.04;
      utterance.pitch = 1.0;

      utterance.onend = () => {
        if (isSlideKeynoteRef.current) {
          speakSlideKeynote(slideIdx + 1);
        }
      };
      utterance.onerror = () => {
        if (isSlideKeynoteRef.current) {
          setTimeout(() => speakSlideKeynote(slideIdx + 1), 1500);
        }
      };
      window.speechSynthesis.speak(utterance);
    } else {
      podcastIntervalRef.current = setTimeout(() => {
        if (isSlideKeynoteRef.current) {
          speakSlideKeynote(slideIdx + 1);
        }
      }, 4500);
    }
  };

  const toggleSlideKeynotePlayback = () => {
    if (isSlideKeynotePlaying) {
      stopAllSpeech();
    } else {
      stopAllSpeech();
      isSlideKeynoteRef.current = true;
      setIsSlideKeynotePlaying(true);
      speakSlideKeynote(currentSlideIndex);
    }
  };

  // 2. Live Audio Walkthrough for Generative Visual Infographic
  const speakInfographicSection = (secIdx: number) => {
    const info = currentProject?.artifacts?.infographic;
    if (!info || !isInfographicNarratingRef.current) {
      stopAllSpeech();
      return;
    }

    const sections = info.sections || [];
    if (secIdx >= sections.length) {
      stopAllSpeech();
      return;
    }

    setActiveInfographicSection(secIdx);
    const sec = sections[secIdx];
    const intro =
      secIdx === 0
        ? `Visual Infographic Walkthrough: ${info.headline}. ${info.subheadline || ""}. `
        : "";
    const textToSpeak = `${intro}Section ${secIdx + 1}: ${sec.title}. ${sec.content}`;
    const hasSynth = typeof window !== "undefined" && "speechSynthesis" in window;

    if (hasSynth) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.rate = 1.05;
      utterance.onend = () => {
        if (isInfographicNarratingRef.current) {
          speakInfographicSection(secIdx + 1);
        }
      };
      utterance.onerror = () => {
        if (isInfographicNarratingRef.current) {
          setTimeout(() => speakInfographicSection(secIdx + 1), 1500);
        }
      };
      window.speechSynthesis.speak(utterance);
    } else {
      podcastIntervalRef.current = setTimeout(() => {
        if (isInfographicNarratingRef.current) {
          speakInfographicSection(secIdx + 1);
        }
      }, 4000);
    }
  };

  const toggleInfographicNarration = () => {
    if (isInfographicNarrating) {
      stopAllSpeech();
    } else {
      stopAllSpeech();
      isInfographicNarratingRef.current = true;
      setIsInfographicNarrating(true);
      speakInfographicSection(0);
    }
  };

  // 3. Real Web Speech API Dual-Host Podcast Playback Engine
  const speakPodcastLine = (lineIndex: number) => {
    const script = currentProject?.artifacts?.audioOverview?.script || [];
    if (lineIndex >= script.length || !isPlayingRef.current) {
      stopAllSpeech();
      setPodcastProgress(100);
      return;
    }

    setCurrentPodcastLine(lineIndex);
    setPodcastProgress(Math.round(((lineIndex + 1) / script.length) * 100));

    const segment = script[lineIndex];
    const hasSynth = typeof window !== "undefined" && "speechSynthesis" in window;

    if (hasSynth) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(segment.dialogue);
      const voices = window.speechSynthesis.getVoices();
      const hosts = currentProject?.artifacts?.audioOverview?.hosts || ["Host A", "Host B"];
      const isSecondHost =
        segment.speaker === hosts[1] ||
        segment.speaker.toLowerCase().includes("b") ||
        lineIndex % 2 === 1;

      if (voices.length > 1) {
        const englishVoices = voices.filter((v) => v.lang.startsWith("en"));
        const pool = englishVoices.length >= 2 ? englishVoices : voices;
        utterance.voice = pool[isSecondHost ? 1 : 0];
      }

      utterance.pitch = isSecondHost ? 0.92 : 1.06;
      utterance.rate = podcastSpeedRef.current;

      utterance.onend = () => {
        if (isPlayingRef.current) {
          speakPodcastLine(lineIndex + 1);
        }
      };

      utterance.onerror = () => {
        if (isPlayingRef.current) {
          setTimeout(() => speakPodcastLine(lineIndex + 1), 1200);
        }
      };

      window.speechSynthesis.speak(utterance);
    } else {
      const durationMs =
        Math.max(2000, Math.min(6000, segment.dialogue.length * 45)) / podcastSpeedRef.current;
      podcastIntervalRef.current = setTimeout(() => {
        if (isPlayingRef.current) {
          speakPodcastLine(lineIndex + 1);
        }
      }, durationMs);
    }
  };

  const togglePodcastPlayback = () => {
    const script = currentProject?.artifacts?.audioOverview?.script || [];
    if (script.length === 0) return;

    if (isPodcastPlaying) {
      stopAllSpeech();
    } else {
      stopAllSpeech();
      isPlayingRef.current = true;
      setIsPodcastPlaying(true);
      const startLine = currentPodcastLine >= script.length - 1 ? 0 : currentPodcastLine;
      speakPodcastLine(startLine);
    }
  };

  const jumpToPodcastLine = (idx: number) => {
    const script = currentProject?.artifacts?.audioOverview?.script || [];
    if (idx < 0 || idx >= script.length) return;
    setCurrentPodcastLine(idx);
    setPodcastProgress(Math.round(((idx + 1) / script.length) * 100));
    if (isPodcastPlaying) {
      isPlayingRef.current = true;
      speakPodcastLine(idx);
    }
  };

  const changePodcastSpeed = (nextSpeed: number) => {
    setPodcastSpeed(nextSpeed);
    podcastSpeedRef.current = nextSpeed;
    if (isPodcastPlaying) {
      speakPodcastLine(currentPodcastLine);
    }
  };

  const copyToClipboard = (text: string, key: string, label = "Copied to clipboard") => {
    navigator.clipboard.writeText(text);
    setCopiedStates((prev) => ({ ...prev, [key]: true }));
    addToast(label, "success");
    setTimeout(() => {
      setCopiedStates((prev) => ({ ...prev, [key]: false }));
    }, 2000);
  };

  // On-Demand Generative Visual Slides & Infographic Synthesis
  const handleGenerateVisualArtifact = async (targetType: "slides" | "infographic") => {
    if (!currentProject.canonical) {
      addToast("Build Canonical Ground Truth first.", "warning");
      return;
    }

    stopAllSpeech();
    if (targetType === "slides") {
      setIsGeneratingSlides(true);
    } else {
      setIsGeneratingInfographic(true);
    }

    try {
      const data = await safeFetch("/api/generate-visual", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          canonical: currentProject.canonical,
          params: currentProject.params,
          targetType,
          customDirective:
            targetType === "slides" ? slideDirective.trim() : infographicDirective.trim(),
        }),
      });

      setProjects((prev) =>
        prev.map((p) => {
          if (p.id !== selectedProjectId || !p.artifacts) return p;
          if (targetType === "slides" && data.slides) {
            return {
              ...p,
              artifacts: {
                ...p.artifacts,
                presentation: { slides: data.slides },
              },
            };
          } else if (targetType === "infographic" && data.headline) {
            return {
              ...p,
              artifacts: {
                ...p.artifacts,
                infographic: data as Infographic,
              },
            };
          }
          return p;
        })
      );

      if (targetType === "slides") {
        setCurrentSlideIndex(0);
        addToast("Generated new Visual Slide Deck with live charts!", "success");
      } else {
        addToast("Generated new Visual Infographic Poster!", "success");
      }
    } catch (err: any) {
      addToast(err.message || `Failed to generate ${targetType}`, "error");
    } finally {
      setIsGeneratingSlides(false);
      setIsGeneratingInfographic(false);
    }
  };

  // PDF & Text Extraction Helpers
  const extractTextFromPdf = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const arrayBuffer = reader.result as ArrayBuffer;
          const pdfjsLib = (window as any).pdfjsLib;
          if (!pdfjsLib) {
            throw new Error("PDF.js library is not loaded.");
          }
          pdfjsLib.GlobalWorkerOptions.workerSrc =
            "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js";

          const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
          const pdf = await loadingTask.promise;
          let fullText = "";

          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str).join(" ");
            fullText += `[Page ${i}]\n${pageText}\n\n`;
          }
          resolve(fullText.trim());
        } catch (err: any) {
          reject(
            new Error(
              err.message || "Failed to extract text from PDF. Check that it is not encrypted."
            )
          );
        }
      };
      reader.onerror = () => reject(new Error("Failed to read PDF binary data."));
      reader.readAsArrayBuffer(file);
    });
  };

  const extractTextFromTextFile = async (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read text file."));
      reader.readAsText(file);
    });
  };

  const processMultipleFiles = async (fileList: FileList | File[], directIngestToProject = false) => {
    const filesArray = Array.from(fileList);
    if (filesArray.length === 0) return;

    setIsProcessingFile(true);
    setFileError("");
    setFileSuccessMessage("");

    const extractedBatch: PendingUploadedFile[] = [];
    const errors: string[] = [];

    for (const file of filesArray) {
      try {
        const fileName = file.name;
        const ext = fileName.split(".").pop()?.toLowerCase() || "txt";
        let text = "";

        if (ext === "pdf" || file.type === "application/pdf") {
          text = await extractTextFromPdf(file);
        } else if (
          ["txt", "md", "json", "csv", "xml", "log", "tsv", "html"].includes(ext) ||
          file.type.startsWith("text/")
        ) {
          text = await extractTextFromTextFile(file);
        } else {
          throw new Error(`Unsupported file "${fileName}". Use PDF, TXT, MD, CSV, JSON, or XML.`);
        }

        if (!text.trim()) {
          throw new Error(`"${fileName}" contained no extractable text.`);
        }

        const cleanTitle = fileName.replace(/\.[^/.]+$/, "") || fileName;
        extractedBatch.push({
          name: cleanTitle,
          content: text,
          wordCount: text.trim().split(/\s+/).length,
          fileType: ext.toUpperCase(),
        });
      } catch (err: any) {
        errors.push(err.message || `Failed to parse ${file.name}`);
      }
    }

    setIsProcessingFile(false);

    if (errors.length > 0) {
      setFileError(errors.join(" | "));
      addToast(errors[0], "error");
    }

    if (extractedBatch.length > 0) {
      if (directIngestToProject) {
        const newDocs: SourceDocument[] = extractedBatch.map((item, idx) => ({
          id: `src-doc-${Date.now()}-${idx}`,
          title: item.name,
          content: item.content,
          type: "document",
          metadata: {
            platform: `${item.fileType} Document`,
            fileType: item.fileType,
            wordCount: item.wordCount,
            summary: `Uploaded ${item.fileType} document containing ${item.wordCount.toLocaleString()} words.`,
          },
        }));

        setProjects((prev) =>
          prev.map((p) =>
            p.id === currentProject.id ? { ...p, sources: [...p.sources, ...newDocs] } : p
          )
        );
        addToast(
          `Ingested ${newDocs.length} document${newDocs.length > 1 ? "s" : ""} into "${currentProject.name}"`,
          "success"
        );
      } else {
        setPendingFiles((prev) => [...prev, ...extractedBatch]);
        if (extractedBatch.length === 1 && pendingFiles.length === 0) {
          setNewSourceTitle(extractedBatch[0].name);
          setNewSourceContent(extractedBatch[0].content);
          setNewSourceType("document");
          setNewSourceMetadata({
            platform: `${extractedBatch[0].fileType} Document`,
            fileType: extractedBatch[0].fileType,
            wordCount: extractedBatch[0].wordCount,
          });
        } else {
          const allBatch = [...pendingFiles, ...extractedBatch];
          setNewSourceTitle(
            `${allBatch.length} Batch Documents (${allBatch.map((f) => f.name).join(", ").slice(0, 45)})`
          );
          setNewSourceContent(
            allBatch
              .map((f) => `=== DOCUMENT: ${f.name} (${f.fileType}) ===\n${f.content}`)
              .join("\n\n")
          );
          setNewSourceType("document");
        }
        setFileSuccessMessage(
          `Parsed ${extractedBatch.length} file${extractedBatch.length > 1 ? "s" : ""} (${extractedBatch
            .reduce((acc, f) => acc + f.wordCount, 0)
            .toLocaleString()} total words).`
        );
      }
    }
  };

  const handleDocumentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await processMultipleFiles(e.target.files, false);
      e.target.value = "";
    }
  };

  const handleWorkspaceDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOverWorkspace(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processMultipleFiles(e.dataTransfer.files, true);
    }
  };

  // Universal Link, YouTube Video, Instagram Reel Exact Transcript + Metadata Summarizer
  const handleFetchUrl = async (overrideUrl?: string) => {
    const targetUrl = (overrideUrl ?? newSourceUrl).trim();
    if (!targetUrl) return;
    if (overrideUrl) setNewSourceUrl(overrideUrl);

    setIsFetchingUrl(true);
    setUrlFetchError("");

    try {
      const data = await safeFetch("/api/fetch-url", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ url: targetUrl }),
      });

      setNewSourceTitle(data.title || `Ingested: ${targetUrl}`);
      setNewSourceContent(data.text || "");
      setNewSourceType(data.type || "url");
      setNewSourceMetadata(data.metadata || undefined);

      const segCount = data.metadata?.transcriptSegments?.length || 0;
      addToast(
        segCount > 0
          ? `Extracted ${segCount} exact transcript lines & metadata from ${data.metadata?.platform}!`
          : `Extracted metadata & summary from ${data.metadata?.platform || "URL"}`,
        "success"
      );
    } catch (err: any) {
      setUrlFetchError(err.message || "Failed to extract transcript and metadata from URL.");
      addToast(err.message || "URL extraction error", "error");
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const handleDraftPrompt = async () => {
    if (!directPromptText.trim()) return;
    setIsDraftingPrompt(true);
    setPromptDraftError("");

    try {
      const data = await safeFetch("/api/draft-prompt", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ prompt: directPromptText }),
      });

      const title = `AI Research: ${directPromptText.trim().slice(0, 42)}${
        directPromptText.trim().length > 42 ? "..." : ""
      }`;
      setNewSourceTitle(title);
      setNewSourceContent(data.text);
      setNewSourceType("text");
      setNewSourceMetadata({
        platform: "Prizm AI Research Dossier",
        wordCount: (data.text || "").split(/\s+/).length,
        summary: `AI-synthesized reference report for query: "${directPromptText.trim()}"`,
      });
      setDirectPromptText("");
      addToast("Reference dossier drafted", "success");
    } catch (err: any) {
      setPromptDraftError(err.message || "Failed to generate reference report.");
    } finally {
      setIsDraftingPrompt(false);
    }
  };

  const handleAddSource = (ingestSeparateFiles = false) => {
    const targetId = selectedProjectId || currentProject?.id || projects[0]?.id;
    if (!targetId) {
      addToast("Please select or create a Notebook first.", "warning");
      return;
    }

    if (ingestSeparateFiles && pendingFiles.length > 1) {
      const docs: SourceDocument[] = pendingFiles.map((f, idx) => ({
        id: `src-batch-${Date.now()}-${idx}`,
        title: f.name,
        content: f.content,
        type: "document",
        metadata: {
          platform: `${f.fileType} Document`,
          fileType: f.fileType,
          wordCount: f.wordCount,
          summary: `Ingested ${f.fileType} file (${f.wordCount.toLocaleString()} words).`,
        },
      }));

      setProjects((prev) =>
        prev.map((p) => (p.id === targetId ? { ...p, sources: [...p.sources, ...docs] } : p))
      );
      addToast(`Added ${docs.length} separate documents to notebook`, "success");
    } else {
      const rawContent = newSourceContent.trim();
      const rawUrl = newSourceUrl.trim();

      if (!rawContent && !rawUrl) {
        addToast("Provide document content or fetch a URL first.", "warning");
        return;
      }

      const classification = rawUrl ? detectUrlPlatformClient(rawUrl) : null;
      const finalTitle =
        newSourceTitle.trim() ||
        (classification
          ? `${classification.platform}: ${rawUrl.slice(0, 35)}`
          : `Source: ${rawContent.slice(0, 28)}...`);

      const finalContent = rawContent || `Reference link: ${rawUrl}`;
      const newId = "src-" + Date.now();

      const newSource: SourceDocument = {
        id: newId,
        title: finalTitle,
        content: finalContent,
        type:
          newSourceType !== "text"
            ? newSourceType
            : classification
              ? classification.type
              : "text",
        url: rawUrl || undefined,
        metadata: newSourceMetadata || {
          platform: classification?.platform || "Manual Text Entry",
          wordCount: finalContent.split(/\s+/).length,
        },
      };

      setProjects((prev) =>
        prev.map((p) => (p.id === targetId ? { ...p, sources: [...p.sources, newSource] } : p))
      );
      if (newSource.metadata?.transcriptSegments?.length) {
        setExpandedTranscriptIds((prev) => ({ ...prev, [newId]: true }));
      }
      addToast(`Added "${finalTitle}" to Sources`, "success");
    }

    setNewSourceTitle("");
    setNewSourceContent("");
    setNewSourceUrl("");
    setNewSourceType("text");
    setNewSourceMetadata(undefined);
    setPendingFiles([]);
    setFileError("");
    setFileSuccessMessage("");
    setShowAddSourceModal(false);
  };

  const handleDeleteSource = (sourceId: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === selectedProjectId
          ? { ...p, sources: p.sources.filter((s) => s.id !== sourceId) }
          : p
      )
    );
    addToast("Source removed from notebook", "warning");
  };

  const updateCanonicalModel = (updater: (prev: CanonicalKnowledge) => CanonicalKnowledge) => {
    if (!currentProject.canonical) return;
    const updated = updater(currentProject.canonical);
    setProjects((prev) =>
      prev.map((p) => (p.id === selectedProjectId ? { ...p, canonical: updated } : p))
    );
  };

  const handleRunAnalysis = async () => {
    if (!currentProject || currentProject.sources.length === 0) return;
    setIsAnalyzing(true);
    setActionError("");

    try {
      const data = await safeFetch("/api/analyze", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          sources: currentProject.sources,
          params: currentProject.params,
        }),
      });

      setProjects((prev) =>
        prev.map((p) => (p.id === selectedProjectId ? { ...p, canonical: data } : p))
      );
      setLeftTab("canonical");
      addToast("Canonical Ground Truth synthesized", "success");
    } catch (err: any) {
      setActionError(err.message || "Failed to analyze source documents.");
      addToast(err.message || "Analysis failed", "error");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateArtifacts = async () => {
    if (!currentProject || !currentProject.canonical) return;
    setIsTransforming(true);
    setActionError("");
    stopAllSpeech();

    try {
      const data = await safeFetch("/api/transform", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          canonical: currentProject.canonical,
          params: currentProject.params,
        }),
      });

      setProjects((prev) =>
        prev.map((p) => (p.id === selectedProjectId ? { ...p, artifacts: data } : p))
      );
      addToast("All 8 Prizm AI artifacts & visual charts generated!", "success");
    } catch (err: any) {
      setActionError(err.message || "Failed to synthesize communication outputs.");
      addToast(err.message || "Transformation failed", "error");
    } finally {
      setIsTransforming(false);
    }
  };

  const handleSendMessage = async (e?: React.FormEvent, presetQuestion?: string) => {
    if (e) e.preventDefault();
    const chatInput = (presetQuestion ?? chatInputs[selectedProjectId] ?? "").trim();
    if (!chatInput || !currentProject.canonical) return;

    const userMsg: ChatMessage = {
      id: "chat-msg-" + Date.now(),
      sender: "user",
      text: chatInput,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };

    const currentHistory = chatHistories[selectedProjectId] || [];
    const updatedHistory = [...currentHistory, userMsg];

    setChatHistories((prev) => ({
      ...prev,
      [selectedProjectId]: updatedHistory,
    }));
    if (!presetQuestion) {
      setChatInputs((prev) => ({ ...prev, [selectedProjectId]: "" }));
    }
    setIsChatLoading(true);

    try {
      const data = await safeFetch("/api/chat", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          canonical: currentProject.canonical,
          history: updatedHistory,
          question: userMsg.text,
        }),
      });

      const assistantMsg: ChatMessage = {
        id: "chat-msg-" + (Date.now() + 1),
        sender: "assistant",
        text: data.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };

      setChatHistories((prev) => ({
        ...prev,
        [selectedProjectId]: [...updatedHistory, assistantMsg],
      }));
    } catch (err: any) {
      const errorMsg: ChatMessage = {
        id: "chat-msg-err-" + Date.now(),
        sender: "assistant",
        text: `Error: ${err.message || "Failed to query Grounded Partner."}`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      };
      setChatHistories((prev) => ({
        ...prev,
        [selectedProjectId]: [...updatedHistory, errorMsg],
      }));
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    const newProj: Project = {
      id: "proj-" + Date.now(),
      name: newProjectName.trim(),
      createdAt: new Date().toISOString(),
      params: {
        audience: "General Professional",
        tone: "Professional & Formal",
        language: "English",
        objective: "Informative Synthesis",
        detailLevel: "Balanced",
        domain: "Corporate Operations",
      },
      sources: [],
    };

    setProjects((prev) => [newProj, ...prev]);
    setSelectedProjectId(newProj.id);
    setNewProjectName("");
    setShowNewProjectModal(false);
    setLeftTab("sources");
    addToast(`Created notebook "${newProj.name}"`, "success");
  };

  const handleDeleteProject = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (projects.length <= 1) {
      addToast("You must keep at least one active notebook.", "warning");
      return;
    }
    const filtered = projects.filter((p) => p.id !== projectId);
    setProjects(filtered);
    if (selectedProjectId === projectId) {
      setSelectedProjectId(filtered[0].id);
    }
    addToast("Notebook deleted", "warning");
  };

  const handleUpdateParams = (field: keyof GenerationParams, value: string) => {
    setProjects((prev) =>
      prev.map((p) =>
        p.id === selectedProjectId ? { ...p, params: { ...p.params, [field]: value } } : p
      )
    );
  };

  const toggleActionItem = (itemKey: string) => {
    setCheckedActionItems((prev) => ({
      ...prev,
      [itemKey]: !prev[itemKey],
    }));
  };

  // Multi-Format Export Suite (Branded as Prizm AI)
  const handleExportMarkdown = () => {
    const c = currentProject.canonical;
    const a = currentProject.artifacts;
    const lines: string[] = [
      `# ${currentProject.name}`,
      `> Generated by **Prizm AI** · Audience: ${currentProject.params.audience} · Tone: ${currentProject.params.tone} · Language: ${currentProject.params.language}`,
      ``,
      `## 01. Ingested Sources (${currentProject.sources.length})`,
      ...currentProject.sources.map(
        (s, i) =>
          `### ${i + 1}. ${s.title} (${s.metadata?.platform || s.type.toUpperCase()})\n${
            s.url ? `- **URL**: ${s.url}\n` : ""
          }${s.metadata?.summary ? `- **Summary**: ${s.metadata.summary}\n` : ""}${
            s.metadata?.exactTranscript
              ? `\n#### Exact Verbatim Transcript\n\`\`\`\n${s.metadata.exactTranscript}\n\`\`\`\n`
              : ""
          }`
      ),
    ];

    if (c) {
      lines.push(
        ``,
        `---`,
        `## 02. Canonical Knowledge Model: ${c.title}`,
        `**Core Strategic Objective:** ${c.mainObjective}`,
        ``,
        `### Grounded Key Facts`,
        ...c.keyFacts.map((f) => `- ${f}`),
        ``,
        `### Key Statistics & Metrics`,
        ...c.statistics.map(
          (s) => `- **${s.metric}**: \`${s.value}\` ${s.context ? `(${s.context})` : ""}`
        )
      );
    }

    if (a) {
      lines.push(
        ``,
        `---`,
        `## 03. Executive Summary`,
        `**Purpose:** ${a.executiveSummary.purpose}`,
        ``,
        `### Key Findings`,
        ...a.executiveSummary.keyFindings.map((f) => `- ${f}`),
        ``,
        `**Conclusion:** ${a.executiveSummary.conclusion}`
      );
    }

    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prizm_ai_${currentProject.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.md`;
    link.click();
    addToast("Downloaded Prizm AI Markdown Dossier (.md)", "success");
  };

  const handleExportHtmlSlides = () => {
    const slides = currentProject.artifacts?.presentation?.slides;
    if (!slides || slides.length === 0) {
      addToast("Synthesize artifacts first to export HTML Slide Deck.", "warning");
      return;
    }

    const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Prizm AI — ${currentProject.name} Generative Presentation</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Plus+Jakarta+Sans:wght@400;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #F7F5F0; color: #111111; font-family: 'Plus Jakarta Sans', sans-serif; min-height: 100vh; display: flex; flex-direction: column; }
  header { background: #111111; color: #FFFFFF; padding: 16px 32px; display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #111111; font-family: 'JetBrains Mono', monospace; font-size: 13px; }
  main { flex: 1; display: flex; align-items: center; justify-content: center; padding: 36px; }
  .slide-card { background: #FFFFFF; border: 3px solid #111111; box-shadow: 8px 8px 0px #111111; max-width: 1080px; width: 100%; min-height: 540px; padding: 44px; display: none; flex-direction: column; justify-content: space-between; }
  .slide-card.active { display: flex; }
  .grid-2 { display: grid; grid-template-columns: 1.15fr 0.85fr; gap: 32px; align-items: start; }
  .kicker { display: inline-block; background: #FFE600; border: 2px solid #111111; padding: 4px 12px; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 12px; margin-bottom: 14px; }
  h1 { font-family: 'Syne', sans-serif; font-size: 32px; line-height: 1.15; margin-bottom: 20px; }
  ul { list-style: none; }
  li { font-size: 17px; line-height: 1.5; margin-bottom: 12px; padding-left: 22px; position: relative; }
  li::before { content: "■"; position: absolute; left: 0; color: #111111; }
  .chart-box { background: #F7F5F0; border: 2px solid #111111; padding: 20px; box-shadow: 4px 4px 0px #111111; }
  .bar-row { margin-bottom: 12px; }
  .bar-track { height: 20px; background: #EAE6DF; border: 2px solid #111111; margin-top: 4px; }
  .bar-fill { height: 100%; background: #FFE600; border-right: 2px solid #111111; }
  .notes-box { margin-top: 24px; padding: 14px; background: #111111; color: #FFFFFF; font-size: 13px; border: 2px solid #111111; }
  footer { padding: 16px 32px; border-top: 2px solid #111111; background: #EAE6DF; display: flex; justify-content: space-between; align-items: center; }
  button { background: #FFE600; border: 2px solid #111111; box-shadow: 3px 3px 0px #111111; padding: 10px 20px; font-weight: 700; font-family: 'JetBrains Mono', monospace; cursor: pointer; }
</style>
</head>
<body>
  <header>
    <span>PRIZM AI // ${currentProject.name.toUpperCase()}</span>
    <span id="counter">SLIDE 01 / ${String(slides.length).padStart(2, "0")}</span>
  </header>
  <main>
    ${slides
      .map((s, idx) => {
        const enriched = getEnrichedSlideVisualData(s, idx, currentProject.canonical);
        return `
    <div class="slide-card ${idx === 0 ? "active" : ""}">
      <div class="grid-2">
        <div>
          <span class="kicker">SLIDE ${String(s.slideNumber).padStart(2, "0")}</span>
          <h1>${s.title}</h1>
          <ul>
            ${s.content.map((pt) => `<li>${pt}</li>`).join("")}
          </ul>
        </div>
        <div class="chart-box">
          <div style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;margin-bottom:14px;text-transform:uppercase;">Generated Visual Data Model</div>
          ${enriched.chartData
            .map(
              (d) => `
            <div class="bar-row">
              <div style="display:flex;justify-content:space-between;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:700;">
                <span>${d.label}</span>
                <span>${d.displayValue}</span>
              </div>
              <div class="bar-track"><div class="bar-fill" style="width:${Math.min(100, Math.max(12, d.value))}%"></div></div>
            </div>`
            )
            .join("")}
        </div>
      </div>
      <div class="notes-box">
        <strong style="color:#FFE600;font-family:'JetBrains Mono',monospace;">KEYNOTE VOICE SCRIPT:</strong> "${s.speakerNotes}"
      </div>
    </div>`;
      })
      .join("")}
  </main>
  <footer>
    <button onclick="prev()">← PREVIOUS SLIDE</button>
    <span style="font-family:'JetBrains Mono',monospace;font-size:12px;">Prizm AI Generative Slide Deck · Use Arrow Keys</span>
    <button onclick="next()">NEXT SLIDE →</button>
  </footer>
  <script>
    let current = 0;
    const cards = document.querySelectorAll('.slide-card');
    const counter = document.getElementById('counter');
    function show(idx) {
      cards.forEach(c => c.classList.remove('active'));
      current = (idx + cards.length) % cards.length;
      cards[current].classList.add('active');
      counter.textContent = 'SLIDE ' + String(current + 1).padStart(2, '0') + ' / ' + String(cards.length).padStart(2, '0');
    }
    function next() { show(current + 1); }
    function prev() { show(current - 1); }
    window.addEventListener('keydown', e => {
      if (e.key === 'ArrowRight' || e.key === ' ') next();
      if (e.key === 'ArrowLeft') prev();
    });
  </script>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prizm_ai_${currentProject.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_slides.html`;
    link.click();
    addToast("Exported Standalone Visual HTML Slide Deck (.html)", "success");
  };

  const handleExportInfographicPoster = () => {
    const info = currentProject.artifacts?.infographic;
    if (!info) return;

    const posterHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Prizm AI Infographic — ${info.headline}</title>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&family=Plus+Jakarta+Sans:wght@400;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #EAE6DF; color: #111111; font-family: 'Plus Jakarta Sans', sans-serif; padding: 40px; }
  .poster { max-width: 980px; margin: 0 auto; background: #F7F5F0; border: 4px solid #111111; box-shadow: 12px 12px 0px #111111; }
  .masthead { background: #111111; color: #FFFFFF; padding: 36px; border-bottom: 4px solid #111111; }
  .kicker { color: #FFE600; font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 700; text-transform: uppercase; }
  h1 { font-family: 'Syne', sans-serif; font-size: 38px; line-height: 1.1; margin-top: 8px; }
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; padding: 28px; background: #FFE600; border-bottom: 4px solid #111111; }
  .kpi-card { background: #FFFFFF; border: 2px solid #111111; box-shadow: 4px 4px 0px #111111; padding: 16px; }
  .sec-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; padding: 28px; }
  .sec-card { background: #FFFFFF; border: 2px solid #111111; box-shadow: 4px 4px 0px #111111; padding: 20px; }
</style>
</head>
<body>
  <div class="poster">
    <div class="masthead">
      <div class="kicker">PRIZM AI // GENERATIVE VISUAL INFOGRAPHIC</div>
      <h1>${info.headline}</h1>
      <p style="margin-top:10px;color:#EAE6DF;font-size:14px;">${info.subheadline || currentProject.canonical?.mainObjective || ""}</p>
    </div>
    <div class="kpi-grid">
      ${info.keyMetrics
        .map(
          (m) => `
        <div class="kpi-card">
          <div style="font-family:'JetBrains Mono',monospace;font-size:24px;font-weight:800;">${m.value}</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;text-transform:uppercase;margin-top:4px;">${m.label}</div>
        </div>`
        )
        .join("")}
    </div>
    <div class="sec-grid">
      ${info.sections
        .map(
          (s, i) => `
        <div class="sec-card">
          <div style="font-family:'JetBrains Mono',monospace;font-size:11px;font-weight:700;background:#111111;color:#FFE600;display:inline-block;padding:2px 8px;margin-bottom:8px;">MODULE 0${i + 1}</div>
          <h3 style="font-family:'Syne',sans-serif;font-size:18px;margin-bottom:8px;">${s.title}</h3>
          <p style="font-size:13px;line-height:1.5;color:#4A4742;">${s.content}</p>
        </div>`
        )
        .join("")}
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([posterHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `prizm_ai_infographic_${currentProject.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}.html`;
    link.click();
    addToast("Downloaded Standalone Visual Infographic Poster (.html)", "success");
  };

  const handleExportJson = () => {
    const projectJson = JSON.stringify(currentProject, null, 2);
    const fileBlob = new Blob([projectJson], { type: "application/json" });
    const fileUrl = URL.createObjectURL(fileBlob);
    const link = document.createElement("a");
    link.href = fileUrl;
    link.download = `prizm_ai_${currentProject.name.toLowerCase().replace(/[^a-z0-9]+/g, "_")}_package.json`;
    link.click();
    addToast("Exported Prizm AI JSON Package (.json)", "success");
  };

  const filteredProjects = projects.filter((p) =>
    p.name.toLowerCase().includes(notebookSearch.toLowerCase())
  );

  const SAMPLE_MEDIA_LINKS = [
    {
      label: "YouTube AI Neural Nets (3Blue1Brown)",
      url: "https://www.youtube.com/watch?v=aircAruvnKk",
    },
    {
      label: "YouTube Short / Tech Clip",
      url: "https://www.youtube.com/shorts/5qap5aO4i9A",
    },
    {
      label: "CISA Security Advisory",
      url: "https://www.cisa.gov/news-events/cybersecurity-advisories",
    },
  ];

  // Theme palette helper for Generative Slides & Infographic
  const getVisualThemeColors = (theme: "acid" | "blueprint" | "crimson") => {
    if (theme === "blueprint") {
      return {
        accentBg: "#1D4ED8",
        accentText: "#FFFFFF",
        secondaryBg: "#DBEAFE",
        barColor: "#1D4ED8",
        headerBg: "#0F172A",
      };
    }
    if (theme === "crimson") {
      return {
        accentBg: "#FF2A2A",
        accentText: "#FFFFFF",
        secondaryBg: "#FEE2E2",
        barColor: "#FF2A2A",
        headerBg: "#111111",
      };
    }
    return {
      accentBg: "#FFE600",
      accentText: "#111111",
      secondaryBg: "#FEF9C3",
      barColor: "#FFE600",
      headerBg: "#111111",
    };
  };

  return (
    <div
      id="app-root"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingOverWorkspace(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setIsDraggingOverWorkspace(false);
      }}
      onDrop={handleWorkspaceDrop}
      className="min-h-screen bg-[#F7F5F0] text-[#111111] flex flex-col font-sans selection:bg-[#FFE600] selection:text-[#111111] relative"
    >
      {/* GLOBAL DRAG-AND-DROP OVERLAY */}
      {isDraggingOverWorkspace && (
        <div className="fixed inset-0 z-50 bg-[#111111]/80 backdrop-blur-xs flex items-center justify-center p-8 pointer-events-none">
          <div className="bg-[#FFE600] border-4 border-[#111111] shadow-[8px_8px_0px_#FFFFFF] p-10 max-w-lg w-full text-center space-y-3">
            <Upload className="w-12 h-12 mx-auto text-[#111111]" />
            <h2 className="text-2xl font-display font-extrabold uppercase tracking-tight">
              Drop Files Into Prizm AI
            </h2>
            <p className="text-xs font-mono font-semibold text-[#111111]/80">
              PDF · TXT · MD · CSV · JSON · XML — All dropped files will be parsed and added to "{currentProject.name}"
            </p>
          </div>
        </div>
      )}

      {/* BRUTALIST TOAST NOTIFICATIONS */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto border-2 border-[#111111] shadow-[4px_4px_0px_#111111] px-4 py-3 flex items-center justify-between text-xs font-mono font-bold ${
              t.type === "error"
                ? "bg-[#FF2A2A] text-white"
                : t.type === "warning"
                  ? "bg-[#FFE600] text-[#111111]"
                  : "bg-[#111111] text-[#FFE600]"
            }`}
          >
            <span>{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
              className="ml-3 opacity-80 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* TOP BAR CONTRACT: 3 ZONES (Brand Wordmark "PRIZM AI" — Navigation — Primary Actions) */}
      <header
        id="app-header"
        className="bg-[#FFFFFF] border-b-2 border-[#111111] sticky top-0 z-40 px-5 py-3 flex items-center justify-between gap-4"
      >
        {/* Zone 1: Single Wordmark */}
        <a
          href="#app-root"
          onClick={(e) => {
            e.preventDefault();
            setExpandedPane("none");
          }}
          className="text-xl font-display font-extrabold tracking-tight text-[#111111] uppercase whitespace-nowrap"
        >
          Prizm AI
        </a>

        {/* Zone 2: Clean Text Navigation Links */}
        <nav className="hidden md:flex items-center gap-6 text-xs font-mono font-semibold text-[#111111]">
          <button
            onClick={() => setShowSidebarPane((prev) => !prev)}
            className="hover:underline underline-offset-4 cursor-pointer whitespace-nowrap"
          >
            {showSidebarPane ? "Hide Notebooks" : "Show Notebooks"}
          </button>
          <button
            onClick={() => {
              setLeftTab("sources");
              setExpandedPane("none");
            }}
            className={`hover:underline underline-offset-4 cursor-pointer whitespace-nowrap ${
              leftTab === "sources" ? "underline decoration-2 decoration-[#111111]" : ""
            }`}
          >
            Sources & Transcripts ({currentProject.sources.length})
          </button>
          <button
            onClick={() => {
              setLeftTab("canonical");
              setExpandedPane("none");
            }}
            className={`hover:underline underline-offset-4 cursor-pointer whitespace-nowrap ${
              leftTab === "canonical" ? "underline decoration-2 decoration-[#111111]" : ""
            }`}
          >
            Ground Truth
          </button>
          <button
            onClick={() => {
              if (currentProject.canonical) {
                setRightTab("presentation");
                setExpandedPane("none");
              } else {
                addToast("Build Ground Truth first to open Generative Slides.", "warning");
              }
            }}
            className={`hover:underline underline-offset-4 cursor-pointer whitespace-nowrap ${
              rightTab === "presentation" ? "underline decoration-2 decoration-[#111111]" : ""
            }`}
          >
            Generative Slides
          </button>
          <button
            onClick={() => {
              if (currentProject.canonical) {
                setRightTab("infographic");
                setExpandedPane("none");
              } else {
                addToast("Build Ground Truth first to open Generative Infographic.", "warning");
              }
            }}
            className={`hover:underline underline-offset-4 cursor-pointer whitespace-nowrap ${
              rightTab === "infographic" ? "underline decoration-2 decoration-[#111111]" : ""
            }`}
          >
            Generative Infographic
          </button>
        </nav>

        {/* Zone 3: 1-2 Primary Actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            id="btn-open-api-settings"
            onClick={() => setShowSettingsModal(true)}
            className="brutalist-btn bg-[#F7F5F0] hover:bg-[#EAE6DF] text-[#111111] px-3 py-1.5 text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            title="Engine & API Settings"
          >
            <Settings2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">
              {customGeminiKey.trim() || hasApiKey ? "Engine Ready" : "API Key"}
            </span>
          </button>

          <button
            id="btn-new-project"
            onClick={() => setShowNewProjectModal(true)}
            className="brutalist-btn bg-[#FFE600] text-[#111111] px-3.5 py-1.5 text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>New Notebook</span>
          </button>
        </div>
      </header>

      {/* COLLAPSIBLE 3-PANE BRUTALIST WORKBENCH */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* PANE 1: NOTEBOOKS, TRANSFORMATION PARAMETERS & EXPORT SUITE */}
        {showSidebarPane && expandedPane === "none" && (
          <aside
            id="sidebar-projects"
            className="w-full lg:w-80 bg-[#F7F5F0] border-b-2 lg:border-b-0 lg:border-r-2 border-[#111111] flex flex-col shrink-0"
          >
            <div className="p-4 border-b-2 border-[#111111] bg-[#EAE6DF]/60">
              <div className="flex items-center justify-between mb-2.5">
                <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-[#111111]">
                  01. Prizm AI Notebooks
                </h2>
                <button
                  onClick={() => setShowSidebarPane(false)}
                  className="text-xs font-mono text-[#4A4742] hover:text-[#111111] flex items-center gap-1 cursor-pointer"
                  title="Collapse Left Rail"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="relative mb-2.5">
                <Search className="w-3.5 h-3.5 text-[#4A4742] absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter notebooks..."
                  value={notebookSearch}
                  onChange={(e) => setNotebookSearch(e.target.value)}
                  className="w-full bg-[#FFFFFF] border-2 border-[#111111] pl-8 pr-2.5 py-1.5 text-xs font-mono focus:outline-none focus:bg-[#FFE600]/15"
                />
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-0.5">
                {filteredProjects.map((proj) => {
                  const isSelected = proj.id === selectedProjectId;
                  return (
                    <div
                      key={proj.id}
                      onClick={() => setSelectedProjectId(proj.id)}
                      className={`w-full text-left px-3 py-2 border-2 border-[#111111] flex items-center justify-between transition cursor-pointer ${
                        isSelected
                          ? "bg-[#111111] text-[#FFFFFF] shadow-[3px_3px_0px_#FFE600]"
                          : "bg-[#FFFFFF] text-[#111111] hover:bg-[#FFE600]/25"
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-3.5 h-3.5 shrink-0" />
                        <span className="text-xs font-bold truncate">{proj.name}</span>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        <span className="text-[10px] font-mono tabular-nums opacity-80">
                          {proj.sources.length} src
                        </span>
                        <button
                          onClick={(e) => handleDeleteProject(proj.id, e)}
                          className={`p-1 hover:bg-[#FF2A2A] hover:text-white transition ${
                            isSelected ? "text-white/70" : "text-[#4A4742]"
                          }`}
                          title="Delete Notebook"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Transformation Parameters */}
            <div className="p-4 flex-1 overflow-y-auto space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-[#111111]/20 pb-1.5">
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#111111]">
                    02. Synthesis Parameters
                  </h3>
                  <Sliders className="w-3.5 h-3.5 text-[#111111]" />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono font-bold text-[#4A4742] block">
                    Target Audience
                  </label>
                  <select
                    value={currentProject.params.audience}
                    onChange={(e) => handleUpdateParams("audience", e.target.value)}
                    className="w-full bg-[#FFFFFF] border-2 border-[#111111] p-2 text-xs font-medium focus:outline-none focus:bg-[#FFE600]/15"
                  >
                    <option value="General Professional">General Professional</option>
                    <option value="Executive Board and Cybersecurity Incident Response Team">
                      Security Board & Tech Responders
                    </option>
                    <option value="Municipal Utility Directors and Energy Tech Investors">
                      Utility Directors & Clean Energy Investors
                    </option>
                    <option value="C-Level Executives & Board of Directors">
                      C-Level Executives
                    </option>
                    <option value="General Public & Consumers">General Public & Consumers</option>
                    <option value="Technical Engineering Team">Technical Engineering Team</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono font-bold text-[#4A4742] block">
                    Tone & Style
                  </label>
                  <select
                    value={currentProject.params.tone}
                    onChange={(e) => handleUpdateParams("tone", e.target.value)}
                    className="w-full bg-[#FFFFFF] border-2 border-[#111111] p-2 text-xs font-medium focus:outline-none focus:bg-[#FFE600]/15"
                  >
                    <option value="Professional & Formal">Professional & Formal</option>
                    <option value="Urgent, Analytical, and Professional">
                      Urgent, Analytical & Professional
                    </option>
                    <option value="Objective, Analytical, and Forward-looking">
                      Objective, Analytical & Forward-looking
                    </option>
                    <option value="Inspiring & Convincing">Inspiring & Convincing</option>
                    <option value="Educational & Simple">Educational & Simple</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-mono font-bold text-[#4A4742] block">
                    Output Language
                  </label>
                  <select
                    value={currentProject.params.language}
                    onChange={(e) => handleUpdateParams("language", e.target.value)}
                    className="w-full bg-[#FFFFFF] border-2 border-[#111111] p-2 text-xs font-medium focus:outline-none focus:bg-[#FFE600]/15"
                  >
                    <optgroup label="Global Languages">
                      <option value="English">English</option>
                      <option value="Spanish">Spanish (Español)</option>
                      <option value="French">French (Français)</option>
                      <option value="German">German (Deutsch)</option>
                      <option value="Japanese">Japanese (日本語)</option>
                      <option value="Chinese">Chinese (中文)</option>
                    </optgroup>
                    <optgroup label="Regional Languages of India">
                      <option value="Hindi">Hindi (हिन्दी)</option>
                      <option value="Bengali">Bengali (বাংলা)</option>
                      <option value="Telugu">Telugu (తెలుగు)</option>
                      <option value="Marathi">Marathi (मराठी)</option>
                      <option value="Tamil">Tamil (தமிழ்)</option>
                      <option value="Gujarati">Gujarati (ગુજરાતી)</option>
                      <option value="Kannada">Kannada (ಕನ್ನಡ)</option>
                      <option value="Odia">Odia (ଓଡ଼ିଆ)</option>
                      <option value="Malayalam">Malayalam (മലയാളം)</option>
                      <option value="Punjabi">Punjabi (ਪੰਜਾਬੀ)</option>
                      <option value="Urdu">Urdu (اُردُو)</option>
                      <option value="Assamese">Assamese (অসমীয়া)</option>
                    </optgroup>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <label className="text-[11px] font-mono font-bold text-[#4A4742] block">
                      Detail Level
                    </label>
                    <select
                      value={currentProject.params.detailLevel}
                      onChange={(e) => handleUpdateParams("detailLevel", e.target.value)}
                      className="w-full bg-[#FFFFFF] border-2 border-[#111111] p-2 text-xs font-medium focus:outline-none"
                    >
                      <option value="High-level">High-level</option>
                      <option value="Balanced">Balanced</option>
                      <option value="Deep Dive">Deep Dive</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-mono font-bold text-[#4A4742] block">
                      Domain
                    </label>
                    <select
                      value={currentProject.params.domain}
                      onChange={(e) => handleUpdateParams("domain", e.target.value)}
                      className="w-full bg-[#FFFFFF] border-2 border-[#111111] p-2 text-xs font-medium focus:outline-none"
                    >
                      <option value="Corporate Operations">Corporate Ops</option>
                      <option value="Cybersecurity & Risk Management">Cybersecurity</option>
                      <option value="Clean Energy & Public Infrastructure">Clean Energy</option>
                      <option value="Finance & Venture Capital">Finance & VC</option>
                      <option value="Healthcare & Bio-Medicine">Healthcare</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Multi-Format Export Suite */}
              <div className="pt-3 border-t-2 border-[#111111] space-y-2">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-[#111111]">
                  03. Export & Download Suite
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={handleExportMarkdown}
                    className="brutalist-btn bg-[#FFFFFF] hover:bg-[#FFE600] text-[#111111] px-2.5 py-2 text-[11px] font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <FileCode className="w-3.5 h-3.5" />
                    <span>Markdown .MD</span>
                  </button>
                  <button
                    onClick={handleExportHtmlSlides}
                    className="brutalist-btn bg-[#FFFFFF] hover:bg-[#FFE600] text-[#111111] px-2.5 py-2 text-[11px] font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Code className="w-3.5 h-3.5" />
                    <span>HTML Slides</span>
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="brutalist-btn bg-[#FFFFFF] hover:bg-[#FFE600] text-[#111111] px-2.5 py-2 text-[11px] font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print / PDF</span>
                  </button>
                  <button
                    onClick={handleExportJson}
                    className="brutalist-btn bg-[#FFFFFF] hover:bg-[#FFE600] text-[#111111] px-2.5 py-2 text-[11px] font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>JSON Bundle</span>
                  </button>
                </div>
              </div>

              {actionError && (
                <div className="p-3 bg-[#FF2A2A] text-white border-2 border-[#111111] shadow-[3px_3px_0px_#111111] flex items-start gap-2 text-xs font-mono">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{actionError}</span>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* MAIN 2-COLUMN ANALYTICAL & STUDIO WORKSPACE */}
        <main id="workspace-main" className="flex-1 flex flex-col lg:flex-row overflow-hidden">
          {/* PANE 2: SOURCES, EXACT YOUTUBE/REEL TRANSCRIPTS & EDITABLE CANONICAL GROUND TRUTH */}
          {expandedPane !== "right" && (
            <section
              id="pane-left"
              className={`${
                expandedPane === "left" ? "w-full" : "w-full lg:w-1/2"
              } border-b-2 lg:border-b-0 lg:border-r-2 border-[#111111] flex flex-col overflow-hidden bg-[#F7F5F0]`}
            >
              {/* Sub-Tab Bar */}
              <div className="bg-[#EAE6DF] border-b-2 border-[#111111] px-4 py-2.5 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {!showSidebarPane && (
                    <button
                      onClick={() => setShowSidebarPane(true)}
                      className="brutalist-btn bg-[#FFFFFF] px-2 py-1 text-xs font-mono font-bold mr-1 cursor-pointer"
                      title="Expand Notebooks Sidebar"
                    >
                      <PanelLeftOpen className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <button
                    id="tab-sources"
                    onClick={() => setLeftTab("sources")}
                    className={`px-3 py-1.5 text-xs font-mono font-bold border-2 border-[#111111] transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                      leftTab === "sources"
                        ? "bg-[#FFE600] text-[#111111] shadow-[2px_2px_0px_#111111]"
                        : "bg-[#FFFFFF] text-[#111111] hover:bg-[#FFFFFF]/80"
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>01. Sources ({currentProject.sources.length})</span>
                  </button>

                  <button
                    id="tab-canonical"
                    onClick={() => setLeftTab("canonical")}
                    className={`px-3 py-1.5 text-xs font-mono font-bold border-2 border-[#111111] transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                      leftTab === "canonical"
                        ? "bg-[#FFE600] text-[#111111] shadow-[2px_2px_0px_#111111]"
                        : "bg-[#FFFFFF] text-[#111111] hover:bg-[#FFFFFF]/80"
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>02. Ground Truth</span>
                  </button>

                  <button
                    id="tab-chat"
                    onClick={() => setLeftTab("chat")}
                    disabled={!currentProject.canonical}
                    className={`px-3 py-1.5 text-xs font-mono font-bold border-2 border-[#111111] transition flex items-center gap-1.5 whitespace-nowrap cursor-pointer disabled:opacity-40 ${
                      leftTab === "chat"
                        ? "bg-[#FFE600] text-[#111111] shadow-[2px_2px_0px_#111111]"
                        : "bg-[#FFFFFF] text-[#111111] hover:bg-[#FFFFFF]/80"
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>03. Grounded Chat</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {leftTab === "sources" && (
                    <button
                      id="btn-add-source-trigger"
                      onClick={() => {
                        setSourceMethod("url");
                        setShowAddSourceModal(true);
                      }}
                      className="brutalist-btn bg-[#111111] text-[#FFE600] px-3 py-1.5 text-xs font-mono font-bold flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      <span>Add YouTube / Reel / Doc</span>
                    </button>
                  )}

                  <button
                    onClick={() => setExpandedPane(expandedPane === "left" ? "none" : "left")}
                    className="p-1.5 border-2 border-[#111111] bg-[#FFFFFF] hover:bg-[#FFE600] transition cursor-pointer"
                    title={expandedPane === "left" ? "Restore Split View" : "Maximize Pane"}
                  >
                    {expandedPane === "left" ? (
                      <Minimize2 className="w-3.5 h-3.5" />
                    ) : (
                      <Maximize2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Left Pane Content Body */}
              <div className="flex-1 overflow-y-auto p-5">
                {/* SUB-TAB 1: INGESTED SOURCES & EXACT YOUTUBE/REEL TRANSCRIPTS */}
                {leftTab === "sources" && (
                  <div className="space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-[#111111] pb-3">
                      <div>
                        <h3 className="text-base font-display font-extrabold uppercase tracking-tight">
                          Prizm AI Source & Transcript Pool
                        </h3>
                        <p className="text-xs text-[#4A4742]">
                          Exact YouTube & Instagram Reel transcripts, Web articles, and batch documents
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setSourceMethod("url");
                            setShowAddSourceModal(true);
                          }}
                          className="brutalist-btn bg-[#FFE600] text-[#111111] px-3 py-1.5 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
                        >
                          <Film className="w-3.5 h-3.5" />
                          <span>YouTube / Reel Transcript</span>
                        </button>
                        <label
                          htmlFor="quick-workspace-file-input"
                          className="brutalist-btn bg-[#FFFFFF] hover:bg-[#FFE600] text-[#111111] px-3 py-1.5 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Batch Upload</span>
                          <input
                            id="quick-workspace-file-input"
                            type="file"
                            multiple
                            accept=".pdf,.txt,.md,.json,.csv,.xml"
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                processMultipleFiles(e.target.files, true);
                                e.target.value = "";
                              }
                            }}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>

                    {currentProject.sources.length === 0 ? (
                      <div className="p-8 text-center bg-[#FFFFFF] border-2 border-dashed border-[#111111] shadow-[4px_4px_0px_#111111] space-y-4">
                        <BookOpen className="w-10 h-10 text-[#111111] mx-auto" />
                        <div className="space-y-1">
                          <p className="text-base font-display font-bold">
                            No Source Materials Ingested Yet
                          </p>
                          <p className="text-xs text-[#4A4742] max-w-md mx-auto">
                            Paste any YouTube video link or Instagram Reel to extract its exact timestamped transcript & metadata—or drag and drop multiple PDF/text documents.
                          </p>
                        </div>
                        <div className="flex flex-wrap justify-center gap-3 pt-2">
                          <button
                            onClick={() => {
                              setSourceMethod("url");
                              setShowAddSourceModal(true);
                            }}
                            className="brutalist-btn bg-[#FFE600] text-[#111111] px-4 py-2 text-xs font-mono font-bold cursor-pointer"
                          >
                            + Extract YouTube / Reel Transcript
                          </button>
                          <button
                            onClick={() => {
                              setSourceMethod("file");
                              setShowAddSourceModal(true);
                            }}
                            className="brutalist-btn bg-[#FFFFFF] text-[#111111] px-4 py-2 text-xs font-mono font-bold cursor-pointer"
                          >
                            + Upload Documents (PDF / TXT)
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {currentProject.sources.map((src, index) => {
                          const meta = src.metadata;
                          const isSummaryOpen = expandedSummaryIds[src.id] ?? true;
                          const hasExactTranscript =
                            !!(meta?.transcriptSegments && meta.transcriptSegments.length > 0) ||
                            !!meta?.exactTranscript;
                          const isTranscriptOpen = expandedTranscriptIds[src.id] ?? hasExactTranscript;
                          const tQuery = (transcriptSearchQuery[src.id] || "").trim().toLowerCase();

                          return (
                            <div
                              key={src.id}
                              className="bg-[#FFFFFF] border-2 border-[#111111] shadow-[4px_4px_0px_#111111] p-4 space-y-3"
                            >
                              {/* Top Title & Controls Row */}
                              <div className="flex items-start justify-between gap-3">
                                <div className="space-y-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-xs font-bold bg-[#111111] text-[#FFE600] px-1.5 py-0.5 tabular-nums">
                                      {String(index + 1).padStart(2, "0")}
                                    </span>
                                    <h4 className="text-sm font-display font-bold text-[#111111] truncate">
                                      {src.title}
                                    </h4>
                                  </div>

                                  {/* Unboxed Metadata Row with typographic separators */}
                                  <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-mono text-[#4A4742] tabular-nums">
                                    <span className="font-bold text-[#111111]">
                                      {meta?.platform ||
                                        (src.type === "youtube"
                                          ? "YouTube Video"
                                          : src.type === "reel"
                                            ? "Instagram Reel / Short"
                                            : src.type === "url"
                                              ? "Web Article"
                                              : src.type === "document"
                                                ? "Document"
                                                : "Reference Text")}
                                    </span>
                                    {meta?.author && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span>By {meta.author}</span>
                                      </>
                                    )}
                                    {meta?.duration && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span>{meta.duration}</span>
                                      </>
                                    )}
                                    <span aria-hidden="true">·</span>
                                    <span>
                                      {(
                                        meta?.wordCount || src.content.split(/\s+/).length
                                      ).toLocaleString()}{" "}
                                      words
                                    </span>
                                    {hasExactTranscript && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <span className="text-[#111111] font-bold underline decoration-[#FFE600] decoration-2">
                                          Exact Transcript ({meta?.transcriptSegments?.length || "Full"})
                                        </span>
                                      </>
                                    )}
                                    {src.url && (
                                      <>
                                        <span aria-hidden="true">·</span>
                                        <a
                                          href={src.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="underline hover:text-[#111111] inline-flex items-center gap-0.5"
                                        >
                                          <span>Source Link</span>
                                          <ExternalLink className="w-2.5 h-2.5" />
                                        </a>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {/* Action Buttons */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {hasExactTranscript && (
                                    <button
                                      onClick={() =>
                                        setExpandedTranscriptIds((prev) => ({
                                          ...prev,
                                          [src.id]: !isTranscriptOpen,
                                        }))
                                      }
                                      className={`px-2.5 py-1 border-2 border-[#111111] text-[11px] font-mono font-bold flex items-center gap-1 cursor-pointer transition ${
                                        isTranscriptOpen
                                          ? "bg-[#111111] text-[#FFE600]"
                                          : "bg-[#FFE600] text-[#111111]"
                                      }`}
                                    >
                                      <FileAudio className="w-3 h-3" />
                                      <span>{isTranscriptOpen ? "Hide Transcript" : "Transcript"}</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      setPreviewSourceId(previewSourceId === src.id ? null : src.id);
                                      setPdfPage(1);
                                    }}
                                    className={`px-2.5 py-1 border-2 border-[#111111] text-[11px] font-mono font-bold flex items-center gap-1 cursor-pointer transition ${
                                      previewSourceId === src.id
                                        ? "bg-[#FFE600] text-[#111111]"
                                        : "bg-[#F7F5F0] text-[#111111] hover:bg-[#EAE6DF]"
                                    }`}
                                  >
                                    <Eye className="w-3 h-3" />
                                    <span>{previewSourceId === src.id ? "Close" : "Inspect"}</span>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteSource(src.id)}
                                    className="p-1.5 border-2 border-[#111111] bg-[#FFFFFF] hover:bg-[#FF2A2A] hover:text-white transition cursor-pointer"
                                    title="Remove Source"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              {/* EXACT TIMESTAMPED TRANSCRIPT VIEWER (FOR YOUTUBE & INSTAGRAM REELS) */}
                              {hasExactTranscript && isTranscriptOpen && (
                                <div className="border-2 border-[#111111] bg-[#111111] text-[#FFFFFF] p-3.5 space-y-2.5">
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/20 pb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="bg-[#FFE600] text-[#111111] font-mono text-[10px] font-bold px-2 py-0.5 uppercase">
                                        EXACT VERBATIM TRANSCRIPT
                                      </span>
                                      <span className="text-[11px] font-mono text-[#EAE6DF] tabular-nums">
                                        {meta?.transcriptSegments?.length || 0} timestamped segments
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        placeholder="Filter transcript..."
                                        value={transcriptSearchQuery[src.id] || ""}
                                        onChange={(e) =>
                                          setTranscriptSearchQuery((prev) => ({
                                            ...prev,
                                            [src.id]: e.target.value,
                                          }))
                                        }
                                        className="bg-white/10 border border-white/30 text-white px-2 py-0.5 text-[11px] font-mono focus:outline-none w-32"
                                      />
                                      <button
                                        onClick={() => {
                                          const rawT =
                                            meta?.exactTranscript ||
                                            (meta?.transcriptSegments || [])
                                              .map((s) => `[${s.timestamp}] ${s.text}`)
                                              .join("\n");
                                          copyToClipboard(
                                            rawT,
                                            `trans-${src.id}`,
                                            "Copied Exact Verbatim Transcript!"
                                          );
                                        }}
                                        className="bg-[#FFE600] text-[#111111] px-2.5 py-0.5 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer"
                                      >
                                        <Copy className="w-3 h-3" />
                                        <span>Copy Transcript</span>
                                      </button>
                                    </div>
                                  </div>

                                  <div className="max-h-52 overflow-y-auto space-y-1.5 pr-1 font-mono text-xs">
                                    {meta?.transcriptSegments && meta.transcriptSegments.length > 0 ? (
                                      meta.transcriptSegments
                                        .filter(
                                          (seg) =>
                                            !tQuery ||
                                            seg.text.toLowerCase().includes(tQuery) ||
                                            seg.timestamp.toLowerCase().includes(tQuery)
                                        )
                                        .map((seg, sIdx) => (
                                          <div
                                            key={sIdx}
                                            className="flex items-start gap-2.5 py-1 border-b border-white/10 last:border-b-0 hover:bg-white/5 px-1"
                                          >
                                            <span className="text-[#FFE600] font-bold shrink-0 tabular-nums">
                                              [{seg.timestamp}]
                                            </span>
                                            <span className="text-[#F7F5F0] font-sans leading-snug">
                                              {seg.text}
                                            </span>
                                          </div>
                                        ))
                                    ) : (
                                      <pre className="whitespace-pre-wrap text-xs text-[#F7F5F0]">
                                        {meta?.exactTranscript}
                                      </pre>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Media Intelligence Metadata & AI Summary Block */}
                              {(meta?.summary || meta?.thumbnailUrl || meta?.keyTakeaways) && (
                                <div className="border-2 border-[#111111] bg-[#F7F5F0] p-3 space-y-2">
                                  <div className="flex items-center justify-between">
                                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#111111]">
                                      Extracted Metadata & AI Content Summary
                                    </span>
                                    <button
                                      onClick={() =>
                                        setExpandedSummaryIds((prev) => ({
                                          ...prev,
                                          [src.id]: !isSummaryOpen,
                                        }))
                                      }
                                      className="text-[11px] font-mono underline cursor-pointer"
                                    >
                                      {isSummaryOpen ? "Hide Summary" : "Show Summary"}
                                    </button>
                                  </div>

                                  {isSummaryOpen && (
                                    <div className="flex flex-col sm:flex-row gap-3 pt-1">
                                      {meta?.thumbnailUrl && (
                                        <div className="sm:w-36 shrink-0 border-2 border-[#111111] bg-[#111111] overflow-hidden self-start">
                                          <img
                                            src={meta.thumbnailUrl}
                                            alt={src.title}
                                            referrerPolicy="no-referrer"
                                            onError={(e) => {
                                              (e.currentTarget as HTMLImageElement).style.display =
                                                "none";
                                            }}
                                            className="w-full h-24 object-cover"
                                          />
                                        </div>
                                      )}
                                      <div className="space-y-2 flex-1 min-w-0">
                                        {meta?.summary && (
                                          <p className="text-xs text-[#111111] leading-relaxed">
                                            {meta.summary}
                                          </p>
                                        )}
                                        {meta?.keyTakeaways && meta.keyTakeaways.length > 0 && (
                                          <ul className="space-y-1 text-xs text-[#4A4742] border-t border-[#111111]/20 pt-1.5">
                                            {meta.keyTakeaways.map((tk, idx) => (
                                              <li key={idx} className="flex items-start gap-1.5">
                                                <span className="font-mono font-bold text-[#111111]">
                                                  •
                                                </span>
                                                <span>{tk}</span>
                                              </li>
                                            ))}
                                          </ul>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}

                              {/* Paginated Document & Transcript Reader */}
                              {previewSourceId === src.id ? (
                                <div className="border-2 border-[#111111] bg-[#EAE6DF] p-3 space-y-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 bg-[#111111] text-[#FFFFFF] p-2 text-xs font-mono">
                                    <div className="flex items-center gap-2">
                                      <span className="bg-[#FFE600] text-[#111111] font-bold px-1.5 py-0.5 text-[10px]">
                                        READER
                                      </span>
                                      <span className="truncate max-w-[140px]">{src.title}</span>
                                    </div>

                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => setPdfZoom((prev) => Math.max(70, prev - 15))}
                                        className="p-1 hover:bg-white/10 cursor-pointer"
                                      >
                                        <ZoomOut className="w-3.5 h-3.5" />
                                      </button>
                                      <span className="w-10 text-center text-[11px] tabular-nums">
                                        {pdfZoom}%
                                      </span>
                                      <button
                                        onClick={() => setPdfZoom((prev) => Math.min(160, prev + 15))}
                                        className="p-1 hover:bg-white/10 cursor-pointer"
                                      >
                                        <ZoomIn className="w-3.5 h-3.5" />
                                      </button>
                                    </div>

                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => setPdfPage((prev) => Math.max(1, prev - 1))}
                                        disabled={pdfPage === 1}
                                        className="p-1 hover:bg-white/10 disabled:opacity-30 cursor-pointer"
                                      >
                                        <ChevronLeft className="w-3.5 h-3.5" />
                                      </button>
                                      <span className="text-[11px] tabular-nums">
                                        P.{pdfPage}/{Math.max(1, Math.ceil(src.content.length / 1000))}
                                      </span>
                                      <button
                                        onClick={() =>
                                          setPdfPage((prev) =>
                                            Math.min(
                                              Math.max(1, Math.ceil(src.content.length / 1000)),
                                              prev + 1
                                            )
                                          )
                                        }
                                        disabled={pdfPage >= Math.ceil(src.content.length / 1000)}
                                        className="p-1 hover:bg-white/10 disabled:opacity-30 cursor-pointer"
                                      >
                                        <ChevronRight className="w-3.5 h-3.5" />
                                      </button>
                                    </div>

                                    <div className="flex items-center bg-[#FFFFFF] text-[#111111] px-2 py-0.5">
                                      <Search className="w-3 h-3 mr-1" />
                                      <input
                                        type="text"
                                        placeholder="Find text..."
                                        value={pdfSearch}
                                        onChange={(e) => {
                                          setPdfSearch(e.target.value);
                                          setPdfPage(1);
                                        }}
                                        className="bg-transparent text-[11px] focus:outline-none w-24 font-mono"
                                      />
                                    </div>
                                  </div>

                                  <div className="bg-[#FFFFFF] border-2 border-[#111111] p-5 max-h-80 overflow-y-auto">
                                    <div
                                      style={{ fontSize: `${pdfZoom}%` }}
                                      className="text-xs font-serif-editorial leading-relaxed text-[#111111] whitespace-pre-wrap"
                                    >
                                      {(() => {
                                        const charsPerPage = 1000;
                                        const pageSlice = src.content.substring(
                                          (pdfPage - 1) * charsPerPage,
                                          pdfPage * charsPerPage
                                        );
                                        const query = pdfSearch.trim();
                                        if (!query) return pageSlice;

                                        const escaped = query.replace(
                                          /[-\/\\^$*+?.()|[\]{}]/g,
                                          "\\$&"
                                        );
                                        const parts = pageSlice.split(new RegExp(`(${escaped})`, "gi"));
                                        return parts.map((part, i) =>
                                          part.toLowerCase() === query.toLowerCase() ? (
                                            <mark
                                              key={i}
                                              className="bg-[#FFE600] text-[#111111] font-bold px-0.5 border border-[#111111]"
                                            >
                                              {part}
                                            </mark>
                                          ) : (
                                            part
                                          )
                                        );
                                      })()}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="bg-[#F7F5F0] border border-[#111111]/30 p-3 max-h-24 overflow-y-auto">
                                  <p className="text-xs text-[#4A4742] font-mono whitespace-pre-wrap leading-relaxed line-clamp-3">
                                    {src.content}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        {/* Build Canonical Ground Truth Callout Banner */}
                        <div className="bg-[#111111] text-[#FFFFFF] border-2 border-[#111111] shadow-[4px_4px_0px_#FFE600] p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                          <div>
                            <h4 className="text-sm font-display font-bold uppercase tracking-wide text-[#FFE600]">
                              Step 01 Complete · Ready to Extract Canonical Ground Truth
                            </h4>
                            <p className="text-xs text-[#EAE6DF] mt-1">
                              Parse all {currentProject.sources.length} source(s) and verbatim transcripts into a verified Canonical Model.
                            </p>
                          </div>
                          <button
                            id="btn-run-analysis"
                            onClick={handleRunAnalysis}
                            disabled={isAnalyzing}
                            className="brutalist-btn bg-[#FFE600] text-[#111111] px-4 py-2.5 text-xs font-mono font-bold shrink-0 flex items-center gap-2 cursor-pointer"
                          >
                            {isAnalyzing ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Analyzing Sources...</span>
                              </>
                            ) : (
                              <>
                                <Cpu className="w-3.5 h-3.5" />
                                <span>Build Ground Truth</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* SUB-TAB 2: CANONICAL GROUND TRUTH (WITH INLINE EDITING) */}
                {leftTab === "canonical" && (
                  <div className="space-y-5">
                    {!currentProject.canonical ? (
                      <div className="p-8 text-center bg-[#FFFFFF] border-2 border-[#111111] shadow-[4px_4px_0px_#111111] space-y-4">
                        <Cpu className="w-10 h-10 text-[#111111] mx-auto" />
                        <div>
                          <h4 className="text-base font-display font-bold">
                            No Canonical Ground Truth Model Built Yet
                          </h4>
                          <p className="text-xs text-[#4A4742] max-w-sm mx-auto mt-1">
                            Extract your Canonical Knowledge Model from your ingested sources first.
                          </p>
                        </div>
                        <button
                          onClick={handleRunAnalysis}
                          disabled={isAnalyzing || currentProject.sources.length === 0}
                          className="brutalist-btn bg-[#FFE600] text-[#111111] px-5 py-2.5 text-xs font-mono font-bold inline-flex items-center gap-2 cursor-pointer"
                        >
                          {isAnalyzing ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Extracting Ground Truth...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-3.5 h-3.5" />
                              <span>Generate Canonical Model Now</span>
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        <div className="bg-[#111111] text-[#FFFFFF] border-2 border-[#111111] shadow-[4px_4px_0px_#FFE600] p-5 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/20 pb-2.5">
                            <span className="text-[11px] font-mono font-bold text-[#FFE600] uppercase tracking-wider">
                              Prizm AI Ground Truth · {isEditingCanonical ? "EDIT MODE ACTIVE" : "VERIFIED"}
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setIsEditingCanonical((prev) => !prev);
                                  if (isEditingCanonical) {
                                    addToast("Saved Canonical Ground Truth edits", "success");
                                  }
                                }}
                                className={`px-3 py-1 text-xs font-mono font-bold border-2 border-[#FFFFFF] flex items-center gap-1.5 cursor-pointer transition ${
                                  isEditingCanonical
                                    ? "bg-[#FFE600] text-[#111111] border-[#FFE600]"
                                    : "bg-transparent text-[#FFFFFF] hover:bg-white/10"
                                }`}
                              >
                                <Edit3 className="w-3 h-3" />
                                <span>{isEditingCanonical ? "Done Editing" : "Edit Ground Truth"}</span>
                              </button>
                              <button
                                onClick={handleRunAnalysis}
                                disabled={isAnalyzing}
                                className="px-2.5 py-1 text-xs font-mono text-[#EAE6DF] hover:text-[#FFE600] border border-white/30 flex items-center gap-1 cursor-pointer"
                              >
                                <RefreshCw className={`w-3 h-3 ${isAnalyzing ? "animate-spin" : ""}`} />
                                <span>Re-Analyze</span>
                              </button>
                            </div>
                          </div>

                          {isEditingCanonical ? (
                            <div className="space-y-2.5">
                              <input
                                type="text"
                                value={currentProject.canonical.title}
                                onChange={(e) =>
                                  updateCanonicalModel((c) => ({ ...c, title: e.target.value }))
                                }
                                className="w-full bg-[#FFFFFF] text-[#111111] border-2 border-[#FFE600] p-2 text-sm font-bold focus:outline-none"
                              />
                              <textarea
                                rows={2}
                                value={currentProject.canonical.mainObjective}
                                onChange={(e) =>
                                  updateCanonicalModel((c) => ({
                                    ...c,
                                    mainObjective: e.target.value,
                                  }))
                                }
                                className="w-full bg-[#FFFFFF] text-[#111111] border-2 border-[#FFE600] p-2 text-xs focus:outline-none"
                              />
                            </div>
                          ) : (
                            <>
                              <h3 className="text-lg font-display font-bold text-[#FFFFFF] leading-snug">
                                {currentProject.canonical.title}
                              </h3>
                              <div className="bg-white/10 border-l-4 border-[#FFE600] p-3 text-xs text-[#EAE6DF]">
                                <strong className="text-[#FFE600] font-mono uppercase block text-[10px] mb-1">
                                  Core Strategic Message:
                                </strong>
                                "{currentProject.canonical.mainObjective}"
                              </div>
                            </>
                          )}
                        </div>

                        {/* Synthesize Suite Trigger Banner */}
                        <div className="bg-[#FFE600] border-2 border-[#111111] shadow-[4px_4px_0px_#111111] p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                          <div>
                            <h4 className="text-sm font-display font-extrabold text-[#111111] uppercase">
                              Synthesize All 8 Prizm AI Outputs (Including Generative Slides & Infographic)
                            </h4>
                            <p className="text-xs text-[#111111]/80">
                              Generates live visual Slide Decks, Data Infographics, Dual-Host TTS Podcasts, and Executive Briefs.
                            </p>
                          </div>
                          <button
                            id="btn-trigger-transform"
                            onClick={handleGenerateArtifacts}
                            disabled={isTransforming}
                            className="brutalist-btn bg-[#111111] text-[#FFE600] px-4 py-2.5 text-xs font-mono font-bold shrink-0 flex items-center gap-2 cursor-pointer"
                          >
                            {isTransforming ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Synthesizing Suite...</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3.5 h-3.5" />
                                <span>Synthesize All 8 Outputs</span>
                              </>
                            )}
                          </button>
                        </div>

                        {/* 01. Grounded Key Facts */}
                        <div className="bg-[#FFFFFF] border-2 border-[#111111] shadow-[4px_4px_0px_#111111] p-4 space-y-3">
                          <h4 className="text-xs font-mono font-bold uppercase tracking-wider border-b-2 border-[#111111] pb-2">
                            01. Grounded Key Facts ({currentProject.canonical.keyFacts.length})
                          </h4>
                          <ul className="space-y-2 text-xs text-[#111111]">
                            {currentProject.canonical.keyFacts.map((fact, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="font-mono font-bold text-[#111111] mt-0.5 tabular-nums">
                                  {String(idx + 1).padStart(2, "0")}.
                                </span>
                                {isEditingCanonical ? (
                                  <div className="flex-1 flex gap-1.5">
                                    <input
                                      type="text"
                                      value={fact}
                                      onChange={(e) => {
                                        const next = [...currentProject.canonical!.keyFacts];
                                        next[idx] = e.target.value;
                                        updateCanonicalModel((c) => ({ ...c, keyFacts: next }));
                                      }}
                                      className="flex-1 bg-[#F7F5F0] border border-[#111111] px-2 py-1 text-xs"
                                    />
                                    <button
                                      onClick={() => {
                                        const next = currentProject.canonical!.keyFacts.filter(
                                          (_, i) => i !== idx
                                        );
                                        updateCanonicalModel((c) => ({ ...c, keyFacts: next }));
                                      }}
                                      className="px-2 bg-[#FF2A2A] text-white font-mono font-bold text-xs cursor-pointer"
                                    >
                                      ×
                                    </button>
                                  </div>
                                ) : (
                                  <span className="leading-relaxed">{fact}</span>
                                )}
                              </li>
                            ))}
                          </ul>

                          {isEditingCanonical && (
                            <div className="flex gap-2 pt-2 border-t border-[#111111]/20">
                              <input
                                type="text"
                                placeholder="Add a new verified key fact..."
                                value={newFactInput}
                                onChange={(e) => setNewFactInput(e.target.value)}
                                className="flex-1 bg-[#F7F5F0] border-2 border-[#111111] px-2.5 py-1.5 text-xs"
                              />
                              <button
                                onClick={() => {
                                  if (!newFactInput.trim()) return;
                                  updateCanonicalModel((c) => ({
                                    ...c,
                                    keyFacts: [...c.keyFacts, newFactInput.trim()],
                                  }));
                                  setNewFactInput("");
                                }}
                                className="brutalist-btn bg-[#FFE600] text-[#111111] px-3 py-1.5 text-xs font-mono font-bold cursor-pointer"
                              >
                                + Add Fact
                              </button>
                            </div>
                          )}
                        </div>

                        {/* 02. Statistics & Timeline Events Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-[#FFFFFF] border-2 border-[#111111] shadow-[4px_4px_0px_#111111] p-4 space-y-3">
                            <h4 className="text-xs font-mono font-bold uppercase tracking-wider border-b-2 border-[#111111] pb-2">
                              02. Metrics & Data Points
                            </h4>
                            <div className="space-y-3">
                              {currentProject.canonical.statistics.map((stat, idx) => (
                                <div
                                  key={idx}
                                  className="border-b border-[#111111]/20 pb-2.5 last:border-b-0 last:pb-0"
                                >
                                  <div className="flex items-baseline justify-between gap-2">
                                    <span className="text-xs font-mono font-bold uppercase text-[#4A4742]">
                                      {stat.metric}
                                    </span>
                                    <span className="text-sm font-mono font-extrabold text-[#111111] bg-[#FFE600] px-1.5 py-0.5 border border-[#111111] tabular-nums">
                                      {stat.value}
                                    </span>
                                  </div>
                                  {stat.context && (
                                    <p className="text-[11px] text-[#4A4742] mt-1 leading-snug">
                                      {stat.context}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="bg-[#FFFFFF] border-2 border-[#111111] shadow-[4px_4px_0px_#111111] p-4 space-y-3">
                            <h4 className="text-xs font-mono font-bold uppercase tracking-wider border-b-2 border-[#111111] pb-2">
                              03. Chronological Events
                            </h4>
                            <div className="space-y-3">
                              {currentProject.canonical.keyEvents.map((evt, idx) => (
                                <div
                                  key={idx}
                                  className="border-l-2 border-[#111111] pl-3 pb-1 space-y-1"
                                >
                                  <div className="flex items-baseline justify-between gap-2">
                                    <h5 className="text-xs font-bold text-[#111111]">
                                      {evt.event}
                                    </h5>
                                    {evt.date && (
                                      <span className="text-[10px] font-mono text-[#4A4742] shrink-0 tabular-nums">
                                        {evt.date}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-[#4A4742] leading-snug">
                                    {evt.description}
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* SUB-TAB 3: GROUNDED RESEARCH PARTNER CHAT */}
                {leftTab === "chat" && currentProject.canonical && (
                  <div className="flex flex-col h-[560px] bg-[#FFFFFF] border-2 border-[#111111] shadow-[4px_4px_0px_#111111]">
                    <div className="bg-[#111111] text-[#FFFFFF] px-4 py-3 flex items-center justify-between shrink-0">
                      <div>
                        <h4 className="text-xs font-mono font-bold uppercase text-[#FFE600]">
                          Prizm AI Grounded Research Partner
                        </h4>
                        <p className="text-[11px] text-[#EAE6DF]">
                          Strict verification against "{currentProject.canonical.title}"
                        </p>
                      </div>
                    </div>

                    <div className="bg-[#EAE6DF] border-b-2 border-[#111111] px-3 py-2 flex items-center gap-1.5 overflow-x-auto shrink-0">
                      {[
                        "Summarize top 3 statistics",
                        "What are the critical risks and mitigations?",
                        "List all key entities and their roles",
                      ].map((q, i) => (
                        <button
                          key={i}
                          onClick={() => handleSendMessage(undefined, q)}
                          className="bg-[#FFFFFF] hover:bg-[#FFE600] border border-[#111111] px-2.5 py-1 text-[11px] font-mono whitespace-nowrap cursor-pointer transition"
                        >
                          {q}
                        </button>
                      ))}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#F7F5F0]">
                      {(chatHistories[selectedProjectId] || []).length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2">
                          <MessageSquare className="w-8 h-8 text-[#111111]" />
                          <p className="text-sm font-display font-bold">
                            Query Your Canonical Ground Truth
                          </p>
                          <p className="text-xs text-[#4A4742] max-w-xs">
                            Ask about specific metrics, transcript details, chronology, or recommendations.
                          </p>
                        </div>
                      ) : (
                        (chatHistories[selectedProjectId] || []).map((msg) => (
                          <div
                            key={msg.id}
                            className={`flex flex-col ${
                              msg.sender === "user" ? "items-end" : "items-start"
                            }`}
                          >
                            <div
                              className={`max-w-[85%] border-2 border-[#111111] p-3 text-xs leading-relaxed ${
                                msg.sender === "user"
                                  ? "bg-[#FFE600] text-[#111111] font-medium shadow-[3px_3px_0px_#111111]"
                                  : "bg-[#FFFFFF] text-[#111111] shadow-[3px_3px_0px_#111111]"
                              }`}
                            >
                              <p className="whitespace-pre-wrap">{msg.text}</p>
                            </div>
                            <span className="text-[10px] font-mono text-[#4A4742] mt-1">
                              {msg.sender === "user" ? "YOU" : "PRIZM AI"} · {msg.timestamp}
                            </span>
                          </div>
                        ))
                      )}
                      {isChatLoading && (
                        <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#111111] p-2">
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Verifying against Ground Truth...</span>
                        </div>
                      )}
                      <div ref={chatBottomRef} />
                    </div>

                    <form
                      onSubmit={(e) => handleSendMessage(e)}
                      className="bg-[#FFFFFF] border-t-2 border-[#111111] p-3 flex gap-2 shrink-0"
                    >
                      <input
                        type="text"
                        value={chatInputs[selectedProjectId] || ""}
                        onChange={(e) =>
                          setChatInputs((prev) => ({
                            ...prev,
                            [selectedProjectId]: e.target.value,
                          }))
                        }
                        placeholder="Ask a grounded question..."
                        className="flex-1 bg-[#F7F5F0] border-2 border-[#111111] px-3 py-2 text-xs font-mono focus:outline-none focus:bg-[#FFE600]/15"
                      />
                      <button
                        type="submit"
                        disabled={isChatLoading || !(chatInputs[selectedProjectId] || "").trim()}
                        className="brutalist-btn bg-[#111111] text-[#FFE600] px-4 py-2 text-xs font-mono font-bold shrink-0 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* PANE 3: PRIZM AI SYNTHESIS STUDIO (8 FORMATS INCLUDING GENERATIVE SLIDES & INFOGRAPHIC) */}
          {expandedPane !== "left" && (
            <section
              id="pane-right"
              className={`${
                expandedPane === "right" ? "w-full" : "w-full lg:w-1/2"
              } flex flex-col overflow-hidden bg-[#F7F5F0]`}
            >
              {/* Artifact Format Selector Bar */}
              <div className="bg-[#EAE6DF] border-b-2 border-[#111111] px-4 py-2.5 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  {(
                    [
                      { id: "summary", label: "01. Brief" },
                      { id: "advisory", label: "02. Advisory" },
                      { id: "linkedin", label: "03. LinkedIn" },
                      { id: "twitter", label: "04. X Thread" },
                      { id: "presentation", label: "05. Generative Slides" },
                      { id: "infographic", label: "06. Generative Infographic" },
                      { id: "video", label: "07. Video" },
                      { id: "audio", label: "08. Podcast TTS" },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      id={`tab-${tab.id}`}
                      onClick={() => setRightTab(tab.id)}
                      className={`px-2.5 py-1.5 text-xs font-mono font-bold border-2 border-[#111111] transition whitespace-nowrap cursor-pointer ${
                        rightTab === tab.id
                          ? "bg-[#FFE600] text-[#111111] shadow-[2px_2px_0px_#111111]"
                          : "bg-[#FFFFFF] text-[#111111] hover:bg-[#FFFFFF]/80"
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {currentProject.canonical && currentProject.artifacts && (
                    <button
                      onClick={handleGenerateArtifacts}
                      disabled={isTransforming}
                      className="p-1.5 border-2 border-[#111111] bg-[#FFFFFF] hover:bg-[#FFE600] transition cursor-pointer"
                      title="Regenerate All 8 Artifacts"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isTransforming ? "animate-spin" : ""}`} />
                    </button>
                  )}
                  <button
                    onClick={() => setExpandedPane(expandedPane === "right" ? "none" : "right")}
                    className="p-1.5 border-2 border-[#111111] bg-[#FFFFFF] hover:bg-[#FFE600] transition cursor-pointer"
                    title={expandedPane === "right" ? "Restore Split View" : "Maximize Studio"}
                  >
                    {expandedPane === "right" ? (
                      <Minimize2 className="w-3.5 h-3.5" />
                    ) : (
                      <Maximize2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Right Studio Content Stage */}
              <div className="flex-1 overflow-y-auto p-6">
                {!currentProject.canonical ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-[#FFFFFF] border-2 border-[#111111] shadow-[4px_4px_0px_#111111] space-y-3">
                    <Cpu className="w-10 h-10 text-[#111111]" />
                    <h3 className="text-base font-display font-bold uppercase">
                      Awaiting Canonical Ground Truth
                    </h3>
                    <p className="text-xs text-[#4A4742] max-w-sm">
                      Ingest sources (YouTube videos, Instagram Reels, documents, or URLs) and build the Canonical Model in the left workbench first.
                    </p>
                  </div>
                ) : !currentProject.artifacts ? (
                  <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-[#FFFFFF] border-2 border-[#111111] shadow-[4px_4px_0px_#111111] space-y-4">
                    <Sparkles className="w-10 h-10 text-[#111111]" />
                    <div>
                      <h3 className="text-base font-display font-bold uppercase">
                        Ready to Synthesize 8 Prizm AI Artifacts
                      </h3>
                      <p className="text-xs text-[#4A4742] max-w-sm mx-auto mt-1">
                        Generates actual Visual Slide Decks with Live Voice Keynote, Data Infographic Posters, Dual-Host Podcasts, Executive Briefs, and Social Threads.
                      </p>
                    </div>
                    <button
                      id="btn-run-transformation-suite"
                      onClick={handleGenerateArtifacts}
                      disabled={isTransforming}
                      className="brutalist-btn bg-[#FFE600] text-[#111111] px-5 py-2.5 text-xs font-mono font-bold flex items-center gap-2 cursor-pointer"
                    >
                      {isTransforming ? (
                        <>
                          <RefreshCw className="w-4 h-4 animate-spin" />
                          <span>Synthesizing 8 Artifacts...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          <span>Generate Multi-Output Suite</span>
                        </>
                      )}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {/* ARTIFACT 01: EXECUTIVE SUMMARY */}
                    {rightTab === "summary" && (
                      <div className="bg-[#FFFFFF] border-2 border-[#111111] shadow-[6px_6px_0px_#111111] p-6 space-y-5">
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#111111] pb-3">
                          <div>
                            <span className="text-[10px] font-mono font-bold uppercase text-[#4A4742]">
                              01 / PRIZM AI EXECUTIVE BRIEFING
                            </span>
                            <h4 className="text-xl font-display font-extrabold text-[#111111]">
                              Executive Summary
                            </h4>
                          </div>
                          <button
                            onClick={() => {
                              const briefText = `EXECUTIVE BRIEFING\n\nPurpose:\n${currentProject.artifacts!.executiveSummary.purpose}\n\nKey Findings:\n${currentProject.artifacts!.executiveSummary.keyFindings.join("\n")}\n\nCritical Risks:\n${currentProject.artifacts!.executiveSummary.criticalRisks.join("\n")}\n\nRecommendations:\n${currentProject.artifacts!.executiveSummary.recommendations.join("\n")}\n\nConclusion:\n${currentProject.artifacts!.executiveSummary.conclusion}`;
                              copyToClipboard(briefText, "summary", "Copied Executive Brief");
                            }}
                            className="brutalist-btn bg-[#FFE600] text-[#111111] px-3 py-1.5 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            {copiedStates["summary"] ? (
                              <Check className="w-3.5 h-3.5" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                            <span>{copiedStates["summary"] ? "Copied" : "Copy Brief"}</span>
                          </button>
                        </div>

                        <div className="space-y-4 text-sm text-[#111111] leading-relaxed max-w-2xl">
                          <div className="bg-[#F7F5F0] border-l-4 border-[#111111] p-3.5">
                            <strong className="font-mono text-xs uppercase block mb-1">
                              Purpose & Mandate
                            </strong>
                            <p className="text-xs leading-relaxed">
                              {currentProject.artifacts.executiveSummary.purpose}
                            </p>
                          </div>

                          <div>
                            <strong className="font-mono text-xs uppercase block mb-2 border-b border-[#111111]/20 pb-1">
                              Key Grounded Findings
                            </strong>
                            <ul className="space-y-1.5 text-xs">
                              {currentProject.artifacts.executiveSummary.keyFindings.map((f, i) => (
                                <li key={i} className="flex items-start gap-2">
                                  <span className="font-mono font-bold">■</span>
                                  <span>{f}</span>
                                </li>
                              ))}
                            </ul>
                          </div>

                          <div>
                            <strong className="font-mono text-xs uppercase block mb-2 text-[#FF2A2A] border-b border-[#111111]/20 pb-1">
                              Identified Critical Risks
                            </strong>
                            <ul className="space-y-1.5 text-xs">
                              {currentProject.artifacts.executiveSummary.criticalRisks.map(
                                (r, i) => (
                                  <li key={i} className="flex items-start gap-2 font-medium">
                                    <span className="font-mono font-bold text-[#FF2A2A]">▲</span>
                                    <span>{r}</span>
                                  </li>
                                )
                              )}
                            </ul>
                          </div>

                          <div>
                            <strong className="font-mono text-xs uppercase block mb-2 border-b border-[#111111]/20 pb-1">
                              Strategic Recommendations
                            </strong>
                            <ul className="space-y-1.5 text-xs">
                              {currentProject.artifacts.executiveSummary.recommendations.map(
                                (rec, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="font-mono font-bold">→</span>
                                    <span>{rec}</span>
                                  </li>
                                )
                              )}
                            </ul>
                          </div>

                          <div className="bg-[#111111] text-[#FFFFFF] p-4 border-2 border-[#111111]">
                            <strong className="text-[#FFE600] font-mono text-[10px] uppercase block mb-1">
                              Executive Conclusion
                            </strong>
                            <p className="text-xs font-serif-editorial italic leading-relaxed">
                              "{currentProject.artifacts.executiveSummary.conclusion}"
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ARTIFACT 02: FORMAL RISK ADVISORY */}
                    {rightTab === "advisory" && (
                      <div className="bg-[#FFFFFF] border-2 border-[#111111] shadow-[6px_6px_0px_#111111] p-6 space-y-5">
                        <div className="flex items-center justify-between border-b-2 border-[#111111] pb-3">
                          <div className="flex items-center gap-2">
                            <Shield className="w-5 h-5 text-[#FF2A2A]" />
                            <div>
                              <span className="text-[10px] font-mono font-bold uppercase text-[#FF2A2A]">
                                02 / OFFICIAL BULLETIN
                              </span>
                              <h4 className="text-lg font-display font-extrabold">
                                Formal Risk Advisory
                              </h4>
                            </div>
                          </div>
                          <button
                            onClick={() => {
                              const advText = `${currentProject.artifacts!.advisory.title}\n\nBackground:\n${currentProject.artifacts!.advisory.background}\n\nSituation Overview:\n${currentProject.artifacts!.advisory.situationOverview}\n\nImpact Assessment:\n${currentProject.artifacts!.advisory.impactAssessment}\n\nRecommendations:\n${currentProject.artifacts!.advisory.recommendations.join("\n")}\n\nAction Items:\n${currentProject.artifacts!.advisory.actionItems.join("\n")}`;
                              copyToClipboard(advText, "advisory", "Copied Formal Advisory");
                            }}
                            className="brutalist-btn bg-[#FFE600] text-[#111111] px-3 py-1.5 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Bulletin</span>
                          </button>
                        </div>

                        <div className="bg-[#111111] text-[#FFFFFF] p-3.5 border-2 border-[#111111] flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold uppercase">
                            {currentProject.artifacts.advisory.title}
                          </span>
                          <span className="bg-[#FF2A2A] text-white font-mono text-[10px] font-bold px-2 py-0.5 uppercase shrink-0">
                            PRIORITY ALERT
                          </span>
                        </div>

                        <div className="space-y-4 text-xs leading-relaxed">
                          <div>
                            <strong className="font-mono uppercase block text-[#111111] mb-1">
                              Background & Context
                            </strong>
                            <p className="text-[#4A4742]">
                              {currentProject.artifacts.advisory.background}
                            </p>
                          </div>
                          <div>
                            <strong className="font-mono uppercase block text-[#111111] mb-1">
                              Situation Overview
                            </strong>
                            <p className="text-[#4A4742]">
                              {currentProject.artifacts.advisory.situationOverview}
                            </p>
                          </div>
                          <div>
                            <strong className="font-mono uppercase block text-[#111111] mb-1">
                              Operational Impact Assessment
                            </strong>
                            <p className="text-[#4A4742]">
                              {currentProject.artifacts.advisory.impactAssessment}
                            </p>
                          </div>

                          <div className="border-2 border-[#111111] bg-[#F7F5F0] p-4 space-y-3">
                            <strong className="font-mono uppercase block text-[#111111]">
                              Actionable Remediation Checklist
                            </strong>
                            <div className="space-y-2">
                              {currentProject.artifacts.advisory.actionItems.map((item, i) => {
                                const key = `${currentProject.id}-act-${i}`;
                                const checked = !!checkedActionItems[key];
                                return (
                                  <label
                                    key={i}
                                    className="flex items-start gap-2.5 cursor-pointer select-none"
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleActionItem(key)}
                                      className="mt-0.5 h-4 w-4 accent-[#111111] border-2 border-[#111111]"
                                    />
                                    <span
                                      className={`text-xs ${
                                        checked
                                          ? "line-through text-[#4A4742]"
                                          : "text-[#111111] font-medium"
                                      }`}
                                    >
                                      {item}
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ARTIFACT 03: LINKEDIN POST */}
                    {rightTab === "linkedin" && (
                      <div className="bg-[#FFFFFF] border-2 border-[#111111] shadow-[6px_6px_0px_#111111] p-6 space-y-4">
                        <div className="flex items-center justify-between border-b-2 border-[#111111] pb-3">
                          <div>
                            <span className="text-[10px] font-mono font-bold uppercase text-[#4A4742]">
                              03 / EXECUTIVE SOCIAL DISPATCH
                            </span>
                            <h4 className="text-lg font-display font-extrabold">
                              LinkedIn Thought-Leadership Post
                            </h4>
                          </div>
                          <button
                            onClick={() => {
                              const text = `${currentProject.artifacts!.linkedInPost.hook}\n\nKey Insights:\n${currentProject.artifacts!.linkedInPost.insights.map((i) => `• ${i}`).join("\n")}\n\nStrategic Takeaways:\n${currentProject.artifacts!.linkedInPost.takeaways.map((t) => `👉 ${t}`).join("\n")}\n\n${currentProject.artifacts!.linkedInPost.cta}`;
                              copyToClipboard(text, "linkedin", "Copied LinkedIn Post");
                            }}
                            className="brutalist-btn bg-[#FFE600] text-[#111111] px-3 py-1.5 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Post</span>
                          </button>
                        </div>

                        <div className="bg-[#F7F5F0] border-2 border-[#111111] p-5 space-y-4 text-xs leading-relaxed">
                          <p className="font-bold text-sm text-[#111111]">
                            {currentProject.artifacts.linkedInPost.hook}
                          </p>
                          <div className="space-y-1.5">
                            {currentProject.artifacts.linkedInPost.insights.map((ins, i) => (
                              <p key={i}>• {ins}</p>
                            ))}
                          </div>
                          <div className="space-y-1.5 border-t border-[#111111]/20 pt-3">
                            <strong className="font-mono uppercase text-[10px] block">
                              Strategic Takeaways:
                            </strong>
                            {currentProject.artifacts.linkedInPost.takeaways.map((t, i) => (
                              <p key={i}>→ {t}</p>
                            ))}
                          </div>
                          <p className="font-bold text-[#111111] pt-2 border-t border-[#111111]/20">
                            {currentProject.artifacts.linkedInPost.cta}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* ARTIFACT 04: TWITTER / X THREAD */}
                    {rightTab === "twitter" && (
                      <div className="bg-[#FFFFFF] border-2 border-[#111111] shadow-[6px_6px_0px_#111111] p-6 space-y-4">
                        <div className="flex items-center justify-between border-b-2 border-[#111111] pb-3">
                          <div>
                            <span className="text-[10px] font-mono font-bold uppercase text-[#4A4742]">
                              04 / SEQUENTIAL DISPATCH
                            </span>
                            <h4 className="text-lg font-display font-extrabold">
                              {currentProject.artifacts.twitterThread.threadTitle}
                            </h4>
                          </div>
                          <button
                            onClick={() => {
                              const allTweets = currentProject.artifacts!.twitterThread.tweets
                                .map((t) => `${t.index}/ ${t.content}`)
                                .join("\n\n");
                              copyToClipboard(allTweets, "twitter", "Copied Full X Thread");
                            }}
                            className="brutalist-btn bg-[#FFE600] text-[#111111] px-3 py-1.5 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Thread</span>
                          </button>
                        </div>

                        <div className="space-y-3">
                          {currentProject.artifacts.twitterThread.tweets.map((tweet) => (
                            <div
                              key={tweet.index}
                              className="bg-[#F7F5F0] border-2 border-[#111111] p-4 flex items-start justify-between gap-3"
                            >
                              <div className="space-y-1.5 flex-1">
                                <div className="flex items-center gap-2 text-[11px] font-mono text-[#4A4742] tabular-nums">
                                  <span className="bg-[#111111] text-[#FFE600] font-bold px-1.5 py-0.5">
                                    POST {String(tweet.index).padStart(2, "0")}
                                  </span>
                                  <span>·</span>
                                  <span>{tweet.content.length} / 280 chars</span>
                                </div>
                                <p className="text-xs text-[#111111] leading-relaxed">
                                  {tweet.content}
                                </p>
                              </div>
                              <button
                                onClick={() =>
                                  copyToClipboard(
                                    tweet.content,
                                    `tweet-${tweet.index}`,
                                    `Copied Post #${tweet.index}`
                                  )
                                }
                                className="p-1.5 border border-[#111111] bg-[#FFFFFF] hover:bg-[#FFE600] cursor-pointer"
                              >
                                <Copy className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ARTIFACT 05: GENERATIVE VISUAL SLIDE DECK + LIVE VOICE KEYNOTE PRESENTER */}
                    {rightTab === "presentation" && (
                      <div className="space-y-4">
                        {/* Generative Slide Deck AI Studio Bar */}
                        <div className="bg-[#FFFFFF] border-2 border-[#111111] shadow-[4px_4px_0px_#111111] p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <BarChart3 className="w-4 h-4 text-[#111111]" />
                              <span className="text-xs font-mono font-bold uppercase">
                                Prizm AI Generative Slide Studio
                              </span>
                            </div>

                            {/* Theme Palette Switcher */}
                            <div className="flex items-center gap-1.5 font-mono text-[11px]">
                              <span className="text-[#4A4742]">Theme:</span>
                              {(
                                [
                                  { id: "acid", label: "Acid Yellow" },
                                  { id: "blueprint", label: "Blueprint" },
                                  { id: "crimson", label: "Signal Red" },
                                ] as const
                              ).map((t) => (
                                <button
                                  key={t.id}
                                  onClick={() => setSlideTheme(t.id)}
                                  className={`px-2 py-0.5 border border-[#111111] cursor-pointer ${
                                    slideTheme === t.id
                                      ? "bg-[#111111] text-[#FFE600] font-bold"
                                      : "bg-[#F7F5F0] text-[#111111]"
                                  }`}
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              placeholder="Optional prompt to customize or regenerate visual slides (e.g. 'Focus on cybersecurity metrics & boardroom ROI')..."
                              value={slideDirective}
                              onChange={(e) => setSlideDirective(e.target.value)}
                              className="flex-1 bg-[#F7F5F0] border-2 border-[#111111] px-3 py-1.5 text-xs font-mono focus:outline-none"
                            />
                            <button
                              onClick={() => handleGenerateVisualArtifact("slides")}
                              disabled={isGeneratingSlides}
                              className="brutalist-btn bg-[#FFE600] text-[#111111] px-3.5 py-1.5 text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                            >
                              {isGeneratingSlides ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Generating Visual Slides...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>Generate Visual Deck</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {(() => {
                          const slides = currentProject.artifacts.presentation.slides || [];
                          const currentSlide = slides[currentSlideIndex] || slides[0];
                          if (!currentSlide) return null;

                          const { visualType, chartData } = getEnrichedSlideVisualData(
                            currentSlide,
                            currentSlideIndex,
                            currentProject.canonical
                          );
                          const themeColors = getVisualThemeColors(slideTheme);

                          return (
                            <div className="bg-[#FFFFFF] border-2 border-[#111111] shadow-[6px_6px_0px_#111111] overflow-hidden">
                              {/* Slide Top Bar + Live Voice Keynote Controls */}
                              <div
                                style={{ backgroundColor: themeColors.headerBg }}
                                className="text-[#FFFFFF] px-5 py-3 flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#111111]"
                              >
                                <div className="flex items-center gap-2.5 font-mono text-xs">
                                  <span
                                    style={{
                                      backgroundColor: themeColors.accentBg,
                                      color: themeColors.accentText,
                                    }}
                                    className="font-bold px-2 py-0.5 tabular-nums border border-white/30"
                                  >
                                    SLIDE {String(currentSlide.slideNumber).padStart(2, "0")} /{" "}
                                    {String(slides.length).padStart(2, "0")}
                                  </span>

                                  {/* Live Auto-Presenting Voice Keynote Button (Just Like Podcast!) */}
                                  <button
                                    onClick={toggleSlideKeynotePlayback}
                                    className="bg-[#FFE600] text-[#111111] px-3 py-1 text-[11px] font-mono font-bold flex items-center gap-1.5 cursor-pointer border border-[#111111]"
                                  >
                                    {isSlideKeynotePlaying ? (
                                      <>
                                        <Pause className="w-3 h-3 fill-current" />
                                        <span>Pause Live Keynote</span>
                                      </>
                                    ) : (
                                      <>
                                        <Volume2 className="w-3.5 h-3.5" />
                                        <span>Present Live (Voice + Auto-Slide)</span>
                                      </>
                                    )}
                                  </button>
                                </div>

                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={handleExportHtmlSlides}
                                    className="bg-white/15 hover:bg-white/25 text-white px-2.5 py-1 text-[11px] font-mono font-bold flex items-center gap-1 cursor-pointer"
                                  >
                                    <Download className="w-3 h-3" />
                                    <span>Export .HTML</span>
                                  </button>
                                  <button
                                    onClick={() =>
                                      setCurrentSlideIndex((prev) => Math.max(0, prev - 1))
                                    }
                                    disabled={currentSlideIndex === 0}
                                    className="p-1 bg-white/10 hover:bg-white/20 disabled:opacity-30 cursor-pointer"
                                  >
                                    <ChevronLeft className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() =>
                                      setCurrentSlideIndex((prev) =>
                                        Math.min(slides.length - 1, prev + 1)
                                      )
                                    }
                                    disabled={currentSlideIndex === slides.length - 1}
                                    className="p-1 bg-white/10 hover:bg-white/20 disabled:opacity-30 cursor-pointer"
                                  >
                                    <ChevronRight className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              {/* Generative 2-Column Slide Stage (Left: Narrative Points · Right: Self-Generated Visual Chart/Diagram) */}
                              <div className="p-6 lg:p-8 bg-[#FFFFFF] space-y-6">
                                <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
                                  {/* Left Column: Slide Title, Subtitle & Key Points */}
                                  <div className="xl:col-span-6 space-y-4">
                                    <div>
                                      {currentSlide.subtitle && (
                                        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#4A4742] block mb-1">
                                          {currentSlide.subtitle}
                                        </span>
                                      )}
                                      <h3 className="text-2xl font-display font-extrabold text-[#111111] leading-tight">
                                        {currentSlide.title}
                                      </h3>
                                    </div>

                                    <ul className="space-y-3 text-xs sm:text-sm text-[#111111]">
                                      {currentSlide.content.map((point, idx) => (
                                        <li
                                          key={idx}
                                          className="flex items-start gap-2.5 bg-[#F7F5F0] border-l-4 border-[#111111] p-2.5"
                                        >
                                          <span className="font-mono font-bold text-[#111111] tabular-nums">
                                            0{idx + 1}
                                          </span>
                                          <span className="leading-relaxed">{point}</span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>

                                  {/* Right Column: ACTUAL GENERATED VISUAL CHART / DIAGRAM CANVAS */}
                                  <div className="xl:col-span-6 bg-[#F7F5F0] border-2 border-[#111111] shadow-[4px_4px_0px_#111111] p-4 space-y-3">
                                    <div className="flex items-center justify-between border-b-2 border-[#111111] pb-2">
                                      <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#111111]">
                                        GENERATED SLIDE VISUAL · {visualType.toUpperCase()}
                                      </span>
                                      <span className="text-[10px] font-mono text-[#4A4742]">
                                        GROUNDED DATA
                                      </span>
                                    </div>

                                    {/* Visual Renderer Type 1: Proportional Bar Chart */}
                                    {(visualType === "bar-chart" ||
                                      visualType === "comparison-split") && (
                                      <div className="space-y-3 pt-1">
                                        {chartData.map((d, i) => (
                                          <div key={i} className="space-y-1">
                                            <div className="flex items-center justify-between text-xs font-mono">
                                              <span className="font-bold text-[#111111] truncate max-w-[180px]">
                                                {d.label}
                                              </span>
                                              <span
                                                style={{
                                                  backgroundColor: themeColors.accentBg,
                                                  color: themeColors.accentText,
                                                }}
                                                className="font-extrabold px-1.5 py-0.5 border border-[#111111] tabular-nums text-[11px]"
                                              >
                                                {d.displayValue}
                                              </span>
                                            </div>
                                            <div className="h-5 w-full bg-[#FFFFFF] border-2 border-[#111111] overflow-hidden">
                                              <div
                                                style={{
                                                  width: `${Math.min(100, Math.max(15, d.value))}%`,
                                                  backgroundColor: themeColors.barColor,
                                                }}
                                                className="h-full border-r-2 border-[#111111] transition-all duration-300"
                                              />
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Visual Renderer Type 2: SVG Radial Gauge Rings */}
                                    {visualType === "radial-gauge" && (
                                      <div className="grid grid-cols-2 gap-3 pt-1">
                                        {chartData.slice(0, 4).map((d, i) => {
                                          const pct = Math.min(100, Math.max(15, d.value));
                                          const radius = 28;
                                          const circumference = 2 * Math.PI * radius;
                                          const dashOffset =
                                            circumference - (pct / 100) * circumference;

                                          return (
                                            <div
                                              key={i}
                                              className="bg-[#FFFFFF] border-2 border-[#111111] p-2.5 flex items-center gap-2.5"
                                            >
                                              <svg
                                                className="w-16 h-16 shrink-0 -rotate-90"
                                                viewBox="0 0 72 72"
                                              >
                                                <circle
                                                  cx="36"
                                                  cy="36"
                                                  r={radius}
                                                  fill="none"
                                                  stroke="#EAE6DF"
                                                  strokeWidth="8"
                                                />
                                                <circle
                                                  cx="36"
                                                  cy="36"
                                                  r={radius}
                                                  fill="none"
                                                  stroke="#111111"
                                                  strokeWidth="8"
                                                  strokeDasharray={circumference}
                                                  strokeDashoffset={dashOffset}
                                                />
                                              </svg>
                                              <div className="min-w-0">
                                                <span className="text-sm font-mono font-extrabold text-[#111111] block tabular-nums truncate">
                                                  {d.displayValue}
                                                </span>
                                                <span className="text-[10px] font-mono text-[#4A4742] block leading-tight line-clamp-2">
                                                  {d.label}
                                                </span>
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* Visual Renderer Type 3: 2x2 Metric Grid */}
                                    {visualType === "metric-grid" && (
                                      <div className="grid grid-cols-2 gap-2.5 pt-1">
                                        {chartData.slice(0, 4).map((d, i) => (
                                          <div
                                            key={i}
                                            className="bg-[#FFFFFF] border-2 border-[#111111] p-3 flex flex-col justify-between"
                                          >
                                            <span className="text-[10px] font-mono font-bold uppercase text-[#4A4742]">
                                              {d.label}
                                            </span>
                                            <span
                                              style={{
                                                backgroundColor: themeColors.accentBg,
                                                color: themeColors.accentText,
                                              }}
                                              className="text-base font-mono font-extrabold px-2 py-1 border border-[#111111] mt-2 self-start tabular-nums"
                                            >
                                              {d.displayValue}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}

                                    {/* Visual Renderer Type 4: Connected Process Flow Diagram */}
                                    {visualType === "process-flow" && (
                                      <div className="space-y-2 pt-1">
                                        {chartData.map((d, i) => (
                                          <div
                                            key={i}
                                            className="bg-[#FFFFFF] border-2 border-[#111111] p-2.5 flex items-center justify-between gap-2"
                                          >
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span
                                                style={{
                                                  backgroundColor: themeColors.accentBg,
                                                  color: themeColors.accentText,
                                                }}
                                                className="font-mono text-xs font-bold px-2 py-0.5 border border-[#111111] tabular-nums"
                                              >
                                                STEP 0{i + 1}
                                              </span>
                                              <span className="text-xs font-bold text-[#111111] truncate">
                                                {d.label}
                                              </span>
                                            </div>
                                            <span className="text-[11px] font-mono font-bold text-[#4A4742] shrink-0 tabular-nums">
                                              {d.displayValue}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {/* Live Voice Keynote Presenter Script Box */}
                                <div className="bg-[#111111] text-[#FFFFFF] border-2 border-[#111111] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                  <div className="space-y-1">
                                    <span className="text-[10px] font-mono font-bold uppercase text-[#FFE600] flex items-center gap-1.5">
                                      <Volume2 className="w-3.5 h-3.5" />
                                      <span>
                                        {isSlideKeynotePlaying
                                          ? "LIVE KEYNOTE VOICE ACTIVE — SPEAKING SLIDE..."
                                          : "KEYNOTE PRESENTER VOICE SCRIPT"}
                                      </span>
                                    </span>
                                    <p className="text-xs text-[#EAE6DF] italic leading-relaxed">
                                      "{currentSlide.speakerNotes}"
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {/* Slide Thumbnail Strip */}
                              <div className="bg-[#EAE6DF] border-t-2 border-[#111111] px-4 py-2.5 flex items-center gap-1.5 overflow-x-auto">
                                {slides.map((s, idx) => (
                                  <button
                                    key={idx}
                                    onClick={() => {
                                      setCurrentSlideIndex(idx);
                                      if (isSlideKeynotePlaying) {
                                        speakSlideKeynote(idx);
                                      }
                                    }}
                                    className={`px-2.5 py-1 text-xs font-mono font-bold border border-[#111111] tabular-nums cursor-pointer ${
                                      idx === currentSlideIndex
                                        ? "bg-[#111111] text-[#FFE600]"
                                        : "bg-[#FFFFFF] text-[#111111]"
                                    }`}
                                  >
                                    {String(idx + 1).padStart(2, "0")}. {s.title.slice(0, 14)}..
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* ARTIFACT 06: ACTUAL GENERATIVE VISUAL INFOGRAPHIC POSTER + AUDIO WALKTHROUGH */}
                    {rightTab === "infographic" && (
                      <div className="space-y-4">
                        {/* Generative Infographic AI Studio Bar */}
                        <div className="bg-[#FFFFFF] border-2 border-[#111111] shadow-[4px_4px_0px_#111111] p-4 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <PieChart className="w-4 h-4 text-[#111111]" />
                              <span className="text-xs font-mono font-bold uppercase">
                                Prizm AI Generative Infographic Poster Studio
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5 font-mono text-[11px]">
                              <span className="text-[#4A4742]">Poster Palette:</span>
                              {(
                                [
                                  { id: "acid", label: "Acid Yellow" },
                                  { id: "blueprint", label: "Blueprint" },
                                  { id: "crimson", label: "Signal Red" },
                                ] as const
                              ).map((t) => (
                                <button
                                  key={t.id}
                                  onClick={() => setInfographicTheme(t.id)}
                                  className={`px-2 py-0.5 border border-[#111111] cursor-pointer ${
                                    infographicTheme === t.id
                                      ? "bg-[#111111] text-[#FFE600] font-bold"
                                      : "bg-[#F7F5F0] text-[#111111]"
                                  }`}
                                >
                                  {t.label}
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              placeholder="Optional prompt to customize & regenerate the visual infographic (e.g. 'Emphasize quantitative benchmarks & 4-step response flow')..."
                              value={infographicDirective}
                              onChange={(e) => setInfographicDirective(e.target.value)}
                              className="flex-1 bg-[#F7F5F0] border-2 border-[#111111] px-3 py-1.5 text-xs font-mono focus:outline-none"
                            />
                            <button
                              onClick={() => handleGenerateVisualArtifact("infographic")}
                              disabled={isGeneratingInfographic}
                              className="brutalist-btn bg-[#FFE600] text-[#111111] px-3.5 py-1.5 text-xs font-mono font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
                            >
                              {isGeneratingInfographic ? (
                                <>
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                  <span>Generating Poster...</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>Generate Visual Infographic</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        {/* ACTUAL GENERATED VISUAL INFOGRAPHIC POSTER CANVAS */}
                        {(() => {
                          const info = currentProject.artifacts.infographic;
                          const themeColors = getVisualThemeColors(infographicTheme);
                          const processSteps =
                            info.processSteps && info.processSteps.length > 0
                              ? info.processSteps
                              : (currentProject.canonical?.timeline || []).slice(0, 4).map((t) => ({
                                  step: t.step,
                                  detail: t.description,
                                }));

                          return (
                            <div className="bg-[#F7F5F0] border-4 border-[#111111] shadow-[8px_8px_0px_#111111] overflow-hidden">
                              {/* Poster Masthead Header */}
                              <div
                                style={{ backgroundColor: themeColors.headerBg }}
                                className="text-[#FFFFFF] p-6 border-b-4 border-[#111111] space-y-3"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="text-[11px] font-mono font-bold uppercase text-[#FFE600]">
                                    PRIZM AI // GENERATIVE DATA INFOGRAPHIC ·{" "}
                                    {currentProject.params.domain.toUpperCase()}
                                  </span>

                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={toggleInfographicNarration}
                                      className="bg-[#FFE600] text-[#111111] px-3 py-1 text-[11px] font-mono font-bold flex items-center gap-1.5 cursor-pointer border border-[#111111]"
                                    >
                                      {isInfographicNarrating ? (
                                        <>
                                          <Pause className="w-3 h-3 fill-current" />
                                          <span>Stop Audio Walkthrough</span>
                                        </>
                                      ) : (
                                        <>
                                          <Volume2 className="w-3.5 h-3.5" />
                                          <span>Narrate Infographic</span>
                                        </>
                                      )}
                                    </button>
                                    <button
                                      onClick={handleExportInfographicPoster}
                                      className="bg-white/15 hover:bg-white/25 text-white px-2.5 py-1 text-[11px] font-mono font-bold flex items-center gap-1 cursor-pointer"
                                    >
                                      <Download className="w-3 h-3" />
                                      <span>Download Poster .HTML</span>
                                    </button>
                                  </div>
                                </div>

                                <h3 className="text-2xl sm:text-3xl font-display font-extrabold leading-tight">
                                  {info.headline}
                                </h3>
                                <p className="text-xs text-[#EAE6DF] max-w-2xl leading-relaxed">
                                  {info.subheadline || currentProject.canonical?.mainObjective}
                                </p>
                              </div>

                              {/* Poster Tier 1: Generated Visual KPI Gauges & Proportional Meters */}
                              <div
                                style={{ backgroundColor: themeColors.secondaryBg }}
                                className="p-5 border-b-4 border-[#111111]"
                              >
                                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#111111] mb-3">
                                  01 // QUANTITATIVE GROUND TRUTH TELEMETRY
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                  {info.keyMetrics.map((m, idx) => {
                                    const numMatch = m.value.match(/(\d+(?:\.\d+)?)/);
                                    const pct =
                                      m.percentage ||
                                      (numMatch
                                        ? Math.min(100, Math.max(20, parseFloat(numMatch[1])))
                                        : [88, 74, 95, 68][idx % 4]);

                                    return (
                                      <div
                                        key={idx}
                                        className="bg-[#FFFFFF] border-2 border-[#111111] shadow-[4px_4px_0px_#111111] p-3.5 flex flex-col justify-between space-y-2"
                                      >
                                        <div className="flex items-start justify-between gap-1">
                                          <span className="text-[10px] font-mono font-bold uppercase text-[#4A4742]">
                                            {m.label}
                                          </span>
                                          {m.trend && (
                                            <span className="text-[9px] font-mono font-bold bg-[#111111] text-[#FFE600] px-1.5 py-0.5">
                                              {m.trend}
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-xl font-mono font-extrabold text-[#111111] tabular-nums">
                                          {m.value}
                                        </div>
                                        <div className="h-2.5 w-full bg-[#EAE6DF] border border-[#111111]">
                                          <div
                                            style={{
                                              width: `${pct}%`,
                                              backgroundColor: themeColors.barColor,
                                            }}
                                            className="h-full border-r border-[#111111]"
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Poster Tier 2: Generated Visual Data Modules & Mini Charts */}
                              <div className="p-5 space-y-4">
                                <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#111111]">
                                  02 // STRUCTURAL INTELLIGENCE MODULES
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {info.sections.map((sec, idx) => {
                                    const isNarratingThis = activeInfographicSection === idx;
                                    const sectionMetrics =
                                      sec.metrics && sec.metrics.length > 0
                                        ? sec.metrics
                                        : (currentProject.canonical?.statistics || [])
                                            .slice(idx, idx + 2)
                                            .map((st, sIdx) => ({
                                              label: st.metric,
                                              value: st.value,
                                              percentage: 82 - sIdx * 18,
                                            }));

                                    return (
                                      <div
                                        key={idx}
                                        className={`bg-[#FFFFFF] border-2 border-[#111111] p-4 space-y-3 transition ${
                                          isNarratingThis
                                            ? "shadow-[6px_6px_0px_#FF2A2A] ring-2 ring-[#FF2A2A]"
                                            : "shadow-[4px_4px_0px_#111111]"
                                        }`}
                                      >
                                        <div className="flex items-center justify-between border-b-2 border-[#111111] pb-2">
                                          <div className="flex items-center gap-2">
                                            <span
                                              style={{
                                                backgroundColor: themeColors.accentBg,
                                                color: themeColors.accentText,
                                              }}
                                              className="font-mono text-xs font-bold px-2 py-0.5 border border-[#111111] tabular-nums"
                                            >
                                              0{idx + 1}
                                            </span>
                                            <h5 className="text-sm font-display font-extrabold text-[#111111]">
                                              {sec.title}
                                            </h5>
                                          </div>
                                        </div>

                                        <p className="text-xs text-[#4A4742] leading-relaxed">
                                          {sec.content}
                                        </p>

                                        {/* Embedded Visual Bar Sub-Chart inside each Infographic Module */}
                                        {sectionMetrics.length > 0 && (
                                          <div className="bg-[#F7F5F0] border border-[#111111] p-2.5 space-y-2">
                                            {sectionMetrics.map((sm, mIdx) => {
                                              const pct = sm.percentage || 75;
                                              return (
                                                <div key={mIdx} className="space-y-1">
                                                  <div className="flex justify-between text-[11px] font-mono">
                                                    <span className="font-semibold text-[#111111]">
                                                      {sm.label}
                                                    </span>
                                                    <span className="font-bold tabular-nums">
                                                      {sm.value}
                                                    </span>
                                                  </div>
                                                  <div className="h-2.5 bg-[#FFFFFF] border border-[#111111]">
                                                    <div
                                                      style={{
                                                        width: `${Math.min(100, Math.max(15, pct))}%`,
                                                        backgroundColor: themeColors.barColor,
                                                      }}
                                                      className="h-full"
                                                    />
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>

                              {/* Poster Tier 3: Generated Sequential Architecture / Process Flow Diagram */}
                              {processSteps.length > 0 && (
                                <div className="p-5 bg-[#EAE6DF] border-t-4 border-[#111111] space-y-3">
                                  <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-[#111111]">
                                    <GitBranch className="w-3.5 h-3.5" />
                                    <span>03 // GENERATED EXECUTION FLOW DIAGRAM</span>
                                  </div>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                    {processSteps.map((st, idx) => (
                                      <div
                                        key={idx}
                                        className="bg-[#FFFFFF] border-2 border-[#111111] shadow-[3px_3px_0px_#111111] p-3 relative"
                                      >
                                        <div className="text-[10px] font-mono font-bold bg-[#111111] text-[#FFE600] inline-block px-1.5 py-0.5 mb-1.5 tabular-nums">
                                          PHASE 0{idx + 1}
                                        </div>
                                        <h6 className="text-xs font-bold text-[#111111] mb-1">
                                          {st.step}
                                        </h6>
                                        <p className="text-[11px] text-[#4A4742] leading-snug">
                                          {st.detail}
                                        </p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* ARTIFACT 07: VIDEO STORYBOARD & SCRIPT */}
                    {rightTab === "video" && (
                      <div className="bg-[#FFFFFF] border-2 border-[#111111] shadow-[6px_6px_0px_#111111] p-6 space-y-5">
                        <div className="flex items-center justify-between border-b-2 border-[#111111] pb-3">
                          <div>
                            <span className="text-[10px] font-mono font-bold uppercase text-[#4A4742]">
                              07 / BROADCAST PRODUCTION PACKAGE ·{" "}
                              {currentProject.artifacts.videoPackage.duration}
                            </span>
                            <h4 className="text-lg font-display font-extrabold">
                              {currentProject.artifacts.videoPackage.videoTitle}
                            </h4>
                          </div>
                          <button
                            onClick={() =>
                              copyToClipboard(
                                currentProject.artifacts!.videoPackage.fullScript,
                                "video",
                                "Copied Video Script"
                              )
                            }
                            className="brutalist-btn bg-[#FFE600] text-[#111111] px-3 py-1.5 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Copy Script</span>
                          </button>
                        </div>

                        <div className="space-y-3">
                          {currentProject.artifacts.videoPackage.storyboard.map((scene) => (
                            <div
                              key={scene.sceneNumber}
                              className="bg-[#F7F5F0] border-2 border-[#111111] p-4 space-y-2"
                            >
                              <div className="flex items-center justify-between border-b border-[#111111]/20 pb-1.5">
                                <span className="font-mono text-xs font-bold bg-[#111111] text-[#FFE600] px-2 py-0.5 tabular-nums">
                                  SCENE {String(scene.sceneNumber).padStart(2, "0")}
                                </span>
                                <span className="text-[11px] font-mono text-[#4A4742]">
                                  {scene.storyboardDescription}
                                </span>
                              </div>
                              <p className="text-xs text-[#111111] font-medium">
                                <strong className="font-mono uppercase text-[10px]">
                                  Narration:
                                </strong>{" "}
                                "{scene.narration}"
                              </p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] pt-1">
                                <div className="bg-[#FFFFFF] border border-[#111111] p-2">
                                  <strong className="font-mono uppercase text-[10px] block">
                                    Visual Shot:
                                  </strong>
                                  {scene.visualRecommendations}
                                </div>
                                <div className="bg-[#FFFFFF] border border-[#111111] p-2 font-mono">
                                  <strong className="uppercase text-[10px] block">
                                    Captions / Subtitles:
                                  </strong>
                                  {scene.subtitles}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* ARTIFACT 08: 2-HOST PODCAST OVERVIEW (REAL WEB SPEECH API TTS) */}
                    {rightTab === "audio" && (
                      <div className="bg-[#FFFFFF] border-2 border-[#111111] shadow-[6px_6px_0px_#111111] overflow-hidden">
                        <div className="bg-[#111111] text-[#FFFFFF] p-5 space-y-4">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <div className="flex items-center gap-2 text-[11px] font-mono text-[#FFE600]">
                                <Volume2 className="w-4 h-4" />
                                <span>
                                  PRIZM AI DUAL-HOST TTS STUDIO ·{" "}
                                  {currentProject.artifacts.audioOverview.hosts.join(" & ")}
                                </span>
                              </div>
                              <h4 className="text-lg font-display font-extrabold mt-1">
                                {currentProject.artifacts.audioOverview.title}
                              </h4>
                            </div>

                            <div className="flex items-center gap-1 font-mono text-xs">
                              {[1, 1.25, 1.5].map((spd) => (
                                <button
                                  key={spd}
                                  onClick={() => changePodcastSpeed(spd)}
                                  className={`px-2 py-1 border border-white/40 cursor-pointer tabular-nums ${
                                    podcastSpeed === spd
                                      ? "bg-[#FFE600] text-[#111111] font-bold"
                                      : "text-white hover:bg-white/10"
                                  }`}
                                >
                                  {spd}x
                                </button>
                              ))}
                            </div>
                          </div>

                          <div className="flex items-center gap-3">
                            <button
                              onClick={togglePodcastPlayback}
                              className="brutalist-btn bg-[#FFE600] text-[#111111] px-4 py-2 text-xs font-mono font-bold flex items-center gap-2 cursor-pointer shrink-0"
                            >
                              {isPodcastPlaying ? (
                                <>
                                  <Pause className="w-4 h-4 fill-current" />
                                  <span>Pause Audio</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-4 h-4 fill-current" />
                                  <span>Speak Podcast Aloud</span>
                                </>
                              )}
                            </button>

                            {isPodcastPlaying && (
                              <button
                                onClick={() => {
                                  stopAllSpeech();
                                  setCurrentPodcastLine(0);
                                  setPodcastProgress(0);
                                }}
                                className="p-2 bg-[#FF2A2A] text-white border border-white cursor-pointer"
                                title="Stop Playback"
                              >
                                <Square className="w-3.5 h-3.5 fill-current" />
                              </button>
                            )}

                            <div className="flex-1 bg-white/20 h-3 border border-white overflow-hidden">
                              <div
                                className="bg-[#FFE600] h-full transition-all duration-200"
                                style={{ width: `${podcastProgress}%` }}
                              />
                            </div>

                            <span className="text-xs font-mono tabular-nums text-[#FFE600]">
                              Line {currentPodcastLine + 1}/
                              {currentProject.artifacts.audioOverview.script.length}
                            </span>
                          </div>
                        </div>

                        <div className="p-5 space-y-2.5 max-h-[420px] overflow-y-auto bg-[#F7F5F0]">
                          <p className="text-[11px] font-mono text-[#4A4742] mb-2">
                            Click any dialogue block below to jump directly to that line in the voice synthesis:
                          </p>
                          {currentProject.artifacts.audioOverview.script.map((seg, idx) => {
                            const isActive = idx === currentPodcastLine;
                            return (
                              <div
                                key={idx}
                                onClick={() => jumpToPodcastLine(idx)}
                                className={`p-3.5 border-2 border-[#111111] transition cursor-pointer ${
                                  isActive
                                    ? "bg-[#FFE600] text-[#111111] shadow-[4px_4px_0px_#111111]"
                                    : "bg-[#FFFFFF] text-[#111111] hover:bg-[#EAE6DF]"
                                }`}
                              >
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs font-mono font-bold uppercase">
                                    {seg.speaker}
                                  </span>
                                  <span className="text-[10px] font-mono tabular-nums opacity-75">
                                    #{String(idx + 1).padStart(2, "0")}
                                  </span>
                                </div>
                                <p className="text-xs leading-relaxed">{seg.dialogue}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
        </main>
      </div>

      {/* MODAL 1: PRIZM AI SOURCE & EXACT TRANSCRIPT INGESTION MODAL */}
      {showAddSourceModal && (
        <div className="fixed inset-0 bg-[#111111]/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#FFFFFF] border-3 border-[#111111] shadow-[8px_8px_0px_#111111] max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b-2 border-[#111111] bg-[#111111] text-[#FFFFFF] flex items-center justify-between">
              <div>
                <h3 className="text-base font-display font-extrabold uppercase text-[#FFE600]">
                  Prizm AI — Ingest Source & Exact Transcript
                </h3>
                <p className="text-[11px] font-mono text-[#EAE6DF]">
                  Exact YouTube & Instagram Reel Transcripts · Websites · Multi-File Batch · AI Dossier
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAddSourceModal(false);
                  setUrlFetchError("");
                  setFileError("");
                  setFileSuccessMessage("");
                }}
                className="text-white hover:text-[#FFE600] font-mono font-bold text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1 bg-[#F7F5F0]">
              {/* 4-Method Segmented Control */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 bg-[#EAE6DF] p-1.5 border-2 border-[#111111]">
                {(
                  [
                    { id: "url", label: "01. YouTube / Reel Transcript" },
                    { id: "file", label: "02. Multi-File Upload" },
                    { id: "ai", label: "03. AI Topic Dossier" },
                    { id: "manual", label: "04. Manual Text" },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      setSourceMethod(m.id);
                      setFileError("");
                      setUrlFetchError("");
                    }}
                    className={`py-2 px-2 text-center text-[11px] font-mono font-bold border border-[#111111] transition cursor-pointer ${
                      sourceMethod === m.id
                        ? "bg-[#FFE600] text-[#111111] shadow-[2px_2px_0px_#111111]"
                        : "bg-[#FFFFFF] text-[#111111] hover:bg-[#F7F5F0]"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* METHOD 1: YOUTUBE VIDEO, INSTAGRAM REEL & WEBSITE EXACT TRANSCRIPT + SUMMARIZER */}
              {sourceMethod === "url" && (
                <div className="bg-[#FFFFFF] border-2 border-[#111111] p-4 space-y-3">
                  <label className="text-xs font-mono font-bold uppercase text-[#111111] flex items-center gap-1.5">
                    <Film className="w-4 h-4" />
                    <span>Paste YouTube Video, Shorts, Instagram Reel, or Website URL</span>
                  </label>
                  <p className="text-xs text-[#4A4742]">
                    Extracts the <strong>exact timestamped transcript (`[MM:SS]`)</strong> from YouTube videos/Shorts and Instagram Reels alongside metadata and an AI executive summary.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="url"
                      placeholder="https://www.youtube.com/watch?v=... or https://www.instagram.com/reel/..."
                      value={newSourceUrl}
                      onChange={(e) => setNewSourceUrl(e.target.value)}
                      className="flex-1 bg-[#F7F5F0] border-2 border-[#111111] p-2.5 text-xs font-mono focus:outline-none focus:bg-[#FFE600]/15"
                    />
                    <button
                      type="button"
                      onClick={() => handleFetchUrl()}
                      disabled={isFetchingUrl || !newSourceUrl.trim()}
                      className="brutalist-btn bg-[#FFE600] text-[#111111] px-4 py-2.5 text-xs font-mono font-bold shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {isFetchingUrl ? (
                        <>
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          <span>Extracting Transcript...</span>
                        </>
                      ) : (
                        <>
                          <Globe className="w-3.5 h-3.5" />
                          <span>Extract Exact Transcript</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Quick Test Links */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] font-mono text-[#4A4742]">Try sample link:</span>
                    {SAMPLE_MEDIA_LINKS.map((item, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleFetchUrl(item.url)}
                        className="text-[10px] font-mono bg-[#F7F5F0] hover:bg-[#FFE600] border border-[#111111] px-2 py-0.5 cursor-pointer"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  {urlFetchError && (
                    <div className="p-2.5 bg-[#FF2A2A] text-white text-xs font-mono">
                      ⚠️ {urlFetchError}
                    </div>
                  )}

                  {/* Live Extracted Metadata & Exact Verbatim Transcript Preview */}
                  {newSourceMetadata && (
                    <div className="border-2 border-[#111111] bg-[#F7F5F0] p-3.5 space-y-3">
                      <div className="flex items-center justify-between text-[11px] font-mono font-bold border-b border-[#111111]/20 pb-1.5">
                        <span>
                          ✓ {newSourceMetadata.platform} · By {newSourceMetadata.author || "Creator"}
                        </span>
                        {newSourceMetadata.duration && <span>{newSourceMetadata.duration}</span>}
                      </div>

                      {newSourceMetadata.summary && (
                        <p className="text-xs text-[#111111] leading-relaxed">
                          <strong>AI Summary:</strong> {newSourceMetadata.summary}
                        </p>
                      )}

                      {/* Exact Timestamped Transcript Preview Inside Modal */}
                      {newSourceMetadata.transcriptSegments &&
                        newSourceMetadata.transcriptSegments.length > 0 && (
                          <div className="bg-[#111111] text-[#FFFFFF] p-3 border border-[#111111] space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] font-mono font-bold text-[#FFE600] uppercase">
                                Exact Timestamped Transcript ({newSourceMetadata.transcriptSegments.length} lines)
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  copyToClipboard(
                                    newSourceMetadata.exactTranscript || "",
                                    "modal-trans",
                                    "Copied Exact Transcript!"
                                  )
                                }
                                className="bg-[#FFE600] text-[#111111] px-2 py-0.5 text-[10px] font-mono font-bold cursor-pointer"
                              >
                                Copy Transcript
                              </button>
                            </div>
                            <div className="max-h-40 overflow-y-auto space-y-1 font-mono text-[11px] pr-1">
                              {newSourceMetadata.transcriptSegments.slice(0, 60).map((seg, idx) => (
                                <div key={idx} className="flex gap-2">
                                  <span className="text-[#FFE600] font-bold shrink-0 tabular-nums">
                                    [{seg.timestamp}]
                                  </span>
                                  <span className="text-[#F7F5F0] font-sans">{seg.text}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              )}

              {/* METHOD 2: MULTI-FILE DRAG & DROP BATCH UPLOAD */}
              {sourceMethod === "file" && (
                <div className="bg-[#FFFFFF] border-2 border-[#111111] p-4 space-y-3">
                  <label className="text-xs font-mono font-bold uppercase text-[#111111] block">
                    Upload Single or Multiple Documents (Batch Ingestion)
                  </label>
                  <input
                    type="file"
                    id="document-file-uploader"
                    multiple
                    accept=".pdf,.txt,.md,.json,.csv,.xml"
                    onChange={handleDocumentFileChange}
                    className="hidden"
                  />
                  <label
                    htmlFor="document-file-uploader"
                    className="border-2 border-dashed border-[#111111] hover:bg-[#FFE600]/20 p-6 flex flex-col items-center justify-center cursor-pointer bg-[#F7F5F0] transition text-center"
                  >
                    <Upload className="w-8 h-8 text-[#111111] mb-2" />
                    <span className="text-xs font-mono font-bold text-[#111111]">
                      Click to Select Multiple Files (or Drag & Drop)
                    </span>
                    <span className="text-[11px] font-mono text-[#4A4742] mt-1">
                      Supports PDF, TXT, MD, CSV, JSON, XML
                    </span>
                  </label>

                  {isProcessingFile && (
                    <div className="flex items-center justify-center gap-2 text-xs font-mono font-bold bg-[#FFE600] p-3 border-2 border-[#111111]">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Extracting text from uploaded files...</span>
                    </div>
                  )}

                  {fileError && (
                    <div className="p-3 bg-[#FF2A2A] text-white text-xs font-mono">
                      ⚠️ {fileError}
                    </div>
                  )}

                  {fileSuccessMessage && (
                    <div className="p-3 bg-[#111111] text-[#FFE600] text-xs font-mono font-bold">
                      ✓ {fileSuccessMessage}
                    </div>
                  )}

                  {pendingFiles.length > 1 && (
                    <div className="border-2 border-[#111111] bg-[#F7F5F0] p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-mono font-bold">
                          Batch Queue ({pendingFiles.length} files ready)
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAddSource(true)}
                          className="brutalist-btn bg-[#FFE600] text-[#111111] px-3 py-1 text-xs font-mono font-bold cursor-pointer"
                        >
                          Ingest All {pendingFiles.length} as Separate Sources
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* METHOD 3: AI TOPIC DOSSIER GENERATOR */}
              {sourceMethod === "ai" && (
                <div className="bg-[#FFFFFF] border-2 border-[#111111] p-4 space-y-3">
                  <label className="text-xs font-mono font-bold uppercase text-[#111111] block">
                    Generate Comprehensive Topic Reference Dossier
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g., Zero-trust network architecture for municipal power grids"
                      value={directPromptText}
                      onChange={(e) => setDirectPromptText(e.target.value)}
                      className="flex-1 bg-[#F7F5F0] border-2 border-[#111111] p-2.5 text-xs font-mono focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleDraftPrompt}
                      disabled={isDraftingPrompt || !directPromptText.trim()}
                      className="brutalist-btn bg-[#FFE600] text-[#111111] px-4 py-2.5 text-xs font-mono font-bold shrink-0 cursor-pointer"
                    >
                      {isDraftingPrompt ? "Drafting..." : "Generate Dossier"}
                    </button>
                  </div>
                  {promptDraftError && (
                    <span className="text-xs font-mono text-[#FF2A2A] block">
                      ⚠️ {promptDraftError}
                    </span>
                  )}
                </div>
              )}

              {/* UNIFIED CONTENT REVIEW & MANUAL EDITOR */}
              <div className="bg-[#FFFFFF] border-2 border-[#111111] p-4 space-y-3">
                <h4 className="text-xs font-mono font-bold uppercase text-[#111111] border-b border-[#111111]/20 pb-1.5">
                  Source Title & Extracted Transcript / Content Review
                </h4>
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-mono font-bold text-[#4A4742] block mb-1">
                      SOURCE TITLE / REFERENCE NAME
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., YouTube Keynote Exact Transcript / Threat Advisory"
                      value={newSourceTitle}
                      onChange={(e) => setNewSourceTitle(e.target.value)}
                      className="w-full bg-[#F7F5F0] border-2 border-[#111111] p-2 text-xs font-bold focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-mono font-bold text-[#4A4742] block mb-1">
                      EXTRACTED TRANSCRIPT & CONTENT (EDITABLE BEFORE SAVING)
                    </label>
                    <textarea
                      placeholder="Exact timestamped transcript, metadata, AI summary, or pasted text appears here..."
                      value={newSourceContent}
                      onChange={(e) => setNewSourceContent(e.target.value)}
                      rows={sourceMethod === "manual" ? 8 : 5}
                      className="w-full bg-[#F7F5F0] border-2 border-[#111111] p-2.5 text-xs font-mono focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-[#EAE6DF] border-t-2 border-[#111111] flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowAddSourceModal(false);
                  setUrlFetchError("");
                  setFileError("");
                  setFileSuccessMessage("");
                }}
                className="brutalist-btn bg-[#FFFFFF] text-[#111111] px-4 py-2 text-xs font-mono font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleAddSource(false)}
                disabled={!newSourceContent.trim() && !newSourceUrl.trim()}
                className="brutalist-btn bg-[#111111] text-[#FFE600] px-5 py-2 text-xs font-mono font-bold cursor-pointer"
              >
                Save Source to Notebook
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CREATE NEW NOTEBOOK */}
      {showNewProjectModal && (
        <div className="fixed inset-0 bg-[#111111]/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#FFFFFF] border-3 border-[#111111] shadow-[8px_8px_0px_#111111] max-w-sm w-full overflow-hidden">
            <form onSubmit={handleCreateProject}>
              <div className="px-5 py-3.5 bg-[#111111] text-[#FFE600] flex items-center justify-between">
                <h3 className="text-xs font-mono font-bold uppercase">Create Prizm AI Notebook</h3>
                <button
                  type="button"
                  onClick={() => setShowNewProjectModal(false)}
                  className="text-white hover:text-[#FFE600] font-mono font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <div className="p-5 space-y-3 bg-[#F7F5F0]">
                <label className="text-xs font-mono font-bold text-[#111111] block">
                  Notebook Title
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Q4 Cloud Infrastructure Audit"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full bg-[#FFFFFF] border-2 border-[#111111] p-2.5 text-xs font-bold focus:outline-none"
                />
              </div>
              <div className="px-5 py-3.5 bg-[#EAE6DF] border-t-2 border-[#111111] flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowNewProjectModal(false)}
                  className="brutalist-btn bg-[#FFFFFF] text-[#111111] px-3.5 py-1.5 text-xs font-mono font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="brutalist-btn bg-[#FFE600] text-[#111111] px-4 py-1.5 text-xs font-mono font-bold cursor-pointer"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: CONNECTION & STATIC DEPLOYMENT SETTINGS */}
      {showSettingsModal && (
        <div className="fixed inset-0 bg-[#111111]/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-[#FFFFFF] border-3 border-[#111111] shadow-[8px_8px_0px_#111111] max-w-md w-full overflow-hidden">
            <div className="px-6 py-4 bg-[#111111] text-[#FFE600] flex items-center justify-between">
              <span className="text-xs font-mono font-bold uppercase">
                Prizm AI Engine Status & Static Host Override
              </span>
              <button
                type="button"
                onClick={() => setShowSettingsModal(false)}
                className="text-white hover:text-[#FFE600] font-mono font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4 bg-[#F7F5F0]">
              <div className="bg-[#FFFFFF] border-2 border-[#111111] p-3.5 space-y-1.5 text-xs font-mono">
                <div className="flex justify-between">
                  <span>Server Gemini Engine:</span>
                  <span className="font-bold">
                    {isServerKeyAvailable ? "ACTIVE (gemini-3.8-flash)" : "STATIC HOST MODE"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Custom Override Key:</span>
                  <span className="font-bold">
                    {customGeminiKey.trim() ? "CONNECTED" : "DEFAULT"}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-mono font-bold text-[#111111] block">
                  Optional Custom Key Override (For External Static Hosting)
                </label>
                <input
                  type="password"
                  id="input-custom-api-key"
                  placeholder="Optional override key..."
                  value={customGeminiKey}
                  onChange={(e) => setCustomGeminiKey(e.target.value.trim())}
                  className="w-full bg-[#FFFFFF] border-2 border-[#111111] p-2.5 text-xs font-mono focus:outline-none"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-[#EAE6DF] border-t-2 border-[#111111] flex justify-between">
              <button
                type="button"
                onClick={() => {
                  localStorage.removeItem("user_gemini_api_key");
                  setCustomGeminiKey("");
                  addToast("Cleared custom override key. Using default server key.", "warning");
                }}
                className="brutalist-btn bg-[#FFFFFF] text-[#111111] px-3 py-1.5 text-xs font-mono font-bold cursor-pointer"
              >
                Reset
              </button>
              <button
                type="button"
                onClick={() => {
                  localStorage.setItem("user_gemini_api_key", customGeminiKey.trim());
                  addToast("Saved connection settings", "success");
                  setShowSettingsModal(false);
                }}
                className="brutalist-btn bg-[#FFE600] text-[#111111] px-4 py-1.5 text-xs font-mono font-bold cursor-pointer"
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
