export const NAV = [
  { label: "Szenarien", to: "/" },
  { label: "Upload", to: "/upload" },
  { label: "Planung", to: "/schedule" },

  {
    label: "KPIs",
    to: "/kpis/summary",
    children: [
      { label: "Übersicht", to: "/kpis/summary" },
      { label: "Verspätete Vorgänge", to: "/kpis/late-ops" },
      { label: "Log-Assistent", to: "/kpis/log-assistant" },
    ],
  },

  {
    label: "Analyse-Tools",
    to: "/analysis/gantt",
    children: [
      { label: "Plantafel", to: "/analysis/gantt" },
      { label: "Auftragsrouting", to: "/analysis/order-routing" },
      { label: "Maschinenkontext", to: "/analysis/machine-context" },
      { label: "Auslastung", to: "/analysis/utilization" },
      { label: "Leerlaufzeiten", to: "/analysis/idle-time" },
      { label: "Heatmap", to: "/analysis/heatmap" },
    ],
  },

  {
    label: "Berichte",
    to: "/reports/plan",
    children: [
      { label: "Plantabelle", to: "/reports/plan" },
      { label: "Verspätete Vorgänge", to: "/reports/late-ops" },
      { label: "Fehlende RT=10", to: "/reports/missing-rt10" },
      { label: "Ungeplante", to: "/reports/unplaced" },
      { label: "Schichtinjektionen", to: "/reports/shift" },
      { label: "Lieferungen", to: "/reports/delivery" },
    ],
  },
];
