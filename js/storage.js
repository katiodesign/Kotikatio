/**
 * Capa de Datos y Cliente API REST · Katio Design SaaS
 * Se comunica directamente con el servidor SQLite para almacenar y consultar
 * cotizaciones, facturas, catálogos, configuraciones y usuarios.
 */

const API_BASE = "";

let authToken = localStorage.getItem("katioAuthToken") || "";
let currentUser = null;
let companySettings = {};

// Estado reactivo en memoria
let categories = [];
let catalog = [];
let activeQuote = null;
let activeInvoice = null;

async function apiFetch(endpoint, options = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  const contentType = res.headers.get("content-type") || "";
  let data = null;
  if (contentType.includes("application/json")) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  if (!res.ok) {
    throw new Error((data && data.error) || (typeof data === "string" ? data : `Error HTTP ${res.status}`));
  }

  return data;
}

// Cargar configuración general desde SQLite
async function loadCompanySettings() {
  try {
    companySettings = await apiFetch("/api/settings");
    if ($("income") && companySettings.income) $("income").value = companySettings.income;
    if ($("expenses") && companySettings.expenses) $("expenses").value = companySettings.expenses;
    if ($("reserve") && companySettings.reserve) $("reserve").value = companySettings.reserve;
    if ($("hours") && companySettings.hours) $("hours").value = companySettings.hours;

    // Llenar campos de SMTP en vista de configuración
    if ($("smtpHost")) $("smtpHost").value = companySettings.smtp_host || "";
    if ($("smtpPort")) $("smtpPort").value = companySettings.smtp_port || "587";
    if ($("smtpUser")) $("smtpUser").value = companySettings.smtp_user || "";
    if ($("smtpPass")) $("smtpPass").value = companySettings.smtp_pass || "";
    if ($("smtpFrom")) $("smtpFrom").value = companySettings.smtp_from || "";
    if ($("smtpSecure")) $("smtpSecure").checked = companySettings.smtp_secure === "1";
    
    // Configuración emisor
    if ($("emisorNameDisplay")) $("emisorNameDisplay").value = companySettings.emisor_name || "";
    if ($("emisorNitDisplay")) $("emisorNitDisplay").value = companySettings.emisor_nit || "";
    if ($("emisorRegimenDisplay")) $("emisorRegimenDisplay").value = companySettings.emisor_regimen || "";
    if ($("emisorPhoneDisplay")) $("emisorPhoneDisplay").value = companySettings.emisor_phone || "";
    if ($("emisorCityDisplay")) $("emisorCityDisplay").value = companySettings.emisor_city || "";
    if ($("emisorEmailDisplay")) $("emisorEmailDisplay").value = companySettings.emisor_email || "";
  } catch (err) {
    console.error("Error cargando configuración:", err);
  }
}

// Guardar configuración general
async function saveCompanySettings() {
  const payload = {
    income: $("income") ? $("income").value : "3000000",
    expenses: $("expenses") ? $("expenses").value : "500000",
    reserve: $("reserve") ? $("reserve").value : "10",
    hours: $("hours") ? $("hours").value : "80"
  };

  if ($("smtpHost")) {
    payload.smtp_host = $("smtpHost").value.trim();
    payload.smtp_port = $("smtpPort").value.trim();
    payload.smtp_user = $("smtpUser").value.trim();
    payload.smtp_pass = $("smtpPass").value;
    payload.smtp_from = $("smtpFrom").value.trim();
    payload.smtp_secure = $("smtpSecure").checked ? "1" : "0";
  }

  try {
    const res = await apiFetch("/api/settings", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    companySettings = res.settings;
    return { success: true };
  } catch (err) {
    alert("Error guardando configuración: " + err.message);
    return { success: false, error: err.message };
  }
}

// Cargar categorías y servicios desde la BD
async function loadCatalogData() {
  try {
    const [cats, servs] = await Promise.all([
      apiFetch("/api/categories"),
      apiFetch("/api/services")
    ]);
    categories = cats;
    catalog = servs;
    renderCategories();
    renderCatalog();
  } catch (err) {
    console.error("Error cargando catálogo:", err);
  }
}
