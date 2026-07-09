import {
  Archive,
  BookOpenText,
  Check,
  Clipboard,
  Database,
  Download,
  Eye,
  EyeOff,
  FileText,
  Gauge,
  History,
  ImagePlus,
  Loader2,
  Mic2,
  Plus,
  RefreshCcw,
  Save,
  Sparkles,
  Trash2,
  Upload,
  Wand2
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { analyzeStyle, destinationLabel, finalizeTextQuality, rewriteLocally, scoreMatch } from "./lib/styleEngine";
import { extractPdfText } from "./lib/pdfReader";
import type { Destination, QualityReport, RewriteResult, StyleOptions, StyleSnapshot, StyleSource, StyleSourceKind } from "./types";

const STORAGE_KEY = "change-my-voice-state-v2";
const OLD_STORAGE_KEY = "change-my-voice-state-v1";
const MAX_SNAPSHOTS = 20;
const BLOG_ASSET_ORIGIN = "https://change-my-voice.pages.dev";

const defaultSample = `사랑하는 성도 여러분, 오늘 우리는 주님 앞에서 다시 마음을 살펴보아야 합니다. 믿음은 멀리 있는 말이 아니라, 오늘 우리의 작은 순종 속에서 자라나는 생명입니다.

그러므로 낙심의 자리에서도 말씀을 붙드십시오. 하나님은 우리의 연약함을 외면하지 않으시고, 그 자리에서 다시 일으키시는 분이십니다.`;

const defaultSource = `AI로 작성한 글을 그대로 올리면 문장이 정돈되어 보이지만, 내 목소리가 사라진 것처럼 느껴질 때가 있습니다. 글의 핵심은 유지하되, 오래 써 온 어투와 표현을 살려서 더 자연스럽게 다듬는 과정이 필요합니다.`;

const destinationOptions: Array<{ value: Destination; label: string }> = [
  { value: "sermon", label: "설교문" },
  { value: "devotional", label: "묵상문" },
  { value: "letter", label: "서신" },
  { value: "column", label: "칼럼" },
  { value: "social", label: "SNS" },
  { value: "blog", label: "블로그" }
];

function App() {
  const [manualText, setManualText] = useState(defaultSample);
  const [sources, setSources] = useState<StyleSource[]>([]);
  const [snapshots, setSnapshots] = useState<StyleSnapshot[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState(defaultSource);
  const [result, setResult] = useState<RewriteResult | null>(null);
  const [blogScenes, setBlogScenes] = useState<BlogScene[]>([]);
  const [blogDraftKey, setBlogDraftKey] = useState("");
  const [options, setOptions] = useState<StyleOptions>({
    intensity: 80,
    destination: "sermon",
    rhythm: 62,
    keepScripture: true,
    strictMeaning: true,
    humanize: true,
    finalCheck: true
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<{ provider: "openai" | "local"; model: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(OLD_STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      setManualText(parsed.manualText || parsed.sampleText || defaultSample);
      setSources(Array.isArray(parsed.sources) ? parsed.sources : []);
      setSnapshots(Array.isArray(parsed.snapshots) ? parsed.snapshots : []);
      setSelectedSnapshotId(parsed.selectedSnapshotId || null);
      setSourceText(parsed.sourceText || defaultSource);
      setOptions((current) => ({ ...current, ...parsed.options }));
      setResult(parsed.result || null);
      setBlogScenes(Array.isArray(parsed.blogScenes) ? normalizeBlogScenes(parsed.blogScenes) : []);
      setBlogDraftKey(parsed.blogDraftKey || "");
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const currentBaseText = useMemo(() => {
    return [manualText, ...sources.filter((source) => source.enabled).map((source) => source.text)]
      .map((text) => text.trim())
      .filter(Boolean)
      .join("\n\n");
  }, [manualText, sources]);

  const selectedSnapshot = useMemo(
    () => snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null,
    [selectedSnapshotId, snapshots]
  );
  const baseText = selectedSnapshot?.text ?? currentBaseText;
  const baseLabel = selectedSnapshot ? selectedSnapshot.name : "현재 베이스";

  useEffect(() => {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          manualText,
          sources,
          snapshots,
          selectedSnapshotId,
          sourceText,
          options,
          result,
          blogScenes,
          blogDraftKey
        })
      );
    } catch {
      setError("브라우저 저장 공간이 부족합니다. 큰 PDF는 일부 소스를 삭제한 뒤 다시 추가해 주세요.");
    }
  }, [manualText, sources, snapshots, selectedSnapshotId, sourceText, options, result, blogScenes, blogDraftKey]);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((data) => setStatus({ provider: data.provider, model: data.model }))
      .catch(() => setStatus({ provider: "local", model: "브라우저 엔진" }));
  }, []);

  const profile = useMemo(() => analyzeStyle(baseText), [baseText]);
  const resultProfile = useMemo(() => analyzeStyle(result?.text ?? ""), [result]);
  const matchScore = useMemo(() => (result?.text ? scoreMatch(result.text, profile) : 0), [result, profile]);
  const isBlogResult = Boolean(result?.text && (result.destination ?? options.destination) === "blog");
  const sourceChars = sourceText.replace(/\s/g, "").length;
  const baseChars = baseText.replace(/\s/g, "").length;
  const currentChars = currentBaseText.replace(/\s/g, "").length;
  const enabledSourceCount = sources.filter((source) => source.enabled).length + (manualText.trim() ? 1 : 0);
  const volume = getVolumeStatus(baseChars);

  useEffect(() => {
    const destination = result?.destination ?? options.destination;
    const nextKey = result?.text && destination === "blog" ? createBlogDraftKey(result.text, destination) : "";

    if (!nextKey) {
      if (blogDraftKey || blogScenes.length) {
        setBlogScenes([]);
        setBlogDraftKey("");
      }
      return;
    }

    if (nextKey !== blogDraftKey) {
      setBlogScenes(buildBlogScenes(result?.text ?? ""));
      setBlogDraftKey(nextKey);
    }
  }, [blogDraftKey, blogScenes.length, options.destination, result?.destination, result?.text]);

  async function rewriteWithBase(styleBaseText: string, label: string) {
    setIsLoading(true);
    setError("");
    setCopied(false);

    try {
      if (status?.provider !== "openai") {
        const draft = rewriteLocally(sourceText, styleBaseText, options);
        const checked = applyFinalCheck(sourceText, draft);
        setResult({
          text: checked.text,
          provider: "local",
          baseLabel: label,
          destination: options.destination,
          quality: checked.report
        });
        return;
      }

      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sampleText: styleBaseText,
          sourceText,
          styleProfile: analyzeStyle(styleBaseText),
          options
        })
      });

      if (response.ok) {
        const data = await response.json();
        const checked = applyFinalCheck(sourceText, data.text);
        setResult({
          text: checked.text,
          provider: data.provider,
          model: data.model,
          baseLabel: label,
          destination: options.destination,
          quality: checked.report
        });
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (response.status !== 503) {
        setError(data.error || "서버 변환에 실패해 로컬 변환으로 처리했습니다.");
      }
      const fallbackDraft = rewriteLocally(sourceText, styleBaseText, options);
      const checked = applyFinalCheck(sourceText, fallbackDraft);
      setResult({
        text: checked.text,
        provider: "local",
        baseLabel: label,
        destination: options.destination,
        quality: checked.report
      });
    } catch {
      const fallbackDraft = rewriteLocally(sourceText, styleBaseText, options);
      const checked = applyFinalCheck(sourceText, fallbackDraft);
      setResult({
        text: checked.text,
        provider: "local",
        baseLabel: label,
        destination: options.destination,
        quality: checked.report
      });
    } finally {
      setIsLoading(false);
    }
  }

  function handleRewrite() {
    void rewriteWithBase(baseText, baseLabel);
  }

  function handleLocalRewrite() {
    setError("");
    setCopied(false);
    const draft = rewriteLocally(sourceText, baseText, options);
    const checked = applyFinalCheck(sourceText, draft);
    setResult({
      text: checked.text,
      provider: "local",
      baseLabel,
      destination: options.destination,
      quality: checked.report
    });
  }

  function applyFinalCheck(original: string, draft: string): { text: string; report?: QualityReport } {
    if (!options.finalCheck) return { text: draft };
    return finalizeTextQuality(original, draft, options);
  }

  function handleResultEdit(text: string) {
    const checked = options.finalCheck ? finalizeTextQuality(sourceText, text, options) : undefined;
    setResult((current) =>
      current
        ? {
            ...current,
            text,
            quality: checked?.report
          }
        : current
    );
  }

  function handlePreviousRewrite() {
    const snapshot = snapshots[0];
    if (!snapshot) {
      setError("아직 저장된 이전 베이스가 없습니다.");
      return;
    }
    void rewriteWithBase(snapshot.text, snapshot.name);
  }

  async function handleCopy() {
    if (!result?.text) return;
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function handleDownload() {
    if (!result?.text) return;
    const blob = new Blob([result.text], { type: "text/plain;charset=utf-8" });
    downloadBlob(blob, `WordTone-${todayStamp()}.txt`);
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;

    setIsParsing(true);
    setError("");
    setCopied(false);

    const beforeText = currentBaseText;
    try {
      const addedSources: StyleSource[] = [];
      for (const file of files) {
        const kind = getSourceKind(file);
        const rawText = kind === "pdf" ? await extractPdfText(file) : await file.text();
        const text = normalizeImportedText(rawText);

        if (text.replace(/\s/g, "").length < 40) {
          setError(`${file.name}에서 충분한 텍스트를 찾지 못했습니다.`);
          continue;
        }

        addedSources.push({
          id: createId(),
          name: file.name,
          kind,
          text,
          charCount: text.replace(/\s/g, "").length,
          size: file.size,
          addedAt: new Date().toISOString(),
          enabled: true
        });
      }

      if (!addedSources.length) return;
      if (beforeText.trim()) addSnapshotFromText(beforeText, "before-update", "업데이트 전 베이스");
      setSources((current) => [...current, ...addedSources]);
      setSelectedSnapshotId(null);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "파일을 읽는 중 문제가 생겼습니다.");
    } finally {
      setIsParsing(false);
      event.target.value = "";
    }
  }

  function handleSaveSnapshot() {
    if (!currentBaseText.trim()) return;
    addSnapshotFromText(currentBaseText, "manual", "수동 저장 베이스");
    setSelectedSnapshotId(null);
  }

  function handleResetBase() {
    if (currentBaseText.trim()) addSnapshotFromText(currentBaseText, "before-reset", "초기화 전 베이스");
    setManualText("");
    setSources([]);
    setSelectedSnapshotId(null);
  }

  function handleDeleteSource(id: string) {
    if (currentBaseText.trim()) addSnapshotFromText(currentBaseText, "before-update", "삭제 전 베이스");
    setSources((current) => current.filter((source) => source.id !== id));
    setSelectedSnapshotId(null);
  }

  function addSnapshotFromText(text: string, reason: StyleSnapshot["reason"], label: string) {
    const trimmed = text.trim();
    if (!trimmed) return;

    setSnapshots((current) => {
      if (current[0]?.text === trimmed) return current;
      const snapshot: StyleSnapshot = {
        id: createId(),
        name: `${label} ${formatDateTime(new Date().toISOString())}`,
        text: trimmed,
        charCount: trimmed.replace(/\s/g, "").length,
        sourceCount: enabledSourceCount,
        createdAt: new Date().toISOString(),
        reason
      };
      return [snapshot, ...current].slice(0, MAX_SNAPSHOTS);
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark" aria-hidden="true">
            <Mic2 size={24} />
          </div>
          <div>
            <h1>WordTone</h1>
            <p>흩어진 AI 문장을 오래 써 온 설교자의 목소리로 정리합니다.</p>
          </div>
        </div>
        <div className="status-pill" data-provider={status?.provider ?? "local"}>
          <span className="status-dot" />
          {status?.provider === "openai" ? `${status.model} 연결` : "로컬 모드"}
        </div>
      </header>

      <section className="workspace">
        <article className="panel panel-samples">
          <PanelTitle icon={<BookOpenText size={20} />} title="문체 베이스" meta={`${baseChars.toLocaleString()}자`} />

          <div className="base-toolbar">
            <label className="icon-text-button file-button" title="TXT, MD, PDF 추가">
              {isParsing ? <Loader2 className="spin" size={17} /> : <Upload size={17} />}
              파일
              <input type="file" accept=".txt,.md,.text,.pdf,text/plain,text/markdown,application/pdf" multiple onChange={handleFileUpload} />
            </label>
            <button className="icon-text-button" title="현재 베이스 저장" onClick={handleSaveSnapshot} disabled={!currentBaseText.trim()}>
              <Save size={17} />
              저장
            </button>
            <button className="icon-text-button" title="현재 베이스 초기화" onClick={handleResetBase} disabled={!currentBaseText.trim()}>
              <Trash2 size={17} />
              초기화
            </button>
          </div>

          <div className="snapshot-row">
            <select
              aria-label="사용할 문체 베이스"
              value={selectedSnapshotId ?? "current"}
              onChange={(event) => setSelectedSnapshotId(event.target.value === "current" ? null : event.target.value)}
            >
              <option value="current">현재 축적 베이스</option>
              {snapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {snapshot.name}
                </option>
              ))}
            </select>
            {selectedSnapshot ? (
              <button className="text-button" onClick={() => setSelectedSnapshotId(null)}>현재</button>
            ) : null}
          </div>

          <textarea
            className="text-area sample-area"
            value={selectedSnapshot ? selectedSnapshot.text : manualText}
            onChange={(event) => setManualText(event.target.value)}
            spellCheck={false}
            readOnly={Boolean(selectedSnapshot)}
            aria-label="문체 베이스 직접 입력"
          />

          <div className="volume-card">
            <div>
              <span>분량 기준</span>
              <strong>{volume.label}</strong>
            </div>
            <div className="volume-track">
              <i style={{ width: `${volume.progress}%` }} />
            </div>
            <div className="volume-scale">
              <span>8천</span>
              <span>3만</span>
              <span>5만+</span>
            </div>
          </div>

          <div className="fingerprint">
            <Metric label="활성 소스" value={`${enabledSourceCount}개`} />
            <Metric label="평균 길이" value={`${profile.averageSentenceLength || 0}자`} />
            <Metric label="권면 밀도" value={`${profile.exhortationRate}%`} />
            <Metric label="따뜻함" value={`${profile.warmthScore}%`} />
          </div>

          <SourceList
            sources={sources}
            onToggle={(id) => {
              setSources((current) => current.map((source) => (source.id === id ? { ...source, enabled: !source.enabled } : source)));
              setSelectedSnapshotId(null);
            }}
            onDelete={handleDeleteSource}
          />

          <ChipGroup title="자주 보이는 말" items={profile.topConnectors.concat(profile.signaturePhrases).slice(0, 8)} />
          <ChipGroup title="종결 리듬" items={profile.topEndings.slice(0, 6)} />
        </article>

        <article className="panel panel-editor">
          <PanelTitle icon={<FileText size={20} />} title="새 글" meta={`${sourceChars.toLocaleString()}자`} />
          <textarea
            className="text-area source-area"
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            spellCheck={false}
            aria-label="변환할 글"
          />

          <div className="controls">
            <div className="control-row">
              <label htmlFor="intensity">문체 반영</label>
              <strong>{options.intensity}%</strong>
              <input
                id="intensity"
                type="range"
                min="50"
                max="100"
                step="5"
                value={options.intensity}
                onChange={(event) => setOptions((current) => ({ ...current, intensity: Number(event.target.value) }))}
              />
            </div>

            <div className="control-row">
              <label htmlFor="rhythm">문장 리듬</label>
              <strong>{options.rhythm < 45 ? "길게" : options.rhythm > 70 ? "짧게" : "균형"}</strong>
              <input
                id="rhythm"
                type="range"
                min="20"
                max="90"
                step="5"
                value={options.rhythm}
                onChange={(event) => setOptions((current) => ({ ...current, rhythm: Number(event.target.value) }))}
              />
            </div>

            <div className="segmented" aria-label="글의 용도">
              {destinationOptions.map((item) => (
                <button
                  key={item.value}
                  className={options.destination === item.value ? "active" : ""}
                  onClick={() => setOptions((current) => ({ ...current, destination: item.value }))}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="toggles">
              <Toggle
                label="장절 보존"
                checked={options.keepScripture}
                onChange={() => setOptions((current) => ({ ...current, keepScripture: !current.keepScripture }))}
              />
              <Toggle
                label="의미 엄격"
                checked={options.strictMeaning}
                onChange={() => setOptions((current) => ({ ...current, strictMeaning: !current.strictMeaning }))}
              />
              <Toggle
                label="AI 티 줄이기"
                checked={options.humanize}
                onChange={() => setOptions((current) => ({ ...current, humanize: !current.humanize }))}
              />
              <Toggle
                label="최종 점검"
                checked={options.finalCheck}
                onChange={() => setOptions((current) => ({ ...current, finalCheck: !current.finalCheck }))}
              />
            </div>
          </div>

          {error ? <div className="inline-error">{error}</div> : null}

          <div className="primary-actions">
            <button className="primary-button" onClick={handleRewrite} disabled={isLoading || !sourceText.trim() || !baseText.trim()}>
              {isLoading ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
              변환하기
            </button>
            <button className="secondary-button" onClick={handleLocalRewrite} disabled={!sourceText.trim() || !baseText.trim()}>
              <RefreshCcw size={17} />
              로컬
            </button>
          </div>

          <button className="history-button" onClick={handlePreviousRewrite} disabled={!sourceText.trim() || !snapshots.length}>
            <History size={17} />
            업데이트 전 베이스로 변환
          </button>
        </article>

        <article className="panel panel-result">
          <PanelTitle
            icon={<Sparkles size={20} />}
            title="결과"
            meta={result?.baseLabel ?? (result ? (result.provider === "openai" ? result.model ?? "OpenAI" : "로컬 엔진") : destinationLabel(options.destination))}
          />

          <div className="result-box">
            {result?.text ? (
              <textarea
                className="text-area result-area"
                value={result.text}
                onChange={(event) => handleResultEdit(event.target.value)}
                spellCheck={false}
                aria-label="변환 결과"
              />
            ) : (
              <div className="empty-result">
                <Gauge size={42} />
                <span>아직 변환된 글이 없습니다.</span>
              </div>
            )}
          </div>

          <div className="result-actions">
            <button className="icon-text-button" onClick={handleCopy} disabled={!result?.text}>
              {copied ? <Check size={17} /> : <Clipboard size={17} />}
              {copied ? "복사됨" : "복사"}
            </button>
            <button className="icon-text-button" onClick={handleDownload} disabled={!result?.text}>
              <Download size={17} />
              TXT
            </button>
          </div>

          {isBlogResult ? <BlogPreview scenes={blogScenes} onScenesChange={setBlogScenes} /> : null}

          <div className="score-grid">
            <Metric label="문체 일치" value={result ? `${matchScore}%` : "-"} />
            <Metric label="결과 호흡" value={result ? resultProfile.rhythmLabel : "-"} />
            <Metric label="질문 리듬" value={result ? `${resultProfile.questionRate}%` : "-"} />
            <Metric label="권면 밀도" value={result ? `${resultProfile.exhortationRate}%` : "-"} />
          </div>

          <QualityPanel report={result?.quality} />

          <SnapshotList snapshots={snapshots} onSelect={(id) => setSelectedSnapshotId(id)} />
        </article>
      </section>
    </main>
  );
}

const sheepMoodOptions = [
  { value: "peaceful", label: "01 평안", fullLabel: "평안히 앉은 토다 양", image: "01-peaceful.png" },
  { value: "despair", label: "02 절망", fullLabel: "절망한 토다 양", image: "02-despair.png" },
  { value: "praying", label: "03 기도", fullLabel: "기도하는 토다 양", image: "03-praying.png" },
  { value: "surprised", label: "04 놀람", fullLabel: "놀란 토다 양", image: "04-surprised.png" },
  { value: "hopeful", label: "05 소망", fullLabel: "소망을 보는 토다 양", image: "05-hopeful.png" },
  { value: "reading-bible", label: "06 말씀 읽기", fullLabel: "성경 읽는 토다 양", image: "06-reading-bible.png" },
  { value: "comforting", label: "07 위로", fullLabel: "어린 양을 안아주는 토다 양", image: "07-comforting.png" },
  { value: "celebrating", label: "08 기쁨", fullLabel: "기뻐 뛰는 토다 양", image: "08-celebrating.png" },
  { value: "thinking", label: "09 생각", fullLabel: "생각하는 토다 양", image: "09-thinking.png" },
  { value: "sleeping", label: "10 쉼", fullLabel: "잠든 토다 양", image: "10-sleeping.png" },
  { value: "waving", label: "11 인사", fullLabel: "손 흔드는 토다 양", image: "11-waving.png" },
  { value: "heart", label: "12 사랑", fullLabel: "하트를 든 토다 양", image: "12-heart.png" },
  { value: "worshiping", label: "13 찬양", fullLabel: "찬양하는 토다 양", image: "13-worshiping.png" },
  { value: "teaching", label: "14 가르침", fullLabel: "말씀을 가르치는 토다 양", image: "14-teaching.png" },
  { value: "listening", label: "15 경청", fullLabel: "가만히 듣는 토다 양", image: "15-listening.png" },
  { value: "walking", label: "16 동행", fullLabel: "걸어가는 토다 양", image: "16-walking.png" },
  { value: "running", label: "17 달림", fullLabel: "달려가는 토다 양", image: "17-running.png" },
  { value: "umbrella", label: "18 보호", fullLabel: "우산 든 토다 양", image: "18-umbrella.png" },
  { value: "lantern", label: "19 인도", fullLabel: "등불 든 토다 양", image: "19-lantern.png" },
  { value: "crying", label: "20 눈물", fullLabel: "눈물 흘리는 토다 양", image: "20-crying.png" },
  { value: "smiling", label: "21 웃음", fullLabel: "활짝 웃는 토다 양", image: "21-smiling.png" },
  { value: "confused", label: "22 당황", fullLabel: "어리둥절한 토다 양", image: "22-confused.png" },
  { value: "thankful", label: "23 감사", fullLabel: "감사하는 토다 양", image: "23-thankful.png" },
  { value: "holding-heart", label: "24 마음", fullLabel: "큰 하트를 안은 토다 양", image: "24-holding-heart.png" },
  { value: "carrying-book", label: "25 책", fullLabel: "책을 안은 토다 양", image: "25-carrying-book.png" },
  { value: "pointing-up", label: "26 하늘 보기", fullLabel: "위를 가리키는 토다 양", image: "26-pointing-up.png" },
  { value: "writing", label: "27 기록", fullLabel: "글 쓰는 토다 양", image: "27-writing.png" },
  { value: "tea", label: "28 차 한잔", fullLabel: "차 마시는 토다 양", image: "28-tea.png" },
  { value: "kneeling", label: "29 무릎", fullLabel: "무릎 꿇고 기도하는 토다 양", image: "29-kneeling.png" },
  { value: "cheering", label: "30 응원", fullLabel: "응원하는 토다 양", image: "30-cheering.png" }
] as const;

type SheepMood = (typeof sheepMoodOptions)[number]["value"];

type BlogScene = {
  id: string;
  text: string;
  mood: SheepMood;
  illustration?: {
    mood: SheepMood;
    label: string;
  };
};

function BlogPreview({ scenes, onScenesChange }: { scenes: BlogScene[]; onScenesChange: (scenes: BlogScene[]) => void }) {
  if (!scenes.length) return null;

  function updateScene(id: string, updater: (scene: BlogScene) => BlogScene) {
    onScenesChange(scenes.map((scene) => (scene.id === id ? updater(scene) : scene)));
  }

  function updateSceneText(id: string, text: string) {
    updateScene(id, (scene) => ({
      ...scene,
      text,
      mood: detectSheepMood(text, 0)
    }));
  }

  function addParagraph(afterIndex: number) {
    const nextScenes = [...scenes];
    nextScenes.splice(afterIndex + 1, 0, {
      id: createId(),
      text: "새 문단을 입력하세요.",
      mood: "peaceful"
    });
    onScenesChange(nextScenes);
  }

  function removeParagraph(id: string) {
    if (scenes.length <= 1) return;
    onScenesChange(scenes.filter((scene) => scene.id !== id));
  }

  function addIllustration(id: string) {
    updateScene(id, (scene) => {
      const mood = detectSheepMood(scene.text, 0);
      return {
        ...scene,
        mood,
        illustration: {
          mood,
          label: sheepMoodLabel(mood)
        }
      };
    });
  }

  function updateIllustration(id: string, mood: SheepMood) {
    updateScene(id, (scene) => ({
      ...scene,
      mood,
      illustration: {
        mood,
        label: sheepMoodLabel(mood)
      }
    }));
  }

  function removeIllustration(id: string) {
    updateScene(id, (scene) => {
      const nextScene = { ...scene };
      delete nextScene.illustration;
      return nextScene;
    });
  }

  function autoArrangeIllustrations() {
    onScenesChange(placeBlogIllustrations(scenes.map((scene, index) => ({ ...scene, mood: detectSheepMood(scene.text, index), illustration: undefined }))));
  }

  return (
    <div className="blog-preview">
      <div className="blog-preview-title">
        <div className="section-label">
          <Sparkles size={15} />
          <span>토다 그림책 편집</span>
        </div>
        <div className="blog-export-actions">
          <button className="icon-text-button" onClick={() => addParagraph(scenes.length - 1)}>
            <Plus size={16} />
            문단
          </button>
          <button className="icon-text-button" onClick={autoArrangeIllustrations}>
            <RefreshCcw size={16} />
            자동
          </button>
          <button className="icon-text-button" onClick={() => void downloadBlogImage(scenes)}>
            <Download size={16} />
            PNG
          </button>
          <button className="icon-text-button" onClick={() => downloadBlogHtml(scenes)}>
            <Download size={16} />
            HTML
          </button>
        </div>
      </div>
      <div className="blog-scene-list">
        {scenes.map((scene, index) => (
          <div className="blog-flow-item" key={scene.id}>
            <div className="blog-edit-toolbar">
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <button className="text-button" onClick={() => addParagraph(index)}>
                  <Plus size={15} />
                  아래 문단
                </button>
                <button className="icon-button" title="문단 삭제" onClick={() => removeParagraph(scene.id)} disabled={scenes.length <= 1}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
            <textarea
              className="blog-paragraph-input"
              value={scene.text}
              rows={Math.max(2, Math.ceil(scene.text.length / 42))}
              onChange={(event) => updateSceneText(scene.id, event.target.value)}
              aria-label={`${index + 1}번 블로그 문단`}
            />
            {scene.illustration ? (
              <figure className="blog-illustration" data-mood={scene.illustration.mood}>
                <div className="blog-illustration-tools">
                  <select
                    className="blog-mood-select"
                    value={scene.illustration.mood}
                    onChange={(event) => updateIllustration(scene.id, event.target.value as SheepMood)}
                    aria-label={`${index + 1}번 문단 캐릭터 변경`}
                  >
                    {sheepMoodOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <button className="text-button" onClick={() => removeIllustration(scene.id)}>
                    <Trash2 size={14} />
                    그림 삭제
                  </button>
                </div>
                <TodaSheep mood={scene.illustration.mood} />
              </figure>
            ) : (
              <div className="blog-add-illustration">
                <button className="text-button" onClick={() => addIllustration(scene.id)}>
                  <ImagePlus size={15} />
                  여기에 그림 추가
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TodaSheep({ mood }: { mood: SheepMood }) {
  const image = sheepMoodImage(mood);
  return <img className="toda-sheep" src={`/toda-sheep-pack/png/${image}`} alt={`토다 양 ${mood}`} />;
}

function buildBlogScenes(text: string): BlogScene[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => block.replace(/^(#{1,6}\s+|[-*+]\s+|\d+\.\s+)/, "").trim())
    .filter(Boolean)
    .flatMap((block) => groupBlogSentences(block));

  const scenes = paragraphs.map((paragraph, index) => {
    const mood = detectSheepMood(paragraph, index);
    return {
      id: `${index}-${paragraph.slice(0, 16)}`,
      text: paragraph,
      mood
    };
  });

  return placeBlogIllustrations(scenes);
}

function groupBlogSentences(text: string) {
  const sentences =
    text
      .match(/[^.!?。！？]+[.!?。！？]?/g)
      ?.map((sentence) => sentence.trim())
      .filter(Boolean) ?? [text];
  const groups: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (current && candidate.length > 115) {
      groups.push(current);
      current = sentence;
    } else {
      current = candidate;
    }
  }

  if (current) groups.push(current);
  return groups;
}

function detectSheepMood(text: string, index: number): SheepMood {
  const assessment = assessSheepMood(text);
  if (assessment.score > 0) return assessment.mood;
  return index % 5 === 0 ? "peaceful" : "hopeful";
}

function placeBlogIllustrations(scenes: BlogScene[]) {
  if (!scenes.length) return scenes;

  const maxImages = Math.min(4, Math.max(1, Math.ceil(scenes.length / 4)));
  const minGap = scenes.length > 6 ? 3 : 2;
  let lastIllustrationIndex = -99;
  let imageCount = 0;
  const illustrated = scenes.map((scene, index) => {
    const assessment = assessSheepMood(scene.text);
    const shouldIllustrate =
      assessment.score >= 2 && imageCount < maxImages && index - lastIllustrationIndex >= minGap && index !== 0;

    if (!shouldIllustrate) return scene;

    lastIllustrationIndex = index;
    imageCount += 1;
    return {
      ...scene,
      mood: assessment.mood,
      illustration: {
        mood: assessment.mood,
        label: sheepMoodLabel(assessment.mood)
      }
    };
  });

  if (imageCount === 0) {
    const fallbackIndex = scenes.length === 1 ? 0 : Math.min(scenes.length - 1, Math.max(1, Math.floor(scenes.length * 0.58)));
    const mood = detectSheepMood(scenes[fallbackIndex].text, fallbackIndex);
    illustrated[fallbackIndex] = {
      ...illustrated[fallbackIndex],
      mood,
      illustration: {
        mood,
        label: sheepMoodLabel(mood)
      }
    };
  }

  return illustrated;
}

function assessSheepMood(text: string): { mood: SheepMood; score: number } {
  const candidates: Array<{ mood: SheepMood; score: number }> = [
    {
      mood: "despair",
      score: keywordScore(text, ["절망", "낙심", "슬픔", "아픔", "눈물", "울었", "두려", "무너", "외로", "상처", "고난", "탄식", "어둠"])
    },
    {
      mood: "praying",
      score: keywordScore(text, ["기도", "간구", "무릎", "주님께", "하나님께", "아멘", "예배"])
    },
    {
      mood: "celebrating",
      score: keywordScore(text, ["감사", "기쁨", "찬양", "축복", "웃", "즐거", "은혜", "부흥"])
    },
    {
      mood: "surprised",
      score: keywordScore(text, ["놀라", "뜻밖", "갑자기", "깨달", "처음", "새삼", "보았"])
    },
    {
      mood: "hopeful",
      score: keywordScore(text, ["소망", "희망", "회복", "다시 일어", "빛", "새롭게", "기대", "살아", "재림"])
    },
    {
      mood: "reading-bible",
      score: keywordScore(text, ["말씀", "성경", "읽", "묵상", "배우", "기록", "본문", "에스라", "토라"])
    },
    {
      mood: "comforting",
      score: keywordScore(text, ["위로", "함께", "품", "돌보", "사랑", "격려", "안아", "공동체", "지키"])
    }
  ];

  return candidates.reduce((best, candidate) => (candidate.score > best.score ? candidate : best), {
    mood: "peaceful" as SheepMood,
    score: 0
  });
}

function keywordScore(text: string, keywords: string[]) {
  return keywords.reduce((score, keyword) => score + (text.includes(keyword) ? 1 : 0), 0);
}

function normalizeBlogScenes(rawScenes: BlogScene[]) {
  return rawScenes.map((scene, index) => {
    const mood = normalizeSheepMood(String(scene.mood), index);
    const illustrationMood = scene.illustration ? normalizeSheepMood(String(scene.illustration.mood), index) : undefined;
    return {
      ...scene,
      id: scene.id || createId(),
      text: scene.text || "",
      mood,
      illustration: illustrationMood
        ? {
            mood: illustrationMood,
            label: sheepMoodLabel(illustrationMood)
          }
        : undefined
    };
  });
}

function normalizeSheepMood(value: string, index = 0): SheepMood {
  const aliases: Record<string, SheepMood> = {
    sad: "despair",
    reading: "reading-bible",
    comfort: "comforting",
    celebrate: "celebrating"
  };
  const normalized = aliases[value] ?? value;
  if (sheepMoodOptions.some((option) => option.value === normalized)) return normalized as SheepMood;
  return index % 5 === 0 ? "peaceful" : "hopeful";
}

function createBlogDraftKey(text: string, destination: Destination) {
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return `${destination}:${text.length}:${hash}`;
}

function sheepMoodLabel(mood: SheepMood) {
  return sheepMoodOptions.find((option) => option.value === mood)?.fullLabel ?? "토다 양";
}

function sheepMoodImage(mood: SheepMood) {
  return sheepMoodOptions.find((option) => option.value === mood)?.image ?? "01-peaceful.png";
}

function downloadBlogHtml(scenes: BlogScene[]) {
  const html = buildBlogHtml(scenes);
  downloadBlob(new Blob([html], { type: "text/html;charset=utf-8" }), `토다-그림책-${todayStamp()}.html`);
}

async function downloadBlogImage(scenes: BlogScene[]) {
  try {
    const blob = await renderBlogImage(scenes);
    downloadBlob(blob, `토다-그림책-${todayStamp()}.png`);
  } catch {
    window.alert("이미지 저장 중 문제가 생겼습니다. 잠시 후 다시 시도해 주세요.");
  }
}

function buildBlogHtml(scenes: BlogScene[]) {
  const content = scenes
    .map((scene) => {
      const paragraph = `<p class="toda-paragraph">${escapeHtml(scene.text)}</p>`;
      if (!scene.illustration) return paragraph;
      const image = `${BLOG_ASSET_ORIGIN}/toda-sheep-pack/png/${sheepMoodImage(scene.illustration.mood)}`;
      return `${paragraph}
<figure class="toda-illustration" data-mood="${scene.illustration.mood}">
  <img src="${image}" alt="${escapeHtml(scene.illustration.label)}" width="152" height="152" />
</figure>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>토다 그림책</title>
  <style>
    body { margin: 0; background: #fffdfb; color: #1f2b2c; font-family: "Pretendard", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif; }
    .toda-picturebook { max-width: 760px; margin: 0 auto; padding: 24px 18px 32px; }
    .toda-paragraph { margin: 0 0 18px; color: #1f2b2c; font-size: 19px; line-height: 1.9; word-break: keep-all; overflow-wrap: anywhere; }
    .toda-illustration { margin: 12px 0 28px; display: grid; justify-items: center; }
    .toda-illustration img { width: 152px; height: 152px; object-fit: contain; display: block; }
    @media (max-width: 520px) { .toda-picturebook { padding: 18px 14px 28px; } .toda-paragraph { font-size: 17px; } .toda-illustration img { width: 132px; height: 132px; } }
  </style>
</head>
<body>
  <main class="toda-picturebook">
${content}
  </main>
</body>
</html>`;
}

async function renderBlogImage(scenes: BlogScene[]) {
  const width = 920;
  const paddingX = 58;
  const paddingY = 42;
  const paragraphGap = 26;
  const imageSize = 160;
  const imageGapTop = 10;
  const imageGapBottom = 30;
  const textX = paddingX;
  const textMaxWidth = width - paddingX * 2;
  const lineHeight = 42;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const measureCanvas = document.createElement("canvas");
  const measureContext = measureCanvas.getContext("2d");
  if (!measureContext) throw new Error("Canvas is not available.");
  measureContext.font = "27px Malgun Gothic, Apple SD Gothic Neo, sans-serif";

  const prepared = scenes.map((scene) => {
    const lines = wrapCanvasText(measureContext, scene.text, textMaxWidth);
    const illustrationHeight = scene.illustration ? imageGapTop + imageSize + imageGapBottom : 0;
    const blockHeight = lines.length * lineHeight + paragraphGap + illustrationHeight;
    return { scene, lines, blockHeight };
  });
  const height = paddingY * 2 + prepared.reduce((sum, item) => sum + item.blockHeight, 0);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas is not available.");
  context.scale(pixelRatio, pixelRatio);
  context.fillStyle = "#fffdfb";
  context.fillRect(0, 0, width, height);
  context.font = "27px Malgun Gothic, Apple SD Gothic Neo, sans-serif";
  context.textBaseline = "top";

  const imageEntries = await Promise.all(
    prepared.map(async ({ scene }) => ({
      id: scene.id,
      image: scene.illustration ? await loadImage(`/toda-sheep-pack/png/${sheepMoodImage(scene.illustration.mood)}`) : null
    }))
  );
  const imageMap = new Map(imageEntries.map((entry) => [entry.id, entry.image]));
  let y = paddingY;
  prepared.forEach(({ scene, lines }) => {
    y = drawBlogBlock(context, scene, lines, imageMap.get(scene.id) ?? null, {
      x: textX,
      y,
      canvasWidth: width,
      textMaxWidth,
      imageSize,
      lineHeight,
      paragraphGap,
      imageGapTop,
      imageGapBottom
    });
  });

  return canvasToBlob(canvas);
}

function drawBlogBlock(
  context: CanvasRenderingContext2D,
  scene: BlogScene,
  lines: string[],
  image: HTMLImageElement | null,
  layout: {
    x: number;
    y: number;
    canvasWidth: number;
    textMaxWidth: number;
    imageSize: number;
    lineHeight: number;
    paragraphGap: number;
    imageGapTop: number;
    imageGapBottom: number;
  }
) {
  context.fillStyle = "#1f2b2c";
  context.font = "27px Malgun Gothic, Apple SD Gothic Neo, sans-serif";
  context.textAlign = "left";
  lines.forEach((line, lineIndex) => {
    context.fillText(line, layout.x, layout.y + lineIndex * layout.lineHeight, layout.textMaxWidth);
  });

  let nextY = layout.y + lines.length * layout.lineHeight + layout.paragraphGap;
  if (scene.illustration && image) {
    const imageX = Math.round((layout.canvasWidth - layout.imageSize) / 2);
    const imageY = nextY + layout.imageGapTop;
    context.drawImage(image, imageX, imageY, layout.imageSize, layout.imageSize);
    nextY = imageY + layout.imageSize + layout.imageGapBottom;
  }

  return nextY;
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let current = "";
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else if (!current && context.measureText(candidate).width > maxWidth) {
      const broken = breakLongWord(context, word, maxWidth);
      lines.push(...broken.slice(0, -1));
      current = broken.at(-1) ?? "";
    } else {
      current = candidate;
    }
  }

  if (current.trim()) lines.push(current.trim());
  return lines.length ? lines : [text];
}

function breakLongWord(context: CanvasRenderingContext2D, word: string, maxWidth: number) {
  const lines: string[] = [];
  let current = "";

  for (const char of Array.from(word)) {
    const candidate = current + char;
    if (current && context.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = char;
    } else {
      current = candidate;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not create image."));
    }, "image/png");
  });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function QualityPanel({ report }: { report?: QualityReport }) {
  return (
    <div className="quality-panel">
      <div className="section-label">
        <Check size={15} />
        <span>최종 점검</span>
        {report ? <strong>{report.score}점</strong> : null}
      </div>
      {report ? (
        <div className="quality-list">
          {report.issues.slice(0, 5).map((issue) => (
            <div className="quality-item" data-severity={issue.severity} key={issue.id}>
              <strong>{issue.label}</strong>
              <span>{issue.detail}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-list">결과 생성 후 점검</div>
      )}
    </div>
  );
}

function PanelTitle({ icon, title, meta }: { icon: React.ReactNode; title: string; meta: string }) {
  return (
    <div className="panel-title">
      <div>
        {icon}
        <h2>{title}</h2>
      </div>
      <span>{meta}</span>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function SourceList({
  sources,
  onToggle,
  onDelete
}: {
  sources: StyleSource[];
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="source-list">
      <div className="section-label">
        <Database size={15} />
        <span>소스 목록</span>
      </div>
      {sources.length ? (
        sources.map((source) => (
          <div className="source-item" key={source.id} data-disabled={!source.enabled}>
            <div>
              <strong>{source.name}</strong>
              <span>
                {source.kind.toUpperCase()} · {source.charCount.toLocaleString()}자 · {formatDate(source.addedAt)}
              </span>
            </div>
            <button className="icon-button" title={source.enabled ? "비활성" : "활성"} onClick={() => onToggle(source.id)}>
              {source.enabled ? <Eye size={16} /> : <EyeOff size={16} />}
            </button>
            <button className="icon-button" title="삭제" onClick={() => onDelete(source.id)}>
              <Trash2 size={16} />
            </button>
          </div>
        ))
      ) : (
        <div className="empty-list">직접 입력만 사용 중</div>
      )}
    </div>
  );
}

function SnapshotList({ snapshots, onSelect }: { snapshots: StyleSnapshot[]; onSelect: (id: string) => void }) {
  return (
    <div className="snapshot-list">
      <div className="section-label">
        <Archive size={15} />
        <span>베이스 기록</span>
      </div>
      {snapshots.length ? (
        snapshots.slice(0, 4).map((snapshot) => (
          <button key={snapshot.id} className="snapshot-item" onClick={() => onSelect(snapshot.id)}>
            <strong>{snapshot.name}</strong>
            <span>
              {snapshot.charCount.toLocaleString()}자 · {snapshot.sourceCount}개 소스
            </span>
          </button>
        ))
      ) : (
        <div className="empty-list">저장된 기록 없음</div>
      )}
    </div>
  );
}

function ChipGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="chip-group">
      <span>{title}</span>
      <div>
        {items.length ? items.map((item, index) => <em key={`${item}-${index}`}>{item}</em>) : <em>분석 대기</em>}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <button className={`toggle ${checked ? "checked" : ""}`} onClick={onChange} aria-pressed={checked}>
      <span>{checked ? <Check size={13} /> : null}</span>
      {label}
    </button>
  );
}

function normalizeImportedText(text: string) {
  return text.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function getSourceKind(file: File): StyleSourceKind {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".md")) return "md";
  return "txt";
}

function getVolumeStatus(chars: number) {
  if (chars >= 50000) return { label: "풍부", progress: 100 };
  if (chars >= 30000) return { label: "안정", progress: Math.round((chars / 50000) * 100) };
  if (chars >= 8000) return { label: "시작", progress: Math.round((chars / 50000) * 100) };
  return { label: "부족", progress: Math.max(4, Math.round((chars / 50000) * 100)) };
}

function createId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export default App;
