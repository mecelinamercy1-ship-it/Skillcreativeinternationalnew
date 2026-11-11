/* ============================================================
   MEMBER DASHBOARD — MY LIBRARY
   Shows the library books this member has paid for, with Read Now
   and Download PDF. Loaded after dashboard.js and shares its
   helpers (state, sb, esc, safeQuery, showToast ...).

   Access is re-checked on the server by the library-access Edge
   Function; the buttons here only ask for a short-lived link.
   ============================================================ */

state.myLibrary = { paid: [], pending: [] };

function myLibraryCover(path) {
  if (!path) return "";
  if (/^(https?:\/\/|\/|\.\/|assets\/)/.test(path)) return path;
  return sb.storage.from("library-covers").getPublicUrl(path).data.publicUrl;
}

async function loadMyLibrary() {
  if (!state.user) return;

  const { data } = await safeQuery("my-library", () =>
    sb.from("library_orders")
      .select("id, book_id, book_title, product, amount, payment_status, status, paid_at, created_at, library_books(slug, author, category, cover_path)")
      .eq("buyer_id", state.user.id)
      .order("created_at", { ascending: false }));

  const rows = data || [];
  state.myLibrary.paid = rows.filter(o => o.payment_status === "paid");
  state.myLibrary.pending = rows.filter(o => o.payment_status === "pending");
}

/** One entry per book, combining everything the member has bought of it. */
function myLibraryBooks() {
  const byBook = new Map();

  for (const o of state.myLibrary.paid) {
    const key = o.book_id || o.id;
    if (!byBook.has(key)) {
      const meta = o.library_books || {};
      byBook.set(key, {
        bookId: o.book_id,
        title: o.book_title,
        author: meta.author || "",
        cover: myLibraryCover(meta.cover_path),
        pdf: false, read: false, physical: null
      });
    }
    const entry = byBook.get(key);
    if (o.product === "pdf") { entry.pdf = true; entry.read = true; }
    if (o.product === "read") entry.read = true;
    if (o.product === "physical") entry.physical = o;
  }
  return Array.from(byBook.values());
}

function renderMyLibrary() {
  const wrap = document.getElementById("myLibraryList");
  if (!wrap) return;

  const books = myLibraryBooks();
  const pending = state.myLibrary.pending.length;

  const pendingNote = pending
    ? `<div class="lib-note"><i data-lucide="clock"></i>
        <span>${pending} payment${pending === 1 ? " is" : "s are"} still being confirmed. Refresh in a minute.
        If you were charged and it stays pending, message us with your order reference.</span></div>`
    : "";

  if (!books.length) {
    wrap.innerHTML = pendingNote + emptyState("book-open", "No library books yet",
      "Books you buy from the library appear here, ready to read or download.",
      `<a class="btn btn--primary" href="library.html">Browse the library</a>`);
    icons();
    return;
  }

  wrap.innerHTML = pendingNote + `<div class="lib-grid">${books.map(b => {
    const id = esc(b.bookId);
    const badges = [
      b.pdf ? `<span class="badge badge--ok">PDF</span>` : "",
      b.read && !b.pdf ? `<span class="badge badge--ok">Read online</span>` : "",
      b.physical ? `<span class="badge badge--pending">Physical · ${esc(b.physical.status || "new")}</span>` : ""
    ].join(" ");

    const buttons = [
      b.read ? `<button class="btn btn--primary btn--sm" type="button" data-lib-access="${id}" data-lib-mode="read">Read now</button>` : "",
      b.pdf ? `<button class="btn btn--sm" type="button" data-lib-access="${id}" data-lib-mode="download">Download PDF</button>` : ""
    ].join("");

    return `
      <article class="lib-card">
        <div class="lib-card__img">${b.cover
          ? `<img src="${esc(b.cover)}" alt="" loading="lazy" onerror="this.remove()" />`
          : `<i data-lucide="book-open"></i>`}</div>
        <div class="lib-card__body">
          <strong>${esc(b.title)}</strong>
          ${b.author ? `<small>${esc(b.author)}</small>` : ""}
          <div>${badges}</div>
          ${buttons
            ? `<div class="lib-card__actions">${buttons}</div>`
            : `<small>We will contact you about delivery.</small>`}
        </div>
      </article>`;
  }).join("")}</div>`;
  icons();
}

async function openMyLibraryAccess(bookId, mode, btn) {
  const isRead = mode === "read";
  // Open the tab now so the browser's popup blocker allows it.
  const win = isRead ? window.open("", "_blank") : null;
  const restore = setLoading(btn, isRead ? "Opening…" : "Preparing…");

  try {
    const { data, error } = await sb.functions.invoke("library-access", { body: { bookId, mode } });

    if (error) {
      let message = "Could not open this book. Please try again.";
      try {
        const body = await error.context.json();
        if (body && body.error) message = body.error;
      } catch (_) {}
      throw new Error(message);
    }
    if (!data || !data.url) throw new Error("Could not open this book. Please try again.");

    if (win) win.location.href = data.url;
    else window.location.href = data.url;
  } catch (err) {
    console.error("[library-access]", err);
    if (win) win.close();
    showToast(err.message || "Could not open this book.", "error");
  } finally {
    restore();
  }
}

document.addEventListener("click", e => {
  const btn = e.target.closest("[data-lib-access]");
  if (btn) openMyLibraryAccess(btn.dataset.libAccess, btn.dataset.libMode, btn);
});

/* Admins get a shortcut back to the admin dashboard. */
function addAdminLink() {
  const menu = document.getElementById("userMenu");
  if (!menu || menu.querySelector("[data-admin-link]")) return;
  if (!(state.profile && state.profile.is_admin)) return;

  const link = document.createElement("a");
  link.className = "menu__item";
  link.href = "admin.html";
  link.setAttribute("data-admin-link", "");
  link.innerHTML = `<i data-lucide="shield-check"></i> Admin dashboard`;
  menu.insertBefore(link, menu.firstChild);
  icons();
}
