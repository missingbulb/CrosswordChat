// Side panel: the "brain + voice". Boots the orchestrator with real ports and a
// message-based page client; renders captions (REQ-SPCH-007/008).

import { MSG } from '../shared/messages.js';
import { createOrchestrator } from '../app/orchestrator.js';
import { createTtsPort } from '../speech/tts-port.js';
import { createSttPort } from '../speech/stt-port.js';

const captionsEl = document.getElementById('captions');
const statusDot = document.getElementById('status-dot');
const probeBtn = document.getElementById('probe-btn');
const stopBtn = document.getElementById('stop-btn');
const probeReport = document.getElementById('probe-report');

function caption(role, text) {
  if (!text) return;
  const p = document.createElement('p');
  p.className = `caption ${role}`;
  p.textContent = role === 'heard' ? `Heard: “${text}”` : text;
  captionsEl.append(p);
  captionsEl.scrollTop = captionsEl.scrollHeight;
}

function createPageClient(tabId) {
  const send = (payload) => chrome.tabs.sendMessage(tabId, payload).then((res) => {
    if (res === undefined) throw new Error('no receiver');
    return res;
  });
  let onEvent = null;
  chrome.runtime.onMessage.addListener((msg, sender) => {
    if (msg?.type === MSG.PAGE_EVENT && sender.tab?.id === tabId) {
      onEvent?.(msg.kind, msg.snapshot);
    }
  });
  return {
    snapshot: () => send({ type: MSG.SNAPSHOT }),
    enterAnswer: (cells) => send({ type: MSG.ENTER, cells }),
    selectClue: (clueId) => send({ type: MSG.SELECT, clueId }),
    clearEntry: (cellIndices) => send({ type: MSG.CLEAR, cellIndices }),
    probe: () => send({ type: MSG.PROBE }),
    watch: (cb) => {
      onEvent = cb;
      return send({ type: MSG.WATCH });
    },
    unwatch: () => {
      onEvent = null;
      return send({ type: MSG.UNWATCH }).catch(() => {});
    },
    // Watch pausing happens content-side around writes; panel-side hooks are no-ops.
    pauseWatch: () => {},
    resumeWatch: () => {},
  };
}

async function boot() {
  const port = chrome.runtime.connect({ name: MSG.PANEL_PORT });
  const tabId = await new Promise((resolve) => {
    port.onMessage.addListener((msg) => {
      if (msg?.type === MSG.TAB) resolve(msg.tabId);
    });
    port.postMessage({ type: MSG.HELLO });
  });

  const tts = createTtsPort();
  const stt = createSttPort();
  const pageClient = createPageClient(tabId);

  const orchestrator = createOrchestrator({
    tts,
    stt,
    pageClient,
    ui: {
      caption,
      listening: (on) => {
        statusDot.classList.toggle('listening', on);
        statusDot.title = on ? 'listening' : 'idle';
      },
    },
    onEnd: () => {
      caption('note', 'Session ended.');
      try {
        port.disconnect();
      } catch { /* already gone */ }
      setTimeout(() => window.close(), 400);
    },
  });

  port.onMessage.addListener((msg) => {
    if (msg?.type === MSG.CLOSE) orchestrator.stop(); // icon toggle / takeover / tab gone
  });
  stopBtn.addEventListener('click', () => orchestrator.stop());
  probeBtn.addEventListener('click', async () => {
    probeReport.hidden = false;
    probeReport.textContent = 'Probing…';
    try {
      const report = await pageClient.probe();
      probeReport.textContent = '';
      for (const item of report.items) {
        const row = document.createElement('div');
        row.className = item.ok ? 'ok' : 'fail';
        row.textContent = `${item.ok ? '✅' : '❌'} ${item.name} — ${item.detail}`;
        probeReport.append(row);
      }
    } catch {
      probeReport.textContent = '❌ No content script on this tab (is it a crossword page? try reloading it).';
    }
  });

  // Surface the mic prompt at a sane moment (REQ-SPCH-003); recognition errors
  // still flow through the machine if the user denies here.
  await stt.ensureMicPermission();
  await orchestrator.start();
}

boot();
