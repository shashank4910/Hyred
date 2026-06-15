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
} from 'lucide-react';
import type { AtsCheckResult } from '@/lib/ats-checker';

export function AtsCheckerWidget() {
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jdText, setJdText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AtsCheckResult | null>(null);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'application/pdf' || file.name.endsWith('.docx'))) {
      setResumeFile(file);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setResumeFile(file);
  };

  const runCheck = async () => {
    if (!resumeFile) return;
    setLoading(true);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('resume', resumeFile);
      if (jdText.trim()) {
        formData.append('job_description', jdText.trim());
      }

      const res = await fetch('/api/ats-checker', { method: 'POST', body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Check failed (${res.status})`);
      }
      setResult(await res.json());
    } catch (e) {
      alert((e as Error).message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const copyResults = () => {
    if (!result) return;
    const text = [
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
    ].join('\n');
    navigator.clipboard.writeText(text);
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
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-[#006a65] hover:bg-[#f9f9ff] transition mb-6"
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx"
            onChange={handleFileChange}
            className="hidden"
          />
          {resumeFile ? (
            <div className="flex items-center justify-center gap-3">
              <FileText className="w-8 h-8 text-[#006a65]" />
              <div className="text-left">
                <p className="font-medium text-gray-900">{resumeFile.name}</p>
                <p className="text-sm text-gray-500">
                  {(resumeFile.size / 1024).toFixed(0)} KB - Click to change
                </p>
              </div>
            </div>
          ) : (
            <>
              <Upload className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="font-medium text-gray-700 mb-1">
                Drop your resume here or click to browse
              </p>
              <p className="text-sm text-gray-400">PDF or DOCX, max 10MB</p>
            </>
          )}
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            <Search className="w-4 h-4 inline mr-1" />
            Job Description (optional)
          </label>
          <textarea
            value={jdText}
            onChange={(e) => setJdText(e.target.value)}
            placeholder="Paste a job description for targeted ATS scoring..."
            rows={4}
            className="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#006a65]/30 resize-none"
          />
        </div>

        <button
          onClick={runCheck}
          disabled={loading || !resumeFile}
          className="w-full py-3 bg-gradient-to-r from-[#006a65] to-[#2cc9c0] text-white font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Analyzing Resume...
            </>
          ) : (
            <>
              <BarChart3 className="w-5 h-5" />
              Check My Resume Score
            </>
          )}
        </button>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl border p-6 sm:p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-900">Your ATS Score</h2>
        <button
          onClick={() => { setResult(null); setResumeFile(null); setJdText(''); }}
          className="text-sm text-[#006a65] hover:underline"
        >
          Check Another
        </button>
      </div>

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
      </div>

      {/* Breakdown */}
      {result.breakdown && (
        <div className="mb-6">
          <h3 className="font-semibold text-gray-900 mb-3">Score Breakdown</h3>
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
                <span className="text-green-500 mt-0.5">+</span>{s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.detectedIssues.length > 0 && (
        <div className="mb-4">
          <h3 className="flex items-center gap-2 font-semibold text-red-600 mb-2">
            <AlertTriangle className="w-4 h-4" />
            Issues Found
          </h3>
          <ul className="space-y-1.5">
            {result.detectedIssues.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-red-500 mt-0.5">-</span>{w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.topImprovements.length > 0 && (
        <div className="mb-6">
          <h3 className="flex items-center gap-2 font-semibold text-[#006a65] mb-2">
            <Target className="w-4 h-4" />
            Top Improvements
          </h3>
          <ul className="space-y-1.5">
            {result.topImprovements.map((r, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                <span className="text-[#006a65] mt-0.5">*</span>{r}
              </li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={copyResults}
        className="w-full py-2.5 border rounded-lg text-sm font-medium hover:bg-gray-50 transition flex items-center justify-center gap-2"
      >
        {copied ? <><Check className="w-4 h-4 text-green-500" /> Copied!</> : <><Copy className="w-4 h-4" /> Copy Results</>}
      </button>
    </div>
  );
}
