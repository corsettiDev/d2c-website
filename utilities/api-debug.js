(function () {
  /*
   * ------------------------------------------------------------
   *  API debug panel (QA aid)
   * ------------------------------------------------------------
   *
   *  Renders a "QA only" panel below the quote results showing, per
   *  page load, every call the results scripts made to the midtier
   *  (what was sent, what came back, status, timing) plus the stored
   *  form data the call was built from.
   *
   *  The recording itself lives in the results scripts (dpr-results.js,
   *  plan-card-display.js, group-conversion-results.js): they wrap
   *  window.fetch for midtier calls, append entries to
   *  sessionStorage['gs_api_debug_log'] and dispatch a 'gs-api-debug'
   *  event. This file only reads that log and draws it, so it can load
   *  late without missing calls.
   *
   *  Enable:  ?debug=api on any page (sticky for the tab)
   *           or data-api-debug="true" on the script loader embed.
   *  Disable: ?debug=off
   *
   *  Mount point: [data-api-debug-mount] if the page has one, otherwise
   *  right after the section that holds the first [dpr-results-plan],
   *  otherwise the end of <main> (pages without plan cards, e.g. the
   *  brochure request form and its thank-you page).
   * ------------------------------------------------------------
   */

  if (window.__gsApiDebugPanel) return;
  window.__gsApiDebugPanel = true;

  const LOG_KEY = 'gs_api_debug_log';
  const me = document.currentScript;
  const currentPageLoadId = Number(me && me.dataset.pageLoadId) || null;
  const apiUrl = (me && me.dataset.apiUrl) || '';

  // ------------------------------------------------------------
  // Data access
  // ------------------------------------------------------------

  function readJson(storage, key) {
    try {
      const raw = storage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function readLog() {
    const log = readJson(sessionStorage, LOG_KEY);
    return Array.isArray(log) ? log : [];
  }

  function clearLog() {
    try { sessionStorage.removeItem(LOG_KEY); } catch (e) {}
  }

  // Newest page load first, entries inside a page load in call order
  function groupByPageLoad(log) {
    const groups = new Map();
    log.forEach((entry) => {
      const key = String(entry.id);
      if (!groups.has(key)) {
        groups.set(key, { id: entry.id, path: entry.path, script: entry.script, entries: [] });
      }
      groups.get(key).entries.push(entry);
    });
    return Array.from(groups.values()).sort((a, b) => b.id - a.id);
  }

  // ------------------------------------------------------------
  // Rendering
  // ------------------------------------------------------------

  function esc(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function pretty(value) {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'string') return value;
    try { return JSON.stringify(value, null, 2); } catch (e) { return String(value); }
  }

  function time(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleTimeString();
  }

  function pathOf(url) {
    try { return new URL(url).pathname; } catch (e) { return url; }
  }

  function statusClass(entry) {
    if (entry.error) return 'is-error';
    if (entry.status >= 200 && entry.status < 300) return 'is-ok';
    return 'is-error';
  }

  function renderEntry(entry) {
    const status = entry.error ? 'network error' : entry.status;
    return `
      <details class="gs-api-debug_call ${statusClass(entry)}" open>
        <summary>
          <span class="gs-api-debug_method">${esc(entry.method)}</span>
          <span class="gs-api-debug_path">${esc(pathOf(entry.url))}</span>
          <span class="gs-api-debug_status">${esc(status)}</span>
          <span class="gs-api-debug_meta">${esc(entry.ms != null ? entry.ms + ' ms' : '')} · ${esc(time(entry.at))}</span>
        </summary>
        <div class="gs-api-debug_cols">
          <div>
            <div class="gs-api-debug_label">Sent</div>
            <pre>${esc(entry.url)}\n\n${esc(pretty(entry.request))}</pre>
          </div>
          <div>
            <div class="gs-api-debug_label">Received</div>
            <pre>${esc(entry.error ? entry.error : pretty(entry.response))}</pre>
          </div>
        </div>
      </details>`;
  }

  function renderGroup(group) {
    const isCurrent = group.id === currentPageLoadId;
    const label = isCurrent ? 'This page load' : 'Earlier page load';
    return `
      <details class="gs-api-debug_pageload ${isCurrent ? 'is-current' : ''}" ${isCurrent ? 'open' : ''}>
        <summary>
          <span class="gs-api-debug_pill">${label}</span>
          <span class="gs-api-debug_path">${esc(group.path)}</span>
          <span class="gs-api-debug_meta">${esc(group.script || '')} · ${esc(time(group.id))} · ${group.entries.length} call${group.entries.length === 1 ? '' : 's'}</span>
        </summary>
        ${group.entries.map(renderEntry).join('')}
      </details>`;
  }

  function renderInputs() {
    const local = readJson(localStorage, 'dpr_local_data');
    const session = readJson(sessionStorage, 'dpr_session_data');
    const attribution = readJson(localStorage, 'visitor_attribution');
    return `
      <details class="gs-api-debug_inputs">
        <summary>
          <span class="gs-api-debug_pill">Stored inputs</span>
          <span class="gs-api-debug_meta">what the quote form saved (the request above is built from these)</span>
        </summary>
        <div class="gs-api-debug_cols gs-api-debug_cols-3">
          <div><div class="gs-api-debug_label">localStorage · dpr_local_data</div><pre>${esc(pretty(local))}</pre></div>
          <div><div class="gs-api-debug_label">sessionStorage · dpr_session_data</div><pre>${esc(pretty(session))}</pre></div>
          <div><div class="gs-api-debug_label">localStorage · visitor_attribution</div><pre>${esc(pretty(attribution))}</pre></div>
        </div>
      </details>`;
  }

  function render(panel) {
    const log = readLog();
    const groups = groupByPageLoad(log);
    const thisLoad = groups.filter((g) => g.id === currentPageLoadId);
    const earlier = groups.filter((g) => g.id !== currentPageLoadId);

    panel.innerHTML = `
      <div class="gs-api-debug_head">
        <div>
          <strong>API debug</strong> <span class="gs-api-debug_pill is-warn">QA only</span>
          <div class="gs-api-debug_meta">${esc(apiUrl)} · ${log.length} call${log.length === 1 ? '' : 's'} in this tab · add <code>?debug=off</code> to the URL to hide</div>
        </div>
        <button type="button" class="gs-api-debug_clear">Clear log</button>
      </div>
      ${thisLoad.length ? thisLoad.map(renderGroup).join('') : '<div class="gs-api-debug_empty">No API calls on this page load yet.</div>'}
      ${renderInputs()}
      ${earlier.length ? '<div class="gs-api-debug_label">Earlier page loads in this tab</div>' + earlier.map(renderGroup).join('') : ''}
    `;

    panel.querySelector('.gs-api-debug_clear').addEventListener('click', () => {
      clearLog();
      render(panel);
    });
  }

  function injectStyles() {
    if (document.getElementById('gs-api-debug-styles')) return;
    const style = document.createElement('style');
    style.id = 'gs-api-debug-styles';
    style.textContent = `
      .gs-api-debug { box-sizing: border-box; max-width: 1200px; margin: 40px auto; padding: 16px 20px; font: 13px/1.45 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #1f2a2a; background: #fffbea; border: 2px dashed #c9a227; border-radius: 12px; }
      .gs-api-debug * { box-sizing: border-box; }
      .gs-api-debug code { font: inherit; background: #f3ecc8; padding: 0 4px; border-radius: 4px; }
      .gs-api-debug_head { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; margin-bottom: 12px; }
      .gs-api-debug_head strong { font-size: 15px; }
      .gs-api-debug_clear { font: inherit; padding: 6px 12px; border: 1px solid #c9a227; border-radius: 6px; background: #fff; cursor: pointer; }
      .gs-api-debug_meta { color: #5c6666; font-size: 12px; }
      .gs-api-debug_label { color: #5c6666; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; margin: 12px 0 4px; }
      .gs-api-debug_pill { display: inline-block; padding: 1px 8px; border-radius: 999px; background: #e3edf2; color: #09709c; font-size: 11px; font-weight: 600; margin-right: 6px; }
      .gs-api-debug_pill.is-warn { background: #c9a227; color: #fff; }
      .gs-api-debug details { margin: 8px 0; border: 1px solid #e3d9a8; border-radius: 8px; background: #fff; }
      .gs-api-debug summary { cursor: pointer; padding: 8px 12px; display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
      .gs-api-debug_pageload.is-current { border-color: #09709c; }
      .gs-api-debug_pageload > details { margin: 8px 12px; }
      .gs-api-debug_method { font-weight: 700; }
      .gs-api-debug_path { word-break: break-all; }
      .gs-api-debug_status { padding: 0 8px; border-radius: 999px; font-weight: 600; }
      .gs-api-debug_call.is-ok .gs-api-debug_status { background: #dff3e4; color: #17633a; }
      .gs-api-debug_call.is-error .gs-api-debug_status { background: #fde2e2; color: #9b1c1c; }
      .gs-api-debug_cols { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 0 12px 12px; }
      .gs-api-debug_cols-3 { grid-template-columns: 1fr 1fr 1fr; }
      .gs-api-debug pre { margin: 0; padding: 10px; max-height: 420px; overflow: auto; white-space: pre-wrap; word-break: break-word; background: #f7f7f2; border-radius: 6px; font-size: 12px; }
      .gs-api-debug_empty { padding: 12px; color: #5c6666; }
      @media (max-width: 767px) { .gs-api-debug_cols, .gs-api-debug_cols-3 { grid-template-columns: 1fr; } }
    `;
    document.head.appendChild(style);
  }

  function mount() {
    injectStyles();
    const panel = document.createElement('section');
    panel.className = 'gs-api-debug';
    panel.setAttribute('data-api-debug-panel', '');

    const explicit = document.querySelector('[data-api-debug-mount]');
    const firstPlan = document.querySelector('[dpr-results-plan]');
    const resultsSection = firstPlan && (firstPlan.closest('section') || firstPlan.parentElement);

    const main = document.querySelector('main');

    if (explicit) {
      explicit.appendChild(panel);
    } else if (resultsSection && resultsSection.parentElement) {
      resultsSection.insertAdjacentElement('afterend', panel);
    } else if (main) {
      main.appendChild(panel);
    } else {
      document.body.appendChild(panel);
    }

    render(panel);
    document.addEventListener('gs-api-debug', () => render(panel));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
