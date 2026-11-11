/**
 * The Umrah quotation HTML: two A4 pages in charcoal on white, with Junaidi red as the
 * one accent - deliberately unlike the Hajj document, so the two are never
 * confused on a desk.
 *
 *   Page 1  letterhead and document block · guest band · journey strip ·
 *           hotels · flight and transport, then a gap, then the price panel
 *           sitting on the bottom edge.
 *   Page 2  what is included · visa requirements · terms · remarks, then a
 *           gap, then the signature lines on the bottom edge.
 *
 * The page mechanics are the Hajj template's: fixed 210x297mm sheets, zero
 * printer margins, a flex column with a `.spacer` that pins the last block to
 * the bottom, and a scale the renderer walks down until nothing overflows.
 */

import { lineColor, type StyledLine } from "@junaidi/shared";

import { FONT_FACE_CSS } from "./fonts";
import { cleanUrl, escapeHtml, SOCIAL_SVG } from "./template";
import type { UmrahPdfPrice, UmrahPdfStop, UmrahPdfView } from "./umrah-view";
import { POWERED_BY } from "./view";

const PAGE_HEIGHT_MM = 297;
const PAD_TOP_MM = 11;
const PAD_BOTTOM_MM = 14;
const CONTENT_HEIGHT_MM = PAGE_HEIGHT_MM - PAD_TOP_MM - PAD_BOTTOM_MM;

const INK = "#1f2328";
const SLATE = "#57606a";
const HAIRLINE = "#d0d7de";
const PAPER = "#f6f8fa";
const RED = "#9f0b1f";

const e = escapeHtml;

function listItems(items: StyledLine[]): string {
  return items
    .map((item) => {
      const styles = [lineColor(item.color) && `color:${lineColor(item.color)}`, item.bold && "font-weight:700"].filter(
        Boolean,
      );
      const attr = styles.length ? ` style="${styles.join(";")}"` : "";
      return `<li${attr}>${e(item.text)}</li>`;
    })
    .join("");
}

/** The company name with its first word in Junaidi red: "JUNAIDI AIR TRAVEL". */
function brandName(name: string): string {
  const [first, ...rest] = name.trim().split(/\s+/);
  const red = `<span class="brand-red">${e(first ?? "")}</span>`;
  return rest.length ? `${red} ${e(rest.join(" "))}` : red;
}

// ---------------------------------------------------------------- page one

/** The social links on one line under the address, each icon in its own colour. */
function socialLine(view: UmrahPdfView): string {
  const social = view.company.social ?? { facebook: "", instagram: "", youtube: "" };
  const whatsapp = (social.whatsapp ?? "").trim();
  const waDigits = whatsapp.replace(/\D/g, "");
  const rows: Array<[keyof typeof SOCIAL_SVG, string, string]> = [
    ["facebook", social.facebook ?? "", cleanUrl(social.facebook ?? "")],
    ["instagram", social.instagram ?? "", cleanUrl(social.instagram ?? "")],
    ["youtube", social.youtube ?? "", cleanUrl(social.youtube ?? "")],
    ["whatsapp", waDigits ? `https://wa.me/${waDigits}` : "", whatsapp],
  ];
  const links = rows
    .filter(([, href]) => href.trim())
    .map(([name, href, label]) => `<a href="${e(href.trim())}">${SOCIAL_SVG[name]}<span>${e(label)}</span></a>`)
    .join("");
  return links ? `<div class="lh-social">${links}</div>` : "";
}

function docBlock(view: UmrahPdfView): string {
  const row = (label: string, value: string, strong = false) =>
    value ? `<div class="doc-row"><dt>${label}</dt><dd${strong ? ' class="strong"' : ""}>${e(value)}</dd></div>` : "";
  return `
        <div class="doc">
            <div class="doc-title">Umrah Quotation</div>
            <dl>
                ${row("Booking No.", view.bookingRef, true)}
                ${row("Quotation No.", view.quotationId)}
                ${row("Date", view.date)}
                ${row("Valid until", view.validUntil)}
            </dl>
        </div>`;
}

