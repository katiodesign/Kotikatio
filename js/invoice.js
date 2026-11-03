/**
 * Módulo de Facturación Comercial / Cuentas de Cobro · Katio Design SaaS
 * Persistencia en SQLite, consulta por consecutivo, cálculo de IVA, estados y PDF oficial.
 */

let invoiceItems = [];
let invoiceCurrentId = null;

function calculateInvoiceTotals() {
  let subtotalRegular = 0;
  invoiceItems.forEach(item => {
    if (!item.isDiscount) {
      subtotalRegular += (item.qty || 0) * (item.unitValue || 0);
    }
  });

  const compPercent = Number($("invoiceComplexity").value) || 0;
  const complexityFactor = 1 + (compPercent / 100);

  invoiceItems.forEach(item => {
    if (item.isDiscount && item.discountPercent) {
      const discAmount = (subtotalRegular * complexityFactor) * (item.discountPercent / 100);
      item.unitValue = -discAmount;
      item.qty = 1;
    }
  });

  const taxableBase = Math.max(0, (subtotalRegular * complexityFactor) + invoiceItems.filter(i => i.isDiscount).reduce((acc, curr) => acc + curr.unitValue, 0));

  const applyIva = $("invoiceApplyIva") ? $("invoiceApplyIva").checked : false;
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

function renderInvoiceItems() {
  const tbody = $("invoiceItemRows");
  if (!tbody) return;
  tbody.innerHTML = "";

  const totals = calculateInvoiceTotals();

  if (invoiceItems.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:25px; color:var(--muted);">
      No hay servicios o entregables en esta cuenta de cobro. Pulsa <strong>+ Añadir Servicio</strong> o importa del catálogo.
    </td></tr>`;
  } else {
    invoiceItems.forEach((item, i) => {
      const rowTotal = (item.qty || 0) * (item.unitValue || 0);
      const tr = document.createElement("tr");

      if (item.isDiscount) {
        tr.classList.add("discount-row");
        tr.innerHTML = `
          <td><span class="num-badge" style="background:var(--highlight); color:#2d3b0e;">%</span></td>
          <td>
            <div style="display:flex; align-items:center;">
              <span class="discount-badge">DESCUENTO ${item.discountPercent}%</span>
              <input class="table-input" data-inv-concept="${i}" value="${escapeHtml(item.concept)}" style="font-weight:700; color:var(--accent);">
            </div>
            <input class="table-input" data-inv-desc="${i}" value="${escapeHtml(item.description || "")}" placeholder="Descripción del descuento" style="font-size:11px; color:var(--muted);">
          </td>
          <td style="text-align:center; font-weight:600;">1</td>
          <td style="font-weight:700; color:#d93838;">-${money(Math.abs(item.unitValue))}</td>
          <td><strong style="color:#d93838;">-${money(Math.abs(rowTotal))}</strong></td>
          <td style="text-align:right;"><button class="delete" data-inv-del="${i}">✕</button></td>
        `;
      } else {
        tr.innerHTML = `
          <td><span class="num-badge">${i + 1}</span></td>
          <td>
            <input class="table-input" data-inv-concept="${i}" value="${escapeHtml(item.concept)}" placeholder="Concepto o servicio" style="font-weight:600;">
            <textarea class="table-input" data-inv-desc="${i}" placeholder="Descripción detallada de la entrega...">${escapeHtml(item.description || "")}</textarea>
          </td>
          <td style="text-align:center;">
            <input class="table-num-input" data-inv-qty="${i}" type="number" min="0" step="1" value="${item.qty}">
          </td>
          <td>
            <input class="table-input" data-inv-unit="${i}" type="number" min="0" step="5000" value="${item.unitValue}" style="font-weight:600; background:var(--soft);">
          </td>
          <td><strong>${money(rowTotal)}</strong></td>
          <td style="text-align:right;"><button class="delete" data-inv-del="${i}">✕</button></td>
        `;
      }

      tbody.appendChild(tr);
    });
  }

  if ($("invoiceTotalItemsCount")) $("invoiceTotalItemsCount").textContent = invoiceItems.length;
  if ($("invoiceSubtotal")) $("invoiceSubtotal").textContent = money(totals.taxableBase);
  if ($("invoiceIvaDisplay")) {
    if (totals.applyIva) {
      $("invoiceIvaDisplay").textContent = money(totals.ivaVal);
      $("invoiceIvaLabel").textContent = "IVA (19%)";
    } else {
      $("invoiceIvaDisplay").textContent = "$0 (Exento)";
      $("invoiceIvaLabel").textContent = "IVA (0% No responsable)";
    }
  }
  if ($("invoiceGrandTotal")) $("invoiceGrandTotal").textContent = money(totals.grandTotal);

  // Listeners
  tbody.querySelectorAll("[data-inv-concept]").forEach(el => el.addEventListener("change", e => {
    invoiceItems[+e.target.dataset.invConcept].concept = e.target.value.trim();
    renderInvoiceItems();
  }));

  tbody.querySelectorAll("[data-inv-desc]").forEach(el => el.addEventListener("change", e => {
    invoiceItems[+e.target.dataset.invDesc].description = e.target.value.trim();
    renderInvoiceItems();
  }));

  tbody.querySelectorAll("[data-inv-qty]").forEach(el => el.addEventListener("change", e => {
    invoiceItems[+e.target.dataset.invQty].qty = Math.max(0, +e.target.value || 0);
    renderInvoiceItems();
  }));

  tbody.querySelectorAll("[data-inv-unit]").forEach(el => el.addEventListener("change", e => {
    invoiceItems[+e.target.dataset.invUnit].unitValue = Math.max(0, +e.target.value || 0);
    renderInvoiceItems();
  }));

  tbody.querySelectorAll("[data-inv-del]").forEach(el => el.addEventListener("click", e => {
    invoiceItems.splice(+e.target.dataset.invDel, 1);
    renderInvoiceItems();
  }));
}

// Cargar historial de facturación desde SQLite
async function loadInvoicesHistory(searchQuery = "") {
  const tbody = $("invoicesHistoryTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:20px;">Cargando documentos...</td></tr>`;

  try {
    const invoices = await apiFetch(`/api/invoices${searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ''}`);

    if (invoices.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:35px; color:var(--muted);">
        ${searchQuery ? 'No se encontraron documentos con ese consecutivo o cliente.' : 'Aún no hay facturas o cuentas de cobro guardadas en la base de datos.'}
      </td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    invoices.forEach((inv, idx) => {
      const tr = document.createElement("tr");
      const isPaid = inv.status === 'Pagada';
      const statusBg = isPaid ? 'var(--highlight)' : (inv.status === 'Anulada' ? '#fff0f0' : 'var(--warn)');
      const statusColor = isPaid ? '#2d3b0e' : (inv.status === 'Anulada' ? '#d93838' : '#856a20');

      tr.innerHTML = `
        <td><span class="num-badge">${idx + 1}</span></td>
        <td><strong style="color:var(--accent);">${escapeHtml(inv.consecutive)}</strong></td>
        <td><span class="category-pill">${escapeHtml(inv.doc_type)}</span></td>
        <td>${escapeHtml(inv.client_name)}</td>
        <td style="color:var(--muted); font-size:12px;">${formatDateReadable(inv.emission_date)}</td>
        <td style="color:var(--muted); font-size:12px;">${formatDateReadable(inv.due_date)}</td>
        <td><strong>${money(inv.total)}</strong></td>
        <td><span style="display:inline-block; padding:2px 8px; border-radius:4px; font-size:11px; font-weight:700; background:${statusBg}; color:${statusColor};">${escapeHtml(inv.status)}</span></td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="btn" data-inv-action="view" data-inv-id="${inv.id}" style="padding:4px 8px; font-size:11px;">👁️ Ver</button>
          <button class="btn dark" data-inv-action="pdf" data-inv-id="${inv.id}" style="padding:4px 8px; font-size:11px;">🖨️ PDF</button>
          <button class="btn secondary" data-inv-action="toggle-status" data-inv-id="${inv.id}" data-inv-curr="${inv.status}" style="padding:4px 8px; font-size:11px;">
            ${isPaid ? 'Pendiente' : '✓ Pagada'}
          </button>
          <button class="delete" data-inv-action="delete" data-inv-id="${inv.id}" style="padding:4px 8px; font-size:11px;">✕</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-inv-action]").forEach(btn => {
      btn.addEventListener("click", async e => {
        const action = btn.dataset.invAction;
        const id = btn.dataset.invId;

        if (action === "view") {
          await loadInvoiceToEditor(id);
          switchInvoiceTab("editor");
        } else if (action === "pdf") {
          const doc = await apiFetch(`/api/invoices/${id}`);
          generatePdfFromDocument(doc, "invoice", companySettings);
        } else if (action === "toggle-status") {
          const current = btn.dataset.invCurr;
          const nextStatus = current === "Pagada" ? "Pendiente" : "Pagada";
          const inv = await apiFetch(`/api/invoices/${id}`);
          inv.status = nextStatus;
          await apiFetch("/api/invoices", { method: "POST", body: JSON.stringify(inv) });
          loadInvoicesHistory($("invoiceSearchInput").value);
        } else if (action === "delete") {
          if (confirm("¿Estás seguro de eliminar permanentemente este documento de cobro de la base de datos?")) {
            await apiFetch(`/api/invoices/${id}`, { method: "DELETE" });
            loadInvoicesHistory($("invoiceSearchInput").value);
          }
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" style="color:#d93838; text-align:center; padding:20px;">Error al cargar facturas: ${err.message}</td></tr>`;
  }
}

// Cargar factura en el editor
async function loadInvoiceToEditor(id) {
  try {
    const inv = await apiFetch(`/api/invoices/${id}`);
    invoiceCurrentId = inv.id;
    $("invoiceDocType").value = inv.doc_type;
    $("invoiceNumber").value = inv.consecutive;
    $("invoiceDate").value = inv.emission_date;
    $("invoiceDueDate").value = inv.due_date;
    $("invoiceClient").value = inv.client_name;
    $("invoiceClientNit").value = inv.client_nit || "";
    $("invoiceClientPhone").value = inv.client_phone || "";
    $("invoiceClientEmail").value = inv.client_email || "";
    $("invoiceClientAddress").value = inv.client_address || "";
    $("invoiceComplexity").value = inv.complexity_percent || 0;
    $("invoiceApplyIva").checked = inv.apply_iva === 1;
    invoiceItems = inv.items || [];
    renderInvoiceItems();
  } catch (err) {
    alert("Error cargando factura: " + err.message);
  }
}

// Nueva factura limpia
async function resetInvoiceEditorToNew() {
  invoiceCurrentId = null;
  invoiceItems = [];
  $("invoiceClient").value = "";
  $("invoiceClientNit").value = "";
  $("invoiceClientPhone").value = "";
  $("invoiceClientEmail").value = "";
  $("invoiceClientAddress").value = "";
  $("invoiceComplexity").value = "0";
  $("invoiceApplyIva").checked = companySettings.default_iva_enabled === "1";
  $("invoiceDate").value = getTodayISO();
  $("invoiceDueDate").value = addDaysISO(getTodayISO(), 15);

  try {
    const res = await apiFetch("/api/invoices/consecutive/next");
    $("invoiceNumber").value = res.consecutive;
  } catch (e) {
    $("invoiceNumber").value = "FACT-00001";
  }

  renderInvoiceItems();
}

// Guardar factura en SQLite
async function saveCurrentInvoice() {
  const clientName = $("invoiceClient").value.trim();
  if (!clientName) {
    alert("Por favor ingresa el nombre del cliente o razón social.");
    $("invoiceClient").focus();
    return;
  }

  if (invoiceItems.length === 0) {
    alert("Por favor añade al menos un concepto a la factura o cuenta de cobro.");
    return;
  }

  const totals = calculateInvoiceTotals();
  const consecutive = $("invoiceNumber").value.trim() || "FACT-00001";

  const payload = {
    id: invoiceCurrentId,
    consecutive: consecutive,
    doc_type: $("invoiceDocType").value,
    client_name: clientName,
    client_nit: $("invoiceClientNit").value.trim(),
    client_phone: $("invoiceClientPhone").value.trim(),
    client_email: $("invoiceClientEmail").value.trim(),
    client_address: $("invoiceClientAddress").value.trim(),
    emission_date: $("invoiceDate").value || getTodayISO(),
    due_date: $("invoiceDueDate").value || addDaysISO(getTodayISO(), 15),
    complexity_percent: totals.compPercent,
    apply_iva: totals.applyIva ? 1 : 0,
    subtotal: totals.taxableBase,
    iva_value: totals.ivaVal,
    total: totals.grandTotal,
    items: invoiceItems,
    payment_method: "Nequi / Bre-B",
    notes: "",
    status: "Pendiente"
  };

  try {
    const saved = await apiFetch("/api/invoices", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    invoiceCurrentId = saved.id;
    alert(`¡Documento de cobro ${saved.consecutive} guardado en la base de datos exitosamente!`);
    loadInvoicesHistory();
  } catch (err) {
    alert("Error al guardar factura: " + err.message);
  }
}

function switchInvoiceTab(tab) {
  const editorBox = $("invoiceEditorSection");
  const historyBox = $("invoiceHistorySection");
  const tabBtnEditor = $("invoiceTabEditorBtn");
  const tabBtnHistory = $("invoiceTabHistoryBtn");

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
    loadInvoicesHistory($("invoiceSearchInput").value);
  }
}

function initInvoiceEvents() {
  $("invoiceTabEditorBtn").addEventListener("click", () => switchInvoiceTab("editor"));
  $("invoiceTabHistoryBtn").addEventListener("click", () => switchInvoiceTab("history"));

  $("invoiceSearchInput").addEventListener("input", e => {
    loadInvoicesHistory(e.target.value);
  });

  $("saveInvoiceBtn").addEventListener("click", saveCurrentInvoice);
  $("newInvoiceCleanBtn").addEventListener("click", resetInvoiceEditorToNew);

  // Imprimir PDF
  $("printInvoiceBtn").addEventListener("click", () => {
    if (invoiceItems.length === 0) {
      alert("Añade al menos un concepto antes de imprimir.");
      return;
    }
    const totals = calculateInvoiceTotals();
    const doc = {
      consecutive: $("invoiceNumber").value,
      doc_type: $("invoiceDocType").value,
      emission_date: $("invoiceDate").value,
      due_date: $("invoiceDueDate").value,
      client_name: $("invoiceClient").value,
      client_nit: $("invoiceClientNit").value,
      client_phone: $("invoiceClientPhone").value,
      client_email: $("invoiceClientEmail").value,
      client_address: $("invoiceClientAddress").value,
      complexity_percent: totals.compPercent,
      apply_iva: totals.applyIva ? 1 : 0,
      subtotal: totals.taxableBase,
      iva_value: totals.ivaVal,
      total: totals.grandTotal,
      items: invoiceItems
    };
    generatePdfFromDocument(doc, "invoice", companySettings);
  });

  // Exportar CSV
  $("exportInvoiceCsvBtn").addEventListener("click", () => {
    if (invoiceItems.length === 0) {
      alert("No hay conceptos para exportar.");
      return;
    }
    const docType = $("invoiceDocType").value;
    const seqStr = $("invoiceNumber").value;
    const client = $("invoiceClient").value || "CLIENTE";
    const totals = calculateInvoiceTotals();

    let csvRows = [
      `DOCUMENTO,${docType}`,
      `NUMERO,${seqStr}`,
      `FECHA EMISION,${$("invoiceDate").value}`,
      `FECHA VENCIMIENTO,${$("invoiceDueDate").value}`,
      `CLIENTE,"${client.replace(/"/g, '""')}"`,
      "",
      "N°,CONCEPTO,DESCRIPCION,CANTIDAD,VALOR UNITARIO,TOTAL"
    ];

    invoiceItems.forEach((item, i) => {
      const total = (item.qty || 1) * (item.unitValue || 0);
      csvRows.push(`${i + 1},"${item.concept.replace(/"/g, '""')}","${(item.description || '').replace(/"/g, '""')}",${item.qty},${item.unitValue},${total}`);
    });

    csvRows.push(`SUBTOTAL,,,${totals.taxableBase}`);
    csvRows.push(`TOTAL A PAGAR,,,${totals.grandTotal}`);

    downloadCsv(csvRows.join("\n"), `${seqStr}_${client.replace(/\s+/g, '_')}.csv`);
  });

  // Importar desde Catálogo con auto-clear
  $("invoiceImportFromCatalogBtn").addEventListener("click", () => {
    const select = $("invoiceCatalogSelectImport");
    const srvId = select.value;
    if (!srvId) return;

    const srv = catalog.find(x => x.id === srvId);
    if (!srv) return;

    const currentHourly = hourly();
    const price = srv.price ? srv.price : (srv.hours * currentHourly);

    invoiceItems.push({
      concept: srv.name,
      description: srv.description || "",
      qty: 1,
      unitValue: price,
      isDiscount: false
    });

    select.value = "";
    renderInvoiceItems();
  });

  // Modal Ítem Factura
  $("addInvoiceItemBtn").addEventListener("click", () => {
    $("qModalConcept").value = "";
    $("qModalDesc").value = "";
    $("qModalQty").value = "1";
    $("qModalUnitValue").value = "100000";

    $("qModalSaveBtn").onclick = () => {
      const concept = $("qModalConcept").value.trim();
      if (!concept) {
        alert("Por favor ingresa un concepto.");
        return;
      }
      const desc = $("qModalDesc").value.trim();
      const qty = Math.max(1, Number($("qModalQty").value) || 1);
      const unitValue = Math.max(0, Number($("qModalUnitValue").value) || 0);

      invoiceItems.push({ concept, description: desc, qty, unitValue, isDiscount: false });
      renderInvoiceItems();
      $("quoteItemModal").style.display = "none";
    };

    $("quoteItemModal").style.display = "flex";
    $("qModalConcept").focus();
  });

  // Modal Descuento Factura
  $("openInvoiceDiscountModalBtn").addEventListener("click", () => {
    $("discModalConcept").value = "Descuento comercial por pronto pago";
    $("discModalPercent").value = "5";

    $("discModalSaveBtn").onclick = () => {
      const concept = $("discModalConcept").value.trim() || "Descuento comercial";
      const percent = Math.max(0.1, Math.min(100, Number($("discModalPercent").value) || 5));

      invoiceItems.push({
        concept: concept,
        description: `Descuento concedido del ${percent}%`,
        qty: 1,
        unitValue: 0,
        isDiscount: true,
        discountPercent: percent
      });

      renderInvoiceItems();
      $("discountModal").style.display = "none";
    };

    $("discountModal").style.display = "flex";
    $("discModalConcept").focus();
  });

  ["invoiceComplexity", "invoiceApplyIva"].forEach(id => {
    if ($(id)) $(id).addEventListener("change", renderInvoiceItems);
  });
}
