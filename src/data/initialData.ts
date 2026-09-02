import { Tournament, AppData } from '../types';

export const FEDERATIONS: [string, string, string][] = [
  ["BUL", "Bulgaria", "BG"],
  ["USA", "United States", "US"],
  ["IND", "India", "IN"],
  ["GER", "Germany", "DE"],
  ["FRA", "France", "FR"],
  ["ESP", "Spain", "ES"],
  ["ITA", "Italy", "IT"],
  ["ENG", "England", "GB"],
  ["NED", "Netherlands", "NL"],
  ["POL", "Poland", "PL"],
  ["UKR", "Ukraine", "UA"],
  ["AZE", "Azerbaijan", "AZ"],
  ["ARM", "Armenia", "AM"],
  ["GEO", "Georgia", "GE"],
  ["HUN", "Hungary", "HU"],
  ["ROU", "Romania", "RO"],
  ["SRB", "Serbia", "RS"],
  ["CRO", "Croatia", "HR"],
  ["GRE", "Greece", "GR"],
  ["TUR", "Türkiye", "TR"],
  ["NOR", "Norway", "NO"],
  ["SWE", "Sweden", "SE"],
  ["ISR", "Israel", "IL"],
  ["CHN", "China", "CN"],
  ["UZB", "Uzbekistan", "UZ"],
  ["KAZ", "Kazakhstan", "KZ"],
  ["FID", "FIDE", ""]
];

export function getFederationFlag(fed: string): string {
  const f = FEDERATIONS.find(x => x[0] === String(fed || '').toUpperCase());
  if (!f || !f[2]) return '🏁';
  try {
    return [...f[2]].map(c => String.fromCodePoint(127397 + c.charCodeAt(0))).join('');
  } catch {
    return '🏁';
  }
}

export const FIDE_TIE_BREAKS: string[] = [
  "Buchholz Cut-1 (BH-C1) [84]",
  "Buchholz Tie-Break (2023) [84]",
  "Buchholz Cut-2 (BH-C2) [84]",
  "Median Buchholz (BH-M1) [84]",
  "Median Buchholz 2 (BH-M2) [84]",
  "Sonneborn-Berger Tie-Break (2023) [85]",
  "Sonneborn-Berger Cut-1 (SB-C1) [85]",
  "Direct Encounter (DE) [81]",
  "Average Rating of Opponents (ARO) [80]",
  "Average of Opponents' Buchholz (AOB) [77]",
  "Greater number of victories (WIN) [68]",
  "Greater number of games won (WON) [68]",
  "Greater number of games played with Black (BPG) [68]",
  "Greater number of games won with Black (BWG) [68]",
  "Performance Tie-Break (TPR) [88]",
  "Performance Tie-Break (PTP) [88]",
  "Performance Tie-Break (APRO) [88]",
  "Performance Tie-Break (APPO) [88]",
  "FIDE Tiebreak (Progressive Score) [86]",
  "Koya System (KS) [87]",
  "Sum of the ratings of the opponents (without one result) [23]",
  "Recursive rating performance [54]",
  "Special Gamepoints for white/black [76]"
];

export const ROUND_ROBIN_TIE_BREAKS: string[] = [
  "Direct Encounter (DE) [81]",
  "Sonneborn-Berger Tie-Break (2023) [85]",
  "Koya System (KS) [87]",
  "Greater number of victories (WIN) [68]",
  "Greater number of games won (WON) [68]",
  "Greater number of games won with Black (BWG) [68]",
  "Greater number of games played with Black (BPG) [68]",
  "Average Rating of Opponents (ARO) [80]",
  "Performance Tie-Break (TPR) [88]",
  "Performance Tie-Break (PTP) [88]",
  "Performance Tie-Break (APRO) [88]",
  "Performance Tie-Break (APPO) [88]"
];

export const TIME_CONTROLS = [
  "", "90+30", "60+30", "45+15", "30+30", "25+10", "15+10", "15+5", "10+5", "10+0", "5+3", "3+2", "Custom"
];

