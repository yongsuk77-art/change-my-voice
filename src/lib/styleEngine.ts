import type { Destination, QualityIssue, QualityReport, StyleOptions, StyleProfile } from "../types";

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
  const blocks = splitDocumentBlocks(source);

  if (!blocks.length) return "";

  let proseIndex = 0;
  const rewritten = blocks.map((paragraph) => {
    if (isStructuralBlock(paragraph)) return paragraph;

    const sentences = splitSentences(paragraph);
    const shaped = sentences.map((sentence, sentenceIndex) =>
      shapeSentence(sentence, profile, options, hasProfile, proseIndex, sentenceIndex)
    );
    const tuned = tuneParagraph(shaped.join(" "), profile, options, intensity, proseIndex);
    proseIndex += 1;
    return tuned;
  });

  const opened = addOpening(rewritten, profile, options, hasProfile);
  const closed = addClosing(opened, profile, options, hasProfile);
  return finalizeTextQuality(source, closed.join("\n\n"), options).text;
}

export function finalizeTextQuality(original: string, draft: string, options: StyleOptions): { text: string; report: QualityReport } {
  const issues: QualityIssue[] = [];
  let text = draft.replace(/\r/g, "").trim();

  const beforeStructureFix = text;
  text = protectDocumentStructure(text);
  if (text !== beforeStructureFix) {
    issues.push({
      id: "structure-auto-fixed",
      label: "문서 구조 보정",
      detail: "제목이나 번호 앞에 붙은 연결어를 제거했습니다.",
      severity: "warn"
    });
  }

  const headingRestore = restoreHeadingLines(original, text);
  text = headingRestore.text;
  if (headingRestore.changed) {
    issues.push({
      id: "heading-restored",
      label: "원문 제목 복구",
      detail: "결과의 제목 라인을 원문 제목과 같은 문구로 되돌렸습니다.",
      severity: "warn"
    });
  }

  const beforeSentenceFix = text;
  text = polishSentences(text);
  if (text !== beforeSentenceFix) {
    issues.push({
      id: "sentence-polished",
      label: "문장 다듬기",
      detail: "중복 표현, 어색한 조사, 불필요한 공백을 정리했습니다.",
      severity: "warn"
    });
  }

  const originalHeadings = extractHeadings(original);
  const resultHeadings = extractHeadings(text);
  if (originalHeadings.length && resultHeadings.length < originalHeadings.length) {
    issues.push({
      id: "heading-missing",
      label: "제목 누락 가능성",
      detail: `원문 제목 ${originalHeadings.length}개 중 결과에서 ${resultHeadings.length}개만 확인됩니다.`,
      severity: "danger"
    });
  } else if (originalHeadings.length) {
    issues.push({
      id: "heading-preserved",
      label: "제목 구조 유지",
      detail: `원문 제목 ${originalHeadings.length}개를 결과에서도 확인했습니다.`,
      severity: "ok"
    });
  }

  const connectorBeforeStructure = text.match(/(^|\n)\s*(그러나|그러므로|다시 말해|분명히|조용히 마음을 비추어 보면),?\s*(#{1,6}\s|\d+\.\s)/g);
  if (connectorBeforeStructure?.length) {
    issues.push({
      id: "connector-before-heading",
      label: "연결어 위치 의심",
      detail: "제목이나 번호 앞에 문장 연결어가 남아 있습니다.",
      severity: "danger"
    });
  }

  const originalKeywords = extractKeywords(original);
  const missingKeywords = originalKeywords.filter((keyword) => !text.includes(keyword)).slice(0, 8);
  if (missingKeywords.length >= 4) {
    issues.push({
      id: "keyword-loss",
      label: "핵심어 누락 가능성",
      detail: `원문 핵심어 일부가 결과에서 약해졌습니다: ${missingKeywords.join(", ")}`,
      severity: "danger"
    });
  } else if (originalKeywords.length) {
    issues.push({
      id: "keyword-kept",
      label: "핵심어 유지",
      detail: "원문의 주요 용어가 대체로 유지되었습니다.",
      severity: "ok"
    });
  }

  const protectedTerms = extractProtectedTerms(original);
  const missingTerms = protectedTerms.filter((term) => !text.includes(term)).slice(0, 8);
  if (options.strictMeaning && missingTerms.length) {
    issues.push({
      id: "protected-term-loss",
      label: "고유명사/숫자 누락",
      detail: `원문에서 보존해야 할 표현이 빠졌을 수 있습니다: ${missingTerms.join(", ")}`,
      severity: "danger"
    });
  }

  const originalLength = original.replace(/\s/g, "").length;
  const resultLength = text.replace(/\s/g, "").length;
  if (options.strictMeaning && originalLength > 300) {
    const ratio = resultLength / originalLength;
    if (ratio < 0.62 || ratio > 1.7) {
      issues.push({
        id: "meaning-length-gap",
        label: "내용 분량 차이",
        detail: "결과 분량이 원문과 크게 달라 핵심 내용 전달 여부를 확인해야 합니다.",
        severity: ratio < 0.45 || ratio > 2.1 ? "danger" : "warn"
      });
    }
  }

  const suspicious = findSuspiciousExpressions(text);
  for (const item of suspicious.slice(0, 4)) {
    issues.push({
      id: `suspicious-${item}`,
      label: "표현 점검 필요",
      detail: item,
      severity: "warn"
    });
  }

  if (!issues.some((issue) => issue.severity !== "ok")) {
    issues.unshift({
      id: "quality-ok",
      label: "최종 점검 통과",
      detail: "문장 구조와 원문 보존에 큰 문제가 보이지 않습니다.",
      severity: "ok"
    });
  }

  const penalty = issues.reduce((sum, issue) => sum + (issue.severity === "danger" ? 22 : issue.severity === "warn" ? 8 : 0), 0);
  return {
    text,
    report: {
      score: clamp(100 - penalty, 30, 100),
      issues,
      checkedAt: new Date().toISOString()
    }
  };
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

  const shouldAddBridge =
    hasProfile &&
    options.intensity >= 88 &&
    sentenceIndex === 0 &&
    paragraphIndex > 0 &&
    paragraphIndex % 2 === 1 &&
    !isSequenceLead(shaped);
  if (shouldAddBridge) {
    const bridge = pick(profile.topConnectors.filter(isBridgeConnector), paragraphIndex) || (paragraphIndex % 2 ? "그러므로" : "여기서");
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
  const targetIndex = paragraphs.findIndex((paragraph) => !isStructuralBlock(paragraph));
  if (targetIndex < 0) return paragraphs;
  if (/^사랑하는|^여러분/.test(paragraphs[targetIndex])) return paragraphs;

  const opener = profile.topConnectors.includes("사랑하는 성도 여러분")
    ? "사랑하는 성도 여러분, "
    : "여러분, ";
  return paragraphs.map((paragraph, index) => (index === targetIndex ? opener + lowerFirstParticle(paragraph) : paragraph));
}

function addClosing(paragraphs: string[], profile: StyleProfile, options: StyleOptions, hasProfile: boolean) {
  if (!paragraphs.length) return paragraphs;
  if (!hasProfile || options.intensity < 82) return paragraphs;
  if (options.destination !== "sermon" && options.destination !== "devotional") return paragraphs;
  const targetIndex = [...paragraphs].map((paragraph, index) => ({ paragraph, index })).reverse().find((item) => !isStructuralBlock(item.paragraph))?.index ?? -1;
  if (targetIndex < 0) return paragraphs;
  const last = paragraphs[targetIndex];
  if (/기도합니다|소망합니다|축복합니다|바랍니다/.test(last)) return paragraphs;
  const ending = pick(profile.topEndings, 0);
  const closing =
    ending && /합니다|습니다|바랍니다/.test(ending)
      ? "이 은혜를 오늘 우리의 삶 속에 조용히 붙들 수 있기를 바랍니다."
      : "이 말씀이 오늘 우리의 마음과 걸음을 다시 세워 주기를 소망합니다.";
  return paragraphs.map((paragraph, index) => (index === targetIndex ? `${last} ${closing}` : paragraph));
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

function splitDocumentBlocks(text: string) {
  const lines = normalizeWhitespace(text).split("\n");
  const blocks: string[] = [];
  let proseLines: string[] = [];
  let structuralLines: string[] = [];
  let inFence = false;

  const flushProse = () => {
    if (!proseLines.length) return;
    blocks.push(proseLines.join(" ").trim());
    proseLines = [];
  };

  const flushStructure = () => {
    if (!structuralLines.length) return;
    blocks.push(structuralLines.join("\n").trim());
    structuralLines = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      flushProse();
      flushStructure();
      continue;
    }

    if (/^```/.test(line)) {
      flushProse();
      structuralLines.push(line);
      inFence = !inFence;
      if (!inFence) flushStructure();
      continue;
    }

    if (inFence || isStructuralLine(line)) {
      flushProse();
      structuralLines.push(line);
      continue;
    }

    flushStructure();
    proseLines.push(line);
  }

  flushProse();
  flushStructure();
  return blocks.filter(Boolean);
}

function isStructuralBlock(text: string) {
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return false;
  return lines.every((line) => /^```/.test(line) || isStructuralLine(line));
}

function isStructuralLine(line: string) {
  return /^(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|---$|\|.*\|$)/.test(line.trim());
}

function protectDocumentStructure(text: string) {
  const connectorPattern = /^(조용히 마음을 비추어 보면|그러나|그러므로|다시 말해|분명히|여기서|결국|이것이|여러분|사랑하는 성도 여러분)\s*,?\s*/;
  return text
    .split("\n")
    .map((line) => {
      const trimmed = line.trimStart();
      const cleaned = trimmed.replace(connectorPattern, "");
      return isStructuralLine(cleaned) ? cleaned : line;
    })
    .join("\n");
}

function restoreHeadingLines(original: string, result: string) {
  const originalHeadings = extractHeadings(original);
  if (!originalHeadings.length) return { text: result, changed: false };

  let headingIndex = 0;
  let changed = false;
  const lines = result.split("\n").map((line) => {
    if (!isHeadingLine(line) || headingIndex >= originalHeadings.length) return line;
    const restored = originalHeadings[headingIndex];
    headingIndex += 1;
    if (line.trim() === restored) return line;
    changed = true;
    return restored;
  });

  return { text: lines.join("\n"), changed };
}

function polishSentences(text: string) {
  return text
    .replace(/[ \t]+([,.:;!?])/g, "$1")
    .replace(/([.!?]){2,}/g, "$1")
    .replace(/(^|\n)(믿음은|하나님은|주님은),\s+(?=[가-힣])/g, "$1")
    .replace(/(^|\n)(그러나|그러므로|다시 말해|분명히|여기서),\s+(?=(첫째|둘째|셋째|넷째|다섯째|마지막|먼저|다음으로))/g, "$1")
    .replace(/것인 것입니다/g, "것입니다")
    .replace(/것인 것/g, "것")
    .replace(/중심 내용은 유지하되/g, "핵심 내용은 유지하되")
    .replace(/우리가 붙들 중심은/g, "우리가 붙들어야 할 중심은")
    .replace(/([가-힣])\s+입니다/g, "$1입니다")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractHeadings(text: string) {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(isHeadingLine);
}

function isHeadingLine(line: string) {
  const trimmed = line.trim();
  return /^(#{1,6}\s+|\d+\.\s+)/.test(trimmed) && trimmed.length <= 120;
}

function extractKeywords(text: string) {
  const tokens = text.match(/[가-힣A-Za-z][가-힣A-Za-z0-9'()·:-]{2,}/g) ?? [];
  const stopWords = new Set(["그리고", "그러나", "그러므로", "입니다", "합니다", "있습니다", "것입니다", "우리", "오늘", "대한", "통해", "있는", "없는", "때문입니다"]);
  return topItems(
    tokens.filter((token) => !stopWords.has(token) && token.length <= 24),
    18
  );
}

function extractProtectedTerms(text: string) {
  const terms = [
    ...(text.match(/[가-힣]{1,12}\s?\d{1,3}:\d{1,3}(?:-\d{1,3})?/g) ?? []),
    ...(text.match(/\b[A-Z][A-Za-z'’.-]{2,}\b/g) ?? []),
    ...(text.match(/\([^)]{2,30}\)/g) ?? []),
    ...(text.match(/\b\d+(?:[,.]\d+)*(?:%|편|장|절|명|개|년|월|일)\b/g) ?? [])
  ];
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))].slice(0, 24);
}

function isBridgeConnector(value: string) {
  return /^(그러나|그러므로|다시 말해|결국|분명히|여기서)$/.test(value);
}

function isSequenceLead(value: string) {
  return /^(첫째|둘째|셋째|넷째|다섯째|마지막|먼저|다음으로)(는|,|\s|$)/.test(value.trim());
}

function findSuspiciousExpressions(text: string) {
  const checks: Array<[RegExp, string]> = [
    [/,\s*#{1,6}\s/g, "제목 앞에 쉼표나 연결어가 붙은 흔적이 있습니다."],
    [/#{1,6}\s.+[.?!]$/m, "제목 줄이 문장처럼 끝나는 부분이 있습니다."],
    [/그러나,\s*그러나|그러므로,\s*그러므로/g, "같은 연결어가 반복됩니다."],
    [/입니다\.\s*입니다|합니다\.\s*합니다/g, "종결 표현이 반복됩니다."],
    [/(믿음은|하나님은|주님은),\s+[가-힣]/g, "주어처럼 쓰인 말을 접속어처럼 붙인 부분이 있습니다."],
    [/[가-힣][ \t]{2,}[가-힣]/g, "문장 중간에 불필요한 공백이 있습니다."],
    [/([가-힣]{2,})[ \t]+\1/g, "같은 단어가 연속으로 반복됩니다."]
  ];
  return checks.filter(([pattern]) => pattern.test(text)).map(([, message]) => message);
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