function letterhead(view: UmrahPdfView): string {
  if (!view.branding) {
    return `
    <header class="lh lh-plain">${docBlock(view)}
    </header>
    <div class="rule"><span></span></div>`;
  }
  const company = view.company;
  return `
    <header class="lh">
        <div class="lh-brand">
            ${view.logoDataUri ? `<img src="${view.logoDataUri}" alt="${e(company.name)} logo" />` : ""}
            <div class="lh-text">
                <div class="lh-name">${brandName(company.name)}</div>
                ${company.subheading ? `<div class="lh-sub">${e(company.subheading)}</div>` : ""}
                ${company.tagline ? `<div class="lh-tag">${e(company.tagline)}</div>` : ""}
                ${company.address ? `<div class="lh-meta">${e(company.address)}</div>` : ""}
                ${company.contact ? `<div class="lh-meta">${e(company.contact)}</div>` : ""}
                ${socialLine(view)}
            </div>
        </div>${docBlock(view)}
    </header>
    <div class="rule"><span></span></div>`;
}

function guestBand(view: UmrahPdfView): string {
  return `
    <section class="guest">
        <div class="guest-main">
            <div class="label">Prepared for</div>
            <div class="guest-name">${e(view.guestName)}</div>
            ${view.party ? `<div class="guest-party">${e(view.party)}</div>` : ""}
            ${view.packageTitle ? `<div class="guest-package">${e(view.packageTitle)}</div>` : ""}
        </div>
        <div class="guest-nights">
            <div class="nights-figure">${e(view.totalDays)}</div>
            <div class="nights-label">days</div>
            ${view.travelDates ? `<div class="nights-dates">${e(view.travelDates)}</div>` : ""}
        </div>
    </section>`;
}

/** The journey as one line of stops: the flight out, each city, the flight home. */
function journey(view: UmrahPdfView): string {
  const node = (entry: UmrahPdfStop, kind: "air" | "city") => `
            <li class="stop stop-${kind}">
                <span class="dot"></span>
                <span class="stop-title">${e(entry.title)}</span>
                ${entry.detail ? `<span class="stop-detail">${e(entry.detail)}</span>` : ""}
                ${entry.sub ? `<span class="stop-sub">${e(entry.sub)}</span>` : ""}
            </li>`;
  const tag = view.ticketIncluded
    ? '<span class="tag tag-on">Air ticket included</span>'
    : '<span class="tag">Air ticket not included</span>';
  return `
    <section class="block">
        <div class="block-head"><h3>Journey</h3>${tag}</div>
        <ol class="journey">${node(view.departure, "air")}${view.stops.map((entry) => node(entry, "city")).join("")}${node(view.arrival, "air")}
        </ol>
        ${view.travelNote ? `<p class="note">${e(view.travelNote)}</p>` : ""}
    </section>`;
}

function hotels(view: UmrahPdfView): string {
  if (view.hotels.length === 0) return "";
  const rows = view.hotels
    .map((hotel) => {
      const sub = [hotel.rooms, hotel.distance].filter(Boolean).map(e).join(" &nbsp;·&nbsp; ");
      return `
                <tr>
                    <td class="city">${e(hotel.city)}</td>
                    <td><strong>${e(hotel.hotel)}</strong>${sub ? `<div class="cell-sub">${sub}</div>` : ""}</td>
                    <td class="nowrap">${e(hotel.dates)}</td>
                    <td class="num">${e(hotel.nights)}</td>
                    <td>${e(hotel.meal) || '<span class="muted">—</span>'}</td>
                </tr>`;
    })
    .join("");
  return `
    <section class="block">
        <div class="block-head"><h3>Hotels</h3></div>
        <table class="grid">
            <thead><tr><th>City</th><th>Hotel &amp; rooms</th><th>Check-in – check-out</th><th class="num">Nights</th><th>Meal</th></tr></thead>
            <tbody>${rows}
            </tbody>
        </table>
    </section>`;
}

function flightAndTransport(view: UmrahPdfView): string {
  const flight = view.flight;
  const flightRows = flight
    ? [
        ["Airline", flight.airline],
        ["Going", flight.outbound],
        ["Return", flight.inbound || "One way"],
      ]
        .filter(([, value]) => value)
        .map(([label, value]) => `<div class="kv"><dt>${label}</dt><dd>${e(value!)}</dd></div>`)
        .join("")
    : "";
  const flightBlock = flightRows
    ? `<div class="half"><div class="block-head"><h3>Flight</h3></div><dl class="kvs">${flightRows}</dl></div>`
    : "";
  const transportBlock =
    view.transport.length > 0
      ? `<div class="half"><div class="block-head"><h3>Transport</h3></div><ul class="legs">${view.transport
          .map(
            (leg) =>
              `<li><span>${e(leg.route)}</span>${leg.vehicle ? `<span class="muted">${e(leg.vehicle)}</span>` : ""}</li>`,
          )
          .join("")}</ul></div>`
      : "";
  if (!flightBlock && !transportBlock) return "";
  return `
    <section class="block pair">${flightBlock}${transportBlock}
    </section>`;
}

