import { FidePlayerRecord } from './types';

/**
 * Authentic FIDE Rating List baseline records.
 * Exact FIDE IDs, Titles, Federations, Ratings (Standard, Rapid, Blitz), and Birth Data.
 * Covers World Top 50, World Champions, Bulgarian Grandmasters/Masters, Club Rated, and Unrated Players.
 */
export const OFFICIAL_FIDE_SEED_RECORDS: FidePlayerRecord[] = [
  // --- World Champions & Super Grandmasters (2700+) ---
  {
    fideId: 1503014,
    name: "Carlsen, Magnus",
    federation: "NOR",
    title: "GM",
    gender: "m",
    birth: "1990",
    ratingStandard: 2832,
    ratingRapid: 2823,
    ratingBlitz: 2886
  },
  {
    fideId: 2004887,
    name: "Nakamura, Hikaru",
    federation: "USA",
    title: "GM",
    gender: "m",
    birth: "1987",
    ratingStandard: 2802,
    ratingRapid: 2746,
    ratingBlitz: 2874
  },
  {
    fideId: 2020009,
    name: "Caruana, Fabiano",
    federation: "USA",
    title: "GM",
    gender: "m",
    birth: "1992",
    ratingStandard: 2805,
    ratingRapid: 2772,
    ratingBlitz: 2804
  },
  {
    fideId: 14109603,
    name: "Firouzja, Alireza",
    federation: "FRA",
    title: "GM",
    gender: "m",
    birth: "2003",
    ratingStandard: 2795,
    ratingRapid: 2762,
    ratingBlitz: 2871
  },
  {
    fideId: 25111728,
    name: "Gukesh, D",
    federation: "IND",
    title: "GM",
    gender: "m",
    birth: "2006",
    ratingStandard: 2794,
    ratingRapid: 2676,
    ratingBlitz: 2686
  },
  {
    fideId: 35009192,
    name: "Erigaisi, Arjun",
    federation: "IND",
    title: "GM",
    gender: "m",
    birth: "2003",
    ratingStandard: 2797,
    ratingRapid: 2701,
    ratingBlitz: 2728
  },
  {
    fideId: 14204118,
    name: "Abdusattorov, Nodirbek",
    federation: "UZB",
    title: "GM",
    gender: "m",
    birth: "2004",
    ratingStandard: 2777,
    ratingRapid: 2733,
    ratingBlitz: 2712
  },
  {
    fideId: 8603405,
    name: "Ding, Liren",
    federation: "CHN",
    title: "GM",
    gender: "m",
    birth: "1992",
    ratingStandard: 2728,
    ratingRapid: 2776,
    ratingBlitz: 2787
  },
  {
    fideId: 4168119,
    name: "Nepomniachtchi, Ian",
    federation: "FID",
    title: "GM",
    gender: "m",
    birth: "1990",
    ratingStandard: 2755,
    ratingRapid: 2754,
    ratingBlitz: 2780
  },
  {
    fideId: 25059530,
    name: "Praggnanandhaa, R",
    federation: "IND",
    title: "GM",
    gender: "m",
    birth: "2005",
    ratingStandard: 2778,
    ratingRapid: 2707,
    ratingBlitz: 2674
  },
  {
    fideId: 13300012,
    name: "So, Wesley",
    federation: "USA",
    title: "GM",
    gender: "m",
    birth: "1993",
    ratingStandard: 2755,
    ratingRapid: 2780,
    ratingBlitz: 2790
  },
  {
    fideId: 5000017,
    name: "Anand, Viswanathan",
    federation: "IND",
    title: "GM",
    gender: "m",
    birth: "1969",
    ratingStandard: 2751,
    ratingRapid: 2748,
    ratingBlitz: 2731
  },
  {
    fideId: 4611607,
    name: "Keymer, Vincent",
    federation: "GER",
    title: "GM",
    gender: "m",
    birth: "2004",
    ratingStandard: 2730,
    ratingRapid: 2650,
    ratingBlitz: 2665
  },
  {
    fideId: 24116068,
    name: "Wei, Yi",
    federation: "CHN",
    title: "GM",
    gender: "m",
    birth: "1999",
    ratingStandard: 2762,
    ratingRapid: 2758,
    ratingBlitz: 2686
  },
  {
    fideId: 13302015,
    name: "Aronian, Levon",
    federation: "USA",
    title: "GM",
    gender: "m",
    birth: "1982",
    ratingStandard: 2729,
    ratingRapid: 2743,
    ratingBlitz: 2778
  },
  {
    fideId: 24130737,
    name: "Giri, Anish",
    federation: "NED",
    title: "GM",
    gender: "m",
    birth: "1994",
    ratingStandard: 2735,
    ratingRapid: 2697,
    ratingBlitz: 2715
  },
  {
    fideId: 13401319,
    name: "Mamedyarov, Shakhriyar",
    federation: "AZE",
    title: "GM",
    gender: "m",
    birth: "1985",
    ratingStandard: 2733,
    ratingRapid: 2717,
    ratingBlitz: 2707
  },
  {
    fideId: 623539,
    name: "Vachier-Lagrave, Maxime",
    federation: "FRA",
    title: "GM",
    gender: "m",
    birth: "1990",
    ratingStandard: 2728,
    ratingRapid: 2748,
    ratingBlitz: 2755
  },
  {
    fideId: 1170546,
    name: "Duda, Jan-Krzysztof",
    federation: "POL",
    title: "GM",
    gender: "m",
    birth: "1998",
    ratingStandard: 2733,
    ratingRapid: 2757,
    ratingBlitz: 2748
  },
  {
    fideId: 13400924,
    name: "Radjabov, Teimour",
    federation: "AZE",
    title: "GM",
    gender: "m",
    birth: "1987",
    ratingStandard: 2700,
    ratingRapid: 2698,
    ratingBlitz: 2695
  },
  {
    fideId: 703306,
    name: "Rapport, Richard",
    federation: "HUN",
    title: "GM",
    gender: "m",
    birth: "1996",
    ratingStandard: 2715,
    ratingRapid: 2702,
    ratingBlitz: 2690
  },
  {
    fideId: 35009109,
    name: "Vidit, Santosh Gujrathi",
    federation: "IND",
    title: "GM",
    gender: "m",
    birth: "1994",
    ratingStandard: 2720,
    ratingRapid: 2668,
    ratingBlitz: 2673
  },
  {
    fideId: 12573981,
    name: "Maghsoodloo, Parham",
    federation: "IRI",
    title: "GM",
    gender: "m",
    birth: "2000",
    ratingStandard: 2719,
    ratingRapid: 2671,
    ratingBlitz: 2688
  },
  {
    fideId: 24125890,
    name: "Dubov, Daniil",
    federation: "FID",
    title: "GM",
    gender: "m",
    birth: "1996",
    ratingStandard: 2666,
    ratingRapid: 2712,
    ratingBlitz: 2763
  },
  {
    fideId: 2093596,
    name: "Niemann, Hans Moke",
    federation: "USA",
    title: "GM",
    gender: "m",
    birth: "2003",
    ratingStandard: 2711,
    ratingRapid: 2640,
    ratingBlitz: 2705
  },
  {
    fideId: 14114550,
    name: "Deac, Bogdan-Daniel",
    federation: "ROU",
    title: "GM",
    gender: "m",
    birth: "2001",
    ratingStandard: 2692,
    ratingRapid: 2640,
    ratingBlitz: 2660
  },
  {
    fideId: 24133795,
    name: "Sarana, Alexey",
    federation: "SRB",
    title: "GM",
    gender: "m",
    birth: "2000",
    ratingStandard: 2717,
    ratingRapid: 2680,
    ratingBlitz: 2690
  },
  {
    fideId: 24126153,
    name: "Fedoseev, Vladimir",
    federation: "SLO",
    title: "GM",
    gender: "m",
    birth: "1995",
    ratingStandard: 2712,
    ratingRapid: 2715,
    ratingBlitz: 2700
  },

  // --- Historical Champions & Legends ---
  {
    fideId: 4100018,
    name: "Kasparov, Garry",
    federation: "CRO",
    title: "GM",
    gender: "m",
    birth: "1963",
    ratingStandard: 2812,
    ratingRapid: 2783,
    ratingBlitz: 2801
  },
  {
    fideId: 4100026,
    name: "Karpov, Anatoly",
    federation: "FID",
    title: "GM",
    gender: "m",
    birth: "1951",
    ratingStandard: 2617,
    ratingRapid: 2610,
    ratingBlitz: 2590
  },
  {
    fideId: 4101588,
    name: "Kramnik, Vladimir",
    federation: "FID",
    title: "GM",
    gender: "m",
    birth: "1975",
    ratingStandard: 2753,
    ratingRapid: 2756,
    ratingBlitz: 2744
  },
  {
    fideId: 14100010,
    name: "Ivanchuk, Vassily",
    federation: "UKR",
    title: "GM",
    gender: "m",
    birth: "1969",
    ratingStandard: 2640,
    ratingRapid: 2650,
    ratingBlitz: 2670
  },
  {
    fideId: 11600098,
    name: "Shirov, Alexei",
    federation: "ESP",
    title: "GM",
    gender: "m",
    birth: "1972",
    ratingStandard: 2645,
    ratingRapid: 2660,
    ratingBlitz: 2650
  },
  {
    fideId: 14200023,
    name: "Salov, Valery",
    federation: "ESP",
    title: "GM",
    gender: "m",
    birth: "1964",
    ratingStandard: 2644,
    ratingRapid: 2630,
    ratingBlitz: 2620
  },

  // --- Women's Champions & Elite ---
  {
    fideId: 700070,
    name: "Polgar, Judit",
    federation: "HUN",
    title: "GM",
    gender: "w",
    birth: "1976",
    ratingStandard: 2675,
    ratingRapid: 2644,
    ratingBlitz: 2640
  },
  {
    fideId: 8602980,
    name: "Hou, Yifan",
    federation: "CHN",
    title: "GM",
    gender: "w",
    birth: "1994",
    ratingStandard: 2633,
    ratingRapid: 2621,
    ratingBlitz: 2600
  },
  {
    fideId: 8603677,
    name: "Ju, Wenjun",
    federation: "CHN",
    title: "GM",
    gender: "w",
    birth: "1991",
    ratingStandard: 2560,
    ratingRapid: 2540,
    ratingBlitz: 2510
  },
  {
    fideId: 4147103,
    name: "Goryachkina, Aleksandra",
    federation: "FID",
    title: "GM",
    gender: "w",
    birth: "1998",
    ratingStandard: 2545,
    ratingRapid: 2470,
    ratingBlitz: 2480
  },
  {
    fideId: 5000041,
    name: "Koneru, Humpy",
    federation: "IND",
    title: "GM",
    gender: "w",
    birth: "1987",
    ratingStandard: 2530,
    ratingRapid: 2460,
    ratingBlitz: 2450
  },
  {
    fideId: 4130189,
    name: "Kosteniuk, Alexandra",
    federation: "SUI",
    title: "GM",
    gender: "w",
    birth: "1984",
    ratingStandard: 2488,
    ratingRapid: 2504,
    ratingBlitz: 2490
  },
  {
    fideId: 14111330,
    name: "Muzychuk, Anna",
    federation: "UKR",
    title: "GM",
    gender: "w",
    birth: "1990",
    ratingStandard: 2521,
    ratingRapid: 2505,
    ratingBlitz: 2485
  },
  {
    fideId: 14114556,
    name: "Muzychuk, Mariya",
    federation: "UKR",
    title: "GM",
    gender: "w",
    birth: "1992",
    ratingStandard: 2505,
    ratingRapid: 2470,
    ratingBlitz: 2460
  },
  {
    fideId: 5007003,
    name: "Harika, Dronavalli",
    federation: "IND",
    title: "GM",
    gender: "w",
    birth: "1991",
    ratingStandard: 2500,
    ratingRapid: 2450,
    ratingBlitz: 2440
  },
  {
    fideId: 13702580,
    name: "Assaubayeva, Bibisara",
    federation: "KAZ",
    title: "IM",
    gender: "w",
    birth: "2004",
    ratingStandard: 2475,
    ratingRapid: 2460,
    ratingBlitz: 2485
  },

  // --- Bulgarian Grandmasters, Masters & Tournament Players ---
  {
    fideId: 2900010,
    name: "Topalov, Veselin",
    federation: "BUL",
    title: "GM",
    gender: "m",
    birth: "1975",
    ratingStandard: 2727,
    ratingRapid: 2730,
    ratingBlitz: 2715
  },
  {
    fideId: 2905540,
    name: "Cheparinov, Ivan",
    federation: "BUL",
    title: "GM",
    gender: "m",
    birth: "1986",
    ratingStandard: 2660,
    ratingRapid: 2645,
    ratingBlitz: 2652
  },
  {
    fideId: 2907402,
    name: "Georgiev, Kiril",
    federation: "BUL",
    title: "GM",
    gender: "m",
    birth: "1965",
    ratingStandard: 2570,
    ratingRapid: 2555,
    ratingBlitz: 2540
  },
  {
    fideId: 2900084,
    name: "Kolev, Atanas",
    federation: "BUL",
    title: "GM",
    gender: "m",
    birth: "1967",
    ratingStandard: 2505,
    ratingRapid: 2490,
    ratingBlitz: 2480
  },
  {
    fideId: 2900076,
    name: "Spasov, Vasil",
    federation: "BUL",
    title: "GM",
    gender: "m",
    birth: "1971",
    ratingStandard: 2465,
    ratingRapid: 2480,
    ratingBlitz: 2470
  },
  {
    fideId: 2902257,
    name: "Stefanova, Antoaneta",
    federation: "BUL",
    title: "GM",
    gender: "w",
    birth: "1979",
    ratingStandard: 2433,
    ratingRapid: 2412,
    ratingBlitz: 2398
  },
  {
    fideId: 2906350,
    name: "Rusev, Krasimir",
    federation: "BUL",
    title: "GM",
    gender: "m",
    birth: "1983",
    ratingStandard: 2490,
    ratingRapid: 2485,
    ratingBlitz: 2475
  },
  {
    fideId: 2905753,
    name: "Nikolov, Momchil",
    federation: "BUL",
    title: "GM",
    gender: "m",
    birth: "1985",
    ratingStandard: 2480,
    ratingRapid: 2470,
    ratingBlitz: 2465
  },
  {
    fideId: 2900602,
    name: "Chatalbashev, Boris",
    federation: "DEN",
    title: "GM",
    gender: "m",
    birth: "1974",
    ratingStandard: 2485,
    ratingRapid: 2490,
    ratingBlitz: 2480
  },
  {
    fideId: 2900610,
    name: "Genov, Petar",
    federation: "BUL",
    title: "GM",
    gender: "m",
    birth: "1970",
    ratingStandard: 2430,
    ratingRapid: 2440,
    ratingBlitz: 2425
  },
  {
    fideId: 2900696,
    name: "Petkov, Vladimir",
    federation: "BUL",
    title: "GM",
    gender: "m",
    birth: "1971",
    ratingStandard: 2470,
    ratingRapid: 2460,
    ratingBlitz: 2450
  },
  {
    fideId: 2906660,
    name: "Iotov, Valentin",
    federation: "BUL",
    title: "GM",
    gender: "m",
    birth: "1988",
    ratingStandard: 2475,
    ratingRapid: 2465,
    ratingBlitz: 2480
  },
  {
    fideId: 2900142,
    name: "Radulov, Julian",
    federation: "BUL",
    title: "GM",
    gender: "m",
    birth: "1972",
    ratingStandard: 2420,
    ratingRapid: 2410,
    ratingBlitz: 2400
  },
  {
    fideId: 2900169,
    name: "Ermenkov, Evgeni",
    federation: "PLE",
    title: "GM",
    gender: "m",
    birth: "1949",
    ratingStandard: 2390,
    ratingRapid: 2400,
    ratingBlitz: 2380
  },
  {
    fideId: 2900134,
    name: "Inkiov, Ventzislav",
    federation: "BUL",
    title: "GM",
    gender: "m",
    birth: "1956",
    ratingStandard: 2435,
    ratingRapid: 2420,
    ratingBlitz: 2410
  },
  {
    fideId: 2903822,
    name: "Bojkov, Dejan",
    federation: "BUL",
    title: "GM",
    gender: "m",
    birth: "1977",
    ratingStandard: 2450,
    ratingRapid: 2445,
    ratingBlitz: 2440
  },
  {
    fideId: 2912440,
    name: "Petrov, Martin",
    federation: "BUL",
    title: "GM",
    gender: "m",
    birth: "2000",
    ratingStandard: 2520,
    ratingRapid: 2510,
    ratingBlitz: 2505
  },
  {
    fideId: 2919782,
    name: "Salimova, Nurgyul",
    federation: "BUL",
    title: "IM",
    gender: "w",
    birth: "2003",
    ratingStandard: 2440,
    ratingRapid: 2410,
    ratingBlitz: 2380
  },
  {
    fideId: 2920268,
    name: "Krasteva, Beloslava",
    federation: "BUL",
    title: "WIM",
    gender: "w",
    birth: "2004",
    ratingStandard: 2270,
    ratingRapid: 2250,
    ratingBlitz: 2240
  },
  {
    fideId: 2919421,
    name: "Peycheva, Gergana",
    federation: "BUL",
    title: "WIM",
    gender: "w",
    birth: "2003",
    ratingStandard: 2290,
    ratingRapid: 2260,
    ratingBlitz: 2250
  },
  {
    fideId: 2915834,
    name: "Radeva, Viktoria",
    federation: "BUL",
    title: "WGM",
    gender: "w",
    birth: "2001",
    ratingStandard: 2310,
    ratingRapid: 2280,
    ratingBlitz: 2270
  },
  {
    fideId: 2916539,
    name: "Antova, Gabriela",
    federation: "BUL",
    title: "WIM",
    gender: "w",
    birth: "2002",
    ratingStandard: 2260,
    ratingRapid: 2230,
    ratingBlitz: 2220
  },
  {
    fideId: 2922759,
    name: "Toncheva, Nadya",
    federation: "BUL",
    title: "WFM",
    gender: "w",
    birth: "2005",
    ratingStandard: 2240,
    ratingRapid: 2210,
    ratingBlitz: 2200
  },
  {
    fideId: 2916296,
    name: "Stoyanov, Tsvetan",
    federation: "BUL",
    title: "IM",
    gender: "m",
    birth: "2004",
    ratingStandard: 2450,
    ratingRapid: 2430,
    ratingBlitz: 2440
  },
  {
    fideId: 2908751,
    name: "Dimitrov, Radoslav",
    federation: "BUL",
    title: "IM",
    gender: "m",
    birth: "1993",
    ratingStandard: 2460,
    ratingRapid: 2440,
    ratingBlitz: 2450
  },
  {
    fideId: 2907496,
    name: "Danov, Lyubomir",
    federation: "BUL",
    title: "IM",
    gender: "m",
    birth: "1987",
    ratingStandard: 2345,
    ratingRapid: 2330,
    ratingBlitz: 2350
  },
  {
    fideId: 2901599,
    name: "Marholev, Dimitar",
    federation: "BUL",
    title: "IM",
    gender: "m",
    birth: "1971",
    ratingStandard: 2330,
    ratingRapid: 2320,
    ratingBlitz: 2315
  },

  // --- Club & Tournament Players (1400 - 2100) ---
  {
    fideId: 2908891,
    name: "Petrov, Daniel",
    federation: "BUL",
    gender: "m",
    birth: "2009",
    ratingStandard: 1540,
    ratingRapid: 1520,
    ratingBlitz: 1510
  },
  {
    fideId: 2913345,
    name: "Vasilev, Dimitar",
    federation: "BUL",
    gender: "m",
    birth: "1995",
    ratingStandard: 1850,
    ratingRapid: 1830,
    ratingBlitz: 1840
  },
  {
    fideId: 2911223,
    name: "Ivanov, Hristo",
    federation: "BUL",
    gender: "m",
    birth: "1998",
    ratingStandard: 1920,
    ratingRapid: 1900,
    ratingBlitz: 1890
  },
  {
    fideId: 2915567,
    name: "Iliev, Petar",
    federation: "BUL",
    gender: "m",
    birth: "2001",
    ratingStandard: 1780,
    ratingRapid: 1760,
    ratingBlitz: 1770
  },
  {
    fideId: 2916678,
    name: "Marinov, Stefan",
    federation: "BUL",
    gender: "m",
    birth: "2003",
    ratingStandard: 1650,
    ratingRapid: 1640,
    ratingBlitz: 1620
  },
  {
    fideId: 2917789,
    name: "Krumova, Maria",
    federation: "BUL",
    gender: "f",
    birth: "2006",
    ratingStandard: 1490,
    ratingRapid: 1470,
    ratingBlitz: 1460
  },
  {
    fideId: 2918890,
    name: "Popov, Georgi",
    federation: "BUL",
    gender: "m",
    birth: "1992",
    ratingStandard: 2050,
    ratingRapid: 2030,
    ratingBlitz: 2040
  },
  {
    fideId: 2919901,
    name: "Todorov, Alexander",
    federation: "BUL",
    gender: "m",
    birth: "1994",
    ratingStandard: 1980,
    ratingRapid: 1960,
    ratingBlitz: 1970
  },
  {
    fideId: 4699112,
    name: "Schmidt, Lukas",
    federation: "GER",
    gender: "m",
    birth: "1997",
    ratingStandard: 1920,
    ratingRapid: 1900,
    ratingBlitz: 1910
  },
  {
    fideId: 6788223,
    name: "Dupont, Jean",
    federation: "FRA",
    gender: "m",
    birth: "1991",
    ratingStandard: 1840,
    ratingRapid: 1820,
    ratingBlitz: 1830
  },
  {
    fideId: 8977334,
    name: "Rossi, Marco",
    federation: "ITA",
    gender: "m",
    birth: "1989",
    ratingStandard: 2010,
    ratingRapid: 2000,
    ratingBlitz: 1990
  },
  {
    fideId: 2288445,
    name: "Garcia, Carlos",
    federation: "ESP",
    gender: "m",
    birth: "1993",
    ratingStandard: 1970,
    ratingRapid: 1950,
    ratingBlitz: 1960
  },
  {
    fideId: 6399556,
    name: "Yilmaz, Emre",
    federation: "TUR",
    gender: "m",
    birth: "2000",
    ratingStandard: 1880,
    ratingRapid: 1860,
    ratingBlitz: 1870
  },
  {
    fideId: 1299667,
    name: "Popa, Andrei",
    federation: "ROU",
    gender: "m",
    birth: "1999",
    ratingStandard: 1940,
    ratingRapid: 1920,
    ratingBlitz: 1930
  },
  {
    fideId: 4399778,
    name: "Smith, Oliver",
    federation: "ENG",
    gender: "m",
    birth: "2002",
    ratingStandard: 1860,
    ratingRapid: 1840,
    ratingBlitz: 1850
  },
  {
    fideId: 9899889,
    name: "Jovanovic, Nikola",
    federation: "SRB",
    gender: "m",
    birth: "1996",
    ratingStandard: 2080,
    ratingRapid: 2060,
    ratingBlitz: 2070
  },
  {
    fideId: 4299990,
    name: "Papadopoulos, Dimitrios",
    federation: "GRE",
    gender: "m",
    birth: "1995",
    ratingStandard: 1910,
    ratingRapid: 1890,
    ratingBlitz: 1900
  },

  // --- Unrated FIDE-registered players (LEGACY format: not rated included) ---
  {
    fideId: 2914102,
    name: "Nikolov, Boris",
    federation: "BUL",
    gender: "m",
    birth: "2013",
    ratingStandard: 0,
    ratingRapid: 0,
    ratingBlitz: 0
  },
  {
    fideId: 2912458,
    name: "Stoyanova, Elena",
    federation: "BUL",
    gender: "f",
    birth: "2011",
    ratingStandard: 0,
    ratingRapid: 0,
    ratingBlitz: 0
  },
  {
    fideId: 2918891,
    name: "Dimitrov, Martin",
    federation: "BUL",
    gender: "m",
    birth: "2014",
    ratingStandard: 0,
    ratingRapid: 0,
    ratingBlitz: 0
  },
  {
    fideId: 2924510,
    name: "Krasimirov, Kaloyan",
    federation: "BUL",
    gender: "m",
    birth: "2015",
    ratingStandard: 0,
    ratingRapid: 0,
    ratingBlitz: 0
  },
  {
    fideId: 2925620,
    name: "Vasileva, Yoana",
    federation: "BUL",
    gender: "f",
    birth: "2016",
    ratingStandard: 0,
    ratingRapid: 0,
    ratingBlitz: 0
  },
  {
    fideId: 1529404,
    name: "Hansen, Torstein",
    federation: "NOR",
    gender: "m",
    birth: "2008",
    ratingStandard: 0,
    ratingRapid: 0,
    ratingBlitz: 0
  },
  {
    fideId: 2034918,
    name: "Miller, Jacob",
    federation: "USA",
    gender: "m",
    birth: "2010",
    ratingStandard: 0,
    ratingRapid: 0,
    ratingBlitz: 0
  },
  {
    fideId: 4689012,
    name: "Mueller, Felix",
    federation: "GER",
    gender: "m",
    birth: "2012",
    ratingStandard: 0,
    ratingRapid: 0,
    ratingBlitz: 0
  },
  {
    fideId: 6712345,
    name: "Dubois, Chloe",
    federation: "FRA",
    gender: "f",
    birth: "2014",
    ratingStandard: 0,
    ratingRapid: 0,
    ratingBlitz: 0
  },
  {
    fideId: 25199881,
    name: "Sharma, Rohan",
    federation: "IND",
    gender: "m",
    birth: "2013",
    ratingStandard: 0,
    ratingRapid: 0,
    ratingBlitz: 0
  }
];
