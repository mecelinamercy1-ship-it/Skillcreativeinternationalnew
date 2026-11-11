/* ============================================================
   ADMIN — LIBRARY
   Manage library_books (covers + PDFs) and see library_orders.
   Loaded after admin.js and shares its helpers (state, sb, esc,
   safeQuery, openModal, confirmDelete ...). Nothing here runs
   until an admin is signed in: the data calls go through RLS.

   STORAGE
     library-covers  public   <slug>.<ext>
     library-files   private  <slug>/book.pdf   (served by the
                                library-access Edge Function)
   ============================================================ */

state.libraryBooks = [];
state.libraryOrders = [];
state.ui.libraryTab = "books";

const LIBRARY_CATEGORIES = [
  "Technology", "Education", "Business",
  "Entrepreneurship", "Personal Development", "Renewable Energy"
];

function slugify(text) {
  return String(text || "").toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

function libraryCoverUrl(path) {
  if (!path) return "";
  if (/^(https?:\/\/|\/|\.\/|assets\/)/.test(path)) return path;
  return sb.storage.from("library-covers").getPublicUrl(path).data.publicUrl;
}

async function loadLibraryData() {
  const [books, orders] = await Promise.all([
    safeQuery("library_books", () =>
      sb.from("library_books").select("*").order("publication_year", { ascending: false })),
    safeQuery("library_orders", () =>
      sb.from("library_orders").select("*").order("created_at", { ascending: false }).limit(300))
  ]);
  state.libraryBooks = books.data || [];
  state.libraryOrders = orders.data || [];
}

/* ---------- rendering ---------- */
function renderLibrary() {
  const paid = state.libraryOrders.filter(o => o.payment_status === "paid");
  const pending = state.libraryOrders.filter(o => o.payment_status === "pending");
  const revenue = paid.reduce((s, o) => s + Number(o.amount || 0), 0);
  const live = state.libraryBooks.filter(b => b.is_published).length;

  $("#libraryStats").innerHTML = [
    { icon: "banknote", value: formatCurrency(revenue), label: "Library revenue" },
    { icon: "receipt", value: paid.length, label: "Paid orders", accent: true },
    { icon: "clock", value: pending.length, label: "Pending payments" },
    { icon: "book-open", value: `${live} / ${state.libraryBooks.length}`, label: "Books live" }
  ].map(s => `
    <article class="stat">
      <span class="stat__icon ${s.accent ? "stat__icon--accent" : ""}"><i data-lucide="${s.icon}"></i></span>
      <div class="stat__value">${esc(s.value)}</div>
      <div class="stat__label">${esc(s.label)}</div>
    </article>`).join("");

  $$("#libraryTabs .tab").forEach(t =>
    t.classList.toggle("is-active", t.dataset.library === state.ui.libraryTab));

  if (state.ui.libraryTab === "orders") renderLibraryOrders();
  else renderLibraryBooks();
  icons();
}

function libraryPriceLine(b) {
  const parts = [];
  if (b.physical_available && b.physical_price != null) parts.push("Physical " + formatCurrency(b.physical_price));
  if (b.pdf_available && b.pdf_price != null) parts.push("PDF " + formatCurrency(b.pdf_price));
  if (b.online_available && b.online_price != null) parts.push("Online " + formatCurrency(b.online_price));
  return parts.length ? parts.join("<br>") : `<span class="badge badge--pending">No price set</span>`;
}

function renderLibraryBooks() {
  const wrap = $("#libraryBody");
  if (!state.libraryBooks.length) {
    wrap.innerHTML = emptyState("book-open", "No library books yet",
      "Add a book, upload its cover and PDF, and it appears on the library page.",
      `<button class="btn btn--primary" type="button" data-action="new-library-book">Add book</button>`);
    return;
  }

  wrap.innerHTML = `<table>
    <thead><tr><th>Book</th><th>Prices</th><th>Status</th><th></th></tr></thead>
    <tbody>${state.libraryBooks.map(b => {
      const cover = libraryCoverUrl(b.cover_path);
      return `<tr>
        <td data-label="Book">
          <div style="display:flex;align-items:center;gap:10px">
            <span class="thumb-sm">${cover
              ? `<img src="${esc(cover)}" alt="" onerror="this.remove()" />`
              : `<i data-lucide="image"></i>`}</span>
            <span><strong>${esc(b.title)}</strong>${b.is_featured ? ` <span class="badge badge--ok">Featured</span>` : ""}<br>
              <small style="color:var(--muted)">${esc(b.author || "")}${b.category ? " · " + esc(b.category) : ""}</small></span>
          </div>
        </td>
        <td data-label="Prices"><small>${libraryPriceLine(b)}</small></td>
        <td data-label="Status"><span class="badge ${b.is_published ? "badge--ok" : "badge--muted"}">${b.is_published ? "Published" : "Draft"}</span></td>
        <td data-label=""><div class="row-actions">
          <button class="btn btn--sm" type="button" data-edit-library="${esc(b.id)}">Edit</button>
          <button class="btn btn--sm" type="button" data-toggle-library="${esc(b.id)}">${b.is_published ? "Unpublish" : "Publish"}</button>
          <button class="btn btn--sm btn--ghost" type="button" data-delete-library="${esc(b.id)}" style="color:var(--red)">Delete</button>
        </div></td>
      </tr>`;
    }).join("")}</tbody></table>`;
}

const PRODUCT_LABEL = { physical: "Physical book", pdf: "PDF", read: "Read online" };

function renderLibraryOrders() {
  const wrap = $("#libraryBody");
  if (!state.libraryOrders.length) {
    wrap.innerHTML = emptyState("receipt", "No library orders yet",
      "Orders appear here as soon as someone starts a purchase on the library page.");
    return;
  }

  wrap.innerHTML = `<table>
    <thead><tr><th>Order</th><th>Buyer</th><th>Book</th><th>Amount</th><th>Payment</th><th>Delivery</th><th></th></tr></thead>
    <tbody>${state.libraryOrders.map(o => {
      const badge = o.payment_status === "paid" ? "badge--ok"
                  : o.payment_status === "failed" ? "badge--danger" : "badge--pending";
      return `<tr>
        <td data-label="Order">
          <span style="font-family:'IBM Plex Mono';font-size:.74rem">${esc(o.order_ref)}</span><br>
          <small style="color:var(--muted)">${esc(timeAgo(o.created_at))}</small>
        </td>
        <td data-label="Buyer"><strong>${esc(o.buyer_name || "—")}</strong><br>
          <small style="color:var(--muted)">${esc(o.buyer_email)}</small></td>
        <td data-label="Book">${esc(o.book_title)}<br>
          <small style="color:var(--muted)">${esc(PRODUCT_LABEL[o.product] || o.product)}</small></td>
        <td data-label="Amount">${esc(formatCurrency(o.amount))}</td>
        <td data-label="Payment"><span class="badge ${badge}">${esc(o.payment_status)}</span></td>
        <td data-label="Delivery">${o.product === "physical"
          ? `<select class="status-select" data-library-order-status="${esc(o.id)}" aria-label="Delivery status">
              ${["new", "confirmed", "shipped", "delivered", "cancelled"].map(s =>
                `<option value="${s}" ${o.status === s ? "selected" : ""}>${s}</option>`).join("")}
            </select>`
          : `<small style="color:var(--muted)">Digital</small>`}</td>
        <td data-label=""><div class="row-actions">
          <button class="btn btn--sm" type="button" data-view-library-order="${esc(o.id)}">Details</button>
          ${o.payment_status === "pending"
            ? `<button class="btn btn--sm" type="button" data-markpaid-library="${esc(o.id)}">Mark paid</button>` : ""}
        </div></td>
      </tr>`;
    }).join("")}</tbody></table>`;
}

function openLibraryOrder(id) {
  const o = state.libraryOrders.find(x => String(x.id) === String(id));
  if (!o) return;
  const phone = String(o.buyer_phone || "").replace(/\D/g, "");

  openModal("Order " + o.order_ref, `
    <div class="summary">
      <div class="summary__row"><span>Book</span><span>${esc(o.book_title)}</span></div>
      <div class="summary__row"><span>Option</span><span>${esc(PRODUCT_LABEL[o.product] || o.product)}</span></div>
      <div class="summary__row summary__row--total"><span>Amount</span><span>${esc(formatCurrency(o.amount))}</span></div>
    </div>
    <h3 style="margin-top:16px;font-family:'Space Grotesk'">Buyer</h3>
    <div class="summary">
      <div class="summary__row"><span>Name</span><span>${esc(o.buyer_name || "—")}</span></div>
      <div class="summary__row"><span>Email</span><span>${esc(o.buyer_email)}</span></div>
      <div class="summary__row"><span>Phone</span><span>${esc(o.buyer_phone || "—")}</span></div>
      <div class="summary__row"><span>Address</span><span style="text-align:right;max-width:60%">${esc(o.buyer_address || "—")}</span></div>
      <div class="summary__row"><span>Payment</span><span>${esc(o.payment_status)}</span></div>
      <div class="summary__row"><span>Paid on</span><span>${esc(o.paid_at ? formatDate(o.paid_at) : "—")}</span></div>
      <div class="summary__row"><span>Reference</span><span style="font-family:'IBM Plex Mono';font-size:.76rem">${esc(o.payment_reference || o.order_ref)}</span></div>
    </div>
    <div class="modal__actions">
      ${phone ? `<a class="btn btn--accent" href="https://wa.me/${esc(phone)}" target="_blank" rel="noopener">
        <i data-lucide="message-circle"></i> Message buyer</a>` : ""}
      <button class="btn" type="button" data-close-modal>Close</button>
    </div>`);
}

/* ---------- book form ---------- */
function openLibraryBookForm(book = null) {
  const b = book || {};
  const cats = Array.from(new Set([...LIBRARY_CATEGORIES, ...(b.category ? [b.category] : [])]));
  const priceVal = v => (v === null || v === undefined ? "" : esc(v));

  openModal(book ? "Edit book" : "Add book", `
    <div class="form-grid form-grid--2">
      <div class="form-field"><label for="lb-title">Title</label>
        <input id="lb-title" value="${esc(b.title || "")}" /></div>
      <div class="form-field"><label for="lb-slug">Slug</label>
        <input id="lb-slug" value="${esc(b.slug || "")}" ${book ? "disabled" : ""} placeholder="from-idea-to-income" />
        <span class="hint">${book
          ? "The slug cannot change: the PDF folder is named after it."
          : "Lowercase letters, numbers and dashes. The PDF folder uses this name."}</span></div>
      <div class="form-field"><label for="lb-author">Author</label>
        <input id="lb-author" value="${esc(b.author || "")}" /></div>
      <div class="form-field"><label for="lb-cat">Category</label>
        <select id="lb-cat">${cats.map(c => `<option ${b.category === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></div>
      <div class="form-field"><label for="lb-year">Publication year</label>
        <input id="lb-year" type="text" inputmode="numeric" value="${esc(b.publication_year || new Date().getFullYear())}" /></div>
    </div>

    <h3 style="margin:18px 0 6px;font-family:'Space Grotesk'">What can people buy?</h3>
    <div class="form-grid form-grid--2">
      ${[["physical", "Physical book"], ["pdf", "Complete PDF"], ["online", "Read online"]].map(([k, label]) => `
        <div class="form-field">
          <label for="lb-${k}-price">${label} price (₦)</label>
          <input id="lb-${k}-price" type="text" inputmode="decimal" value="${priceVal(b[k + "_price"])}" placeholder="e.g. 5000" />
          <label style="display:flex;gap:8px;align-items:center;margin-top:6px;font-weight:500">
            <input id="lb-${k}-on" type="checkbox" ${b[k + "_available"] ? "checked" : ""} style="width:auto" /> Available to buy
          </label>
        </div>`).join("")}
    </div>

    <div class="form-grid form-grid--2" style="margin-top:14px">
      <div class="form-field"><label for="lb-cover">Cover image</label>
        <input id="lb-cover" type="file" accept="image/*" />
        <span class="hint">${b.cover_path ? "Current: " + esc(b.cover_path) + ". " : ""}Portrait 3:4, 5MB or less. Replaces the current cover.</span></div>
      <div class="form-field"><label for="lb-pdf">Book PDF (private)</label>
        <input id="lb-pdf" type="file" accept="application/pdf,.pdf" />
        <span class="hint" id="lb-pdf-hint">Up to 50MB. Buyers get it through a short-lived secure link.</span></div>
    </div>

    <div class="form-field" style="margin-top:14px"><label for="lb-desc">Description</label>
      <textarea id="lb-desc">${esc(b.description || "")}</textarea></div>
    <div class="form-field" style="margin-top:14px"><label for="lb-preview">Preview text</label>
      <textarea id="lb-preview" placeholder="A short sample from the book">${esc(b.preview || "")}</textarea></div>

    <label class="switch-row" for="lb-feat" style="margin-top:6px">
      <span><strong>Featured</strong><small>Shown in the big banner on the library page. Feature one book at a time.</small></span>
      <span class="switch"><input id="lb-feat" type="checkbox" ${b.is_featured ? "checked" : ""} /><span></span></span>
    </label>
    <label class="switch-row" for="lb-pub">
      <span><strong>Published</strong><small>Unpublished books are hidden from the library.</small></span>
      <span class="switch"><input id="lb-pub" type="checkbox" ${book && !b.is_published ? "" : "checked"} /><span></span></span>
    </label>

    <div class="modal__actions">
      <button class="btn" type="button" data-close-modal>Cancel</button>
      <button class="btn btn--primary" type="button" id="saveLibraryBook">${book ? "Save changes" : "Add book"}</button>
    </div>`, {
    onOpen(body) {
      const titleInput = body.querySelector("#lb-title");
      const slugInput = body.querySelector("#lb-slug");

      if (!book) {
        titleInput.addEventListener("input", () => {
          if (!slugInput.dataset.touched) slugInput.value = slugify(titleInput.value);
        });
        slugInput.addEventListener("input", () => { slugInput.dataset.touched = "1"; });
      } else {
        // Tell the admin whether the PDF is already in storage.
        sb.storage.from("library-files").list(book.slug).then(({ data }) => {
          const has = (data || []).some(f => f.name === "book.pdf");
          body.querySelector("#lb-pdf-hint").textContent = has
            ? "A PDF is uploaded. Choose a file only to replace it."
            : "No PDF uploaded yet. Buyers cannot download until you add one.";
        }).catch(() => {});
      }

      body.querySelector("#saveLibraryBook").addEventListener("click", ev => saveLibraryBook(book, body, ev.currentTarget));
    }
  });
}

async function saveLibraryBook(book, body, btn) {
  const val = id => body.querySelector("#" + id);
  const title = val("lb-title").value.trim();
  const slug = book ? book.slug : slugify(val("lb-slug").value);
  const year = parseAmount(val("lb-year"));

  const kinds = ["physical", "pdf", "online"];
  const price = {}, on = {};
  for (const k of kinds) {
    price[k] = parseAmount(val(`lb-${k}-price`));
    on[k] = val(`lb-${k}-on`).checked;
    if (on[k] && !(Number.isFinite(price[k]) && price[k] > 0)) {
      showToast(`Set a price above zero for the ${k === "online" ? "online reading" : k} option, or untick it.`, "error");
      return;
    }
  }

  if (!title) { showToast("Give the book a title.", "error"); return; }
  if (!/^[a-z0-9-]{2,60}$/.test(slug)) { showToast("The slug needs lowercase letters, numbers and dashes.", "error"); return; }

  const coverFile = val("lb-cover").files[0];
  const pdfFile = val("lb-pdf").files[0];

  if (coverFile && coverFile.size > 5 * 1024 * 1024) { showToast("The cover is larger than 5MB.", "error"); return; }
  if (pdfFile) {
    if (!/\.pdf$/i.test(pdfFile.name)) { showToast("The book file must be a PDF.", "error"); return; }
    if (pdfFile.size > 50 * 1024 * 1024) { showToast("The PDF is over 50MB, the free-plan limit.", "error"); return; }
  }

  const restore = setLoading(btn, "Saving…");

  const hasPhysical = on.physical, hasDigital = on.pdf || on.online;
  const row = {
    title, slug,
    author: val("lb-author").value.trim() || null,
    category: val("lb-cat").value,
    description: val("lb-desc").value.trim() || null,
    preview: val("lb-preview").value.trim() || null,
    format: hasPhysical && hasDigital ? "both" : hasPhysical ? "physical" : "ebook",
    physical_price: Number.isFinite(price.physical) ? price.physical : null,
    pdf_price: Number.isFinite(price.pdf) ? price.pdf : null,
    online_price: Number.isFinite(price.online) ? price.online : null,
    physical_available: on.physical,
    pdf_available: on.pdf,
    online_available: on.online,
    is_featured: val("lb-feat").checked,
    is_published: val("lb-pub").checked,
    publication_year: Number.isFinite(year) ? Math.round(year) : new Date().getFullYear()
  };

  const { data, error } = await safeQuery("library-save", () =>
    book ? sb.from("library_books").update(row).eq("id", book.id).select().maybeSingle()
         : sb.from("library_books").insert(row).select().maybeSingle(), null);

  if (error || !data) {
    restore();
    const msg = error && error.message ? error.message : "Check the admin policy on library_books.";
    showToast("The book could not be saved: " + msg, "error");
    return;
  }

  // Files go in after the row exists, named from the slug.
  if (coverFile) {
    const ext = (coverFile.name.split(".").pop() || "jpg").toLowerCase();
    const path = `${slug}.${ext}`;
    const up = await sb.storage.from("library-covers").upload(path, coverFile, { upsert: true, contentType: coverFile.type });
    if (up.error) {
      showToast("Cover upload failed: " + up.error.message, "error");
    } else {
      const patch = await safeQuery("library-cover", () =>
        sb.from("library_books").update({ cover_path: path }).eq("id", data.id));
      if (!patch.error) data.cover_path = path;
    }
  }

  if (pdfFile) {
    const up = await sb.storage.from("library-files")
      .upload(`${slug}/book.pdf`, pdfFile, { upsert: true, contentType: "application/pdf" });
    if (up.error) showToast("PDF upload failed: " + up.error.message, "error");
  }

  restore();
  if (book) {
    const i = state.libraryBooks.findIndex(x => x.id === book.id);
    if (i > -1) state.libraryBooks[i] = data;
  } else {
    state.libraryBooks.unshift(data);
  }
  closeModal();
  renderLibrary();
  showToast(book ? "Book updated." : "Book added to the library.", "success");
}

/* ---------- events ---------- */
function setupLibrary() {
  $("#libraryTabs").addEventListener("click", e => {
    const tab = e.target.closest(".tab");
    if (!tab) return;
    state.ui.libraryTab = tab.dataset.library;
    renderLibrary();
  });

  document.addEventListener("change", async e => {
    const sel = e.target.closest("[data-library-order-status]");
    if (!sel) return;
    const o = state.libraryOrders.find(x => String(x.id) === sel.dataset.libraryOrderStatus);
    if (!o) return;
    const previous = o.status;
    o.status = sel.value;
    const { error } = await safeQuery("library-order-status", () =>
      sb.from("library_orders").update({ status: sel.value }).eq("id", o.id));
    if (error) {
      o.status = previous;
      renderLibrary();
      showToast("The status could not be updated.", "error");
      return;
    }
    showToast(`Order marked ${sel.value}.`, "success");
  });

  document.addEventListener("click", async e => {
    const t = e.target;

    if (t.closest('[data-action="new-library-book"]')) { openLibraryBookForm(); return; }

    const edit = t.closest("[data-edit-library]");
    if (edit) { openLibraryBookForm(state.libraryBooks.find(b => String(b.id) === edit.dataset.editLibrary)); return; }

    const view = t.closest("[data-view-library-order]");
    if (view) { openLibraryOrder(view.dataset.viewLibraryOrder); return; }

    const toggle = t.closest("[data-toggle-library]");
    if (toggle) {
      const b = state.libraryBooks.find(x => String(x.id) === toggle.dataset.toggleLibrary);
      if (!b) return;
      const next = !b.is_published;
      const { error } = await safeQuery("library-toggle", () =>
        sb.from("library_books").update({ is_published: next }).eq("id", b.id));
      if (error) { showToast("That could not be updated.", "error"); return; }
      b.is_published = next;
      renderLibrary();
      showToast(next ? "Book is live in the library." : "Book hidden.", "success");
      return;
    }

    const del = t.closest("[data-delete-library]");
    if (del) {
      const b = state.libraryBooks.find(x => String(x.id) === del.dataset.deleteLibrary);
      if (!b) return;
      confirmDelete("Delete book", `Delete "${b.title}"? Its PDF is removed too. Past orders keep their record.`, async () => {
        const { error } = await safeQuery("library-delete", () => sb.from("library_books").delete().eq("id", b.id));
        if (error) { showToast("The book could not be deleted.", "error"); return; }
        try { await sb.storage.from("library-files").remove([`${b.slug}/book.pdf`]); } catch (_) {}
        state.libraryBooks = state.libraryBooks.filter(x => x.id !== b.id);
        renderLibrary();
        showToast("Book deleted.", "success");
      });
      return;
    }

    const mark = t.closest("[data-markpaid-library]");
    if (mark) {
      const o = state.libraryOrders.find(x => String(x.id) === mark.dataset.markpaidLibrary);
      if (!o) return;
      openModal("Mark as paid", `
        <p>Only do this if you have confirmed the payment for <strong>${esc(o.order_ref)}</strong>
        in your Paystack dashboard. The buyer gets access straight away.</p>
        <div class="modal__actions">
          <button class="btn" type="button" data-close-modal>Cancel</button>
          <button class="btn btn--primary" type="button" id="confirmMarkPaid">Mark as paid</button>
        </div>`, {
        onOpen(body) {
          body.querySelector("#confirmMarkPaid").addEventListener("click", async ev => {
            const restore = setLoading(ev.currentTarget, "Saving…");
            const patch = { payment_status: "paid", paid_at: new Date().toISOString() };
            const { error } = await safeQuery("library-markpaid", () =>
              sb.from("library_orders").update(patch).eq("id", o.id));
            restore();
            if (error) { showToast("Could not update the order.", "error"); return; }
            Object.assign(o, patch);
            closeModal();
            renderLibrary();
            showToast("Order marked as paid.", "success");
          });
        }
      });
    }
  });
}

setupLibrary();
