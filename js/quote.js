/**
 * Módulo de Cotizaciones · Katio Design SaaS
 * Persistencia en SQLite, búsqueda por consecutivo, cálculo de complejidad interna,
 * toggle de IVA, conversión a factura y generación de PDF oficial.
 */

let quoteItems = [];
let quoteCurrentId = null;

function calculateQuoteTotals() {
  let subtotalRegular = 0;
  quoteItems.forEach(item => {
    if (!item.isDiscount) {
      subtotalRegular += (item.qty || 0) * (item.unitValue || 0);
    }
  });

  const compPercent = Number($("quoteComplexity").value) || 0;
  const complexityFactor = 1 + (compPercent / 100);

  quoteItems.forEach(item => {
    if (item.isDiscount && item.discountPercent) {
      const discAmount = (subtotalRegular * complexityFactor) * (item.discountPercent / 100);
      item.unitValue = -discAmount;
      item.qty = 1;
    }
  });

  const taxableBase = Math.max(0, (subtotalRegular * complexityFactor) + quoteItems.filter(i => i.isDiscount).reduce((acc, curr) => acc + curr.unitValue, 0));

  const applyIva = $("quoteApplyIva") ? $("quoteApplyIva").checked : false;
  const ivaVal = applyIva ? (taxableBase * 0.19) : 0;
  const grandTotal = taxableBase + ivaVal;

  return {
    subtotalRegular,
    compPercent,
    taxableBase,
    applyIva,
    ivaVal,
    grandTotal
  };
}

