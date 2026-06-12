/**
 * main.js
 * 國貿署 KM 系統 — 前端互動邏輯
 *
 * 模組結構：
 *   Nav        — 頁面切換（Home ↔ App）
 *   Search     — 搜尋列邏輯（輸入、清除、結果顯示）
 *   Tree       — 左側樹狀選單（Tab 切換、選項選取）
 *   SidePanel  — 右側側滑面板
 *   Sidebar    — 側欄縮合
 *   Modal      — 進階搜尋 & 法規選擇彈窗
 *   Toast      — 輕提示訊息
 *   Init       — DOM 事件綁定入口
 */

'use strict';

// ─────────────────────────────────────────────────────────
//  工具函式
// ─────────────────────────────────────────────────────────

/** 安全取得 DOM 元素 */
const $ = id => document.getElementById(id);

/** HTML 跳脫（防 XSS） */
const esc = str =>
  str.replace(/&/g, '&amp;')
     .replace(/</g, '&lt;')
     .replace(/>/g, '&gt;');

// ─────────────────────────────────────────────────────────
//  Nav — 頁面切換
// ─────────────────────────────────────────────────────────
const SCREENS = ['home', 'app', 'app-flow-list', 'app-flow-edit', 'app-case-detail', 'app-customs', 'app-customs-detail', 'app-new-case', 'app-identity', 'app-risk', 'app-audit'];

const Nav = {
  _show(id) {
    SCREENS.forEach(s => $(s)?.classList.remove('on'));
    $(id)?.classList.add('on');
  },

  goApp() {
    this._show('app');
  },

  goHome() {
    this._show('home');
    SidePanel.close();
    Search.clear();
  },

  goCustoms() {
    this._show('app-customs');
  },

  goCustomsDetail() {
    this._show('app-customs-detail');
  },

  goIdentity() {
    this._show('app-identity');
  },

  goRisk() {
    this._show('app-risk');
  },

  goAudit() {
    this._show('app-audit');
  },

  goCaseDetail() {
    CaseDetail.render(SidePanel.currentCard);
    SidePanel.close();
    this._show('app-case-detail');
  },

  goFlowList() {
    this._show('app-flow-list');
  },

  goNewCase() {
    this._show('app-new-case');
    NewCase.init();
  },

  goFlowEdit() {
    // 進入編輯模式 → 確保清除 view mode
    const screen = $('app-flow-edit');
    if (screen) screen.classList.remove('is-view-mode');
    const banner = $('flow-view-banner');
    if (banner) banner.style.display = 'none';
    document.querySelectorAll('#app-flow-edit .btn--search, #app-flow-edit .btn--clear, .flow-add-btn')
      .forEach(b => b.style.display = '');
    this._show('app-flow-edit');
    FlowEdit.init();
  },

  goFlowView() {
    // 進入檢視模式 → 設定 view mode，不清除
    const screen = $('app-flow-edit');
    if (screen) screen.classList.add('is-view-mode');
    const banner = $('flow-view-banner');
    if (banner) banner.style.display = 'flex';
    document.querySelectorAll('#app-flow-edit .btn--search, #app-flow-edit .btn--clear, .flow-add-btn')
      .forEach(b => b.style.display = 'none');
    this._show('app-flow-edit');
    FlowEdit.init();
  },
};

// ─────────────────────────────────────────────────────────
//  Search — 搜尋列
// ─────────────────────────────────────────────────────────
const Search = {
  /** 輸入事件 */
  onInput(rawValue) {
    const v = rawValue.trim();
    const hasValue = !!v;
    const kw = v.toLowerCase();

    $('search-clear-btn')?.classList.toggle('is-visible', hasValue);
    $('filter-btn')?.classList.toggle('is-active', hasValue);
    $('preset-chip')?.classList.toggle('is-hidden', hasValue);

    // 過濾卡片
    const cards = document.querySelectorAll('.case-card');
    let visibleCount = 0;
    cards.forEach(card => {
      const text = (card.dataset.text || '').toLowerCase();
      const match = !hasValue || kw.split(/[,，;；]+/).some(k => k.trim() && text.includes(k.trim()));
      card.classList.toggle('is-filtered-out', !match);
      if (match && !card.classList.contains('is-tab-hidden')) visibleCount++;
      card.querySelectorAll('.snippet-block').forEach(s => {
        s.classList.toggle('is-visible', hasValue && match);
      });
    });

    // 更新關鍵字標記
    const firstKw = v.split(/[,，;；]/)[0].trim() || v;
    document.querySelectorAll('.kw-mark, [id^="kw-mark-"]').forEach(el => {
      el.textContent = firstKw;
    });

    $('result-info')?.classList.toggle('is-visible', hasValue);
    if (hasValue) {
      $('result-info').innerHTML =
        `與「<mark>${esc(v)}</mark>」相符的所有搜尋結果，查詢結果共計 <strong>${visibleCount}</strong> 筆`;
    }

    TreeCount.refresh();
  },

  /** 清除搜尋 */
  clear() {
    const input = $('search-input');
    if (input) input.value = '';
    document.querySelectorAll('.case-card.is-filtered-out')
      .forEach(c => c.classList.remove('is-filtered-out'));
    this.onInput('');
  },
};

