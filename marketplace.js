/* ============================================================
   SKILLED-CREATIVES MARKETPLACE
   Public page. No sign-in needed to browse or buy.

   THE FLOW
     browse -> Buy now -> buyer details -> Paystack -> our edge function
     verifies the payment with Paystack's secret key and writes the order
     -> buyer is handed off to WhatsApp with the order reference.

   The browser never creates the order. `orders` has no public insert
   policy, so a row can only appear after the server confirms the money.
   ============================================================ */

const CONFIG = {
  SUPABASE_URL: "https://aezepgnnykxqitzhhmen.supabase.co",
  SUPABASE_ANON_KEY:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlemVwZ25ueWt4cWl0emhobWVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2MDUwNTYsImV4cCI6MjEwMzE4MTA1Nn0.Ds9Vhp0ula5JxH5mZ-YVoEWQji2bNXuuzGYo_lInwDI",

  // Paystack PUBLIC key. The secret key belongs in the edge function only.
  PAYSTACK_PUBLIC_KEY: "pk_test_fc4908f5f039e232d323ac09a61fbb2e2f5f61fc",

  // Deployed from the Supabase dashboard. See supabase/functions/paystack-verify.
  PAYSTACK_VERIFY_ENDPOINT: "https://aezepgnnykxqitzhhmen.supabase.co/functions/v1/paystack-verify",

  // Where buyers are sent after paying, to confirm and arrange delivery.
  // International format, digits only.
  SALES_WHATSAPP: "2348000000000"
};

