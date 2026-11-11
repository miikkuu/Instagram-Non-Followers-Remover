// ==UserScript==
// @name         Instagram Non-Follower Auto-Unfollow Manager
// @namespace    local.instagram.review.manager
// @version      16.0.0
// @description  Compare Instagram exports and auto-unfollow using a highly robust simulated DOM worker tab.
// @match        https://www.instagram.com/*
// @match        https://www.instagram.com
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const APP_ID = 'ig-nonfollower-review-manager-v1';
  const STORAGE_KEY = `${APP_ID}:state`;
  const TARGET_KEY = 'irm_popup_target';
  const RESULT_KEY = 'irm_popup_result';
  const DEFAULT_MIN_SECONDS = 7;
  const DEFAULT_MAX_SECONDS = 11;

  // ==========================================
  // DOM WORKER (THE SIMULATED HUMAN)
  // Uses window.name so IG's React router can't break it
  // ==========================================

  if (window.name === 'ig_worker_tab') {
      console.log("[IRM Worker] Active.");
      let activeWorkerTarget = null;
      const sleep = ms => new Promise(r => setTimeout(r, ms));

      // Uses innerText to ignore hidden screen-reader spans and SVGs
      const findBtn = (texts) => {
          const els = Array.from(document.querySelectorAll('button, [role="button"], a'));
          for (let el of els) {
              const txt = (el.innerText || '').trim().toLowerCase();
              if (texts.includes(txt)) return el;
          }
          return null;
      };

      setInterval(async () => {
          const targetUser = (localStorage.getItem(TARGET_KEY) || '').toLowerCase();
          const currentPath = window.location.pathname.replace(/\//g, '').toLowerCase();

          // Only trigger if we are on the exact profile requested by the orchestrator
          if (targetUser && currentPath === targetUser && activeWorkerTarget !== targetUser) {
              activeWorkerTarget = targetUser;
              console.log(`[IRM Worker] Starting action on @${targetUser}`);

              try {
                  let followStatusBtn = null;
                  let is404 = false;
                  let alreadyUnfollowed = false;

                  // 1. Wait up to 15s for the React profile to render
                  for(let i=0; i<30; i++) {
                      if (document.body.innerText.includes("Sorry, this page isn't available.")) {
                          is404 = true; break;
                      }

                      followStatusBtn = findBtn(['following', 'requested']);
                      if (followStatusBtn) break;

                      if (findBtn(['follow', 'follow back'])) {
                          alreadyUnfollowed = true; break;
                      }
                      await sleep(500);
                  }

                  if (is404) {
                      localStorage.setItem(RESULT_KEY, JSON.stringify({ status: '404', msg: 'Page not found/Deleted' }));
                      return;
                  }

                  if (alreadyUnfollowed) {
                      localStorage.setItem(RESULT_KEY, JSON.stringify({ status: 'ALREADY', msg: 'Already unfollowed' }));
                      return;
                  }

                  if (!followStatusBtn) {
                      localStorage.setItem(RESULT_KEY, JSON.stringify({ status: 'ERROR', msg: 'Following button not found. Is UI in English?' }));
                      return;
                  }

                  // 2. Click "Following"
                  followStatusBtn.click();

                  // 3. Wait for the confirmation modal to appear
                  let unfollowBtn = null;
                  for(let i=0; i<15; i++) {
                      await sleep(500);
                      unfollowBtn = findBtn(['unfollow']);
                      if (unfollowBtn) break;
                  }

                  if (!unfollowBtn) {
                      localStorage.setItem(RESULT_KEY, JSON.stringify({ status: 'ERROR', msg: 'Unfollow confirmation button not found in modal' }));
                      return;
                  }

                  // 4. Click "Unfollow"
                  unfollowBtn.click();

                  // 5. Allow Instagram time to process the network request
                  await sleep(2000);
                  localStorage.setItem(RESULT_KEY, JSON.stringify({ status: 'OK', msg: 'Successfully unfollowed' }));

              } catch (err) {
                  localStorage.setItem(RESULT_KEY, JSON.stringify({ status: 'ERROR', msg: err.message }));
              }
          }
      }, 1000);

      // Stop the UI from loading inside the worker tab
      return;
  }


  // ==========================================
  // MAIN DASHBOARD (ORCHESTRATOR)
  // ==========================================

  if (window.__IG_NONFOLLOWER_REVIEW_MANAGER__) return;
  window.__IG_NONFOLLOWER_REVIEW_MANAGER__ = true;

  const state = {
    followers: new Set(),
    following: new Set(),
    nonFollowers: [],
    selected: new Set(),
    reviewed: new Set(),
    search: '',
    filter: 'all',
    minSeconds: DEFAULT_MIN_SECONDS,
    maxSeconds: DEFAULT_MAX_SECONDS,
    queue: [],
    queueIndex: 0,
    countdown: null,
    countdownTimer: null,
    running: false,
    loaded: false,
    workerTab: null,
    actionInterval: null
  };

  function loadSavedState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      state.selected = new Set(Array.isArray(saved.selected) ? saved.selected : []);
      state.reviewed = new Set(Array.isArray(saved.reviewed) ? saved.reviewed : []);
      state.minSeconds = Number.isFinite(saved.minSeconds) ? saved.minSeconds : DEFAULT_MIN_SECONDS;
      state.maxSeconds = Number.isFinite(saved.maxSeconds) ? saved.maxSeconds : DEFAULT_MAX_SECONDS;
    } catch (error) {}
  }

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        selected: [...state.selected],
        reviewed: [...state.reviewed],
        minSeconds: state.minSeconds,
        maxSeconds: state.maxSeconds
      }));
    } catch (error) {}
  }

  function addLog(message) {
    const logsEl = document.getElementById(`${APP_ID}-logs`);
    if (!logsEl) return;
    const time = new Date().toLocaleTimeString('en-IN', { hour12: false });
    const line = document.createElement('div');
    line.textContent = `[${time}] ${message}`;
    logsEl.appendChild(line);
    logsEl.scrollTop = logsEl.scrollHeight;
  }

  function normalizeUsername(value) {
    if (typeof value !== 'string') return '';
    let username = value.trim();
    if (!username) return '';
    if (/^https?:\/\//i.test(username)) {
      try { username = new URL(username).pathname.split('/').filter(Boolean)[0] || ''; } catch (_) { return ''; }
    }
    username = username.replace(/^@/, '').replace(/\/+$/, '');
    if (username.includes('/')) username = username.split('/')[0];
    return username.toLowerCase();
  }

  function extractUsername(record) {
    if (typeof record === 'string') return normalizeUsername(record);
    if (!record || typeof record !== 'object') return '';
    const dC = [record.username, record.userName, record.value, record.title, record.href, record.url];
    for (let c of dC) { const u = normalizeUsername(c); if (u) return u; }
    const arrs = [record.string_list_data, record.stringListData, record.data];
    for (let a of arrs) {
      if (!Array.isArray(a)) continue;
      for (let i of a) {
        if (!i || typeof i !== 'object') continue;
        for (let c of [i.value, i.href, i.username, i.url]) { const u = normalizeUsername(c); if (u) return u; }
      }
    }
    return '';
  }

  function parseUsernames(data, keys) {
    let records = [];
    if (Array.isArray(data)) records = data;
    else {
      for (const k of keys) { if (Array.isArray(data[k])) { records = data[k]; break; } }
      if (!records.length) {
        for (const v of Object.values(data)) { if (Array.isArray(v) && v.length && typeof v[0] === 'object') { records = v; break; } }
      }
    }
    const result = new Set();
    for (const r of records) { const u = extractUsername(r); if (u) result.add(u); }
    return result;
  }

  async function readJsonFile(file) {
    if (!file) throw new Error('Please choose a JSON file.');
    return JSON.parse(await file.text());
  }

  async function importExports() {
    const followersFile = document.getElementById(`${APP_ID}-followers-file`).files[0];
    const followingFile = document.getElementById(`${APP_ID}-following-file`).files[0];
    const status = document.getElementById(`${APP_ID}-import-status`);
    try {
      if (!followersFile || !followingFile) throw new Error('Choose both followers.json and following.json.');

      const [fJson, flJson] = await Promise.all([readJsonFile(followersFile), readJsonFile(followingFile)]);
      state.followers = parseUsernames(fJson, ['relationships_followers', 'followers']);
      state.following = parseUsernames(flJson, ['relationships_following', 'following']);

      state.nonFollowers = [...state.following].filter(u => !state.followers.has(u)).sort((a,b)=>a.localeCompare(b));
      const available = new Set(state.nonFollowers);

      state.selected = new Set([...state.selected].filter(u => available.has(u)));
      state.reviewed = new Set([...state.reviewed].filter(u => available.has(u)));
      state.loaded = true;

      saveState(); render();
      status.textContent = `Loaded ${state.followers.size} followers and ${state.following.size} following. ${state.nonFollowers.length} non-followers identified.`;
      status.className = 'irm-status success';
      addLog(`Import complete. Identified ${state.nonFollowers.length} accounts to review.`);
    } catch (e) {
      status.textContent = e.message;
      status.className = 'irm-status error';
    }
  }

  function getVisibleAccounts() {
    const q = state.search.trim().toLowerCase();
    return state.nonFollowers.filter(u => {
      if (q && !u.includes(q)) return false;
      if (state.filter === 'selected' && !state.selected.has(u)) return false;
      if (state.filter === 'excluded' && state.selected.has(u)) return false;
      if (state.filter === 'pending' && state.reviewed.has(u)) return false;
      if (state.filter === 'reviewed' && !state.reviewed.has(u)) return false;
      return true;
    });
  }

  function escapeHtml(v) { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]); }

  function setSelection(u, c) { c ? state.selected.add(u) : state.selected.delete(u); saveState(); renderList(); updateCounts(); }

  function bulkSelect(m) {
    const vis = getVisibleAccounts();
    if (m==='all') state.nonFollowers.forEach(u=>state.selected.add(u));
    if (m==='none') state.selected.clear();
    if (m==='visible') vis.forEach(u=>state.selected.add(u));
    if (m==='unvisible') vis.forEach(u=>state.selected.delete(u));
    if (m==='invert') {
      vis.forEach(u=>state.selected.has(u) ? state.selected.delete(u) : state.selected.add(u));
    }
    saveState(); renderList(); updateCounts();
  }

  function updateCounts() {
    const sEl = document.getElementById(`${APP_ID}-selected-count`);
    const smEl = document.getElementById(`${APP_ID}-summary`);
    if (sEl) sEl.textContent = `Selected: ${state.selected.size} / ${state.nonFollowers.length}`;
    if (smEl) smEl.textContent = `${state.followers.size} followers · ${state.following.size} following · ${state.nonFollowers.length} non-followers · ${state.reviewed.size} unfollowed`;
  }

  function renderList() {
    const list = document.getElementById(`${APP_ID}-list`);
    if (!list) return;
    const vis = getVisibleAccounts();

    if (!state.loaded) { list.innerHTML = '<div class="irm-empty">Import both JSON files to begin.</div>'; return; }
    if (!vis.length) { list.innerHTML = '<div class="irm-empty">No accounts match this filter.</div>'; return; }

    const frag = document.createDocumentFragment();
    vis.forEach(u => {
      const r = document.createElement('div'); r.className = 'irm-account';
      const chk = state.selected.has(u); const rev = state.reviewed.has(u);

      r.innerHTML = `
        <label class="irm-check-label"><input type="checkbox" class="irm-account-check" data-username="${escapeHtml(u)}" ${chk?'checked':''}></label>
        <a class="irm-username" href="https://www.instagram.com/${encodeURIComponent(u)}/" target="_blank">@${escapeHtml(u)}</a>
        <span class="irm-state ${rev?'done':''}">${rev?'Unfollowed':'Pending'}</span>
        <button class="irm-small-btn irm-open" data-username="${escapeHtml(u)}" type="button">Profile</button>
        <button class="irm-small-btn irm-mark" data-username="${escapeHtml(u)}" type="button">${rev?'Undo':'Mark Unfollowed'}</button>
      `;
      frag.appendChild(r);
    });
    list.replaceChildren(frag);
  }

  function render() { renderList(); updateCounts(); updateQueueUI(); }

  function buildQueue() {
    state.queue = state.nonFollowers.filter(u => state.selected.has(u) && !state.reviewed.has(u));
    state.queueIndex = 0; updateQueueUI();
  }

  function updateQueueUI() {
    const cur = state.queue[state.queueIndex] || '';
    const curEl = document.getElementById(`${APP_ID}-current`);
    const pgEl = document.getElementById(`${APP_ID}-queue-progress`);
    if (curEl) curEl.textContent = cur ? `@${cur}` : 'No pending account in queue';
    if (pgEl) pgEl.textContent = state.queue.length ? `${Math.min(state.queueIndex + 1, state.queue.length)} of ${state.queue.length} accounts` : '0 accounts';
  }

  function randomDelaySeconds() { return Math.floor(Math.random()*(state.maxSeconds-state.minSeconds+1))+state.minSeconds; }

  function stopCountdown() { if (state.countdownTimer) clearInterval(state.countdownTimer); state.countdownTimer = null; state.countdown = null; }

  // ==========================================
  // SHARED WORKER TAB ORCHESTRATOR
  // ==========================================

  async function executeUnfollowAction() {
    const username = state.queue[state.queueIndex];
    if (!username) return;

    addLog(`Targeting @${username} in Worker Tab...`);

    // Clear old result and arm the trigger for the worker
    localStorage.removeItem(RESULT_KEY);
    localStorage.setItem(TARGET_KEY, username);

    if (!state.workerTab || state.workerTab.closed) {
        addLog(`❌ Worker tab was closed. Pausing queue.`);
        pauseReview();
        return;
    }

    // Force navigation of the worker tab
    state.workerTab.location.href = `https://www.instagram.com/${username}/`;

    let timeoutCounter = 0;

    state.actionInterval = setInterval(() => {
        timeoutCounter += 500;
        const resRaw = localStorage.getItem(RESULT_KEY);
        const isClosed = state.workerTab.closed;

        if (resRaw || isClosed || timeoutCounter > 25000) {
            clearInterval(state.actionInterval);
            localStorage.removeItem(TARGET_KEY);

            if (resRaw) {
                const res = JSON.parse(resRaw);
                if (res.status === 'OK') {
                    addLog(`🎯 Successfully unfollowed @${username}!`);
                    state.reviewed.add(username);
                } else if (res.status === 'ALREADY' || res.status === '404') {
                    addLog(`⚠️ Skipping @${username}: ${res.msg}`);
                    state.reviewed.add(username);
                } else {
                    addLog(`⚠️ Failed @${username}: ${res.msg}`);
                    state.reviewed.add(username); // Skip on error so queue doesn't stall
                }
            } else if (isClosed && timeoutCounter < 2000) {
                addLog(`❌ Tab closed manually by user. Halting.`);
                pauseReview();
                return;
            } else {
                addLog(`❌ Timeout waiting for tab to process @${username}. Skipping.`);
                state.reviewed.add(username);
            }

            saveState(); renderList(); updateCounts(); advanceQueue();
        }
    }, 500);
  }

  function startCountdown() {
    stopCountdown();
    if (!state.running) return;

    state.countdown = randomDelaySeconds();
    const timerEl = document.getElementById(`${APP_ID}-timer`);

    const tick = () => {
      if (!state.running || state.countdown === null) return;
      if (state.countdown <= 0) {
        stopCountdown();
        if (timerEl) timerEl.textContent = 'Processing...';
        executeUnfollowAction();
        return;
      }
      if (timerEl) timerEl.textContent = `Next in ${state.countdown}s`;
      state.countdown -= 1;
    };

    tick();
    state.countdownTimer = setInterval(tick, 1000);
  }

  function startReview() {
    const min = Number(document.getElementById(`${APP_ID}-min`).value);
    const max = Number(document.getElementById(`${APP_ID}-max`).value);

    if (!Number.isInteger(min) || !Number.isInteger(max) || min<1 || max<min) {
        alert('Invalid timer parameters.');
        return;
    }

    state.minSeconds = min; state.maxSeconds = max;
    saveState(); buildQueue();

    if (!state.queue.length) {
        alert('No pending accounts selected to unfollow.');
        return;
    }

    if (!state.workerTab || state.workerTab.closed) {
        const w = 450, h = 700;
        const left = (screen.width/2)-(w/2);
        const top = (screen.height/2)-(h/2);
        state.workerTab = window.open('about:blank', 'ig_worker_tab', `width=${w},height=${h},top=${top},left=${left}`);

        if (!state.workerTab) {
            alert("🚨 POPUPS BLOCKED! You MUST click the icon in your URL bar and ALLOW POPUPS for instagram.com.");
            return;
        }
    }

    state.running = true;
    document.getElementById(`${APP_ID}-pause`).disabled = false;
    document.getElementById(`${APP_ID}-start`).disabled = true;
    addLog(`Started automated queue for ${state.queue.length} accounts.`);
    startCountdown(); updateQueueUI();
  }

  function pauseReview() {
    state.running = false; stopCountdown();
    if (state.actionInterval) clearInterval(state.actionInterval);
    localStorage.removeItem(TARGET_KEY);

    document.getElementById(`${APP_ID}-pause`).disabled = true;
    document.getElementById(`${APP_ID}-start`).disabled = false;
    document.getElementById(`${APP_ID}-timer`).textContent = 'Queue paused.';
    addLog('Queue paused.');
  }

  function advanceQueue() {
    if (!state.queue.length) return;
    state.queueIndex += 1;
    if (state.queueIndex >= state.queue.length) {
      pauseReview();
      document.getElementById(`${APP_ID}-timer`).textContent = 'Completed.';
      addLog('All queued accounts have been processed.');
      if (state.workerTab && !state.workerTab.closed) state.workerTab.close();
    } else if (state.running) {
      startCountdown();
    }
    updateQueueUI();
  }

  // ==========================================
  // UI INJECTION AND STYLING
  // ==========================================
  function createPanel() {
    const host = document.createElement('div');
    host.id = APP_ID;

    host.innerHTML = `
      <button id="${APP_ID}-toggle" class="irm-floating">Auto-Unfollow Manager</button>
      <section id="${APP_ID}-panel" class="irm-panel">
        <header class="irm-header">
          <div>
            <strong>IG Auto-Unfollow Manager</strong>
            <small>DOM Worker Tab Edition (Bypasses API Blocks)</small>
          </div>
          <button id="${APP_ID}-close" class="irm-close">×</button>
        </header>

        <div class="irm-content">
          <div class="irm-import">
            <label>Followers JSON <input id="${APP_ID}-followers-file" type="file" accept=".json,application/json"></label>
            <label>Following JSON <input id="${APP_ID}-following-file" type="file" accept=".json,application/json"></label>
            <button id="${APP_ID}-import" class="irm-primary">Compare Exports</button>
            <div id="${APP_ID}-import-status" class="irm-status">Choose both JSON files from your Instagram export.</div>
          </div>

          <div id="${APP_ID}-summary" class="irm-summary">No exports loaded</div>

          <div class="irm-toolbar">
            <input id="${APP_ID}-search" type="search" placeholder="Search username…">
            <select id="${APP_ID}-filter">
              <option value="all">All non-followers</option>
              <option value="selected">Included in Queue</option>
              <option value="excluded">Excluded</option>
              <option value="pending">Pending Unfollow</option>
              <option value="reviewed">Unfollowed</option>
            </select>
          </div>

          <div class="irm-bulk">
            <button data-bulk="all">Select All</button>
            <button data-bulk="none">Clear All</button>
            <button data-bulk="visible">Select Visible</button>
            <button data-bulk="unvisible">Deselect Visible</button>
          </div>

          <div id="${APP_ID}-selected-count" class="irm-selected">Selected: 0 / 0</div>

          <div id="${APP_ID}-list" class="irm-list">
            <div class="irm-empty">Import both JSON files to begin.</div>
          </div>

          <section class="irm-review">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <strong>Auto-Unfollow Queue</strong>
              <span id="${APP_ID}-timer" style="font-size:11px; font-weight:bold; color:#d93025;">Not started</span>
            </div>

            <div class="irm-current" id="${APP_ID}-current">No pending account in queue</div>
            <div class="irm-queue-meta"><span id="${APP_ID}-queue-progress">0 accounts</span></div>

            <div class="irm-timing">
              <label>Min Seconds Delay <input id="${APP_ID}-min" type="number" min="1" max="3600" value="${state.minSeconds}"></label>
              <label>Max Seconds Delay <input id="${APP_ID}-max" type="number" min="1" max="3600" value="${state.maxSeconds}"></label>
            </div>

            <div class="irm-actions">
              <button id="${APP_ID}-start" class="irm-primary">Start Automation</button>
              <button id="${APP_ID}-pause" disabled>Pause / Stop</button>
            </div>
          </section>

          <div class="irm-logs-container">
            <div style="font-size:10px; font-weight:bold; margin-bottom:4px; color:#555;">Activity Logs:</div>
            <div id="${APP_ID}-logs" class="irm-logs"></div>
          </div>
        </div>
      </section>
    `;

    document.body.appendChild(host);
    const style = document.createElement('style');

    style.textContent = `
      #${APP_ID} { all: initial; font-family: Inter,system-ui,-apple-system,sans-serif; color: #1f2937; }
      #${APP_ID} * { box-sizing: border-box; }
      #${APP_ID} .irm-floating { position: fixed; right: 18px; bottom: 18px; z-index: 2147483000; border: 0; border-radius: 999px; padding: 12px 18px; color: #fff; background: #e1306c; box-shadow: 0 5px 24px #0003; font-weight: 700; cursor: pointer; transition: background 0.2s; }
      #${APP_ID} .irm-floating:hover { background: #c1124e; }
      #${APP_ID} .irm-panel { position: fixed; z-index: 2147483000; top: 12px; right: 12px; bottom: 76px; width: min(570px,calc(100vw - 24px)); display: flex; flex-direction: column; background: #fff; border: 1px solid #ddd; border-radius: 14px; box-shadow: 0 12px 40px #0004; overflow: hidden; }
      #${APP_ID} .irm-panel.irm-hidden { display: none; }
      #${APP_ID} .irm-header { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; background: #111; color: white; border-bottom: 2px solid #e1306c; }
      #${APP_ID} .irm-header strong { display: block; font-size: 15px; }
      #${APP_ID} .irm-header small { display: block; margin-top: 3px; color: #ccc; font-size: 11px; }
      #${APP_ID} .irm-close { border: 0; color: white; background: transparent; font-size: 25px; cursor: pointer; padding: 0 8px; }
      #${APP_ID} .irm-content { padding: 15px; overflow: auto; display: flex; flex-direction: column; gap: 12px; font-size: 13px; }
      #${APP_ID} input, #${APP_ID} select, #${APP_ID} button { font: inherit; }
      #${APP_ID} input[type="file"] { display: block; width: 100%; margin-top: 5px; font-size: 11px; }
      #${APP_ID} .irm-import { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; padding: 12px; background: #f8f9fa; border-radius: 9px; border: 1px solid #eee; }
      #${APP_ID} .irm-import label, #${APP_ID} .irm-timing label { font-size: 11px; font-weight: 700; color: #444; }
      #${APP_ID} .irm-import .irm-primary, #${APP_ID} .irm-status { grid-column: 1/-1; }
      #${APP_ID} .irm-status { color: #555; font-size: 11px; line-height: 1.45; }
      #${APP_ID} .irm-status.success { color: #0f9d58; font-weight: bold; }
      #${APP_ID} .irm-status.error { color: #d93025; font-weight: bold; }
      #${APP_ID} .irm-summary { color: #666; font-size: 11px; font-weight: 500; margin-bottom: -4px;}
      #${APP_ID} .irm-toolbar { display: grid; grid-template-columns: 1fr 160px; gap: 7px; }
      #${APP_ID} input[type="search"], #${APP_ID} select, #${APP_ID} .irm-timing input { width: 100%; padding: 9px; border: 1px solid #ccc; border-radius: 7px; background: #fff; color: #222; }
      #${APP_ID} .irm-bulk { display: flex; flex-wrap: wrap; gap: 6px; }
      #${APP_ID} button { border: 1px solid #d8d5e2; background: #f0f0f0; border-radius: 7px; padding: 7px 10px; cursor: pointer; color: #222; font-size: 12px; font-weight: 500; }
      #${APP_ID} button:hover:not(:disabled) { background: #e4e4e4; }
      #${APP_ID} button:disabled { opacity: .5; cursor: not-allowed; }
      #${APP_ID} button.irm-primary { background: #e1306c; color: white; border-color: #c1124e; font-weight: 700; }
      #${APP_ID} button.irm-primary:hover:not(:disabled) { background: #c1124e; }
      #${APP_ID} .irm-selected { font-weight: 700; color: #e1306c; font-size: 12px; }
      #${APP_ID} .irm-list { min-height: 120px; max-height: 250px; overflow: auto; border: 1px solid #ddd; border-radius: 8px; background: #fafafa; }
      #${APP_ID} .irm-account { display: grid; grid-template-columns: 28px minmax(0,1fr) auto auto auto; align-items: center; gap: 8px; padding: 10px; border-bottom: 1px solid #eee; }
      #${APP_ID} .irm-account:last-child { border-bottom: 0; }
      #${APP_ID} .irm-check-label { display: flex; align-items: center; justify-content: center; cursor: pointer; }
      #${APP_ID} .irm-check-label input { width: 16px; height: 16px; accent-color: #e1306c; cursor: pointer; }
      #${APP_ID} .irm-username { color: #00376b; text-decoration: none; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 13px; }
      #${APP_ID} .irm-username:hover { text-decoration: underline; }
      #${APP_ID} .irm-state { color: #d93025; font-size: 10px; font-weight: bold; white-space: nowrap; padding: 3px 6px; background: #fce8e6; border-radius: 4px; }
      #${APP_ID} .irm-state.done { color: #0f9d58; background: #e6f4ea; }
      #${APP_ID} .irm-small-btn { padding: 5px 8px; font-size: 10px; white-space: nowrap; border-radius: 5px; }
      #${APP_ID} .irm-empty { padding: 25px 10px; text-align: center; color: #777; font-size: 12px; }
      #${APP_ID} .irm-review { border: 1px solid #e1306c40; border-radius: 9px; padding: 14px; background: #fff0f5; }
      #${APP_ID} .irm-current { margin: 10px 0 4px; font-size: 16px; font-weight: 800; color: #222; }
      #${APP_ID} .irm-queue-meta { color: #666; font-size: 11px; margin-bottom: 12px; font-weight: 500; }
      #${APP_ID} .irm-timing { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 12px; }
      #${APP_ID} .irm-timing input { display: block; margin-top: 6px; }
      #${APP_ID} .irm-actions { display: flex; gap: 8px; }
      #${APP_ID} .irm-actions button { flex: 1; padding: 12px; font-size: 13px; }
      #${APP_ID} .irm-logs-container { display: flex; flex-direction: column; margin-top: 4px; }
      #${APP_ID} .irm-logs { height: 110px; overflow-y: auto; background: #1e1e1e; color: #00ff00; font-family: 'Courier New', monospace; font-size: 11px; padding: 10px; border-radius: 6px; line-height: 1.5; border: 1px solid #444; }
    `;

    document.head.appendChild(style);

    host.addEventListener('click', event => {
      const target = event.target;
      if (target.id === `${APP_ID}-toggle`) document.getElementById(`${APP_ID}-panel`).classList.toggle('irm-hidden');
      if (target.id === `${APP_ID}-close`) document.getElementById(`${APP_ID}-panel`).classList.add('irm-hidden');
      if (target.id === `${APP_ID}-import`) importExports();
      if (target.dataset.bulk) bulkSelect(target.dataset.bulk);

      if (target.classList.contains('irm-open')) {
        window.open(`https://www.instagram.com/${encodeURIComponent(target.dataset.username)}/`, '_blank', 'noopener,noreferrer');
      }

      if (target.classList.contains('irm-mark')) {
        const username = target.dataset.username;
        if (state.reviewed.has(username)) state.reviewed.delete(username);
        else state.reviewed.add(username);
        saveState();
        renderList();
        updateCounts();
      }

      if (target.id === `${APP_ID}-start`) startReview();
      if (target.id === `${APP_ID}-pause`) pauseReview();
    });

    host.addEventListener('change', event => {
      const target = event.target;
      if (target.classList.contains('irm-account-check')) setSelection(target.dataset.username, target.checked);
      if (target.id === `${APP_ID}-filter`) { state.filter = target.value; renderList(); }
    });

    host.addEventListener('input', event => {
      if (event.target.id === `${APP_ID}-search`) { state.search = event.target.value; renderList(); }
    });

    loadSavedState();
    document.getElementById(`${APP_ID}-min`).value = state.minSeconds;
    document.getElementById(`${APP_ID}-max`).value = state.maxSeconds;
    renderList();
    updateCounts();
    updateQueueUI();
  }

  function boot() {
    if (!document.body || document.getElementById(APP_ID)) return;
    createPanel();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

})();