// ─────────────────────────────────────────────────────────
//  FlowEdit — 流程編輯（步驟 DnD + 選取 + 標題同步）
// ─────────────────────────────────────────────────────────
// ── 流程步驟假資料 ──────────────────────────────────────────────
const FLOW_STEPS_DATA = [
  {
    title: '受理報案',
    body: `<p>受理被保險人或要保人之出險通知（電話、APP 或臨櫃），記錄事故發生時間、地點、車牌號碼及概略損失情形，建立理賠案件編號。</p><p>說明後續送件所需文件，包括行照、駕照、強制險與任意險保單、道路交通事故初步分析研判表等，並提醒被保險人保留修復前現場照片。</p>`
  },
  {
    title: '現場勘查與損失鑑定',
    body: `<p>派遣或委託查勘人員至事故現場或修配廠進行車損狀況拍照存證，初步估算損失範圍與金額。</p><p>必要時調閱行車紀錄器、路口監視器影像及道路交通事故初步分析研判表，確認事故發生經過與承保範圍是否相符，並判斷是否涉及第三人傷亡。</p>`
  },
  {
    title: '送修估價與文件審核',
    body: `<p>審核修配廠提供之估價單，逐項核對更換零件、烤漆工資與市場行情是否合理，必要時要求提供替代估價以利比對。</p><p>彙整要保書、保單條款、行照、駕照及相關證明文件，確認被保險人身分、保單有效性與承保內容無誤，如有缺漏應通知補件。</p>`
  },
  {
    title: '核賠與金額核定',
    body: `<p>依保險條款核算理賠金額，扣除約定自負額及零件折舊（如適用）。</p><p>如案件屬除外責任認定有疑義、金額逾一般授權額度，或屬無過失但求償金額較高之特殊情況，應簽報理賠主管或提送理賠主管會議審核，並可調閱過往同類案例（如本案例庫之「特殊情況核准」案例）作為核定依據。</p>`
  },
  {
    title: '撥款結案',
    body: `<p>核定金額後，將理賠金匯入被保險人或修配廠指定帳戶，並發出理賠核定通知書（含核賠金額、計算明細及駁回理由，如有）。</p><p>於系統中歸檔本案處理紀錄與相關文件，供後續同類案件查詢與理賠金額參考。</p>`
  }
];

const FlowEdit = {
  dragSrc: null,

  init() {
    const isView = $('app-flow-edit')?.classList.contains('is-view-mode');
    if (!isView) this.bindDrag();  // 檢視模式不綁 drag
    // 檢視模式設 contenteditable="false"
    const body = $('flow-rich-body');
    if (body) body.contentEditable = isView ? 'false' : 'true';
    const first = document.querySelector('#flow-step-list .step-card');
    if (first) this.selectStep(first);
  },

  bindDrag() {
    document.querySelectorAll('#flow-step-list .step-card').forEach(card => {
      card.addEventListener('dragstart', e => { this.dragSrc = card; e.dataTransfer.effectAllowed = 'move'; card.style.opacity = '0.5'; });
      card.addEventListener('dragend',   ()  => { card.style.opacity = '1'; document.querySelectorAll('#flow-step-list .step-card').forEach(c => c.classList.remove('drag-over')); });
      card.addEventListener('dragover',  e => { e.preventDefault(); if (card !== this.dragSrc) card.classList.add('drag-over'); });
      card.addEventListener('dragleave', ()  => card.classList.remove('drag-over'));
      card.addEventListener('drop',      e => { e.preventDefault(); this.drop(card); });
    });
  },

  drop(target) {
    if (!this.dragSrc || this.dragSrc === target) return;
    const list = document.getElementById('flow-step-list');

    // 移除所有 sep，只剩卡片，避免索引計算含 sep
    list.querySelectorAll('.step-sep').forEach(s => s.remove());

    const cards  = [...list.querySelectorAll('.step-card')];
    const srcIdx = cards.indexOf(this.dragSrc);
    const dstIdx = cards.indexOf(target);

    if (srcIdx < dstIdx) list.insertBefore(this.dragSrc, target.nextSibling);
    else                  list.insertBefore(this.dragSrc, target);

    target.classList.remove('drag-over');

    // 重建所有箭頭分隔
    this._rebuildSeps();
    this.renumber();
    this.bindDrag();
    // 移動後讓被拖動的卡片保持 active
    this.selectStep(this.dragSrc);
  },

  /** 依當前卡片順序重建 sep 箭頭 */
  _rebuildSeps() {
    const list  = document.getElementById('flow-step-list');
    const cards = [...list.querySelectorAll('.step-card')];
    list.querySelectorAll('.step-sep').forEach(s => s.remove());
    cards.forEach((card, i) => {
      if (i < cards.length - 1) {
        const sep = document.createElement('div');
        sep.className   = 'step-sep';
        sep.textContent = '↓';
        card.after(sep);
      }
    });
  },

  renumber() {
    document.querySelectorAll('#flow-step-list .step-card').forEach((card, i) => {
      card.querySelector('.step-num').textContent = `Step${i + 1}`;
    });
  },

  selectStep(card) {
    document.querySelectorAll('#flow-step-list .step-card').forEach(c => c.classList.remove('is-active'));
    card.classList.add('is-active');
    const numText = card.querySelector('.step-num')?.textContent || '';
    const title   = card.querySelector('.step-title-sm')?.textContent || '';

    const numEl   = $('flow-right-num');
    const titleEl = $('flow-right-title');
    const bodyEl  = $('flow-rich-body');
    if (numEl)   numEl.textContent = numText;
    if (titleEl) titleEl.value     = title;

    // 載入對應步驟的假資料內容
    if (bodyEl) {
      const idx  = parseInt(numText.replace(/\D/g, ''), 10) - 1;
      const data = FLOW_STEPS_DATA[idx];
      if (data) {
        bodyEl.innerHTML = data.body;
        if (titleEl) titleEl.value = data.title;
        card.querySelector('.step-title-sm').textContent = data.title;
      }
    }
  },

  updateTitle(val) {
    const active = document.querySelector('#flow-step-list .step-card.is-active');
    if (active) active.querySelector('.step-title-sm').textContent = val;
  },

  addStep() {
    const list = document.getElementById('flow-step-list');

    // 建立新步驟卡（獨特樣式）
    const card = document.createElement('div');
    card.className = 'step-card step-card--new';
    card.draggable = true;
    card.innerHTML = `
      <div class="step-drag">⠿</div>
      <div class="step-info">
        <div class="step-num">Step</div>
        <div class="step-title-sm">新步驟</div>
      </div>`;
    card.querySelector('.step-info').addEventListener('click', () => this.selectStep(card));

    list.insertBefore(card, list.firstChild);
    this._rebuildSeps();
    this.renumber();
    this.bindDrag();
    this.selectStep(card);
  },
};

// ─────────────────────────────────────────────────────────
//  FlowList — 流程清單（草稿 / 發佈 / 預設）
// ─────────────────────────────────────────────────────────
// 目前選中的 flow-row（供複製用）
let _selectedFlowRow = null;

