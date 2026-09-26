/* ============================================================
   SKILLED-CREATIVES INTERNATIONAL — MEMBER DASHBOARD
   Courses, community, settings, support. Nothing else.

   Selling happens in the admin dashboard and on marketplace.html.
   Members do not have stores, payment methods or KYC here.

   FILE MAP
   1. Config          6. Overview
   2. State           7. Courses, Paystack, downloads
   3. Utilities       8. Community
   4. Supabase/auth   9. Settings
   5. Chrome         10. Support + router + init

   SECURITY
   Only the Supabase ANON key and the Paystack PUBLIC key belong here.
   Row Level Security is what protects the data. A browser payment
   callback is never proof of payment: paystack-verify confirms it
   server-side with the secret key.

   The client is named `sb`, not `supabase` — Safari throws a
   SyntaxError when a top-level let shadows an existing global, and the
   CDN script already created window.supabase.
   ============================================================ */

/* ---------- 1. CONFIG ---------- */
const CONFIG = {
  SUPABASE_URL: "https://aezepgnnykxqitzhhmen.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlemVwZ25ueWt4cWl0emhobWVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MDUwNTYsImV4cCI6MjEwMzE4MTA1Nn0.Ds9Vhp0ula5JxH5mZ-YVoEWQji2bNXuuzGYo_lInwDI",

  PAYSTACK_PUBLIC_KEY: "pk_test_fc4908f5f039e232d323ac09a61fbb2e2f5f61fc",
  PAYSTACK_VERIFY_ENDPOINT: "https://aezepgnnykxqitzhhmen.supabase.co/functions/v1/paystack-verify",

  WHATSAPP_COMMUNITY_LINK: "YOUR_WHATSAPP_LINK",
  SUPPORT_WHATSAPP: "2348000000000",
  SUPPORT_EMAIL: "support@skilledcreativeinternational.com",
  SUPPORT_PHONE: "+2348000000000",

  AI_ENDPOINT: "",                       // your own server route, if you add one
  AUTH_PAGE: "auth.html",
  ONBOARDING_PAGE: "onboarding.html",
  BRAND: "Skilled-Creatives Intl."
};

/* ---------- 2. STATE ---------- */
const state = {
  user: null, profile: null,
  courses: [], enrollments: [], activities: [], notifications: [], posts: [], faqs: [],
  counts: { members: 0, students: 0, partners: 0 },
  ui: {
    section: "overview",
    courseCategory: "All", courseQuery: "", myCourseTab: "all",
    postKind: "all", faqCategory: "All", faqQuery: "", settingsTab: "profile"
  }
};

/* ---------- 3. UTILITIES ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

/** Escape anything from a user or the database before it reaches innerHTML. */
function esc(v) {
  if (v === null || v === undefined) return "";
  return String(v).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
                  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function formatCurrency(a) {
  const n = Number(a) || 0;
  return "₦" + n.toLocaleString("en-NG", { minimumFractionDigits: n % 1 === 0 ? 0 : 2, maximumFractionDigits: 2 });
}
function formatDate(v) {
  return v ? new Date(v).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }) : "—";
}
function timeAgo(v) {
  if (!v) return "";
  const s = Math.floor((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return m + (m === 1 ? " minute ago" : " minutes ago");
  const h = Math.floor(m / 60); if (h < 24) return h + (h === 1 ? " hour ago" : " hours ago");
  const d = Math.floor(h / 24); if (d < 7) return d + (d === 1 ? " day ago" : " days ago");
  return formatDate(v);
}
function initials(n) {
  if (!n) return "SC";
  return n.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}
function debounce(fn, wait = 250) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), wait); }; }
function icons() { if (window.lucide && window.lucide.createIcons) window.lucide.createIcons(); }

