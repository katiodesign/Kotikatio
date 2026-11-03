/**
 * Punto de Entrada Principal (Katio Design SaaS)
 * Enrutador, ciclo de vida, tarifa base, SMTP y sincronización con SQLite
 */

function hourly() {
  const base = (num("income") + num("expenses")) * (1 + Math.min(100, num("reserve")) / 100);
  return base / Math.max(1, num("hours"));
}

function updateRate() {
  const target = (num("income") + num("expenses")) * (1 + Math.min(100, num("reserve")) / 100);
  if ($("monthlyTarget")) $("monthlyTarget").textContent = money(target);
  if ($("hourlyRate")) $("hourlyRate").textContent = money(hourly());
  renderCatalog();
}

function switchView(targetViewId) {
  document.querySelectorAll(".nav-item").forEach(item => {
    item.classList.remove("active");
    if (item.dataset.view === targetViewId) {
      item.classList.add("active");
    }
  });

  document.querySelectorAll(".saas-view").forEach(view => {
    view.style.display = "none";
  });

  const targetView = $(targetViewId);
  if (targetView) {
    targetView.style.display = "block";
  }

  // Acciones al cambiar de vista
  if (targetViewId === "viewUsers") {
    renderUsers();
  }
  if (targetViewId === "viewQuotes") {
    loadQuotesHistory();
  }
  if (targetViewId === "viewInvoice") {
    loadInvoicesHistory();
  }
}

function initTheme() {
  const darkSwitch = $("darkSwitch");
  if (!darkSwitch) return;

  if (localStorage.getItem("katioDarkMode") === "true") {
    document.body.classList.add("dark-mode");
    darkSwitch.checked = true;
  }

  darkSwitch.addEventListener("change", e => {
    if (e.target.checked) {
      document.body.classList.add("dark-mode");
      localStorage.setItem("katioDarkMode", "true");
    } else {
      document.body.classList.remove("dark-mode");
      localStorage.setItem("katioDarkMode", "false");
    }
  });
}

function initResetButton() {
  const resetBtn = $("resetAllDataBtn");
  if (resetBtn) {
    resetBtn.addEventListener("click", async () => {
      const confirmPrompt = prompt("ATENCIÓN: Esto eliminará permanentemente todas las cotizaciones, facturas y servicios de la base de datos dejando el sistema 100% limpio.\n\nEscribe 'LIMPIAR' para confirmar:");
      if (confirmPrompt === "LIMPIAR") {
        try {
          const res = await apiFetch("/api/system/reset", { method: "POST" });
          alert(res.message);
          location.reload();
        } catch (err) {
          alert("Error al restablecer sistema: " + err.message);
        }
      }
    });
  }
}

function initSettingsEvents() {
  const saveBtn = $("saveSettingsBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const res = await saveCompanySettings();
      if (res.success) {
        alert("Configuración y parámetros financieros guardados en la base de datos.");
        updateRate();
      }
    });
  }

  const testSmtpBtn = $("testSmtpBtn");
  if (testSmtpBtn) {
    testSmtpBtn.addEventListener("click", async () => {
      const config = {
        smtp_host: $("smtpHost").value.trim(),
        smtp_port: $("smtpPort").value.trim(),
        smtp_user: $("smtpUser").value.trim(),
        smtp_pass: $("smtpPass").value,
        smtp_secure: $("smtpSecure").checked ? "1" : "0"
      };

      testSmtpBtn.disabled = true;
      testSmtpBtn.textContent = "Probando conexión...";

      try {
        const res = await apiFetch("/api/settings/test-smtp", {
          method: "POST",
          body: JSON.stringify(config)
        });
        alert(res.message);
      } catch (err) {
        alert("Fallo en la prueba SMTP: " + err.message);
      } finally {
        testSmtpBtn.disabled = false;
        testSmtpBtn.textContent = "🔌 Probar Conexión SMTP";
      }
    });
  }
}

function initSidebarNav() {
  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", e => {
      e.preventDefault();
      const targetView = item.dataset.view;
      if (targetView) {
        switchView(targetView);
      }
    });
  });

  const mobileToggle = $("sidebarMobileToggle");
  const sidebar = $("saasSidebar");
  if (mobileToggle && sidebar) {
    mobileToggle.addEventListener("click", () => {
      sidebar.classList.toggle("mobile-open");
    });
  }
}

// Inicialización de la aplicación tras autenticarse
async function initializeAppAfterAuth() {
  await loadCompanySettings();
  await loadCatalogData();
  await resetQuoteEditorToNew();
  await resetInvoiceEditorToNew();
  updateRate();
}

document.addEventListener("DOMContentLoaded", async () => {
  initTheme();
  initResetButton();
  initSidebarNav();
  initAuthEvents();
  initCatalogEvents();
  initQuoteEvents();
  initInvoiceEvents();
  initUsersEvents();
  initSettingsEvents();

  // Escuchar inputs financieros
  ["income", "expenses", "reserve", "hours"].forEach(id => {
    if ($(id)) $(id).addEventListener("input", updateRate);
  });

  // Verificar estado de sesión y base de datos
  await checkSystemAuth();
  if (currentUser) {
    await initializeAppAfterAuth();
  }
});