const FlowList = {
  /** 點擊 flow-row 選中效果 */
  selectRow(el) {
    document.querySelectorAll('#app-flow-list .flow-row').forEach(r => r.classList.remove('is-selected'));
    el.classList.add('is-selected');
    _selectedFlowRow = el;
  },

  save() {
    Nav.goFlowList();
    const draftRow = $('flow-draft-row');
    if (draftRow) draftRow.style.display = '';
    const editBtn = $('flow-1-edit-btn');
    if (editBtn) editBtn.style.display = 'none';
    Toast.show('草稿已儲存');
  },

  publish() {
    const draft   = $('flow-draft-row');
    const archive = $('flow-1-archive');
    const ver     = $('flow-1-version');
    if (draft)   draft.style.display   = 'none';
    if (archive) archive.style.display = '';
    if (ver)     ver.textContent       = 'v3.1';
    const editBtn = $('flow-1-edit-btn');
    if (editBtn) editBtn.style.display = '';
    Toast.show('發佈成功！流程已更新至 v3.1');
  },

  setDefault(id) {
    [1, 2, 3].forEach(i => {
      const t = $(`toggle-${i}`);
      if (t) t.classList.toggle('is-on', i === id);
    });
    const container  = $('flow-group-list');
    const target     = $(`flow-group-${id}`);
    const firstGroup = container?.querySelector('.flow-group');
    if (container && target && target !== firstGroup) {
      container.insertBefore(target, firstGroup);
    }
  },

  /** 複製選中（或第一個）的流程，附加到清單最下方 */
  copy() {
    const list   = $('flow-group-list');
    const source = _selectedFlowRow?.closest('.flow-group') || list?.querySelector('.flow-group');
    if (!source || !list) { Toast.show('請先點選要複製的流程'); return; }

    const clone = source.cloneNode(true);
    clone.id = 'flow-group-copy-' + Date.now();
    // 僅保留第一個 flow-row（移除草稿/封存列）
    clone.querySelectorAll('.flow-row--draft, .flow-row--archive').forEach(r => r.remove());
    const row = clone.querySelector('.flow-row');
    if (row) {
      row.classList.remove('flow-row--active', 'is-selected');
      // 標題加「（複本）」
      const nameEl = row.querySelector('.flow-name');
      if (nameEl && !nameEl.textContent.includes('（複本）')) nameEl.textContent += '（複本）';
      // 版本重置
      const verEl = row.querySelector('.flow-version'); if (verEl) verEl.textContent = 'v1.0';
      // 日期更新
      const dateEl = row.querySelector('.flow-date'); if (dateEl) dateEl.textContent = new Date().toLocaleDateString('zh-TW');
      // 移除預設 toggle
      row.querySelectorAll('.toggle-track')?.forEach(t => { const wrap = t.closest('[style*="flex"]') || t.parentNode; wrap?.remove(); });
      // 加草稿標籤
      const badge = document.createElement('span');
      badge.className = 'flow-draft-badge'; badge.textContent = '複本';
      row.insertBefore(badge, row.firstChild);
      // click handler
      row.setAttribute('onclick', 'KM.flowSelectRow(this)');
    }
    list.appendChild(clone);
    clone.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    Toast.show('已複製流程，顯示於清單末端');
  },

  /** 進入檢視模式（唯讀） */
  view() {
    Nav.goFlowView();
  },
};

// ─────────────────────────────────────────────────────────
//  TreeCount — 樹狀計數（依可見卡片動態更新）
// ─────────────────────────────────────────────────────────
const TreeCount = {
  refresh() {
    // 計算每個 data-category 的可見卡片數
    const counts = {};
    document.querySelectorAll('#app .case-card').forEach(card => {
      if (card.classList.contains('is-filtered-out')) return;
      const cat = card.dataset.category;
      if (cat) counts[cat] = (counts[cat] || 0) + 1;
    });

    // 更新每個 tree-item 的 tree-count
    document.querySelectorAll('#app .tree-item[data-cat]').forEach(item => {
      const cat = item.dataset.cat;
      const n = counts[cat] || 0;
      const span = item.querySelector('.tree-count');
      if (span) span.textContent = n;
    });

    // 計算 Tab 總計（理賠案例 = cl-* 之和，裁罰案例 = ex-*／im-* 之和）
    const claimsTotal = Object.entries(counts)
      .filter(([k]) => k.startsWith('cl-'))
      .reduce((s, [, v]) => s + v, 0);
    const penaltyTotal = Object.entries(counts)
      .filter(([k]) => k.startsWith('ex-') || k.startsWith('im-'))
      .reduce((s, [, v]) => s + v, 0);

    const tabClaims = $('tab-claims');
    const tabPenalty = $('tab-penalty');
    if (tabClaims) tabClaims.textContent = `理賠案例（${claimsTotal}）`;
    if (tabPenalty) tabPenalty.textContent = `裁罰案例（${penaltyTotal}）`;
  },
};

// ─────────────────────────────────────────────────────────
//  Tree — 樹狀選單
// ─────────────────────────────────────────────────────────
const Tree = {
  /** 切換理賠案例 / 裁罰案例 Tab，自動選中第一個項目，並過濾右側案例卡片 */
  switchTab(type) {
    const tClaims = $('tree-claims');
    const tPenalty = $('tree-penalty');
    const bClaims = $('tab-claims');
    const bPenalty = $('tab-penalty');

    const isClaims = type === 'claims';
    tClaims.style.display = isClaims ? '' : 'none';
    tPenalty.style.display = isClaims ? 'none' : '';
    bClaims.className = 'tree-tab ' + (isClaims ? 'is-active' : 'is-inactive');
    bPenalty.className = 'tree-tab ' + (isClaims ? 'is-inactive' : 'is-active');

    // 依分類前綴過濾案例卡片：理賠案例（cl-*）／裁罰案例（ex-*、im-*）
    document.querySelectorAll('#app .case-card').forEach(card => {
      const cat = card.dataset.category || '';
      const belongsToClaims = cat.startsWith('cl-');
      card.classList.toggle('is-tab-hidden', belongsToClaims !== isClaims);
    });

    // 自動選中新 Tab 的第一個項目，確保右側標題不為空
    const activeList = isClaims ? tClaims : tPenalty;
    const first = activeList?.querySelector('.tree-item');
    if (first) {
      const title = first.querySelector('span:not(.tree-count):not(.tree-folder)')?.textContent.trim() || '';
      this.select(first, title);
    }

    TreeCount.refresh();
  },

  /** 選取樹狀項目，更新右側標題 */
  select(el, title) {
    document.querySelectorAll('.tree-item').forEach(i => i.classList.remove('is-active'));
    el.classList.add('is-active');
    $('section-title').textContent = title;
    SidePanel.close();
  },
};

