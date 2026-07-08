import {
  BookOpenText,
  Check,
  Clipboard,
  Download,
  FileText,
  Gauge,
  Loader2,
  Mic2,
  RefreshCcw,
  Save,
  Sparkles,
  Upload,
  Wand2
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { analyzeStyle, destinationLabel, rewriteLocally, scoreMatch } from "./lib/styleEngine";
import type { Destination, RewriteResult, StyleOptions } from "./types";

const STORAGE_KEY = "change-my-voice-state-v1";

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
  const [sampleText, setSampleText] = useState(defaultSample);
  const [sourceText, setSourceText] = useState(defaultSource);
  const [result, setResult] = useState<RewriteResult | null>(null);
  const [options, setOptions] = useState<StyleOptions>({
    intensity: 80,
    destination: "sermon",
    rhythm: 62,
    keepScripture: true,
    strictMeaning: true,
    humanize: true
  });
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<{ provider: "openai" | "local"; model: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      setSampleText(parsed.sampleText || defaultSample);
      setSourceText(parsed.sourceText || defaultSource);
      setOptions({ ...options, ...parsed.options });
      setResult(parsed.result || null);
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        sampleText,
        sourceText,
        options,
        result
      })
    );
  }, [sampleText, sourceText, options, result]);

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((data) => setStatus({ provider: data.provider, model: data.model }))
      .catch(() => setStatus({ provider: "local", model: "브라우저 엔진" }));
  }, []);

  const profile = useMemo(() => analyzeStyle(sampleText), [sampleText]);
  const resultProfile = useMemo(() => analyzeStyle(result?.text ?? ""), [result]);
  const matchScore = useMemo(() => (result?.text ? scoreMatch(result.text, profile) : 0), [result, profile]);
  const sourceChars = sourceText.replace(/\s/g, "").length;
  const sampleChars = sampleText.replace(/\s/g, "").length;

  async function handleRewrite() {
    setIsLoading(true);
    setError("");
    setCopied(false);

    try {
      if (status?.provider !== "openai") {
        setResult({
          text: rewriteLocally(sourceText, sampleText, options),
          provider: "local"
        });
        return;
      }

      const response = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sampleText,
          sourceText,
          styleProfile: profile,
          options
        })
      });

      if (response.ok) {
        const data = await response.json();
        setResult({
          text: data.text,
          provider: data.provider,
          model: data.model
        });
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (response.status !== 503) {
        setError(data.error || "서버 변환에 실패해 로컬 변환으로 처리했습니다.");
      }
      setResult({
        text: rewriteLocally(sourceText, sampleText, options),
        provider: "local"
      });
    } catch {
      setResult({
        text: rewriteLocally(sourceText, sampleText, options),
        provider: "local"
      });
    } finally {
      setIsLoading(false);
    }
  }

  function handleLocalRewrite() {
    setError("");
    setCopied(false);
    setResult({
      text: rewriteLocally(sourceText, sampleText, options),
      provider: "local"
    });
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
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setSampleText((current) => `${current.trim()}\n\n${text.trim()}`.trim());
    event.target.value = "";
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
          <PanelTitle icon={<BookOpenText size={20} />} title="문체 베이스" meta={`${sampleChars.toLocaleString()}자`} />
          <textarea
            className="text-area sample-area"
            value={sampleText}
            onChange={(event) => setSampleText(event.target.value)}
            spellCheck={false}
            aria-label="옛 설교문 샘플"
          />
          <div className="panel-actions">
            <label className="icon-button file-button" title="TXT 파일 추가">
              <Upload size={17} />
              <input type="file" accept=".txt,.md,.text" onChange={handleFileUpload} />
            </label>
            <button className="icon-button" title="샘플 저장" onClick={() => localStorage.setItem(STORAGE_KEY, JSON.stringify({ sampleText, sourceText, options, result }))}>
              <Save size={17} />
            </button>
            <button className="text-button" onClick={() => setSampleText("")}>비우기</button>
          </div>

          <div className="fingerprint">
            <Metric label="문장 호흡" value={profile.rhythmLabel} />
            <Metric label="평균 길이" value={`${profile.averageSentenceLength || 0}자`} />
            <Metric label="권면 밀도" value={`${profile.exhortationRate}%`} />
            <Metric label="따뜻함" value={`${profile.warmthScore}%`} />
          </div>

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
            </div>
          </div>

          {error ? <div className="inline-error">{error}</div> : null}

          <div className="primary-actions">
            <button className="primary-button" onClick={handleRewrite} disabled={isLoading || !sourceText.trim()}>
              {isLoading ? <Loader2 className="spin" size={18} /> : <Wand2 size={18} />}
              변환하기
            </button>
            <button className="secondary-button" onClick={handleLocalRewrite} disabled={!sourceText.trim()}>
              <RefreshCcw size={17} />
              로컬
            </button>
          </div>
        </article>

        <article className="panel panel-result">
          <PanelTitle
            icon={<Sparkles size={20} />}
            title="결과"
            meta={result ? (result.provider === "openai" ? result.model ?? "OpenAI" : "로컬 엔진") : destinationLabel(options.destination)}
          />

          <div className="result-box">
            {result?.text ? (
              <textarea
                className="text-area result-area"
                value={result.text}
                onChange={(event) => setResult({ ...(result ?? { provider: "local" }), text: event.target.value })}
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
        </article>
      </section>
    </main>
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

function ChipGroup({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="chip-group">
      <span>{title}</span>
      <div>
        {items.length ? items.map((item) => <em key={item}>{item}</em>) : <em>분석 대기</em>}
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

export default App;
