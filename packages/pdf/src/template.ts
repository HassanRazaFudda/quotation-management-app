/**
 * The quotation HTML: two A4 pages, laid out explicitly.
 *
 *   Page 1  header · guest details · travel dates and flights · itinerary,
 *           then a gap, then the price panel sitting on the bottom edge.
 *   Page 2  extra services · includes / requirements / terms · remarks,
 *           then a gap, then the signature lines on the bottom edge.
 *
 * Both pages carry the same footer: who produced the quotation on the right,
 * who built the software on the left.
 *
 * The page boxes are fixed at 210x297mm and the printer margins are set to
 * zero, so this file — not Chromium's pagination — decides what lands where.
 * `.sheet-body` is a flex column with a `.spacer` in it, which is what pins
 * the price panel and the signatures to the bottom of their page.
 */

import type { PdfTravel, QuotationPdfView } from "./view";
import { POWERED_BY } from "./view";

/** A4, and the band inside it the content is allowed to use. */
const PAGE_HEIGHT_MM = 297;
const PAD_TOP_MM = 9;
/** Deep enough to hold the repeated footer. */
const PAD_BOTTOM_MM = 13;
const CONTENT_HEIGHT_MM = PAGE_HEIGHT_MM - PAD_TOP_MM - PAD_BOTTOM_MM;

const SMALL = "font-size:8.5pt; color:#4b5563;";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Small grey parenthesised sub-line, or nothing when empty. */
function subLine(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return "";
  return `<br><span style="${SMALL}">(${escapeHtml(trimmed)})</span>`;
}

