/**
 * Motor de Renderizado e Impresión PDF · Katio Design
 * Genera documentos en formato oficial de alta fidelidad desde los datos de la base de datos.
 */

function generatePdfFromDocument(doc, type = "quote", settings = {}) {
  const isInvoice = type === "invoice";
  const docTitle = (doc.doc_type || (isInvoice ? "CUENTA DE COBRO" : "COTIZACIÓN")).toUpperCase();
  const consecutive = doc.consecutive || (isInvoice ? "FACT-00001" : "COT-00001");
  const dateStr = formatDateReadable(doc.emission_date || getTodayISO());
  const dueDateStr = formatDateReadable(doc.due_date || addDaysISO(getTodayISO(), 15));
  
  const clientName = (doc.client_name || "CLIENTE GENERAL").toUpperCase();
  const clientNit = doc.client_nit || "Consumidor Final";
  const clientPhone = doc.client_phone || "N/A";
  const clientEmail = doc.client_email || "N/A";
  const clientAddress = doc.client_address || "Montería, Colombia";

  const emisorName = settings.emisor_name || "Mauricio Luis Cavadias Sepúlveda";
  const emisorNit = settings.emisor_nit || "1.003.061.562-1";
  const emisorRegimen = settings.emisor_regimen || "Persona natural · No responsable de IVA";
  const emisorPhone = settings.emisor_phone || "3045380714";
  const emisorCity = settings.emisor_city || "Montería, Córdoba";
  const emisorEmail = settings.emisor_email || "kattioshop@gmail.com";
  const bankNequi = settings.bank_nequi || "3045380714";
  const bankBreb = settings.bank_breb || "@3045380714";

  const items = doc.items || [];
  const regularItems = items.filter(i => !i.isDiscount);
  const discountItems = items.filter(i => i.isDiscount);

  // La complejidad es interna y transparente: se aplica al valor unitario para que el cliente NUNCA vea una fila de complejidad
  const compPercent = Number(doc.complexity_percent) || 0;
  const compFactor = 1 + (compPercent / 100);

  let rowsHtml = "";

  regularItems.forEach(item => {
    const adjustedUnit = Math.round((item.unitValue || 0) * compFactor);
    const lineTotal = (item.qty || 1) * adjustedUnit;
    rowsHtml += `
      <tr>
        <td>
          <div style="font-weight:bold; color:#1a1c23;">${escapeHtml(item.concept)}</div>
          ${item.description ? `<div style="font-size:11px; color:#666; margin-top:3px; font-style:italic;">${escapeHtml(item.description)}</div>` : ''}
        </td>
        <td style="text-align:center;">${item.qty || 1}</td>
        <td style="text-align:right;">${money(adjustedUnit)}</td>
        <td style="text-align:right; font-weight:bold;">${money(lineTotal)}</td>
      </tr>
    `;
  });

  // Descuentos al final de la tabla resaltados en verde (#d2f669) con letra azul (#4a72ff)
  discountItems.forEach(item => {
    const discAmount = Math.abs(item.unitValue || 0);
    rowsHtml += `
      <tr style="background-color:#d2f669 !important; color:#4a72ff !important; font-size:12px !important; font-weight:bold !important; border-top:2px solid #4a72ff !important; border-bottom:2px solid #4a72ff !important;">
        <td style="padding:10px 8px;">
          <div>${escapeHtml(item.concept)} (${item.discountPercent || 10}% DESCUENTO)</div>
          ${item.description ? `<div style="font-size:11px; opacity:0.85; font-style:italic;">${escapeHtml(item.description)}</div>` : ''}
        </td>
        <td style="text-align:center; padding:10px 8px;">1</td>
        <td style="text-align:right; padding:10px 8px;">-${money(discAmount)}</td>
        <td style="text-align:right; padding:10px 8px;">-${money(discAmount)}</td>
      </tr>
    `;
  });

  let ivaRowHtml = "";
  if (doc.apply_iva) {
    ivaRowHtml = `
      <div style="display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid #eee;">
        <span>IVA (19%):</span>
        <span style="font-weight:bold; color:#1a1c23;">${money(doc.iva_value || 0)}</span>
      </div>
    `;
  } else {
    ivaRowHtml = `
      <div style="display:flex; justify-content:space-between; padding:5px 0; border-bottom:1px solid #eee; color:#666; font-size:11px;">
        <span>IVA (0%):</span>
        <span>$0 <em>(No responsable de IVA)</em></span>
      </div>
    `;
  }

  const termsOrLegal = isInvoice ? `
    <div style="margin-top:22px; font-size:11px; line-height:1.55; border-top:1px dashed #ccc; padding-top:14px; color:#444;">
      <strong>Nota Legal:</strong> Este documento se expide con fines de cobro y registro comercial de servicios prestados por persona natural perteneciente al régimen no responsable del Impuesto sobre las Ventas (IVA), de conformidad con el Art. 437 del Estatuto Tributario de Colombia. No requiere autorización de numeración ni resolución electrónica DIAN.
    </div>
  ` : `
    <div style="margin-top:22px; font-size:11px; line-height:1.55; border-top:1px dashed #ccc; padding-top:14px; color:#444;">
      <strong>Términos y Condiciones del Servicio:</strong>
      <ol style="padding-left:18px; margin-top:6px;">
        <li><strong>Inicio y Cronograma:</strong> El proyecto inicia formalmente tras la confirmación del anticipo del 50% del valor total y la entrega completa de insumos requeridos.</li>
        <li><strong>Revisiones y Ajustes:</strong> Se incluyen hasta 2 rondas de revisiones sobre las propuestas presentadas.</li>
        <li><strong>Pago Final y Entrega:</strong> Los artes finales y/o archivos editables se entregarán tras la cancelación del 50% restante.</li>
        <li><strong>Propiedad Intelectual:</strong> Los derechos patrimoniales de uso se transferirán al cliente una vez completado el pago del 100%.</li>
        <li><strong>Vigencia:</strong> Esta propuesta tiene una vigencia de ${doc.validity_days || 15} días calendario a partir de su emisión.</li>
      </ol>
    </div>
  `;

  const html = `
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8">
    <title>${docTitle} ${consecutive} · Katio Design</title>
    <style>
      * { box-sizing: border-box; }
      body { background: #ffffff; color: #1f2421; font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 30px; font-size: 13px; }
      .pdf-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 25px; border-bottom: 2px solid #4a72ff; padding-bottom: 18px; }
      .pdf-brand-title { font-size: 26px; font-weight: 800; line-height: 1.1; letter-spacing: 1.5px; color: #4a72ff; }
      .pdf-brand-sub { font-size: 11px; color: #555; margin-top: 6px; line-height: 1.5; }
      .pdf-meta { text-align: right; font-size: 12px; line-height: 1.5; }
      .pdf-doc-num { font-size: 17px; font-weight: 800; margin-bottom: 4px; color: #1a1c23; }
      .pdf-client-title { font-size: 12px; font-weight: 700; margin: 15px 0 10px; text-transform: uppercase; letter-spacing: 0.05em; background: #f4f6f9; padding: 10px 14px; border-left: 4px solid #4a72ff; border-radius: 4px; }
      .pdf-client-details { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; font-size: 11px; color: #333; margin-bottom: 15px; padding: 0 4px; }
      .pdf-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
      .pdf-table th { background: #f4f6f9; border-top: 1px solid #e5e9f0; border-bottom: 2px solid #4a72ff; padding: 10px 8px; font-size: 11px; text-align: left; color: #4a72ff; font-weight: 700; }
      .pdf-table td { border-bottom: 1px solid #eee; padding: 10px 8px; font-size: 12px; vertical-align: top; }
      .pdf-totals-container { margin-top: 15px; display: flex; justify-content: flex-end; }
      .pdf-totals-box { width: 320px; font-size: 12px; }
      .pdf-total-row { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #eee; }
      .pdf-total-row.grand { border-top: 2px solid #4a72ff; border-bottom: none; font-size: 15px; font-weight: bold; color: #4a72ff; padding-top: 8px; margin-top: 4px; }
      .pdf-bank-info { margin-top: 20px; background: #f7f9fc; border: 1px solid #e1e8f5; border-radius: 8px; padding: 14px; }
      .pdf-bank-title { font-size: 11px; font-weight: bold; color: #4a72ff; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
      .pdf-bank-details { font-size: 11px; color: #333; line-height: 1.5; }
      .pdf-bank-badges { display: flex; gap: 12px; margin-top: 8px; flex-wrap: wrap; }
      .bank-badge { background: #ffffff; border: 1px solid #c5d4fb; border-radius: 6px; padding: 5px 10px; font-weight: 600; color: #1a1c23; font-size: 11px; }
      .pdf-footer-social { text-align: center; margin-top: 25px; font-size: 11px; font-weight: bold; color: #666; }
      @media print { body { padding: 0; } }
    </style>
  </head>
  <body>
    <div class="pdf-header">
      <div>
        <div class="pdf-brand-title">ΚΛΤΙO<br>DESIGN</div>
        <div class="pdf-brand-sub">
          Tel: ${escapeHtml(emisorPhone)}<br>
          ${escapeHtml(emisorCity)}<br>
          ${escapeHtml(emisorEmail)}
        </div>
      </div>
      <div class="pdf-meta">
        <div class="pdf-doc-num">${docTitle} N° ${consecutive}</div>
        <div><strong>Fecha de emisión:</strong> ${dateStr}</div>
        ${isInvoice ? `<div><strong>Fecha de vencimiento:</strong> ${dueDateStr}</div>` : `<div><strong>Vigencia:</strong> ${doc.validity_days || 15} días calendario</div>`}
        <div style="margin-top:5px; font-weight:bold; color:#1a1c23;">${escapeHtml(emisorName)}</div>
        <div>NIT: ${escapeHtml(emisorNit)}</div>
        <div>${escapeHtml(emisorRegimen)}</div>
      </div>
    </div>

    <div class="pdf-client-title">${docTitle} EMITIDA A: ${clientName}</div>

    <div class="pdf-client-details">
      <div><strong>NIT / C.C.:</strong> ${escapeHtml(clientNit)}</div>
      <div><strong>Teléfono:</strong> ${escapeHtml(clientPhone)}</div>
      <div><strong>Correo:</strong> ${escapeHtml(clientEmail)}</div>
      <div><strong>Dirección / Ciudad:</strong> ${escapeHtml(clientAddress)}</div>
    </div>

    <div style="font-size:12px; color:#444; margin-bottom:15px; line-height:1.5;">
      ${isInvoice 
        ? "Por medio del presente documento se efectúa el cobro formal por los servicios profesionales de diseño prestados según el siguiente detalle:" 
        : "En el presente documento se detallan los conceptos, alcances y valores de los servicios profesionales de diseño para su consideración:"}
    </div>

    <table class="pdf-table">
      <thead>
        <tr>
          <th width="50%">CONCEPTO / SERVICIO</th>
          <th width="12%" style="text-align:center;">CANT.</th>
          <th width="19%" style="text-align:right;">VALOR UNIT.</th>
          <th width="19%" style="text-align:right;">TOTAL</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>

    <div class="pdf-totals-container">
      <div class="pdf-totals-box">
        <div class="pdf-total-row">
          <span>Subtotal:</span>
          <span>${money(doc.subtotal || 0)}</span>
        </div>
        ${ivaRowHtml}
        <div class="pdf-total-row grand">
          <span>TOTAL A PAGAR:</span>
          <span>${money(doc.total || 0)}</span>
        </div>
      </div>
    </div>

    <div class="pdf-bank-info">
      <div class="pdf-bank-title">💳 Información de Pago & Cuentas Bancarias</div>
      <div class="pdf-bank-details">
        <div><strong>Titular de la cuenta:</strong> ${escapeHtml(emisorName)} &nbsp;|&nbsp; <strong>C.C:</strong> ${escapeHtml(emisorNit)}</div>
        <div class="pdf-bank-badges">
          <div class="bank-badge">✅ NEQUI: ${escapeHtml(bankNequi)}</div>
          <div class="bank-badge">✅ Bre-B: ${escapeHtml(bankBreb)}</div>
        </div>
      </div>
    </div>

    ${termsOrLegal}

    <div class="pdf-footer-social">
      f @kattioshop · Katio Design · Creatividad & Estrategia Gráfica
    </div>
  </body>
  </html>
  `;

  const printWindow = window.open("", "_blank");
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 400);
}
