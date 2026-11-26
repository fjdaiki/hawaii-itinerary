/* ハワイ旅程 2026
 * 旅程の元データ: data/itinerary.json（手で編集する）
 * アプリ上の編集・チェック: localStorage（キー "hawaii2026:state"）
 *   - アプリで編集した日の予定だけ、その日まるごと localStorage 側を使う
 *   - 編集していない日は JSON をそのまま表示する
 */
(function () {
  "use strict";

  const LS_KEY = "hawaii2026:state";
  const LS_UI = "hawaii2026:ui";
  const SLOTS = [
    { id: "morning", label: "朝" },
    { id: "noon", label: "昼" },
    { id: "evening", label: "夕" },
    { id: "night", label: "夜" },
  ];
  const TAGS = {
    arrival: "到着日",
    move: "移動日",
    fireworks: "金曜花火",
    race: "メリーマイル",
    departure: "帰国",
    free: "フリー",
  };
  const WD = ["日", "月", "火", "水", "木", "金", "土"];

  let DATA = null;
  let st = emptyState();
  let ui = { view: "today", dayIndex: 0 };

  /* ================= 保存 ================= */
  function emptyState() {
    return {
      days: {},       // date -> events[]（アプリで編集した日のみ）
      notes: {},      // date -> string（アプリで書いたメモ）
      hotelRefs: {},  // hotelId -> 予約番号
      budget: { amounts: {}, added: [], removed: [] },
      check: { done: {}, added: {}, removed: [] },
    };
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        const base = emptyState();
        st = Object.assign(base, s);
        st.budget = Object.assign(emptyState().budget, s.budget || {});
        st.check = Object.assign(emptyState().check, s.check || {});
      }
      const u = JSON.parse(localStorage.getItem(LS_UI) || "null");
      if (u) ui = Object.assign(ui, u);
    } catch (e) { /* 保存できない環境でも表示はする */ }
  }
  function save(msg) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(st));
      if (msg !== false) toast(msg || "保存しました");
    } catch (e) {
      toast("この端末に保存できませんでした");
    }
  }
  function saveUI() {
    try { localStorage.setItem(LS_UI, JSON.stringify(ui)); } catch (e) {}
  }
  let toastTimer;
  function toast(t) {
    const el = $("#toast");
    el.textContent = t;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 1200);
  }
  const debouncers = {};
  function saveSoon(key) {
    clearTimeout(debouncers[key]);
    debouncers[key] = setTimeout(() => save(), 500);
  }

  /* ================= 小道具 ================= */
  function $(s, root) { return (root || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function uid() { return "u" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
  function parseISO(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
  function md(iso) { const d = parseISO(iso); return (d.getMonth() + 1) + "/" + d.getDate(); }
  function wd(iso) { return parseISO(iso).getDay(); }
  function wdClass(iso) { const w = wd(iso); return w === 6 ? "sat" : w === 0 ? "sun" : ""; }
  function yen(n) { return "¥" + Math.round(n).toLocaleString("ja-JP"); }
  function diffDays(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
  function toMin(hhmm) { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }
  function fromMin(min) { min = (min + 1440) % 1440; return Math.floor(min / 60) + ":" + String(min % 60).padStart(2, "0"); }
  function mapUrl(ev) {
    if (ev.map) return ev.map;
    if (!ev.place) return "";
    return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(ev.place + " ホノルル");
  }
  function todayHST() {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: DATA.trip.timezone || "Pacific/Honolulu" }).format(new Date());
    } catch (e) {
      return new Date().toISOString().slice(0, 10);
    }
  }
  function todayJST() {
    try { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date()); }
    catch (e) { return new Date().toISOString().slice(0, 10); }
  }

  /* ================= データアクセス ================= */
  function dayByDate(date) { return DATA.days.find((d) => d.date === date); }
  function getEvents(date) {
    if (st.days[date]) return st.days[date];
    const d = dayByDate(date);
    return d ? d.events : [];
  }
  function isEdited(date) { return !!st.days[date]; }
  function editableEvents(date) {
    if (!st.days[date]) st.days[date] = JSON.parse(JSON.stringify(getEvents(date)));
    return st.days[date];
  }
  function getNote(date) {
    if (Object.prototype.hasOwnProperty.call(st.notes, date)) return st.notes[date];
    const d = dayByDate(date);
    return d ? d.note || "" : "";
  }
  function hotelTonight(date) { return DATA.hotels.find((h) => h.checkIn <= date && date < h.checkOut); }
  function hotelCheckout(date) { return DATA.hotels.find((h) => h.checkOut === date); }
  function hotelCheckin(date) { return DATA.hotels.find((h) => h.checkIn === date); }

  /* ================= 共通パーツ ================= */
  const ICON_BED = '<svg viewBox="0 0 24 24"><path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="2"/></svg>';
  const ICON_PLANE = '<svg viewBox="0 0 24 24"><path d="M2 16l20-6-3-2-8 2-5-5-2 1 3 5-4 1-2-2-1 1 2 4z"/><path d="M3 21h18"/></svg>';

  function dayHeadHTML(date, opts) {
    opts = opts || {};
    const day = dayByDate(date) || { tags: [] };
    const idx = DATA.days.findIndex((d) => d.date === date);
    const tags = (day.tags || []).map((t) => `<span class="tag ${t}">${TAGS[t] || esc(t)}</span>`).join("");
    const edited = isEdited(date) ? '<span class="tag edited">アプリで編集済み</span>' : "";
    return `<div class="day-head">
      ${opts.banner ? `<div class="banner-note">${opts.banner}</div>` : ""}
      <div class="day-date">
        <span class="big">${md(date)}</span>
        <span class="wd ${wdClass(date)}">（${WD[wd(date)]}）</span>
        <span class="nth">${idx + 1}日目 / ${DATA.days.length}日</span>
      </div>
      ${tags || edited ? `<div class="tags">${tags}${edited}</div>` : ""}
    </div>`;
  }

  function alertsHTML(date) {
    return (DATA.alerts || []).filter((a) => a.date === date).map((a) => {
      let leave = "";
      const f = (DATA.flights || []).find((x) => x.date === date && x.airportBeforeMin != null && x.depart);
      if (f) {
        const atAirport = toMin(f.depart) - f.airportBeforeMin;
        const leaveAt = atAirport - (f.travelMin || 60);
        leave = `<div class="leave">ホテル出発の目安 <span class="t">${fromMin(leaveAt)}</span><br>
          <span class="small">空港着 ${fromMin(atAirport)} → ${esc(f.from)} ${esc(f.depart)}発</span></div>`;
      }
      return `<div class="alert ${a.level || "danger"}" role="alert">
        <strong>⚠ ${esc(a.title || "注意")}</strong>
        <span>${esc(a.text)}</span>${leave}</div>`;
    }).join("");
  }

  function staysHTML(date) {
    let html = "";
    (DATA.flights || []).filter((f) => f.date === date).forEach((f) => {
      html += `<div class="card stay">
        <div class="ico flight">${ICON_PLANE}</div>
        <div class="body">
          <div class="label">${esc(f.label)}</div>
          <div class="flight-times">${esc(f.from)} ${esc(f.depart)} → ${esc(f.to)} ${esc(f.arrive)}</div>
          ${f.arriveDayNote ? `<div class="sub">${esc(f.arriveDayNote)}</div>` : ""}
          ${f.note ? `<div class="sub">${esc(f.note)}</div>` : ""}
        </div></div>`;
    });
    const out = hotelCheckout(date);
    const tonight = hotelTonight(date);
    if (out && (!tonight || tonight.id !== out.id)) {
      html += `<div class="card stay">
        <div class="ico">${ICON_BED}</div>
        <div class="body">
          <div class="label">チェックアウト ${esc(out.outTime)}</div>
          <div class="name">${esc(out.name)}</div>
        </div></div>`;
    }
    if (tonight) {
      const isIn = tonight.checkIn === date;
      const nightNo = diffDays(tonight.checkIn, date) + 1;
      const nights = diffDays(tonight.checkIn, tonight.checkOut);
      html += `<div class="card stay">
        <div class="ico">${ICON_BED}</div>
        <div class="body">
          <div class="label">今夜のホテル（${nightNo}/${nights}泊目${isIn ? "・チェックイン " + esc(tonight.inTime) : ""}）</div>
          <div class="name">${esc(tonight.name)}</div>
          <div class="sub">${esc(tonight.address)}</div>
          <div class="ev-actions" style="display:flex;gap:8px;margin-top:6px">
            <a class="btn map" href="${esc(tonight.map)}" target="_blank" rel="noopener">地図で開く</a>
          </div>
        </div></div>`;
    } else if (!tonight && date === DATA.trip.end) {
      html += `<div class="card stay"><div class="ico">${ICON_BED}</div><div class="body">
        <div class="label">今夜</div><div class="name">機内泊（日本着は翌日）</div></div></div>`;
    }
    return html;
  }

  function eventsHTML(date) {
    const evs = getEvents(date);
    let html = "";
    SLOTS.forEach((s) => {
      const list = evs.filter((e) => (e.slot || "morning") === s.id);
      if (!list.length) return;
      html += `<div class="slot-group">
        <div class="slot-label"><span class="slot-chip ${s.id}">${s.label}</span></div>
        ${list.map((e) => {
          const url = mapUrl(e);
          return `<div class="event ${e.rest ? "rest" : ""}">
            <div class="ev-title">${esc(e.title)}${e.rest ? '<span class="rest-badge">ゆっくり</span>' : ""}</div>
            ${e.place ? `<div class="ev-place">📍 ${esc(e.place)}</div>` : ""}
            ${e.memo ? `<div class="ev-memo">${esc(e.memo)}</div>` : ""}
            <div class="ev-actions">
              ${url ? `<a class="btn map" href="${esc(url)}" target="_blank" rel="noopener">地図で開く</a>` : ""}
              <button class="btn" data-edit="${esc(e.id)}" data-date="${date}">編集</button>
            </div>
          </div>`;
        }).join("")}
      </div>`;
    });
    if (!html) html = `<div class="empty">予定はまだありません</div>`;
    html += `<button class="btn add" data-add="${date}">＋ 予定を追加</button>`;
    if (isEdited(date)) {
      html += `<div class="row" style="justify-content:flex-end"><button class="link small" data-revert="${date}">この日をJSONの内容に戻す</button></div>`;
    }
    return html;
  }

  function noteHTML(date) {
    return `<div class="card note-box">
      <h3 class="section-title" style="margin:0 0 8px">メモ</h3>
      <textarea data-note="${date}" placeholder="この日のメモ（自動で保存）">${esc(getNote(date))}</textarea>
    </div>`;
  }

  function dayBodyHTML(date) {
    return alertsHTML(date) + staysHTML(date) +
      `<h2 class="section-title">予定</h2>` + eventsHTML(date) + noteHTML(date);
  }

  /* ================= 今日ビュー ================= */
  function renderToday() {
    const t = todayHST();
    const { start, end } = DATA.trip;
    let date = t, banner = "";
    if (t < start) {
      date = start;
      const n = diffDays(todayJST(), start);
      banner = n > 0 ? `出発まであと <b>${n}日</b>。旅行中はその日の予定がここに出ます。` : "いよいよ今日出発です。";
    } else if (t > end) {
      date = start;
      banner = "旅行期間が終わりました。12/2の予定を表示しています。";
    }
    $("#view-today").innerHTML = dayHeadHTML(date, { banner }) + dayBodyHTML(date);
  }

  /* ================= 日別ビュー ================= */
  function renderDatebar() {
    const t = todayHST();
    $("#datebar").innerHTML = DATA.days.map((d, i) => {
      const tag = (d.tags || [])[0];
      return `<button data-day="${i}" aria-current="${i === ui.dayIndex}" class="${d.date === t ? "today" : ""}">
        ${tag ? `<span class="dot ${tag}"></span>` : ""}
        <span class="m">12月</span><span class="d">${parseISO(d.date).getDate()}</span>
        <span class="w ${wdClass(d.date)}">${WD[wd(d.date)]}</span>
      </button>`;
    }).join("");
  }
  function renderDay(dir) {
    const i = Math.max(0, Math.min(DATA.days.length - 1, ui.dayIndex));
    ui.dayIndex = i;
    const date = DATA.days[i].date;
    const pane = $("#day-pane");
    pane.innerHTML = dayHeadHTML(date) + dayBodyHTML(date) +
      `<div class="pager">
        <button class="btn" data-step="-1" ${i === 0 ? "disabled" : ""}>‹ ${i > 0 ? md(DATA.days[i - 1].date) : ""}</button>
        <button class="btn" data-step="1" ${i === DATA.days.length - 1 ? "disabled" : ""}>${i < DATA.days.length - 1 ? md(DATA.days[i + 1].date) : ""} ›</button>
      </div>`;
    pane.classList.remove("slide-l", "slide-r");
    if (dir) { void pane.offsetWidth; pane.classList.add(dir > 0 ? "slide-l" : "slide-r"); }
    document.querySelectorAll("#datebar button").forEach((b) => b.setAttribute("aria-current", String(+b.dataset.day === i)));
    const cur = $(`#datebar button[data-day="${i}"]`);
    if (cur) {
      const bar = $("#datebar");
      bar.scrollTo({ left: cur.offsetLeft - bar.clientWidth / 2 + cur.clientWidth / 2, behavior: dir ? "smooth" : "auto" });
    }
    saveUI();
  }
  function goDay(step) {
    const n = ui.dayIndex + step;
    if (n < 0 || n >= DATA.days.length) return;
    ui.dayIndex = n;
    renderDay(step);
    window.scrollTo({ top: 0 });
  }

  // スワイプ
  (function setupSwipe() {
    let x0 = null, y0 = 0, t0 = 0;
    const pane = document.getElementById("day-pane");
    pane.addEventListener("touchstart", (e) => {
      if (e.target.closest("textarea, input")) { x0 = null; return; }
      x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
    }, { passive: true });
    pane.addEventListener("touchend", (e) => {
      if (x0 == null) return;
      const dx = e.changedTouches[0].clientX - x0;
      const dy = e.changedTouches[0].clientY - y0;
      x0 = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - t0 < 700) {
        goDay(dx < 0 ? 1 : -1);
      }
    }, { passive: true });
  })();

  /* ================= ホテル ================= */
  function renderHotels() {
    const t = todayHST();
    const totalNights = DATA.hotels.reduce((s, h) => s + diffDays(h.checkIn, h.checkOut), 0);
    $("#view-hotels").innerHTML = `<h1 class="section-title" style="font-size:1.2rem">ホテル（合計${totalNights}泊）</h1>` +
      DATA.hotels.map((h) => {
        const n = diffDays(h.checkIn, h.checkOut);
        const now = h.checkIn <= t && t < h.checkOut;
        return `<div class="card hotel ${esc(h.id)} ${now ? "now" : ""}">
          <div>
            <div class="nights">${md(h.checkIn)}（${WD[wd(h.checkIn)]}）〜 ${md(h.checkOut)}（${WD[wd(h.checkOut)]}）・${n}泊${now ? "・滞在中" : ""}</div>
            <h3>${esc(h.name)}</h3>
            ${h.area ? `<div class="muted small">${esc(h.area)}</div>` : ""}
          </div>
          <dl>
            <dt>チェックイン</dt><dd>${md(h.checkIn)} ${esc(h.inTime)}</dd>
            <dt>チェックアウト</dt><dd>${md(h.checkOut)} ${esc(h.outTime)}</dd>
            <dt>住所</dt><dd>${esc(h.address)}</dd>
            ${h.note ? `<dt>メモ</dt><dd>${esc(h.note)}</dd>` : ""}
          </dl>
          <label class="field">予約番号
            <input class="input" id="ref-${esc(h.id)}" data-ref="${esc(h.id)}" value="${esc(st.hotelRefs[h.id] || "")}" placeholder="例）1234567890" autocomplete="off" inputmode="text">
          </label>
          <div class="row"><a class="btn map" href="${esc(h.map)}" target="_blank" rel="noopener">地図で開く</a></div>
        </div>`;
      }).join("");
  }

  /* ================= 予算 ================= */
  function budgetItems() {
    const base = DATA.budget.items.filter((i) => !st.budget.removed.includes(i.id));
    return base.concat(st.budget.added);
  }
  function amountOf(item) {
    if (Object.prototype.hasOwnProperty.call(st.budget.amounts, item.id)) return st.budget.amounts[item.id];
    return item.amount;
  }
  function renderBudget() {
    const items = budgetItems();
    $("#view-budget").innerHTML = `
      <div class="card budget-total" id="budget-summary"></div>
      <div class="card">
        <div class="budget-list">
          ${items.map((it) => {
            const a = amountOf(it);
            const custom = st.budget.added.some((x) => x.id === it.id);
            return `<div class="brow ${a == null || a === "" ? "need" : ""}" data-bid="${esc(it.id)}">
              <div class="bname">${custom
                ? `<input class="input" id="bn-${esc(it.id)}" data-bname="${esc(it.id)}" value="${esc(it.name)}" placeholder="項目名">`
                : `${esc(it.name)}${a == null || a === "" ? '<span class="pending">要入力</span>' : ""}`}</div>
              <div class="money"><input class="input" id="ba-${esc(it.id)}" data-bamt="${esc(it.id)}" inputmode="numeric" pattern="[0-9]*" value="${a == null || a === "" ? "" : Number(a).toLocaleString("ja-JP")}" placeholder="0"></div>
              <button class="icon-x" data-bdel="${esc(it.id)}" aria-label="${esc(it.name)}を削除">×</button>
            </div>`;
          }).join("")}
        </div>
        <button class="btn add" id="budget-add" style="margin-top:10px">＋ 項目を追加</button>
      </div>
      ${DATA.budget.note ? `<p class="muted small" style="margin:0">${esc(DATA.budget.note)}</p>` : ""}`;
    renderBudgetSummary();
  }
  function renderBudgetSummary() {
    const items = budgetItems();
    const target = DATA.budget.target;
    let total = 0, pending = 0;
    items.forEach((it) => {
      const a = amountOf(it);
      if (a == null || a === "") pending++;
      else total += Number(a) || 0;
    });
    const over = total - target;
    const pct = Math.min(100, (total / target) * 100);
    $("#budget-summary").innerHTML = `
      <div class="muted small">合計（目標 ${yen(target)}）</div>
      <div class="num">${yen(total)}</div>
      <div class="bar ${over > 0 ? "over" : ""}"><span style="width:${pct}%"></span></div>
      <div class="budget-status ${over > 0 ? "over" : "ok"}">${over > 0 ? `目標を ${yen(over)} 超過` : `残り ${yen(-over)}`}</div>
      ${pending ? `<div class="small" style="color:var(--coral);margin-top:4px">未入力の項目が ${pending} 件あります</div>` : ""}`;
  }

  /* ================= チェックリスト ================= */
  function checkGroups() {
    return DATA.checklist.map((g) => ({
      group: g.group,
      items: g.items.filter((i) => !st.check.removed.includes(i.id)).concat(st.check.added[g.group] || []),
    }));
  }
  function renderCheck() {
    const groups = checkGroups();
    $("#view-check").innerHTML = groups.map((g, gi) => {
      const done = g.items.filter((i) => st.check.done[i.id]).length;
      return `<div class="card check-group">
        <div class="check-head"><h2 class="section-title" style="margin:0">${esc(g.group)}</h2>
          <span class="count ${done === g.items.length && done ? "done" : ""}">${done} / ${g.items.length}</span></div>
        ${g.items.map((i) => `<label class="citem ${st.check.done[i.id] ? "done" : ""}">
            <input type="checkbox" id="ck-${esc(i.id)}" data-ck="${esc(i.id)}" ${st.check.done[i.id] ? "checked" : ""}>
            <span class="ctext">${esc(i.text)}</span>
            <button class="icon-x" data-ckdel="${esc(i.id)}" data-group="${gi}" aria-label="${esc(i.text)}を削除">×</button>
          </label>`).join("")}
        <form class="add-line" data-ckadd="${gi}">
          <input class="input" id="ckadd-${gi}" placeholder="項目を追加" autocomplete="off">
          <button class="btn" type="submit">追加</button>
        </form>
      </div>`;
    }).join("") + `
      <div class="card backup">
        <h2 class="section-title" style="margin:0 0 6px">バックアップ</h2>
        <p class="muted small" style="margin:0 0 8px">編集内容はこの端末のブラウザにだけ保存されます。別の端末へ移すときは、書き出したテキストをコピーして移行先で貼り付けてください。</p>
        <div class="row">
          <button class="btn" id="bk-export">書き出してコピー</button>
          <button class="btn" id="bk-import">貼り付けた内容を読み込む</button>
        </div>
        <textarea id="bk-text" style="margin-top:8px" placeholder="ここに書き出し／貼り付け"></textarea>
      </div>`;
  }

  /* ================= 編集シート ================= */
  const dlg = document.getElementById("editor");
  const form = document.getElementById("editor-form");
  let editing = null; // { date, id|null }

  function openEditor(date, id) {
    editing = { date, id };
    const ev = id ? getEvents(date).find((e) => e.id === id) : null;
    $("#editor-title").textContent = (ev ? "予定を編集" : "予定を追加") + `（${md(date)}）`;
    form.slot.value = ev ? ev.slot || "morning" : "morning";
    $("#ed-title").value = ev ? ev.title : "";
    $("#ed-place").value = ev ? ev.place || "" : "";
    $("#ed-memo").value = ev ? ev.memo || "" : "";
    $("#ed-map").value = ev ? ev.map || "" : "";
    $("#ed-rest").checked = !!(ev && ev.rest);
    $("#editor-delete").hidden = !ev;
    $("#delete-confirm").hidden = true;
    if (typeof dlg.showModal === "function") dlg.showModal(); else dlg.setAttribute("open", "");
  }
  function closeEditor() {
    editing = null;
    if (typeof dlg.close === "function") dlg.close(); else dlg.removeAttribute("open");
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!editing) return;
    const title = $("#ed-title").value.trim();
    if (!title) { $("#ed-title").focus(); return; }
    const data = {
      slot: form.slot.value,
      title,
      place: $("#ed-place").value.trim(),
      memo: $("#ed-memo").value.trim(),
      map: $("#ed-map").value.trim(),
      rest: $("#ed-rest").checked,
    };
    const list = editableEvents(editing.date);
    if (editing.id) {
      const ev = list.find((x) => x.id === editing.id);
      if (ev) Object.assign(ev, data);
    } else {
      list.push(Object.assign({ id: uid() }, data));
    }
    save();
    closeEditor();
    renderDayViews();
  });
  $("#editor-cancel").addEventListener("click", closeEditor);
  $("#editor-delete").addEventListener("click", () => { $("#delete-confirm").hidden = false; });
  $("#delete-no").addEventListener("click", () => { $("#delete-confirm").hidden = true; });
  $("#delete-yes").addEventListener("click", () => {
    if (!editing || !editing.id) return;
    st.days[editing.date] = editableEvents(editing.date).filter((x) => x.id !== editing.id);
    save("削除しました");
    closeEditor();
    renderDayViews();
  });
  dlg.addEventListener("click", (e) => { if (e.target === dlg) closeEditor(); });

  /* ================= イベント（委譲） ================= */
  function renderDayViews() {
    renderToday();
    renderDatebar();
    renderDay();
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("button, [data-day]");
    if (!t) return;
    if (t.dataset.go) return show(t.dataset.go);
    if (t.dataset.day != null && t.closest("#datebar")) {
      const n = +t.dataset.day; const dir = n - ui.dayIndex; ui.dayIndex = n; return renderDay(dir);
    }
    if (t.dataset.step) return goDay(+t.dataset.step);
    if (t.dataset.edit) return openEditor(t.dataset.date, t.dataset.edit);
    if (t.dataset.add) return openEditor(t.dataset.add, null);
    if (t.dataset.revert) {
      if (t.dataset.confirm !== "1") { t.dataset.confirm = "1"; t.textContent = "本当に戻す（アプリでの編集は消えます）"; return; }
      delete st.days[t.dataset.revert];
      save("JSONの内容に戻しました");
      return renderDayViews();
    }
    if (t.dataset.bdel) {
      const id = t.dataset.bdel;
      if (st.budget.added.some((x) => x.id === id)) st.budget.added = st.budget.added.filter((x) => x.id !== id);
      else st.budget.removed.push(id);
      delete st.budget.amounts[id];
      save("削除しました");
      return renderBudget();
    }
    if (t.id === "budget-add") {
      const id = uid();
      st.budget.added.push({ id, name: "", amount: null });
      save(false);
      renderBudget();
      const el = document.getElementById("bn-" + id); if (el) el.focus();
      return;
    }
    if (t.dataset.ckdel) {
      e.preventDefault();
      const id = t.dataset.ckdel;
      const g = DATA.checklist[+t.dataset.group].group;
      const added = st.check.added[g] || [];
      if (added.some((x) => x.id === id)) st.check.added[g] = added.filter((x) => x.id !== id);
      else st.check.removed.push(id);
      delete st.check.done[id];
      save("削除しました");
      return renderCheck();
    }
    if (t.id === "bk-export") {
      const box = $("#bk-text");
      box.value = JSON.stringify(st);
      const done = () => toast("コピーしました");
      const fallback = () => { box.focus(); box.select(); toast("選択しました。コピーしてください"); };
      try { navigator.clipboard.writeText(box.value).then(done, fallback); } catch (err) { fallback(); }
      return;
    }
    if (t.id === "bk-import") {
      try {
        const s = JSON.parse($("#bk-text").value);
        if (!s || typeof s !== "object" || !s.days) throw new Error();
        localStorage.setItem(LS_KEY, JSON.stringify(s));
        loadState();
        renderAll();
        toast("読み込みました");
      } catch (err) { toast("読み込めませんでした。書き出したテキストをそのまま貼り付けてください"); }
    }
  });

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.dataset.note) {
      st.notes[t.dataset.note] = t.value;
      // 今日ビューと日別ビューに同じ日のメモがある場合は同期
      document.querySelectorAll(`textarea[data-note="${t.dataset.note}"]`).forEach((x) => { if (x !== t) x.value = t.value; });
      return saveSoon("note");
    }
    if (t.dataset.ref) { st.hotelRefs[t.dataset.ref] = t.value; return saveSoon("ref"); }
    if (t.dataset.bamt) {
      const digits = t.value.replace(/[^0-9]/g, "");
      st.budget.amounts[t.dataset.bamt] = digits === "" ? null : Number(digits);
      const row = t.closest(".brow");
      row.classList.toggle("need", digits === "");
      const p = row.querySelector(".pending"); if (p && digits !== "") p.remove();
      renderBudgetSummary();
      return saveSoon("budget");
    }
    if (t.dataset.bname) {
      const it = st.budget.added.find((x) => x.id === t.dataset.bname);
      if (it) it.name = t.value;
      return saveSoon("budget");
    }
  });
  document.addEventListener("change", (e) => {
    const t = e.target;
    if (t.dataset.ck) {
      st.check.done[t.dataset.ck] = t.checked;
      save(false);
      renderCheck();
    }
  });
  document.addEventListener("focusout", (e) => {
    const t = e.target;
    if (t.dataset && t.dataset.bamt && t.value) {
      const n = Number(t.value.replace(/[^0-9]/g, ""));
      t.value = n.toLocaleString("ja-JP");
    }
  });
  document.addEventListener("submit", (e) => {
    const f = e.target;
    if (f.dataset.ckadd == null) return;
    e.preventDefault();
    const gi = +f.dataset.ckadd;
    const input = f.querySelector("input");
    const text = input.value.trim();
    if (!text) return;
    const g = DATA.checklist[gi].group;
    (st.check.added[g] = st.check.added[g] || []).push({ id: uid(), text });
    save("追加しました");
    renderCheck();
    const ni = document.getElementById("ckadd-" + gi); if (ni) ni.focus();
  });

  /* ================= 画面切り替え ================= */
  function show(view) {
    ui.view = view;
    document.querySelectorAll(".view").forEach((v) => { v.hidden = v.dataset.view !== view; });
    document.querySelectorAll(".tabbar button").forEach((b) => {
      if (b.dataset.go === view) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    });
    if (view === "today") renderToday();
    if (view === "days") renderDay();
    window.scrollTo({ top: 0 });
    saveUI();
  }

  function renderTop() {
    const t = todayHST();
    const { start, end } = DATA.trip;
    let s;
    if (t < start) s = `出発まであと${diffDays(todayJST(), start)}日`;
    else if (t <= end) s = `${diffDays(start, t) + 1}日目 / ${DATA.days.length}日`;
    else s = "12/2〜12/13";
    $("#top-sub").textContent = s;
  }

  function renderAll() {
    renderTop();
    renderToday();
    renderDatebar();
    renderDay();
    renderHotels();
    renderBudget();
    renderCheck();
  }

  /* ================= 起動 ================= */
  async function boot() {
    loadState();
    try {
      const res = await fetch("data/itinerary.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const text = await res.text();
      try { DATA = JSON.parse(text); }
      catch (err) { throw new Error("data/itinerary.json の書き方に誤りがあります（" + err.message + "）。カンマや \" の閉じ忘れを確認してください。"); }
    } catch (err) {
      const box = $("#load-error");
      box.hidden = false;
      box.innerHTML = `<strong>旅程データを読み込めませんでした</strong><span>${esc(err.message)}</span>
        <span class="small">ファイルを直接開いた場合（file://）は読み込めません。ローカルサーバーかGitHub Pagesで開いてください。</span>`;
      return;
    }
    if (ui.dayIndex == null || ui.dayIndex >= DATA.days.length) ui.dayIndex = 0;
    // 旅行中に日別ビューを開いたら今日を初期表示
    const t = todayHST();
    const ti = DATA.days.findIndex((d) => d.date === t);
    if (ti >= 0) ui.dayIndex = ti;
    renderAll();
    show(ui.view || "today");
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    window.addEventListener("load", () => { navigator.serviceWorker.register("sw.js").catch(() => {}); });
  }
  boot();
})();
