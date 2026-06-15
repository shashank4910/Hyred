'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  images?: string[];
  model?: string;
};

// ─── Markdown renderer (lightweight, for debugging messages) ─────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render AI markdown to safe HTML. Strategy:
 * 1. Escape ALL HTML entities first (prevent XSS — raw HTML from AI becomes visible text)
 * 2. Then apply markdown regex transforms to produce safe semantic HTML
 * 3. Code block content inside ``` is NOT double-escaped (already escaped in step 1)
 */
function renderMarkdown(text: string): string {
  // Step 1: protect code block content from escaping — extract and reinsert later
  const codeBlocks: string[] = [];
  const textWithoutCode = text.replace(/```[\s\S]*?```/g, (match) => {
    codeBlocks.push(match);
    return `\x00CODEBLOCK${codeBlocks.length - 1}\x00`;
  });

  // Step 2: escape HTML in everything that isn't a code block
  const escaped = escapeHtml(textWithoutCode);

  // Step 3: restore code blocks (their content stays raw — already markdown-escaped)
  const withCode = escaped.replace(/\x00CODEBLOCK(\d+)\x00/g, (_, idx) => {
    const raw = codeBlocks[parseInt(idx)];
    const langMatch = raw.match(/^```(\w*)\n?([\s\S]*?)```$/);
    const lang = langMatch?.[1] || '';
    const code = langMatch?.[2]?.trim() || '';
    // Inside <pre><code>, only & needs escaping (already done above for the whole block,
    // but the placeholder replacement would have double-escaped it). We use the ORIGINAL
    // raw code content here, escaped just for & to prevent HTML parsing issues.
    const safeCode = code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<pre${lang ? ` class="lang-${escapeHtml(lang)}"` : ''}><code>${safeCode}</code></pre>`;
  });

  // Step 4: apply markdown transforms on the escaped text
  let html = withCode
    // Inline code (`...`)
    .replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`)
    // Bold (**...**)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Lists (- item)
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')
    // Numbered lists (1. item)
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    .replace(/(?:<li>.*<\/li>\n?)+/g, (match) => {
      if (match.includes('<ul>')) return match;
      return '<ol>' + match + '</ol>';
    })
    // Paragraph breaks (double newline)
    .replace(/\n\n/g, '</p><p>')
    // Single newlines within a paragraph
    .replace(/\n/g, '<br/>');

  if (!html.startsWith('<pre') && !html.startsWith('<ul') && !html.startsWith('<ol') && !html.startsWith('<p>')) {
    html = '<p>' + html + '</p>';
  }

  return html;
}

// ─── Main component ─────────────────────────────────────────────────────────

export default function DebugChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text:
        '## Hyred Debug Console\n\n' +
        'Paste screenshots or describe what you see. I can help debug:\n\n' +
        '- **Dashboard** — scan results, match counts, errors\n' +
        '- **Ingest pipeline** — job fetching, embedding, scoring\n' +
        '- **Network errors** — API failures, console errors\n' +
        '- **UI issues** — rendering, layout, state bugs\n\n' +
        'Paste an image with `Ctrl+V` or click the 📎 button to upload a screenshot.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [pendingImages, setPendingImages] = useState<string[]>([]);
  const [model, setModel] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px';
    }
  }, [input]);

  // ── Send message ──────────────────────────────────────────────────────────

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    const images = [...pendingImages];
    if (!text && !images.length) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      images: images.length > 0 ? images : undefined,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setPendingImages([]);
    setLoading(true);

    // Build context from previous messages
    const apiMessages = [
      ...messages
        .filter((m) => m.id !== 'welcome')
        .map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.text,
          images: m.images,
        })),
      { role: 'user' as const, content: text, images: images.length > 0 ? images : undefined },
    ];

    try {
      const res = await fetch('/api/debug-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: data.content || '_(no response)_',
        model: data.model,
      };
      setMessages((prev) => [...prev, assistantMsg]);
      if (data.model) setModel(data.model);
    } catch (e) {
      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: `**Error:** ${(e as Error).message}\n\nCheck the provider API keys or try again.`,
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setLoading(false);
    }
  }, [input, pendingImages, messages]);

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Ignore Enter during IME composition (Chinese/Japanese input)
    if ((e.nativeEvent as KeyboardEvent).isComposing) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Image handling ────────────────────────────────────────────────────────

  const addImage = useCallback((file: File) => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Only image files are supported.');
      return;
    }
    // Validate size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert('Image too large. Max 10MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setPendingImages((prev) => [...prev, dataUrl]);
    };
    reader.readAsDataURL(file);
  }, []);

  const removeImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // ── Paste handler (images + text) ─────────────────────────────────────────

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      // Capture text content first
      const pastedText = e.clipboardData?.getData('text') || '';

      // Capture images
      let hasImage = false;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          hasImage = true;
          const file = item.getAsFile();
          if (file) addImage(file);
        }
      }

      // If images were pasted AND there's text, prepend the text to input
      // (preventDefault was called for images so text won't auto-insert)
      if (hasImage && pastedText) {
        setInput((prev) => prev + pastedText);
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [addImage]);

  // ── Drag & drop ───────────────────────────────────────────────────────────

  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    files.forEach(addImage);
  };

  // ── Copy message ──────────────────────────────────────────────────────────

  const copyMessage = useCallback((text: string) => {
    navigator.clipboard.writeText(text);
  }, []);

  // ── Clear chat ────────────────────────────────────────────────────────────

  const clearChat = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        text:
          '## Hyred Debug Console\n\n' +
          'Chat cleared. Paste a screenshot or describe what you need help with.',
      },
    ]);
    setModel(null);
  };

  // ── New scan helper ───────────────────────────────────────────────────────

  const triggerScan = async () => {
    const scanMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      text: 'Run a manual scan now and show me what happens on the Stats page',
    };
    setMessages((prev) => [...prev, scanMsg]);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="min-h-screen bg-background flex flex-col"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* ── Drag overlay ── */}
      {isDragging && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-primary/5 backdrop-blur-sm">
          <div className="rounded-3xl border-2 border-dashed border-primary bg-white p-12 text-center shadow-elevated">
            <div className="text-4xl mb-3">📸</div>
            <p className="text-headline-md font-semibold text-primary">Drop screenshot here</p>
            <p className="text-body-md text-text-muted mt-1">Paste with Ctrl+V anytime</p>
          </div>
        </div>
      )}

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 border-b border-outline-variant/50 bg-surface-container-lowest/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl teal-gradient text-on-primary shadow-primary-glow">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div>
              <h1 className="text-body-lg font-bold text-on-surface">Debug Console</h1>
              {model && (
                <p className="text-label-md text-text-muted">Using {model}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={triggerScan} className="btn text-xs gap-1" title="Run a manual scan">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
              </svg>
              Scan
            </button>
            <button onClick={clearChat} className="btn-ghost text-xs text-text-muted hover:text-error">
              Clear
            </button>
          </div>
        </div>
      </header>

      {/* ── Messages ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6 space-y-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in`}
            >
              <div
                className={`group max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'teal-gradient text-on-primary shadow-primary-glow'
                    : 'glass-card border border-outline-variant/30'
                }`}
              >
                {/* Images */}
                {msg.images && msg.images.length > 0 && (
                  <div className={`flex flex-wrap gap-2 mb-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                    {msg.images.map((img, i) => (
                      <div
                        key={i}
                        className="relative overflow-hidden rounded-xl border border-white/20"
                        style={{ width: 120, height: 90 }}
                      >
                        <img
                          src={img}
                          alt={`Screenshot ${i + 1}`}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Text */}
                {msg.role === 'assistant' ? (
                  <div
                    className="prose-sm text-on-surface leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0 [&_pre]:bg-surface-container [&_pre]:p-3 [&_pre]:rounded-xl [&_pre]:overflow-x-auto [&_pre]:text-xs [&_pre]:font-mono [&_pre]:my-2 [&_code]:bg-surface-container [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded-md [&_code]:text-xs [&_code]:font-mono [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_li]:text-on-surface-variant [&_strong]:font-semibold [&_strong]:text-on-surface"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
                  />
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                )}

                {/* Copy button (assistant only) */}
                {msg.role === 'assistant' && msg.text && (
                  <button
                    onClick={() => copyMessage(msg.text)}
                    className="mt-2 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity text-xs text-text-muted hover:text-primary flex items-center gap-1"
                    title="Copy message"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                    Copy
                  </button>
                )}
              </div>
            </div>
          ))}

          {/* ── Loading indicator ── */}
          {loading && (
            <div className="flex justify-start animate-fade-in">
              <div className="glass-card border border-outline-variant/30 rounded-2xl px-5 py-4">
                <div className="flex items-center gap-2">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 rounded-full bg-primary/40 animate-pulse-dot" style={{ animationDelay: '0ms' }} />
                    <span className="w-2 h-2 rounded-full bg-primary/40 animate-pulse-dot" style={{ animationDelay: '300ms' }} />
                    <span className="w-2 h-2 rounded-full bg-primary/40 animate-pulse-dot" style={{ animationDelay: '600ms' }} />
                  </div>
                  <span className="text-sm text-text-muted">Thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Image previews ── */}
      {pendingImages.length > 0 && (
        <div className="border-t border-outline-variant/50 bg-surface-container-lowest">
          <div className="mx-auto max-w-3xl px-4 py-2">
            <div className="flex flex-wrap gap-2">
              {pendingImages.map((img, i) => (
                <div key={i} className="relative group" style={{ width: 80, height: 60 }}>
                  <img
                    src={img}
                    alt={`Attachment ${i + 1}`}
                    className="w-full h-full object-cover rounded-lg border border-outline-variant/50"
                  />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-error text-on-primary text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-card"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Input area ── */}
      <div className="border-t border-outline-variant/50 bg-surface-container-lowest">
        <div className="mx-auto max-w-3xl px-4 py-3">
          <div className="flex items-end gap-2 glass-card border border-outline-variant/30 rounded-2xl px-3 py-2">
            {/* Attach button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex-shrink-0 p-2 rounded-xl text-text-muted hover:text-primary hover:bg-surface-container transition-colors"
              title="Attach screenshot (Ctrl+V also works)"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                files.forEach(addImage);
                e.target.value = '';
              }}
            />

            {/* Text input */}
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Describe what you see or paste a screenshot (Ctrl+V)..."
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-on-surface placeholder:text-text-muted outline-none max-h-[200px] py-1.5"
              disabled={loading}
            />

            {/* Send button */}
            <button
              onClick={sendMessage}
              disabled={loading || (!input.trim() && !pendingImages.length)}
              className="flex-shrink-0 p-2 rounded-xl teal-gradient text-on-primary disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 transition-all shadow-primary-glow"
              title="Send message"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          <p className="text-label-md text-text-muted text-center mt-2">
            Paste screenshots with <kbd className="bg-surface-container px-1.5 py-0.5 rounded-md font-mono text-xs">Ctrl+V</kbd> ·
            Powered by <span className="font-medium">gpt-4o-mini</span> vision
          </p>
        </div>
      </div>
    </div>
  );
}
