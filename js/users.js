/**
 * Módulo de Gestión de Usuarios · Katio Design SaaS
 * Creación de usuarios con envío de credenciales por correo electrónico (Nodemailer).
 */

async function renderUsers() {
  const tbody = $("usersTableBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:20px;">Cargando usuarios...</td></tr>`;

  try {
    const users = await apiFetch("/api/users");
    tbody.innerHTML = "";

    users.forEach((u, i) => {
      const tr = document.createElement("tr");
      const isCurrent = currentUser && currentUser.id === u.id;
      const roleClass = u.role === "Admin" ? "role-badge admin" : "role-badge standard";

      tr.innerHTML = `
        <td><span class="num-badge">${i + 1}</span></td>
        <td><strong>${escapeHtml(u.name)}</strong> ${isCurrent ? '<small style="color:var(--accent); font-weight:bold;">(Tú)</small>' : ''}</td>
        <td style="color:var(--muted);">${escapeHtml(u.email)}</td>
        <td><span class="${roleClass}">${escapeHtml(u.role)}</span></td>
        <td style="color:var(--muted); font-size:12px;">${formatDateReadable(u.created_at ? u.created_at.slice(0, 10) : getTodayISO())}</td>
        <td style="text-align:right;">
          ${isCurrent ? '<small style="color:var(--muted);">Sesión activa</small>' : `<button class="delete" data-user-del="${u.id}">Eliminar</button>`}
        </td>
      `;
      tbody.appendChild(tr);
    });

    tbody.querySelectorAll("[data-user-del]").forEach(btn => {
      btn.addEventListener("click", async e => {
        const id = e.target.dataset.userDel;
        if (confirm("¿Estás seguro de revocar y eliminar el acceso de este usuario permanentemente?")) {
          try {
            await apiFetch(`/api/users/${id}`, { method: "DELETE" });
            renderUsers();
          } catch (err) {
            alert("Error al eliminar usuario: " + err.message);
          }
        }
      });
    });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:#d93838; text-align:center; padding:20px;">Error al cargar usuarios: ${err.message}</td></tr>`;
  }
}

function initUsersEvents() {
  const addBtn = $("openAddUserModalBtn");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      $("newUserName").value = "";
      $("newUserEmail").value = "";
      $("newUserPassword").value = generateRandomPassword();
      $("newUserRole").value = "Usuario Estándar";
      $("userModalErrorMsg").textContent = "";
      $("userModal").style.display = "flex";
      $("newUserName").focus();
    });
  }

  const cancelBtn = $("userModalCancelBtn");
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      $("userModal").style.display = "none";
    });
  }

  const saveBtn = $("userModalSaveBtn");
  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const name = $("newUserName").value.trim();
      const email = $("newUserEmail").value.trim();
      const password = $("newUserPassword").value;
      const role = $("newUserRole").value;
      const errEl = $("userModalErrorMsg");
      errEl.textContent = "";

      if (!name || !email || !password) {
        errEl.textContent = "Por favor diligencia todos los campos.";
        return;
      }

      saveBtn.disabled = true;
      saveBtn.textContent = "Creando y enviando correo...";

      try {
        const res = await apiFetch("/api/users", {
          method: "POST",
          body: JSON.stringify({ name, email, password, role })
        });

        $("userModal").style.display = "none";
        renderUsers();

        if (res.emailResult && res.emailResult.sent) {
          alert(`¡Usuario creado exitosamente!\nSe enviaron las credenciales de acceso al correo: ${email}`);
        } else {
          // Si el servidor SMTP no está listo, mostrar modal informativo con las credenciales
          alert(`¡Usuario creado exitosamente!\n\nAVISO DE CORREO: ${res.emailResult ? res.emailResult.reason : 'SMTP no configurado'}\n\nEntrega estas credenciales manualmente al usuario:\n• Usuario: ${email}\n• Contraseña: ${password}\n• Rol: ${role}`);
        }
      } catch (err) {
        errEl.textContent = err.message || "Error al crear usuario.";
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Crear Usuario & Enviar Accesos";
      }
    });
  }
}

function generateRandomPassword() {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789!@#$";
  let pass = "";
  for (let i = 0; i < 10; i++) {
    pass += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pass;
}