function renderQuoteItems() {
  const tbody = $("quoteItemRows");
  if (!tbody) return;
  tbody.innerHTML = "";

  const totals = calculateQuoteTotals();

  if (quoteItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:25px; color:var(--muted);">
      No hay ítems en esta cotización. Añade un ítem personalizado o importa desde el catálogo.
    </td></tr>`;
  } else {
    quoteItems.forEach((item, i) => {
      const rowTotal = (item.qty || 0) * (item.unitValue || 0);
      const tr = document.createElement("tr");

      if (item.isDiscount) {
        tr.classList.add("discount-row");
        tr.innerHTML = `
          <td><span class="num-badge" style="background:var(--highlight); color:#2d3b0e;">%</span></td>
          <td>
            <div style="display:flex; align-items:center;">
              <span class="discount-badge">DESCUENTO ${item.discountPercent}%</span>
              <input class="table-input" data-q-concept="${i}" value="${escapeHtml(item.concept)}" style="font-weight:700; color:var(--accent);">
            </div>
            <input class="table-input" data-q-desc="${i}" value="${escapeHtml(item.description || "")}" placeholder="Descripción del descuento" style="font-size:11px; color:var(--muted);">
          </td>
          <td style="text-align:center; font-weight:600;">1</td>
          <td style="font-weight:700; color:#d93838;">-${money(Math.abs(item.unitValue))}</td>
          <td><strong style="color:#d93838;">-${money(Math.abs(rowTotal))}</strong></td>
          <td style="text-align:right;"><button class="delete" data-q-del="${i}">✕</button></td>
        `;
      } else {
        tr.innerHTML = `
          <td><span class="num-badge">${i + 1}</span></td>
          <td>
            <input class="table-input" data-q-concept="${i}" value="${escapeHtml(item.concept)}" placeholder="Nombre del servicio" style="font-weight:600;">
            <textarea class="table-input" data-q-desc="${i}" placeholder="Descripción detallada...">${escapeHtml(item.description || "")}</textarea>
          </td>
          <td style="text-align:center;">
            <input class="table-num-input" data-q-qty="${i}" type="number" min="0" step="1" value="${item.qty}">
          </td>
          <td>
            <input class="table-input" data-q-unit="${i}" type="number" min="0" step="5000" value="${item.unitValue}" style="font-weight:600; background:var(--soft);">
          </td>
          <td><strong>${money(rowTotal)}</strong></td>
          <td style="text-align:right;"><button class="delete" data-q-del="${i}">✕</button></td>
        `;
      }

      tbody.appendChild(tr);
    });
  }

  if ($("quoteTotalItemsCount")) $("quoteTotalItemsCount").textContent = quoteItems.length;
  if ($("quoteSubtotal")) $("quoteSubtotal").textContent = money(totals.taxableBase);
  if ($("quoteIvaDisplay")) {
    if (totals.applyIva) {
      $("quoteIvaDisplay").textContent = money(totals.ivaVal);
      $("quoteIvaLabel").textContent = "IVA (19%)";
    } else {
      $("quoteIvaDisplay").textContent = "$0 (Exento)";
      $("quoteIvaLabel").textContent = "IVA (0% No responsable)";
    }
  }
  if ($("quoteGrandTotal")) $("quoteGrandTotal").textContent = money(totals.grandTotal);

  // Listeners de edición
  tbody.querySelectorAll("[data-q-concept]").forEach(el => el.addEventListener("change", e => {
    quoteItems[+e.target.dataset.qConcept].concept = e.target.value.trim();
    renderQuoteItems();
  }));

  tbody.querySelectorAll("[data-q-desc]").forEach(el => el.addEventListener("change", e => {
    quoteItems[+e.target.dataset.qDesc].description = e.target.value.trim();
    renderQuoteItems();
  }));

  tbody.querySelectorAll("[data-q-qty]").forEach(el => el.addEventListener("change", e => {
    quoteItems[+e.target.dataset.qQty].qty = Math.max(0, +e.target.value || 0);
    renderQuoteItems();
  }));

  tbody.querySelectorAll("[data-q-unit]").forEach(el => el.addEventListener("change", e => {
    quoteItems[+e.target.dataset.qUnit].unitValue = Math.max(0, +e.target.value || 0);
    renderQuoteItems();
  }));

  tbody.querySelectorAll("[data-q-del]").forEach(el => el.addEventListener("click", e => {
    quoteItems.splice(+e.target.dataset.qDel, 1);
    renderQuoteItems();
  }));
}

// Cargar lista e historial de cotizaciones desde SQLite
async function loadQuotesHistory(searchQuery = "") {
  const tbody = $("quotesHistoryTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:20px;">Cargando cotizaciones...</td></tr>`;

  try {
    const quotes = await apiFetch(`/api/quotes${searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ''}`);

    if (quotes.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:35px; color:var(--muted);">
        ${searchQuery ? 'No se encontraron cotizaciones con ese consecutivo o cliente.' : 'Aún no hay cotizaciones guardadas en la base de datos.'}
      </td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    quotes.forEach((q, idx) => {
      const tr = document.createElement("tr");
      const statusColor = q.status === 'Aprobada' ? 'var(--highlight)' : (q.status === 'Facturada' ? '#c5d4fb' : 'var(--soft)');
      const statusTextColor = q.status === 'Aprobada' ? '#2d3b0e' : (q.status === 'Facturada' ? '#1a1c23' : 'var(--muted)');

      tr.innerHTML = `
        <td><span class="num-badge">${idx + 1}</span></td>
        <td><strong style="color:var(--accent);">${escapeHtml(q.consecutive)}</strong></td>
        <td>${escapeHtml(q.client_name)}</td>
        <td style="color:var(--muted); font-size:12px;">${formatDateReadable(q.emission_date)}</td>
        <td><strong>${money(q.total)}</strong></td>
        <td><span style="display:inline-block; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700; background:${statusColor}; color:${statusTextColor};">${escapeHtml(q.status)}</span></td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="btn" data-q-action="view" data-q-id="${q.id}" style="padding:4px 8px; font-size:11px;">👁️ Ver</button>
          <button class="btn dark" data-q-action="pdf" data-q-id="${q.id}" style="padding:4px 8px; font-size:11px;">🖨️ PDF</button>
          <button class="btn primary" data-q-action="convert" data-q-id="${q.id}" style="padding:4px 8px; font-size:11px;" title="Convertir a Factura">🧾 Facturar</button>
          <button class="delete" data-q-action="delete" data-q-id="${q.id}" style="padding:4px 8px; font-size:11px;">✕</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Listeners de acciones en tabla
    tbody.querySelectorAll("[data-q-action]").forEach(btn => {
      btn.addEventListener("click", async e => {
        const action = btn.dataset.qAction;
        const id = btn.dataset.qId;

        if (action === "view") {
          await loadQuoteToEditor(id);
          switchQuoteTab("editor");
        } else if (action === "pdf") {
          const doc = await apiFetch(`/api/quotes/${id}`);
          generatePdfFromDocument(doc, "quote", companySettings);
        } else if (action === "convert") {
          await convertQuoteToInvoice(id);
        } else if (action === "delete") {
          if (confirm("¿Estás seguro de eliminar permanentemente esta cotización de la base de datos?")) {
            await apiFetch(`/api/quotes/${id}`, { method: "DELETE" });
            loadQuotesHistory($("quoteSearchInput").value);
          }
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:#d93838; text-align:center; padding:20px;">Error al cargar historial: ${err.message}</td></tr>`;
  }
}

// Cargar una cotización en el editor
async function loadQuoteToEditor(id) {
  try {
    const q = await apiFetch(`/api/quotes/${id}`);
    quoteCurrentId = q.id;
    $("quoteDocType").value = q.doc_type;
    $("quoteNumber").value = q.consecutive;
    $("quoteDate").value = q.emission_date;
    $("quoteClient").value = q.client_name;
    $("quoteClientNit").value = q.client_nit || "";
    $("quoteClientPhone").value = q.client_phone || "";
    $("quoteClientEmail").value = q.client_email || "";
    $("quoteClientAddress").value = q.client_address || "";
    $("quoteComplexity").value = q.complexity_percent || 0;
    $("quoteApplyIva").checked = q.apply_iva === 1;
    quoteItems = q.items || [];
    renderQuoteItems();
  } catch (err) {
    alert("Error cargando cotización: " + err.message);
  }
}

// Crear nueva cotización limpia
async function resetQuoteEditorToNew() {
  quoteCurrentId = null;
  quoteItems = [];
  $("quoteClient").value = "";
  $("quoteClientNit").value = "";
  $("quoteClientPhone").value = "";
  $("quoteClientEmail").value = "";
  $("quoteClientAddress").value = "";
  $("quoteComplexity").value = "0";
  $("quoteApplyIva").checked = companySettings.default_iva_enabled === "1";
  $("quoteDate").value = getTodayISO();

  // Obtener siguiente consecutivo desde la BD
  try {
    const res = await apiFetch("/api/quotes/consecutive/next");
    $("quoteNumber").value = res.consecutive;
  } catch (e) {
    $("quoteNumber").value = "COT-00001";
  }

  renderQuoteItems();
}

// Guardar cotización en la base de datos SQLite
async function saveCurrentQuote() {
  const clientName = $("quoteClient").value.trim();
  if (!clientName) {
    alert("Por favor ingresa el nombre del cliente o empresa.");
    $("quoteClient").focus();
    return;
  }

  if (quoteItems.length === 0) {
    alert("Por favor añade al menos un servicio o ítem a la cotización.");
    return;
  }

  const totals = calculateQuoteTotals();
  const consecutive = $("quoteNumber").value.trim() || "COT-00001";

  const payload = {
    id: quoteCurrentId,
    consecutive: consecutive,
    doc_type: $("quoteDocType").value,
    client_name: clientName,
    client_nit: $("quoteClientNit").value.trim(),
    client_phone: $("quoteClientPhone").value.trim(),
    client_email: $("quoteClientEmail").value.trim(),
    client_address: $("quoteClientAddress").value.trim(),
    emission_date: $("quoteDate").value || getTodayISO(),
    validity_days: 15,
    complexity_percent: totals.compPercent,
    apply_iva: totals.applyIva ? 1 : 0,
    subtotal: totals.taxableBase,
    iva_value: totals.ivaVal,
    total: totals.grandTotal,
    items: quoteItems,
    notes: "",
    status: "Borrador"
  };

  try {
    const saved = await apiFetch("/api/quotes", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    quoteCurrentId = saved.id;
    alert(`¡Cotización ${saved.consecutive} guardada en la base de datos exitosamente!`);
    loadQuotesHistory();
  } catch (err) {
    alert("Error al guardar cotización: " + err.message);
  }
}

// Convertir cotización en Factura / Cuenta de Cobro
async function convertQuoteToInvoice(quoteId) {
  try {
    const q = await apiFetch(`/api/quotes/${quoteId}`);
    
    // Traer siguiente consecutivo de factura
    const nextInv = await apiFetch("/api/invoices/consecutive/next");

    const payload = {
      consecutive: nextInv.consecutive,
      doc_type: "Cuenta de Cobro",
      client_name: q.client_name,
      client_nit: q.client_nit,
      client_phone: q.client_phone,
      client_email: q.client_email,
      client_address: q.client_address,
      emission_date: getTodayISO(),
      due_date: addDaysISO(getTodayISO(), 15),
      complexity_percent: q.complexity_percent,
      apply_iva: q.apply_iva,
      subtotal: q.subtotal,
      iva_value: q.iva_value,
      total: q.total,
      items: q.items,
      quote_id: q.id,
      payment_method: "Nequi / Bre-B",
      status: "Pendiente"
    };

    const savedInv = await apiFetch("/api/invoices", {
      method: "POST",
      body: JSON.stringify(payload)
    });

    alert(`¡Cotización convertida exitosamente en Factura / Cobro ${savedInv.consecutive}!`);
    switchView("viewInvoice");
    await loadInvoiceToEditor(savedInv.id);
    switchInvoiceTab("editor");
  } catch (err) {
    alert("Error al convertir cotización: " + err.message);
  }
}

function switchQuoteTab(tab) {
  const editorBox = $("quoteEditorSection");
  const historyBox = $("quoteHistorySection");
  const tabBtnEditor = $("quoteTabEditorBtn");
  const tabBtnHistory = $("quoteTabHistoryBtn");

  if (tab === "editor") {
    editorBox.style.display = "block";
    historyBox.style.display = "none";
    tabBtnEditor.classList.add("primary");
    tabBtnHistory.classList.remove("primary");
  } else {
    editorBox.style.display = "none";
    historyBox.style.display = "block";
    tabBtnEditor.classList.remove("primary");
    tabBtnHistory.classList.add("primary");
    loadQuotesHistory($("quoteSearchInput").value);
  }
}

function initQuoteEvents() {
  // Tabs
  $("quoteTabEditorBtn").addEventListener("click", () => switchQuoteTab("editor"));
  $("quoteTabHistoryBtn").addEventListener("click", () => switchQuoteTab("history"));

  // Búsqueda en historial
  $("quoteSearchInput").addEventListener("input", e => {
    loadQuotesHistory(e.target.value);
  });

  // Guardar en BD
  $("saveQuoteBtn").addEventListener("click", saveCurrentQuote);

  // Nueva cotización limpia
  $("newQuoteCleanBtn").addEventListener("click", resetQuoteEditorToNew);

  // Imprimir PDF
  $("printQuoteBtn").addEventListener("click", () => {
    if (quoteItems.length === 0) {
      alert("Añade al menos un ítem antes de imprimir.");
      return;
    }
    const totals = calculateQuoteTotals();
    const doc = {
      consecutive: $("quoteNumber").value,
      doc_type: $("quoteDocType").value,
      emission_date: $("quoteDate").value,
      validity_days: 15,
      client_name: $("quoteClient").value,
      client_nit: $("quoteClientNit").value,
      client_phone: $("quoteClientPhone").value,
      client_email: $("quoteClientEmail").value,
      client_address: $("quoteClientAddress").value,
      complexity_percent: totals.compPercent,
      apply_iva: totals.applyIva ? 1 : 0,
      subtotal: totals.taxableBase,
      iva_value: totals.ivaVal,
      total: totals.grandTotal,
      items: quoteItems
    };
    generatePdfFromDocument(doc, "quote", companySettings);
  });

  // Exportar CSV
  $("exportQuoteCsvBtn").addEventListener("click", () => {
    if (quoteItems.length === 0) {
      alert("No hay ítems para exportar.");
      return;
    }
    const docType = $("quoteDocType").value;
    const seqStr = $("quoteNumber").value;
    const client = $("quoteClient").value || "CLIENTE";
    const totals = calculateQuoteTotals();

    let csvRows = [
      `DOCUMENTO,${docType}`,
      `NUMERO,${seqStr}`,
      `FECHA EMISION,${$("quoteDate").value}`,
      `CLIENTE,"${client.replace(/"/g, '""')}"`,
      "",
      "N°,CONCEPTO,DESCRIPCION,CANTIDAD,VALOR UNITARIO,TOTAL"
    ];

    quoteItems.forEach((item, i) => {
      const total = (item.qty || 1) * (item.unitValue || 0);
      csvRows.push(`${i + 1},"${item.concept.replace(/"/g, '""')}","${(item.description || '').replace(/"/g, '""')}",${item.qty},${item.unitValue},${total}`);
    });

    csvRows.push(`SUBTOTAL,,,${totals.taxableBase}`);
    csvRows.push(`TOTAL FINAL,,,${totals.grandTotal}`);

    downloadCsv(csvRows.join("\n"), `${seqStr}_${client.replace(/\s+/g, '_')}.csv`);
  });

  // Importar desde catálogo (con limpieza automática de selector)
  $("importFromCatalogBtn").addEventListener("click", () => {
    const select = $("catalogSelectImport");
    const srvId = select.value;
    if (!srvId) return;

    const srv = catalog.find(x => x.id === srvId);
    if (!srv) return;

    const currentHourly = hourly();
    const price = srv.price ? srv.price : (srv.hours * currentHourly);

    quoteItems.push({
      concept: srv.name,
      description: srv.description || "",
      qty: 1,
      unitValue: price,
      isDiscount: false
    });

    select.value = "";
    renderQuoteItems();
  });

  // Modal Ítem Personalizado
  $("addEmptyQuoteItemBtn").addEventListener("click", () => {
    $("qModalConcept").value = "";
    $("qModalDesc").value = "";
    $("qModalQty").value = "1";
    $("qModalUnitValue").value = "50000";

    $("qModalSaveBtn").onclick = () => {
      const concept = $("qModalConcept").value.trim();
      if (!concept) {
        alert("Por favor ingresa un concepto o nombre de servicio.");
        return;
      }
      const desc = $("qModalDesc").value.trim();
      const qty = Math.max(1, Number($("qModalQty").value) || 1);
      const unitValue = Math.max(0, Number($("qModalUnitValue").value) || 0);

      quoteItems.push({ concept, description: desc, qty, unitValue, isDiscount: false });
      renderQuoteItems();
      $("quoteItemModal").style.display = "none";
    };

    $("quoteItemModal").style.display = "flex";
    $("qModalConcept").focus();
  });

  $("qModalCancelBtn").addEventListener("click", () => {
    $("quoteItemModal").style.display = "none";
  });

  // Modal Descuento Porcentual
  $("openDiscountModalBtn").addEventListener("click", () => {
    $("discModalConcept").value = "Descuento comercial especial";
    $("discModalPercent").value = "10";

    $("discModalSaveBtn").onclick = () => {
      const concept = $("discModalConcept").value.trim() || "Descuento comercial";
      const percent = Math.max(0.1, Math.min(100, Number($("discModalPercent").value) || 10));

      quoteItems.push({
        concept: concept,
        description: `Descuento concedido del ${percent}%`,
        qty: 1,
        unitValue: 0,
        isDiscount: true,
        discountPercent: percent
      });

      renderQuoteItems();
      $("discountModal").style.display = "none";
    };

    $("discountModal").style.display = "flex";
    $("discModalConcept").focus();
  });

  $("discModalCancelBtn").addEventListener("click", () => {
    $("discountModal").style.display = "none";
  });

  // Triggers de recálculo
  ["quoteComplexity", "quoteApplyIva"].forEach(id => {
    if ($(id)) $(id).addEventListener("change", renderQuoteItems);
  });
}
