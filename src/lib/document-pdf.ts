/**
 * Client-side document PDF helpers for Fortell.
 * Opens a print-ready HTML blob so Norwegian (æøå) renders; user saves as PDF.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildPrintDocumentHtml(title: string, body: string): string {
  const safeTitle = escapeHtml(title.trim() || "Dokument");
  const safeBody = escapeHtml(body.trim());
  const date = escapeHtml(new Date().toLocaleDateString("nb-NO"));
  return `<!DOCTYPE html>
<html lang="nb">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${safeTitle}</title>
  <style>
    @page { margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      min-height: 100%;
      background: #ffffff !important;
      color: #111111 !important;
    }
    body {
      font-family: Georgia, "Times New Roman", Times, serif;
      font-size: 11pt;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    h1 {
      margin: 0 0 1.1rem;
      font-size: 18pt;
      font-weight: 650;
      letter-spacing: -0.02em;
      line-height: 1.2;
      color: #111111;
    }
    .meta {
      margin: 0 0 1.25rem;
      color: #555555;
      font-size: 9pt;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      word-wrap: break-word;
      font-family: inherit;
      font-size: 10.5pt;
      color: #111111;
    }
    @media print {
      .no-print { display: none !important; }
    }
    .no-print {
      position: sticky;
      top: 0;
      z-index: 2;
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      align-items: center;
      padding: 0.75rem 1rem;
      background: #f4f4f5;
      border-bottom: 1px solid #ddd;
      font-family: ui-sans-serif, system-ui, sans-serif;
      font-size: 13px;
      color: #18181b;
    }
    .no-print button {
      cursor: pointer;
      border: 0;
      border-radius: 8px;
      padding: 0.45rem 0.85rem;
      background: #0f766e;
      color: #ffffff;
      font-weight: 600;
    }
    .no-print button.secondary {
      background: #e4e4e7;
      color: #18181b;
    }
    main {
      padding: 1.5rem 1.25rem 2rem;
      max-width: 42rem;
      margin: 0 auto;
      background: #ffffff;
    }
  </style>
</head>
<body>
  <div class="no-print">
    <button type="button" id="print-btn">Lagre som PDF</button>
    <button type="button" class="secondary" id="close-btn">Lukk</button>
    <span>Velg «Lagre som PDF» i utskriftsdialogen.</span>
  </div>
  <main>
    <h1>${safeTitle}</h1>
    <p class="meta">Nexus · ${date}</p>
    <pre>${safeBody}</pre>
  </main>
  <script>
    document.getElementById("print-btn").addEventListener("click", function () {
      window.print();
    });
    document.getElementById("close-btn").addEventListener("click", function () {
      window.close();
    });
  </script>
</body>
</html>`;
}

/**
 * Open a print-ready document in a new tab via blob URL.
 * Avoids window.open(..., "noopener") + document.write (blank white tab).
 */
export function openDocumentPdfWindow(input: {
  title: string;
  body: string;
}): boolean {
  const html = buildPrintDocumentHtml(input.title, input.body);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) {
    URL.revokeObjectURL(url);
    return false;
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 120_000);
  return true;
}

export function slugifyFilename(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/æ/g, "ae")
    .replace(/ø/g, "o")
    .replace(/å/g, "a")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "dokument"}.pdf`;
}
