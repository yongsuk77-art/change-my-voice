import type { Destination, StyleOptions, StyleProfile } from "../types";

const CONNECTORS = [
  "사랑하는 성도 여러분",
  "여러분",
  "오늘 우리는",
  "우리가 기억해야 할 것은",
  "여기서",
  "그러나",
  "그러므로",
  "다시 말해",
  "결국",
  "분명히",
  "이것이",
  "주님은",
  "하나님은",
  "믿음은"
];

const AI_LIKE_PAIRS: Array<[RegExp, string]> = [
  [/이 글의 핵심은/g, "이 글의 중심 내용은"],
  [/글의 핵심은/g, "글의 중심 내용은"],
  [/핵심은/g, "우리가 붙들 중심은"],
  [/중요합니다/g, "마음에 새겨야 합니다"],
  [/매우/g, "참"],
  [/또한/g, "그리고"],
  [/결론적으로/g, "그러므로"],
  [/시사합니다/g, "보여 줍니다"],
  [/요약하면/g, "다시 말해"],
  [/필요합니다/g, "필요합니다. 이것을 그냥 지나칠 수 없습니다"],
  [/제공합니다/g, "전해 줍니다"],
  [/가능하게 합니다/g, "가능하게 해 줍니다"],
  [/중요한 역할을 합니다/g, "중요한 자리에 서 있습니다"]
];

const DESTINATION_LABELS: Record<Destination, string> = {
  sermon: "설교문",
  column: "칼럼",
  devotional: "묵상문",
  letter: "목회서신",
  social: "SNS"
};

export function analyzeStyle(text: string): StyleProfile {
  const normalized = normalizeWhitespace(text);
  const paragraphs = normalized.split(/\n{2,}/).filter(Boolean);
  const sentences = splitSentences(normalized);
  const sentenceCount = sentences.length;
  const paragraphCount = Math.max(1, paragraphs.length);
  const totalChars = sentences.reduce((sum, sentence) => sum + sentence.length, 0);
  const averageSentenceLength = sentenceCount ? Math.round(totalChars / sentenceCount) : 0;
  const averageParagraphSentences = Math.round((sentenceCount / paragraphCount) * 10) / 10;
  const scriptureCount = (normalized.match(/[가-힣A-Za-z]{1,12}\s?\d{1,3}:\d{1,3}(?:-\d{1,3})?/g) ?? []).length;
  const questionRate = sentenceCount
    ? Math.round((sentences.filter((sentence) => /[?？]|습니까|까요|겠습니까/.test(sentence)).length / sentenceCount) * 100)
    : 0;
  const exhortationRate = sentenceCount
    ? Math.round((sentences.filter((sentence) => /합시다|하십시오|바랍니다|해야 합니다|기억해야/.test(sentence)).length / sentenceCount) * 100)
    : 0;
  const topEndings = topItems(
    sentences
      .map((sentence) => sentence.replace(/[.!?。！？\s]+$/g, "").match(/[가-힣]{2,12}$/)?.[0] ?? "")
      .filter(Boolean),
    5
  );
  const topConnectors = topItems(CONNECTORS.filter((word) => normalized.includes(word)), 6);
  const signaturePhrases = extractSignaturePhrases(normalized);
  const warmthScore = scoreWarmth(normalized, sentenceCount);
  const rhythmLabel = averageSentenceLength > 92 ? "긴 호흡" : averageSentenceLength > 58 ? "중간 호흡" : "짧은 호흡";

  return {
    sentenceCount,
    paragraphCount,
    averageSentenceLength,
    averageParagraphSentences,
    scriptureCount,
    questionRate,
    exhortationRate,
    topEndings,
    topConnectors,
    signaturePhrases,
    warmthScore,
    rhythmLabel
  };
}