function setLoading(btn, label = "Working…") {
  if (!btn) return () => {};
  const html = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span> ${esc(label)}`;
  return () => { btn.disabled = false; btn.innerHTML = html; icons(); };
}

function emptyState(icon, title, msg, action = "") {
  return `<div class="empty">
    <span class="empty__icon"><i data-lucide="${esc(icon)}"></i></span>
    <h3>${esc(title)}</h3><p>${esc(msg)}</p>${action}</div>`;
}

function animateCount(el, target) {
  const end = Number(target) || 0;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || end === 0) {
    el.textContent = end.toLocaleString();
    return;
  }
  const start = performance.now();
  const step = now => {
    const p = Math.min((now - start) / 900, 1);
    el.textContent = Math.floor(end * (1 - Math.pow(1 - p, 3))).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function showToast(message, type = "info") {
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.setAttribute("role", "status");
  el.innerHTML = `<i data-lucide="${type === "success" ? "check-circle-2" : type === "error" ? "alert-circle" : "info"}"></i><span>${esc(message)}</span>`;
  $("#toastRoot").appendChild(el);
  icons();
  setTimeout(() => { el.classList.add("is-out"); setTimeout(() => el.remove(), 220); }, 3600);
}

/* ---------- modal ---------- */
let lastFocused = null;

function openModal(title, html, options = {}) {
  lastFocused = document.activeElement;
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = html;
  $("#modalRoot").hidden = false;
  document.body.classList.add("no-scroll");
  icons();
  if (options.onOpen) options.onOpen($("#modalBody"));
  const f = $("#modalBody").querySelector("input, select, textarea, button");
  if (f) f.focus();
}

function closeModal() {
  if ($("#modalRoot").hidden) return;
  $("#modalRoot").hidden = true;
  $("#modalBody").innerHTML = "";
  document.body.classList.remove("no-scroll");
  if (lastFocused && document.contains(lastFocused)) lastFocused.focus();
}

function setupModals() {
  document.addEventListener("click", e => { if (e.target.closest("[data-close-modal]")) closeModal(); });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      if (!$("#modalRoot").hidden) { closeModal(); return; }
      closeAllMenus();
      if ($("#sidebar").classList.contains("is-open")) closeSidebar();
      return;
    }
    // Keep tab focus inside an open modal.
    if (e.key === "Tab" && !$("#modalRoot").hidden) {
      const items = $$("#modalRoot button, #modalRoot input, #modalRoot select, #modalRoot textarea, #modalRoot a[href]")
        .filter(el => !el.disabled && el.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}

/* ---------- 4. SUPABASE + AUTH ---------- */
let sb = null;
let connectionWarned = false;

function warnConnection(msg) {
  if (connectionWarned) return;
  connectionWarned = true;
  const banner = $("#connBanner");
  if (!banner) return;
  $("#connBannerText").textContent = msg;
  banner.hidden = false;
  icons();
}

/** Never let one failed query blank the dashboard. */
async function safeQuery(label, run, fallback = []) {
  if (!sb) return { data: fallback, error: new Error("no client") };
  try {
    const { data, error } = await run();
    if (error) {
      console.warn(`[query:${label}]`, error.message || error);
      if (String(error.message || "").match(/relation|does not exist|schema cache/i)) {
        warnConnection("Some tables are not set up yet. Run the SQL files in your Supabase project.");
      }
      return { data: fallback, error };
    }
    return { data: data ?? fallback, error: null };
  } catch (err) {
    console.warn(`[query:${label}]`, err);
    warnConnection("We could not reach the server. Some data may be missing.");
    return { data: fallback, error: err };
  }
}

/**
 * onboarded_at is the authoritative signal. The name/interest check is a
 * safety net for rows created before that column existed — drop it once
 * every profile has a date.
 */
function isOnboarded(profile) {
  if (!profile) return false;
  if (profile.onboarded_at) return true;
  return Boolean(profile.full_name && profile.interest_path);
}

async function loadUser() {
  const timeout = new Promise(r =>
    setTimeout(() => r({ data: null, error: new Error("getSession timed out after 10s") }), 10000));
  const { data, error } = await Promise.race([
    sb.auth.getSession().catch(err => ({ data: null, error: err })),
    timeout
  ]);

  if (error) {
    console.error("[auth] getSession failed:", error);
    hideBoot();
    warnConnection("Sign-in could not be checked. Check your Supabase URL and anon key.");
    return false;
  }
  if (!data || !data.session) {
    console.info("[auth] no session -> " + CONFIG.AUTH_PAGE);
    window.location.replace(CONFIG.AUTH_PAGE);
    return false;
  }

  state.user = data.session.user;
  console.info("[auth] signed in as", state.user.email);

  // The profile row belongs to onboarding, not to this dashboard.
  const { data: profile, error: profileError } = await safeQuery("profile", () =>
    sb.from("profiles").select("*").eq("id", state.user.id).maybeSingle(), null);

  // A dropped request is not the same as "not onboarded" — don't bounce
  // someone out of the dashboard because a query timed out.
  if (profileError) {
    warnConnection("We could not load your profile. Some sections may be empty.");
    state.profile = null;
    return true;
  }

  if (!isOnboarded(profile)) {
    console.info("[auth] profile incomplete -> " + CONFIG.ONBOARDING_PAGE, profile);
    window.location.replace(CONFIG.ONBOARDING_PAGE);
    return false;
  }

  state.profile = profile;
  sb.auth.onAuthStateChange(event => {
    if (event === "SIGNED_OUT") window.location.replace(CONFIG.AUTH_PAGE);
  });
  return true;
}

function userEmail() { return (state.user && state.user.email) || ""; }

function setupSignOut() {
  document.addEventListener("click", e => {
    if (!e.target.closest('[data-action="signout"]')) return;
    closeAllMenus();
    openModal("Sign out", `
      <p>Are you sure you want to sign out of ${esc(CONFIG.BRAND)}?</p>
      <div class="modal__actions">
        <button class="btn" type="button" data-close-modal>Cancel</button>
        <button class="btn btn--danger" type="button" id="confirmSignOut">Sign out</button>
      </div>`, {
      onOpen(body) {
        body.querySelector("#confirmSignOut").addEventListener("click", async ev => {
          setLoading(ev.currentTarget, "Signing out…");
          try { if (sb) await sb.auth.signOut(); } catch (err) { console.warn("[auth] signOut", err); }
          window.location.replace(CONFIG.AUTH_PAGE);
        });
      }
    });
  });
}

/* ---------- data ---------- */
async function loadAllData() {
  const uid = state.user.id;
  const [courses, enrollments, activities, notifications, posts, faqs] = await Promise.all([
    safeQuery("courses", () => sb.from("courses").select("*").eq("is_published", true).order("created_at", { ascending: false })),
    safeQuery("enrollments", () => sb.from("enrollments").select("*, courses(*)").eq("user_id", uid).order("last_activity_at", { ascending: false })),
    safeQuery("activities", () => sb.from("activities").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(10)),
    safeQuery("notifications", () => sb.from("notifications").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(20)),
    safeQuery("community_posts", () => sb.from("community_posts").select("*").eq("is_active", true).order("created_at", { ascending: false }).limit(20)),
    safeQuery("faqs", () => sb.from("faqs").select("*").order("sort_order", { ascending: true }))
  ]);

  state.courses = courses.data || [];
  state.enrollments = enrollments.data || [];
  state.activities = activities.data || [];
  state.notifications = notifications.data || [];
  state.posts = posts.data || [];
  state.faqs = faqs.data || [];

  await loadCounts();
}

/**
 * profiles is readable to its owner only, so a client-side count(*) would
 * return 1. community_stats() runs with definer rights and returns the real
 * totals without exposing anyone's row.
 */
async function loadCounts() {
  const { data, error } = await safeQuery("community-stats", () => sb.rpc("community_stats"), null);
  if (data && !error) {
    state.counts = {
      members: data.members || 0,
      students: data.students || 0,
      partners: data.partners || 0
    };
  }
}

async function logActivity(type, description) {
  if (!sb || !state.user) return;
  const row = { user_id: state.user.id, type, description };
  const { data } = await safeQuery("activity-insert", () =>
    sb.from("activities").insert(row).select().maybeSingle(), null);
  state.activities.unshift(data || { ...row, created_at: new Date().toISOString() });
  state.activities = state.activities.slice(0, 10);
  renderActivity();
}

/* ---------- 5. CHROME ---------- */
function renderIdentity() {
  const name = (state.profile && state.profile.full_name) || "Member";
  const avatar = state.profile && state.profile.avatar_url;

  $("#navUserName").textContent = name.split(" ")[0];
  $("#sideName").textContent = name;
  $("#sideEmail").textContent = userEmail();

  const html = avatar
    ? `<img src="${esc(avatar)}" alt="" onerror="this.remove()" />`
    : esc(initials(name));
  $("#navAvatar").innerHTML = html;
  $("#sideAvatar").innerHTML = html;

  const h = new Date().getHours();
  const part = h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
  $("#greeting").textContent = `${part}, ${name.split(" ")[0]}`;
  icons();
}

const isDesktop = () => window.matchMedia("(min-width:900px)").matches;

function openSidebar() {
  if (isDesktop()) { document.body.classList.remove("sidebar-collapsed"); return; }
  $("#sidebar").classList.add("is-open");
  $("#overlay").hidden = false;
  document.body.classList.add("no-scroll");
  $("#menuBtn").setAttribute("aria-expanded", "true");
}
function closeSidebar() {
  if (isDesktop()) { document.body.classList.add("sidebar-collapsed"); return; }
  $("#sidebar").classList.remove("is-open");
  $("#overlay").hidden = true;
  document.body.classList.remove("no-scroll");
  $("#menuBtn").setAttribute("aria-expanded", "false");
}

function setupSidebar() {
  $("#menuBtn").addEventListener("click", () => {
    if (isDesktop()) document.body.classList.toggle("sidebar-collapsed");
    else $("#sidebar").classList.contains("is-open") ? closeSidebar() : openSidebar();
  });
  $("#closeSidebar").addEventListener("click", closeSidebar);
  $("#overlay").addEventListener("click", closeSidebar);

  // Leaving mobile width should never strand the overlay on screen.
  window.addEventListener("resize", debounce(() => {
    if (isDesktop()) {
      $("#sidebar").classList.remove("is-open");
      $("#overlay").hidden = true;
      document.body.classList.remove("no-scroll");
    }
  }, 150));
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = $("#themeIcon");
  if (icon) { icon.setAttribute("data-lucide", theme === "dark" ? "sun" : "moon"); icons(); }
  $("#themeBtn").setAttribute("aria-label", theme === "dark" ? "Switch to light mode" : "Switch to dark mode");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#080B12" : "#0A3D91");
}

function setupTheme() {
  let saved = null;
  try { saved = localStorage.getItem("sc-theme"); } catch (_) {}
  applyTheme(saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  $("#themeBtn").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem("sc-theme", next); } catch (_) {}
  });
}

function closeAllMenus() {
  ["#notifMenu", "#userMenu"].forEach(sel => { const m = $(sel); if (m) m.hidden = true; });
  const nb = $("#notifBtn"); if (nb) nb.setAttribute("aria-expanded", "false");
  const ub = $("#userBtn");  if (ub) ub.setAttribute("aria-expanded", "false");
}

function setupMenus() {
  const toggle = (menuSel, btnSel) => {
    const menu = $(menuSel);
    const open = menu.hidden;
    closeAllMenus();
    menu.hidden = !open;
    $(btnSel).setAttribute("aria-expanded", String(open));
    icons();
  };

  $("#notifBtn").addEventListener("click", e => { e.stopPropagation(); toggle("#notifMenu", "#notifBtn"); });
  $("#userBtn").addEventListener("click",  e => { e.stopPropagation(); toggle("#userMenu", "#userBtn"); });
  document.addEventListener("click", e => { if (!e.target.closest(".dropdown")) closeAllMenus(); });

  $("#connBanner").querySelector(".conn-banner__close")
    .addEventListener("click", () => { $("#connBanner").hidden = true; });

  const mobileSearch = $("#searchBtnMobile");
  if (mobileSearch) mobileSearch.addEventListener("click", () => {
    navigateTo("courses");
    setTimeout(() => $("#courseSearch").focus(), 120);
  });

  const globalSearch = $("#globalSearch");
  if (globalSearch) globalSearch.addEventListener("keydown", e => {
    if (e.key !== "Enter") return;
    const q = globalSearch.value.trim();
    if (!q) return;
    state.ui.courseQuery = q;
    navigateTo("courses");
    $("#courseSearch").value = q;
    renderCourses();
  });
}

function notifIcon(type) {
  return { payment: "credit-card", course: "graduation-cap", community: "users" }[type] || "bell";
}

function renderNotifications() {
  const list = $("#notifList");
  const unread = state.notifications.filter(n => !n.is_read).length;
  $("#notifDot").hidden = unread === 0;

  if (!state.notifications.length) {
    list.innerHTML = `<div style="padding:26px 16px;text-align:center;color:var(--muted);font-size:.86rem">
      Nothing new. Updates about your courses land here.</div>`;
    return;
  }

  list.innerHTML = state.notifications.map(n => `
    <button class="notif ${n.is_read ? "" : "is-unread"}" type="button" data-notif="${esc(n.id)}">
      <span class="notif__icon"><i data-lucide="${notifIcon(n.type)}"></i></span>
      <span class="notif__body">
        <strong>${esc(n.title)}</strong>
        <small>${esc(n.body || "")}</small>
        <time>${esc(timeAgo(n.created_at))}</time>
      </span>
    </button>`).join("");
  icons();
}

function setupNotifications() {
  $("#markAllRead").addEventListener("click", async () => {
    const ids = state.notifications.filter(n => !n.is_read).map(n => n.id);
    if (!ids.length) return;
    state.notifications = state.notifications.map(n => ({ ...n, is_read: true }));
    renderNotifications();
    await safeQuery("notif-read-all", () => sb.from("notifications").update({ is_read: true }).in("id", ids));
  });

  $("#notifList").addEventListener("click", async e => {
    const btn = e.target.closest("[data-notif]");
    if (!btn) return;
    const item = state.notifications.find(n => String(n.id) === btn.getAttribute("data-notif"));
    if (!item || item.is_read) return;
    item.is_read = true;
    renderNotifications();
    await safeQuery("notif-read", () => sb.from("notifications").update({ is_read: true }).eq("id", item.id));
  });
}

/* ---------- 6. OVERVIEW ---------- */
function renderOverviewStats() {
  const enrolled = state.enrollments.length;
  const completed = state.enrollments.filter(e => e.status === "completed").length;
  const inProgress = enrolled - completed;

  const cards = [
    { icon: "graduation-cap", value: enrolled, label: "Courses enrolled" },
    { icon: "book-open", value: inProgress, label: "In progress" },
    { icon: "circle-check-big", value: completed, label: "Completed" },
    { icon: "users", value: state.counts.members.toLocaleString(), label: "Community members", accent: true }
  ];

  $("#overviewStats").innerHTML = cards.map(c => `
    <article class="stat">
      <span class="stat__icon ${c.accent ? "stat__icon--accent" : ""}"><i data-lucide="${c.icon}"></i></span>
      <div class="stat__value">${esc(c.value)}</div>
      <div class="stat__label">${esc(c.label)}</div>
    </article>`).join("");
  icons();
}

function renderContinueLearning() {
  const wrap = $("#continueLearning");
  const active = state.enrollments.filter(e => e.status !== "completed").slice(0, 4);

  if (!active.length) {
    wrap.innerHTML = emptyState("book-open", "No course in progress",
      "Pick a course and it will show up here, ready to download.",
      `<a class="btn btn--primary" href="#courses" data-nav="courses">Explore courses</a>`);
    icons();
    return;
  }

  wrap.innerHTML = active.map(e => {
    const c = e.courses || {};
    return `
      <article class="course">
        <div class="course__thumb">
          ${c.thumbnail_url ? `<img src="${esc(c.thumbnail_url)}" alt="" onerror="this.remove()" />` : `<i data-lucide="graduation-cap"></i>`}
          ${c.category ? `<span class="course__cat">${esc(c.category)}</span>` : ""}
        </div>
        <div class="course__body">
          <h3 class="course__title">${esc(c.title || "Course")}</h3>
          <p class="course__desc">${esc(c.instructor ? "With " + c.instructor : "")}</p>
          <div>
            <div class="progress-row"><span>Progress</span><span>${Number(e.progress) || 0}%</span></div>
            <div class="progress"><div class="progress__bar" style="width:${Number(e.progress) || 0}%"></div></div>
          </div>
          <div class="course__foot">
            <span class="course__price" style="font-size:.8rem;color:var(--muted)">${esc(timeAgo(e.last_activity_at))}</span>
            <button class="btn btn--primary btn--sm" type="button" data-open="${esc(e.id)}">
              <i data-lucide="download"></i> Download
            </button>
          </div>
        </div>
      </article>`;
  }).join("");
  icons();
}

function activityIcon(type) {
  return { course: "graduation-cap", payment: "credit-card", profile: "user-round-cog", community: "users" }[type] || "activity";
}

function renderActivity() {
  const wrap = $("#activityFeed");
  if (!state.activities.length) {
    wrap.innerHTML = emptyState("activity", "No activity yet", "Your enrollments and downloads will appear here.");
    icons();
    return;
  }
  wrap.innerHTML = state.activities.map(a => `
    <div class="tl-item">
      <span class="tl-item__icon"><i data-lucide="${activityIcon(a.type)}"></i></span>
      <div class="tl-item__body">
        <p>${esc(a.description)}</p>
        <time>${esc(timeAgo(a.created_at))}</time>
      </div>
    </div>`).join("");
  icons();
}

function renderOverview() {
  renderOverviewStats();
  renderContinueLearning();
  renderActivity();
}

/* ---------- 7. COURSES ---------- */
function enrollmentFor(courseId) {
  return state.enrollments.find(e => e.course_id === courseId) || null;
}

function renderCourses() {
  const grid = $("#courseGrid");
  const q = state.ui.courseQuery.trim().toLowerCase();
  const list = state.courses.filter(c => {
    const okCat = state.ui.courseCategory === "All" || c.category === state.ui.courseCategory;
    const okQ = !q ||
      (c.title || "").toLowerCase().includes(q) ||
      (c.description || "").toLowerCase().includes(q) ||
      (c.instructor || "").toLowerCase().includes(q);
    return okCat && okQ;
  });

  if (!state.courses.length) {
    grid.innerHTML = emptyState("graduation-cap", "No courses published yet",
      "Once courses are added to the catalogue they will show up here.");
    icons();
    return;
  }
  if (!list.length) {
    grid.innerHTML = emptyState("search-x", "Nothing matched that search", "Try a different word or clear the filters.");
    icons();
    return;
  }

  grid.innerHTML = list.map(c => {
    const enrolled = enrollmentFor(c.id);
    const free = Number(c.price) <= 0;
    return `
      <article class="course">
        <div class="course__thumb">
          ${c.thumbnail_url ? `<img src="${esc(c.thumbnail_url)}" alt="" onerror="this.remove()" />` : `<i data-lucide="graduation-cap"></i>`}
          ${c.category ? `<span class="course__cat">${esc(c.category)}</span>` : ""}
        </div>
        <div class="course__body">
          <h3 class="course__title">${esc(c.title)}</h3>
          <p class="course__desc">${esc((c.description || "").slice(0, 110))}</p>
          <div class="course__meta">
            ${c.instructor ? `<span><i data-lucide="user"></i>${esc(c.instructor)}</span>` : ""}
            ${c.duration ? `<span><i data-lucide="clock"></i>${esc(c.duration)}</span>` : ""}
            ${c.level ? `<span><i data-lucide="signal"></i>${esc(c.level)}</span>` : ""}
            ${c.file_name ? `<span><i data-lucide="file-text"></i>Downloadable</span>` : ""}
          </div>
          <div class="course__foot">
            <span class="course__price">${free ? "Free" : esc(formatCurrency(c.price))}</span>
            ${enrolled
              ? `<button class="btn btn--sm" type="button" data-open="${esc(enrolled.id)}"><i data-lucide="download"></i> Download</button>`
              : `<button class="btn btn--primary btn--sm" type="button" data-enroll="${esc(c.id)}">${free ? "Get it free" : "Enroll now"}</button>`}
          </div>
        </div>
      </article>`;
  }).join("");
  icons();
}

function renderMyCourses() {
  const wrap = $("#myCourses");
  const tab = state.ui.myCourseTab;
  const list = state.enrollments.filter(e =>
    tab === "all" ? true : tab === "completed" ? e.status === "completed" : e.status !== "completed");

  if (!list.length) {
    wrap.innerHTML = emptyState("book-marked",
      tab === "completed" ? "No completed courses yet" : "You have not enrolled in a course yet",
      "Enrol in a course above and it will be tracked here.",
      `<button class="btn btn--primary" type="button" data-scroll-courses>Browse the catalogue</button>`);
    icons();
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead><tr><th>Course</th><th>Progress</th><th>Last activity</th><th>Status</th><th></th></tr></thead>
      <tbody>${list.map(e => {
        const c = e.courses || {};
        const done = e.status === "completed";
        return `
          <tr>
            <td data-label="Course"><strong>${esc(c.title || "Course")}</strong></td>
            <td data-label="Progress">
              <div style="min-width:120px;width:100%">
                <div class="progress-row"><span></span><span>${Number(e.progress) || 0}%</span></div>
                <div class="progress"><div class="progress__bar ${done ? "progress__bar--done" : ""}" style="width:${Number(e.progress) || 0}%"></div></div>
              </div>
            </td>
            <td data-label="Last activity">${esc(timeAgo(e.last_activity_at))}</td>
            <td data-label="Status">${done
              ? `<span class="badge badge--ok"><i data-lucide="check"></i> Completed</span>`
              : `<span class="badge badge--muted">In progress</span>`}</td>
            <td data-label=""><button class="btn btn--sm ${done ? "" : "btn--primary"}" type="button" data-open="${esc(e.id)}">
              <i data-lucide="download"></i> Download</button></td>
          </tr>`;
      }).join("")}</tbody>
    </table>`;
  icons();
}

