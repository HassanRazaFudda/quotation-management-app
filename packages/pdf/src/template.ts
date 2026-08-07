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

import { lineColor, type StyledLine } from "@junaidi/shared";

import { FONT_FACE_CSS } from "./fonts";
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

/** The brand name with its first word in red and the rest in black. */
function brandName(name: string): string {
    const [first, ...rest] = name.trim().split(/\s+/);
    const red = `<span class="red">${escapeHtml(first ?? "")}</span>`;
    const dark = rest.length ? ` <span class="dark">${escapeHtml(rest.join(" "))}</span>` : "";
    return `${red}${dark}`;
}

/**
 * Brand marks in each platform's own colour: Facebook blue, YouTube red, and
 * Instagram's own gradient (carried inside the SVG). The gradient id is unique
 * to the page, and the header only appears once, so there is no clash.
 */
const SOCIAL_SVG = {
    facebook:
        '<svg viewBox="0 0 24 24" fill="#1877F2"><path d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.6 4.5-4.6 1.3 0 2.7.2 2.7.2v2.9h-1.5c-1.5 0-1.9.9-1.9 1.8V12h3.3l-.5 3.5h-2.8v8.4A12 12 0 0 0 24 12z"/></svg>',
    instagram:
        '<svg viewBox="0 0 24 24" fill="none" stroke="url(#ig)" stroke-width="2">' +
        '<defs><linearGradient id="ig" x1="0" y1="1" x2="1" y2="0">' +
        '<stop offset="0" stop-color="#f9ce34"/><stop offset="0.5" stop-color="#ee2a7b"/><stop offset="1" stop-color="#6228d7"/>' +
        "</linearGradient></defs>" +
        '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/>' +
        '<circle cx="17.3" cy="6.7" r="1.2" fill="url(#ig)" stroke="none"/></svg>',
    youtube:
        '<svg viewBox="0 0 24 24" fill="#FF0000"><path d="M23 7.5s-.2-1.6-.9-2.3c-.9-.9-1.9-.9-2.4-1C16.5 4 12 4 12 4s-4.5 0-8.1.2c-.5 0-1.5 0-2.4 1C.8 5.9.6 7.5.6 7.5S.4 9.4.4 11.3v1.3c0 1.9.2 3.8.2 3.8s.2 1.6.9 2.3c.9.9 2.1.9 2.6 1C6.9 20 12 20 12 20s4.5 0 8.1-.2c.5 0 1.5 0 2.4-1 .7-.7.9-2.3.9-2.3s.2-1.9.2-3.8v-1.3c0-1.9-.2-3.8-.2-3.8zM9.7 15V9l5.2 3-5.2 3z"/></svg>',
    whatsapp:
        '<svg viewBox="0 0 24 24" fill="#25D366"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.36c0-4.54 3.7-8.23 8.24-8.23 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.82c0 4.54-3.69 8.23-8.23 8.23zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.57.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z"/></svg>',
} as const;

/** The link as it reads on the page - the protocol and www. are noise. */
function cleanUrl(url: string): string {
    return url.trim().replace(/^https?:\/\/(www\.)?/i, "").replace(/\/+$/, "");
}

/**
 * The social links for the top-right of the header: each on its own line, the
 * platform icon in its own colour beside the readable link. WhatsApp shows the
 * number and links to a wa.me chat.
 */
function socialIcons(company: QuotationPdfView["company"]): string {
    const social = company.social ?? { facebook: "", instagram: "", youtube: "" };
    const whatsapp = social.whatsapp ?? "";
    const waDigits = whatsapp.replace(/\D/g, "");

    const rows: Array<[keyof typeof SOCIAL_SVG, string, string]> = [
        ["facebook", social.facebook ?? "", cleanUrl(social.facebook ?? "")],
        ["instagram", social.instagram ?? "", cleanUrl(social.instagram ?? "")],
        ["youtube", social.youtube ?? "", cleanUrl(social.youtube ?? "")],
        ["whatsapp", waDigits ? `https://wa.me/${waDigits}` : "", whatsapp.trim()],
    ];

    const html = rows
        .filter(([, href]) => href.trim())
        .map(
            ([name, href, label]) =>
                `<a href="${escapeHtml(href.trim())}" title="${name}">${SOCIAL_SVG[name]}<span class="url">${escapeHtml(label)}</span></a>`,
        )
        .join("");
    return html ? `<div class="social">${html}</div>` : "";
}

