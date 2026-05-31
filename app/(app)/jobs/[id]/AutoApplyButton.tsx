'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Rocket, Loader2, CheckCircle2, XCircle, ChevronDown, ChevronUp, Zap,
} from 'lucide-react';

type ApplyStatus = 'idle' | 'starting' | 'running' | 'done' | 'failed';

interface LogLine { type: 'log' | 'status'; message?: string; status?: string; error?: string }

export function AutoApplyButton({ matchId, agentUrl }: { matchId: string; agentUrl: string | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<ApplyStatus>('idle');
  const [logs, setLogs] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [taskId, setTaskId] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);
  const sseRef = useRef<EventSource | null>(null);

  // Auto-scroll log to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  // Cleanup SSE on unmount
  useEffect(() => () => { sseRef.current?.close(); }, []);

  async function startApply() {
    if (!agentUrl) {
      toast.error('Apply agent not configured. Set APPLY_AGENT_URL in your environment.');
      return;
    }

    setStatus('starting');
    setLogs([]);
    setExpanded(true);

    try {
      const res = await fetch(`/api/match/${matchId}/auto-apply`, { method: 'POST' });
      const data = await res.json();

      if (!res.ok) {
        toast.error(data.error ?? 'Failed to start agent');
        setStatus('failed');
        setLogs([`❌ ${data.error}`]);
        return;
      }

      const { task_id } = data as { task_id: string };
      setTaskId(task_id);
      setStatus('running');
      addLog('🚀 Agent started — connecting to live feed...');

      // Open SSE stream to the Python agent
      const sse = new EventSource(`${agentUrl}/apply/${task_id}`);
      sseRef.current = sse;

      sse.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as LogLine;
          if (payload.type === 'log' && payload.message) {
            addLog(payload.message);
          } else if (payload.type === 'status') {
            if (payload.status === 'done') {
              setStatus('done');
              addLog('🎉 Application submitted successfully!');
              sse.close();
              router.refresh();
            } else if (payload.status === 'failed') {
              setStatus('failed');
              addLog(`❌ ${payload.error ?? 'Unknown error'}`);
              sse.close();
            }
          }
        } catch { /* ignore parse errors */ }
      };

      sse.onerror = () => {
        addLog('⚠️  Connection to agent lost. Check the result after a moment.');
        sse.close();
        // Check result after a delay
        setTimeout(() => pollResult(task_id, agentUrl), 5000);
      };

    } catch (e) {
      setStatus('failed');
      setLogs([`❌ ${(e as Error).message}`]);
    }
  }

  async function pollResult(tid: string, baseUrl: string) {
    try {
      const res = await fetch(`${baseUrl}/apply/${tid}/result`);
      const data = await res.json() as { status: string; error?: string };
      if (data.status === 'done') {
        setStatus('done');
        addLog('🎉 Application submitted successfully!');
        router.refresh();
      } else if (data.status === 'failed') {
        setStatus('failed');
        addLog(`❌ ${data.error ?? 'Application failed'}`);
      }
    } catch { /* ignore */ }
  }

  function addLog(line: string) {
    setLogs(prev => [...prev, line]);
  }

  const isActive = status === 'starting' || status === 'running';
  const isDone = status === 'done';
  const isFailed = status === 'failed';
  const hasActivity = logs.length > 0;

  return (
    <div className="space-y-2">
      {/* Main button */}
      <button
        onClick={startApply}
        disabled={isActive || isDone}
        className={[
          'w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all',
          isDone
            ? 'bg-emerald-500 text-white cursor-default'
            : isFailed
            ? 'bg-red-500 text-white hover:bg-red-600'
            : isActive
            ? 'teal-gradient opacity-80 text-on-primary cursor-wait'
            : 'teal-gradient text-on-primary hover:opacity-90 shadow-primary-glow',
        ].join(' ')}
      >
        {isActive ? (
          <><Loader2 className="h-4 w-4 animate-spin" /> Applying...</>
        ) : isDone ? (
          <><CheckCircle2 className="h-4 w-4" /> Applied!</>
        ) : isFailed ? (
          <><XCircle className="h-4 w-4" /> Retry Auto Apply</>
        ) : (
          <><Zap className="h-4 w-4" /> Auto Apply</>
        )}
      </button>

      {/* Live log panel */}
      {hasActivity && (
        <div className="rounded-2xl border border-outline-variant overflow-hidden">
          {/* Panel header */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center justify-between px-3 py-2 bg-surface-container-low text-xs font-medium text-on-surface-variant hover:text-on-surface transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <Rocket className="h-3 w-3 text-primary" />
              Agent Live Feed
              {isActive && (
                <span className="inline-flex h-1.5 w-1.5 rounded-full bg-primary-container animate-pulse" />
              )}
            </span>
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          {expanded && (
            <div className="max-h-64 overflow-y-auto bg-gray-950 p-3 font-mono text-[11px] leading-relaxed">
              {logs.map((line, i) => (
                <div key={i} className={[
                  'py-0.5',
                  line.startsWith('✅') ? 'text-emerald-400' :
                  line.startsWith('❌') ? 'text-red-400' :
                  line.startsWith('⚠️') ? 'text-yellow-400' :
                  line.startsWith('🎉') ? 'text-emerald-300' :
                  line.startsWith('🚀') || line.startsWith('🌐') || line.startsWith('🤖') ? 'text-amber-300' :
                  'text-gray-300',
                ].join(' ')}>
                  {line}
                </div>
              ))}
              <div ref={logEndRef} />
            </div>
          )}
        </div>
      )}

      {/* Agent not configured warning */}
      {!agentUrl && status === 'idle' && (
        <p className="text-[11px] text-on-surface-variant text-center">
          Deploy the browser agent and set{' '}
          <code className="bg-surface-container-low px-1 rounded text-on-surface">APPLY_AGENT_URL</code>
          {' '}to enable auto-apply.
        </p>
      )}
    </div>
  );
}