export const SAMPLE_FIDE_PLAYERS = [
  { fideId: "1503014", name: "Carlsen, Magnus", fed: "NOR", std: 2832, rapid: 2823, blitz: 2886, title: "GM", gender: "m", birth: "1990-11-30" },
  { fideId: "2020009", name: "Nakamura, Hikaru", fed: "USA", std: 2802, rapid: 2746, blitz: 2874, title: "GM", gender: "m", birth: "1987-12-09" },
  { fideId: "5000017", name: "Anand, Viswanathan", fed: "IND", std: 2751, rapid: 2748, blitz: 2731, title: "GM", gender: "m", birth: "1969-12-11" },
  { fideId: "24116068", name: "Caruana, Fabiano", fed: "USA", std: 2805, rapid: 2777, blitz: 2796, title: "GM", gender: "m", birth: "1992-07-30" },
  { fideId: "2905540", name: "Topalov, Veselin", fed: "BUL", std: 2727, rapid: 2735, blitz: 2740, title: "GM", gender: "m", birth: "1975-03-15" },
  { fideId: "2900084", name: "Georgiev, Kiril", fed: "BUL", std: 2568, rapid: 2580, blitz: 2555, title: "GM", gender: "m", birth: "1965-11-28" },
  { fideId: "2905710", name: "Stefanova, Antoaneta", fed: "BUL", std: 2435, rapid: 2442, blitz: 2410, title: "GM", gender: "f", birth: "1979-04-19" },
  { fideId: "2912440", name: "Cheparinov, Ivan", fed: "BUL", std: 2658, rapid: 2645, blitz: 2670, title: "GM", gender: "m", birth: "1986-11-26" },
  { fideId: "2907403", name: "Delchev, Aleksander", fed: "BUL", std: 2542, rapid: 2530, blitz: 2515, title: "GM", gender: "m", birth: "1971-07-15" },
  { fideId: "2914108", name: "Iotov, Valentin", fed: "BUL", std: 2515, rapid: 2520, blitz: 2500, title: "GM", gender: "m", birth: "1988-09-06" },
  { fideId: "2915830", name: "Nikolova, Adriana", fed: "BUL", std: 2280, rapid: 2265, blitz: 2240, title: "WGM", gender: "f", birth: "1988-11-09" },
  { fideId: "2920150", name: "Stoyanov, Ivaylo", fed: "BUL", std: 2390, rapid: 2375, blitz: 2360, title: "FM", gender: "m", birth: "1994-06-12" },
  { fideId: "2924510", name: "Salimova, Nurgyul", fed: "BUL", std: 2448, rapid: 2415, blitz: 2380, title: "IM", gender: "f", birth: "2003-06-02" },
  { fideId: "2919920", name: "Dikova, Gabriela", fed: "BUL", std: 2190, rapid: 2170, blitz: 2140, title: "WFM", gender: "f", birth: "1997-03-21" },
  { fideId: "2928812", name: "Petkov, Martin", fed: "BUL", std: 2245, rapid: 2210, blitz: 2260, title: "CM", gender: "m", birth: "2004-08-14" },
  { fideId: "2930114", name: "Vasilev, Dimitar", fed: "BUL", std: 2110, rapid: 2095, blitz: 2130, title: "CM", gender: "m", birth: "2006-01-25" }
];

