export const dominicanBanks = [
  "Banreservas",
  "Banco Popular Dominicano",
  "Banco BHD",
  "Scotiabank República Dominicana",
  "Banco Múltiple Santa Cruz",
  "Banco Múltiple Caribe",
  "Banco Múltiple López de Haro",
  "Banco Promerica República Dominicana",
  "Banesco Banco Múltiple",
  "Banco Múltiple Vimenca",
  "Banco Ademi",
  "Banco Adopem",
  "Banco Lafise",
  "JMMB Bank",
  "Qik Banco Digital Dominicano",
  "Citibank República Dominicana",
  "Banco Agrícola de la República Dominicana",
];

export const dominicanAssociations = [
  "Asociación Popular de Ahorros y Préstamos (APAP)",
  "Asociación Cibao de Ahorros y Préstamos",
  "Asociación La Nacional de Ahorros y Préstamos",
  "Asociación La Vega Real de Ahorros y Préstamos (ALAVER)",
  "Asociación Duarte de Ahorros y Préstamos",
  "Asociación Mocana de Ahorros y Préstamos",
  "Asociación Romana de Ahorros y Préstamos",
];

export const popularDominicanCooperatives = [
  "Cooperativa La Altagracia",
  "Cooperativa San José",
  "Cooperativa Vega Real",
  "Cooperativa Mamoncito",
  "Cooperativa Maimón",
  "COOPNAMA",
  "Cooperativa Médica de Santiago (MEDICOOP)",
  "Cooperativa de Servicios Múltiples Herrera (COOPHERRERA)",
];

export const digitalWallets = [
  "tPago",
  "MIO Banreservas",
  "Qik",
  "Otra billetera digital",
];

export function institutionsForType(type) {
  if (type === "bank") return dominicanBanks;
  if (type === "association") return dominicanAssociations;
  if (type === "cooperative") return popularDominicanCooperatives;
  if (type === "wallet") return digitalWallets;
  return [];
}