// 案例分類 → 樹狀分類標題（側滑面板標題用）
const CASE_CATS = {
  'cl-1': '汽車險：碰撞、毀損理賠案例',
  'cl-2': '機車險：竊盜、毀損理賠案例',
  'cl-3': '旅行平安險：海外突發狀況理賠案例',
  'cl-4': '住宅火災及地震基本保險：火災、地震理賠案例',
  'cl-5': '傷害保險（意外險）：意外傷害理賠案例',
  'cl-6': '醫療健康保險：住院醫療理賠案例',
  'cl-7': '人壽保險：身故保險金理賠案例',
  'cl-8': '寵物保險：意外傷害、疾病理賠案例',
  'ex-1': '未盡告知義務：未提供保單條款重要內容說明',
  'ex-2': '招攬糾紛(1)：業務員招攬話術與商品內容不符',
  'ex-3': '招攬糾紛(2)：保單建議書與實際保障內容不符(投資型保單)',
  'ex-4': '招攬糾紛(3)：保單建議書與實際保障內容不符(其他)',
  'ex-5': '核保瑕疵：未落實核保程序致帶病投保',
  'ex-6': '理賠爭議：理賠認定與給付有所疑義',
  'ex-7': '廣告及文宣不實',
  'ex-8': '個人資料保護違規',
  'ex-9': '其他：如複合型態(含內控+招攬併處)等',
  'im-1': '保代經紀-未盡告知義務',
  'im-2': '保代經紀-招攬糾紛',
};

// ─────────────────────────────────────────────────────────
//  SidePanel — 右側滑面板
// ─────────────────────────────────────────────────────────
const SidePanel = {
  open(card) {
    if (card) this.render(card);
    $('side-panel').classList.add('is-open');
    $('dim').classList.add('is-open');
  },

  close() {
    $('side-panel').classList.remove('is-open');
    $('dim').classList.remove('is-open');
  },

  /** 依被點擊的 .case-card 內容，重新填充側滑面板 */
  render(card) {
    this.currentCard = card;
    const title = CASE_CATS[card.dataset.category] || $('section-title')?.textContent.trim() || '案例詳情';
    const titleEl = document.querySelector('#side-panel .side-title');
    if (titleEl) titleEl.textContent = title;

    const parts = [];

    const tagRow = card.querySelector('.tag-row');
    if (tagRow) parts.push(tagRow.outerHTML);

    const meta = card.querySelector('.case-meta');
    if (meta) {
      const clone = meta.cloneNode(true);
      clone.style.fontSize = '12.5px';
      clone.style.marginBottom = '14px';
      parts.push(clone.outerHTML);
    }

    parts.push('<hr class="side-divider">');

    const label = card.querySelector('.section-label');
    const summary = card.querySelector('.case-summary');
    if (summary) {
      parts.push(
        `<div style="margin-bottom:16px">` +
          `<div class="side-section-title">${(label?.textContent || '案情摘要').trim()}：</div>` +
          `<div class="side-text">${summary.innerHTML}</div>` +
        `</div>`
      );
    }

    const attach = card.querySelector('.attach-row');
    if (attach) parts.push(attach.outerHTML);

    const link = card.querySelector('.link-row');
    if (link) parts.push(link.outerHTML);

    const body = document.querySelector('#side-panel .side-panel-body');
    if (body) body.innerHTML = parts.join('\n');
  },
};

// ─────────────────────────────────────────────────────────
//  CaseDetail — 案例完整詳情頁（與側滑面板內容一致）
// ─────────────────────────────────────────────────────────
const CaseDetail = {
  render(card) {
    if (!card) return;

    const cat   = card.dataset.category;
    const catTitle = CASE_CATS[cat] || '';

    const bcCat = $('cd-breadcrumb-cat');
    if (bcCat) bcCat.textContent = catTitle;

    const metaRows = [...card.querySelectorAll('.case-meta .meta-row')].map(row => ({
      key: row.querySelector('.meta-key')?.textContent.trim() || '',
      val: row.querySelector('.meta-val')?.innerHTML || '',
    }));
    const primary = metaRows[0] || { key: '', val: '' };

    const pageTitle = $('cd-page-title');
    if (pageTitle) pageTitle.innerHTML = `${primary.val} — 案例完整詳情`;

    const metaBar = $('cd-meta-bar');
    if (metaBar) {
      metaBar.innerHTML = metaRows.map((m, i) =>
        (i > 0 ? '<div class="dmb-sep"></div>' : '') +
        `<div class="dmb-item"><span class="dmb-key">${m.key}</span><span class="dmb-val">${m.val}</span></div>`
      ).join('');
    }

    const summaryLabel = card.querySelector('.section-label')?.textContent.trim() || '案情摘要';
    const summary = card.querySelector('.case-summary')?.innerHTML || '';
    const summaryHd = $('cd-summary-hd');
    if (summaryHd) summaryHd.textContent = summaryLabel;
    const summaryBody = $('cd-summary-body');
    if (summaryBody) summaryBody.innerHTML = `<p>${summary}</p>`;

    // 案情明細表：以案件 meta 欄位整理為表格，補充摘要內容
    const summaryTableBody = $('cd-summary-table-body');
    if (summaryTableBody) {
      summaryTableBody.innerHTML = metaRows.map(m =>
        `<tr><td>${m.key.replace(/[：:]\s*$/, '')}</td><td>${m.val}</td></tr>`
      ).join('');
    }

    // 「說明」「附記」為原始裁罰公文內容，僅未盡告知義務範例（ex-1）保留
    const extra = $('cd-extra-sections');
    if (extra) extra.style.display = (cat === 'ex-1') ? '' : 'none';

    const infoFields = $('cd-info-fields');
    if (infoFields) {
      infoFields.innerHTML = metaRows.slice(1).map(m =>
        `<div style="color:#8898AA;font-weight:600;margin-top:4px">${m.key.replace(/[：:]\s*$/, '')}</div>` +
        `<div style="color:#2F3D50;line-height:1.5">${m.val}</div>`
      ).join('');
    }

    const infoTags = $('cd-info-tags');
    const tagRow = card.querySelector('.tag-row');
    if (infoTags && tagRow) infoTags.innerHTML = tagRow.innerHTML;

    // 「金評中心裁決傾向」僅標有 tag--precedent 的案例顯示
    const precedentBox = $('cd-precedent-box');
    if (precedentBox) precedentBox.style.display = card.querySelector('.tag--precedent') ? '' : 'none';

    const attachFields = $('cd-attach-fields');
    if (attachFields) {
      const attach = card.querySelector('.attach-row');
      const link = card.querySelector('.link-row');
      let html = '';
      if (attach) html += [...attach.querySelectorAll('.attach-pill')].map(p => p.outerHTML).join('');
      if (link) html += [...link.querySelectorAll('.link-pill')].map(p => p.outerHTML).join('');
      attachFields.innerHTML = html;
    }
  },
};

