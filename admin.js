/* ============================================================
   SKILLED-CREATIVES INTERNATIONAL — ADMIN DASHBOARD
   You are the only seller. This is where products, orders,
   courses and content are managed.

   ACCESS
   Gated twice, and the second gate is the one that counts:
     1. This file checks profiles.is_admin and redirects if false.
        Convenience only — anyone can edit JavaScript.
     2. Row Level Security. Every admin policy calls public.is_admin(),
        so a non-admin who forces their way here sees empty tables.
        Run supabase/admin.sql and supabase/marketplace.sql.

   The client is named `sb`, not `supabase`: Safari throws a SyntaxError
   when a top-level let shadows an existing global property.
   ============================================================ */

const CONFIG = {
  SUPABASE_URL: "https://aezepgnnykxqitzhhmen.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlemVwZ25ueWt4cWl0emhobWVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MDUwNTYsImV4cCI6MjEwMzE4MTA1Nn0.Ds9Vhp0ula5JxH5mZ-YVoEWQji2bNXuuzGYo_lInwDI",
  AUTH_PAGE: "auth.html",
  MEMBER_PAGE: "dashboard.html"
};

const state = {
  user: null, profile: null,
  stats: {},
  products: [], orders: [], courses: [], members: [], posts: [], faqs: [],
  ui: {
    section: "overview",
    orderTab: "new", orderQuery: "",
    productQuery: "", memberQuery: "", contentTab: "posts"
  }
};

/* ---------- utilities ---------- */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

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

/** "30,000" -> 30000. type="number" rejects thousands separators outright. */
function parseAmount(el) {
  if (!el) return NaN;
  const raw = String(el.value || "").replace(/[^\d.]/g, "");
  return raw ? Number(raw) : NaN;
}

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

function confirmDelete(title, message, onConfirm) {
  openModal(title, `
    <p>${esc(message)}</p>
    <div class="modal__actions">
      <button class="btn" type="button" data-close-modal>Cancel</button>
      <button class="btn btn--danger" type="button" id="confirmBtn">Delete</button>
    </div>`, {
    onOpen(body) {
      body.querySelector("#confirmBtn").addEventListener("click", async ev => {
        const restore = setLoading(ev.currentTarget, "Deleting…");
        await onConfirm();
        restore();
        closeModal();
      });
    }
  });
}

/* ---------- supabase ---------- */
let sb = null;
let connectionWarned = false;

function warnConnection(msg) {
  if (connectionWarned) return;
  connectionWarned = true;
  $("#connBannerText").textContent = msg;
  $("#connBanner").hidden = false;
  icons();
}

async function safeQuery(label, run, fallback = []) {
  if (!sb) return { data: fallback, error: new Error("no client") };
  try {
    const { data, error } = await run();
    if (error) { console.warn(`[query:${label}]`, error.message || error); return { data: fallback, error }; }
    return { data: data ?? fallback, error: null };
  } catch (err) {
    console.warn(`[query:${label}]`, err);
    warnConnection("We could not reach the server.");
    return { data: fallback, error: err };
  }
}

/* ---------- boot ---------- */
let bootWatchdog = null;
function hideBoot() {
  const b = $("#boot");
  if (b) b.hidden = true;
  if (bootWatchdog) { clearTimeout(bootWatchdog); bootWatchdog = null; }
}

/* ---------- access gate ---------- */
async function loadAdmin() {
  const timeout = new Promise(r =>
    setTimeout(() => r({ data: null, error: new Error("getSession timed out") }), 10000));
  const { data, error } = await Promise.race([
    sb.auth.getSession().catch(err => ({ data: null, error: err })),
    timeout
  ]);

  if (error) {
    console.error("[auth]", error);
    hideBoot();
    warnConnection("Sign-in could not be checked. See the console.");
    return false;
  }
  if (!data || !data.session) { window.location.replace(CONFIG.AUTH_PAGE); return false; }

  state.user = data.session.user;

  const { data: profile } = await safeQuery("profile", () =>
    sb.from("profiles").select("*").eq("id", state.user.id).maybeSingle(), null);

  if (!profile || !profile.is_admin) {
    console.info("[auth] not an admin -> " + CONFIG.MEMBER_PAGE, profile);
    window.location.replace(CONFIG.MEMBER_PAGE);
    return false;
  }

  state.profile = profile;
  console.info("[auth] admin:", state.user.email);
  return true;
}

