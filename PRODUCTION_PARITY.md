# Production Parity Matrix

The [final SYNC verification report](docs/FINAL-SYNC-VERIFICATION-2026-11-24.md) records the follow-up local changes, current evidence, and remaining release blockers.

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
| Autosave и Cloud Sync | WARNING · Cloud Workspace Integration и Unified SYNC Phantom Conflict са успешни за публичния commit, Freeze Guard е FAIL | PASS · локални fixture записи, ревизии, отказ при 401/403 и сериализация. Freeze и реалният междусистемен тест остават блокери |
| HMAC Bridge Token | WARNING · read-only audit потвърди маршрута. Няма обмен с реална тестова сесия | PASS · изолирано издаване и проверка на токена. Browser transport е с fixture |
| Account Switching | NOT VERIFIED · реална смяна между два тестови Google акаунта | PASS в Chromium · два Google профила в един браузър, изход от стария таб, различни namespaces, отделен Cloud списък и 404 за чужд турнир |
| Sign Out | FAIL · regression test върху чистия production източник възпроизвежда фиктивен успех при отказ от Hub API | PASS в публичния сайт и `/app/` · HTTP 503 и `ok: false`, сесията остава и повторението завършва изхода |
| LocalStorage | NOT VERIFIED · няма вход в production | PASS · namespacing, изчистване при изход и browser persistence с fixture |
| IndexedDB | NOT VERIFIED · няма вход в production | PASS · разделяне по обхват и FIDE cache активиране, rollback и reload |
| Arbiter Companion | PASS · GitHub Pages, публична входна страница и точни имена на live bundles | PASS · Chromium Google и token handoff, избор на турнир, меню, reload и sign-out |
| Chess-Results Integration | WARNING · известен успешен deployment. Няма нова публикация към външния доставчик | PASS · локални contract/transport проверки и синтетична публикация в Chromium |
| Registration | WARNING · предходният deploy browser smoke е успешен | PASS · четирима синтетични участници и player parity suite |
| Starting List | WARNING · предходният deploy browser smoke е успешен | PASS · resort, player parity, PDF преглед и печат |
| Pairings | PASS · съществуващият production build премина native Architecture и Desktop–Web Parity | PASS · Architecture 34/34 и Desktop–Web Parity 11/11 на Ubuntu |
| Standings | WARNING · предходният deploy browser smoke е успешен | PASS · локални standings, класиране и TXT/PDF сценарии |
| Tie-Break Checkers | NOT VERIFIED · текуща автентикирана проверка | PASS · локални tie-break / checker suites и native BBP във fixtures на Linux |
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
- Повторното сравнение потвърди `origin/main` на `d8e8589`, live Companion build `779b78b` и същия production commit за шестте изтеглени `/app/` assets `host.js`, `login.mjs`, `login.css`, `workspace.css`, `autosave.js` и `engine-adapter.js`. Реален Chromium с чист профил зареди Google GIS бутона и Organizer Token входа. [Live Companion build](https://web.chess-publisher.org/companion-build-info.json)
- `npm ci`, `npm run lint` и `npm run build` преминаха. Browser runtime и порталът са изградени с пиновете от release скриптовете. Генерираният портал премина TRF26 rating export и 16/16 FIDE eligibility.
- Предходната Windows проверка покри 20 командни suites. Разрешеният тестов клон `codex/final-gate-linux-2026-11-24` изпълни `test:arch` 34/34 и `test:parity` 11/11 на Ubuntu с реалните Gacrux и BBP. GitHub Actions изпълни и lint, FIDE, Cloud roundtrip, build и Chromium. Последният тестов snapshot е `d44680c`. Workflow има само `contents: read`. [Linux validation](https://github.com/kbilyal/Chess-Publisher-Web/actions/runs/45469723648)
- В Web Full 41/41 локални теста за Hub auth, CORS/CSRF, изолация, bridge, HTTP authorization, autosave и UI преминаха. Windows опитът за целия suite на изходната версия показа девет непреминали случая при недостъпни Linux binaries. Историческият GitHub run на Web Full `origin/main` премина native suite и Docker smoke. Същият пълен run върху локалния Web Full кандидат остава непотвърден. [Web Full baseline CI](https://github.com/kbilyal/ChessPublisher-Web-Full/actions/runs/45266395510)
- Каноничният npm lockfile разрешава `proxy-addr` 2.0.8, `body-parser` 1.20.9, `adm-zip` 0.6.1, `source-map-js` 1.2.4 и `vite` 6.4.6. Съвместими версии на Express 4 и `qs` премахнаха свързаните advisory записи. `npm audit` и `npm audit --omit=dev --audit-level=high` дават 0 Critical, 0 High и един Low за `fast-xml-parser`. Web Full дава 0 общо. Използвани са съществуващите dependency диапазони.
- Синтетичният browser regression за Web Sign Out даде FAIL върху production източника и PASS върху кандидата. Browser fixtures обслужваха API заявките без запис в production. Няма използвани реални данни на потребители.
- Login fixture потвърди, че забавен отговор от Google конфигурацията не презаписва грешка при Organizer Token. Формата разрешава submit след инсталиране на JavaScript обработчика.
- Пълният `desktop-web/smoke.mjs` премина при локално обслужване на production пътя `/app/`. Проверени са осем таба на пет ширини, Chess-Results retry, Admin и Upload Data, Baku pairing, autosave, спиране при 401, restore и touch FIDE контрол. Отделните smoke проверки за FIDE cache и TXT/PDF печат също преминаха.
- В Chromium са проверени публичните страници на 390 и 1440 px, както и пренасочването при директен вход към workspace без сесия. Ширината на съдържанието съвпадна с viewport и в двата размера. Предходното измерване на patch-а само за logout отчете еднаква геометрия и медиана на DOMContentLoaded от 25,3 → 32,5 ms на 390 px и 36,4 → 34,6 ms на 1440 px. Измерването е локално със седем студени зареждания на вариант и блокирани външни заявки. Генерираният workspace HTML и stylesheet са байт по байт еднакви между двата build-а в онова сравнение.
- Публичната FIDE проверка `45408451022` е FAIL от timeout към официалния FIDE сървър. Локалният FIDE cache smoke и rating suites преминаха. [GitHub Actions run 45408451022](https://github.com/kbilyal/Chess-Publisher-Web/actions/runs/45408451022)

## Причина за разминаването в защитения SYNC

| Файл | Одобрена beta.96 r4 база | Production и `origin/main` |
| --- | --- | --- |
| `src/cloud/OnlineCloudProviderV2.tsx` | `c1e2e4a4882fc4c5e48686fdaef0108ddf96d140` | `71aa6dda90567e21e636a81b302d32ffc2d9cb1c` |
| `src/cloud/cloudWorkspaceApi.ts` | `f6adbfb385a61d2daf5702935f912dc89d350975` | `ed081163181082449605e1cef3631b00ad1d1dd1` |

И двете разлики за първи път се появяват в SSO commit `e75dfd6`. Provider-ът добавя Google resume, cookie auth, bridge state и изчистване на локалния турнир при смяна на организатор. API клиентът сменя Hub origin, включва cookies и добавя auth маршрути. Сравнението с frozen blobs показва 138/11 реда в Provider и 14/2 в API клиента. Hash-овете на останалите девет записа съвпадат. Checker provenance и phantom-conflict регресиите преминават отделно. Официалният Freeze Guard остава FAIL в LF checkout до одобрение и повторна Desktop–Web/Cloud проверка в реална среда. [SSO commit](https://github.com/kbilyal/Chess-Publisher-Web/commit/e75dfd6882af74ed74db04d3dc8d55dde5048f26) · [Freeze Guard](https://github.com/kbilyal/Chess-Publisher-Web/actions/runs/45389748752)

## Одит на Web Full `65ffad8`

Оригиналният диф спрямо `9fdd805` обхваща 17 файла, 12 319 добавени и 39 премахнати реда. От тях 8 868 са копието на Hub Worker, 1 353 са auth, CORS, cache и миграция, 1 195 са тестове, 853 са клиентският код и Express transport, а 50 са конфигурация. Worker промените обхващат също публичния Hub, администрация, Arbiter достъп, частен Cloud, revisions, публикуване и B2. Защитените шахматни файлове, двигателите, пиновете и release workflow файловете са извън дифа.

- Локалните корекции изискват потвърден logout, ограничават bridge credential до Chess-Results origin и неговите API маршрути, запазват Request метода и тялото и извличат само `cp_session` за Express authorization. Hub копието проверява предназначението на сесията и отхвърля невалидно тяло при издаване на Desktop ключ. Fixture тестовете упражняват тези граници.
- Пакетираният Worker е отделен от публичния кандидат. `wrangler.toml` сочи real Worker, custom domain и D1. Миграцията очаква съществуващи таблици и неприлагани `user_id` колони. Реалната съвместимост на D1 миграцията и пълно съвпадение на копието с действащия Worker остават непотвърдени. Изолираните проверки не доказват deploy или rollback на този Worker.
- Локална SQLite проверка с действителната миграция потвърди конфликт при свързване на legacy организатор към Google профил, който вече има собствен организатор. Уникалният индекс върху `organizers.user_id` спира присвояването. Прехвърлянето на ownership изисква отделно потвърждение за съдбата на турнирите, ревизиите, настройките и Desktop ключовете от двата организатора.
- В копието остават отделни рискове за евентуален Worker release. Stateless logout изтрива cookie без server-side отзоваване. Hard-delete търси R2 bindings и не чисти B2 файловете. При запис на Cloud snapshot се сваля предишният B2 обект за проверка на еквивалентно съдържание преди revision отказ. Това е свързано с действащата защита срещу phantom conflicts и изисква проверка преди промяна.

## Pre-Deployment Final Gate

| Критерий | Статус | Доказателство или блокер |
| --- | --- | --- |
| Production Feature Parity | NOT VERIFIED | Няма автентикиран production sweep |
| Functional Integrity | WARNING | Native и fixture проверките са успешни. Реалните Cloud операции остават непотвърдени |
| UI Regression | PASS | Локални Chromium smoke, responsive и сравнение на assets |
| Authentication | NOT VERIFIED | Google GIS се зарежда в production. Две синтетични самоличности, legacy token и отказ при logout са проверени. Няма тестови Google акаунти за реален вход |
| User Isolation | NOT VERIFIED | Chromium потвърждава две fixture самоличности в един браузър. Реалният Cloud за две самоличности остава непотвърден |
| Security | PASS за npm gate | 0 Critical и 0 High в пълен и production npm audit |
| Cloud Sync | NOT VERIFIED | Локални Cloud suites са успешни. Реален междусистемен тест остава за одобрения SYNC процес |
| Autosave | PASS | Изолирани Web Full safety и локални browser fixture проверки |
| Data Integrity | WARNING | Транзакции, finalization и Cloud fixtures са успешни. Реална recovery проверка липсва |
| Protected Core Integrity | FAIL | Freeze Guard отчита `OnlineCloudProviderV2.tsx` и `cloudWorkspaceApi.ts`. Кандидатът няма промени в двата файла или в манифеста |
| Performance | WARNING | Локално измерване на входа и размерите на assets. Production load тест липсва |
| Build | PASS | Vite/Node и генерираният Web портал са изградени |
| Regression Tests | FAIL | Native Linux suites преминаха. Freeze Guard остава FAIL |
| Deployment Readiness | FAIL | Freeze Guard и непотвърдените реални Google/Cloud потоци блокират release |

**FINAL GATE: FAIL.** Кандидатът и корекциите в Web Full са запазени локално. Изпратени са само разрешените тестови snapshot commits към отделен клон. Production версиите и main клоновете остават на проверените бази.
