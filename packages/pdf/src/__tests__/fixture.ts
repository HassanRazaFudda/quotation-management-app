import { buildPdfView, type PdfViewInput, type QuotationPdfView } from "../view";

export const sampleInput: PdfViewInput = {
  quotationId: "HQ-1447-0042",
  date: "22 July 2026",
  guestName: "Rashid Shahid * 02 PAX",
  validUntil: "29 July 2026",
  packageTitle: "Hajj 2027/1448 - Maktab A Category - 30 Days Package (Customize)",
  totalPriceFormatted: "PKR 919,000 /-",
  travel: {
    included: true,
    departureDate: "06 May 2026",
    returnDate: "04 June 2026",
    outbound: "Karachi - Jeddah",
    inbound: "Jeddah - Karachi",
    note: "",
  },
  qurbaniIncluded: true,
  generatedBy: "Bilal Ahmed",
  stays: [
    {
      phase: "Madinah Stay", nights: "05 Nights",
      dates: "20 Zilqad - 25 Zilqad", datesSub: "06 May - 11 May 2026",
      accommodation: "Sofitel Madinah Hotel", meal: "Half Board", mealNote: "",
    },
    {
      phase: "Makkah Stay", nights: "05 Nights",
      dates: "25 Zilqad - 01 Zilhaj", datesSub: "11 May - 16 May 2026",
      accommodation: "Swiss Al Maqam / Movenpick Hajar Tower",
      meal: "Half Board", mealNote: "Asian Buffet",
    },
    {
      phase: "Aziziya Stay", nights: "06 Nights",
      dates: "01 Zilhaj - 07 Zilhaj", datesSub: "16 May - 22 May 2026",
      accommodation: "Aziziya Hotel (Sharing)", meal: "3 Time", mealNote: "Pakistani Meal",
    },
    {
      phase: "Hajj Days", nights: "05 Nights",
      dates: "07 Zilhaj - 12 Zilhaj", datesSub: "22 May - 27 May 2026",
      accommodation: "Mina Deluxe (7-8 beds)", meal: "3 Time", mealNote: "Meal by Muallim",
    },
    {
      phase: "Aziziya Stay", nights: "05 Nights",
      dates: "12 Zilhaj - 17 Zilhaj", datesSub: "27 May - 01 June 2026",
      accommodation: "Aziziya Hotel (Sharing)", meal: "3 Time", mealNote: "Pakistani Meal",
    },
    {
      phase: "Madinah Stay", nights: "03 Nights",
      dates: "17 Zilhaj - 20 Zilhaj", datesSub: "01 June - 04 June 2026",
      accommodation: "Maden Madinah Hotel", meal: "Half Board", mealNote: "",
    },
  ],
  includes: [
    "Visa charges & Meals as per itinerary.",
    "Presence of Experienced Staff.",
    "24 hrs Hot/Cold Beverages (Hajj days).",
    "Transportation by Buses.",
  ],
  includesNote: "Note: Qurbani & Return Air Ticket NOT Included.",
  requirements: [
    "Original/scan passport (1 year valid).",
    "NIC copy (front and back).",
    "04 Pictures (blue background).",
    "Polio vaccine (if required).",
    "Nominee valid CNIC & contact.",
    "Blood Group of Applicant.",
  ],
  terms: [
    "Check-in 16:00, Check-out 12:00.",
    "Bookings are non-refundable.",
    "VAT and Municipal Tax included.",
    "Haji pays any extra MOH taxes.",
  ],
  minaServices: [
    "Carpeted and Gypsum-covered Tents.",
    "Mic & Speaker in each tent for religious guidance and Mahafil.",
  ],
  arafatServices: ["Air-cooled tents at Arafat.", "Cold beverages throughout the day."],
  remarks: "Rates are subject to availability at the time of confirmation.",
};

export const sampleView: QuotationPdfView = buildPdfView(sampleInput);
