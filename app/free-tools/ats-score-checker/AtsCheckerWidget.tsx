'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Target,
  BarChart3,
  Copy,
  Check,
  Search,
  BookOpen,
  ClipboardPaste,
} from 'lucide-react';
import type { AtsCheckResult } from '@/lib/ats-checker';
import { ATS_SAMPLE_JD, ATS_SAMPLE_RESUME } from '@/lib/ats-checker-samples';
import { isResumeFilename, RESUME_FILE_ACCEPT } from '@/lib/resume-upload';

type InputMode = 'file' | 'paste';

export function AtsCheckerWidget() {
  const [inputMode, setInputMode] = useState<InputMode>('file');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [jdText, setJdText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AtsCheckResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const canSubmit =
    inputMode === 'file'
      ? resumeFile !== null
      : pasteText.trim().length >= 50;

  const acceptFile = useCallback((file: File) => {
    if (!isResumeFilename(file.name)) {
      setError('Please upload a .pdf, .doc, .docx, or .txt file.');
      return;
    }
    setError(null);
    setResumeFile(file);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file) acceptFile(file);
    },
    [acceptFile],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) acceptFile(file);
  };

  const loadSample = () => {
    setInputMode('paste');
    setPasteText(ATS_SAMPLE_RESUME);
    setJdText(ATS_SAMPLE_JD);
    setResumeFile(null);
    setError(null);
  };

  const runCheck = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      let res: Response;

      if (inputMode === 'file' && resumeFile) {
        const formData = new FormData();
        formData.append('resume', resumeFile);
        if (jdText.trim()) formData.append('job_description', jdText.trim());
        res = await fetch('/api/ats-checker', { method: 'POST', body: formData });
      } else {
        res = await fetch('/api/ats-checker', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            resume_text: pasteText.trim(),
            job_description: jdText.trim() || undefined,
          }),
        });
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Check failed (${res.status})`);
      }
      setResult(await res.json());
    } catch (e) {
      setError((e as Error).message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setResumeFile(null);
    setPasteText('');
    setJdText('');
    setError(null);
  };

  const copyResults = () => {
    if (!result) return;
    const lines = [
      `ATS Score: ${result.overallScore}/100`,
      '',
      'Good Practices:',
      ...result.goodPractices.map((s) => `  + ${s}`),
      '',
      'Issues Found:',
      ...result.detectedIssues.map((w) => `  - ${w}`),
      '',
      'Top Improvements:',
      ...result.topImprovements.map((r) => `  * ${r}`),
    ];
    if (result.jdMatch) {
      lines.push('', `JD Match: ${result.jdMatch.matchScore}%`, `Missing: ${result.jdMatch.missing.join(', ') || 'none'}`);
    }
    navigator.clipboard.writeText(lines.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const scoreBg = (score: number) => {
    if (score >= 80) return 'bg-green-50 border-green-200';
    if (score >= 60) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  const scoreBar = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  if (!result) {
    return (
      <div className="bg-white rounded-2xl shadow-xl border p-6 sm:p-8">
        <div className="flex flex-wrap gap-2 mb-4">
          <button
            type="button"
            onClick={() => setInputMode('file')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              inputMode === 'file'
                ? 'bg-[#006a65] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <Upload className="w-4 h-4 inline mr-1.5" />
            Upload file
          </button>
          <button
            type="button"
            onClick={() => setInputMode('paste')}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              inputMode === 'paste'
                ? 'bg-[#006a65] text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <ClipboardPaste className="w-4 h-4 inline mr-1.5" />
            Paste text
          </button>
          <button
            type="button"
            onClick={loadSample}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition ml-auto"
          >
            <BookOpen className="w-4 h-4 inline mr-1.5" />
            Try sample
          </button>
        </div>

        {inputMode === 'file' ? (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-[#006a65] hover:bg-[#f9f9ff] transition mb-6"
          >
            <input
              ref={fileRef}
              type="file"
              accept={RESUME_FILE_ACCEPT}
              onChange={handleFileChange}
              className="hidden"
            />
            {resumeFile ? (
              <div className="flex items-center justify-center gap-3">
                <FileText className="w-8 h-8 text-[#006a65]" />
                <div className="text-left">
                  <p className="font-medium text-gray-900">{resumeFile.name}</p>
                  <p className="text-sm text-gray-500">
                    {(resumeFile.size / 1024).toFixed(0)} KB — click to change
                  </p>
                </div>
              </div>
            ) : (
              <>
                <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="font-medium text-gray-700 mb-1">
                  Drop your resume here or click to browse
                </p>
                <p className="text-sm text-gray-400">PDF, DOC, DOCX, or TXT — max 10MB</p>
              </>
            )}
          </div>
        ) : (
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Resume text
            </label>
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste your resume text here (min 50 characters)..."
              rows={12}
              className="w-full px-4 py-3 border rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#006a65]/30 resize-y"
            />
            <p className="text-xs text-gray-400 mt-1">{pasteText.trim().length} characters</p>
          </div>
        )}

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Search className="w-4 h-4 inline mr-1" />
            Job description (optional)
          </label>
          <textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="Paste a job description for keyword gap analysis..."
            rows={4}
            className="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006a65]/30 resize-none"
          />
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        <button
          onClick={runCheck}
          disabled={loading || !canSubmit}
          className="w-full py-3 bg-gradient-to-r from-[#006a65] to-[#2cc9c0] text-white font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Analyzing resume...
            </>
          ) : (
            <>
              <BarChart3 className="w-5 h-5" />
              Check my resume score
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl border p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Your ATS score</h2>
        <button onClick={reset} className="text-sm text-[#006a65] hover:underline">
          Check another
        </button>
      </div>

      {result.parseWarning && (
        <div className="mb-4 flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          {result.parseWarning}
        </div>
      )}

      <div className={`rounded-xl border p-6 text-center mb-6 ${scoreBg(result.overallScore)}`}>
        <div className={`text-5xl font-extrabold ${scoreColor(result.overallScore)}`}>
          {result.overallScore}
        </div>
        <div className="text-sm text-gray-500 mt-1">out of 100</div>
        <div className="mt-3 w-full bg-gray-200 rounded-full h-2.5">
          <div
            className={`h-2.5 rounded-full ${scoreBar(result.overallScore)}`}
            style={{ width: `${result.overallScore}%` }}
          />
        </div>
        {result.fileHints?.formatAdvice && (
          <p className="text-xs text-gray-500 mt-3">{result.fileHints.formatAdvice}</p>
        )}
      </div>

      {result.jdMatch && (
        <div className="mb-6 p-4 bg-[#f9f9ff] border border-[#006a65]/20 rounded-xl">
          <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
            <Target className="w-4 h-4 text-[#006a65]" />
            Job description match — {result.jdMatch.matchScore}%
          </h3>
          {result.jdMatch.matched.length > 0 && (
            <p className="text-sm text-green-700 mb-1">
              Matched: {result.jdMatch.matched.slice(0, 12).join(', ')}
              {result.jdMatch.matched.length > 12 ? '…' : ''}
            </p>
          )}
          {result.jdMatch.missing.length > 0 && (
            <p className="text-sm text-red-600">
              Missing: {result.jdMatch.missing.slice(0, 12).join(', ')}
              {result.jdMatch.missing.length > 12 ? '…' : ''}
            </p>
          )}
        </div>
      )}

      {result.breakdown && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Score breakdown</h3>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(result.breakdown).map(([key, val]) => (
              <div key={key} className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded-lg">
                <span className="text-gray-600 capitalize">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                <span className={`font-medium ${scoreColor(val.score)}`}>{val.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.goodPractices.length > 0 && (
        <div className="mb-4">
          <h3 className="flex items-center gap-2 font-semibold text-green-700 mb-2">
            <CheckCircle2 className="w-4 h-4" />
            Strengths
          </h3>
          <ul className="space-y-1.5">
            {result.goodPractices.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-green-500 mt-0.5">+</span>
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.detectedIssues.length > 0 && (
        <div className="mb-4">
          <h3 className="flex items-center gap-2 font-semibold text-red-600 mb-2">
            <AlertTriangle className="w-4 h-4" />
            Issues found
          </h3>
          <ul className="space-y-1.5">
            {result.detectedIssues.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-red-500 mt-0.5">-</span>
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.topImprovements.length > 0 && (
        <div className="mb-6">
          <h3 className="flex items-center gap-2 font-semibold text-[#006a65] mb-2">
            <Target className="w-4 h-4" />
            Top improvements
          </h3>
          <ul className="space-y-1.5">
            {result.topImprovements.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-[#006a65] mt-0.5">*</span>
                {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-3">
        <a
          href="/login?next=%2Fats-checker"
          className="w-full py-3 bg-gradient-to-r from-[#006a65] to-[#2cc9c0] text-white font-semibold rounded-xl hover:opacity-90 transition flex items-center justify-center gap-2"
        >
          Sign in to open Fix Studio
        </a>
        <p className="text-center text-xs text-gray-500">
          Free score here. Sign in to apply AI rewrites with live re-score.
        </p>
        <button
          onClick={copyResults}
          className="w-full py-2.5 border rounded-lg text-sm font-medium hover:bg-gray-50 transition flex items-center justify-center gap-2"
        >
          {copied ? (
            <>
              <Check className="w-4 h-4 text-green-500" /> Copied!
            </>
          ) : (
            <>
              <Copy className="w-4 h-4" /> Copy results
            </>
          )}
        </button>
      </div>
    </div>
  );
}
