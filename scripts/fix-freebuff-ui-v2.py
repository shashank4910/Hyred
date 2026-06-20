"""Apply two targeted fixes to freebuff-web-ui app.js:
1. Cap rawTerminalBuf at 500k chars to prevent unbounded growth
2. Reset rafPending in finalizeResponse() to prevent stale rAF race
"""
import os

APP_PATH = r'C:\Users\Admin\Projects\freebuff-web-ui\public\app.js'

with open(APP_PATH, 'r', encoding='utf-8') as f:
    js = f.read()

# Fix 1: Add buffer cap in scheduleFlush (before requestAnimationFrame)
old_schedule = """function scheduleFlush() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(function() {
    rafPending = false;
    flushRender();
  });
}"""

new_schedule = """function scheduleFlush() {
  if (rafPending) return;
  // Cap raw buffer at 500k chars to prevent unbounded memory growth
  if (rawTerminalBuf.length > 500000) {
    rawTerminalBuf = rawTerminalBuf.slice(-500000);
  }
  rafPending = true;
  requestAnimationFrame(function() {
    rafPending = false;
    flushRender();
  });
}"""

js = js.replace(old_schedule, new_schedule)

# Fix 2: Reset rafPending in finalizeResponse to prevent stale rAF race
old_finalize = """function finalizeResponse() {
  if (responseBodyEl) {
    flushRender();
  }
  responseRow = null;
  responseBodyEl = null;
  rawTerminalBuf = '';
  isProcessing = false;
  setAgentStatus('Ready', false);
}"""

new_finalize = """function finalizeResponse() {
  // Cancel any pending rAF to prevent stale render after buffer is cleared
  rafPending = false;
  if (responseBodyEl) {
    flushRender();
  }
  responseRow = null;
  responseBodyEl = null;
  rawTerminalBuf = '';
  isProcessing = false;
  setAgentStatus('Ready', false);
}"""

js = js.replace(old_finalize, new_finalize)

with open(APP_PATH, 'w', encoding='utf-8') as f:
    f.write(js)

print('[OK] app.js -- buffer cap + rafPending reset applied')
