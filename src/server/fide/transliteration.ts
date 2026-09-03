/**
 * Cyrillic to Latin transliteration for FIDE search.
 * Handles Bulgarian, Russian, and Ukrainian Cyrillic names matching official FIDE Latin spellings.
 */

const CYRILLIC_TO_LATIN_MAP: Record<string, string[]> = {
  'а': ['a'],
  'б': ['b'],
  'в': ['v', 'w'],
  'г': ['g'],
  'д': ['d'],
  'е': ['e', 'ye'],
  'ё': ['yo', 'e'],
  'ж': ['zh', 'j'],
  'з': ['z'],
  'и': ['i'],
  'й': ['y', 'j', 'i'],
  'к': ['k', 'c'],
  'л': ['l'],
  'м': ['m'],
  'н': ['n'],
  'о': ['o'],
  'п': ['p'],
  'р': ['r'],
  'с': ['s', 'c'],
  'т': ['t'],
  'у': ['u', 'oo'],
  'ф': ['f', 'ph'],
  'х': ['h', 'kh'],
  'ц': ['ts', 'tz', 'c'],
  'ч': ['ch', 'tch'],
  'ш': ['sh', 'sch'],
  'щ': ['sht', 'shch', 'st'],
  'ъ': ['a', 'u', 'y'],
  'ы': ['y'],
  'ь': ['y', ''],
  'э': ['e'],
  'ю': ['yu', 'u'],
  'я': ['ya', 'ia']
};

export function hasCyrillic(text: string): boolean {
  return /[\u0400-\u04FF]/.test(text);
}

/**
 * Generates Latin phonetic variants for a search token that may contain Cyrillic characters.
 * E.g.:
 *  "топалов" -> ["topalov"]
 *  "карлсен" -> ["karlsen", "carlsen"]
 *  "каспаров" -> ["kasparov", "casparov"]
 *  "чепаринов" -> ["cheparinov"]
 *  "фирузджа" -> ["firouzdja", "firouzja"]
 */
export function generateTransliterationVariants(token: string): string[] {
  const clean = token.trim();
  if (!clean) return [];

  if (!hasCyrillic(clean)) {
    // If already Latin, still generate useful chess transliteration variants (e.g. C <-> K)
    const variants = new Set<string>();
    variants.add(clean);
    
    // Carlsen vs Karlsen, Caruana vs Karuana
    if (clean.toLowerCase().startsWith('c')) {
      variants.add('k' + clean.slice(1));
    } else if (clean.toLowerCase().startsWith('k')) {
      variants.add('c' + clean.slice(1));
    }
    return Array.from(variants);
  }

  const lower = clean.toLowerCase();
  
  // Primary Bulgarian standard transliteration (Law on Transliteration 2009)
  let standard = '';
  for (let i = 0; i < lower.length; i++) {
    const char = lower[i];
    const mappings = CYRILLIC_TO_LATIN_MAP[char];
    if (mappings && mappings.length > 0) {
      standard += mappings[0];
    } else {
      standard += char;
    }
  }

  const variants = new Set<string>();
  variants.add(clean); // keep original
  variants.add(standard);

  // Variant starting with 'c' instead of 'k' (e.g. Карлсен -> Carlsen, Каруана -> Caruana)
  if (standard.startsWith('k')) {
    variants.add('c' + standard.slice(1));
  } else if (standard.startsWith('c')) {
    variants.add('k' + standard.slice(1));
  }

  // Variant for "дж" -> "j" (Фирузджа -> Firouzja)
  if (standard.includes('dzh') || standard.includes('dj')) {
    variants.add(standard.replace(/dzh/g, 'j').replace(/dj/g, 'j'));
  }

  // Special popular chess grandmasters name mappings
  const KNOWN_MAP: Record<string, string> = {
    'карлсен': 'carlsen',
    'каспаров': 'kasparov',
    'каруана': 'caruana',
    'динг': 'ding',
    'лирен': 'liren',
    'непомнящий': 'nepomniachtchi',
    'фирузджа': 'firouzja',
    'гукеш': 'gukesh',
    'праг': 'pragg',
    'прагнананда': 'praggnanandhaa',
    'накамура': 'nakamura',
    'ананд': 'anand',
    'топалов': 'topalov',
    'чепаринов': 'cheparinov',
    'стефанова': 'stefanova',
    'со': 'so',
    'кеймер': 'keymer',
    'аронян': 'aronian',
    'гири': 'giri',
    'дуда': 'duda',
    'раджабов': 'radjabov',
    'мамедяров': 'mamedyarov',
    'крамник': 'kramnik',
    'карпов': 'karpov',
    'костенюк': 'kosteniuk',
    'горячкина': 'goryachkina',
    'салимова': 'salimova',
    'георгиев': 'georgiev',
    'колев': 'kolev',
    'спасов': 'spasov',
    'русев': 'rusev',
    'чаталбашев': 'chatalbashev',
    'радулов': 'radulov',
    'ерменков': 'ermenkov',
    'инкьов': 'inkiov',
    'петков': 'petkov',
    'йотов': 'iotov'
  };

  if (KNOWN_MAP[lower]) {
    variants.add(KNOWN_MAP[lower]);
  }

  return Array.from(variants);
}
