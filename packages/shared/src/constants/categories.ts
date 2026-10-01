// ============================================================
// Default categories seeded for every new family.
// Also used by the OCR categorizer as the keyword dictionary.
// ============================================================

export interface DefaultCategory {
  name: string
  icon: string
  color: string
  sort_order: number
  is_fixed: boolean  // true = non-negotiable commitment; false = discretionary/variable
  keywords: string[] // Finnish (and some English) product name keywords
}

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  {
    name: 'Groceries',
    icon: '🥦',
    color: '#16a34a',
    sort_order: 0,
    is_fixed: false,
    keywords: [
      // Vegetables
      'mansikka', 'strawberry', 'strawberries', 'porkkana', 'purjo', 'omena', 'banaani', 'peruna', 'sipuli',
      'tomaatti', 'kurkku', 'paprika', 'salaatti', 'kaali', 'parsakaali',
      'kesäkurpitsa', 'palsternakka', 'punajuuri', 'lanttu', 'selleri',
      // Fruit
      'hedelmä', 'appelsiini', 'sitruuna', 'viinimarja', 'mustikka', 'vadelma',
      'kirsikka', 'päärynä', 'viikuna', 'mango', 'ananas', 'meloni',
      'chiquita', 'dole',  // banana brands
      // Meat & fish
      'liha', 'jauheliha', 'kana', 'broileri', 'kalkkunafileet', 'possu',
      'nauta', 'lammas', 'kala', 'lohi', 'silakka', 'silli', 'tonnikala',
      'katkarapu', 'makkara', 'leikkeleet', 'kinkkuleikkeleet',
      // Dairy
      'maito', 'kerma', 'juusto', 'jogurtti', 'voi', 'margariini', 'kananmuna',
      'rahka', 'viili', 'piimä', 'smetana',
      // Bread & grains
      'vehnapaahto', 'ruisleipä', 'sämpylä', 'baguette', 'riisi', 'pasta',
      'makaroni', 'spagetti', 'jauhot', 'kaura', 'puuro', 'mysli', 'granola',
      // Other groceries
      'öljy', 'oliiviöljy', 'etikka', 'sokeri', 'suola', 'pippuri', 'mausteet',
      'tomaattipyree', 'ketsuppi', 'sinappi', 'majoneesi', 'soijakastike',
      'säilyke', 'papu', 'linssit', 'herneet', 'tortilla', 'hapankorppu',
    ],
  },
  {
    name: 'Snacks & Treats',
    icon: '🍫',
    color: '#f59e0b',
    sort_order: 1,
    is_fixed: false,
    keywords: [
      // Chocolate & sweets
      'suklaa', 'suklaahippu', 'geisha', 'fazer', 'candy', 'karamelli',
      'lakrits', 'karkit', 'makeinen', 'tikkari', 'lollipop', 'vohveli', 'konvehti',
      // Biscuits & snacks
      'keksi', 'marie', 'cookie', 'cracker', 'sipsit', 'chips', 'popcorn',
      'maissintähkät', 'cashew', 'pähkinä', 'manteli', 'pistaasi',
      // Ice cream
      'jäätelö', 'pingui', 'eskimo', 'magnum',
      // Drinks
      'cola', 'limonadi', 'mehu', 'virvoitusjuoma', 'energiajuoma', 'siideri',
      // Fast food
      'hampurilainen', 'pizza', 'hotdog', 'kebab',
      // Yogurt treats & snacks
      'välipalapatukka', 'patukka', 'mango-appelsiinijog', 'appelsiinijog',
    ],
  },
  {
    name: 'Dining Out',
    icon: '🍽️',
    color: '#f97316',
    sort_order: 2,
    is_fixed: false,
    keywords: [
      'ravintola', 'kahvila', 'lounas', 'ruokailu', 'buffet',
      'take away', 'takeaway', 'nouto', 'mcdonald', 'burger king',
      'subway', 'hesburger', 'pizzeria', 'sushi', 'thairavintola',
    ],
  },
  {
    name: 'Clothing',
    icon: '👕',
    color: '#3b82f6',
    sort_order: 3,
    is_fixed: false,
    keywords: [
      'paita', 'housut', 'jakku', 'takki', 'mekko', 'hame', 'sukka', 'alusvaate',
      'kengät', 'saappaat', 'lenkkarit', 'sandaalit', 'hattu', 'lippalakki',
      'huivi', 'hanskat', 'vyö', 'laukku', 'reppu',
    ],
  },
  {
    name: 'Baby & Kids',
    icon: '🧸',
    color: '#ec4899',
    sort_order: 4,
    is_fixed: false,
    keywords: [
      'vaippa', 'pampers', 'huggies', 'tuttipullo', 'tutti', 'kodin',
      'lastenruoka', 'lelu', 'lelut', 'vauva', 'baby', 'lastenjuoma',
      'lastenpuuro', 'välipala', 'äidinmaito', 'korvike',
    ],
  },
  {
    name: 'Household & Cleaning',
    icon: '🧴',
    color: '#8b5cf6',
    sort_order: 5,
    is_fixed: false,
    keywords: [
      'puhdistussuihke', 'siivous', 'saippua', 'shampoo', 'suihkugeeli',
      'deodorantti', 'hammahtahna', 'hammahharja', 'partavaahto',
      'pyykinpesu', 'astianpesu', 'astianpesutabletti', 'kodinpuhdistus',
      'wc-paperi', 'talouspaperi', 'lautasliina', 'muovipussi', 'roskapussi',
      'huuhteluaine', 'kangaspehmennin', 'keittiöpyyhe', 'siivousliina',
      'apila', 'fairy', 'ariel', 'persil',
    ],
  },
  {
    name: 'Utilities & Bills',
    icon: '⚡',
    color: '#0891b2',
    sort_order: 6,
    is_fixed: true,
    keywords: [
      'sähkö', 'vesi', 'kaukolämpö', 'internet', 'netti', 'puhelin',
      'vakuutus', 'vuokra', 'yhtiövastike', 'tv-lupa',
    ],
  },
  {
    name: 'Transport',
    icon: '🚗',
    color: '#64748b',
    sort_order: 7,
    is_fixed: false,
    keywords: [
      'bensa', 'bensiini', 'diesel', 'polttoaine', 'bussi', 'juna', 'metro',
      'taksi', 'uber', 'pysäköinti', 'autopesua', 'huolto', 'rengas',
    ],
  },
  {
    name: 'Health & Pharmacy',
    icon: '💊',
    color: '#ef4444',
    sort_order: 8,
    is_fixed: false,
    keywords: [
      'lääke', 'tabletti', 'vitamiini', 'd-vitamiini', 'magnesium', 'resepti',
      'apteekki', 'särkylääke', 'nuha', 'flunssa', 'laastari', 'haavateippi',
      'silmätipat', 'nenätipat', 'yskänlääke', 'probiootti',
    ],
  },
  {
    name: 'Housing',
    icon: '🏠',
    color: '#f97316',
    sort_order: 9,
    is_fixed: true,
    keywords: [
      'vuokra', 'asuntolaina', 'taloyhtiö', 'yhtiövastike', 'kiinteistö',
    ],
  },
  {
    name: 'Loans & Credit',
    icon: '💳',
    color: '#6366f1',
    sort_order: 10,
    is_fixed: true,
    keywords: [
      'laina', 'luotto', 'korko', 'velka', 'erä', 'maksu',
    ],
  },
  {
    name: 'Subscriptions',
    icon: '📱',
    color: '#06b6d4',
    sort_order: 11,
    is_fixed: true,
    keywords: [
      'tilaus', 'kuukausimaksu', 'palvelu', 'streaming', 'netflix', 'spotify',
    ],
  },
  {
    name: 'Family Transfers',
    icon: '👨‍👩‍👧',
    color: '#ec4899',
    sort_order: 12,
    is_fixed: false,
    keywords: [],
  },
]

// Flat keyword → category name lookup for the OCR categorizer
export const KEYWORD_TO_CATEGORY: Record<string, string> = Object.fromEntries(
  DEFAULT_CATEGORIES.flatMap((cat) => cat.keywords.map((kw) => [kw.toLowerCase(), cat.name]))
)