/** Checkout for a paid course. Free courses skip this entirely. */
function openCheckout(course) {
  openModal("Checkout", `
    <h3 style="font-family:'Space Grotesk'">${esc(course.title)}</h3>
    <p style="color:var(--muted);font-size:.88rem;margin-top:4px">
      ${esc(course.instructor ? "With " + course.instructor : "")}${course.duration ? " · " + esc(course.duration) : ""}
    </p>
    <div class="summary">
      <div class="summary__row"><span>Course fee</span><span>${esc(formatCurrency(course.price))}</span></div>
      <div class="summary__row"><span>Billed to</span><span>${esc(userEmail())}</span></div>
      <div class="summary__row"><span>You get</span><span>${esc(course.file_name || "Course material")}</span></div>
      <div class="summary__row summary__row--total"><span>Total</span><span>${esc(formatCurrency(course.price))}</span></div>
    </div>
    <p style="color:var(--muted);font-size:.8rem">
      Pay by card, bank transfer or USSD through Paystack. Your card details never touch this page.
    </p>
    <div class="modal__actions">
      <button class="btn" type="button" data-close-modal>Cancel</button>
      <button class="btn btn--primary" type="button" id="payBtn"><i data-lucide="credit-card"></i> Pay with Paystack</button>
    </div>`, {
    onOpen(body) {
      body.querySelector("#payBtn").addEventListener("click", ev => startPaystack(course, ev.currentTarget));
    }
  });
}

