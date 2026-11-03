/**
 * Módulo de Autenticación & Control de Acceso (RBAC)
 * Control de sesiones seguras y Setup Inicial de Administrador (Sin demos).
 */

async function checkSystemAuth() {
  try {
    const status = await apiFetch("/api/auth/status");

    if (!status.initialized) {
      // Primera instalación: Mostrar Setup Inicial
      showSetupScreen();
      return;
    }

    if (authToken) {
      try {
        const me = await apiFetch("/api/auth/me");
        currentUser = me.user;
        updateUserUI();
        hideAuthModal();
        return;
      } catch (e) {
        // Token inválido o expirado
        authToken = "";
        localStorage.removeItem("katioAuthToken");
      }
    }

    // Mostrar modal de login
    showLoginScreen();
  } catch (err) {
    console.error("Error verificando autenticación:", err);
    showLoginScreen();
  }
}

function showSetupScreen() {
  const overlay = $("authModalOverlay");
  overlay.style.display = "flex";
  $("setupFormBox").style.display = "block";
  $("loginFormBox").style.display = "none";
  $("authModalTitle").textContent = "Configuración Inicial del Sistema";
  $("authModalSub").textContent = "Crea la cuenta de Administrador Principal para Katio Design";
}

function showLoginScreen() {
  const overlay = $("authModalOverlay");
  overlay.style.display = "flex";
  $("setupFormBox").style.display = "none";
  $("loginFormBox").style.display = "block";
  $("authModalTitle").textContent = "Acceso al Sistema";
  $("authModalSub").textContent = "Ingresa tus credenciales profesionales";
  $("loginEmail").focus();
}

function hideAuthModal() {
  const overlay = $("authModalOverlay");
  if (overlay) overlay.style.display = "none";
}

function updateUserUI() {
  if (!currentUser) return;

  $("userNameDisplay").textContent = currentUser.name;
  $("userEmailDisplay").textContent = currentUser.email;

  const roleBadge = $("userRoleBadge");
  roleBadge.textContent = currentUser.role;
  roleBadge.className = `role-badge ${currentUser.role === 'Admin' ? 'admin' : 'standard'}`;

  // Control RBAC en menú lateral
  const isAdmin = currentUser.role === "Admin";
  if ($("navItemUsers")) $("navItemUsers").style.display = isAdmin ? "flex" : "none";
  if ($("adminSectionTitle")) $("adminSectionTitle").style.display = isAdmin ? "block" : "none";
  if ($("adminSettingsSection")) $("adminSettingsSection").style.display = isAdmin ? "block" : "none";
}

function initAuthEvents() {
  // Setup Inicial Submit
  $("setupSubmitBtn").addEventListener("click", async () => {
    const name = $("setupName").value.trim();
    const email = $("setupEmail").value.trim();
    const password = $("setupPassword").value;
    const errEl = $("setupErrorMsg");
    errEl.textContent = "";

    if (!name || !email || !password || password.length < 6) {
      errEl.textContent = "Por favor completa todos los campos (contraseña mínimo 6 caracteres).";
      return;
    }

    try {
      const res = await apiFetch("/api/auth/setup", {
        method: "POST",
        body: JSON.stringify({ name, email, password })
      });

      authToken = res.token;
      localStorage.setItem("katioAuthToken", authToken);
      currentUser = res.user;

      alert("¡Administrador registrado exitosamente! Bienvenido a Katio Design SaaS.");
      hideAuthModal();
      updateUserUI();
      initializeAppAfterAuth();
    } catch (err) {
      errEl.textContent = err.message || "Error al inicializar el sistema";
    }
  });

  // Login Submit
  $("loginSubmitBtn").addEventListener("click", async () => {
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;
    const errEl = $("loginErrorMsg");
    errEl.textContent = "";

    if (!email || !password) {
      errEl.textContent = "Por favor ingresa correo y contraseña.";
      return;
    }

    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password })
      });

      authToken = res.token;
      localStorage.setItem("katioAuthToken", authToken);
      currentUser = res.user;

      hideAuthModal();
      updateUserUI();
      initializeAppAfterAuth();
    } catch (err) {
      errEl.textContent = err.message || "Credenciales incorrectas";
    }
  });

  // Logout
  $("logoutBtn").addEventListener("click", () => {
    if (confirm("¿Deseas cerrar la sesión activa?")) {
      authToken = "";
      currentUser = null;
      localStorage.removeItem("katioAuthToken");
      location.reload();
    }
  });
}