// ─────────────────────────────────────────────────────────
//  Sidebar — 側欄縮合
// ─────────────────────────────────────────────────────────
const Sidebar = {
  toggle() {
    const isCollapsed = document.querySelector('.sidebar-wrap')?.classList.contains('is-collapsed');
    document.querySelectorAll('.sidebar-wrap').forEach(w =>
      w.classList.toggle('is-collapsed', !isCollapsed)
    );
    document.querySelectorAll('.sidebar-toggle').forEach(btn =>
      btn.classList.toggle('is-collapsed', !isCollapsed)
    );
  },
};

// ─────────────────────────────────────────────────────────
//  Modal — 進階搜尋 & 法規選擇
// ─────────────────────────────────────────────────────────
const Modal = {
  open(id) {
    // ① 開啟進階搜尋時同步主搜尋欄關鍵字
    if (id === 'modal-adv') {
      const mainKw = $('search-input')?.value.trim() || '';
      const advKw  = $('adv-keyword');
      if (advKw && mainKw) advKw.value = mainKw;
      this._syncLawPlaceholder();
    }
    const el = $(id);
    if (el) el.classList.add('is-open');
  },

  close(id) {
    const el = $(id);
    if (el) el.classList.remove('is-open');
  },

  /** Overlay 點擊關閉（僅點擊背景本身） */
  overlayClick(event, id) {
    if (event.target === $(id)) this.close(id);
  },

  // ── 進階搜尋 Modal ─────────────────────────────────────
  setSearchMode(btn) {
    btn.closest('.modal-tabs')
       .querySelectorAll('.modal-tab')
       .forEach(b => b.classList.remove('is-active'));
    btn.classList.add('is-active');
  },

  removeFilterTag(id) {
    const el = $(id);
    if (!el) return;
    const lawText = el.dataset.law;
    el.remove();
    // 同步取消法規 modal 中的勾選
    if (lawText) {
      document.querySelectorAll('#law-list .law-item').forEach(item => {
        if (item.querySelector('label')?.textContent.trim() === lawText) {
          item.classList.remove('is-checked');
          const cb = item.querySelector('input[type="checkbox"]');
          if (cb) cb.checked = false;
        }
      });
      Modal._updateLawCount();
      Modal._syncLawPlaceholder();  // ③ 移除 tag 後更新 placeholder
    }
  },

  clearAdvanced() {
    $('adv-keyword').value = '';
    document.querySelectorAll('#modal-adv .filter-tag').forEach(t => t.remove());
    ['penalty-all', 'penalty-1', 'penalty-2', 'penalty-3'].forEach(id => {
      const el = $(id);
      if (el) el.checked = false;
    });
    // ② 重置日期選擇器
    const sel = $('date-range-select');
    if (sel) { sel.value = '近一年'; this.handleDateRange(sel); }
    if (window._datePicker) window._datePicker.clear();
    // ③ 恢復法規 placeholder
    this._syncLawPlaceholder();
  },

  submitSearch() {
    const kw = $('adv-keyword').value.trim() || '未盡告知義務';
    this.close('modal-adv');
    const input = $('search-input');
    if (input) {
      input.value = kw;
      Search.onInput(kw);
    }
    // ④⑤ TreeCount.refresh() 已在 Search.onInput 末尾呼叫
    // 自動切換到結果較多的 Tab（理賠案例 vs 裁罰案例）
    const counts = {};
    document.querySelectorAll('#app .case-card:not(.is-filtered-out)').forEach(c => {
      const cat = c.dataset.category || '';
      const tab = cat.startsWith('cl-') ? 'claims' : 'penalty';
      counts[tab] = (counts[tab] || 0) + 1;
    });
    if ((counts.claims || 0) > (counts.penalty || 0)) Tree.switchTab('claims');
    else Tree.switchTab('penalty');
  },

  // ── 法規選擇 Modal ─────────────────────────────────────
  toggleLawItem(item) {
    const cb = item.querySelector('input[type="checkbox"]');
    cb.checked = !cb.checked;
    item.classList.toggle('is-checked', cb.checked);
    this._updateLawCount();
  },

  filterLawList(query) {
    const ql = query.toLowerCase();
    document.querySelectorAll('#law-list .law-item').forEach(item => {
      const text = item.querySelector('label').textContent.toLowerCase();
      item.style.display = text.includes(ql) ? '' : 'none';
    });
  },

  // ── 法規 modal context（寫入目標 id + 關閉後返回哪個 modal）──
  _lawTagsId    : 'law-tags',
  _lawReturnTo  : 'modal-adv',

  /** X 關閉法規 modal（依 context 決定是否返回上層 modal） */
  closeLaw() {
    this.close('modal-law');
    if (this._lawReturnTo) this.open(this._lawReturnTo);
  },

  /** 開啟法規選擇 modal，呼叫端可指定寫入目標與返回目標 */
  openLaw(tagsId, returnTo) {
    this._lawTagsId   = tagsId   || 'law-tags';
    this._lawReturnTo = returnTo !== undefined ? returnTo : 'modal-adv';
    // 清除勾選狀態，避免上次殘留
    document.querySelectorAll('#law-list .law-item').forEach(item => {
      item.classList.remove('is-checked');
      const cb = item.querySelector('input[type="checkbox"]');
      if (cb) cb.checked = false;
    });
    this._updateLawCount();
    this.open('modal-law');
  },

  confirmLaws() {
    const tagArea = $(this._lawTagsId);
    if (tagArea) {
      tagArea.innerHTML = '';
      document.querySelectorAll('#law-list .law-item.is-checked').forEach((item, i) => {
        const text = item.querySelector('label')?.textContent.trim() || '';
        const tagId = `law-tag-${this._lawTagsId}-${i}`;
        const tag = document.createElement('span');
        tag.className = 'filter-tag';
        tag.id = tagId;
        tag.dataset.law = text;
        tag.innerHTML =
          esc(text) +
          `<button class="filter-tag-remove" onclick="event.stopPropagation();KM.removeFilterTag('${tagId}')"><span class="mi">close</span></button>`;
        tagArea.appendChild(tag);
      });
      this._syncLawPlaceholder(tagArea);
    }
    this.close('modal-law');
    if (this._lawReturnTo) this.open(this._lawReturnTo);
  },

  _updateLawCount() {
    const count = document.querySelectorAll('#law-list .law-item.is-checked').length;
    const el = $('law-count');
    if (el) el.textContent = count;
  },

  // ② 日期區間選擇器切換
  handleDateRange(sel) {
    const isCustom = sel.value === '自訂區間';
    const input = $('date-picker-input');
    if (!input) return;
    input.disabled = !isCustom;
    input.style.opacity = isCustom ? '1' : '0.4';
    if (isCustom && window._datePicker) window._datePicker.open();
    else if (!isCustom && window._datePicker) window._datePicker.clear();
  },

  // ③ 法規 Placeholder 同步（area 可為 element 或不傳（預設 law-tags））
  _syncLawPlaceholder(area) {
    const el = area instanceof Element ? area : $('law-tags');
    if (!el) return;
    const hasTags = el.querySelector('.filter-tag');
    let ph = el.querySelector('.law-ph');
    if (!ph) {
      ph = document.createElement('span');
      ph.className = 'law-ph';
      ph.textContent = '點擊選擇涉及法規...';
      el.appendChild(ph);
    }
    ph.style.display = hasTags ? 'none' : '';
  },

  // ── 裁罰金額「全部」聯動 ─────────────────────────────
  handlePenaltyAll(checked) {
    ['penalty-1', 'penalty-2', 'penalty-3'].forEach(id => {
      const el = $(id);
      if (el) el.checked = checked;
    });
  },
};