/**
 * Paystack inline. The browser callback only says the popup finished — it is
 * not proof of payment. finaliseEnrollment sends the reference to
 * paystack-verify, which checks it against Paystack with the secret key and
 * writes the enrollment server-side. The webhook is the backstop if the
 * browser dies first.
 */
function startPaystack(course, btn) {
  if (!window.PaystackPop || CONFIG.PAYSTACK_PUBLIC_KEY === "pk_test_fc4908f5f039e232d323ac09a61fbb2e2f5f61fc") {
    showToast("Paystack is not configured yet. Add your public key in dashboard.js.", "error");
    return;
  }
  const email = userEmail();
  if (!email) { showToast("We need an email address on your account before you can pay.", "error"); return; }

  const restore = setLoading(btn, "Opening Paystack…");
  const reference = "SC-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8).toUpperCase();

  try {
    const handler = window.PaystackPop.setup({
      key: CONFIG.PAYSTACK_PUBLIC_KEY,
      email,
      amount: Math.round(Number(course.price) * 100),  // kobo
      currency: "NGN",
      ref: reference,
      metadata: {
        purpose: "course_enrollment",
        user_id: state.user.id,
        course_id: course.id,
        custom_fields: [{ display_name: "Course", variable_name: "course", value: course.title }]
      },
      callback: function (response) { restore(); finaliseEnrollment(course, response.reference); },
      onClose: function () { restore(); showToast("Payment cancelled. Nothing was charged.", "info"); }
    });
    handler.openIframe();
  } catch (err) {
    console.error("[paystack]", err);
    restore();
    showToast("Paystack could not open. Check your connection and try again.", "error");
  }
}

