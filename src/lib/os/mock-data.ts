/** Mock data for NEXUS OS dashboards — phase A visual prototype. */

export const mockMeta = {
  userName: "Peder",
  dateLabel: "Tirsdag 4. august 2026",
  inboxCount: 6,
};

/* —— Hele livet —— */

export const heleLivet = {
  greeting: "God morgen, Peder",
  subtitle: "Din balanse, fremdrift og overskudd.",
  timeline: [
    { time: "09:00", title: "Strategimøte CORE", kind: "mote" as const },
    { time: "11:00", title: "Fokusarbeid — produktstrategi", kind: "fokus" as const },
    { time: "13:30", title: "Trening", kind: "privat" as const },
    { time: "15:00", title: "Kundeoppfølging Nordic Retail", kind: "business" as const },
    { time: "17:00", title: "Økonomigjennomgang", kind: "business" as const },
  ],
  topThree: [
    "Ferdigstille produktstrategi",
    "Følge opp nøkkelkunder",
    "Treningsøkt — holde energien",
  ],
  focusNow: "Forbered strategiworkshop",
  progressToday: { done: 3, total: 5, pct: 60 },
  energy: [
    { label: "Søvn", value: "7t 15m", pct: 90 },
    { label: "Bevegelse", value: "8 432", pct: 105 },
    { label: "Rutiner", value: "4/5", pct: 80 },
  ],
  businessPulse: [
    { label: "Omsetning", value: "12.4 MNOK", delta: "+18%", good: true },
    { label: "Vekst", value: "28%", delta: "+6 p.p.", good: true },
    { label: "Margin", value: "31%", delta: "+2 p.p.", good: true },
    { label: "Pipeline", value: "24.7 MNOK", delta: "+22%", good: true },
  ],
  orgs: [
    { name: "NEXUS AS", status: "Sterk", growth: "+22%", attention: "ok" as const },
    { name: "Flow Studio AS", status: "Stabil", growth: "+8%", attention: "watch" as const },
    { name: "Bright Holding AS", status: "Stabil", growth: "+4%", attention: "risk" as const },
  ],
  relations: [
    {
      name: "Anders Haugland",
      role: "Styre",
      tag: "Følg opp",
      when: "I dag 14:00",
    },
    {
      name: "Kari Skogland",
      role: "Nøkkelkunde",
      tag: "Følg opp",
      when: "I morgen 10:00",
    },
  ],
  sparkline: [42, 48, 45, 52, 58, 55, 62, 68, 65, 72, 78, 82],
};

/* —— Privat —— */

export const privat = {
  title: "Privat oversikt",
  subtitle: "Din balanse, fremdrift og overskudd.",
  balanceScore: 85,
  balanceLabel: "God balanse",
  balanceAreas: [
    { label: "Energi", status: "ok" as const },
    { label: "Helse", status: "ok" as const },
    { label: "Relasjoner", status: "watch" as const },
    { label: "Hjem", status: "ok" as const },
    { label: "Økonomi", status: "ok" as const },
    { label: "Utvikling", status: "watch" as const },
  ],
  weekEvents: [
    { day: "Ons", title: "Lege — årskontroll", time: "10:30" },
    { day: "Tor", title: "Middag med Sara", time: "19:00" },
    { day: "Fre", title: "Familiehelg", time: "Hele dagen" },
    { day: "Lør", title: "Fjelltur", time: "09:00" },
  ],
  weekPriorities: [
    "Prioritere søvn og restitusjon",
    "Fullføre passfornyelse",
    "Planlegge opplevelser 2026",
  ],
  health: [
    { label: "Søvn", value: "7t 32m", pct: 94 },
    { label: "Bevegelse", value: "8 432 skritt", pct: 105 },
    { label: "Trening", value: "3 økter", pct: 100 },
    { label: "Restitusjon", value: "God", pct: 100 },
  ],
  economy: {
    available: "18 450 kr",
    saved: "6 750 kr",
    buffer: "2.3 mnd",
    trend: "+12%",
    sparkline: [32, 36, 34, 40, 44, 48, 46, 52, 55, 58, 60, 64],
    goal: { name: "Opplevelser 2026", pct: 62 },
  },
  followUps: [
    { initials: "SH", name: "Sara H.", last: "12 dager siden" },
    { initials: "MH", name: "Mor", last: "5 dager siden" },
    { initials: "TK", name: "Thomas K.", last: "3 uker siden" },
  ],
  occasion: { title: "Bursdag — Sara", status: "Gave klar" },
  homeTasks: [
    { title: "Bytte til vinterdekk", due: "15. okt" },
    { title: "Fornye pass", due: "30. aug" },
    { title: "Forsikringsgjennomgang", due: "12. sep" },
    { title: "Service på varmepumpe", due: "1. nov" },
  ],
  goals: [
    { title: "Lese 24 bøker i året", progress: "16/24", pct: 67 },
    { title: "Meditere 10 min daglig", progress: "24/30 dager", pct: 80 },
  ],
};

/* —— Business —— */

