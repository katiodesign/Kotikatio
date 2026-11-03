/**
 * Módulo de Catálogo & Categorías · Katio Design SaaS
 * Persistencia en SQLite, filtrado en vivo, Drag & Drop e importación/exportación CSV.
 */

let draggedCatalogIdx = null;
let currentCategoryFilter = "ALL";
let currentSearchQuery = "";

function renderCategories() {
  const filterSelect = $("catalogCategoryFilter");
  const modalCategorySelect = $("catModalCategory");

  if (filterSelect) {
    const currentVal = filterSelect.value || "ALL";
    filterSelect.innerHTML = `<option value="ALL">Todas las Categorías (${catalog.length})</option>`;
    categories.forEach(cat => {
      const count = catalog.filter(s => (s.category_name || "General") === cat.name).length;
      const opt = document.createElement("option");
      opt.value = cat.name;
      opt.textContent = `${cat.name} (${count})`;
      filterSelect.appendChild(opt);
    });
    filterSelect.value = currentVal;
  }

  if (modalCategorySelect) {
    modalCategorySelect.innerHTML = "";
    categories.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat.name;
      opt.textContent = cat.name;
      modalCategorySelect.appendChild(opt);
    });
  }
}

function renderCatalog() {
  const tbody = $("catalogRows");
  const quoteSelect = $("catalogSelectImport");
  const invoiceSelect = $("invoiceCatalogSelectImport");
  const currentHourly = hourly();

  if (!tbody) return;
  tbody.innerHTML = "";

  if (quoteSelect) quoteSelect.innerHTML = '<option value="">Importar desde Catálogo</option>';
  if (invoiceSelect) invoiceSelect.innerHTML = '<option value="">Importar desde Catálogo</option>';

  const query = currentSearchQuery.toLowerCase().trim();

  // Filtrado
  const filteredServices = [];
  catalog.forEach((s, idx) => {
    const catName = s.category_name || "General";
    const matchesCat = (currentCategoryFilter === "ALL") || (catName === currentCategoryFilter);
    const matchesQuery = !query ||
      s.name.toLowerCase().includes(query) ||
      (s.description || "").toLowerCase().includes(query) ||
      catName.toLowerCase().includes(query);

    if (matchesCat && matchesQuery) {
      filteredServices.push({ service: s, originalIdx: idx });
    }

    // Llenar selectores de cotizaciones y facturas
    const refPrice = s.price ? s.price : (s.hours * currentHourly);
    const optLabel = `[${catName}] ${s.name} (${money(refPrice)})`;

    if (quoteSelect) {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = optLabel;
      quoteSelect.appendChild(opt);
    }
    if (invoiceSelect) {
      const opt = document.createElement("option");
      opt.value = s.id;
      opt.textContent = optLabel;
      invoiceSelect.appendChild(opt);
    }
  });

  if (filteredServices.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td colspan="7" style="text-align:center; padding:35px; color:var(--muted);">
      ${catalog.length === 0 
        ? "No hay servicios registrados en el catálogo aún. Pulsa <strong>+ Nuevo Servicio</strong> o <strong>↑ Importar CSV</strong> para comenzar." 
        : "No se encontraron servicios que coincidan con la búsqueda o categoría seleccionada."}
    </td>`;
    tbody.appendChild(tr);
    return;
  }

  filteredServices.forEach((item, displayIdx) => {
    const s = item.service;
    const origIdx = item.originalIdx;
    const tr = document.createElement("tr");
    tr.setAttribute("draggable", "true");
    tr.dataset.srvId = s.id;

    const refPrice = s.price ? s.price : (s.hours * currentHourly);

    tr.innerHTML = `
      <td>
        <span class="drag-handle" title="Arrastrar para reordenar">⋮⋮</span>
        <span class="num-badge">${displayIdx + 1}</span>
      </td>
      <td>
        <span class="category-pill">${escapeHtml(s.category_name || "General")}</span>
      </td>
      <td>
        <input class="table-input" data-srv-name="${s.id}" value="${escapeHtml(s.name)}" style="font-weight:600;">
        <input class="table-input" data-srv-desc="${s.id}" value="${escapeHtml(s.description || "")}" placeholder="Descripción corta (opcional)" style="font-size:11px; color:var(--muted);">
      </td>
      <td style="text-align:center;">
        <input class="table-num-input" data-srv-hours="${s.id}" type="number" min="0" step=".5" value="${s.hours}">
      </td>
      <td style="color:var(--muted); font-size:12px;">${money(currentHourly)}/h</td>
      <td><strong>${money(refPrice)}</strong></td>
      <td style="text-align:right;"><button class="delete" data-srv-del="${s.id}">✕</button></td>
    `;

    // Eventos Drag & Drop
    tr.addEventListener("dragstart", e => {
      draggedCatalogIdx = origIdx;
      tr.style.opacity = "0.4";
      e.dataTransfer.effectAllowed = "move";
    });

    tr.addEventListener("dragend", () => {
      tr.style.opacity = "1";
      tbody.querySelectorAll("tr").forEach(r => r.classList.remove("drag-over"));
    });

    tr.addEventListener("dragover", e => {
      e.preventDefault();
      tr.classList.add("drag-over");
    });

    tr.addEventListener("dragleave", () => {
      tr.classList.remove("drag-over");
    });

    tr.addEventListener("drop", async e => {
      e.preventDefault();
      tr.classList.remove("drag-over");
      if (draggedCatalogIdx !== null && draggedCatalogIdx !== origIdx) {
        const movedItem = catalog.splice(draggedCatalogIdx, 1)[0];
        catalog.splice(origIdx, 0, movedItem);
        draggedCatalogIdx = null;
        renderCatalog();

        // Persistir nuevo orden en SQLite
        try {
          await apiFetch("/api/services/reorder", {
            method: "POST",
            body: JSON.stringify({ ids: catalog.map(s => s.id) })
          });
        } catch (err) {
          console.error("Error guardando orden:", err);
        }
      }
    });

    tbody.appendChild(tr);
  });

  // Listeners de edición inline con actualización en SQLite
  tbody.querySelectorAll("[data-srv-name]").forEach(el => el.addEventListener("change", async e => {
    const id = e.target.dataset.srvName;
    const srv = catalog.find(x => x.id === id);
    if (srv) {
      srv.name = e.target.value.trim() || "Servicio";
      await updateServiceDb(srv);
    }
  }));

  tbody.querySelectorAll("[data-srv-desc]").forEach(el => el.addEventListener("change", async e => {
    const id = e.target.dataset.srvDesc;
    const srv = catalog.find(x => x.id === id);
    if (srv) {
      srv.description = e.target.value.trim();
      await updateServiceDb(srv);
    }
  }));

  tbody.querySelectorAll("[data-srv-hours]").forEach(el => el.addEventListener("change", async e => {
    const id = e.target.dataset.srvHours;
    const srv = catalog.find(x => x.id === id);
    if (srv) {
      srv.hours = Math.max(0, Number(e.target.value) || 0);
      srv.price = srv.hours * currentHourly;
      await updateServiceDb(srv);
      renderCatalog();
    }
  }));

  tbody.querySelectorAll("[data-srv-del]").forEach(el => el.addEventListener("click", async e => {
    const id = e.target.dataset.srvDel;
    if (confirm("¿Eliminar este servicio del catálogo?")) {
      try {
        await apiFetch(`/api/services/${id}`, { method: "DELETE" });
        catalog = catalog.filter(s => s.id !== id);
        renderCatalog();
        renderCategories();
      } catch (err) {
        alert("Error al eliminar servicio: " + err.message);
      }
    }
  }));
}

async function updateServiceDb(srv) {
  try {
    await apiFetch(`/api/services/${srv.id}`, {
      method: "PUT",
      body: JSON.stringify(srv)
    });
  } catch (err) {
    console.error("Error actualizando servicio:", err);
  }
}

function initCatalogEvents() {
  // Búsqueda
  $("catalogSearchInput").addEventListener("input", e => {
    currentSearchQuery = e.target.value;
    renderCatalog();
  });

  // Filtro Categoría
  $("catalogCategoryFilter").addEventListener("change", e => {
    currentCategoryFilter = e.target.value;
    renderCatalog();
  });

  // Modal Nueva Categoría
  $("openAddCategoryModalBtn").addEventListener("click", () => {
    $("newCatInput").value = "";
    $("categoryModal").style.display = "flex";
    $("newCatInput").focus();
  });

  $("catModalCloseBtn").addEventListener("click", () => {
    $("categoryModal").style.display = "none";
  });

  $("catModalSubmitBtn").addEventListener("click", async () => {
    const catName = $("newCatInput").value.trim();
    if (!catName) {
      alert("Por favor ingresa un nombre para la categoría.");
      return;
    }

    try {
      const newCat = await apiFetch("/api/categories", {
        method: "POST",
        body: JSON.stringify({ name: catName })
      });
      categories.push(newCat);
      renderCategories();
      $("categoryModal").style.display = "none";
      alert(`Categoría "${catName}" guardada.`);
    } catch (err) {
      alert(err.message);
    }
  });

  // Modal Nuevo Servicio
  $("addCatalogServiceBtn").addEventListener("click", () => {
    renderCategories();
    $("catModalName").value = "";
    $("catModalDesc").value = "";
    $("catModalHours").value = "2";
    $("catalogModal").style.display = "flex";
    $("catModalName").focus();
  });

  $("catModalCancelBtn").addEventListener("click", () => {
    $("catalogModal").style.display = "none";
  });

  $("catModalSaveBtn").addEventListener("click", async () => {
    const name = $("catModalName").value.trim();
    if (!name) {
      alert("Por favor ingresa un nombre para el servicio.");
      return;
    }

    const category_name = $("catModalCategory").value || "General";
    const description = $("catModalDesc").value.trim();
    const hours = Math.max(0, Number($("catModalHours").value) || 0);
    const price = hours * hourly();

    try {
      const newSrv = await apiFetch("/api/services", {
        method: "POST",
        body: JSON.stringify({ category_name, name, description, hours, price })
      });

      catalog.push(newSrv);
      // Recargar categorías por si se auto-creó
      const updatedCats = await apiFetch("/api/categories");
      categories = updatedCats;
      renderCategories();
      renderCatalog();
      $("catalogModal").style.display = "none";
    } catch (err) {
      alert("Error creando servicio: " + err.message);
    }
  });

  // Importar CSV
  $("importCatalogCsvBtn").addEventListener("click", () => {
    $("importCatalogCsvInput").click();
  });

  $("importCatalogCsvInput").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(evt) {
      const text = evt.target.result;
      const lines = text.split(/\r\n|\n/);
      const servicesToImport = [];

      lines.forEach((line, idx) => {
        if (!line.trim() || (idx === 0 && line.toLowerCase().includes("servicio"))) return;
        const cols = line.split(/,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/).map(c => c.replace(/^"|"$/g, '').trim());

        if (cols.length >= 1 && cols[0]) {
          let name = cols[0];
          let category = "General";
          let desc = "";
          let hours = 2;
          let price = undefined;

          if (cols.length >= 2) category = cols[1] || "General";
          if (cols.length >= 3) desc = cols[2];
          if (cols.length >= 4) hours = Number(cols[3]) || 0;
          if (cols.length >= 5) price = Number(cols[4]) || undefined;

          servicesToImport.push({ name, category, description: desc, hours, price });
        }
      });

      if (servicesToImport.length > 0) {
        try {
          const res = await apiFetch("/api/services/batch", {
            method: "POST",
            body: JSON.stringify({ services: servicesToImport })
          });
          await loadCatalogData();
          alert(`¡Se importaron ${res.count} servicios a la base de datos exitosamente!`);
        } catch (err) {
          alert("Error importando servicios: " + err.message);
        }
      } else {
        alert("No se encontraron servicios válidos en el archivo CSV.");
      }
      $("importCatalogCsvInput").value = "";
    };
    reader.readAsText(file);
  });

  // Exportar CSV
  $("exportCatalogCsvBtn").addEventListener("click", () => {
    if (catalog.length === 0) {
      alert("El catálogo está vacío. No hay servicios para exportar.");
      return;
    }

    let csvRows = ["SERVICIO,CATEGORIA,DESCRIPCION,HORAS,VALOR HORA,PRECIO ESTIMADO"];
    const hRate = hourly();

    catalog.forEach(s => {
      const price = s.price ? s.price : (s.hours * hRate);
      csvRows.push(`"${s.name.replace(/"/g, '""')}","${(s.category_name || 'General').replace(/"/g, '""')}","${(s.description || '').replace(/"/g, '""')}",${s.hours},${Math.round(hRate)},${Math.round(price)}`);
    });

    downloadCsv(csvRows.join("\n"), `catalogo_servicios_${new Date().toISOString().slice(0, 10)}.csv`);
  });
}