async function finaliseEnrollment(course, reference) {
  if (CONFIG.PAYSTACK_VERIFY_ENDPOINT) {
    try {
      const { data: sessionData } = await sb.auth.getSession();
      const token = sessionData && sessionData.session ? sessionData.session.access_token : "";
      const res = await fetch(CONFIG.PAYSTACK_VERIFY_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: CONFIG.SUPABASE_ANON_KEY,
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reference })
      });
      const result = await res.json();
      if (!res.ok || result.status !== "success") {
        console.warn("[verify]", result);
        showToast("Payment could not be confirmed yet. Keep your reference and contact support.", "error");
        return;
      }
    } catch (err) {
      console.error("[verify]", err);
      showToast("We could not reach the verification server. Keep your reference safe.", "error");
      return;
    }
  }

  await refreshEnrollments();
  await logActivity("course", `Enrolled in ${course.title}`);
  renderCourses();
  renderMyCourses();
  renderOverview();

  closeModal();
  const enrollment = enrollmentFor(course.id);
  openModal("Payment received", `
    <div class="success-mark"><i data-lucide="check"></i></div>
    <h3 style="text-align:center;font-family:'Space Grotesk'">You are enrolled</h3>
    <p style="text-align:center;color:var(--muted);margin:8px 0 14px">${esc(course.title)} is ready to download.</p>
    <p class="ref">${esc(reference)}</p>
    <div class="modal__actions">
      <button class="btn" type="button" data-close-modal>Close</button>
      ${enrollment ? `<button class="btn btn--primary" type="button" data-open="${esc(enrollment.id)}">
        <i data-lucide="download"></i> Download now</button>` : ""}
    </div>`);
  showToast("Payment successful.", "success");
}

/** Free courses: enrol directly, no checkout. */
async function enrolFree(course, btn) {
  const restore = setLoading(btn, "Adding…");
  const { error } = await safeQuery("enrol-free", () =>
    sb.from("enrollments").upsert(
      { user_id: state.user.id, course_id: course.id, progress: 0, status: "in_progress" },
      { onConflict: "user_id,course_id" }));
  restore();
  if (error) { showToast("That could not be added. Try again.", "error"); return; }

  await refreshEnrollments();
  await logActivity("course", `Enrolled in ${course.title}`);
  renderCourses();
  renderMyCourses();
  renderOverview();
  showToast("Added to your courses.", "success");
}

async function refreshEnrollments() {
  const { data } = await safeQuery("enrollments-refresh", () =>
    sb.from("enrollments").select("*, courses(*)").eq("user_id", state.user.id)
      .order("last_activity_at", { ascending: false }));
  if (data) state.enrollments = data;
}

/**
 * The material sits in the private `course-files` bucket. createSignedUrl
 * only succeeds when an enrollments row exists for this course, so the
 * storage policy is the paywall — not this code.
 */
function openLesson(enrollment, btn) {
  const course = enrollment.courses || {};
  const progress = Number(enrollment.progress) || 0;
  const done = enrollment.status === "completed";
  const size = course.file_size ? (course.file_size / 1048576).toFixed(1) + " MB" : "";

  openModal(course.title || "Course", `
    <div class="progress-row"><span>${done ? "Completed" : "Your progress"}</span><span>${progress}%</span></div>
    <div class="progress"><div class="progress__bar ${done ? "progress__bar--done" : ""}" style="width:${progress}%"></div></div>

    <p style="color:var(--muted);font-size:.88rem;margin-top:14px">
      ${esc(course.description || "Your course material is ready to download.")}
    </p>

    ${course.file_path ? `
      <div class="summary">
        <div class="summary__row"><span>File</span><span>${esc(course.file_name || "Course material")}</span></div>
        ${size ? `<div class="summary__row"><span>Size</span><span>${esc(size)}</span></div>` : ""}
        <div class="summary__row"><span>Access</span><span>Yours to keep</span></div>
      </div>
      <p style="color:var(--muted);font-size:.78rem">
        The link is personal to you and expires after five minutes. Come back any time for a fresh one.
      </p>`
    : `<p style="color:var(--muted);font-size:.86rem;margin-top:12px">
         The material for this course has not been uploaded yet. We will notify you as soon as it is.
       </p>`}

    <div class="modal__actions">
      ${done ? `<button class="btn" type="button" data-close-modal>Close</button>`
             : `<button class="btn" type="button" id="markDone">Mark as completed</button>`}
      ${course.file_path
        ? `<button class="btn btn--primary" type="button" id="downloadBtn"><i data-lucide="download"></i> Download</button>`
        : `<button class="btn btn--primary" type="button" data-close-modal>Close</button>`}
    </div>`, {
    onOpen(body) {
      const dl = body.querySelector("#downloadBtn");
      if (dl) dl.addEventListener("click", async ev => {
        const restore = setLoading(ev.currentTarget, "Preparing…");
        const { data, error } = await safeQuery("course-file", () =>
          sb.storage.from("course-files").createSignedUrl(course.file_path, 300), null);
        restore();
        if (error || !data) { showToast("The download could not be prepared. Contact support.", "error"); return; }

        window.open(data.signedUrl, "_blank", "noopener");
        const stamp = new Date().toISOString();
        await safeQuery("touch-enrollment", () =>
          sb.from("enrollments").update({ last_activity_at: stamp }).eq("id", enrollment.id));
        enrollment.last_activity_at = stamp;
        renderMyCourses();
        renderOverview();
      });

      const mark = body.querySelector("#markDone");
      if (mark) mark.addEventListener("click", async ev => {
        const restore = setLoading(ev.currentTarget, "Saving…");
        const patch = { progress: 100, status: "completed", last_activity_at: new Date().toISOString() };
        const { error } = await safeQuery("progress", () =>
          sb.from("enrollments").update(patch).eq("id", enrollment.id));
        restore();
        if (error) { showToast("That could not be saved. Try again.", "error"); return; }
        Object.assign(enrollment, patch);
        renderMyCourses();
        renderOverview();
        closeModal();
        showToast("Course marked as completed.", "success");
        logActivity("course", `Completed ${course.title}`);
      });
    }
  });
}

function setupCourses() {
  $("#courseSearch").addEventListener("input", debounce(e => {
    state.ui.courseQuery = e.target.value;
    renderCourses();
  }, 200));

  $("#courseFilters").addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    $$("#courseFilters .chip").forEach(c => { c.classList.remove("is-active"); c.setAttribute("aria-selected", "false"); });
    chip.classList.add("is-active");
    chip.setAttribute("aria-selected", "true");
    state.ui.courseCategory = chip.dataset.cat;
    renderCourses();
  });

  $("#myCourseTabs").addEventListener("click", e => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    $$("#myCourseTabs .tab").forEach(t => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    state.ui.myCourseTab = tab.dataset.tab;
    renderMyCourses();
  });

  document.addEventListener("click", e => {
    const enrollBtn = e.target.closest("[data-enroll]");
    if (enrollBtn) {
      const course = state.courses.find(c => String(c.id) === enrollBtn.dataset.enroll);
      if (!course) return;
      Number(course.price) <= 0 ? enrolFree(course, enrollBtn) : openCheckout(course);
      return;
    }
    const openBtn = e.target.closest("[data-open]");
    if (openBtn) {
      const enrollment = state.enrollments.find(en => String(en.id) === openBtn.dataset.open);
      if (enrollment) openLesson(enrollment, openBtn);
      return;
    }
    if (e.target.closest("[data-scroll-courses]")) {
      $("#courseGrid").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });
}