function renderIdentity() {
  const name = (state.profile && state.profile.full_name) || "Admin";
  $("#navUserName").textContent = name.split(" ")[0];
  $("#sideName").textContent = name;
  $("#sideEmail").textContent = (state.user && state.user.email) || "";
  $("#navAvatar").textContent = initials(name);
  $("#sideAvatar").textContent = initials(name);
  const h = new Date().getHours();
  $("#greeting").textContent =
    (h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening") + ", " + name.split(" ")[0];
}

/* ---------- data ---------- */
async function loadAll() {
  const [stats, products, orders, courses, members, posts, faqs] = await Promise.all([
    safeQuery("admin_stats", () => sb.rpc("admin_stats"), {}),
    safeQuery("products", () => sb.from("products").select("*").order("created_at", { ascending: false })),
    safeQuery("orders", () => sb.from("orders").select("*").order("created_at", { ascending: false }).limit(300)),
    safeQuery("courses", () => sb.from("courses").select("*").order("created_at", { ascending: false })),
    safeQuery("members", () => sb.rpc("admin_members")),
    safeQuery("posts", () => sb.from("community_posts").select("*").order("created_at", { ascending: false })),
    safeQuery("faqs", () => sb.from("faqs").select("*").order("sort_order", { ascending: true }))
  ]);

  state.stats = stats.data || {};
  state.products = products.data || [];
  state.orders = orders.data || [];
  state.courses = courses.data || [];
  state.members = members.data || [];
  state.posts = posts.data || [];
  state.faqs = faqs.data || [];

  if (stats.error) warnConnection("admin_stats() is missing. Run supabase/marketplace.sql.");
}

/* ---------- uploads ---------- */
/** Storage policy allows writes into a folder named after your user id. */
async function uploadImage(bucket, file) {
  if (!file) return null;
  if (file.size > 5 * 1024 * 1024) { showToast("That image is larger than 5MB.", "error"); return null; }
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${state.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  try {
    const { error } = await sb.storage.from(bucket).upload(path, file);
    if (error) throw error;
    return sb.storage.from(bucket).getPublicUrl(path).data.publicUrl;
  } catch (err) {
    console.warn("[upload]", err);
    showToast("Upload failed: " + (err.message || "check the bucket exists"), "error");
    return null;
  }
}

/* ---------- overview ---------- */
function renderOverview() {
  const s = state.stats;
  $("#adminStats").innerHTML = [
    { icon: "banknote", value: formatCurrency(s.sales || 0), label: "Marketplace sales" },
    { icon: "receipt", value: (s.new_orders || 0), label: "New orders", accent: true },
    { icon: "package", value: (s.products || 0), label: "Products" },
    { icon: "graduation-cap", value: formatCurrency(s.course_revenue || 0), label: "Course revenue" },
    { icon: "users", value: (s.members || 0).toLocaleString(), label: "Members" }
  ].map(c => `
    <article class="stat">
      <span class="stat__icon ${c.accent ? "stat__icon--accent" : ""}"><i data-lucide="${c.icon}"></i></span>
      <div class="stat__value">${esc(c.value)}</div>
      <div class="stat__label">${esc(c.label)}</div>
    </article>`).join("");

  const fresh = state.orders.filter(o => o.status === "new");
  const badge = $("#orderCount");
  badge.hidden = fresh.length === 0;
  badge.textContent = fresh.length;

  $("#newOrders").innerHTML = fresh.length
    ? `<table><thead><tr><th>Buyer</th><th>Product</th><th>Amount</th><th></th></tr></thead><tbody>
        ${fresh.slice(0, 8).map(o => `
          <tr>
            <td data-label="Buyer"><strong>${esc(o.buyer_name)}</strong><br>
              <small style="color:var(--muted)">${esc(o.buyer_phone)}</small></td>
            <td data-label="Product">${esc(o.product_name)} ×${Number(o.quantity) || 1}</td>
            <td data-label="Amount">${esc(formatCurrency(o.amount))}</td>
            <td data-label=""><button class="btn btn--sm btn--primary" type="button" data-view-order="${esc(o.id)}">Open</button></td>
          </tr>`).join("")}
      </tbody></table>`
    : emptyState("check-check", "No new orders", "Paid orders land here the moment Paystack confirms them.");

  const low = state.products.filter(p => Number(p.stock) <= 3 && p.status === "published");
  $("#lowStock").innerHTML = low.length
    ? low.slice(0, 8).map(p => `
      <div class="tl-item">
        <span class="tl-item__icon"><i data-lucide="${Number(p.stock) === 0 ? "circle-alert" : "package"}"></i></span>
        <div class="tl-item__body">
          <p><strong>${esc(p.name)}</strong></p>
          <time>${Number(p.stock) === 0 ? "Out of stock" : Number(p.stock) + " left"}</time>
        </div>
      </div>`).join("")
    : emptyState("package-check", "Stock looks healthy", "Products with three or fewer left show up here.");
  icons();
}

/* ---------- orders ---------- */
function renderOrders() {
  const paid = state.orders.filter(o => o.payment_status === "paid");
  const total = paid.reduce((s, o) => s + Number(o.amount || 0), 0);
  const delivered = state.orders.filter(o => o.status === "delivered").length;
  const pending = state.orders.filter(o => ["new", "confirmed", "shipped"].includes(o.status)).length;

  $("#orderStats").innerHTML = [
    { icon: "banknote", value: formatCurrency(total), label: "Total collected" },
    { icon: "receipt", value: state.orders.length, label: "Orders" },
    { icon: "clock", value: pending, label: "Awaiting delivery", accent: true },
    { icon: "circle-check-big", value: delivered, label: "Delivered" }
  ].map(s => `
    <article class="stat">
      <span class="stat__icon ${s.accent ? "stat__icon--accent" : ""}"><i data-lucide="${s.icon}"></i></span>
      <div class="stat__value">${esc(s.value)}</div>
      <div class="stat__label">${esc(s.label)}</div>
    </article>`).join("");

  const tab = state.ui.orderTab;
  const q = state.ui.orderQuery.trim().toLowerCase();
  const list = state.orders.filter(o => {
    const okTab = tab === "all" || o.status === tab;
    const okQ = !q ||
      (o.buyer_name || "").toLowerCase().includes(q) ||
      (o.buyer_phone || "").toLowerCase().includes(q) ||
      (o.buyer_email || "").toLowerCase().includes(q) ||
      (o.order_ref || "").toLowerCase().includes(q) ||
      (o.product_name || "").toLowerCase().includes(q);
    return okTab && okQ;
  });

  const wrap = $("#orderList");
  if (!list.length) {
    wrap.innerHTML = emptyState("receipt",
      state.orders.length ? "Nothing in this view" : "No orders yet",
      state.orders.length ? "Try another tab or clear the search."
                          : "Orders appear here as soon as a buyer pays on the marketplace.");
    icons();
    return;
  }

  wrap.innerHTML = `<table>
    <thead><tr><th>Order</th><th>Buyer</th><th>Product</th><th>Amount</th><th>Status</th><th></th></tr></thead>
    <tbody>${list.map(o => `
      <tr>
        <td data-label="Order">
          <span style="font-family:'IBM Plex Mono';font-size:.74rem">${esc(o.order_ref)}</span><br>
          <small style="color:var(--muted)">${esc(timeAgo(o.created_at))}</small>
        </td>
        <td data-label="Buyer"><strong>${esc(o.buyer_name)}</strong><br>
          <small style="color:var(--muted)">${esc(o.buyer_phone)}</small></td>
        <td data-label="Product">${esc(o.product_name)} ×${Number(o.quantity) || 1}</td>
        <td data-label="Amount">${esc(formatCurrency(o.amount))}</td>
        <td data-label="Status">
          <select class="status-select" data-order-status="${esc(o.id)}" aria-label="Order status">
            ${["new", "confirmed", "shipped", "delivered", "cancelled"].map(s =>
              `<option value="${s}" ${o.status === s ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </td>
        <td data-label=""><div class="row-actions">
          <button class="btn btn--sm" type="button" data-view-order="${esc(o.id)}">Details</button>
          <a class="btn btn--sm" href="https://wa.me/${esc(String(o.buyer_phone || "").replace(/\D/g, ""))}" target="_blank" rel="noopener">Chat</a>
        </div></td>
      </tr>`).join("")}</tbody></table>`;
  icons();
}

function openOrder(id) {
  const o = state.orders.find(x => String(x.id) === String(id));
  if (!o) return;
  const phone = String(o.buyer_phone || "").replace(/\D/g, "");

  openModal("Order " + o.order_ref, `
    <div class="summary">
      <div class="summary__row"><span>Product</span><span>${esc(o.product_name)}</span></div>
      <div class="summary__row"><span>Unit price</span><span>${esc(formatCurrency(o.unit_price))}</span></div>
      <div class="summary__row"><span>Quantity</span><span>${Number(o.quantity) || 1}</span></div>
      <div class="summary__row summary__row--total"><span>Paid</span><span>${esc(formatCurrency(o.amount))}</span></div>
    </div>

    <h3 style="margin-top:16px;font-family:'Space Grotesk'">Buyer</h3>
    <div class="summary">
      <div class="summary__row"><span>Name</span><span>${esc(o.buyer_name)}</span></div>
      <div class="summary__row"><span>Phone</span><span>${esc(o.buyer_phone)}</span></div>
      <div class="summary__row"><span>Email</span><span>${esc(o.buyer_email)}</span></div>
      <div class="summary__row"><span>Address</span><span style="text-align:right;max-width:60%">${esc(o.buyer_address || "—")}</span></div>
      <div class="summary__row"><span>Paid on</span><span>${esc(formatDate(o.created_at))}</span></div>
      <div class="summary__row"><span>Reference</span><span style="font-family:'IBM Plex Mono';font-size:.76rem">${esc(o.payment_reference || o.order_ref)}</span></div>
    </div>

    <div class="form-field" style="margin-top:14px">
      <label for="o-note">Internal note</label>
      <textarea id="o-note" placeholder="Delivery details, courier, anything worth remembering">${esc(o.note || "")}</textarea>
    </div>

    <div class="modal__actions">
      <button class="btn" type="button" id="saveNote">Save note</button>
      ${phone ? `<a class="btn btn--accent" href="https://wa.me/${esc(phone)}" target="_blank" rel="noopener">
        <i data-lucide="message-circle"></i> Message buyer</a>` : ""}
    </div>`, {
    onOpen(body) {
      body.querySelector("#saveNote").addEventListener("click", async ev => {
        const restore = setLoading(ev.currentTarget, "Saving…");
        const note = body.querySelector("#o-note").value.trim() || null;
        const { error } = await safeQuery("order-note", () =>
          sb.from("orders").update({ note }).eq("id", o.id));
        restore();
        if (error) { showToast("The note could not be saved.", "error"); return; }
        o.note = note;
        closeModal();
        showToast("Note saved.", "success");
      });
    }
  });
}

async function setOrderStatus(id, status) {
  const o = state.orders.find(x => String(x.id) === String(id));
  if (!o) return;
  const previous = o.status;
  o.status = status;

  const { error } = await safeQuery("order-status", () =>
    sb.from("orders").update({ status }).eq("id", id));

  if (error) {
    o.status = previous;
    renderOrders();
    showToast("The status could not be updated.", "error");
    return;
  }
  state.stats.new_orders = state.orders.filter(x => x.status === "new").length;
  renderOrders();
  renderOverview();
  showToast(`Order marked ${status}.`, "success");
}

/* ---------- products ---------- */
function renderProducts() {
  const q = state.ui.productQuery.trim().toLowerCase();
  const list = state.products.filter(p => !q ||
    (p.name || "").toLowerCase().includes(q) ||
    (p.category || "").toLowerCase().includes(q) ||
    (p.sku || "").toLowerCase().includes(q));

  const wrap = $("#productList");
  if (!list.length) {
    wrap.innerHTML = emptyState("package",
      state.products.length ? "No product matched" : "No products yet",
      state.products.length ? "Try a different word."
                            : "Add your first product and it goes live on the marketplace straight away.",
      `<button class="btn btn--primary" type="button" data-action="new-product">Add product</button>`);
    icons();
    return;
  }

  wrap.innerHTML = `<table>
    <thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Sold</th><th>Status</th><th></th></tr></thead>
    <tbody>${list.map(p => {
      const sold = state.orders
        .filter(o => o.product_id === p.id && o.payment_status === "paid")
        .reduce((s, o) => s + (Number(o.quantity) || 1), 0);
      return `<tr>
        <td data-label="Product">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="thumb-sm">${p.image_url
              ? `<img src="${esc(p.image_url)}" alt="" onerror="this.remove()" />`
              : `<i data-lucide="image"></i>`}</span>
            <span><strong>${esc(p.name)}</strong><br>
              <small style="color:var(--muted)">${esc(p.category || "Uncategorised")}</small></span>
          </div>
        </td>
        <td data-label="Price">${esc(formatCurrency(p.discount_price || p.price))}
          ${p.discount_price ? `<br><small style="color:var(--muted);text-decoration:line-through">${esc(formatCurrency(p.price))}</small>` : ""}</td>
        <td data-label="Stock">${Number(p.stock) <= 0
          ? `<span class="badge badge--danger">Out</span>`
          : Number(p.stock) <= 3
            ? `<span class="badge badge--pending">${Number(p.stock)} left</span>`
            : Number(p.stock)}</td>
        <td data-label="Sold">${sold}</td>
        <td data-label="Status"><span class="badge ${p.status === "published" ? "badge--ok" : "badge--muted"}">${esc(p.status)}</span></td>
        <td data-label=""><div class="row-actions">
          <button class="btn btn--sm" type="button" data-edit-product="${esc(p.id)}">Edit</button>
          <button class="btn btn--sm" type="button" data-toggle-product="${esc(p.id)}">${p.status === "published" ? "Unpublish" : "Publish"}</button>
          <button class="btn btn--sm btn--ghost" type="button" data-delete-product="${esc(p.id)}" style="color:var(--red)">Delete</button>
        </div></td>
      </tr>`;
    }).join("")}</tbody></table>`;
  icons();
}

function openProductForm(product = null) {
  const p = product || {};
  const cats = ["Fashion & Lifestyle", "Organic Products", "Technology", "Renewable Energy",
                "Beauty", "Food", "Books", "Services", "Other"];

  openModal(product ? "Edit product" : "Add product", `
    <div class="form-grid form-grid--2">
      <div class="form-field"><label for="pr-name">Product name</label>
        <input id="pr-name" value="${esc(p.name || "")}" /></div>
      <div class="form-field"><label for="pr-cat">Category</label>
        <select id="pr-cat">${cats.map(c => `<option ${p.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      <div class="form-field"><label for="pr-price">Price (₦)</label>
        <input id="pr-price" type="text" inputmode="decimal" value="${esc(p.price ?? "")}" placeholder="e.g. 30000" /></div>
      <div class="form-field"><label for="pr-disc">Discount price (₦)</label>
        <input id="pr-disc" type="text" inputmode="decimal" value="${esc(p.discount_price ?? "")}" placeholder="Optional" />
        <span class="hint">Must be lower than the price.</span></div>
      <div class="form-field"><label for="pr-stock">Stock quantity</label>
        <input id="pr-stock" type="text" inputmode="numeric" value="${esc(p.stock ?? 0)}" /></div>
      <div class="form-field"><label for="pr-sku">SKU</label>
        <input id="pr-sku" value="${esc(p.sku || "")}" placeholder="Optional" /></div>
      <div class="form-field"><label for="pr-cond">Condition</label>
        <select id="pr-cond">
          <option value="new" ${p.condition === "new" ? "selected" : ""}>New</option>
          <option value="used" ${p.condition === "used" ? "selected" : ""}>Used</option>
          <option value="refurbished" ${p.condition === "refurbished" ? "selected" : ""}>Refurbished</option>
        </select></div>
      <div class="form-field"><label for="pr-img">Product image</label>
        <input id="pr-img" type="file" accept="image/*" />
        ${p.image_url ? `<span class="hint">An image is already set. Choosing a new one replaces it.</span>` : ""}</div>
    </div>

    <div class="form-field" style="margin-top:14px"><label for="pr-desc">Description</label>
      <textarea id="pr-desc" placeholder="What makes it worth buying?">${esc(p.description || "")}</textarea></div>

    <label class="switch-row" for="pr-pub" style="margin-top:6px">
      <span><strong>Published</strong><small>Unpublished products are hidden from the marketplace.</small></span>
      <span class="switch"><input id="pr-pub" type="checkbox" ${p.status === "draft" ? "" : "checked"} /><span></span></span>
    </label>

    <div class="modal__actions">
      <button class="btn" type="button" data-close-modal>Cancel</button>
      <button class="btn btn--primary" type="button" id="saveProduct">${product ? "Save changes" : "Publish product"}</button>
    </div>`, {
    onOpen(body) {
      body.querySelector("#saveProduct").addEventListener("click", async ev => {
        const name = body.querySelector("#pr-name").value.trim();
        const price = parseAmount(body.querySelector("#pr-price"));
        const discount = parseAmount(body.querySelector("#pr-disc"));
        const stock = parseAmount(body.querySelector("#pr-stock"));

        if (!name) { showToast("Give the product a name.", "error"); return; }
        if (!Number.isFinite(price) || price <= 0) { showToast("Set a price above zero.", "error"); return; }
        if (Number.isFinite(discount) && discount >= price) {
          showToast("The discount price has to be lower than the price.", "error"); return;
        }

        const restore = setLoading(ev.currentTarget, product ? "Saving…" : "Publishing…");
        const file = body.querySelector("#pr-img").files[0];
        const imageUrl = file ? await uploadImage("product-images", file) : (p.image_url || null);

        const row = {
          name,
          category: body.querySelector("#pr-cat").value,
          price,
          discount_price: Number.isFinite(discount) ? discount : null,
          stock: Number.isFinite(stock) ? Math.round(stock) : 0,
          sku: body.querySelector("#pr-sku").value.trim() || null,
          condition: body.querySelector("#pr-cond").value,
          description: body.querySelector("#pr-desc").value.trim() || null,
          image_url: imageUrl,
          status: body.querySelector("#pr-pub").checked ? "published" : "draft"
        };

        const { data, error } = await safeQuery("product-save", () =>
          product ? sb.from("products").update(row).eq("id", product.id).select().maybeSingle()
                  : sb.from("products").insert(row).select().maybeSingle(), null);

        restore();
        if (error || !data) { showToast("The product could not be saved.", "error"); return; }

        if (product) {
          const i = state.products.findIndex(x => x.id === product.id);
          if (i > -1) state.products[i] = data;
        } else {
          state.products.unshift(data);
          state.stats.products = (state.stats.products || 0) + 1;
        }
        closeModal();
        renderProducts();
        renderOverview();
        showToast(product ? "Changes saved." : "Product published to the marketplace.", "success");
      });
    }
  });
}

/* ---------- courses ---------- */
function renderCourses() {
  const wrap = $("#courseList");
  if (!state.courses.length) {
    wrap.innerHTML = emptyState("graduation-cap", "No courses yet",
      "Add a course, upload the material, and members can buy and download it.",
      `<button class="btn btn--primary" type="button" data-action="new-course">New course</button>`);
    icons();
    return;
  }

  wrap.innerHTML = `<table>
    <thead><tr><th>Course</th><th>Price</th><th>Material</th><th>Status</th><th></th></tr></thead>
    <tbody>${state.courses.map(c => `
      <tr>
        <td data-label="Course"><strong>${esc(c.title)}</strong><br>
          <small style="color:var(--muted)">${esc(c.category || "")}${c.instructor ? " · " + esc(c.instructor) : ""}</small></td>
        <td data-label="Price">${Number(c.price) > 0 ? esc(formatCurrency(c.price)) : "Free"}</td>
        <td data-label="Material">${c.file_name
          ? `<span class="badge badge--ok"><i data-lucide="file-text"></i> ${esc(c.file_name.slice(0, 18))}</span>`
          : `<span class="badge badge--pending">Not uploaded</span>`}</td>
        <td data-label="Status"><span class="badge ${c.is_published ? "badge--ok" : "badge--muted"}">${c.is_published ? "Published" : "Draft"}</span></td>
        <td data-label=""><div class="row-actions">
          <button class="btn btn--sm" type="button" data-edit-course="${esc(c.id)}">Edit</button>
          <button class="btn btn--sm" type="button" data-toggle-course="${esc(c.id)}">${c.is_published ? "Unpublish" : "Publish"}</button>
          <button class="btn btn--sm btn--ghost" type="button" data-delete-course="${esc(c.id)}" style="color:var(--red)">Delete</button>
        </div></td>
      </tr>`).join("")}</tbody></table>`;
  icons();
}

function openCourseForm(course = null) {
  const c = course || {};
  const cats = ["AI", "Technology", "Business", "Digital Skills", "Design", "Marketing"];
  const levels = ["Beginner", "Intermediate", "Advanced"];

  openModal(course ? "Edit course" : "New course", `
    <div class="form-grid form-grid--2">
      <div class="form-field"><label for="c-title">Title</label>
        <input id="c-title" value="${esc(c.title || "")}" /></div>
      <div class="form-field"><label for="c-cat">Category</label>
        <select id="c-cat">${cats.map(x => `<option ${c.category === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      <div class="form-field"><label for="c-instructor">Author</label>
        <input id="c-instructor" value="${esc(c.instructor || "")}" /></div>
      <div class="form-field"><label for="c-duration">Length</label>
        <input id="c-duration" value="${esc(c.duration || "")}" placeholder="e.g. 84 pages" /></div>
      <div class="form-field"><label for="c-level">Level</label>
        <select id="c-level">${levels.map(x => `<option ${c.level === x ? "selected" : ""}>${x}</option>`).join("")}</select></div>
      <div class="form-field"><label for="c-price">Price (₦)</label>
        <input id="c-price" type="text" inputmode="decimal" value="${esc(c.price ?? "")}" placeholder="0 for free" /></div>
      <div class="form-field"><label for="c-thumb">Cover image URL</label>
        <input id="c-thumb" value="${esc(c.thumbnail_url || "")}" placeholder="Optional" /></div>
      <div class="form-field"><label for="c-file">Course file (PDF / EPUB)</label>
        <input id="c-file" type="file" accept=".pdf,.epub,.zip,.doc,.docx" />
        ${c.file_name ? `<span class="hint">Current: ${esc(c.file_name)}</span>` : `<span class="hint">Up to 50MB.</span>`}</div>
    </div>

    <div class="form-field" style="margin-top:14px"><label for="c-desc">Description</label>
      <textarea id="c-desc">${esc(c.description || "")}</textarea></div>

    <label class="switch-row" for="c-pub" style="margin-top:6px">
      <span><strong>Published</strong><small>Drafts stay hidden from members.</small></span>
      <span class="switch"><input id="c-pub" type="checkbox" ${c.is_published === false ? "" : "checked"} /><span></span></span>
    </label>

    <div class="modal__actions">
      <button class="btn" type="button" data-close-modal>Cancel</button>
      <button class="btn btn--primary" type="button" id="saveCourse">${course ? "Save changes" : "Create course"}</button>
    </div>`, {
    onOpen(body) {
      body.querySelector("#saveCourse").addEventListener("click", async ev => {
        const title = body.querySelector("#c-title").value.trim();
        const price = parseAmount(body.querySelector("#c-price"));
        if (!title) { showToast("Give the course a title.", "error"); return; }

        const restore = setLoading(ev.currentTarget, "Saving…");
        const row = {
          title,
          slug: title.toLowerCase().replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").slice(0, 60),
          category: body.querySelector("#c-cat").value,
          instructor: body.querySelector("#c-instructor").value.trim() || null,
          duration: body.querySelector("#c-duration").value.trim() || null,
          level: body.querySelector("#c-level").value,
          price: Number.isFinite(price) ? price : 0,
          thumbnail_url: body.querySelector("#c-thumb").value.trim() || null,
          description: body.querySelector("#c-desc").value.trim() || null,
          is_published: body.querySelector("#c-pub").checked
        };

        const { data, error } = await safeQuery("course-save", () =>
          course ? sb.from("courses").update(row).eq("id", course.id).select().maybeSingle()
                 : sb.from("courses").insert(row).select().maybeSingle(), null);

        if (error || !data) { restore(); showToast("The course could not be saved.", "error"); return; }

        // The file path needs the course id, so the upload happens after the row exists.
        const file = body.querySelector("#c-file").files[0];
        if (file) {
          if (file.size > 50 * 1024 * 1024) {
            showToast("That file is over 50MB, the free-plan limit.", "error");
          } else {
            const path = `${data.id}/${file.name.replace(/[^\w.\-]/g, "_")}`;
            const up = await sb.storage.from("course-files").upload(path, file, { upsert: true });
            if (up.error) {
              showToast("File upload failed: " + up.error.message, "error");
            } else {
              const patch = { file_path: path, file_name: file.name, file_size: file.size, file_type: file.type };
              await safeQuery("course-file", () => sb.from("courses").update(patch).eq("id", data.id));
              Object.assign(data, patch);
            }
          }
        }

        restore();
        if (course) {
          const i = state.courses.findIndex(x => x.id === course.id);
          if (i > -1) state.courses[i] = data;
        } else {
          state.courses.unshift(data);
        }
        closeModal();
        renderCourses();
        showToast(course ? "Course updated." : "Course created.", "success");
      });
    }
  });
}

/* ---------- members ---------- */
function renderMembers() {
  const q = state.ui.memberQuery.trim().toLowerCase();
  const list = state.members.filter(m => !q ||
    (m.full_name || "").toLowerCase().includes(q) ||
    (m.email || "").toLowerCase().includes(q) ||
    (m.city || "").toLowerCase().includes(q) ||
    (m.state || "").toLowerCase().includes(q));

  const wrap = $("#memberList");
  if (!list.length) {
    wrap.innerHTML = emptyState("users", q ? "No member matched" : "No members yet",
      q ? "Try a different name, email or city." : "Registrations will appear here.");
    icons();
    return;
  }

  wrap.innerHTML = `<table>
    <thead><tr><th>Member</th><th>Location</th><th>Interest</th><th>Onboarded</th><th>Joined</th></tr></thead>
    <tbody>${list.map(m => `
      <tr>
        <td data-label="Member"><strong>${esc(m.full_name || "Unnamed")}</strong><br>
          <small style="color:var(--muted)">${esc(m.email || "")}</small></td>
        <td data-label="Location">${esc([m.city, m.state].filter(Boolean).join(", ") || "—")}</td>
        <td data-label="Interest">${esc(m.interest_path || "—")}</td>
        <td data-label="Onboarded">${m.onboarded_at
          ? `<span class="badge badge--ok">Yes</span>` : `<span class="badge badge--muted">No</span>`}</td>
        <td data-label="Joined">${esc(formatDate(m.created_at))}</td>
      </tr>`).join("")}</tbody></table>`;
  icons();
}

/* ---------- content ---------- */
function renderContent() {
  const body = $("#contentBody");

  if (state.ui.contentTab === "faqs") {
    body.innerHTML = `
      <div class="section-head">
        <h2>FAQs</h2>
        <button class="btn btn--primary btn--sm" type="button" data-action="new-faq"><i data-lucide="plus"></i> New FAQ</button>
      </div>
      ${state.faqs.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Question</th><th>Category</th><th>Order</th><th></th></tr></thead>
        <tbody>${state.faqs.map(f => `
          <tr>
            <td data-label="Question"><strong>${esc(f.question)}</strong><br>
              <small style="color:var(--muted)">${esc((f.answer || "").slice(0, 90))}…</small></td>
            <td data-label="Category">${esc(f.category)}</td>
            <td data-label="Order">${Number(f.sort_order) || 0}</td>
            <td data-label=""><div class="row-actions">
              <button class="btn btn--sm" type="button" data-edit-faq="${esc(f.id)}">Edit</button>
              <button class="btn btn--sm btn--ghost" type="button" data-delete-faq="${esc(f.id)}" style="color:var(--red)">Delete</button>
            </div></td>
          </tr>`).join("")}</tbody></table></div>`
      : emptyState("circle-help", "No FAQs yet", "These answers also feed the support assistant on the member dashboard.")}`;
    icons();
    return;
  }

  body.innerHTML = `
    <div class="section-head">
      <h2>Community posts</h2>
      <button class="btn btn--primary btn--sm" type="button" data-action="new-post"><i data-lucide="plus"></i> New post</button>
    </div>
    ${state.posts.length ? `<div class="post-grid">${state.posts.map(p => `
      <article class="post post--${esc(p.kind)}">
        <span class="post__kind">${esc(p.kind)}${p.is_active ? "" : " · hidden"}</span>
        <h3>${esc(p.title)}</h3>
        <p>${esc((p.body || "").slice(0, 150))}</p>
        <div class="post__foot">${esc(p.author_name || "Skilled-Creatives")} · ${esc(p.event_date ? formatDate(p.event_date) : timeAgo(p.created_at))}</div>
        <div class="row-actions" style="margin-top:12px">
          <button class="btn btn--sm" type="button" data-edit-post="${esc(p.id)}">Edit</button>
          <button class="btn btn--sm" type="button" data-toggle-post="${esc(p.id)}">${p.is_active ? "Hide" : "Show"}</button>
          <button class="btn btn--sm btn--ghost" type="button" data-delete-post="${esc(p.id)}" style="color:var(--red)">Delete</button>
        </div>
      </article>`).join("")}</div>`
    : emptyState("megaphone", "Nothing posted", "Announcements and events show on the member community page.")}`;
  icons();
}

function openPostForm(post = null) {
  const p = post || {};
  const kinds = ["announcement", "event", "discussion", "opportunity"];
  openModal(post ? "Edit post" : "New post", `
    <div class="form-grid form-grid--2">
      <div class="form-field"><label for="p-title">Title</label><input id="p-title" value="${esc(p.title || "")}" /></div>
      <div class="form-field"><label for="p-kind">Type</label>
        <select id="p-kind">${kinds.map(k => `<option ${p.kind === k ? "selected" : ""}>${k}</option>`).join("")}</select></div>
      <div class="form-field"><label for="p-author">Author name</label>
        <input id="p-author" value="${esc(p.author_name || "Skilled-Creatives")}" /></div>
      <div class="form-field"><label for="p-date">Event date</label>
        <input id="p-date" type="date" value="${esc(p.event_date ? String(p.event_date).slice(0, 10) : "")}" />
        <span class="hint">Only used for events.</span></div>
    </div>
    <div class="form-field" style="margin-top:14px"><label for="p-body">Body</label>
      <textarea id="p-body">${esc(p.body || "")}</textarea></div>
    <div class="modal__actions">
      <button class="btn" type="button" data-close-modal>Cancel</button>
      <button class="btn btn--primary" type="button" id="savePost">${post ? "Save changes" : "Publish post"}</button>
    </div>`, {
    onOpen(body) {
      body.querySelector("#savePost").addEventListener("click", async ev => {
        const title = body.querySelector("#p-title").value.trim();
        if (!title) { showToast("Give the post a title.", "error"); return; }
        const restore = setLoading(ev.currentTarget, "Saving…");
        const row = {
          title,
          kind: body.querySelector("#p-kind").value,
          author_name: body.querySelector("#p-author").value.trim() || "Skilled-Creatives",
          body: body.querySelector("#p-body").value.trim() || null,
          event_date: body.querySelector("#p-date").value || null,
          is_active: true
        };
        const { data, error } = await safeQuery("post-save", () =>
          post ? sb.from("community_posts").update(row).eq("id", post.id).select().maybeSingle()
               : sb.from("community_posts").insert(row).select().maybeSingle(), null);
        restore();
        if (error || !data) { showToast("The post could not be saved.", "error"); return; }
        if (post) {
          const i = state.posts.findIndex(x => x.id === post.id);
          if (i > -1) state.posts[i] = data;
        } else { state.posts.unshift(data); }
        closeModal();
        renderContent();
        showToast(post ? "Post updated." : "Post published.", "success");
      });
    }
  });
}

function openFaqForm(faq = null) {
  const f = faq || {};
  const cats = ["Account", "Courses", "Payments", "Marketplace", "Community"];
  openModal(faq ? "Edit FAQ" : "New FAQ", `
    <div class="form-grid form-grid--2">
      <div class="form-field"><label for="f-cat">Category</label>
        <select id="f-cat">${cats.map(c => `<option ${f.category === c ? "selected" : ""}>${c}</option>`).join("")}</select></div>
      <div class="form-field"><label for="f-order">Sort order</label>
        <input id="f-order" type="text" inputmode="numeric" value="${esc(f.sort_order ?? 0)}" /></div>
    </div>
    <div class="form-field" style="margin-top:14px"><label for="f-q">Question</label>
      <input id="f-q" value="${esc(f.question || "")}" /></div>
    <div class="form-field" style="margin-top:14px"><label for="f-a">Answer</label>
      <textarea id="f-a">${esc(f.answer || "")}</textarea>
      <span class="hint">The support assistant answers from this text, so keep it plain and complete.</span></div>
    <div class="modal__actions">
      <button class="btn" type="button" data-close-modal>Cancel</button>
      <button class="btn btn--primary" type="button" id="saveFaq">${faq ? "Save changes" : "Add FAQ"}</button>
    </div>`, {
    onOpen(body) {
      body.querySelector("#saveFaq").addEventListener("click", async ev => {
        const question = body.querySelector("#f-q").value.trim();
        const answer = body.querySelector("#f-a").value.trim();
        if (!question || !answer) { showToast("Both the question and the answer are needed.", "error"); return; }
        const restore = setLoading(ev.currentTarget, "Saving…");
        const order = parseAmount(body.querySelector("#f-order"));
        const row = {
          question, answer,
          category: body.querySelector("#f-cat").value,
          sort_order: Number.isFinite(order) ? Math.round(order) : 0
        };
        const { data, error } = await safeQuery("faq-save", () =>
          faq ? sb.from("faqs").update(row).eq("id", faq.id).select().maybeSingle()
              : sb.from("faqs").insert(row).select().maybeSingle(), null);
        restore();
        if (error || !data) { showToast("The FAQ could not be saved.", "error"); return; }
        if (faq) {
          const i = state.faqs.findIndex(x => x.id === faq.id);
          if (i > -1) state.faqs[i] = data;
        } else { state.faqs.push(data); }
        state.faqs.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        closeModal();
        renderContent();
        showToast(faq ? "FAQ updated." : "FAQ added.", "success");
      });
    }
  });
}

/* ---------- delegated actions ---------- */
function setupActions() {
  document.addEventListener("change", e => {
    const sel = e.target.closest("[data-order-status]");
    if (sel) setOrderStatus(sel.dataset.orderStatus, sel.value);
  });

  document.addEventListener("click", async e => {
    const t = e.target;

    if (t.closest("[data-close-modal]")) { closeModal(); return; }
    if (t.closest('[data-action="new-product"]')) { openProductForm(); return; }
    if (t.closest('[data-action="new-course"]'))  { openCourseForm();  return; }
    if (t.closest('[data-action="new-post"]'))    { openPostForm();    return; }
    if (t.closest('[data-action="new-faq"]'))     { openFaqForm();     return; }

    const viewOrder = t.closest("[data-view-order]");
    if (viewOrder) { openOrder(viewOrder.dataset.viewOrder); return; }

    const ep = t.closest("[data-edit-product]");
    if (ep) { openProductForm(state.products.find(p => String(p.id) === ep.dataset.editProduct)); return; }

    const tp = t.closest("[data-toggle-product]");
    if (tp) {
      const product = state.products.find(p => String(p.id) === tp.dataset.toggleProduct);
      if (!product) return;
      const next = product.status === "published" ? "draft" : "published";
      const { error } = await safeQuery("product-toggle", () =>
        sb.from("products").update({ status: next }).eq("id", product.id));
      if (error) { showToast("That could not be updated.", "error"); return; }
      product.status = next;
      renderProducts();
      showToast(next === "published" ? "Product is live on the marketplace." : "Product hidden.", "success");
      return;
    }

    const dp = t.closest("[data-delete-product]");
    if (dp) {
      const product = state.products.find(p => String(p.id) === dp.dataset.deleteProduct);
      if (!product) return;
      confirmDelete("Delete product", `Delete "${product.name}"? Past orders keep their record.`, async () => {
        const { error } = await safeQuery("product-delete", () => sb.from("products").delete().eq("id", product.id));
        if (error) { showToast("The product could not be deleted.", "error"); return; }
        state.products = state.products.filter(p => p.id !== product.id);
        renderProducts();
        renderOverview();
        showToast("Product deleted.", "success");
      });
      return;
    }

    const ec = t.closest("[data-edit-course]");
    if (ec) { openCourseForm(state.courses.find(c => String(c.id) === ec.dataset.editCourse)); return; }

    const tc = t.closest("[data-toggle-course]");
    if (tc) {
      const course = state.courses.find(c => String(c.id) === tc.dataset.toggleCourse);
      if (!course) return;
      const next = !course.is_published;
      const { error } = await safeQuery("course-toggle", () =>
        sb.from("courses").update({ is_published: next }).eq("id", course.id));
      if (error) { showToast("That could not be updated.", "error"); return; }
      course.is_published = next;
      renderCourses();
      showToast(next ? "Course published." : "Course unpublished.", "success");
      return;
    }

    const dc = t.closest("[data-delete-course]");
    if (dc) {
      const course = state.courses.find(c => String(c.id) === dc.dataset.deleteCourse);
      if (!course) return;
      confirmDelete("Delete course", `Delete "${course.title}"? Enrollments for it are removed too.`, async () => {
        const { error } = await safeQuery("course-delete", () => sb.from("courses").delete().eq("id", course.id));
        if (error) { showToast("The course could not be deleted.", "error"); return; }
        state.courses = state.courses.filter(c => c.id !== course.id);
        renderCourses();
        showToast("Course deleted.", "success");
      });
      return;
    }

    const epo = t.closest("[data-edit-post]");
    if (epo) { openPostForm(state.posts.find(p => String(p.id) === epo.dataset.editPost)); return; }

    const tpo = t.closest("[data-toggle-post]");
    if (tpo) {
      const post = state.posts.find(p => String(p.id) === tpo.dataset.togglePost);
      if (!post) return;
      const next = !post.is_active;
      const { error } = await safeQuery("post-toggle", () =>
        sb.from("community_posts").update({ is_active: next }).eq("id", post.id));
      if (error) { showToast("That could not be updated.", "error"); return; }
      post.is_active = next;
      renderContent();
      showToast(next ? "Post is live." : "Post hidden.", "success");
      return;
    }

    const dpo = t.closest("[data-delete-post]");
    if (dpo) {
      const post = state.posts.find(p => String(p.id) === dpo.dataset.deletePost);
      if (!post) return;
      confirmDelete("Delete post", `Delete "${post.title}"?`, async () => {
        const { error } = await safeQuery("post-delete", () => sb.from("community_posts").delete().eq("id", post.id));
        if (error) { showToast("The post could not be deleted.", "error"); return; }
        state.posts = state.posts.filter(p => p.id !== post.id);
        renderContent();
        showToast("Post deleted.", "success");
      });
      return;
    }

    const ef = t.closest("[data-edit-faq]");
    if (ef) { openFaqForm(state.faqs.find(f => String(f.id) === ef.dataset.editFaq)); return; }

    const df = t.closest("[data-delete-faq]");
    if (df) {
      const faq = state.faqs.find(f => String(f.id) === df.dataset.deleteFaq);
      if (!faq) return;
      confirmDelete("Delete FAQ", `Delete "${faq.question}"?`, async () => {
        const { error } = await safeQuery("faq-delete", () => sb.from("faqs").delete().eq("id", faq.id));
        if (error) { showToast("The FAQ could not be deleted.", "error"); return; }
        state.faqs = state.faqs.filter(f => f.id !== faq.id);
        renderContent();
        showToast("FAQ deleted.", "success");
      });
      return;
    }

    if (t.closest('[data-action="signout"]')) {
      closeAllMenus();
      openModal("Sign out", `
        <p>Sign out of the admin dashboard?</p>
        <div class="modal__actions">
          <button class="btn" type="button" data-close-modal>Cancel</button>
          <button class="btn btn--danger" type="button" id="confirmSignOut">Sign out</button>
        </div>`, {
        onOpen(body) {
          body.querySelector("#confirmSignOut").addEventListener("click", async ev => {
            setLoading(ev.currentTarget, "Signing out…");
            try { if (sb) await sb.auth.signOut(); } catch (err) { console.warn(err); }
            window.location.replace(CONFIG.AUTH_PAGE);
          });
        }
      });
    }
  });

  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (!$("#modalRoot").hidden) { closeModal(); return; }
    closeAllMenus();
    if ($("#sidebar").classList.contains("is-open")) closeSidebar();
  });
}

/* ---------- chrome ---------- */
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
function closeAllMenus() {
  const m = $("#userMenu");
  if (m) m.hidden = true;
  $("#userBtn").setAttribute("aria-expanded", "false");
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = $("#themeIcon");
  if (icon) { icon.setAttribute("data-lucide", theme === "dark" ? "sun" : "moon"); icons(); }
}

function setupChrome() {
  let saved = null;
  try { saved = localStorage.getItem("sc-theme"); } catch (_) {}
  applyTheme(saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

  $("#themeBtn").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem("sc-theme", next); } catch (_) {}
  });

  $("#menuBtn").addEventListener("click", () => {
    if (isDesktop()) document.body.classList.toggle("sidebar-collapsed");
    else $("#sidebar").classList.contains("is-open") ? closeSidebar() : openSidebar();
  });
  $("#closeSidebar").addEventListener("click", closeSidebar);
  $("#overlay").addEventListener("click", closeSidebar);
  $("#connBanner").querySelector(".conn-banner__close")
    .addEventListener("click", () => { $("#connBanner").hidden = true; });

  $("#userBtn").addEventListener("click", e => {
    e.stopPropagation();
    const m = $("#userMenu");
    const open = m.hidden;
    m.hidden = !open;
    $("#userBtn").setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", e => { if (!e.target.closest(".dropdown")) closeAllMenus(); });

  $("#refreshBtn").addEventListener("click", async ev => {
    const restore = setLoading(ev.currentTarget, "");
    await loadAll();
    restore();
    renderAll();
    showToast("Data refreshed.", "success");
  });

  $("#orderSearch").addEventListener("input", debounce(e => {
    state.ui.orderQuery = e.target.value; renderOrders();
  }, 200));
  $("#productSearch").addEventListener("input", debounce(e => {
    state.ui.productQuery = e.target.value; renderProducts();
  }, 200));
  $("#memberSearch").addEventListener("input", debounce(e => {
    state.ui.memberQuery = e.target.value; renderMembers();
  }, 200));

  $("#orderTabs").addEventListener("click", e => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    $$("#orderTabs .tab").forEach(t => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    state.ui.orderTab = tab.dataset.order;
    renderOrders();
  });

  $("#contentTabs").addEventListener("click", e => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    $$("#contentTabs .tab").forEach(t => t.classList.remove("is-active"));
    tab.classList.add("is-active");
    state.ui.contentTab = tab.dataset.content;
    renderContent();
  });
}

/* ---------- router ---------- */
const SECTIONS = ["overview", "orders", "products", "courses", "members", "content"];
const TITLES = {
  overview: "Overview", orders: "Orders", products: "Products",
  courses: "Courses", members: "Members", content: "Posts & FAQs"
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

  document.title = `${TITLES[section]} · Admin`;
  if (pushHash && window.location.hash !== `#${section}`) history.pushState({ section }, "", `#${section}`);
  if (!isDesktop()) closeSidebar();
  closeAllMenus();
  window.scrollTo(0, 0);

  if (section === "overview") renderOverview();
  if (section === "orders") renderOrders();
  if (section === "products") renderProducts();
  if (section === "courses") renderCourses();
  if (section === "members") renderMembers();
  if (section === "content") renderContent();
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

function renderAll() {
  renderIdentity();
  renderOverview();
  renderOrders();
  renderProducts();
  renderCourses();
  renderMembers();
  renderContent();
  icons();
}

/* ---------- init ---------- */
async function initAdmin() {
  bootWatchdog = setTimeout(() => {
    console.warn("[init] startup stalled — showing the shell.");
    hideBoot();
    warnConnection("This is taking longer than expected. Check the console.");
    navigateTo((window.location.hash || "#overview").slice(1), false);
  }, 12000);

  try {
    icons();
    setupChrome();
    setupNavigation();
    setupActions();
    console.info("[init] shell ready");
  } catch (err) {
    console.error("[init] setup failed:", err);
    hideBoot();
    warnConnection("Part of the admin dashboard failed to start.");
    return;
  }

  try {
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("Supabase library did not load");
    }
    sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    const allowed = await loadAdmin();
    if (!allowed) return;

    hideBoot();
    renderIdentity();
    navigateTo((window.location.hash || "#overview").slice(1), false);

    await loadAll();
    renderAll();
    console.info("[init] data loaded");
  } catch (err) {
    console.error("[init] failed:", err);
    hideBoot();
    warnConnection("Something went wrong while loading. Check the console.");
    navigateTo((window.location.hash || "#overview").slice(1), false);
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initAdmin);
else initAdmin();