// ─────────────────────────────────────────────────────────
//  Toast — 輕提示
// ─────────────────────────────────────────────────────────
const Toast = {
  show(msg = '功能開發中...') {
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
      position     : 'fixed',
      bottom       : '28px',
      left         : '50%',
      transform    : 'translateX(-50%)',
      background   : 'rgba(44, 63, 90, 0.90)',
      color        : 'white',
      padding      : '8px 20px',
      borderRadius : '20px',
      fontSize     : '13px',
      zIndex       : '9999',
      pointerEvents: 'none',
      animation    : 'fadeIn 0.18s ease',
    });
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 1500);
  },
};

// ─────────────────────────────────────────────────────────
//  Init — DOM 事件綁定
// ─────────────────────────────────────────────────────────
function init() {
  // ── 鍵盤 Esc ────────────────────────────────────────
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if ($('modal-law')?.classList.contains('is-open')) {
      Modal.closeLaw();  // 依 context 決定是否返回上層
      return;
    }
    if ($('modal-adv')?.classList.contains('is-open')) {
      Modal.close('modal-adv');
      return;
    }
    SidePanel.close();
  });

  // ── 裁罰金額「全部」checkbox ───────────────────────
  const penaltyAll = $('penalty-all');
  if (penaltyAll) {
    penaltyAll.addEventListener('change', function () {
      Modal.handlePenaltyAll(this.checked);
    });
  }
}

// ─────────────────────────────────────────────────────────
//  Download Modal
// ─────────────────────────────────────────────────────────
const Download = {
  updateCount() {
    const all   = document.querySelectorAll('#modal-download .dl-item-cb');
    const checked = document.querySelectorAll('#modal-download .dl-item-cb:checked');
    $('dl-selected-count').textContent = checked.length;
    // 全選 checkbox 狀態
    const cb = $('dl-check-all');
    if (cb) {
      cb.indeterminate = checked.length > 0 && checked.length < all.length;
      cb.checked = checked.length === all.length;
    }
  },

  toggleAll(checked) {
    document.querySelectorAll('#modal-download .dl-item-cb, #modal-download .dl-grp-cb')
      .forEach(cb => { cb.checked = checked; });
    this.updateCount();
  },

  /** 展開 / 縮合群組（不影響勾選狀態） */
  toggleGroup(hd) {
    const group = hd.closest('.dl-group');
    const isCollapsed = group.classList.toggle('is-collapsed');
    const chevron = hd.querySelector('.dl-chevron');
    if (chevron) chevron.textContent = isCollapsed ? 'chevron_right' : 'expand_more';
    this._syncGroupBadge(group);
  },

  /** 群組 checkbox：全選 / 取消該群組所有項目 */
  groupCb(cb) {
    const group = cb.closest('.dl-group');
    group.querySelectorAll('.dl-item-cb').forEach(item => { item.checked = cb.checked; });
    this._syncGroupBadge(group);
    this.updateCount();
  },

  /** 更新群組縮合時的已選數量提示 */
  _syncGroupBadge(group) {
    const checkedN = group.querySelectorAll('.dl-item-cb:checked').length;
    const totalN   = group.querySelectorAll('.dl-item-cb').length;
    const badge    = group.querySelector('.dl-checked-badge');
    const dlCount  = group.querySelector('.dl-group-hd .dl-count');
    const isCollapsed = group.classList.contains('is-collapsed');
    // 群組 checkbox indeterminate 狀態
    const grpCb = group.querySelector('.dl-grp-cb');
    if (grpCb) {
      grpCb.indeterminate = checkedN > 0 && checkedN < totalN;
      grpCb.checked = checkedN === totalN;
    }
    if (badge) {
      badge.textContent = `已選 ${checkedN} / ${totalN}`;
      badge.style.display = isCollapsed ? '' : 'none';
    }
    if (dlCount) dlCount.style.display = isCollapsed ? 'none' : '';
  },

  download() {
    const n = document.querySelectorAll('#modal-download .dl-item-cb:checked').length;
    if (n === 0) { Toast.show('請至少選擇一個項目'); return; }
    Modal.close('modal-download');
    Toast.show(`打包下載中… 共 ${n} 個項目`);
  },
};