export function createInitialEmptyTournament(name: string): Tournament {
  return {
    name,
    settings: {
      organizer: "Bulgarian Chess Federation & Arda Chess Club",
      chiefArbiter: "IA Nikolay Todorov",
      arbiter: "FA Georgi Dimitrov",
      director: "Ivan Stanev",
      tnr: "",
      venue: "Grand Hotel Plovdiv, Hall Moscow",
      city: "Plovdiv",
      country: "BUL",
      timeControl: "90+30",
      timeControlPreset: "90+30",
      customTimeControl: "",
      startDate: "2026-10-02T10:00",
      endDate: "2026-10-08T18:00",
      generalRegistrationDeadline: "2026-10-01T20:00",
      rounds: "7",
      lastSwissRounds: "7",
      roundRobinCycles: "1",
      tournamentFormat: "Individual Swiss",
      pairingSystem: "FIDE Dutch System",
      fideRated: "Yes",
      tournamentRatingType: "Standard",
      initialRankSorting: "automatic",
      initialRatingSource: "fide",
      pairingScoreSystem: "game-1-0.5-0",
      tournamentType: "real",
      liveLink: "https://lichess.org/broadcast",
      website: "https://chess-publisher.org",
      email: "arbiter@chess-publisher.org",
      phone: "+359 88 123 4567",
      fideEventId: "490658",
      generalNotes: "FIDE Standard Rated Open Swiss Tournament. 7 rounds FIDE Dutch Swiss system."
    },
    telegram: {
      channel: "ArdaChessResults",
      language: "en",
      signature: "chess-publisher Tournament Bulletin • https://chess-publisher.org"
    },
    chessResults: {
      sourceId: 21,
      creatorId: 100,
      clientId: "cp-73164a08-initial",
      key: "",
      mode: "real",
      federation: "BUL",
      createdAt: "",
      lastUpload: "",
      uploadStatus: "Not published",
      lastError: "",
      publishCount: 0,
      lastConnectionTest: "",
      sidVerified: false,
      freshTnrRequired: false,
      pinBoardEnabled: true,
      pinBoardText: "Welcome to Golden Rhodopes Chess Festival 2026! Live broadcast on Boards 1-8.",
      activityLog: []
    },
    pairings: {
      server: "s3.chess-results.com",
      round: "-1",
      results: "NO",
      showScheduleOnPrint: true,
      liveBoards: {},
      finalStandingsPromptedRound: 0,
      engine: {
        mode: "gacrux",
        initialTopColor: "w",
        excluded: [],
        lastGeneratedRound: 0,
        lastEngineMessage: "Engine ready",
        excludeRemaining: {},
        excludeRounds: {},
        manualByes: {},
        fixedBoards: {},
        roundActivationConfirmed: {},
        playerStatusCollapsed: true,
        needsResort: false,
        registrationsDirty: false,
        syncedAbsent: {},
        registrationSyncedAt: "",
        registrationSyncedForRound: 0,
        registrationSyncedSignature: "",
        firstRoundRegistrationLocked: false,
        firstRoundRegistrationSyncedSignature: "",
        firstRoundRegistrationNeedsResort: false,
        firstRoundRegistrationSyncedAt: ""
      }
    },
    schedule: {
      registrationOpens: "2026-10-01T14:00",
      registrationCloses: "2026-10-01T20:00",
      technicalMeeting: "2026-10-02T09:00",
      openingCeremony: "2026-10-02T09:30",
      closingCeremony: "2026-10-08T17:30",
      awardCeremony: "2026-10-08T18:00",
      notes: "Strict 15-minute default time as per FIDE regulations.",
      rows: [
        { no: "1", dateTime: "2026-10-02T10:00", event: "Round 1", description: "Round 1 / 7" },
        { no: "2", dateTime: "2026-10-03T10:00", event: "Round 2", description: "Round 2 / 7" },
        { no: "3", dateTime: "2026-10-04T10:00", event: "Round 3", description: "Round 3 / 7" },
        { no: "4", dateTime: "2026-10-05T10:00", event: "Round 4", description: "Round 4 / 7" },
        { no: "5", dateTime: "2026-10-06T10:00", event: "Round 5", description: "Round 5 / 7" },
        { no: "6", dateTime: "2026-10-07T10:00", event: "Round 6", description: "Round 6 / 7" },
        { no: "7", dateTime: "2026-10-08T10:00", event: "Round 7", description: "Final Round 7" }
      ]
    },
    regulations: {
      eligibility: "Open to all FIDE rated players and national federation members.",
      format: "Individual Swiss",
      rounds: "7",
      timeControl: "90+30",
      pairingSystem: "FIDE Dutch System",
      rating: "FIDE Standard Rated",
      defaultTime: "15 minutes",
      drawRules: "Allowed according to FIDE Laws of Chess",
      pabPoints: "1.0",
      tieBreaks: [
        "Buchholz Cut-1 (BH-C1) [84]",
        "Buchholz Tie-Break (2023) [84]",
        "Sonneborn-Berger Tie-Break (2023) [85]",
        "Direct Encounter (DE) [81]",
        "Average Rating of Opponents (ARO) [80]",
        "Greater number of victories (WIN) [68]"
      ],
      tieBreakOptions: {
        "Buchholz Cut-1 (BH-C1) [84]": { countForfeits: false, validFrom2026: true },
        "Buchholz Tie-Break (2023) [84]": { countForfeits: false, validFrom2026: true },
        "Sonneborn-Berger Tie-Break (2023) [85]": { countForfeits: false, validFrom2026: true },
        "Direct Encounter (DE) [81]": { countForfeits: false, validFrom2026: true },
        "Average Rating of Opponents (ARO) [80]": { unratedRating: 1400, aroDiscardBest: 0, aroDiscardWorst: 0 },
        "Greater number of victories (WIN) [68]": { countForfeits: true }
      },
      entryFee: "30 EUR",
      registrationDeadline: "2026-10-01T20:00",
      maximumPlayers: "120",
      fideInfo: "FIDE ID is mandatory for rating report.",
      totalPrizeFund: "5,000 EUR",
      mainPrizes: "1st: 1,500 EUR | 2nd: 1,000 EUR | 3rd: 750 EUR | 4th: 500 EUR | 5th: 350 EUR",
      specialPrizes: "Best Female: 300 EUR | Best Senior (50+): 200 EUR | Best Junior (U18): 200 EUR",
      categoryPrizes: "Rating U2200: 100 EUR | Rating U2000: 100 EUR",
      additional: "DGT electronic boards in use on Boards 1-12."
    },
    players: SAMPLE_FIDE_PLAYERS.map((p, idx) => ({
      id: idx + 1,
      localKey: `local:${p.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${idx + 1}`,
      name: p.name,
      rating: p.std,
      nationalRating: p.std > 2200 ? p.std + 15 : 0,
      fed: p.fed,
      fideId: p.fideId,
      birth: p.birth,
      gender: p.gender as any,
      title: p.title as any,
      attendance: 'present',
      pairingNumber: idx + 1,
      joinedFromRound: 1,
      fideK: p.std >= 2400 ? 10 : 20,
      club: p.fed === 'BUL' ? 'Arda Chess Club' : 'International'
    }))
  };
}

export const INITIAL_TOURNAMENT_DATA: Tournament = createInitialEmptyTournament("Golden Rhodopes Chess Festival 2026");

export function createDefaultAppData(): AppData {
  const tournamentName = "Golden Rhodopes Chess Festival 2026";
  const defaultTourn = createInitialEmptyTournament(tournamentName);

  return {
    currentTournament: tournamentName,
    tournaments: {
      [tournamentName]: defaultTourn
    },
    preferences: {
      defaultRating: "std",
      sortMode: "rating",
      activeTab: "pairings",
      dgtExpectedBoards: 8
    }
  };
}