function listItems(items: string[]): string {
  return items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function stayRows(view: QuotationPdfView): string {
  return view.stays
    .map((stay, index) => {
      const highlight = index % 2 === 1 ? ' class="row-highlight"' : "";
      return `
                <tr${highlight}>
                    <td><strong>${escapeHtml(stay.phase)}</strong>${subLine(stay.nights)}</td>
                    <td>${escapeHtml(stay.dates)}${subLine(stay.datesSub)}</td>
                    <td><strong>${escapeHtml(stay.accommodation)}</strong></td>
                    <td>${escapeHtml(stay.meal)}${subLine(stay.mealNote)}</td>
                </tr>`;
    })
    .join("");
}

// ------------------------------------------------------------------ travel

/**
 * Departure and return, side by side, above the itinerary.
 *
 * The dates are the itinerary's own first and last day, so they are printed
 * whether or not the ticket is part of the package; only the sector lines
 * depend on flights being sold.
 */
function travelSection(travel: PdfTravel): string {
  // No sector line without a ticket: the note below says it once, and saying
  // it inside both cards as well would be three times on one screen.
  const card = (eyebrow: string, date: string, sector: string) => `
        <div class="travel-card">
            <span class="travel-eyebrow">${eyebrow}</span>
            <span class="travel-date">${date ? escapeHtml(date) : "—"}</span>
            ${sector ? `<span class="travel-sector">${escapeHtml(sector)}</span>` : ""}
        </div>`;

  const badge = travel.included
    ? '<span class="travel-badge on">Air Ticket Included</span>'
    : '<span class="travel-badge off">Air Ticket Not Included</span>';

  return `
    <div class="section-title">
        Travel Details ${badge}
    </div>

    <div class="travel-row">
        ${card("Departing on", travel.departureDate, travel.outbound)}
        ${card("Returning on", travel.returnDate, travel.inbound)}
    </div>
    ${travel.note ? `<p class="travel-note">${escapeHtml(travel.note)}</p>` : ""}`;
}

// ----------------------------------------------------------------- page two

/** Mina and Arafat services, side by side. Omitted entirely when both empty. */
function servicesSection(view: QuotationPdfView): string {
  const hasMina = view.minaServices.length > 0;
  const hasArafat = view.arafatServices.length > 0;
  if (!hasMina && !hasArafat) return "";

  const column = (title: string, items: string[]) =>
    items.length === 0
      ? ""
      : `<div class="col"><div class="service-box"><h4>${title}</h4>
           <ul>${listItems(items)}</ul></div></div>`;

  return `
    <div class="footer-cols services-row">
        ${column("Extra Services in Mina", view.minaServices)}
        ${column("Extra Services in Arafat", view.arafatServices)}
    </div>`;
}

/**
 * Always printed. An empty box is the point when the quotation is handed over
 * on paper and something is agreed at the counter.
 */
function remarksSection(view: QuotationPdfView): string {
  const body = view.remarks ? escapeHtml(view.remarks).replace(/\n/g, "<br>") : "";
  return `
    <div class="remarks">
        <h4>Remarks</h4>
        <div class="remarks-body">${body}</div>
    </div>`;
}

function signatureSection(): string {
  const line = (caption: string) => `
        <div class="sign">
            <div class="sign-line"></div>
            <span>${caption}</span>
        </div>`;

  return `
    <div class="sign-row">
        ${line("Guest Signature")}
        ${line("For Junaidi Air Travels")}
    </div>`;
}

/** Repeated at the foot of every page. */
function sheetFooter(view: QuotationPdfView): string {
  return `
        <div class="sheet-footer">
            <span>Powered by <strong>${POWERED_BY.name}</strong> &nbsp;·&nbsp; ${POWERED_BY.url} &nbsp;·&nbsp; ${POWERED_BY.contact}</span>
            <span>${
              view.generatedBy
                ? `Generated by: <strong>${escapeHtml(view.generatedBy)}</strong>`
                : ""
            }</span>
        </div>`;
}

// ------------------------------------------------------------------- build

/**
 * @param scale Applied to the page content only — the sheet itself stays A4.
 *   `.sheet-body` is made taller by the same factor so a shrunken page still
 *   reaches the bottom edge. The renderer walks this down until nothing
 *   overflows.
 */
export function buildHtml(view: QuotationPdfView, scale = 1): string {
  const zoom = scale !== 1 ? ` zoom: ${scale};` : "";
  const bodyHeight = (CONTENT_HEIGHT_MM / scale).toFixed(3);
  const note = view.includesNote
    ? `<span class="warning-text">${escapeHtml(view.includesNote)}</span>`
    : "";

  return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${escapeHtml(view.company.name)} - Quotation ${escapeHtml(view.quotationId)}</title>
    <style>
        @page { size: A4; margin: 0; }
        html, body { margin: 0; padding: 0; background-color: #ffffff; }
        body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #111827; font-size: 10pt; line-height: 1.5;
        }
        *, *::before, *::after { box-sizing: border-box; }

        /* ---------------------------------------------------------- sheet */
        .sheet {
            position: relative;
            width: 210mm; height: ${PAGE_HEIGHT_MM}mm;
            padding: ${PAD_TOP_MM}mm 12mm ${PAD_BOTTOM_MM}mm;
            overflow: hidden;
            page-break-after: always; break-after: page;
        }
        .sheet:last-of-type { page-break-after: auto; break-after: auto; }
        .sheet-body {
            height: ${bodyHeight}mm;
            display: flex; flex-direction: column;${zoom}
        }
        /* No shrinking: a section that does not fit must visibly overflow, so
           the renderer can measure it and scale the page down instead. */
        .sheet-body > * { flex: 0 0 auto; }
        /* Eats the leftover height, which pins what follows to the bottom. */
        .sheet-body > .spacer { flex: 1 1 auto; min-height: 6mm; }

        .sheet-footer {
            position: absolute; left: 12mm; right: 12mm; bottom: 6mm;
            display: flex; justify-content: space-between; align-items: baseline;
            border-top: 1px solid #e5e7eb; padding-top: 3px;
            font-size: 7.5pt; color: #6b7280;
        }
        .sheet-footer strong { color: #374151; }

        /* --------------------------------------------------------- header */
        .header-table { width: 100%; margin-bottom: 10px; border-bottom: 3px solid #dc2626; padding-bottom: 8px; }
        .header-table td { vertical-align: middle; }
        .logo-cell { width: 140px; text-align: left; padding-right: 15px; }
        .logo-cell img { max-width: 130px; max-height: 110px; width: auto; height: auto; display: block; object-fit: contain; object-position: left center; }
        .company-info { text-align: center; padding-right: 140px; }
        .company-info h1 { color: #dc2626; margin: 0; font-size: 22pt; font-weight: 800; letter-spacing: 1px; }
        .company-info h2 { color: #111827; margin: 5px 0 3px 0; font-size: 13pt; font-weight: bold; }
        .company-info p { margin: 3px 0; color: #4b5563; font-size: 9pt; }

        /* A slim strip so a loose second page is still identifiable. */
        .page-strip {
            display: flex; justify-content: space-between; align-items: baseline;
            border-bottom: 2px solid #dc2626; padding-bottom: 5px; margin-bottom: 12px;
            font-size: 9pt; color: #4b5563;
        }
        .page-strip strong { color: #dc2626; font-size: 11pt; letter-spacing: 0.5px; }

        .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        .meta-table td { padding: 9px 12px; border: 1px solid #d1d5db; font-size: 10pt; }
        .meta-table .label { background-color: #f3f4f6; font-weight: bold; width: 15%; }

        .section-title { color: #dc2626; font-size: 13pt; border-bottom: 2px solid #dc2626; padding-bottom: 4px; margin-top: 4px; margin-bottom: 8px; text-transform: uppercase; font-weight: bold; }

        /* --------------------------------------------------------- travel */
        .travel-badge {
            float: right; text-transform: none; letter-spacing: 0;
            font-size: 8pt; font-weight: bold; padding: 2px 9px; border-radius: 10px;
            position: relative; top: 2px;
        }
        .travel-badge.on { background-color: #ecfdf5; color: #047857; border: 1px solid #6ee7b7; }
        .travel-badge.off { background-color: #f3f4f6; color: #4b5563; border: 1px solid #d1d5db; }

        .travel-row { display: flex; gap: 12px; margin-bottom: 10px; }
        .travel-card {
            flex: 1 1 0; display: flex; flex-direction: column;
            border: 1px solid #d1d5db; border-left: 4px solid #dc2626; border-radius: 4px;
            background-color: #f9fafb; padding: 9px 14px;
        }
        .travel-eyebrow { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.6px; color: #6b7280; font-weight: bold; }
        .travel-date { font-size: 13pt; font-weight: bold; color: #111827; line-height: 1.3; }
        .travel-sector { font-size: 9pt; color: #4b5563; }
        .travel-note { margin: 0 0 10px 0; font-size: 8.5pt; color: #4b5563; }

        /* ------------------------------------------------------ itinerary */
        .data-table { width: 100%; border-collapse: collapse; }
        .data-table th, .data-table td { padding: 9px 12px; text-align: left; border: 1px solid #9ca3af; font-size: 10pt; }
        .data-table th { background-color: #dc2626; color: #ffffff; font-weight: bold; }
        .data-table .row-highlight { background-color: #f9fafb; }

        .total-section { text-align: right; padding: 12px 15px; background-color: #fef2f2; border-left: 5px solid #dc2626; border-right: 1px solid #fca5a5; border-top: 1px solid #fca5a5; border-bottom: 1px solid #fca5a5; }
        .total-section h2 { margin: 0; color: #dc2626; font-size: 18pt; }
        .total-section p { margin: 3px 0 0 0; color: #111827; font-weight: bold; font-size: 11pt; }

        /* -------------------------------------------------------- page 2 */
        .footer-cols { display: flex; width: 100%; gap: 12px; margin-bottom: 10px; align-items: stretch; }
        .col { flex: 1 1 0; display: flex; }
        .footer-box, .service-box { background-color: #f9fafb; border: 1px solid #d1d5db; padding: 14px; border-radius: 4px; font-size: 9pt; width: 100%; }
        .footer-box h4, .service-box h4 { margin-top: 0; margin-bottom: 10px; color: #111827; border-bottom: 1px solid #d1d5db; padding-bottom: 6px; }
        .footer-box ul, .service-box ul { margin: 0; padding-left: 18px; }
        .footer-box li, .service-box li { margin-bottom: 6px; }

        .services-row .service-box { background-color: #fffbeb; border-color: #fcd34d; }
        .services-row .service-box h4 { color: #92400e; border-bottom-color: #fcd34d; }

        /* Takes up some of what is left of the page - it is space to write in -
           but capped, so a short quotation does not print one enormous box. */
        .sheet-body > .remarks { flex: 1 1 auto; min-height: 24mm; max-height: 80mm; }
        .remarks { border: 1px solid #d1d5db; border-left: 4px solid #6b7280; border-radius: 4px; padding: 10px 14px; font-size: 9pt; }
        .remarks h4 { margin: 0 0 6px 0; font-size: 9.5pt; color: #111827; }
        .remarks-body { color: #374151; }

        .sign-row { display: flex; gap: 40px; }
        .sign { flex: 1 1 0; text-align: center; font-size: 9pt; color: #4b5563; }
        .sign-line { border-bottom: 1px solid #9ca3af; margin-bottom: 5px; height: 14mm; }

        .warning-text { color: #dc2626; font-weight: bold; font-size: 8.5pt; margin-top: 10px; display: block; }
    </style>
</head>
<body>

<!-- ===================================================== page 1 ========= -->
<div class="sheet">
    <div class="sheet-body">
        <table class="header-table">
            <tr>
                <td class="logo-cell"><img src="${view.logoDataUri}" alt="${escapeHtml(view.company.name)} Logo" /></td>
                <td class="company-info">
                    <h1>${escapeHtml(view.company.name)}</h1>
                    <h2>${escapeHtml(view.company.tagline)}</h2>
                    <p>${escapeHtml(view.company.address)}</p>
                    <p>${escapeHtml(view.company.contact)}</p>
                </td>
            </tr>
        </table>

        <table class="meta-table">
            <tr>
                <td class="label">Quotation ID:</td>
                <td>${escapeHtml(view.quotationId)}</td>
                <td class="label">Date:</td>
                <td>${escapeHtml(view.date)}</td>
            </tr>
            <tr>
                <td class="label">Guest Name:</td>
                <td><strong>${escapeHtml(view.guestName)}</strong></td>
                <td class="label">Valid Until:</td>
                <td>${escapeHtml(view.validUntil)}</td>
            </tr>
            <tr>
                <td class="label">Package:</td>
                <td colspan="3"><strong>${escapeHtml(view.packageTitle)}</strong></td>
            </tr>
        </table>
${travelSection(view.travel)}
        <div class="section-title">Itinerary &amp; Accommodation Details</div>

        <table class="data-table">
            <thead>
                <tr>
                    <th>Location / Phase</th>
                    <th>Stay Dates</th>
                    <th>Accommodation / Maktab</th>
                    <th>Meal Plan</th>
                </tr>
            </thead>
            <tbody>${stayRows(view)}
            </tbody>
        </table>

        <div class="spacer"></div>

        <div class="total-section">
            <p>Total Estimated Package Price Per Person</p>
            <h2>${escapeHtml(view.totalPrice)}</h2>
        </div>
    </div>
${sheetFooter(view)}
</div>

<!-- ===================================================== page 2 ========= -->
<div class="sheet">
    <div class="sheet-body">
        <div class="page-strip">
            <strong>${escapeHtml(view.company.name)}</strong>
            <span>${escapeHtml(view.quotationId)} &nbsp;·&nbsp; ${escapeHtml(view.guestName)}</span>
        </div>
${servicesSection(view)}
        <div class="footer-cols">
            <div class="col">
                <div class="footer-box">
                    <h4>Price Includes:</h4>
                    <ul>${listItems(
                      // Qurbani is part of the package by default, so it is stated
                      // plainly rather than left to the free-text list.
                      view.qurbaniIncluded ? [...view.includes, "Qurbani."] : view.includes,
                    )}</ul>
                    ${note}
                </div>
            </div>
            <div class="col">
                <div class="footer-box">
                    <h4>Visa Requirements:</h4>
                    <ul>${listItems(view.requirements)}</ul>
                </div>
            </div>
            <div class="col">
                <div class="footer-box">
                    <h4>Terms &amp; Taxes:</h4>
                    <ul>${listItems(view.terms)}</ul>
                </div>
            </div>
        </div>
${remarksSection(view)}
        <div class="spacer"></div>
${signatureSection()}
    </div>
${sheetFooter(view)}
</div>

</body>
</html>`;
}