function priceRows(rows: UmrahPdfPrice[]): string {
  return rows
    .map((row) => `<div class="p-row"><span>${e(row.label)}</span><strong>${e(row.price)}</strong></div>`)
    .join("");
}

/** The framed price panel that closes page one; its figures are the only money printed. */
function pricePanel(view: UmrahPdfView): string {
  const prices = view.prices;
  const addOns = view.addOns.length
    ? `<div class="p-addons">${view.addOns
        .map((addOn) => `<div class="p-row"><span>Plus ${e(addOn.label)}</span><strong>${e(addOn.price)}</strong></div>`)
        .join("")}</div>`
    : "";

  let body = "";
  if (prices.kind === "single") {
    body = `
        <div class="p-single">
            <span class="p-caption">${e(prices.caption)}</span>
            <span class="p-figure">${e(prices.price)}</span>
        </div>`;
  } else if (prices.kind === "list") {
    body = `
        <div class="p-caption">${e(prices.caption)}</div>
        <div class="p-list">${priceRows(prices.rows)}</div>`;
  } else {
    const head = prices.columns.map((column) => `<th>${e(column)}</th>`).join("");
    const rows = prices.rows
      .map(
        (row) =>
          `<tr><td>${e(row.label)}</td>${row.cells
            .map((cell) => `<td class="fig">${cell ? e(cell) : '<span class="p-none">—</span>'}</td>`)
            .join("")}</tr>`,
      )
      .join("");
    body = `
        <div class="p-caption">${e(prices.caption)}</div>
        <table class="p-matrix"><thead><tr><th>Room type</th>${head}</tr></thead><tbody>${rows}</tbody></table>
        ${prices.extras.length ? `<div class="p-list p-extras">${priceRows(prices.extras)}</div>` : ""}`;
  }
  return `
    <section class="price">${body}${addOns}
    </section>`;
}

// ---------------------------------------------------------------- page two

function listBlock(title: string, items: StyledLine[], extraClass = ""): string {
  return `
        <div class="info ${extraClass}">
            <h3>${title}</h3>
            ${items.length ? `<ul>${listItems(items)}</ul>` : '<p class="muted">—</p>'}
        </div>`;
}

function remarks(view: UmrahPdfView): string {
  const body = view.remarks ? e(view.remarks).replace(/\n/g, "<br>") : "";
  return `
    <section class="remarks">
        <h3>Remarks</h3>
        <div class="remarks-body">${body}</div>
    </section>`;
}

function signatures(): string {
  // Always "Authorised Signature" - the agency never names itself here.
  return `
    <div class="signs">
        <div class="sign"><div class="sign-line"></div><span>Guest Signature</span></div>
        <div class="sign"><div class="sign-line"></div><span>Authorised Signature</span></div>
    </div>`;
}

function footer(view: UmrahPdfView): string {
  const site = /^https?:\/\//i.test(POWERED_BY.url) ? POWERED_BY.url : `https://${POWERED_BY.url}`;
  const tel = POWERED_BY.contact.replace(/[^\d+]/g, "");
  return `
    <div class="foot">
        <span>Powered by <a href="${site}"><strong>${POWERED_BY.name}</strong></a> &nbsp;·&nbsp; ${POWERED_BY.url} &nbsp;·&nbsp; <a href="tel:${tel}">${POWERED_BY.contact}</a></span>
        <span>${view.generatedBy ? `Generated by: <strong>${e(view.generatedBy)}</strong>` : ""}</span>
    </div>`;
}

// ------------------------------------------------------------------- build

/**
 * @param scale Applied to the page content only; the sheet stays A4 and
 *   `.sheet-body` grows by the same factor so the bottom blocks still reach
 *   the bottom edge.
 */
