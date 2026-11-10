export interface TranscriptSegment {
  timestamp: string;
  seconds?: number;
  text: string;
}

export interface SourceMetadata {
  platform?: string;
  author?: string;
  publishedAt?: string;
  duration?: string;
  thumbnailUrl?: string;
  originalUrl?: string;
  wordCount?: number;
  summary?: string;
  keyTakeaways?: string[];
  exactTranscript?: string;
  transcriptSegments?: TranscriptSegment[];
  fileType?: string;
}

export interface SourceDocument {
  id: string;
  title: string;
  content: string;
  type: "text" | "url" | "youtube" | "reel" | "document";
  url?: string;
  metadata?: SourceMetadata;
}

export interface GenerationParams {
  audience: string;
  tone: string;
  language: string;
  objective: string;
  detailLevel: string;
  domain: string;
}

export interface CanonicalKnowledge {
  title: string;
  mainObjective: string;
  keyFacts: string[];
  keyEvents: { event: string; date?: string; description: string }[];
  statistics: { metric: string; value: string; context?: string }[];
  importantEntities: { name: string; role: string; description: string }[];
  risks: { risk: string; impact: string; mitigation?: string }[];
  opportunities: { opportunity: string; benefit: string }[];
  recommendations: string[];
  timeline: { step: string; timeframe?: string; description: string }[];
  importantQuotes: { quote: string; attribution?: string }[];
}

export interface ExecutiveSummary {
  purpose: string;
  keyFindings: string[];
  criticalRisks: string[];
  recommendations: string[];
  conclusion: string;
}

export interface Advisory {
  title: string;
  background: string;
  situationOverview: string;
  impactAssessment: string;
  recommendations: string[];
  actionItems: string[];
}

export interface LinkedInPost {
  hook: string;
  insights: string[];
  takeaways: string[];
  cta: string;
}

export interface Tweet {
  index: number;
  content: string;
}

export interface TwitterThread {
  threadTitle: string;
  tweets: Tweet[];
}

export interface SlideChartDatum {
  label: string;
  value: number;
  displayValue: string;
}

export interface Slide {
  slideNumber: number;
  title: string;
  subtitle?: string;
  content: string[];
  visualType?: "bar-chart" | "metric-grid" | "process-flow" | "comparison-split" | "radial-gauge";
  chartData?: SlideChartDatum[];
  visualRecommendation: string;
  speakerNotes: string;
}

export interface Presentation {
  slides: Slide[];
}

export interface InfographicSection {
  title: string;
  content: string;
  visualType?: "bar" | "progress" | "cards" | "flow";
  metrics?: { label: string; value: string; percentage?: number }[];
}

export interface Infographic {
  headline: string;
  subheadline?: string;
  sections: InfographicSection[];
  keyMetrics: { label: string; value: string; percentage?: number; trend?: string }[];
  processSteps?: { step: string; detail: string }[];
  visualLayout: string;
  iconsRecommendation: string;
  colorSuggestions: string[];
}

export interface VideoScene {
  sceneNumber: number;
  storyboardDescription: string;
  narration: string;
  visualRecommendations: string;
  subtitles: string;
}

export interface VideoPackage {
  videoTitle: string;
  duration: string;
  fullScript: string;
  storyboard: VideoScene[];
}

export interface PodcastSegment {
  speaker: string;
  dialogue: string;
}

export interface AudioOverview {
  title: string;
  hosts: string[];
  script: PodcastSegment[];
}

export interface ArtifactPackage {
  executiveSummary: ExecutiveSummary;
  advisory: Advisory;
  linkedInPost: LinkedInPost;
  twitterThread: TwitterThread;
  presentation: Presentation;
  infographic: Infographic;
  videoPackage: VideoPackage;
  audioOverview: AudioOverview;
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  sources: SourceDocument[];
  canonical?: CanonicalKnowledge;
  artifacts?: ArtifactPackage;
  params: GenerationParams;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
}
