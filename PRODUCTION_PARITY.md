# Production Parity Matrix

24 ноември 2026 г. · Публична базова линия `779b78b533b8338e1114816e6fb3828bcd35c4d2`. Локалният кандидат е върху `d8e8589c86fb0d8e8ddfa289e61f194950e6747a`.

## Git и production

| Компонент | Източник | Наблюдавано състояние |
| --- | --- | --- |
| Публичен сайт, Web портал и Tournament Hub | `Chess-Publisher-Web/main`, `779b78b` | Cloudflare версия `cdc1ee6b-843c-444d-ba76-1c3a22e4abad`, 100%. [Deploy Public Website 45389748925](https://github.com/kbilyal/Chess-Publisher-Web/actions/runs/45389748925) · [Verify public Hub 45390147362](https://github.com/kbilyal/Chess-Publisher-Web/actions/runs/45390147362) |
| Arbiter Companion | `Chess-Publisher-Web/main`, `779b78b` | GitHub Pages deployment `8027240849`, success. Имената на живите JS и CSS bundles съвпадат с локалния production build. [Run 45389748800](https://github.com/kbilyal/Chess-Publisher-Web/actions/runs/45389748800) |
| Hub API | Cloudflare `chess-publisher-hub-api-beta` | Версия 82, `e0d3be98-f055-4673-b729-70d0f55dcb72`, 100%. Git SHA на активната версия остава NOT VERIFIED. Последният успешен основен Hub API workflow от `ddf318ce` и Freeze baseline от `b2ad2cba` са исторически записи. Независимият read-only audit потвърди auth, bridge и cloud маршрути в живия код. [Hub deploy 34261713466](https://github.com/kbilyal/Chess-Publisher-Web/actions/runs/34261713466) · [SYNC Worker 34516377753](https://github.com/kbilyal/Chess-Publisher-Web/actions/runs/34516377753) · [Audit 45463740186](https://github.com/kbilyal/Chess-Publisher-Web/actions/runs/45463740186) |
| Chess-Results Worker | `Chess-Publisher-Web` | Активна Cloudflare версия `318f3431-0ef1-460f-92c4-c7ca973bb2ca` на 100%. Последен успешен workflow за `84f31450744b556fec12e150a30b293c09a223cf`. [Run 45064157758](https://github.com/kbilyal/Chess-Publisher-Web/actions/runs/45064157758) |
| Web Full | `ChessPublisher-Web-Full/origin/main` | Remote `9fdd8050a7b3ede30342c87f80946728bb698ffe`, локален връх `65ffad8852b8d9d37d402ad649de0f5891b20724`, 1 commit напред. Последният локален commit е идентифициран по съдържание. Git авторът `kbilyal` сам по себе си не доказва кой агент го е създал. [Verify Web Full 45266395510](https://github.com/kbilyal/ChessPublisher-Web-Full/actions/runs/45266395510) |
| Защитен SYNC | `Chess-Publisher-Web/main` | Публичният deployment commit и локално провереният `origin/main` се разминават с одобрения Freeze по два Git blobs. [Freeze Guard 45389748752](https://github.com/kbilyal/Chess-Publisher-Web/actions/runs/45389748752) |

Сервираните `/app/host.js`, `/app/login.mjs`, `/app/login.css` и `/app/workspace.css` съвпадат байт по байт с blobs от публичния deployment commit. Живият и локално генерираният `workspace.html` имат еднакъв SHA-256 след нормализиране на редовете, cache ключовете и добавения Cloudflare скрипт. Кандидатът е изграден от каноничния Web checkout. Локалният Web Full commit и работното дърво са отделни контролни точки.

## Функционалности

**PASS** се отнася до посоченото доказателство. **WARNING** обозначава ограничен обхват или остатъчен риск. **NOT VERIFIED** означава, че пълният поток за съответната среда не е изпълнен.

| Функционалност | Production преди промяната | Локален кандидат |
| --- | --- | --- |
| Google Authentication и SSO | WARNING · конфигурацията и анонимното `/api/auth/me` отговарят, реален вход не е изпълнен | PASS · Chromium с Google fixture, cookie сесия и продължаване към Companion |
| Индивидуално Cloud пространство | NOT VERIFIED · операция с реален тестов акаунт липсва | PASS · Cloud roundtrip и изолирани синтетични данни |
| User Isolation | NOT VERIFIED · две production тестови самоличности | PASS · двама Google потребители в изолираната Worker suite и проверка на обхвата на браузърното хранилище |
| Autosave и Cloud Sync | WARNING · Cloud Workspace Integration и Unified SYNC Phantom Conflict са успешни за публичния commit, Freeze Guard е FAIL | PASS · локални fixture записи, ревизии, отказ при 401/403 и сериализация. Freeze е отделен блокер |
| HMAC Bridge Token | WARNING · read-only audit потвърди маршрута. Няма обмен с реална тестова сесия | PASS · изолирано издаване и проверка на токена. Browser transport е с fixture |
| Account Switching | NOT VERIFIED · реална смяна между два тестови Google акаунта | WARNING · синтетичен Google и Organizer Token вход в отделни контексти, отделна проверка на namespaces |
| Sign Out | FAIL · regression test върху чистия production източник възпроизвежда фиктивен успех при отказ от Hub API | PASS · HTTP 503 и `ok: false`, сесията остава и повторението завършва изхода |
| LocalStorage | NOT VERIFIED · няма вход в production | PASS · namespacing, изчистване при изход и browser persistence с fixture |
| IndexedDB | NOT VERIFIED · няма вход в production | PASS · разделяне по обхват и FIDE cache активиране, rollback и reload |
| Arbiter Companion | PASS · GitHub Pages, публична входна страница и точни имена на live bundles | PASS · Chromium Google и token handoff, избор на турнир, меню, reload и sign-out |
| Chess-Results Integration | WARNING · известен успешен deployment. Няма нова публикация към външния доставчик | PASS · локални contract/transport проверки и синтетична публикация в Chromium |
| Registration | WARNING · предходният deploy browser smoke е успешен | PASS · четирима синтетични участници и player parity suite |
| Starting List | WARNING · предходният deploy browser smoke е успешен | PASS · resort, player parity, PDF преглед и печат |
| Pairings | WARNING · предходният deploy browser smoke е успешен | WARNING · browser Gacrux pairing и UI са проверени, native Linux suites под Windows се провалят |
| Standings | WARNING · предходният deploy browser smoke е успешен | PASS · локални standings, класиране и TXT/PDF сценарии |
| Tie-Break Checkers | NOT VERIFIED · текуща автентикирана проверка | PASS · локални tie-break / checker suites. Native BBP qualification е отделна |
| TRF16 | NOT VERIFIED · текуща автентикирана проверка | PASS · локална TRF regression suite |
| TRF26 | WARNING · проверка при предходния build | PASS · TRF regression, rating export, final-place policy и Fast Classical |
| Pairings TXT Export | WARNING · проверка при предходния deploy | PASS · съвпадение на preview, download и print |
| Standings TXT Export | WARNING · проверка при предходния deploy | PASS · съвпадение на preview, download и print |
| Printing | WARNING · текущата проверка е с публичния браузър без сесия | PASS · A4, многостраничен PDF, отделни редове и мобилни export контроли |
| Tournament Publishing | WARNING · публичният Hub е достъпен, реална тестова публикация липсва | PASS · локални Hub snapshot/publication и transport fixtures |
| Tournament Statuses | PASS · публичен списък и проверен календарен коректор | PASS · промяната се наслагва върху проверената календарна реализация |
| Актуален UI/UX и responsive | PASS · достъпни публични страници и идентифициран жив stylesheet | PASS · генерираните workspace HTML и CSS са идентични спрямо локалната база. Chromium проверява UI геометрия и mobile |
| Бутони, табове и взаимовръзки | WARNING · предходният deploy smoke и публичният UI са достъпни | WARNING · осем таба и критичните пътища участват в smoke. Пълен workflow за всяко действие не е изпълнен |
| FIDE Cache, Fast Classical, Smart Schedule | WARNING · предходният deploy smoke е успешен, планираният refresh run е FAIL | PASS · cache, eligibility, schedule, rating export и FIDE suites |
| My Tournaments, директни линкове и Organizer Token | WARNING · публичните входове и защита без сесия са налични | PASS · Chromium Google/token, турнирни линкове, филтриране и безопасно продължаване |
| PDF диалози и Arbiter sheet | WARNING · предходният deploy smoke е успешен | PASS · Starting List, Pairings, Standings и Arbiter sheet в Chromium |
| Издаване на Desktop API ключ от Web | NOT VERIFIED · изисква тестова Google сесия | PASS · локален Hub Worker fixture. Проверка в production остава открита |
| PWA и offline стартиране на Companion | NOT VERIFIED · публичният зареждащ се екран е проверен онлайн | NOT VERIFIED · browser smoke е със спрени service workers |

## Изпълнени проверки

- Публични `/`, `/app/`, `/tournaments` и Companion върнаха HTTP 200. API `/` връща `404 not_found`, `/api/v1/health` върна HTTP 200 с D1/B2 и API v1, `/api/auth/me?optional=1` върна HTTP 200 без сесия, а частният workspace върна 401. [Публичен сайт](https://chess-publisher.org/) · [Web портал](https://chess-publisher.org/app/) · [Tournament Hub](https://chess-publisher.org/tournaments) · [Arbiter Companion](https://web.chess-publisher.org/) · [Hub health](https://api.chess-publisher.org/api/v1/health)
- `npm ci`, `npm run lint` и `npm run build` преминаха. Browser runtime и порталът са изградени с пиновете от release скриптовете. Генерираният портал премина TRF26 rating export и 16/16 FIDE eligibility.
- Преминаха 20 от 22 командни suites в каноничното Web хранилище. Сред тях са транзакции, finalization, FIDE, TRF, tie-break/checker, online-cloud, Chess-Results, Cloud roundtrip и tournament import. FIDE suite премина с `unzip` от Git for Windows. Четири защитаващи hashes suites преминаха в чист LF checkout. `test:arch` и `test:parity` се провалиха при изпълнение на native Linux бинарните файлове под Windows.
- Web Full `npm test` завърши 41/50 на Windows. Девет native engine случая се провалиха при недостъпен Linux engine. Отделното изпълнение на изолираните Hub auth, CORS/CSRF, isolation, bridge token, authorization, concurrency, autosave и UI suites завърши 39/39. Linux container build за локалния Web Full commit остава NOT VERIFIED.
- `npm audit --omit=dev --audit-level=high` отчете 7 наследени записа, включително 4 high и 1 critical. Записите обхващат `adm-zip`, `body-parser`, `fast-xml-parser`, `proxy-addr`, `qs`, `source-map-js` и `vite`. Кандидатът е изграден със същия lockfile.
- Синтетичният browser regression за Web Sign Out даде FAIL върху production източника и PASS върху кандидата. Browser fixtures обслужваха API заявките без запис в production. Няма използвани реални данни на потребители.
- Пълният `desktop-web/smoke.mjs` премина при локално обслужване на production пътя `/app/`. Проверени са осем таба на пет ширини, Chess-Results retry, Admin и Upload Data, Baku pairing, autosave, спиране при 401, restore и touch FIDE контрол. Отделните smoke проверки за FIDE cache и TXT/PDF печат също преминаха.
- В Chromium са проверени публичните страници на 390 и 1440 px, както и пренасочването при директен вход към workspace без сесия. Ширината на съдържанието съвпадна с viewport и в двата размера. Локалните login изгледи имат еднаква геометрия преди и след patch-а. При 7 студени зареждания на вариант медианата на DOMContentLoaded е 25,3 → 32,5 ms на 390 px и 36,4 → 34,6 ms на 1440 px. Измерването е локално с блокирани външни заявки и не установява системен ефект. Трите променени browser assets добавят общо 840 байта в локалния build. Генерираният workspace HTML и stylesheet са байт по байт еднакви между двата build-а.
- Публичната FIDE проверка `45408451022` е FAIL от timeout към официалния FIDE сървър. Локалният FIDE cache smoke и rating suites преминаха. [GitHub Actions run 45408451022](https://github.com/kbilyal/Chess-Publisher-Web/actions/runs/45408451022)

## Pre-Deployment Final Gate

| Критерий | Статус | Доказателство или блокер |
| --- | --- | --- |
| Production Feature Parity | NOT VERIFIED | Няма автентикиран production sweep |
| Functional Integrity | WARNING | Покритите fixture потоци са успешни. Native и реални Cloud проверки остават открити |
| UI Regression | PASS | Локални Chromium smoke, responsive и сравнение на assets |
| Authentication | NOT VERIFIED | Синтетичните Google, legacy token и отказ при logout са проверени. Реален вход и account switching остават открити |
| User Isolation | NOT VERIFIED | Два синтетични потребителя са проверени изолирано. Няма две production тестови самоличности |
| Security | FAIL | Наследени high/critical audit записи |
| Cloud Sync | NOT VERIFIED | Локални Cloud suites са успешни. Реален междусистемен тест остава за одобрения SYNC процес |
| Autosave | PASS | Изолирани Web Full safety и локални browser fixture проверки |
| Data Integrity | WARNING | Транзакции, finalization и Cloud fixtures са успешни. Реална recovery проверка липсва |
| Protected Core Integrity | FAIL | Freeze Guard отчита `OnlineCloudProviderV2.tsx` и `cloudWorkspaceApi.ts`. Кандидатът няма промени в двата файла или в манифеста |
| Performance | WARNING | Локално измерване на входа и размерите на assets. Production load тест липсва |
| Build | PASS | Vite/Node и генерираният Web портал са изградени |
| Regression Tests | FAIL | Native Linux suites и проверки на защитената базова линия блокират release |
| Deployment Readiness | FAIL | Публикуване е блокирано от Freeze, security и непроверени критични production потоци |

**FINAL GATE: FAIL.** Кандидатът е запазен в локалния checkout. Разрешението за commit, push и deployment е обвързано с PASS, затова няма финален commit или нов deployment run. Production проверките по-горе отразяват съществуващите версии.