export function buildUmrahHtml(view: UmrahPdfView, scale = 1): string {
  const zoom = scale !== 1 ? ` zoom: ${scale};` : "";
  const bodyHeight = (CONTENT_HEIGHT_MM / scale).toFixed(3);
  const title = `${view.branding ? `${view.company.name} - ` : ""}Umrah Quotation ${view.quotationId}`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>${e(title)}</title>
<style>
${FONT_FACE_CSS}
    @page { size: A4; margin: 0; }
    html, body { margin: 0; padding: 0; background: #ffffff; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: ${INK}; font-size: 9.5pt; line-height: 1.45; }
    *, *::before, *::after { box-sizing: border-box; }
    h3 { margin: 0; font-size: 10pt; font-weight: 700; color: ${INK}; }
    .muted { color: ${SLATE}; }
    .label { font-size: 8pt; color: ${SLATE}; }

    .sheet { position: relative; width: 210mm; height: ${PAGE_HEIGHT_MM}mm; padding: ${PAD_TOP_MM}mm 14mm ${PAD_BOTTOM_MM}mm; overflow: hidden; page-break-after: always; break-after: page; }
    .sheet:last-of-type { page-break-after: auto; break-after: auto; }
    .sheet-body { height: ${bodyHeight}mm; display: flex; flex-direction: column;${zoom} }
    .sheet-body > * { flex: 0 0 auto; }
    .sheet-body > .spacer { flex: 1 1 auto; min-height: 5mm; }

    .foot { position: absolute; left: 14mm; right: 14mm; bottom: 6mm; display: flex; justify-content: space-between; align-items: baseline; border-top: 1px solid ${HAIRLINE}; padding-top: 3px; font-size: 7pt; color: ${SLATE}; }
    .foot strong { color: ${INK}; }
    .foot a { color: inherit; text-decoration: none; }

    /* ---- letterhead: the brand on the left, the document on the right */
    .lh { display: flex; justify-content: space-between; align-items: flex-start; gap: 10mm; }
    .lh-plain { justify-content: flex-end; }
    .lh-brand { display: flex; gap: 4mm; align-items: flex-start; min-width: 0; }
    .lh-brand img { width: auto; height: auto; max-width: 26mm; max-height: 24mm; object-fit: contain; display: block; }
    .lh-text { min-width: 0; }
    .lh-name { font-family: 'Nexa', 'Helvetica Neue', Arial, sans-serif; font-weight: 700; font-size: 17pt; letter-spacing: 0.6px; line-height: 1.05; color: ${INK}; -webkit-text-stroke: 1.2px ${INK}; }
    .lh-sub { font-family: 'Nexa', 'Helvetica Neue', Arial, sans-serif; font-weight: 700; font-size: 8.5pt; letter-spacing: 2px; color: ${SLATE}; margin-top: 2px; }
    .lh-tag { font-size: 8.5pt; font-weight: 700; color: ${INK}; margin-top: 3px; }
    .lh-meta { font-size: 7.8pt; color: ${SLATE}; margin-top: 2px; }
    .lh-social { display: flex; flex-wrap: wrap; gap: 2px 10px; margin-top: 4px; }
    .lh-social a { display: inline-flex; align-items: center; gap: 4px; font-size: 7.5pt; color: ${SLATE}; text-decoration: none; }
    .lh-social svg { width: 10px; height: 10px; display: block; flex-shrink: 0; }

    .doc { flex-shrink: 0; text-align: right; }
    .doc-title { font-size: 17pt; font-weight: 300; letter-spacing: 0.2px; color: ${INK}; line-height: 1.1; }
    /* two columns: labels right-aligned against values left-aligned, so a short
       value sits right beside its label instead of across a gap */
    .doc dl { margin: 6px 0 0; display: grid; grid-template-columns: auto auto; justify-content: end; column-gap: 8px; font-size: 8.5pt; line-height: 1.55; }
    .doc-row { display: contents; }
    .doc-row dt { color: ${SLATE}; text-align: right; }
    .doc-row dd { margin: 0; color: ${INK}; text-align: left; font-variant-numeric: tabular-nums; }
    .doc-row dd.strong { color: ${RED}; font-weight: 700; }

    /* one line, red for its first stretch and charcoal after: no bar laid over another */
    .rule { height: 2px; margin: 5mm 0 6mm; background: linear-gradient(to right, ${RED} 0, ${RED} 22mm, ${INK} 22mm, ${INK} 100%); }
    .rule span { display: none; }

    /* ---- guest band */
    .guest { display: flex; justify-content: space-between; align-items: stretch; background: ${PAPER}; border-radius: 3px; padding: 5mm 6mm; margin-bottom: 6mm; }
    .guest-name { font-size: 15pt; font-weight: 700; line-height: 1.2; margin-top: 1px; }
    .guest-party { font-size: 9pt; color: ${INK}; margin-top: 3px; }
    .guest-package { font-size: 8.5pt; color: ${SLATE}; margin-top: 2px; }
    .guest-nights { text-align: right; border-left: 1px solid ${HAIRLINE}; padding-left: 6mm; display: flex; flex-direction: column; justify-content: center; flex-shrink: 0; }
    .nights-figure { font-size: 24pt; font-weight: 300; line-height: 1; font-variant-numeric: tabular-nums; }
    .nights-label { font-size: 8pt; color: ${SLATE}; }
    .nights-dates { font-size: 8.5pt; margin-top: 3px; white-space: nowrap; }

    /* ---- blocks */
    .block { margin-bottom: 5.5mm; }
    .block-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding-bottom: 2mm; margin-bottom: 3mm; border-bottom: 1px solid ${HAIRLINE}; }
    .tag { font-size: 7.5pt; font-weight: 700; color: ${SLATE}; border: 1px solid ${HAIRLINE}; border-radius: 10px; padding: 1px 8px; }
    .tag-on { color: ${INK}; border-color: ${INK}; }
    .note { margin: 2.5mm 0 0; font-size: 8pt; color: ${SLATE}; }

    /* ---- journey strip: stops on one line, joined by a charcoal rule */
    .journey { list-style: none; margin: 0; padding: 0; display: flex; }
    .stop { position: relative; flex: 1 1 0; display: flex; flex-direction: column; padding: 0 2mm 0 0; min-width: 0; }
    .stop::before { content: ""; position: absolute; top: 4px; left: 0; right: 0; height: 1px; background: ${INK}; }
    .stop:last-child::before { right: auto; width: 4px; }
    .dot { position: relative; width: 9px; height: 9px; border-radius: 50%; margin-bottom: 2.5mm; }
    .stop-air .dot { background: #ffffff; border: 1.5px solid ${INK}; }
    .stop-city .dot { background: ${RED}; border: 1.5px solid ${RED}; }
    .stop-title { font-weight: 700; font-size: 9.5pt; }
    .stop-detail { font-size: 8.5pt; }
    .stop-sub { font-size: 7.8pt; color: ${SLATE}; }

    /* ---- hotels */
    .grid { width: 100%; border-collapse: collapse; }
    .grid th { text-align: left; font-size: 7.8pt; font-weight: 400; color: ${SLATE}; padding: 0 3mm 1.5mm 0; border-bottom: 1px solid ${HAIRLINE}; }
    .grid td { padding: 2.2mm 3mm 2.2mm 0; border-bottom: 1px solid ${HAIRLINE}; vertical-align: top; font-size: 9pt; }
    .grid tr:last-child td { border-bottom: 0; }
    .grid .city { font-weight: 700; white-space: nowrap; }
    .grid .nowrap { white-space: nowrap; }
    .grid .num { text-align: right; font-variant-numeric: tabular-nums; }
    .cell-sub { font-size: 8pt; color: ${SLATE}; margin-top: 1px; }

    /* ---- flight and transport */
    .pair { display: flex; gap: 8mm; }
    .half { flex: 1 1 0; min-width: 0; }
    .kvs { margin: 0; }
    .kv { display: flex; gap: 4mm; font-size: 9pt; line-height: 1.6; }
    .kv dt { width: 16mm; flex-shrink: 0; color: ${SLATE}; }
    .kv dd { margin: 0; }
    .legs { list-style: none; margin: 0; padding: 0; }
    .legs li { display: flex; justify-content: space-between; gap: 4mm; font-size: 9pt; line-height: 1.6; }

    /* ---- price panel: white, so a black-and-white office printer prints it
       cleanly; a hairline frame, the red top edge and bold figures carry it */
    .price { background: #ffffff; color: ${INK}; border: 1px solid ${HAIRLINE}; border-top: 3px solid ${RED}; border-radius: 0 0 3px 3px; padding: 5mm 6mm; }
    .p-caption { font-size: 8.5pt; color: ${SLATE}; }
    .p-single { display: flex; justify-content: space-between; align-items: baseline; gap: 6mm; }
    .p-figure { font-size: 20pt; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .p-list { margin-top: 2mm; }
    .p-row { display: flex; justify-content: space-between; align-items: baseline; gap: 6mm; padding: 1.8mm 0; border-top: 1px solid ${HAIRLINE}; font-size: 9.5pt; }
    .p-list .p-row:first-child { border-top: 0; }
    .p-row strong { font-size: 12.5pt; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .p-matrix { width: 100%; border-collapse: collapse; margin-top: 2mm; }
    .p-matrix th { text-align: right; font-size: 8pt; font-weight: 400; color: ${SLATE}; padding: 0 0 1.5mm 4mm; }
    .p-matrix th:first-child { text-align: left; padding-left: 0; }
    .p-matrix td { padding: 1.8mm 0 1.8mm 4mm; border-top: 1px solid ${HAIRLINE}; font-size: 9.5pt; }
    .p-matrix td:first-child { padding-left: 0; font-weight: 700; }
    .p-matrix .fig { text-align: right; font-size: 12.5pt; font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .p-none { color: ${SLATE}; font-weight: 400; }
    .p-extras { margin-top: 1mm; border-top: 1px solid ${INK}; }
    .p-extras .p-row:first-child { border-top: 0; }
    .p-addons { margin-top: 2mm; border-top: 1px solid ${INK}; }
    .p-addons .p-row { border-top: 0; color: ${SLATE}; }
    .p-addons .p-row strong { color: ${INK}; }

    /* ---- page two */
    .strip { display: flex; justify-content: space-between; align-items: baseline; font-size: 8.5pt; color: ${SLATE}; }
    .strip strong { color: ${INK}; font-size: 10pt; }
    .brand-red { color: ${RED}; -webkit-text-stroke-color: ${RED}; }
    .info h3 { display: flex; align-items: center; gap: 2.5mm; margin-bottom: 2.5mm; }
    .info h3::before { content: ""; width: 7px; height: 7px; background: ${RED}; }
    .info ul { margin: 0; padding-left: 4.5mm; font-size: 9pt; }
    .info li { margin-bottom: 1.4mm; padding-left: 0.5mm; }
    .info-row { display: flex; gap: 8mm; margin-bottom: 6mm; }
    .info-row .info { flex: 1 1 0; min-width: 0; }
    .info-terms { margin-bottom: 6mm; }
    .info-terms ul { columns: 2; column-gap: 8mm; }
    .info-terms li { break-inside: avoid; }

    .sheet-body > .remarks { flex: 1 1 auto; min-height: 30mm; max-height: 85mm; display: flex; flex-direction: column; }
    .remarks h3 { margin-bottom: 2mm; }
    .remarks-body { flex: 1 1 auto; font-size: 9pt; line-height: 7mm; border: 1px solid ${HAIRLINE}; border-radius: 3px; padding: 0 4mm;
        background-image: repeating-linear-gradient(to bottom, transparent 0, transparent calc(7mm - 1px), #e6e9ed calc(7mm - 1px), #e6e9ed 7mm); }

    .signs { display: flex; gap: 16mm; }
    .sign { flex: 1 1 0; text-align: center; font-size: 8.5pt; color: ${SLATE}; }
    .sign-line { height: 14mm; border-bottom: 1px solid ${INK}; margin-bottom: 1.5mm; }
</style>
</head>
<body>

<div class="sheet">
    <div class="sheet-body">
${letterhead(view)}
${guestBand(view)}
${journey(view)}
${hotels(view)}
${flightAndTransport(view)}
        <div class="spacer"></div>
${pricePanel(view)}
    </div>
${footer(view)}
</div>

<div class="sheet">
    <div class="sheet-body">
        <div class="strip">
            ${view.branding ? `<strong>${brandName(view.company.name)}</strong>` : "<span></span>"}
            <span>Umrah Quotation &nbsp;·&nbsp; ${e(view.quotationId)} &nbsp;·&nbsp; ${e(view.guestName)}</span>
        </div>
        <div class="rule"><span></span></div>
        <div class="info-row">${listBlock("What's included", view.includes)}${listBlock("Visa requirements", view.requirements)}
        </div>
        ${listBlock("Terms &amp; conditions", view.terms, "info-terms")}
${remarks(view)}
        <div class="spacer"></div>
${signatures()}
    </div>
${footer(view)}
</div>

</body>
</html>`;
}
