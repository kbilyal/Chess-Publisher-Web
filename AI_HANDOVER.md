# Chess-Publisher Web – предаване на работата

24 ноември 2026 г. · Кандидатът е в локалния клон `codex/production-parity-2026-11-24` на `kbilyal/Chess-Publisher-Web`, изграден върху `d8e8589c86fb0d8e8ddfa289e61f194950e6747a`. Статусът и тестовите доказателства са в [Production Parity Matrix](PRODUCTION_PARITY.md).

## Хранилища и внедряване

- Публичният сайт и `/app/` се генерират от `deploy/public-site/` в `Chess-Publisher-Web` и се публикуват в Cloudflare Worker `white-meadow-8069`. Работният плот на браузърния портал се изгражда от закрепения Desktop източник `a12084883fa8bd84f09a678e53f288cf780060fa` с Web адаптери. Сървираното заглавие е Chess-Publisher v1.06.00.
- Arbiter Companion се изгражда с Vite от същото Web хранилище и се публикува в GitHub Pages. Google сесията се подновява през Hub API. Organizer Token се предава от Web работното пространство по установения междудомейнов поток. Поканите за конкретен арбитър остават самостоятелен вход.
- `api.chess-publisher.org` обслужва Hub API с Cloudflare Worker, D1 и B2. Работното пространство използва Google cookie или Organizer Bearer Token. HMAC bridge token е отделен от Google cookie и се използва за Chess-Results Worker. Cloud Workspace има организаторски обхват и проверки за ревизия. Локалните браузърни хранилища имат отделни пространства по акаунти.
- `kbilyal/ChessPublisher-Web-Full` има самостоятелен Linux pairing preview, build и проверяващ workflow. Локалният `65ffad8852b8d9d37d402ad649de0f5891b20724` съдържа пакетирано копие на Hub API и Web адаптери. Публичният release workflow е в другото хранилище. Сервираните `host.js`, `login.mjs` и `workspace.css` съвпадат с публичния Git commit и се различават от Web Full. `autosave.js`, `engine-adapter.js` и `login.css` имат еднакви Git blobs в двата източника.
- Създадени са локални контролни точки `codex/production-parity-checkpoint-2026-11-24` в двете хранилища. Web Full остава на `65ffad8`, а първоначалният Companion checkout остава на `763c3f6` със своите незаписани файлове. Кандидатът е в отделен checkout върху последния `origin/main`. Между `779b78b` и `d8e8589` има единствено обновен диагностичен отчет.

## Корекция

- `deploy/public-site/desktop-web/host.js` запазва реда local save → cloud autosave flush → потвърждение от logout API → изчистване на сесията и връщане към входа. При грешка статусът показва повторен опит и отключва бутона.
- `deploy/public-site/desktop-web/login.mjs` и `login.html` дават същото поведение в акаунт панела, с достъпно съобщение при отказ. Потвърждението изисква успешно HTTP състояние и `ok: true`, а заявката има ограничение от осем секунди.
- `tests/ui/companion-web-entry-smoke.mjs` покрива HTTP 503 в работното пространство, HTTP 200 с `ok: false` в акаунт панела, запазването на сесията при отказ и успешно повторение. Същият тест запазва обхвата за Google SSO, Organizer Token, изолирани fixture данни и мобилна навигация в Companion.
- `AGENTS.md`, `AI-HANDOFF.md`, `AI_HANDOVER.md`, `PROJECT-STATE.md`, `NEXT-TASK.md`, `INTEGRATION-STATUS.json` и `PRODUCTION_PARITY.md` описват базата, локалната промяна и критериите за внедряване.
- Последващата локална корекция запазва потвърдения изход и на публичната начална страница. Google входът и изходът известяват другите `/app/` табове. Старото работно пространство изчиства сесията си при сменен потребител или организатор. Chromium fixture проверява два Google профила в един браузър, без споделяне на локален namespace и частни турнири.
- Съвместимите npm обновявания в `package-lock.json` свалиха Critical и High до нула. Разрешеният тестов snapshot `d44680c` премина Architecture 34/34, Desktop–Web Parity 11/11, Cloud roundtrip, lint, build и браузърния тест на Ubuntu. [GitHub Actions](https://github.com/kbilyal/Chess-Publisher-Web/actions/runs/45469723648)
- Web Full запазва `65ffad8` и локалните auth корекции. 41/41 изолирани теста преминаха. Оригиналният Worker остава отделен от release кандидата за публичния сайт. Одитът на дифа и ограниченията за миграция са в [Production Parity Matrix](PRODUCTION_PARITY.md).

## Следваща проверка и rollback

Freeze Guard отчита различни Git blobs за `src/cloud/OnlineCloudProviderV2.tsx` и `src/cloud/cloudWorkspaceApi.ts` още на `origin/main`. Двата pinned blob-а съвпадат с родителя на SSO commit `e75dfd6`. Останалите девет съвпадат с freeze manifest, а checker provenance и phantom-conflict тестовете преминават. Смяната на одобрената SYNC база изисква изрично потвърждение и реален Desktop–Web/Cloud тест. Пинът и манифестът са запазени в кандидата.

Последната проверка на live `/app/` потвърди Google GIS и Organizer Token входовете. Два реални тестови Google акаунта не са налични. Реалният вход, смяната на акаунти, изолацията и Desktop–Web/Cloud roundtrip остават отворени. Workflow `Deploy Public Website` се задейства за промени в `deploy/public-site/` при push на `main`. Companion и Hub API имат отделни deployment потоци.

Преди release запиши активната 100% версия на Worker-а. За проверената базова линия тя е `cdc1ee6b-843c-444d-ba76-1c3a22e4abad`. При регресия след бъдещ release върни тази или непосредствено предходната потвърдена версия през стандартния Cloudflare rollback и повтори публичните smoke проверки. Кандидатът съдържа промяна в клиентските файлове, без миграции на D1 или операции по B2.
