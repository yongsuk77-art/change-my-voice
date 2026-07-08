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
  Loader2,
  Mic2,
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

const defaultSample = `사랑하는 성도 여러분, 오늘 우리는 주님 앞에서 다시 마음을 살펴보아야 합니다. 믿음은 멀리 있는 말이 아니라, 오늘 우리의 작은 순종 속에서 자라나는 생명입니다.

그러므로 낙심의 자리에서도 말씀을 붙드십시오. 하나님은 우리의 연약함을 외면하지 않으시고, 그 자리에서 다시 일으키시는 분이십니다.`;

const defaultSource = `AI로 작성한 글을 그대로 올리면 문장이 정돈되어 보이지만, 내 목소리가 사라진 것처럼 느껴질 때가 있습니다. 글의 핵심은 유지하되, 오래 써 온 어투와 표현을 살려서 더 자연스럽게 다듬는 과정이 필요합니다.`;

const destinationOptions: Array<{ value: Destination; label: string }> = [
  { value: "sermon", label: "설교문" },
  { value: "devotional", label: "묵상문" },
  { value: "letter", label: "서신" },
  { value: "column", label: "칼럼" },
  { value: "social", label: "SNS" }
];

function App() {
  const [manualText, setManualText] = useState(defaultSample);
  const [sources, setSources] = useState<StyleSource[]>([]);
  const [snapshots, setSnapshots] = useState<StyleSnapshot[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
  const [sourceText, setSourceText] = useState(defaultSource);
  const [result, setResult] = useState<RewriteResult | null>(null);
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
          result
        })
      );
    } catch {
      setError("브라우저 저장 공간이 부족합니다. 큰 PDF는 일부 소스를 삭제한 뒤 다시 추가해 주세요.");
    }
  }, [manualText, sources, snapshots, selectedSnapshotId, sourceText, options, result]);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((data) => setStatus({ provider: data.provider, model: data.model }))
      .catch(() => setStatus({ provider: "local", model: "브라우저 엔진" }));
  }, []);

  const profile = useMemo(() => analyzeStyle(baseText), [baseText]);
  const resultProfile = useMemo(() => analyzeStyle(result?.text ?? ""), [result]);
  const matchScore = useMemo(() => (result?.text ? scoreMatch(result.text, profile) : 0), [result, profile]);
  const sourceChars = sourceText.replace(/\s/g, "").length;
  const baseChars = baseText.replace(/\s/g, "").length;
  const currentChars = currentBaseText.replace(/\s/g, "").length;
  const enabledSourceCount = sources.filter((source) => source.enabled).length + (manualText.trim() ? 1 : 0);
  const volume = getVolumeStatus(baseChars);

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
        quality: checked.report
      });
    } catch {
      const fallbackDraft = rewriteLocally(sourceText, styleBaseText, options);
      const checked = applyFinalCheck(sourceText, fallbackDraft);
      setResult({
        text: checked.text,
        provider: "local",
        baseLabel: label,
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
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `내-말투-${new Date().toISOString().slice(0, 10)}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
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
            <h1>내 말투로</h1>
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