// ─────────────────────────────────────────────────────────
//  NewCase — 新增範本案例
// ─────────────────────────────────────────────────────────
const NewCase = {
  _files: [],

  init() {
    this._files = [];
    this._renderFileList();
    this.mainType = 'claims';
    this.switchMain('claims');
    this.switchType('ex');
  },

  /** 理賠案例/裁罰案例 主分類切換 */
  switchMain(type) {
    this.mainType = type;
    const isClaims = type === 'claims';
    $('nc-main-claims')?.classList.toggle('is-active', isClaims);
    $('nc-main-penalty')?.classList.toggle('is-active', !isClaims);
    if ($('nc-claims-classify'))  $('nc-claims-classify').style.display  = isClaims ? '' : 'none';
    if ($('nc-penalty-classify')) $('nc-penalty-classify').style.display = isClaims ? 'none' : '';
    if ($('nc-fields-claims'))  $('nc-fields-claims').style.display  = isClaims ? '' : 'none';
    if ($('nc-fields-penalty')) $('nc-fields-penalty').style.display = isClaims ? 'none' : '';
    if ($('nc-law-field')) $('nc-law-field').style.display = isClaims ? 'none' : '';
  },

  /** 保險業/保代經紀 切換 */
  switchType(type) {
    ['nc-tab-ex', 'nc-tab-im'].forEach(id => {
      const el = $(id);
      if (el) el.classList.toggle('is-active',   id === `nc-tab-${type}`);
      if (el) el.classList.toggle('is-inactive', id !== `nc-tab-${type}`);
    });
    // 更新樣態清單
    const cats = type === 'ex' ? [
      '未盡告知義務：未提供保單條款重要內容說明',
      '招攬糾紛(1)：業務員招攬話術與商品內容不符',
      '招攬糾紛(2)：保單建議書與實際保障內容不符(投資型保單)',
      '招攬糾紛(3)：保單建議書與實際保障內容不符(其他)',
      '核保瑕疵：未落實核保程序致帶病投保',
      '理賠爭議：理賠認定與給付有所疑義',
      '廣告及文宣不實',
      '個人資料保護違規',
      '其他：如複合型態(含內控+招攬併處)等',
    ] : [
      '保代經紀-未盡告知義務',
      '保代經紀-招攬糾紛',
    ];
    const sel = $('nc-category');
    if (!sel) return;
    sel.innerHTML = '<option value="">請選擇樣態</option>' +
      cats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
  },

  /** 附件上傳 */
  handleFiles(input) {
    [...(input.files || [])].forEach(f => {
      this._files.push(f);
    });
    input.value = '';
    this._renderFileList();
  },

  removeFile(idx) {
    this._files.splice(idx, 1);
    this._renderFileList();
  },

  _renderFileList() {
    const list = $('nc-file-list');
    if (!list) return;
    if (this._files.length === 0) {
      list.innerHTML = '<span style="color:#8898AA;font-size:12px">尚未選擇任何附件</span>';
      return;
    }
    list.innerHTML = this._files.map((f, i) => `
      <div class="nc-file-item">
        <span class="mi" style="color:#0889D1;font-size:18px">attach_file</span>
        <span class="nc-file-name">${esc(f.name)}</span>
        <span class="nc-file-size">${(f.size / 1024).toFixed(0)} KB</span>
        <button class="nc-file-remove" onclick="KM.ncRemoveFile(${i})"><span class="mi">close</span></button>
      </div>`).join('');
  },

  /** 關聯案例 Modal */
  openRelated() {
    Modal.open('modal-related');
  },

  confirmRelated() {
    const checked = document.querySelectorAll('#nc-related-list .nc-related-item.is-checked');
    const area = $('nc-related-tags');
    if (!area) return;
    area.innerHTML = '';
    checked.forEach(item => {
      const label = item.querySelector('.nc-related-label')?.textContent || '';
      const tag = document.createElement('span');
      tag.className = 'filter-tag';
      tag.textContent = label;
      area.appendChild(tag);
    });
    if (area.children.length === 0) {
      area.innerHTML = '<span style="color:#8898AA;font-size:12px">點擊選擇關聯案例</span>';
    }
    Modal.close('modal-related');
  },

  toggleRelatedItem(item) {
    item.classList.toggle('is-checked');
  },

  /** 儲存 / 送出 */
  save(publish) {
    if (this.mainType === 'penalty') {
      const title = $('nc-category')?.value;
      if (!title) { Toast.show('請先選擇裁罰案樣態'); return; }
    } else {
      const cat = $('nc-cat-claims')?.value;
      if (!cat) { Toast.show('請先選擇商品類型'); return; }
    }
    Toast.show(publish ? '案例已發布！' : '草稿已儲存');
    Nav.goApp();
  },
};

