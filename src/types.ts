export type Destination = "sermon" | "column" | "devotional" | "letter" | "social";

export type StyleOptions = {
  intensity: number;
  destination: Destination;
  rhythm: number;
  keepScripture: boolean;
  strictMeaning: boolean;
  humanize: boolean;
};

export type StyleProfile = {
  sentenceCount: number;
  paragraphCount: number;
  averageSentenceLength: number;
  averageParagraphSentences: number;
  scriptureCount: number;
  questionRate: number;
  exhortationRate: number;
  topEndings: string[];
  topConnectors: string[];
  signaturePhrases: string[];
  warmthScore: number;
  rhythmLabel: string;
};

export type RewriteResult = {
  text: string;
  provider: "openai" | "local";
  model?: string;
};
