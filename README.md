# Katio Design · Suite SaaS Comercial 🎨📊

Sistema SaaS integral de gestión comercial, catálogos, cotizaciones y facturación para agencias y diseñadores, con arquitectura multiusuario, base de datos SQLite integrada, envío de credenciales por correo (Nodemailer) y exportación oficial a PDF.

---

## 🚀 Características Principales

1. **Base de Datos SQLite Nativa (Cero configuración externa):**
   - Persistencia local y en producción dentro de `./data/katio.db` (en Easypanel se monta el volumen persistente `/app/data`).
   - Sin servicios de bases de datos externas que consuman RAM innecesaria ni requieran migraciones complejas.
   - Estado 100% limpio al inicio y tras restablecer datos.

2. **Sin Demos · Flujo de Setup Inicial Real:**
   - No hay usuarios demo predeterminados.
   - En el primer arranque, el sistema detecta que la base de datos está limpia y solicita registrar la cuenta del **Administrador Principal**.

3. **Gestión de Usuarios con Envío de Correos Automático:**
   - El Administrador puede crear usuarios con roles (`Admin` o `Usuario Estándar`).
   - El sistema genera contraseñas seguras y envía automáticamente los accesos al correo electrónico mediante **Nodemailer (SMTP)**.
   - Si el SMTP aún no está configurado, el sistema muestra las credenciales en pantalla para su entrega manual.
   - Servidor SMTP configurable desde el panel de control con botón de prueba de conexión en vivo.

4. **Cotizaciones y Facturación Almacenadas en Base de Datos:**
   - Las cotizaciones y cuentas de cobro **no se almacenan como archivos PDF estáticos en carpetas**, sino como registros estructurados en la base de datos SQLite.
   - **Historial y Búsqueda por Consecutivo:** Consulta inmediata escribiendo el consecutivo (ej. `COT-00001` o `FACT-00001`) o el nombre del cliente.
   - **Generación de PDF en tiempo real:** Se exporta o imprime el documento oficial de alta fidelidad Katio Design con un solo clic directamente desde el registro.
   - **Conversión de Cotización a Factura/Cobro:** Convierte una propuesta aprobada en factura en 1 segundo asignando su consecutivo correlativo.

5. **Reglas de Negocio y Tributarias:**
   - **Complejidad (0%, 10%, 20%):** Recargo técnico interno aplicado de manera transparente; **NUNCA** se muestra la fila de complejidad ni su porcentaje al cliente en el PDF ni en la vista previa.
   - **Sin bloque de entregables:** Diseños limpios y profesionales.
   - **Descuentos Porcentuales (%):** Resaltados al final de la tabla en fondo verde (`#d2f669`) con tipografía azul (`#4a72ff`).
   - **Régimen de IVA (19% o 0%):**
     - Con IVA desactivado: desglosa `IVA (0%): $0` con la leyenda *"Persona natural · No responsable de IVA"*.
     - Con IVA activado: calcula el 19% sobre la base gravable y discrimina la fila `IVA (19%)`.

---

## 💻 Cómo Probarlo Localmente

### Opción 1: En 1 Clic (Recomendada con Node.js)
1. Haz doble clic en el archivo:
   👉 **`iniciar_local.bat`**
2. Se abrirá la consola de Node.js y tu navegador automáticamente en:
   **`http://localhost:3000`**

### Opción 2: Desde la Terminal
```bash
node server.js
```
Abre en tu navegador: [http://localhost:3000](http://localhost:3000)

---

## 🚢 Despliegue en Easypanel

1. Sube este repositorio a tu cuenta de **GitHub** o **GitLab**.
2. En tu proyecto de **Easypanel**, crea un nuevo servicio de tipo **App**.
3. En la sección **Source**:
   - Conecta tu repositorio Git y selecciona la rama (`main`).
   - En **Build Type**, selecciona **Dockerfile** (Easypanel detectará automáticamente el archivo [Dockerfile](file:///c:/Users/mauri/Desktop/TARIFARIO/Dockerfile)).
4. En la sección **Ports**:
   - Verifica que el puerto `80` esté mapeado.
5. En la sección **Volumes** (Esencial para la persistencia de la Base de Datos):
   - Agrega un volumen persistente:
     - **Host Path / Volume Name:** `katio-data`
     - **Mount Path:** `/app/data`
6. En la sección **Domains**:
   - Asigna tu subdominio (ej: `cotizador.tudominio.com`).
7. Haz clic en **Deploy**. Easypanel construirá el contenedor Node.js y emitirá el certificado SSL HTTPS de inmediato.
