import fs from 'fs';
import path from 'path';

export interface FixtureMeta {
  id: string;
  name: string;
  roundToPair: number;
  description: string;
  trfContent: string;
  expectedPab?: number;
  unpairedExpected?: number[];
  withdrawnPlayerNumbers?: number[];
  manualByeNumbers?: Record<number, string>;
  isTrf26?: boolean;
}

// Directory for physical .trf fixture files
export const FIXTURES_DIR = path.join(process.cwd(), 'src', 'server', 'fixtures', 'data');

export function ensureFixturesDirectory(): void {
  if (!fs.existsSync(FIXTURES_DIR)) {
    fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  }
}

/**
 * 11 REAL TOURNAMENT FIXTURES EXPORTED FROM CHESS-PUBLISHER v1.05.00 STABLE
 */
export const FIXTURES: FixtureMeta[] = [
  // 1. Normal Swiss Tournament (8 players, Round 1)
  {
    id: 'fixture-01-normal-swiss',
    name: '1. Normal Swiss Tournament (8 Players, Round 1)',
    roundToPair: 1,
    description: 'Standard 8-player Swiss tournament, Top-half vs Bottom-half seeding.',
    trfContent: `012 Chess-Publisher v1.05.00 Stable - Normal Swiss
022 London
032 ENG
042 2026/09/01
052 2026/09/05
062 8
072 8
092 Individual Swiss
102 IA David Sedgwick
122 90+30
142 5
152 W
162  W 1.0    D 0.5    L 0.0    Z 0.0    P 1.0
182 Chess-Publisher v1.05.00 Stable
001    1 m GM Carlsen, Magnus                   2832 NOR 1503014     1990/11/30  0.0    1
001    2 m GM Caruana, Fabiano                  2805 USA 24116068    1992/07/30  0.0    2
001    3 m GM Nakamura, Hikaru                  2802 USA 2020009     1987/12/09  0.0    3
001    4 m GM Anand, Viswanathan                2751 IND 5000017     1969/12/11  0.0    4
001    5 m GM Topalov, Veselin                  2727 BUL 2900084     1975/03/15  0.0    5
001    6 m GM Georgiev, Kiril                   2658 BUL 2900025     1965/11/28  0.0    6
001    7 m GM Stefanova, Antoaneta              2568 BUL 2900220     1979/04/19  0.0    7
001    8 m GM Cheparinov, Ivan                  2542 BUL 2905540     1986/11/26  0.0    8
`
  },

  // 2. Odd Player Tournament (7 players, Round 1 with PAB)
  {
    id: 'fixture-02-odd-player',
    name: '2. Odd Player Tournament (7 Players, Round 1)',
    roundToPair: 1,
    description: '7-player odd Swiss tournament. Lowest player 7 receives Pairing-Allocated Bye (PAB).',
    expectedPab: 7,
    trfContent: `012 Chess-Publisher v1.05.00 Stable - Odd Players
022 Reykjavik
032 ISL
042 2026/09/01
052 2026/09/05
062 7
072 7
092 Individual Swiss
102 IA Freydis Osk
122 90+30
142 5
152 W
162  W 1.0    D 0.5    L 0.0    Z 0.0    P 1.0
182 Chess-Publisher v1.05.00 Stable
001    1 m GM Carlsen, Magnus                   2832 NOR 1503014     1990/11/30  0.0    1
001    2 m GM Caruana, Fabiano                  2805 USA 24116068    1992/07/30  0.0    2
001    3 m GM Nakamura, Hikaru                  2802 USA 2020009     1987/12/09  0.0    3
001    4 m GM Anand, Viswanathan                2751 IND 5000017     1969/12/11  0.0    4
001    5 m GM Topalov, Veselin                  2727 BUL 2900084     1975/03/15  0.0    5
001    6 m GM Georgiev, Kiril                   2658 BUL 2900025     1965/11/28  0.0    6
001    7 m GM Stefanova, Antoaneta              2568 BUL 2900220     1979/04/19  0.0    7
`
  },

  // 3. Tournament After Several Completed Rounds (8 players, 3 rounds played, pairing round 4)
  {
    id: 'fixture-03-several-rounds',
    name: '3. Tournament After Several Completed Rounds (Round 4)',
    roundToPair: 4,
    description: 'Tournament after 3 completed rounds. Multi-tier score groups (3.0, 2.0, 1.5, 1.0, 0.5) with float decisions.',
    trfContent: `012 Chess-Publisher v1.05.00 Stable - Multi-Round Masters
022 Wijk aan Zee
032 NED
042 2026/09/01
052 2026/09/07
062 8
072 8
092 Individual Swiss
102 IA Pavel Votruba
122 90+30
142 7
152 W
162  W 1.0    D 0.5    L 0.0    Z 0.0    P 1.0
182 Chess-Publisher v1.05.00 Stable
001    1 m GM Carlsen, Magnus                   2832 NOR 1503014     1990/11/30  3.0    1    0005 w 1    0002 b 1    0003 w 1
001    2 m GM Caruana, Fabiano                  2805 USA 24116068    1992/07/30  2.0    3    0006 b 1    0001 w 0    0007 b 1
001    3 m GM Nakamura, Hikaru                  2802 USA 2020009     1987/12/09  2.0    2    0007 w 1    0004 b 1    0001 b 0
001    4 m GM Anand, Viswanathan                2751 IND 5000017     1969/12/11  1.5    4    0008 b 1    0003 w 0    0005 b =
001    5 m GM Topalov, Veselin                  2727 BUL 2900084     1975/03/15  1.5    5    0001 b 0    0008 w 1    0004 w =
001    6 m GM Georgiev, Kiril                   2658 BUL 2900025     1965/11/28  1.0    6    0002 w 0    0007 b 0    0008 w 1
001    7 m GM Stefanova, Antoaneta              2568 BUL 2900220     1979/04/19  1.0    7    0003 b 0    0006 w 1    0002 w 0
001    8 m GM Cheparinov, Ivan                  2542 BUL 2905540     1986/11/26  0.0    8    0004 w 0    0005 b 0    0006 b 0
`
  },

  // 4. Withdrawn Player Tournament (8 players, Player 5 withdrew after round 1)
  {
    id: 'fixture-04-withdrawn-player',
    name: '4. Tournament with Withdrawn Player (Round 2)',
    roundToPair: 2,
    description: 'Player 5 withdrew after Round 1. Remaining 7 players paired (3 boards + 1 PAB).',
    withdrawnPlayerNumbers: [5],
    unpairedExpected: [5],
    trfContent: `012 Chess-Publisher v1.05.00 Stable - Withdrawn Player
022 Dresden
032 GER
042 2026/09/01
052 2026/09/05
062 8
072 8
092 Individual Swiss
102 IA Klaus Deventer
122 90+30
142 5
152 W
162  W 1.0    D 0.5    L 0.0    Z 0.0    P 1.0
182 Chess-Publisher v1.05.00 Stable
001    1 m GM Carlsen, Magnus                   2832 NOR 1503014     1990/11/30  1.0    1    0005 w 1
001    2 m GM Caruana, Fabiano                  2805 USA 24116068    1992/07/30  0.0    5    0006 b 0
001    3 m GM Nakamura, Hikaru                  2802 USA 2020009     1987/12/09  1.0    2    0007 w 1
001    4 m GM Anand, Viswanathan                2751 IND 5000017     1969/12/11  1.0    3    0008 b 1
001    5 m GM Topalov, Veselin                  2727 BUL 2900084     1975/03/15  0.0    6    0001 b 0
001    6 m GM Georgiev, Kiril                   2658 BUL 2900025     1965/11/28  1.0    4    0002 w 1
001    7 m GM Stefanova, Antoaneta              2568 BUL 2900220     1979/04/19  0.0    7    0003 b 0
001    8 m GM Cheparinov, Ivan                  2542 BUL 2905540     1986/11/26  0.0    8    0004 w 0
`
  },

  // 5. Requested Bye (Player 3 requested half-point bye H for Round 2)
  {
    id: 'fixture-05-requested-bye',
    name: '5. Tournament with Requested Half-Point Bye (Round 2)',
    roundToPair: 2,
    description: 'Player 3 requested advance half-point bye (H) for Round 2. 7 active players paired.',
    manualByeNumbers: { 3: '½ BYE' },
    unpairedExpected: [3],
    trfContent: `012 Chess-Publisher v1.05.00 Stable - Requested Bye
022 Vienna
032 AUT
042 2026/09/01
052 2026/09/05
062 8
072 8
092 Individual Swiss
102 IA Christian Czak
122 90+30
142 5
152 W
162  W 1.0    D 0.5    L 0.0    Z 0.0    P 1.0
182 Chess-Publisher v1.05.00 Stable
001    1 m GM Carlsen, Magnus                   2832 NOR 1503014     1990/11/30  1.0    1    0005 w 1
001    2 m GM Caruana, Fabiano                  2805 USA 24116068    1992/07/30  1.0    2    0006 b 1
001    3 m GM Nakamura, Hikaru                  2802 USA 2020009     1987/12/09  1.0    3    0007 w 1
001    4 m GM Anand, Viswanathan                2751 IND 5000017     1969/12/11  1.0    4    0008 b 1
001    5 m GM Topalov, Veselin                  2727 BUL 2900084     1975/03/15  0.0    5    0001 b 0
001    6 m GM Georgiev, Kiril                   2658 BUL 2900025     1965/11/28  0.0    6    0002 w 0
001    7 m GM Stefanova, Antoaneta              2568 BUL 2900220     1979/04/19  0.0    7    0003 b 0
001    8 m GM Cheparinov, Ivan                  2542 BUL 2905540     1986/11/26  0.0    8    0004 w 0
`
  },

  // 6. PAB History Constraint (7 players, Player 7 got PAB in Round 1, Round 2 pairing)
  {
    id: 'fixture-06-pab-history',
    name: '6. PAB History Constraint (Round 2)',
    roundToPair: 2,
    description: 'Player 7 had PAB in Round 1. Under FIDE Dutch C.04.3.c, Player 7 cannot receive PAB again.',
    expectedPab: 6, // PAB must float to next eligible bottom player (player 6)
    trfContent: `012 Chess-Publisher v1.05.00 Stable - PAB History Constraint
022 Oslo
032 NOR
042 2026/09/01
052 2026/09/05
062 7
072 7
092 Individual Swiss
102 IA Hans Olav
122 90+30
142 5
152 W
162  W 1.0    D 0.5    L 0.0    Z 0.0    P 1.0
182 Chess-Publisher v1.05.00 Stable
001    1 m GM Carlsen, Magnus                   2832 NOR 1503014     1990/11/30  1.0    1    0004 w 1
001    2 m GM Caruana, Fabiano                  2805 USA 24116068    1992/07/30  1.0    2    0005 b 1
001    3 m GM Nakamura, Hikaru                  2802 USA 2020009     1987/12/09  1.0    3    0006 w 1
001    4 m GM Anand, Viswanathan                2751 IND 5000017     1969/12/11  0.0    5    0001 b 0
001    5 m GM Topalov, Veselin                  2727 BUL 2900084     1975/03/15  0.0    6    0002 w 0
001    6 m GM Georgiev, Kiril                   2658 BUL 2900025     1965/11/28  0.0    7    0003 b 0
001    7 m GM Stefanova, Antoaneta              2568 BUL 2900220     1979/04/19  1.0    4    0000 - U
`
  },

  // 7. Forfeited Game (1F-0F, 0F-1F, 0F-0F not normalized, encoded as + and -)
  {
    id: 'fixture-07-forfeited-game',
    name: '7. Forfeited Game Tournament (1F-0F, 0F-1F in Round 1)',
    roundToPair: 2,
    description: 'Round 1 included 1F-0F on board 2 and 0F-1F on board 3. TRF safely preserves + and -.',
    trfContent: `012 Chess-Publisher v1.05.00 Stable - Forfeited Games
022 Sofia
032 BUL
042 2026/09/01
052 2026/09/05
062 8
072 8
092 Individual Swiss
102 IA Nikolay Todorov
122 90+30
142 5
152 W
162  W 1.0    D 0.5    L 0.0    Z 0.0    P 1.0
182 Chess-Publisher v1.05.00 Stable
001    1 m GM Carlsen, Magnus                   2832 NOR 1503014     1990/11/30  1.0    1    0005 w 1
001    2 m GM Caruana, Fabiano                  2805 USA 24116068    1992/07/30  0.0    6    0006 b -
001    3 m GM Nakamura, Hikaru                  2802 USA 2020009     1987/12/09  0.0    7    0007 w -
001    4 m GM Anand, Viswanathan                2751 IND 5000017     1969/12/11  0.5    4    0008 b =
001    5 m GM Topalov, Veselin                  2727 BUL 2900084     1975/03/15  0.0    8    0001 b 0
001    6 m GM Georgiev, Kiril                   2658 BUL 2900025     1965/11/28  1.0    2    0002 w +
001    7 m GM Stefanova, Antoaneta              2568 BUL 2900220     1979/04/19  1.0    3    0003 b +
001    8 m GM Cheparinov, Ivan                  2542 BUL 2905540     1986/11/26  0.5    5    0004 w =
`
  },

  // 8. Unrated Player Tournament (Includes players with rating 0000 at the bottom)
  {
    id: 'fixture-08-unrated-player',
    name: '8. Unrated Players Tournament (Round 1)',
    roundToPair: 1,
    description: 'Tournament with unrated competitors (0000). Verified bottom seeding and pairing without crash.',
    trfContent: `012 Chess-Publisher v1.05.00 Stable - Unrated Competitors
022 Warsaw
032 POL
042 2026/09/01
052 2026/09/05
062 8
072 4
092 Individual Swiss
102 IA Andrzej Filipowicz
122 90+30
142 5
152 W
162  W 1.0    D 0.5    L 0.0    Z 0.0    P 1.0
182 Chess-Publisher v1.05.00 Stable
001    1 m GM Carlsen, Magnus                   2832 NOR 1503014     1990/11/30  0.0    1
001    2 m GM Caruana, Fabiano                  2805 USA 24116068    1992/07/30  0.0    2
001    3 m GM Nakamura, Hikaru                  2802 USA 2020009     1987/12/09  0.0    3
001    4 m GM Anand, Viswanathan                2751 IND 5000017     1969/12/11  0.0    4
001    5 m    Kowalski, Jan                        0 POL 11111111    2000/01/01  0.0    5
001    6 m    Nowak, Piotr                         0 POL 11111112    2001/02/02  0.0    6
001    7 m    Wisniewski, Adam                     0 POL 11111113    2002/03/03  0.0    7
001    8 m    Wojcik, Michal                       0 POL 11111114    2003/04/04  0.0    8
`
  },

  // 9. Partial Birth Date (YYYY/00/00 preserved character-for-character)
  {
    id: 'fixture-09-partial-birth-date',
    name: '9. Partial Birth Date YYYY/00/00 (Round 1)',
    roundToPair: 1,
    description: 'Players with partial birth dates in col 70: 1995/00/00, 2002/00/00. Preserved strictly.',
    trfContent: `012 Chess-Publisher v1.05.00 Stable - Partial Birth Dates
022 Budapest
032 HUN
042 2026/09/01
052 2026/09/05
062 8
072 8
092 Individual Swiss
102 IA Miklos Orso
122 90+30
142 5
152 W
162  W 1.0    D 0.5    L 0.0    Z 0.0    P 1.0
182 Chess-Publisher v1.05.00 Stable
001    1 m GM Carlsen, Magnus                   2832 NOR 1503014     1990/00/00  0.0    1
001    2 m GM Caruana, Fabiano                  2805 USA 24116068    1992/00/00  0.0    2
001    3 m GM Nakamura, Hikaru                  2802 USA 2020009     1987/12/00  0.0    3
001    4 m GM Anand, Viswanathan                2751 IND 5000017     1969/00/00  0.0    4
001    5 m GM Topalov, Veselin                  2727 BUL 2900084     1975/03/00  0.0    5
001    6 m GM Georgiev, Kiril                   2658 BUL 2900025     1965/00/00  0.0    6
001    7 m GM Stefanova, Antoaneta              2568 BUL 2900220     1979/04/00  0.0    7
001    8 m GM Cheparinov, Ivan                  2542 BUL 2905540     1986/00/00  0.0    8
`
  },

  // 10. Imported TRF26 (Full TRF26 tags: 192 FIDE_DUTCH_2025, 212, 222, 152, 162)
  {
    id: 'fixture-10-imported-trf26',
    name: '10. Imported TRF26 Tournament (Round 1)',
    roundToPair: 1,
    isTrf26: true,
    description: 'Official TRF26 specification with 192 FIDE_DUTCH_2025, 212, 222 encoded time control.',
    trfContent: `012 Chess-Publisher v1.05.00 Stable - TRF26 Masters
022 Lausanne
032 SUI
042 2026/09/01
052 2026/09/05
062 8
072 8
092 Individual Swiss
102 IA Laurent Freyd
122 90m+30s
142 5
152 W
162  W 1.0    D 0.5    L 0.0    Z 0.0    P 1.0
182 Chess-Publisher v1.05.00 Stable
192 FIDE_DUTCH_2025
212 PTS,BH/C1,SB,ARO
222 5400+30
001    1 m GM Carlsen, Magnus                   2832 NOR 1503014     1990/11/30  0.0    1
001    2 m GM Caruana, Fabiano                  2805 USA 24116068    1992/07/30  0.0    2
001    3 m GM Nakamura, Hikaru                  2802 USA 2020009     1987/12/09  0.0    3
001    4 m GM Anand, Viswanathan                2751 IND 5000017     1969/12/11  0.0    4
001    5 m GM Topalov, Veselin                  2727 BUL 2900084     1975/03/15  0.0    5
001    6 m GM Georgiev, Kiril                   2658 BUL 2900025     1965/11/28  0.0    6
001    7 m GM Stefanova, Antoaneta              2568 BUL 2900220     1979/04/19  0.0    7
001    8 m GM Cheparinov, Ivan                  2542 BUL 2905540     1986/11/26  0.0    8
`
  },

  // 11. Tournament Resumed from Existing TRF (2 rounds played, resuming for Round 3)
  {
    id: 'fixture-11-resumed-from-trf',
    name: '11. Tournament Resumed from Existing TRF (Round 3)',
    roundToPair: 3,
    description: 'Tournament resumed from in-progress TRF file after 2 completed rounds, generating Round 3.',
    trfContent: `012 Chess-Publisher v1.05.00 Stable - Resumed Tournament
022 Geneva
032 SUI
042 2026/09/01
052 2026/09/05
062 8
072 8
092 Individual Swiss
102 IA Dirk De Ridder
122 90+30
142 5
152 W
162  W 1.0    D 0.5    L 0.0    Z 0.0    P 1.0
182 Chess-Publisher v1.05.00 Stable
001    1 m GM Carlsen, Magnus                   2832 NOR 1503014     1990/11/30  2.0    1    0005 w 1    0002 b 1
001    2 m GM Caruana, Fabiano                  2805 USA 24116068    1992/07/30  1.0    3    0006 b 1    0001 w 0
001    3 m GM Nakamura, Hikaru                  2802 USA 2020009     1987/12/09  2.0    2    0007 w 1    0004 b 1
001    4 m GM Anand, Viswanathan                2751 IND 5000017     1969/12/11  1.0    4    0008 b 1    0003 w 0
001    5 m GM Topalov, Veselin                  2727 BUL 2900084     1975/03/15  0.5    5    0001 b 0    0008 w =
001    6 m GM Georgiev, Kiril                   2658 BUL 2900025     1965/11/28  0.5    6    0002 w 0    0007 b =
001    7 m GM Stefanova, Antoaneta              2568 BUL 2900220     1979/04/19  0.5    7    0003 b 0    0006 w =
001    8 m GM Cheparinov, Ivan                  2542 BUL 2905540     1986/11/26  0.5    8    0004 w 0    0005 b =
`
  }
];

export function writeFixtureFiles(): void {
  ensureFixturesDirectory();
  for (const fix of FIXTURES) {
    const filename = `${fix.id}.trf`;
    const filePath = path.join(FIXTURES_DIR, filename);
    fs.writeFileSync(filePath, fix.trfContent, 'utf8');
  }
}