export function rewriteLocally(source: string, sample: string, options: StyleOptions): string {
  const profile = analyzeStyle(sample);
  const hasProfile = sample.trim().length > 80;
  const intensity = options.intensity / 100;
  const paragraphs = normalizeWhitespace(source)
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (!paragraphs.length) return "";

  const rewritten = paragraphs.map((paragraph, index) => {
    const sentences = splitSentences(paragraph);
    const shaped = sentences.map((sentence, sentenceIndex) =>
      shapeSentence(sentence, profile, options, hasProfile, index, sentenceIndex)
    );
    return tuneParagraph(shaped.join(" "), profile, options, intensity, index);
  });

  const opened = addOpening(rewritten, profile, options, hasProfile);
  const closed = addClosing(opened, profile, options, hasProfile);
  return closed.join("\n\n");
}

export function scoreMatch(text: string, profile: StyleProfile): number {
  const rewritten = analyzeStyle(text);
  const lengthGap = Math.min(45, Math.abs(rewritten.averageSentenceLength - profile.averageSentenceLength));
  const questionGap = Math.min(25, Math.abs(rewritten.questionRate - profile.questionRate));
  const exhortGap = Math.min(25, Math.abs(rewritten.exhortationRate - profile.exhortationRate));
  const phraseBonus = profile.topConnectors.filter((phrase) => text.includes(phrase)).length * 4;
  const raw = 92 - lengthGap * 0.6 - questionGap * 0.35 - exhortGap * 0.35 + phraseBonus;
  return clamp(Math.round(raw), 35, 98);
}

export function destinationLabel(destination: Destination) {
  return DESTINATION_LABELS[destination];
}

function shapeSentence(
  sentence: string,
  profile: StyleProfile,
  options: StyleOptions,
  hasProfile: boolean,
  paragraphIndex: number,
  sentenceIndex: number
) {
  let shaped = sentence.trim();
  if (!shaped) return shaped;

  if (options.humanize) {
    const limit = options.intensity >= 90 ? AI_LIKE_PAIRS.length : options.intensity >= 70 ? 8 : 5;
    for (const [pattern, replacement] of AI_LIKE_PAIRS.slice(0, limit)) {
      shaped = shaped.replace(pattern, replacement);
    }
  }

  if (options.keepScripture) {
    shaped = shaped.replace(/\s+([,.:;!?])/g, "$1");
  }

  if (options.destination === "sermon" || options.destination === "devotional") {
    shaped = sermonizeEnding(shaped, profile, options.intensity);
  }

  if (options.destination === "social") {
    shaped = shaped.replace(/습니다\./g, "습니다.").replace(/것입니다\./g, "겁니다.");
  }

  const shouldAddBridge = hasProfile && options.intensity >= 78 && sentenceIndex === 0 && paragraphIndex > 0;
  if (shouldAddBridge) {
    const bridge = pick(profile.topConnectors, paragraphIndex) || (paragraphIndex % 2 ? "그러므로" : "여기서");
    if (!shaped.startsWith(bridge)) {
      shaped = `${bridge}, ${lowerFirstParticle(shaped)}`;
    }
  }

  if (options.rhythm > 70 && shaped.length > 110) {
    shaped = shaped.replace(/,?\s+(그러나|그러므로|그리고|하지만|또한)\s+/g, ". $1 ");
  }

  if (options.rhythm < 45 && shaped.length < 45 && sentenceIndex > 0) {
    shaped = shaped.replace(/[.!?]$/g, ",");
  }

  return shaped;
}

function tuneParagraph(
  paragraph: string,
  profile: StyleProfile,
  options: StyleOptions,
  intensity: number,
  index: number
) {
  let tuned = paragraph.replace(/\s+/g, " ").trim();
  if (!tuned) return tuned;

  if (options.destination === "sermon" && intensity > 0.82 && index % 2 === 1 && !/[?？]$/.test(tuned)) {
    const question = profile.questionRate > 10 ? " 우리는 이 말씀 앞에서 무엇을 붙들어야 하겠습니까?" : "";
    tuned += question;
  }

  if (options.destination === "devotional" && intensity > 0.72 && index === 0) {
    tuned = tuned.replace(/^/, "조용히 마음을 비추어 보면, ");
  }

  if (options.destination === "letter" && index === 0 && intensity > 0.72) {
    tuned = tuned.replace(/^/, "사랑하는 여러분께, ");
  }

  if (options.destination === "column" && intensity > 0.9 && index === 0) {
    tuned = tuned.replace(/^(오늘 우리는|사랑하는 성도 여러분,\s*)/, "");
  }

  return tuned;
}