const state = {
  products: [],
  categories: [],
  ui: { query: "", category: "All" }
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
function parseAmount(el) {
  if (!el) return NaN;
  const raw = String(el.value || "").replace(/[^\d.]/g, "");
  return raw ? Number(raw) : NaN;
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

function showToast(message, type = "info") {
  const el = document.createElement("div");
  el.className = `toast toast--${type}`;
  el.setAttribute("role", "status");
  el.innerHTML = `<i data-lucide="${type === "success" ? "check-circle-2" : type === "error" ? "alert-circle" : "info"}"></i><span>${esc(message)}</span>`;
  $("#toastRoot").appendChild(el);
  icons();
  setTimeout(() => { el.classList.add("is-out"); setTimeout(() => el.remove(), 220); }, 4000);
}

function emptyState(icon, title, msg) {
  return `<div class="empty" style="grid-column:1/-1">
    <span class="empty__icon"><i data-lucide="${esc(icon)}"></i></span>
    <h3>${esc(title)}</h3><p>${esc(msg)}</p></div>`;
}

/* ---------- modal ---------- */
function openModal(title, html, options = {}) {
  $("#modalTitle").textContent = title;
  $("#modalBody").innerHTML = html;
  $("#modalRoot").hidden = false;
  document.body.classList.add("no-scroll");
  icons();
  if (options.onOpen) options.onOpen($("#modalBody"));
}
function closeModal() {
  $("#modalRoot").hidden = true;
  $("#modalBody").innerHTML = "";
  document.body.classList.remove("no-scroll");
}

/* ---------- supabase ---------- */
let sb = null;
function warnConnection(msg) {
  $("#connBannerText").textContent = msg;
  $("#connBanner").hidden = false;
  icons();
}

/* ---------- data ---------- */
async function loadProducts() {
  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq("status", "published")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[products]", error.message);
    warnConnection("Products could not be loaded. Please refresh.");
    return;
  }

  state.products = data || [];
  state.categories = Array.from(new Set(state.products.map(p => p.category).filter(Boolean))).sort();
}

/* ---------- rendering ---------- */
function renderFilters() {
  const wrap = $("#shopFilters");
  const cats = ["All", ...state.categories];
  wrap.innerHTML = cats.map(c =>
    `<button class="chip ${c === state.ui.category ? "is-active" : ""}" data-cat="${esc(c)}" role="tab">${esc(c)}</button>`
  ).join("");
  icons();
}

function visibleProducts() {
  const q = state.ui.query.trim().toLowerCase();
  return state.products.filter(p => {
    const okCat = state.ui.category === "All" || p.category === state.ui.category;
    const okQ = !q ||
      (p.name || "").toLowerCase().includes(q) ||
      (p.description || "").toLowerCase().includes(q) ||
      (p.category || "").toLowerCase().includes(q);
    return okCat && okQ;
  });
}

function renderProducts() {
  const grid = $("#shopGrid");
  const list = visibleProducts();

  if (!state.products.length) {
    grid.innerHTML = emptyState("package", "Nothing listed yet",
      "Products will appear here as soon as they go on sale.");
    icons();
    return;
  }
  if (!list.length) {
    grid.innerHTML = emptyState("search-x", "No product matched", "Try a different word or clear the filter.");
    icons();
    return;
  }

  grid.innerHTML = list.map(p => {
    const price = p.discount_price || p.price;
    const soldOut = Number(p.stock) <= 0;
    return `
      <article class="p-card">
        <div class="p-card__img">
          ${p.image_url ? `<img src="${esc(p.image_url)}" alt="${esc(p.name)}" loading="lazy" onerror="this.remove()" />`
                        : `<i data-lucide="image"></i>`}
        </div>
        <div class="p-card__body">
          ${p.category ? `<span class="p-card__meta">${esc(p.category)}</span>` : ""}
          <div class="p-card__name">${esc(p.name)}</div>
          <div class="p-card__price">${esc(formatCurrency(price))}
            ${p.discount_price ? `<span class="p-card__was">${esc(formatCurrency(p.price))}</span>` : ""}
          </div>
          <span class="p-card__meta">${soldOut ? "Out of stock" : Number(p.stock) + " available"}</span>
          <button class="btn btn--primary btn--sm" type="button" data-buy="${esc(p.id)}" ${soldOut ? "disabled" : ""}>
            ${soldOut ? "Sold out" : "Buy now"}
          </button>
        </div>
      </article>`;
  }).join("");
  icons();
}

/* ---------- checkout ---------- */
function openCheckout(product) {
  const price = Number(product.discount_price || product.price);
  const maxQty = Math.max(1, Number(product.stock) || 1);

  openModal("Checkout", `
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:6px">
      <span class="avatar" style="width:56px;height:56px;border-radius:10px;background:var(--bg)">
        ${product.image_url ? `<img src="${esc(product.image_url)}" alt="" onerror="this.remove()" />` : `<i data-lucide="image"></i>`}
      </span>
      <div>
        <strong style="font-family:'Space Grotesk';font-size:1rem">${esc(product.name)}</strong>
        <div style="color:var(--muted);font-size:.85rem">${esc(formatCurrency(price))} each</div>
      </div>
    </div>

    <div class="form-grid form-grid--2" style="margin-top:14px">
      <div class="form-field"><label for="b-name">Full name</label>
        <input id="b-name" autocomplete="name" /></div>
      <div class="form-field"><label for="b-phone">WhatsApp number</label>
        <input id="b-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="080…" />
        <span class="hint">We confirm your order on this number.</span></div>
      <div class="form-field"><label for="b-email">Email</label>
        <input id="b-email" type="email" autocomplete="email" />
        <span class="hint">Your Paystack receipt goes here.</span></div>
      <div class="form-field"><label for="b-qty">Quantity</label>
        <input id="b-qty" type="text" inputmode="numeric" value="1" />
        <span class="hint">${maxQty} available.</span></div>
    </div>

    <div class="form-field" style="margin-top:14px"><label for="b-address">Delivery address</label>
      <textarea id="b-address" placeholder="Street, area, city, state"></textarea></div>

    <div class="summary">
      <div class="summary__row"><span>Unit price</span><span>${esc(formatCurrency(price))}</span></div>
      <div class="summary__row"><span>Quantity</span><span id="sumQty">1</span></div>
      <div class="summary__row summary__row--total"><span>Total</span><span id="sumTotal">${esc(formatCurrency(price))}</span></div>
    </div>

    <p style="color:var(--muted);font-size:.79rem">
      Delivery is arranged on WhatsApp after payment. Your card details never touch this page.
    </p>

    <div class="modal__actions">
      <button class="btn" type="button" data-close-modal>Cancel</button>
      <button class="btn btn--primary" type="button" id="payBtn"><i data-lucide="credit-card"></i> Pay with Paystack</button>
    </div>`, {
    onOpen(body) {
      const qtyInput = body.querySelector("#b-qty");

      const recalc = () => {
        let qty = parseAmount(qtyInput);
        if (!Number.isFinite(qty) || qty < 1) qty = 1;
        if (qty > maxQty) { qty = maxQty; qtyInput.value = String(maxQty); }
        body.querySelector("#sumQty").textContent = qty;
        body.querySelector("#sumTotal").textContent = formatCurrency(price * qty);
        return qty;
      };
      qtyInput.addEventListener("input", recalc);

      body.querySelector("#payBtn").addEventListener("click", ev => {
        const name = body.querySelector("#b-name").value.trim();
        const phone = body.querySelector("#b-phone").value.trim();
        const email = body.querySelector("#b-email").value.trim();
        const address = body.querySelector("#b-address").value.trim();
        const qty = recalc();

        if (name.length < 3) { showToast("Enter your full name.", "error"); return; }
        if (phone.replace(/\D/g, "").length < 10) { showToast("Enter a valid WhatsApp number.", "error"); return; }
        if (!/^\S+@\S+\.\S+$/.test(email)) { showToast("Enter a valid email address.", "error"); return; }
        if (address.length < 8) { showToast("Enter your delivery address.", "error"); return; }

        startPaystack(product, { name, phone, email, address, qty, price }, ev.currentTarget);
      });
    }
  });
}

/**
 * Open Paystack. Everything the server needs to build the order travels in
 * metadata, so the order can be reconstructed from the webhook alone if the
 * buyer's browser closes before the callback fires.
 */
function startPaystack(product, buyer, btn) {
  if (!window.PaystackPop || CONFIG.PAYSTACK_PUBLIC_KEY === "pk_test_fc4908f5f039e232d323ac09a61fbb2e2f5f61fc") {
    showToast("Payments are not configured yet. Please contact us on WhatsApp.", "error");
    return;
  }

  const restore = setLoading(btn, "Opening Paystack…");
  const total = buyer.price * buyer.qty;
  const reference = "SCM-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8).toUpperCase();

  try {
    const handler = window.PaystackPop.setup({
      key: CONFIG.PAYSTACK_PUBLIC_KEY,
      email: buyer.email,
      amount: Math.round(total * 100),   // kobo
      currency: "NGN",
      ref: reference,
      metadata: {
        purpose: "product_order",
        product_id: product.id,
        product_name: product.name,
        unit_price: buyer.price,
        quantity: buyer.qty,
        buyer_name: buyer.name,
        buyer_phone: buyer.phone,
        buyer_email: buyer.email,
        buyer_address: buyer.address,
        custom_fields: [
          { display_name: "Product", variable_name: "product", value: product.name },
          { display_name: "Quantity", variable_name: "quantity", value: String(buyer.qty) }
        ]
      },
      callback: function (response) {
        restore();
        finaliseOrder(product, buyer, response.reference);
      },
      onClose: function () {
        restore();
        showToast("Payment cancelled. Nothing was charged.", "info");
      }
    });
    handler.openIframe();
  } catch (err) {
    console.error("[paystack]", err);
    restore();
    showToast("Paystack could not open. Check your connection.", "error");
  }
}

async function finaliseOrder(product, buyer, reference) {
  closeModal();
  openModal("Confirming your payment", `
    <div style="display:grid;place-items:center;gap:12px;padding:18px 0">
      <span class="spinner" style="width:26px;height:26px;color:var(--blue)"></span>
      <p style="color:var(--muted);font-size:.9rem;text-align:center">
        Checking with Paystack. This takes a few seconds — please do not close this page.
      </p>
    </div>`);

  let orderRef = reference;
  let confirmed = false;

  try {
    const res = await fetch(CONFIG.PAYSTACK_VERIFY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: CONFIG.SUPABASE_ANON_KEY },
      body: JSON.stringify({ reference })
    });
    const result = await res.json();
    if (res.ok && result.status === "success") {
      confirmed = true;
      orderRef = result.order_ref || reference;
    } else {
      console.warn("[verify]", result);
    }
  } catch (err) {
    // The payment may still be fine — the webhook is the backstop.
    console.error("[verify]", err);
  }

  const total = buyer.price * buyer.qty;
  const message =
    `Hello Skilled-Creatives, I have just paid for an order.\n\n` +
    `Order: ${orderRef}\n` +
    `Product: ${product.name}\n` +
    `Quantity: ${buyer.qty}\n` +
    `Amount: ${formatCurrency(total)}\n` +
    `Name: ${buyer.name}\n` +
    `Address: ${buyer.address}\n\n` +
    `Please confirm and arrange delivery.`;

  const waLink = `https://wa.me/${CONFIG.SALES_WHATSAPP.replace(/\D/g, "")}?text=${encodeURIComponent(message)}`;

  closeModal();
  openModal(confirmed ? "Payment received" : "Payment submitted", `
    <div class="success-mark"><i data-lucide="${confirmed ? "check" : "clock"}"></i></div>
    <h3 style="text-align:center;font-family:'Space Grotesk'">
      ${confirmed ? "Thank you, your order is in" : "We are confirming your payment"}
    </h3>
    <p style="text-align:center;color:var(--muted);margin:8px 0 14px;font-size:.9rem">
      ${confirmed
        ? "Send us a message on WhatsApp so we can confirm delivery details."
        : "If any money left your account, your order is safe. Send us the reference on WhatsApp and we will sort it out."}
    </p>
    <p class="ref">${esc(orderRef)}</p>

    <div class="summary">
      <div class="summary__row"><span>Product</span><span>${esc(product.name)}</span></div>
      <div class="summary__row"><span>Quantity</span><span>${esc(buyer.qty)}</span></div>
      <div class="summary__row summary__row--total"><span>Paid</span><span>${esc(formatCurrency(total))}</span></div>
    </div>

    <div class="modal__actions">
      <button class="btn" type="button" data-close-modal>Close</button>
      <a class="btn btn--accent" id="waBtn" href="${esc(waLink)}" target="_blank" rel="noopener">
        <i data-lucide="message-circle"></i> Continue on WhatsApp
      </a>
    </div>`, {
    onOpen(body) {
      // Take them straight there — the modal stays behind if the tab is blocked.
      const link = body.querySelector("#waBtn");
      setTimeout(() => { try { link.click(); } catch (_) {} }, 1200);
    }
  });

  // Reflect the stock change without a reload.
  if (confirmed) {
    const p = state.products.find(x => x.id === product.id);
    if (p) p.stock = Math.max(0, Number(p.stock) - buyer.qty);
    renderProducts();
  }
}