// ─────────────────────────────────────────────────────────
//  Public API — 供 HTML inline event handlers 呼叫
// ─────────────────────────────────────────────────────────
const CustomsSearch = {
  onInput(v) {
    const val      = v.trim();
    const hasValue = !!val;
    const kw       = val.toLowerCase();

    $('customs-clear')?.classList.toggle('is-visible', hasValue);

    // 過濾卡片（與處分案範例相同邏輯）
    const cards = document.querySelectorAll('#app-customs .customs-card');
    let visible = 0;
    cards.forEach(card => {
      const text  = (card.dataset.text || '').toLowerCase();
      const match = !hasValue || kw.split(/[,，;；]+/).some(k => k.trim() && text.includes(k.trim()));
      card.classList.toggle('is-filtered-out', !match);
      if (match) visible++;
      card.querySelectorAll('.ocr-block').forEach(el => el.classList.toggle('is-visible', hasValue && match));
    });

    // kw-mark 更新
    const firstKw = (val.split(/[,，;；]/)[0] || '').trim();
    document.querySelectorAll('#app-customs .kw-mark').forEach(el => { if (firstKw) el.textContent = firstKw; });

    // 空狀態
    const empty = $('customs-no-result');
    if (empty) empty.classList.toggle('cases-empty--hidden', !hasValue || visible > 0);

    // 結果摘要
    $('customs-result-info')?.classList.toggle('is-visible', hasValue);
    if (hasValue) {
      $('customs-result-info').innerHTML =
        `與「<mark>${esc(val)}</mark>」相符的所有搜尋結果，查詢結果共計 <strong>${visible}</strong> 筆`;
    }
  },
  clear() {
    const inp = $('customs-search');
    if (inp) inp.value = '';
    this.onInput('');
  },
};

// ── 步驟切換（函釋案件詳細頁）────────────────────────────
const StepView = {
  switch(n) {
    [1, 2, 3].forEach(i => {
      $(`step-btn-${i}`)?.classList.toggle('is-active', i === n);
      const c = $(`step-c-${i}`);
      if (c) c.style.display = i === n ? '' : 'none';
    });
  },
};

// ── Role — RBAC 角色切換 ─────────────────────────────────
const Role = {
  switch(role) {
    document.body.dataset.role = role;
    document.querySelectorAll('.role-select').forEach(sel => { sel.value = role; });
  },
};

window.KM = {
  // Nav
  goApp         : () => Nav.goApp(),
  goHome        : () => Nav.goHome(),
  goCustoms      : () => Nav.goCustoms(),
  goCustomsDetail: () => Nav.goCustomsDetail(),
  goCaseDetail   : () => Nav.goCaseDetail(),
  goNewCase      : () => Nav.goNewCase(),
  goIdentity     : () => Nav.goIdentity(),
  goRisk         : () => Nav.goRisk(),
  goAudit        : () => Nav.goAudit(),
  switchRole     : role => Role.switch(role),
  ncSwitchMain   : t  => NewCase.switchMain(t),
  ncSwitchType   : t  => NewCase.switchType(t),
  ncHandleFiles  : el => NewCase.handleFiles(el),
  ncRemoveFile   : i  => NewCase.removeFile(i),
  ncOpenRelated  : () => NewCase.openRelated(),
  ncConfirmRelated:() => NewCase.confirmRelated(),
  ncToggleRelated: el => NewCase.toggleRelatedItem(el),
  ncSave         : p  => NewCase.save(p),
  goFlowList     : () => Nav.goFlowList(),
  goFlowEdit     : () => Nav.goFlowEdit(),
  goFlowView     : () => Nav.goFlowView(),

  // Search
  onSearch   : v  => Search.onInput(v),
  clearSearch: () => Search.clear(),

  // Customs Search
  customsSearch: v  => CustomsSearch.onInput(v),
  customsClear : () => CustomsSearch.clear(),

  // Step switching
  switchStep: n => StepView.switch(n),

  // Flow edit
  flowAddStep   : ()     => FlowEdit.addStep(),
  flowSelectStep: card   => FlowEdit.selectStep(card),
  flowUpdateTitle: val   => FlowEdit.updateTitle(val),
  flowSave      : ()     => FlowList.save(),
  flowPublish   : ()     => FlowList.publish(),
  flowSetDefault: id     => FlowList.setDefault(id),
  flowCopy      : ()     => FlowList.copy(),
  flowView      : ()     => FlowList.view(),
  flowSelectRow : el     => FlowList.selectRow(el),

  // Tree
  switchTab: t        => Tree.switchTab(t),
  selectTree: (el, t) => Tree.select(el, t),
  selectCustomsTree: (el, t) => {
    document.querySelectorAll('#app-customs .tree-item').forEach(i => i.classList.remove('is-active'));
    el.classList.add('is-active');
    $('customs-section-title').textContent = t;
  },

  // Sidebar
  toggleSidebar: () => Sidebar.toggle(),

  // Side panel
  openPanel : el => SidePanel.open(el),
  closePanel: () => SidePanel.close(),

  // Modal
  openModal         : id  => Modal.open(id),
  closeModal        : id  => Modal.close(id),
  openLawModal      : (tagsId, returnTo) => Modal.openLaw(tagsId, returnTo),
  closeLawModal     : () => Modal.closeLaw(),
  handleDateRange   : sel => Modal.handleDateRange(sel),
  overlayClick      : (e, id) => Modal.overlayClick(e, id),
  setSearchMode     : btn => Modal.setSearchMode(btn),
  removeFilterTag   : id  => Modal.removeFilterTag(id),
  clearAdvanced     : () => Modal.clearAdvanced(),
  submitSearch      : () => Modal.submitSearch(),
  toggleLawItem     : el  => Modal.toggleLawItem(el),
  filterLawList     : q   => Modal.filterLawList(q),
  confirmLaws       : () => Modal.confirmLaws(),

  // Download modal
  dlToggleAll : checked => Download.toggleAll(checked),
  dlToggleGroup: hd     => Download.toggleGroup(hd),
  dlGroupCb   : cb      => Download.groupCb(cb),
  dlItemChange:  ()     => Download.updateCount(),
  dlDownload  : ()      => Download.download(),

  // Toast
  toast: msg => Toast.show(msg),
};

// DOM Ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { init(); TreeCount.refresh(); });
} else {
  init();
  TreeCount.refresh();
}