function addOpening(paragraphs: string[], profile: StyleProfile, options: StyleOptions, hasProfile: boolean) {
  if (!paragraphs.length) return paragraphs;
  if (options.intensity < 88 || !hasProfile) return paragraphs;
  if (options.destination !== "sermon") return paragraphs;
  if (/^사랑하는|^여러분/.test(paragraphs[0])) return paragraphs;

  const opener = profile.topConnectors.includes("사랑하는 성도 여러분")
    ? "사랑하는 성도 여러분, "
    : "여러분, ";
  return [opener + lowerFirstParticle(paragraphs[0]), ...paragraphs.slice(1)];
}

function addClosing(paragraphs: string[], profile: StyleProfile, options: StyleOptions, hasProfile: boolean) {
  if (!paragraphs.length) return paragraphs;
  if (!hasProfile || options.intensity < 82) return paragraphs;
  if (options.destination !== "sermon" && options.destination !== "devotional") return paragraphs;
  const last = paragraphs[paragraphs.length - 1];
  if (/기도합니다|소망합니다|축복합니다|바랍니다/.test(last)) return paragraphs;
  const ending = pick(profile.topEndings, 0);
  const closing =
    ending && /합니다|습니다|바랍니다/.test(ending)
      ? "이 은혜를 오늘 우리의 삶 속에 조용히 붙들 수 있기를 바랍니다."
      : "이 말씀이 오늘 우리의 마음과 걸음을 다시 세워 주기를 소망합니다.";
  return [...paragraphs.slice(0, -1), `${last} ${closing}`];
}

function sermonizeEnding(sentence: string, profile: StyleProfile, intensity: number) {
  let shaped = sentence;
  if (intensity >= 65) {
    shaped = shaped
      .replace(/해야 한다\./g, "해야 합니다.")
      .replace(/필요가 있다\./g, "필요가 있습니다.")
      .replace(/볼 수 있다\./g, "볼 수 있습니다.")
      .replace(/이다\./g, "입니다.")
      .replace(/된다\./g, "됩니다.")
      .replace(/한다\./g, "합니다.");
  }

  if (intensity >= 90 && profile.topEndings.some((ending) => ending.includes("것입니다"))) {
    shaped = shaped.replace(/입니다\./g, "인 것입니다.");
  }

  return shaped;
}

function splitSentences(text: string) {
  return text
    .replace(/\r/g, "")
    .split(/(?<=[.!?。！？]|다\.|요\.|니다\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function normalizeWhitespace(text: string) {
  return text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractSignaturePhrases(text: string) {
  const candidates = text.match(/[가-힣]{2,}(?:\s+[가-힣]{2,}){1,4}/g) ?? [];
  return topItems(
    candidates.filter((phrase) => {
      const compact = phrase.replace(/\s/g, "");
      return compact.length >= 6 && compact.length <= 22 && !/것입니다|있습니다|했습니다/.test(phrase);
    }),
    6
  );
}

function scoreWarmth(text: string, sentenceCount: number) {
  if (!sentenceCount) return 0;
  const warmWords = (text.match(/사랑|은혜|마음|함께|우리|주님|하나님|기도|소망|위로/g) ?? []).length;
  return clamp(Math.round((warmWords / sentenceCount) * 22), 8, 100);
}

function topItems(items: string[], limit: number) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = item.trim();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko"))
    .slice(0, limit)
    .map(([item]) => item);
}

function pick(values: string[], index: number) {
  if (!values.length) return "";
  return values[index % values.length];
}

function lowerFirstParticle(value: string) {
  return value.replace(/^(그리고|또한|하지만|그러나|그러므로),?\s*/, "");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