export const business = {
  title: "Businessoversikt",
  subtitle: "Alle virksomhetene dine samlet",
  kpis: [
    { label: "Samlet omsetning", value: "48.7 MNOK", goal: "52.0 MNOK", delta: "+16%", pct: 94 },
    { label: "Vekst", value: "16%", goal: "15%", delta: "+1 p.p.", pct: 107 },
    { label: "Driftsmargin", value: "24.2%", goal: "22.0%", delta: "+2.2 p.p.", pct: 110 },
    { label: "Pipeline", value: "96.2 MNOK", goal: "100.0 MNOK", delta: "+14%", pct: 96 },
  ],
  portfolioSeries: {
    revenue: [38, 40, 41, 43, 44, 45, 46, 47, 48, 49, 50, 51],
    result: [8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14],
    forecastFrom: 9,
  },
  orgs: [
    {
      name: "NEXUS AS",
      revenue: "28.4 MNOK",
      growth: "+22%",
      margin: "31%",
      status: "Sterk" as const,
    },
    {
      name: "Flow Studio AS",
      revenue: "12.1 MNOK",
      growth: "+8%",
      margin: "18%",
      status: "Stabil" as const,
    },
    {
      name: "Bright Holding AS",
      revenue: "8.2 MNOK",
      growth: "+4%",
      margin: "14%",
      status: "Stabil" as const,
    },
  ],
  opportunities: [
    { title: "Ny Enterprise-modul", value: "12 MNOK", effort: "Høy" },
    { title: "Partnerskap Norden", value: "6 MNOK", effort: "Middels" },
    { title: "Oppsalg eksisterende", value: "3.5 MNOK", effort: "Lav" },
  ],
  decisions: [
    { title: "Godkjenne utvidet budsjett", due: "2 dager", urgent: true },
    { title: "Vurdere investering Flow", due: "5 dager", urgent: false },
  ],
  risks: [
    { title: "Marginpress i Flow Studio", level: "risk" as const },
    { title: "Nøkkelkunde-avhengighet CORE", level: "watch" as const },
    { title: "Sterk likviditet i porteføljen", level: "ok" as const },
  ],
  capital: [
    { name: "NEXUS AS", pct: 52 },
    { name: "Flow Studio", pct: 28 },
    { name: "Bright Holding", pct: 20 },
  ],
  weekFocus: [
    { title: "Ferdigstille prisstrategi", done: false },
    { title: "Evaluere oppkjøpskandidat", done: false },
    { title: "Kvittere Q3-prognose", done: true },
  ],
};

/* —— CORE —— */

export const core = {
  title: "CORE Operativt kontrollsenter",
  subtitle: "Fra mål til gjennomføring",
  kpis: [
    { label: "Omsetning", value: "12.6 MNOK", goal: "14.0 MNOK", pct: 90, delta: "+18%" },
    { label: "Vekst", value: "18%", goal: "20%", pct: 90, delta: "+6 p.p." },
    { label: "Margin", value: "31%", goal: "30%", pct: 103, delta: "+2 p.p." },
    { label: "Pipeline", value: "24.7 MNOK", goal: "24.0 MNOK", pct: 103, delta: "+22%" },
  ],
  growthSeries: {
    actual: [8.2, 8.8, 9.1, 9.6, 10.0, 10.4, 10.9, 11.3, 11.7, 12.0, 12.3, 12.6],
    forecast: [8.2, 8.8, 9.1, 9.6, 10.0, 10.5, 11.1, 11.8, 12.6, 13.5, 14.8, 16.2],
    goal: [8.5, 9.0, 9.5, 10.0, 10.5, 11.0, 11.5, 12.0, 12.5, 13.0, 13.5, 14.0],
  },
  ytd: { actual: "12.6 MNOK", forecast: "16.2 MNOK", gap: "+2.2 MNOK" },
  pipeline: [
    { stage: "Ny", value: "4.2 MNOK", conversion: "—" },
    { stage: "Kvalifisert", value: "6.8 MNOK", conversion: "72%" },
    { stage: "Tilbud", value: "5.4 MNOK", conversion: "58%" },
    { stage: "Forhandling", value: "5.1 MNOK", conversion: "48%" },
    { stage: "Vunnet", value: "3.2 MNOK", conversion: "54%" },
  ],
  pipelineTotal: { value: "24.7 MNOK", conversion: "54%" },
  initiatives: [
    {
      title: "Ny produktlansering",
      owner: "PH",
      value: "4.5 MNOK",
      pct: 72,
      next: "12. aug",
    },
    {
      title: "Partnerskapsprogram",
      owner: "AK",
      value: "2.8 MNOK",
      pct: 45,
      next: "20. aug",
    },
    {
      title: "Enterprise-pilot",
      owner: "ML",
      value: "6.0 MNOK",
      pct: 30,
      next: "1. sep",
    },
  ],
  delivery: {
    total: 12,
    onTrack: 8,
    risk: 3,
    delayed: 1,
    capacity: 82,
    capacityGoal: 85,
    alert: "Design-teamet er overbelastet i august",
  },
  customers: [
    {
      name: "Nordic Retail AS",
      value: "1.8 MNOK",
      next: "Send revidert tilbud",
      owner: "PH",
    },
    {
      name: "Fjell & Hav AS",
      value: "920 kNOK",
      next: "Demo neste uke",
      owner: "AK",
    },
    {
      name: "Oslo Hub",
      value: "2.4 MNOK",
      next: "Avklar scope",
      owner: "ML",
    },
  ],
  decisions: [
    { title: "Godkjenne prisstrategi Q4", owner: "PH", due: "2 dager", urgent: true },
    { title: "Ansette senior designer", owner: "AK", due: "1 uke", urgent: false },
  ],
  teamPulse: [
    { label: "Kapasitet", value: "82%", status: "God" },
    { label: "Fokus", value: "Høy", status: "God" },
    { label: "Blokkere", value: "1", status: "Følg opp" },
  ],
  nextSteps:
    "Lukk høyverdige muligheter, få produktlanseringen i mål, og frigjør kapasitet i design-teamet.",
};
