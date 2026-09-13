const FIDE_TO_ALPHA2: Record<string, string> = {
  AFG: 'AF', ALB: 'AL', ALG: 'DZ', AND: 'AD', ANG: 'AO', ARG: 'AR', ARM: 'AM', ARU: 'AW', AUS: 'AU', AUT: 'AT', AZE: 'AZ',
  BAH: 'BS', BAN: 'BD', BAR: 'BB', BDI: 'BI', BEL: 'BE', BEN: 'BJ', BHU: 'BT', BIH: 'BA', BLR: 'BY', BOL: 'BO', BOT: 'BW', BRA: 'BR', BRN: 'BH', BRU: 'BN', BUL: 'BG', BUR: 'BF',
  CAF: 'CF', CAM: 'KH', CAN: 'CA', CAY: 'KY', CHI: 'CL', CHN: 'CN', CIV: 'CI', CMR: 'CM', COL: 'CO', CPV: 'CV', CRC: 'CR', CRO: 'HR', CUB: 'CU', CUR: 'CW', CYP: 'CY', CZE: 'CZ',
  DEN: 'DK', DJI: 'DJ', DOM: 'DO', ECU: 'EC', EGY: 'EG', ENG: 'GB', ESA: 'SV', ESP: 'ES', EST: 'EE', ETH: 'ET', FAI: 'FO', FIJ: 'FJ', FIN: 'FI', FRA: 'FR',
  GAB: 'GA', GAM: 'GM', GCI: 'GG', GEO: 'GE', GEQ: 'GQ', GER: 'DE', GHA: 'GH', GRE: 'GR', GUA: 'GT', GUI: 'GN', GUM: 'GU', GUY: 'GY', HAI: 'HT', HKG: 'HK', HON: 'HN', HUN: 'HU',
  INA: 'ID', IND: 'IN', IOM: 'IM', IRI: 'IR', IRL: 'IE', IRQ: 'IQ', ISL: 'IS', ISR: 'IL', ISV: 'VI', ITA: 'IT', IVB: 'VG', JAM: 'JM', JCI: 'JE', JOR: 'JO', JPN: 'JP',
  KAZ: 'KZ', KEN: 'KE', KGZ: 'KG', KIR: 'KI', KOR: 'KR', KOS: 'XK', KSA: 'SA', KUW: 'KW', LAO: 'LA', LAT: 'LV', LBA: 'LY', LBN: 'LB', LBR: 'LR', LCA: 'LC', LES: 'LS', LIE: 'LI', LTU: 'LT', LUX: 'LU',
  MAC: 'MO', MAD: 'MG', MAR: 'MA', MAS: 'MY', MAW: 'MW', MDA: 'MD', MDV: 'MV', MEX: 'MX', MGL: 'MN', MHL: 'MH', MKD: 'MK', MLI: 'ML', MLT: 'MT', MNC: 'MC', MNE: 'ME', MOZ: 'MZ', MRI: 'MU', MTN: 'MR', MYA: 'MM',
  NAM: 'NA', NCA: 'NI', NCL: 'NC', NED: 'NL', NEP: 'NP', NGR: 'NG', NIG: 'NE', NIR: 'GB', NOR: 'NO', NRU: 'NR', NZL: 'NZ', OMA: 'OM',
  PAK: 'PK', PAN: 'PA', PAR: 'PY', PER: 'PE', PHI: 'PH', PLE: 'PS', PLW: 'PW', PNG: 'PG', POL: 'PL', POR: 'PT', PUR: 'PR', QAT: 'QA', ROU: 'RO', RSA: 'ZA', RUS: 'RU', RWA: 'RW',
  SCO: 'GB', SEN: 'SN', SEY: 'SC', SGP: 'SG', SLE: 'SL', SLO: 'SI', SMR: 'SM', SOL: 'SB', SOM: 'SO', SRB: 'RS', SRI: 'LK', SSD: 'SS', STP: 'ST', SUD: 'SD', SUI: 'CH', SUR: 'SR', SVK: 'SK', SWE: 'SE', SWZ: 'SZ', SYR: 'SY',
  TAN: 'TZ', THA: 'TH', TJK: 'TJ', TKM: 'TM', TLS: 'TL', TOG: 'TG', TON: 'TO', TPE: 'TW', TTO: 'TT', TUN: 'TN', TUR: 'TR', UAE: 'AE', UGA: 'UG', UKR: 'UA', URU: 'UY', USA: 'US', UZB: 'UZ',
  VAN: 'VU', VEN: 'VE', VIE: 'VN', WLS: 'GB', YEM: 'YE', ZAM: 'ZM', ZIM: 'ZW'
};

const SPECIAL_FEDERATION_MARKS: Record<string, string> = {
  FID: '♟️', FIDE: '♟️', WFCC: '♟️', ONL: '🌐', CAT: '🇪🇸', SCG: '🇷🇸'
};

export function federationFlag(federation?: string): string {
  const code = String(federation || '').trim().toUpperCase();
  if (!code) return '🏳️';
  if (SPECIAL_FEDERATION_MARKS[code]) return SPECIAL_FEDERATION_MARKS[code];

  const alpha2 = code.length === 2 ? code : FIDE_TO_ALPHA2[code];
  if (!alpha2 || !/^[A-Z]{2}$/.test(alpha2)) return '🏳️';

  return String.fromCodePoint(...alpha2.split('').map(letter => 0x1F1E6 + letter.charCodeAt(0) - 65));
}