/* ---------- theme ---------- */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  const icon = $("#themeIcon");
  if (icon) { icon.setAttribute("data-lucide", theme === "dark" ? "sun" : "moon"); icons(); }
}

/* ---------- events ---------- */
function setupEvents() {
  let saved = null;
  try { saved = localStorage.getItem("sc-theme"); } catch (_) {}
  applyTheme(saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));

  $("#themeBtn").addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    applyTheme(next);
    try { localStorage.setItem("sc-theme", next); } catch (_) {}
  });

  $("#connBanner").querySelector(".conn-banner__close")
    .addEventListener("click", () => { $("#connBanner").hidden = true; });

  $("#shopSearch").addEventListener("input", debounce(e => {
    state.ui.query = e.target.value;
    renderProducts();
  }, 200));

  $("#shopFilters").addEventListener("click", e => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    state.ui.category = chip.dataset.cat;
    renderFilters();
    renderProducts();
  });

  document.addEventListener("click", e => {
    if (e.target.closest("[data-close-modal]")) { closeModal(); return; }
    const buy = e.target.closest("[data-buy]");
    if (buy) {
      const product = state.products.find(p => String(p.id) === buy.dataset.buy);
      if (product) openCheckout(product);
    }
  });

  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !$("#modalRoot").hidden) closeModal();
  });
}

/* ---------- init ---------- */
async function initMarketplace() {
  const watchdog = setTimeout(() => {
    $("#boot").hidden = true;
    warnConnection("This is taking longer than expected. Please refresh.");
  }, 12000);

  try {
    icons();
    setupEvents();

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error("Supabase library did not load");
    }
    sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);

    await loadProducts();
    renderFilters();
    renderProducts();
  } catch (err) {
    console.error("[marketplace]", err);
    warnConnection("The marketplace could not load. Please refresh.");
  } finally {
    clearTimeout(watchdog);
    $("#boot").hidden = true;
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initMarketplace);
else initMarketplace();
