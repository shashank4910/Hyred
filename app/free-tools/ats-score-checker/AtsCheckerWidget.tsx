'use client';

import { useState, useRef, useCallback } from 'react';
import {
  Upload,
  FileText,
  XCircle,
  BarChart3,
  Search,
  BookOpen,
  ClipboardPaste,
} from 'lucide-react';
import { ScanLoader } from '@/app/_components/ScanLoader';
import type { AtsCheckResult } from '@/lib/ats-checker';
import type { AtsReport } from '@/lib/ats-report';
import { ATS_SAMPLE_JD, ATS_SAMPLE_RESUME } from '@/lib/ats-checker-samples';
import { isResumeFilename, RESUME_FILE_ACCEPT } from '@/lib/resume-upload';
import { AtsPublicReport } from './AtsPublicReport';

type InputMode = 'file' | 'paste';

export function AtsCheckerWidget() {
  const [inputMode, setInputMode] = useState<InputMode>('file');
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState('');
  const [jdText, setJdText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AtsCheckResult | null>(null);
  const [serverReport, setServerReport] = useState<AtsReport | null>(null);
  const [resumeText, setResumeText] = useState('');
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
    setServerReport(null);
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
      const data = await res.json();
      const text = typeof data.resume_text === 'string' ? data.resume_text : pasteText.trim();
      setResumeText(text);
      setServerReport(data.report ?? null);
      setResult(data);
    } catch (e) {
      setError((e as Error).message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setServerReport(null);
    setResumeText('');
    setResumeFile(null);
    setPasteText('');
    setJdText('');
    setError(null);
  };

  if (result && resumeText) {
    return (
      <div className="rounded-2xl border bg-white p-4 shadow-xl sm:p-6">
        <AtsPublicReport
          result={result}
          resumeText={resumeText}
          report={serverReport}
          onReset={reset}
        />
      </div>
    );
  }

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
              <ScanLoader size={0.3} />
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

  return null;
}