/* ---------- 8. COMMUNITY ---------- */
function renderCommunity() {
  const c = state.counts;
  $("#communityStats").innerHTML = [
    { icon: "users", value: c.members.toLocaleString(), label: "Total members" },
    { icon: "graduation-cap", value: c.students.toLocaleString(), label: "Enrollments", accent: true },
    { icon: "handshake", value: c.partners.toLocaleString(), label: "Partners" }
  ].map(s => `
    <article class="stat">
      <span class="stat__icon ${s.accent ? "stat__icon--accent" : ""}"><i data-lucide="${s.icon}"></i></span>
      <div class="stat__value">${esc(s.value)}</div>
      <div class="stat__label">${esc(s.label)}</div>
    </article>`).join("");

  renderPosts();

  const counters = $("#aboutCounters");
  if (counters) {
    counters.innerHTML = [
      { n: c.members, label: "Members" },
      { n: c.partners, label: "Partners" },
      { n: c.students, label: "Students" }
    ].map(x => `<div class="counter"><strong data-count="${x.n}">0</strong><span>${esc(x.label)}</span></div>`).join("");
    $$("#aboutCounters [data-count]").forEach(el => animateCount(el, el.dataset.count));
  }
  icons();
}

function renderPosts() {
  const wrap = $("#communityPosts");
  if (!wrap) return;
  const kind = state.ui.postKind;
  const list = state.posts.filter(p => kind === "all" || p.kind === kind);

  if (!list.length) {
    wrap.innerHTML = emptyState("megaphone", "Nothing posted yet",
      "Announcements, events and discussions from the team will show up here.");
    icons();
    return;
  }

  wrap.innerHTML = list.map(p => `
    <article class="post post--${esc(p.kind)}">
      <span class="post__kind">${esc(p.kind)}</span>
      <h3>${esc(p.title)}</h3>
      <p>${esc((p.body || "").slice(0, 180))}</p>
      <div class="post__foot">
        ${esc(p.author_name || "Skilled-Creatives")} · ${esc(p.event_date ? formatDate(p.event_date) : timeAgo(p.created_at))}
      </div>
    </article>`).join("");
  icons();
}

function setupCommunity() {
  const tabs = $("#postTabs");
  if (tabs) tabs.addEventListener("click", e => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    $$("#postTabs .tab").forEach(t => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    state.ui.postKind = tab.dataset.kind;
    renderPosts();
  });

  document.addEventListener("click", e => {
    if (!e.target.closest('[data-action="join-whatsapp"]')) return;
    if (!CONFIG.WHATSAPP_COMMUNITY_LINK || CONFIG.WHATSAPP_COMMUNITY_LINK === "YOUR_WHATSAPP_LINK") {
      showToast("The community link is not set yet. Add it in dashboard.js.", "error");
      return;
    }
    window.open(CONFIG.WHATSAPP_COMMUNITY_LINK, "_blank", "noopener");
    logActivity("community", "Opened the WhatsApp community");
  });
}

/* ---------- 9. SETTINGS ---------- */
function notifPrefs() {
  // Kept in the browser. To follow the user across devices, add a jsonb
  // `notification_prefs` column to profiles and read/write it here.
  try { return JSON.parse(localStorage.getItem("sc-notifs") || "{}"); } catch (_) { return {}; }
}

function renderSettings() {
  if (!state.user) return;
  const tab = state.ui.settingsTab;
  const body = $("#settingsBody");
  const p = state.profile || {};

  if (tab === "profile") {
    body.innerHTML = `
      <div class="card">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
          <span class="avatar" style="width:64px;height:64px;font-size:1.1rem">${p.avatar_url
            ? `<img src="${esc(p.avatar_url)}" alt="" onerror="this.remove()" />` : esc(initials(p.full_name))}</span>
          <div>
            <strong style="font-family:'Space Grotesk';font-size:1.05rem">${esc(p.full_name || "Member")}</strong>
            <p style="color:var(--muted);font-size:.85rem">${esc(userEmail())}</p>
          </div>
        </div>
        <div class="form-grid form-grid--2">
          <div class="form-field"><label for="pf-name">Full name</label><input id="pf-name" value="${esc(p.full_name || "")}" /></div>
          <div class="form-field"><label for="pf-email">Email</label><input id="pf-email" value="${esc(userEmail())}" disabled />
            <span class="hint">Change your email from the security tab.</span></div>
          <div class="form-field"><label for="pf-phone">Phone</label><input id="pf-phone" type="tel" value="${esc(p.phone || "")}" /></div>
          <div class="form-field"><label for="pf-city">City</label><input id="pf-city" value="${esc(p.city || "")}" /></div>
          <div class="form-field"><label for="pf-state">State</label><input id="pf-state" value="${esc(p.state || "")}" /></div>
          <div class="form-field"><label for="pf-avatar">Profile photo</label><input id="pf-avatar" type="file" accept="image/*" /></div>
        </div>
        <button class="btn btn--primary" type="button" id="saveProfile" style="margin-top:18px">Save changes</button>
      </div>`;
    icons();
    $("#saveProfile").addEventListener("click", saveProfile);
    return;
  }

  if (tab === "account") {
    body.innerHTML = `
      <div class="card">
        <h2>Account</h2>
        <div class="summary">
          <div class="summary__row"><span>Account ID</span><span style="font-family:'IBM Plex Mono';font-size:.78rem">${esc(state.user.id)}</span></div>
          <div class="summary__row"><span>Email</span><span>${esc(userEmail())}</span></div>
          <div class="summary__row"><span>Member since</span><span>${esc(formatDate(p.onboarded_at || p.created_at || state.user.created_at))}</span></div>
          <div class="summary__row"><span>Interest</span><span>${esc(p.interest_path || "—")}</span></div>
          <div class="summary__row"><span>Courses</span><span>${state.enrollments.length}</span></div>
        </div>
      </div>`;
    icons();
    return;
  }

  if (tab === "security") {
    body.innerHTML = `
      <div class="card">
        <h2>Change password</h2>
        <div class="form-grid" style="margin-top:14px;max-width:420px">
          <div class="form-field"><label for="sec-pw">New password</label>
            <input id="sec-pw" type="password" autocomplete="new-password" placeholder="At least 8 characters" /></div>
          <div class="form-field"><label for="sec-pw2">Confirm new password</label>
            <input id="sec-pw2" type="password" autocomplete="new-password" /></div>
        </div>
        <button class="btn btn--primary" type="button" id="savePassword" style="margin-top:16px">Update password</button>
      </div>
      <div class="card" style="margin-top:14px">
        <h2>Active session</h2>
        <div class="switch-row">
          <span><strong>This device</strong><small>${esc(navigator.platform || "Browser")} · signed in now</small></span>
          <span class="badge badge--ok">Current</span>
        </div>
        <button class="btn" type="button" data-action="signout" style="margin-top:12px">Sign out of this device</button>
      </div>`;
    icons();

    $("#savePassword").addEventListener("click", async ev => {
      const pw = $("#sec-pw").value, pw2 = $("#sec-pw2").value;
      if (pw.length < 8) { showToast("Use at least 8 characters.", "error"); return; }
      if (pw !== pw2) { showToast("The two passwords do not match.", "error"); return; }
      const restore = setLoading(ev.currentTarget, "Updating…");
      try {
        const { error } = await sb.auth.updateUser({ password: pw });
        restore();
        if (error) { showToast(error.message, "error"); return; }
        $("#sec-pw").value = ""; $("#sec-pw2").value = "";
        showToast("Password updated.", "success");
      } catch (err) {
        restore();
        showToast("The password could not be updated.", "error");
      }
    });
    return;
  }

  if (tab === "notifications") {
    const prefs = notifPrefs();
    const rows = [
      ["email", "Email notifications", "Receipts, reminders and account notices."],
      ["courses", "Course updates", "New material, deadlines and certificates."],
      ["community", "Community notifications", "Announcements, events and discussions."]
    ];
    body.innerHTML = `<div class="card">${rows.map(([key, title, desc]) => `
      <label class="switch-row" for="nt-${key}">
        <span><strong>${esc(title)}</strong><small>${esc(desc)}</small></span>
        <span class="switch"><input id="nt-${key}" type="checkbox" data-pref="${key}" ${prefs[key] !== false ? "checked" : ""} /><span></span></span>
      </label>`).join("")}</div>`;
    icons();

    body.addEventListener("change", e => {
      const input = e.target.closest("[data-pref]");
      if (!input) return;
      const next = notifPrefs();
      next[input.dataset.pref] = input.checked;
      try { localStorage.setItem("sc-notifs", JSON.stringify(next)); } catch (_) {}
      showToast("Notification settings saved.", "success");
    });
    return;
  }

  const current = document.documentElement.getAttribute("data-theme");
  body.innerHTML = `
    <div class="card">
      <h2>Appearance</h2>
      <p style="color:var(--muted);font-size:.88rem;margin-top:6px">Choose how the dashboard looks on this device.</p>
      <div class="quick-actions" style="margin-top:16px">
        <button class="quick" type="button" data-theme-set="light"><i data-lucide="sun"></i><span>Light${current === "light" ? " · on" : ""}</span></button>
        <button class="quick" type="button" data-theme-set="dark"><i data-lucide="moon"></i><span>Dark${current === "dark" ? " · on" : ""}</span></button>
      </div>
    </div>`;
  icons();

  body.addEventListener("click", e => {
    const btn = e.target.closest("[data-theme-set]");
    if (!btn) return;
    applyTheme(btn.dataset.themeSet);
    try { localStorage.setItem("sc-theme", btn.dataset.themeSet); } catch (_) {}
    renderSettings();
  });
}

