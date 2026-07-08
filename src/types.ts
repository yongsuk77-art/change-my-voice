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
  baseLabel?: string;
};

export type StyleSourceKind = "manual" | "txt" | "md" | "pdf";

export type StyleSource = {
  id: string;
  name: string;
  kind: StyleSourceKind;
  text: string;
  charCount: number;
  size: number;
  addedAt: string;
  enabled: boolean;
};

export type StyleSnapshotReason = "manual" | "before-update" | "before-reset";

export type StyleSnapshot = {
  id: string;
  name: string;
  text: string;
  charCount: number;
  sourceCount: number;
  createdAt: string;
  reason: StyleSnapshotReason;
};