function listItems(items: StyledLine[]): string {
    return items
        .map((item) => {
            const styles = [
                lineColor(item.color) && `color:${lineColor(item.color)}`,
                item.bold && "font-weight:700",
            ].filter(Boolean);
            const attr = styles.length ? ` style="${styles.join(";")}"` : "";
            return `<li${attr}>${escapeHtml(item.text)}</li>`;
        })
        .join("");
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

/**
 * The price panel that closes page one.
 *
 * A customer quotation shows one figure. A package shows its two or three tier
 * prices side by side - the same itinerary at Quad, Triple and Double - which
 * is why the itinerary rows drop the room type: the price columns carry it.
 */
function priceSection(view: QuotationPdfView): string {
  if (view.tierPrices.length === 0) {
    return `
        <div class="total-section">
            <p>Total Estimated Package Price Per Person</p>
            <h2>${escapeHtml(view.totalPrice)}</h2>
        </div>`;
  }

  const cards = view.tierPrices
    .map(
      (tier) => `
            <div class="tier-card">
                <span class="tier-label">${escapeHtml(tier.label)}</span>
                <span class="tier-price">${escapeHtml(tier.priceFormatted)}</span>
            </div>`,
    )
    .join("");

  return `
        <p class="tier-caption">Package Price Per Person</p>
        <div class="tier-band">${cards}
        </div>`;
}

/**
 * Per-room-type surcharges, in a band under the itinerary - "Aziziya Triple Bed
 * +PKR 200,000 /-". A package-only extra; empty for a quotation, so nothing
 * prints. Only the ones this print does NOT include show here - one that is
 * included is already inside the tier price it applies to, so showing it
 * again here would read as a second charge.
 */
function addOnsBand(view: QuotationPdfView): string {
  if (view.addOns.length === 0) return "";
  const items = view.addOns
    .map(
      (addOn) =>
        `<span class="addon-item"><strong>${escapeHtml(addOn.label)}</strong> <strong class="addon-price">${escapeHtml(addOn.amountFormatted)}</strong></span>`,
    )
    .join("");
  return `<div class="addons-band">${items}</div>`;
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
            <span class="travel-date">${date ? escapeHtml(date) : "-"}</span>
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

    const column = (title: string, items: StyledLine[]) =>
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

    // The agency never names itself on the signature line - it always reads
    // "Authorised Signature", branded or not.
    return `
    <div class="sign-row">
        ${line("Guest Signature")}
        ${line("Authorised Signature")}
    </div>`;
}

/** Repeated at the foot of every page. */
function sheetFooter(view: QuotationPdfView): string {
    // The software house's name links to its site; its number to a phone dialer.
    const site = /^https?:\/\//i.test(POWERED_BY.url) ? POWERED_BY.url : `https://${POWERED_BY.url}`;
    const tel = POWERED_BY.contact.replace(/[^\d+]/g, "");
    return `
        <div class="sheet-footer">
            <span>Powered by <a href="${site}"><strong>${POWERED_BY.name}</strong></a> &nbsp;·&nbsp; ${POWERED_BY.url} &nbsp;·&nbsp; <a href="tel:${tel}">${POWERED_BY.contact}</a></span>
            <span>${view.generatedBy
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
    <title>${escapeHtml(view.branding ? `${view.company.name} - ` : "")}Quotation ${escapeHtml(view.quotationId)}</title>
    <style>
${FONT_FACE_CSS}
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
        /* Clickable but visually unchanged - the footer stays quiet. */
        .sheet-footer a { color: inherit; text-decoration: none; }

        /* --------------------------------------------------------- header */
        .header-wrap { position: relative; }
        .header-table { width: 100%; margin-bottom: 10px; border-bottom: 3px solid #9f0b1f; padding-bottom: 8px; }
        .header-table td { vertical-align: middle; }
        .logo-cell { width: 140px; text-align: left; padding-right: 15px; }
        .logo-cell img { max-width: 130px; max-height: 110px; width: auto; height: auto; display: block; object-fit: contain; object-position: left center; }
        .company-info { text-align: center; padding-right: 140px; }

        /* Social links, pinned to the top-right corner - one per line, the icon
           in its own platform colour beside the readable link. */
        .social { position: absolute; top: 0; right: 0; display: flex; flex-direction: column; gap: 16px; align-items: flex-start;}
        .social a { display: inline-flex; align-items: center; gap: 6px; text-decoration: none; color: #374151; font-size: 8pt; }
        .social svg { width: 14px; height: 14px; flex-shrink: 0; display: block; }
        .social .url { white-space: nowrap; }
        /* Nexa ships one weight (700), so an extra-heavy look comes from a
           text-stroke that thickens each glyph, tinted to match its own colour. */
        /* Every header line shares the same gap above it, so the spacing between
           the name, sub-line, tagline and address reads evenly. */
        .company-info > * { margin: 6px 0 0; }
        .company-info > *:first-child { margin-top: 0; }
        .company-info h1 {
            font-size: 24pt; font-weight: 700; letter-spacing: 1px; line-height: 1;
            font-family: 'Nexa', 'Helvetica Neue', Arial, sans-serif;
        }
        .company-info h1 .red { color: #9f0b1f; -webkit-text-stroke: 3px #9f0b1f; }
        .company-info h1 .dark { color: #111827; -webkit-text-stroke: 3px #111827; }
        .company-info .sub-brand {
            color: #111827; font-size: 13pt; font-weight: 700; letter-spacing: 3px;
            font-family: 'Nexa', 'Helvetica Neue', Arial, sans-serif;
            -webkit-text-stroke: 1.8px #111827;
        }
        .company-info h2 {
            color: #111827; font-size: 12pt; font-weight: 700; letter-spacing: 1px;
            font-family: 'Nexa', 'Helvetica Neue', Arial, sans-serif;
            -webkit-text-stroke: 1.4px #111827;
        }
        .company-info p { color: #4b5563; font-size: 9pt; }

        /* A slim strip so a loose second page is still identifiable. */
        .page-strip {
            display: flex; justify-content: space-between; align-items: baseline;
            border-bottom: 2px solid #9f0b1f; padding-bottom: 5px; margin-bottom: 12px;
            font-size: 9pt; color: #4b5563;
        }
        .page-strip strong { color: #9f0b1f; font-size: 11pt; letter-spacing: 0.5px; }

        .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
        .meta-table td { padding: 9px 12px; border: 1px solid #d1d5db; font-size: 10pt; }
        /* The label never wraps ("Quotation ID:" must stay on one line whatever
           the auto-fit zoom); the cell takes whatever width the text needs. */
        .meta-table .label { background-color: #f3f4f6; font-weight: bold; white-space: nowrap; width: 1%; }

        .section-title { color: #9f0b1f; font-size: 13pt; border-bottom: 2px solid #9f0b1f; padding-bottom: 4px; margin-top: 4px; margin-bottom: 8px; text-transform: uppercase; font-weight: bold; }

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
            border: 1px solid #d1d5db; border-left: 4px solid #9f0b1f; border-radius: 4px;
            background-color: #f9fafb; padding: 9px 14px;
        }
        .travel-eyebrow { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.6px; color: #6b7280; font-weight: bold; }
        .travel-date { font-size: 13pt; font-weight: bold; color: #111827; line-height: 1.3; }
        .travel-sector { font-size: 9pt; color: #4b5563; }
        .travel-note { margin: 0 0 10px 0; font-size: 8.5pt; color: #4b5563; }

        /* ------------------------------------------------------ itinerary */
        .data-table { width: 100%; border-collapse: collapse; }
        .data-table th, .data-table td { padding: 9px 12px; text-align: left; border: 1px solid #9ca3af; font-size: 10pt; white-space: nowrap; }
        .data-table th { background-color: #9f0b1f; color: #ffffff; font-weight: bold; }
        .data-table .row-highlight { background-color: #f9fafb; }
        /* Phase, dates and meal stay on one line; only the accommodation column
           (3) wraps, absorbing the width the other three keep. */
        .data-table td:nth-child(3), .data-table th:nth-child(3) { white-space: normal; }

        .total-section { text-align: right; padding: 12px 15px; background-color: #fef2f2; border-left: 5px solid #9f0b1f; border-right: 1px solid #fca5a5; border-top: 1px solid #fca5a5; border-bottom: 1px solid #fca5a5; }
        .total-section h2 { margin: 0; color: #9f0b1f; font-size: 18pt; }
        .total-section p { margin: 3px 0 0 0; color: #111827; font-weight: bold; font-size: 11pt; }

        /* A package's two or three prices for one itinerary, side by side. */
        .tier-caption { margin: 0 0 7px; text-align: center; color: #111827; font-weight: bold; font-size: 11pt; letter-spacing: 0.3px; }
        .tier-band { display: flex; gap: 10px; }
        .tier-card { flex: 1 1 0; text-align: center; padding: 12px 10px; background-color: #fef2f2; border: 1px solid #fca5a5; border-top: 4px solid #9f0b1f; }
        .tier-label { display: block; color: #111827; font-weight: bold; font-size: 10.5pt; letter-spacing: 1px; text-transform: uppercase; }
        .tier-price { display: block; margin-top: 5px; color: #9f0b1f; font-weight: bold; font-size: 14pt; }

        /* Per-room-type surcharges, a red band under the itinerary. */
        .addons-band { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 28px; margin-top: 10px; padding: 9px 14px; background-color: #9f0b1f; color: #ffffff; border-radius: 3px; text-align: center; }
        .addon-item { font-size: 9.5pt; letter-spacing: 0.2px; }
        .addon-item strong { font-weight: bold; }
        .addon-price { font-size: 12pt; margin-left: 2px; }

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

        .warning-text { color: #9f0b1f; font-weight: bold; font-size: 8.5pt; margin-top: 10px; display: block; }
    </style>
</head>
<body>

<!-- ===================================================== page 1 ========= -->
<div class="sheet">
    <div class="sheet-body">
        ${view.branding ? `<div class="header-wrap">
        ${socialIcons(view.company)}
        <table class="header-table">
            <tr>
                <td class="logo-cell"><img src="${view.logoDataUri}" alt="${escapeHtml(view.company.name)} Logo" /></td>
                <td class="company-info">
                    <h1>${brandName(view.company.name)}</h1>
                    ${view.company.subheading ? `<div class="sub-brand">${escapeHtml(view.company.subheading)}</div>` : ""}
                    ${view.company.tagline ? `<h2>${escapeHtml(view.company.tagline)}</h2>` : ""}
                    <p>${escapeHtml(view.company.address)}</p>
                    <p>${escapeHtml(view.company.contact)}</p>
                </td>
            </tr>
        </table>
        </div>` : ""}

        <table class="meta-table">
            ${view.hbNumber
            ? `<tr>
                <td class="label">HB Number:</td>
                <td><strong style="color:#9f0b1f; letter-spacing:0.3px">${escapeHtml(view.hbNumber)}</strong></td>
                <td class="label">Status:</td>
                <td><strong>Confirmed</strong></td>
            </tr>`
            : ""
        }
            ${view.quotationId
            ? `<tr>
                <td class="label">Quotation ID:</td>
                <td>${escapeHtml(view.quotationId)}</td>
                <td class="label">Date:</td>
                <td>${escapeHtml(view.date)}</td>
            </tr>`
            : ""
        }
            ${view.guestName
            ? `<tr>
                <td class="label">Guest Name:</td>
                <td><strong>${escapeHtml(view.guestName)}</strong></td>
                <td class="label">Valid Until:</td>
                <td>${escapeHtml(view.validUntil)}</td>
            </tr>`
            : ""
        }
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
${addOnsBand(view)}
        <div class="spacer"></div>
${priceSection(view)}
    </div>
${sheetFooter(view)}
</div>

<!-- ===================================================== page 2 ========= -->
<div class="sheet">
    <div class="sheet-body">
        <div class="page-strip">
            ${view.branding ? `<strong>${escapeHtml(view.company.name)}</strong>` : "<span></span>"}
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
            view.qurbaniIncluded ? [...view.includes, { text: "Qurbani." }] : view.includes,
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