async function uploadAvatar(file) {
  if (!file) return null;
  if (file.size > 5 * 1024 * 1024) { showToast("That image is larger than 5MB.", "error"); return null; }
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${state.user.id}/${Date.now()}.${ext}`;
  try {
    const { error } = await sb.storage.from("avatars").upload(path, file, { upsert: true });
    if (error) throw error;
    return sb.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  } catch (err) {
    console.warn("[avatar]", err);
    showToast("The photo could not be uploaded.", "error");
    return null;
  }
}

async function saveProfile(e) {
  const name = $("#pf-name").value.trim();
  if (!name) { showToast("Your name cannot be empty.", "error"); return; }

  const restore = setLoading(e.currentTarget, "Saving…");
  const file = $("#pf-avatar").files[0];
  const avatarUrl = file ? await uploadAvatar(file) : (state.profile && state.profile.avatar_url) || null;

  const patch = {
    full_name: name,
    phone: $("#pf-phone").value.trim() || null,
    city: $("#pf-city").value.trim() || null,
    state: $("#pf-state").value.trim() || null,
    avatar_url: avatarUrl
  };

  const { data, error } = await safeQuery("profile-update", () =>
    sb.from("profiles").update(patch).eq("id", state.user.id).select().maybeSingle(), null);

  restore();
  if (error || !data) { showToast("Your profile could not be saved. Try again.", "error"); return; }

  state.profile = data;
  renderIdentity();
  renderSettings();
  await logActivity("profile", "Updated profile details");
  showToast("Profile updated.", "success");
}

function setupSettings() {
  $("#settingsTabs").addEventListener("click", e => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    $$("#settingsTabs .tab").forEach(t => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    state.ui.settingsTab = tab.dataset.stab;
    renderSettings();
  });
}

/* ---------- 10. SUPPORT ---------- */
function renderFaqs() {
  const wrap = $("#faqList");
  if (!wrap) return;
  const q = state.ui.faqQuery.trim().toLowerCase();
  const list = state.faqs.filter(f => {
    const okCat = state.ui.faqCategory === "All" || f.category === state.ui.faqCategory;
    const okQ = !q || f.question.toLowerCase().includes(q) || (f.answer || "").toLowerCase().includes(q);
    return okCat && okQ;
  });

  if (!list.length) {
    wrap.innerHTML = emptyState("search-x", "No answer matched that",
      "Try different words, or message support below and a person will help.");
    icons();
    return;
  }

  wrap.innerHTML = list.map((f, i) => `
    <div class="faq__item">
      <button class="faq__q" type="button" aria-expanded="false" aria-controls="faq-a-${i}">
        <span><span class="faq__cat">${esc(f.category)}</span>${esc(f.question)}</span>
        <i data-lucide="chevron-down"></i>
      </button>
      <div class="faq__a" id="faq-a-${i}">${esc(f.answer)}</div>
    </div>`).join("");
  icons();
}

function setupSupport() {
  const search = $("#faqSearch");
  if (search) search.addEventListener("input", debounce(e => {
    state.ui.faqQuery = e.target.value;
    renderFaqs();
  }, 200));

  const filters = $("#faqFilters");
  if (filters) filters.addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    $$("#faqFilters .chip").forEach(c => c.classList.remove("is-active"));
    chip.classList.add("is-active");
    state.ui.faqCategory = chip.dataset.fcat;
    renderFaqs();
  });

  const faqList = $("#faqList");
  if (faqList) faqList.addEventListener("click", e => {
    const q = e.target.closest(".faq__q");
    if (!q) return;
    const open = q.closest(".faq__item").classList.toggle("is-open");
    q.setAttribute("aria-expanded", String(open));
  });

  const emailText = $("#supportEmailText"); if (emailText) emailText.textContent = CONFIG.SUPPORT_EMAIL;
  const phoneText = $("#supportPhoneText"); if (phoneText) phoneText.textContent = CONFIG.SUPPORT_PHONE;

  document.addEventListener("click", e => {
    if (e.target.closest('[data-action="support-whatsapp"]')) {
      if (!CONFIG.SUPPORT_WHATSAPP) { showToast("The support number is not set yet.", "error"); return; }
      window.open(`https://wa.me/${CONFIG.SUPPORT_WHATSAPP.replace(/\D/g, "")}`, "_blank", "noopener");
    }
    if (e.target.closest('[data-action="support-email"]')) {
      window.location.href = `mailto:${CONFIG.SUPPORT_EMAIL}?subject=Support%20request`;
    }
    if (e.target.closest('[data-action="support-phone"]')) {
      window.location.href = `tel:${CONFIG.SUPPORT_PHONE.replace(/\s/g, "")}`;
    }
  });
}

/* ---- Assistant ----
   Not a live model. It answers from your own faqs rows plus the rules below.
   To connect a real model, point CONFIG.AI_ENDPOINT at a route on YOUR
   server that holds the provider key. That key never ships to the browser. */
function localAnswer(message) {
  const m = message.toLowerCase();

  const match = state.faqs.find(f => {
    const words = f.question.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(w => w.length > 3);
    return words.filter(w => m.includes(w)).length >= 2;
  });
  if (match) return match.answer;

  if (/enrol|register|sign up|join a course/.test(m))
    return "Open Courses, choose the one you want and click Enroll now. You will see the full cost before you pay.";
  if (/download|file|pdf|material|ebook/.test(m))
    return "Open My courses and click Download. The link is personal to you and lasts five minutes — come back for a fresh one any time.";
  if (/pay|paystack|card|transfer|fee|price/.test(m))
    return "Payments run through Paystack. Card, bank transfer and USSD all work. Your access opens once the payment is confirmed on our server.";
  if (/certificate/.test(m))
    return "Mark a course as completed and the certificate option appears next to it under My courses.";
  if (/buy|product|shop|market/.test(m))
    return "Our marketplace is a separate page. Pay with Paystack there and we confirm your order on WhatsApp.";
  if (/contact|human|agent|support|help/.test(m))
    return `You can reach the team on WhatsApp, by email at ${CONFIG.SUPPORT_EMAIL}, or by phone, Monday to Friday, 8:00 AM to 5:00 PM.`;
  if (/community|whatsapp|group/.test(m))
    return "Open Community and tap Join WhatsApp community to get into the member group.";

  return "I could not match that to a help topic. Try rephrasing it, or use one of the contact options and a person will pick it up.";
}

async function sendToAI(message) {
  if (!CONFIG.AI_ENDPOINT) return localAnswer(message);
  try {
    const res = await fetch(CONFIG.AI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, user_id: state.user.id })
    });
    const data = await res.json();
    return data.reply || localAnswer(message);
  } catch (err) {
    console.warn("[assistant]", err);
    return localAnswer(message);
  }
}

function setupAIChat() {
  const log = $("#chatLog");
  const input = $("#chatInput");
  const sendBtn = $("#chatSend");
  if (!log || !input || !sendBtn) return;   // the chat block can be hidden

  const bubble = (text, who) => {
    const el = document.createElement("div");
    el.className = `bubble bubble--${who}`;
    el.textContent = text;                  // textContent, never innerHTML
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
    return el;
  };

  bubble("Hello. Ask me about courses, downloads, payments or the community.", "ai");

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    bubble(text, "user");
    input.value = "";
    sendBtn.disabled = true;

    const typing = document.createElement("div");
    typing.className = "bubble bubble--ai typing";
    typing.innerHTML = "<i></i><i></i><i></i>";
    log.appendChild(typing);
    log.scrollTop = log.scrollHeight;

    safeQuery("support-msg", () =>
      sb.from("support_messages").insert({ user_id: state.user.id, role: "user", message: text }));

    const reply = await sendToAI(text);
    await new Promise(r => setTimeout(r, 400));
    typing.remove();
    bubble(reply, "ai");
    sendBtn.disabled = false;

    safeQuery("support-msg-ai", () =>
      sb.from("support_messages").insert({ user_id: state.user.id, role: "assistant", message: reply }));
  }

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); send(); } });
}

/* ---------- ROUTER ---------- */
const SECTIONS = ["overview", "courses", "community", "settings", "support"];
const TITLES = {
  overview: "Overview", courses: "Courses", community: "Community",
  settings: "Settings", support: "Help & support"
};

function navigateTo(section, pushHash = true) {
  if (!SECTIONS.includes(section)) section = "overview";
  state.ui.section = section;

  $$(".page").forEach(p => {
    const active = p.id === `page-${section}`;
    p.hidden = !active;
    p.classList.toggle("is-active", active);
  });
  $$(".nav__item[data-nav]").forEach(i => {
    const active = i.dataset.nav === section;
    i.classList.toggle("is-active", active);
    if (active) i.setAttribute("aria-current", "page"); else i.removeAttribute("aria-current");
  });

  document.title = `${TITLES[section]} · ${CONFIG.BRAND}`;
  if (pushHash && window.location.hash !== `#${section}`) history.pushState({ section }, "", `#${section}`);
  if (!isDesktop()) closeSidebar();
  closeAllMenus();
  window.scrollTo(0, 0);

  if (section === "overview") renderOverview();
  if (section === "courses") { renderCourses(); renderMyCourses(); }
  if (section === "community") renderCommunity();
  if (section === "settings") renderSettings();
  if (section === "support") renderFaqs();
}

function setupNavigation() {
  document.addEventListener("click", e => {
    const link = e.target.closest("[data-nav]");
    if (!link) return;
    e.preventDefault();
    navigateTo(link.dataset.nav);
  });
  window.addEventListener("popstate", () =>
    navigateTo((window.location.hash || "#overview").slice(1), false));
}

/* ---------- INIT ---------- */
let bootWatchdog = null;
function hideBoot() {
  const b = $("#boot");
  if (b) b.hidden = true;
  if (bootWatchdog) { clearTimeout(bootWatchdog); bootWatchdog = null; }
}

function renderSkeletons() {
  $("#overviewStats").innerHTML = Array.from({ length: 4 }, () => `<div class="skeleton" style="height:118px"></div>`).join("");
  $("#continueLearning").innerHTML = `<div class="skeleton" style="height:250px"></div><div class="skeleton" style="height:250px"></div>`;
  $("#activityFeed").innerHTML = `<div class="skeleton" style="height:220px;border:0"></div>`;
  $("#courseGrid").innerHTML = `<div class="skeleton" style="height:290px"></div><div class="skeleton" style="height:290px"></div><div class="skeleton" style="height:290px"></div>`;
}

function renderEverything() {
  renderIdentity();
  renderNotifications();
  renderOverview();
  renderCourses();
  renderMyCourses();
  renderCommunity();
  renderFaqs();
  if (state.ui.section === "settings") renderSettings();
  icons();
}

async function initDashboard() {
  // If anything stalls, show the shell rather than leaving the person
  // staring at the boot screen with no explanation.
  bootWatchdog = setTimeout(() => {
    console.warn("[init] startup took over 12s — showing the shell.");
    hideBoot();
    warnConnection("This is taking longer than expected. Check the console for details.");
    navigateTo((window.location.hash || "#overview").slice(1), false);
  }, 12000);

  try {
    icons();
    setupTheme();
    setupSidebar();
    setupMenus();
    setupModals();
    setupNavigation();
    setupNotifications();
    setupCourses();
    setupCommunity();
    setupSettings();
    setupSupport();
    setupAIChat();
    setupSignOut();
    renderSkeletons();
    console.info("[init] shell ready");
  } catch (err) {
    console.error("[init] setup failed:", err);
    hideBoot();
    warnConnection("Part of the dashboard failed to start. Check the console.");
    return;
  }

  try {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("Supabase library did not load");
    }
    sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    const signedIn = await loadUser();
    if (!signedIn) return;      // loadUser has redirected or already reported

    hideBoot();
    renderIdentity();
    navigateTo((window.location.hash || "#overview").slice(1), false);

    await loadAllData();
    renderEverything();
    console.info("[init] data loaded");
  } catch (err) {
    console.error("[init] failed:", err);
    hideBoot();
    warnConnection("Something went wrong while loading your data. Check the console.");
    navigateTo((window.location.hash || "#overview").slice(1), false);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initDashboard);
else initDashboard();
