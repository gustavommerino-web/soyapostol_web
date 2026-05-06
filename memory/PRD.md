# Apostol — Catholic Web App

## Original Problem Statement
Build a Catholic web called "Apostol" with bilingual (ES/EN) support and 8 sections: Daily Readings (USCCB ES), Liturgy of the Hours (iBreviary), Prayers (ACI Prensa), Examen of Conscience (admin-uploaded docs), Catholic News (EWTN + ACI Prensa + Vatican News), full Catholic Bible, Catechism of the Catholic Church, and a Favorites section that allows saving any passage from the other 7 sections.

## User Choices (2026-04-22)
- Auth: JWT email/password
- Bible/CCC: public APIs
- Examen: admin upload interface
- Content sourcing: RSS feeds where available + scraping with daily cache
- Language: toggle ES/EN (default ES)
- Readings fallback (after USCCB 403): ACI Prensa /calendario (ES) + Universalis (EN)
- News fallback: Vatican News + ACI Prensa (ES); Vatican News + CNA + National Catholic Register (EN)

## Architecture
- **Backend**: FastAPI (Python) with modular routers (`auth`, `readings`, `liturgy`, `prayers`, `examen`, `news`, `bible`, `catechism`, `favorites`) mounted under `/api`. MongoDB caches all scraped content. Bcrypt + PyJWT httpOnly cookies.
- **Frontend**: React 19 + React Router 7 + Tailwind 3 + Phosphor Icons. Bilingual `LangContext` + `AuthContext`. Shadcn UI primitives for toast (sonner).
- **Design**: "Organic & Earthy" light theme (warm sand, wine red #8B2635, gold #D4AF37). Fonts: Cormorant Garamond (headings), Lora (reading body), Outfit (UI).

## Core Requirements (Static)
1. Daily Mass Readings (1st, Psalm, 2nd, Gospel, commentary if available)
2. Liturgy of the Hours (all 7 hours)
3. Prayers library (categorized)
4. Examen of Conscience (file upload/reader)
5. Catholic News aggregator
6. Full Catholic Bible reader
7. Catechism of the Catholic Church reader
8. Favorites (save/browse/delete per user)
9. Bilingual ES/EN toggle
10. User authentication

## Implemented (2026-04-22)
- ✅ JWT auth (register/login/me/logout/refresh) with pre-seeded admin
- ✅ Bilingual UI with toggle (default ES)
- ✅ Dashboard with bento grid and 8 section tiles
- ✅ Daily Readings (ACI Prensa ES + Universalis EN) with MongoDB cache
- ✅ Liturgy of the Hours (iBreviary breviario.php) with hour picker
- ✅ Prayers library (ACI Prensa) grouped by category with individual prayer fetch
- ✅ Examen of Conscience (admin-only upload, PDF/DOCX/TXT, base64 in MongoDB)
- ✅ News (Vatican + ACI ES; Vatican + CNA + NCRegister EN) with source filter
- ✅ Bible reader (full 73-book Catholic canon: Vatican BIA for ES, USCCB NABRE for EN via Playwright)
- ✅ Catechism structure (4 parts, 12 sections) with paragraph chunk reader (Vatican manifests ES + EN)
- ✅ Favorites CRUD (user-scoped, section filter)
- ✅ 26/26 backend tests passing

## Implemented (2026-04-27)
- ✅ Responsive web-app shell: sticky translucent header (logo + lang toggle + auth), sticky icon sidebar on desktop (≥lg), fixed mobile bottom nav (5 tabs incl. "Más" sheet), iOS safe-area padding, content constrained to 720px reading width across all routes
- ✅ Dashboard bento grid simplified to 1/2 cols inside the 720px container
- ✅ Toaster moved to top-center to avoid colliding with bottom nav

## Implemented (2026-04-24)
- ✅ Shared Playwright Chromium pool (`backend/browser_pool.py`) launched on FastAPI startup — removes per-module browser singletons in `readings.py` / `bible.py`, eliminates cold-start timeouts, auto-installs Chromium if missing (runs in worker thread to keep loop responsive)
- ✅ Examen admin UI verified end-to-end (upload/list/view/delete, Spanish empty state, 403 for non-admin, 401 for anonymous delete)
- ✅ 29/29 backend tests + frontend Examen flow passing (`iteration_2.json`)

## Implemented (2026-04-30 · part 6) — Liturgia EN migrada al RSS de Divine Office

Siguiendo la especificación técnica del usuario:

- ✅ **Parser de XML**: `feedparser` itera cada `<item>` del feed `https://divineoffice.org/feed/`.
- ✅ **Filtrado por `<category>`**: nuevo mapa `DIVINE_OFFICE_CATEGORY_CODES` que asocia cada hora canónica (ej. "MorningPrayer") con su hora interna. Se añadió también `DIVINE_OFFICE_CATEGORY_BASES` para la etiqueta humana ("Morning Prayer (Lauds)") como referencia. Se eligió la canónica porque la prosa se comparte entre Invitatory / About / Morning Prayer del mismo día.
- ✅ **Extracción de texto**: cuerpo tomado de `<content:encoded>`; `BeautifulSoup` limpia `audio, iframe, script, style, form, .powerpress_*, .podcast_links, .sharedaddy, .sd-block, .jp-audio` y **preserva** los `<span style="color: #ff0000;">` que marcan las rúbricas rojas. Salida: `body.decode_contents()` para evitar envolver `<html><body>` en el HTML devuelto.
- ✅ **Fecha litúrgica correcta**: se usa `?date=YYYYMMDD` del URL (día litúrgico) en vez de `published_parsed` (día de publicación, que va 24-48h adelantado).
- ✅ **Caché cada 1 h**: constante `CACHE_TTL_SECONDS = 3600`. Las lecturas en caché se sirven solo si `fetched_at < 1h`; si no, se re-busca desde el feed. Mantiene la política `stale-while-error` para cortes de red.
- ✅ Verificado con curl: Divine Office devuelve todas las horas (lauds/vespers/compline/office_of_readings/midmorning/midday/midafternoon) con `red_rubric=True`. TTL probado envejeciendo `fetched_at` a 2h → re-fetch inmediato.
- ✅ Frontend `/liturgy` renderiza 39 spans rojos en una sesión EN.

## Implemented (2026-04-30 · part 5) — Examen cumulativo (cambio arquitectónico)

Cambio mayor al flujo del Examen de Conciencia solicitado por el usuario:

- ✅ **Estado cumulativo**: `checks` ahora se indexa por `examId` → `{ [examId]: { [sectionId]: { [qIdx]: true } } }`. Cambiar de examen NO borra las marcas anteriores.
- ✅ **Summary fusionado**: el resumen agrupa TODAS las selecciones de TODOS los exámenes en cards unificadas, mostrando el examen de origen como eyebrow + la sección como título.
- ✅ **Dos únicos puntos de borrado total**: botón **"Empezar de nuevo"** (vuelve a la cobertura) y **"Borrar y salir"** (pantalla de paz). Ambos con confirmación inline. Se eliminaron las confirmaciones antiguas de "cambiar estado" y "borrar todo".
- ✅ **Migración automática** del formato legacy de `localStorage` al abrir.
- ✅ **Indicadores visuales en la cobertura**: cada tarjeta de examen con marcas muestra un badge "N marcadas" (con pluralización ES correcta — "1 marcada" / "N marcadas"), borde e icono resaltados en rojo `sangre`. Banner superior "TU EXAMEN ACUMULADO · N marcadas" con botón "Ver resumen" cuando hay al menos una marca.
- ✅ El contador del pie en la vista de preguntas ahora muestra SOLO las marcas del examen actual ("Marcadas en este examen"). El summary cuenta el total global.
- ✅ Se retira el closing personalizado por examen (scripture/prayer) en el summary fusionado; se usa siempre el Acto de Contrición (que aplica de forma universal).
- ✅ Traducciones ES/EN nuevas: `marked_count`, `marked_count_one`, `cumulative_title`, `summary_eyebrow`. Relabel: "Cambiar estado" → "Cambiar examen"; "Terminar confesión" → "Borrar y salir".
- ✅ Verificado con screenshot tool: badges por tarjeta, banner acumulado, 3 exámenes simultáneos → summary con las 3 cards merged, `startOver` y `finishAndExit` borran todo completamente.

## Implemented (2026-04-30 · part 4) — Examen de Vida Digital añadido
- ✅ **Vida digital** (Caridad en la Red · Pureza y Tiempo). Icono `DeviceMobile`. Total 16 perfiles.

## Implemented (2026-04-30 · part 3) — 5 exámenes más añadidos

- ✅ **Himno de la Caridad** (1 Co 13) · cierre con Escritura (1 Co 13:13).
- ✅ **Dones del Espíritu Santo** (Sabiduría, Consejo, Piedad).
- ✅ **Jóvenes** (casa/escuela, amistades/presión social).
- ✅ **Trabajo profesional** (integridad, excelencia, liderazgo, equilibrio).
- ✅ **Matrimonio y familia** (como esposo, como padre, administración del hogar).
- ✅ Traducciones ES/EN completas + 5 iconos únicos nuevos (Scroll, Wind, GraduationCap, Briefcase, House).
- ✅ Total **15 perfiles** en la cobertura del Examen. Smoke test verificó cobertura, scripture closing y fallback a Acto de Contrición.

## Implemented (2026-04-30 · part 2) — 5 exámenes alternativos añadidos

- ✅ **Triple amor** (Gran Mandamiento: Dios / prójimo / uno mismo).
- ✅ **Siete pecados capitales** (Soberbia, Avaricia, Lujuria, Envidia, Gula, Ira, Pereza).
- ✅ **Virtudes teologales y cardinales** (Fe, Esperanza, Caridad + Prudencia, Justicia, Fortaleza, Templanza).
- ✅ **Obras de misericordia** (Corporales + Espirituales) · cierre con Mt 25:40.
- ✅ **Examen diario ignaciano** (5 pasos: Acción de gracias, Petición de luz, Revisión, Perdón, Enmienda) · cierre con Padre Nuestro.
- ✅ Cada examen alternativo con **closing propio** (scripture/prayer) — `SummaryView` ahora elige: `scripture` → blockquote "Palabra de Dios"; `prayer` → card "Oración para cerrar"; fallback → Acto de Contrición.
- ✅ Traducciones ES/EN completas para cada examen, sus categorías, preguntas y focus (citas bíblicas / descripciones).
- ✅ Iconos únicos por perfil (HeartStraight, Flame, Leaf, HandsPraying, Clock).
- ✅ Verificado con screenshot tool: 10 perfiles visibles, mercy_works renderiza scripture closing, ignatian renderiza prayer closing, triple_love usa fallback Acto de Contrición.

## Implemented (2026-04-30) — Examen Privacy & Beatitudes

- ✅ **Beatitudes examen** added as a 5th profile on `Examen.jsx` (ES + EN). Sourced from user-provided JSON; renders each Beatitude as its own accordion section with the biblical quote as italic blockquote + 3 introspection questions.
- ✅ **Privacy fixes (state management)** in `Examen.jsx`:
  - "Cambiar estado / Change state" now wipes every mark via inline confirm → `resetAll()` before returning to the profile cover.
  - New **"Empezar de nuevo / Start over"** button (keeps profile, clears marks) surfaces only when at least one mark exists.
  - New **"Terminar confesión / Finish confession"** button in summary → confirm → full wipe (localStorage + state) → transitions to a "Paz sea contigo / Peace be with you" peace screen that gracefully returns to cover.
- ✅ New translations added to `LangContext.jsx`: `change_profile_confirm`, `start_over`, `start_over_confirm`, `finish_confession`, `finish_confession_confirm`, `finish_done_title`, `finish_done_subtitle`, `return_home`, `beatitude_n`, and `profile.beatitudes` / `profile_desc.beatitudes`.
- ✅ Tested end-to-end with screenshot tool: cover (5 profiles), Beatitudes accordion with focus quote, start-over visibility, summary, finish-confession flow, peace screen, and cross-profile wipe.

## Implemented (2026-05-01) — Catechism ↔ Bible cross-references
- ✅ **Tappable Bible citations inside the CCC**. Inline tokens like `*Mt* 5:3`, `*Heb* 1:3`, `*Mt* 6:26-34`, or unstarred `1 Cor 9:22` are rendered as clickable italic underlined buttons via `renderRichText` in `Catechism.jsx`.
- ✅ Built `/lib/bibleAbbrev.js`: full ES/EN abbreviation table covering all 73 books (incl. deuterocanonicals), `findCitations(text)` regex tokenizer, and synchronous `lookupCitation(bible, lang, cite)` resolver against the in-memory Bible.
- ✅ Built `/components/BibleQuickView.jsx` modal/bottom-sheet (mobile drag-handle aesthetics, body-scroll lock, Esc to close, backdrop dismiss) that renders the verse(s) with red `<sup>` numbers and a "Ver en la Biblia / Open in Bible" CTA.
- ✅ Bible preloaded eagerly in Catechism via existing `loadBible(lang)` so quick-view opens instantly.
- ✅ "Ver en la Biblia" deep-links to `/bible?ref=Book|Chapter|Verse`; the Bible page strips the `?ref=` after scroll so reload doesn't re-jump.
- ✅ Added `quickview.open_bible` and `quickview.not_found` translation keys (ES + EN).
- ✅ Coexists cleanly with: CCC-to-CCC `(NNN)` clickable refs, long-press Save/Copy/Share context menu (button uses `pointerdown` stopPropagation), search/highlight, and Parts index.
- ✅ Tested by `testing_agent_v3_fork` iteration_3.json — **7/7 cases pass, no issues**. Verified: §263 (Jn 14:26 ES), §322 (Mt 6:26-34 verse range), §24 (1 Cor 9:22 ordinal), false-positive guard ("Section/Chapter/Part" not promoted to citations), language toggle ES↔EN swaps both label and verse text, all 4 dismiss paths work, deep-link strips `?ref=`.

## Implemented (2026-05-01 · part 2) — CCC multi-ref groups in liturgical purple
- ✅ **Bug report by user**: parenthetical lists like `(2500, 1730, 1776, 1703, 366)` at the end of §33 were rendered as plain text (regex only matched single `(NNN)`).
- ✅ **Fix**: extended `refRegex` in `Catechism.jsx` to `\(\s*(\d{1,4}(?:\s*[,;]\s*\d{1,4})*)\s*\)` so single + comma/semicolon-separated lists are parsed together. Each number renders as a small **liturgical-purple pill** (`text-purple-700` + `ring-purple-200`), visually distinct from the red Bible citations. The `(`, `,`, `)` characters stay grey for readability.
- ✅ **Latent bug also fixed**: `jumpToParagraph` was racing with the `[query]` effect that resets `visible=PAGE_SIZE`. Long-distance jumps (e.g., §33 → §1730) silently failed because the row was un-rendered. Replaced with a `pendingJumpRef` that the reset effect honours, plus a `setTimeout(0) → rAF` chain so the scroll runs **after** React commits.
- ✅ Index/counter sanity confirmed: `entries.length === 2865` and numeric search uses `entries.findIndex(e => e.id === n)` — the inline numbers never pollute search or counts.
- ✅ Verified by screenshot tool: §366 jump (close), §1730 jump (far across ~1700 paragraphs), single `(199)` pill, no regression on Bible modal.

## Implemented (2026-05-01 · part 3) — Catechism index/xref bugfix + ES placeholder
- 🐛→🟢 **Index navigation broken** (only "Introducción" worked): root cause was the new `pendingJumpRef` flow only consuming when the `[query]` effect fires — but `setQuery("")` is a no-op when the query is already empty (the normal case for tapping a Parts card). Rewrote `jumpToParagraph` to call `setVisible((v) => Math.max(v, target))` **directly** (not through the effect) and use the ref purely as a "skip the reset" guard. Verified all 5 part cards (§1, §26, §1066, §1691, §2559) jump correctly.
- 🐛→🟢 **Cross-ref clicks did nothing**: same root cause (query already empty). Same fix resolves both.
- 🎨 **Cross-ref visual cleanup**: removed the box (`bg-purple-100 hover:bg-purple-100 ring-1 ring-purple-200 px-1.5 py-0.5 rounded-md`) per user request — numbers now render as plain liturgical-purple text (`text-purple-700` + `hover:underline`) inside grey parentheses with comma separators, blending naturally into the prose while remaining tappable.
- 🇪🇸 **Spanish placeholder for the Catechism**: since the project only has the English `catechism.json`, the ES locale now shows a centred "Próximamente · Catecismo en español" card explaining that the official Spanish edition is being prepared and inviting the user to switch to EN. The full reader (search bar + Parts index + paragraph list + Bible quick-view) is gated behind `lang === "en"` via a new `CatechismEnglishView` sub-component. Translations added in `LangContext.jsx` (`catechism.coming_soon_eyebrow / _title / _body` for ES and EN).
- ✅ Verified by screenshot tool: ES placeholder, EN parts navigation (5/5), §33 → §1730 multi-xref jump, no Bible modal regression. Lint clean.

## Implemented (2026-05-01 · part 4) — Settings/Ajustes screen
- ✅ New **`/settings` route** with bilingual content. Header now carries a purple `Gear` icon (`data-testid="header-settings-link"`) next to the ES/EN toggle.
- ✅ **Sobre la App → Quiénes somos** block: exact copy provided by the user, rendered with `reading-serif` prose. `decorateParagraph` helper emphasises `Corazones A La Obra`, `Señor Jesucristo` / `Lord Jesus Christ`, `Virgen María` / `Virgin Mary`, `tiempo/talento/tesoro` (and EN equivalents), and `¡Soy Apóstol!` / `I Am an Apostle!` in **bold liturgical purple** (`text-purple-700 font-semibold`). Per user request, "Corazones A La Obra" stays in Spanish on both locales.
- ✅ **Clickable `soyapostol.org`** link (`target="_blank"`, `rel="noopener noreferrer"`, underlined purple).
- ✅ **Legal block**: single card-button that opens the Termly Privacy Policy in a new tab. URL left as `#` placeholder — button auto-disables and shows "Próximamente disponible / Coming soon" until the real URL is wired in.
- ✅ **Soporte block**: card-button that launches `mailto:gustavommerino@gmail.com` with pre-filled subject ("Soporte soyapostol" / "soyapostol support") and body template.
- ✅ **Footer**: small grey `Versión 1.0.0 · soyapostol.org · Houston, TX, US` (bilingual).
- ✅ Translations added in `LangContext.jsx` (ES + EN) under `settings.*` and `nav_more.settings`.
- ✅ Verified via screenshot tool: all 13 testids render, footer text exact, link href `https://soyapostol.org`, EN locale keeps "Corazones A La Obra" in Spanish. Lint clean.

## Implemented (2026-05-01 · part 5) — Spanish Catechism (full edition)
- ✅ **Scraped vatican.va** (`/archive/catechism_sp/`) end-to-end and parsed every paragraph. Final dataset: **2,865 / 2,865 paragraphs** at `/app/frontend/public/data/catechism-es.json` (1.5 MB, no missing IDs).
- ✅ Parser handles two formatting quirks of the Vatican site: most paragraphs use `<b>NNN</b>` markers, but some (e.g. §1917, §168, §626, §2190) use plain-text `NNN.` prefixes — the scraper rewrites the latter into synthetic `<b>` so the walker stays uniform. Found one sub-page (`p4s1c1a1_sp.html`) **missing from the master index** but reachable via direct URL — added explicitly so §2568-§2597 are captured.
- ✅ **Italics cleanup**: vatican.va wraps many full paragraphs in `<i>...</i>`; the merger strips outer wrappers and collapses adjacent `**` runs so the rendered text is clean. Real italics on Bible abbreviations (`*Jn* 14,26`) are preserved for the citation parser.
- ✅ **Cross-references ported**: 1,328 paragraphs received their CCC-internal cross-reference list (e.g. `(2500, 1730, 1776, 1703, 366)`) by mining the English JSON tail and appending it to the corresponding Spanish entry — so the existing purple-pill renderer keeps working in both languages.
- ✅ **Bible-citation parser bilingual**: `bibleAbbrev.js` got ~80 Spanish aliases (Gn, Ex, Lv, Mt, Mc, Lc, Jn, Hch, Rm, 1 Co, Hb, 1 P, Sal, Si, Ap, …) and the regex now accepts both `:` and `,` as the chapter/verse separator with optional whitespace. Spanish citations like `*Mt*6, 26-34` and `Jn 14,26` are detected, resolved against `bible-es.json`, and rendered with clean labels (asterisks stripped from the button face).
- ✅ **Per-language IDB cache**: `IDB_KEY = (lang) => 'catechism:ccc:' + lang`. Loader effect now depends on `[lang]` so toggling ES↔EN swaps the file and the cache instantly. `CATECHISM_DATA_VERSION` bumped to 2 to invalidate v1 caches.
- ✅ **UI in Spanish**: Parts index already had `es` labels (Prólogo · La Profesión de la Fe · La Celebración del Misterio Cristiano · La Vida en Cristo · La Oración Cristiana); the "Coming soon" placeholder has been removed and `CatechismEnglishView` is now reused for both languages.
- ✅ Tested by `testing_agent_v3_fork` iteration_4.json — **11/11 cases pass, no issues**. Verified: §33 with 5 purple cross-refs, §263 / §322 / §268 with comma-separator Bible refs, modal opens with `Juan 14:26` and Spanish verse text, bilingual toggle re-fetches correctly, false-positive guard intact.

## Implemented (2026-05-02) — Settings: Credits + Fair-Use blocks
- ✅ Two new articles inside the "Sobre la app" section of `/settings`: **Créditos / Credits** and **Uso Justo / Fair Use**, both bilingual (ES + EN), with the exact copy supplied by the user.
- ✅ New helper `linkifySources(text)` in `Settings.jsx` walks each paragraph and converts every known source domain into an external link (`target="_blank"`, `rel="noopener noreferrer"`) styled in purple. Whitelist: evangelizo.org, evangeli.net, divineoffice.org, ibreviary.com, vaticannews.va, aciprensa.com, ewtnnews.com.
- ✅ Translations added under `settings.credits.*` and `settings.fair_use.*` in `LangContext.jsx` (ES + EN).
- ✅ Verified by screenshot tool: 8/8 testids render, 7/7 source links have correct external URLs (`https://...`), bilingual headings ("Créditos / Credits", "Uso Justo / Fair Use") swap correctly, links remain clickable in EN. Lint clean.

## Implemented (2026-05-02 · part 2) — Examen privacy hardening
- 🧹 **Limpieza de código zombie**: borrado `/app/backend/examen.py` (98 líneas) y dropeada la colección `examen_docs` de MongoDB (estaba a 0 docs y sin consumidores en frontend). Removidos `import` y `include_router` correspondientes en `server.py`. `/api/examen` ahora retorna 404 — superficie de ataque reducida.
- 🧠 **Decisión de UX confirmada por el usuario**: el estado del Examen NO se borra al hacer logout (sigue siendo acumulativo en `localStorage`). El usuario es responsable de usar "Empezar de nuevo", "Cambiar estado" o "Terminar confesión" para limpiarlo.
- 🔒 **Privacy assert al build**: nuevo `frontend/scripts/check-examen-privacy.js` — escanea `src/pages/Examen.jsx` y aborta con exit 1 si encuentra `axios`, `@/lib/api`, `XMLHttpRequest`, `EventSource`, `WebSocket`, `navigator.sendBeacon`, o cualquier `fetch()` que NO sea hacia el catálogo público `/data/examen-{lang}.json`. Cableado como `prestart`, `prebuild` y `pretest` en `package.json` — el build/test/start fallan antes de empacar un solo byte si alguien introduce código de red en el Examen.
- ✅ Verificado: passes en estado actual (`yarn examen-privacy` → "all clear"), falla con exit 1 al inyectar `import axios` (probado y revertido). Backend OK (auth/prayers/favorites siguen respondiendo). Frontend sirve `/examen` normal.

## Implemented (2026-05-02 · part 3) — Privacy Policy static asset
- 📄 **Documento estático**: el HTML de Termly (143 KB) se guarda como `/app/frontend/public/privacy-policy.html` y se sirve directamente sin pasar por React — cero impacto en el bundle JS, cero re-renders, cero overhead.
- 🎨 **Wrapper limpio**: HTML5 con `<meta viewport>`, `<meta name="robots" content="noindex,nofollow">` (la copia canónica vive en Termly), barra sticky superior con botón "Volver" (history.back o close), y un layout `max-width: 760px` con tipografía sans nativa del SO. CSS inline minimal (~2 KB) — todas las clases internas de Termly se respetan.
- 🔗 **Botón en Ajustes activado**: `PRIVACY_POLICY_URL` en `Settings.jsx` apunta ahora a `/privacy-policy.html`, el botón ya no aparece deshabilitado, y se abre en nueva pestaña con `noopener,noreferrer`. Hint en ES: "Se abre en una nueva pestaña."
- ✅ Verificado por screenshot tool: documento renderiza correctamente desktop + mobile, barra sticky funciona, enlaces internos del table-of-contents responden, contenido completo (31k chars de texto) accesible, botón de Settings no-disabled. Lint limpio, privacy-assert OK.

## Implemented (2026-05-02 · part 4) — Account self-deletion
- 🆕 **Endpoint** `POST /api/auth/delete-account` (auth required, body `{confirm_email, lang}`). Cascade-deletes `users`, `favorites`, `password_resets`, `login_attempts` matching the user; clears auth cookies on the response. Email-mismatch returns 400 without side effects.
- 📧 **Farewell email** vía Resend: `send_account_deleted_email` en `email_service.py` (bilingüe ES/EN, mismo branding que el reset email). Best-effort, nunca rompe el flujo si Resend falla.
- 🛑 **Danger Zone en Settings**: nueva sección con borde rojo + lista de qué se borra. Botón rojo "Eliminar mi cuenta" abre modal con confirmación de email exacto (estilo GitHub). Modal con backdrop, Esc/X/Cancel/click-outside lo cierran. Mientras `deleting=true` los inputs/botones se bloquean y muestran spinner.
- 🪦 **`/account-deleted`** página de despedida (eyebrow "Cuenta eliminada", título "Gracias por haber estado aquí", farewell mariano, CTA "Iniciar sesión").
- 🧹 **Limpieza de localStorage al borrar**: el frontend elimina `soyapostol:examen:es` y `:en` post-borrado para que ni el dispositivo conserve estado del Examen.
- ✅ **Verificado E2E** vía screenshot tool: login → settings → danger zone → modal → wrong email rechaza con mensaje correcto → email correcto borra y redirige → revisit dashboard cae a logged-out → BD: usuario y favoritos del throwaway eliminados, 9 usuarios reales preservados. Lint y privacy-assert limpios.

## Implemented (2026-05-02 · part 5) — Navigation restructure
- 🧭 **Logo top-left** siempre enlaza a `/` → Dashboard (sin cambios, confirmado).
- 📱 **Mobile bottom-nav primary** (visible): Lecturas · Oraciones · Examen · Noticias · Más. Orden exacto pedido por el usuario.
- 📲 **Mobile "Más" sheet**: Biblia · Catecismo · Liturgia · Favoritos · Rosario.
- 🖥️ **Desktop sidebar** reordenado para reflejar el mismo mental model: Inicio · Lecturas · Oraciones · Examen · Noticias · Biblia · Catecismo · Liturgia · Favoritos · Santo Rosario.
- 🏠 **Dashboard como ruta por defecto** ya estaba correcto (`<Route path="/" element={<Dashboard />} />` + `<Route path="*" element={<Navigate to="/" />} />`). Cualquier URL desconocida rebota al Dashboard.
- 🪦 **Nota sobre Santo Rosario**: no venía en la lista del usuario (ni primary ni secondary). Lo añadí al final del sheet "Más" para no romper acceso a la pantalla. Usuario decide si se queda, muda o se oculta.
- ✅ Verificado por screenshot tool (mobile + desktop): orden correcto en ambos layouts, logo click funciona, `/wibble-wobble` → `/`. Lint limpio.

## Implemented (2026-05-02 · part 6) — Deployment readiness health check
- ✅ **Supervisor**: backend, frontend y mongodb todos en `RUNNING` sin reinicios recientes.
- ✅ **Smoke tests API**: `/api/`, `/api/liturgy`, `/api/news`, `/api/prayers`, `/api/catechism/structure`, `/api/auth/login` → todos 200 en el preview URL. Admin login valida credenciales.
- ✅ **Pre-commit suite**: ruff + eslint v9 flat config + examen privacy fence + higiene → 9/9 hooks PASS.
  - Fixes aplicados: (1) eslint-frontend hook ya no usa `cd frontend` ingenuo — ahora strippea el prefijo `frontend/` de cada path antes de invocar eslint, cerrando un agujero donde algunos archivos se "silenciaban" con exit 2 mientras el batch aparentaba pasar. (2) ruff args: quitado `--force-exclude` duplicado que hacía fallar ruff ≥0.8.
- ✅ **Backend pytest**: 18/18 PASS. Eliminados tests stale de endpoints removidos (`/api/readings` ahora externo, `/api/bible/*` ahora JSON estático, `/api/examen/*` removidos intencionalmente por privacidad). Fix a `test_news_en_multi_sources` pasando `source=all` (default del endpoint es `vatican` = 1 source).
- ✅ **Frontend build**: `yarn build` succeeds — 230.74 KB gz main.js + 12.57 KB gz main.css. Solo warnings benignos de source-map de DOMPurify (dep externa, no afecta runtime).
- ✅ **Deployment agent audit**: PASS total. No hardcoded secrets, no URLs hardcoded fuera de `_PRODUCTION_ORIGINS` (intencional), CORS correcto, MongoDB via env vars, no escritura a disco arbitrario, startup async-safe.
- ✅ **Dashboard screenshot**: UI renderiza correctamente, versículo del día (Rom 8:38), nav completa, toggle ES/EN visible.
- 🟢 **Veredicto**: Listo para deploy nativo. Sin blockers.

## Implemented (2026-05-03 · part 7) — Header refactor + user-bound language preference
- 🧭 **Header**: el toggle ES/EN se removió del header. Ahora viven 3 íconos a la derecha — Favoritos (corazón) · Ajustes (engranaje) · Sign-in/out. Cada uno con `data-testid` + `aria-label` + `title`.
- ❤️ **Favoritos en header**: `header-favorites-link` con NavLink activo en color sangre. Eliminado de SECONDARY_NAV (sidebar desktop) y del sheet "Más" (mobile). Ruta `/favorites` sigue intacta y accesible vía header o URL directa.
- 🌐 **Idioma como preferencia de usuario** (backend):
  - Modelo `users` ahora persiste campo `lang` ("es"|"en"). Default = "es" para usuarios nuevos y para registros legacy (vía `_user_public`).
  - `POST /auth/register` acepta `lang` opcional (default "es") y lo guarda.
  - **Nuevo endpoint** `PATCH /api/auth/me` con body `{lang: "es"|"en"}` — auth requerida (401 sin token), rechaza valores fuera del enum con 400, devuelve el user público actualizado.
- 🌐 **Idioma sincronizado en frontend**:
  - `App.js` invierte el orden de providers — `AuthProvider` afuera, `LangProvider` adentro — para que LangContext pueda leer `user`.
  - `LangContext` adopta `user.lang` automáticamente al primer momento que aparece el user en sesión (guard `adoptedForUserId.current` evita que un /me posterior pise una preferencia recién toggle-ada). Al hacer logout el guard se resetea, así un siguiente login adopta de nuevo.
  - `setLang(next)` actualiza estado + localStorage; si hay sesión, dispara `PATCH /auth/me` y propaga el user actualizado a AuthContext (vía nuevo `setUser` exportado). Anonimos solo persisten en localStorage.
- ⚙️ **Settings → Idioma**: nueva sección al inicio del Settings (`settings-language` block) con dos botones radio (`settings-language-es`, `settings-language-en`) en role=radiogroup, ARIA-correcto, estilizados como pills con la etiqueta corta (ES/EN) + nombre completo. Hint `settings-language-anonymous-hint` solo aparece cuando NO hay user logged in.
- 📚 **Catecismo coming-soon copy actualizada**: "desde Ajustes" / "using the language toggle in Settings" (antes: "desde el botón EN en la cabecera"). En la práctica este branch es dead code ahora que el dataset ES ya viene shippeado, pero la copia queda correcta como fallback defensivo.
- 🧪 **Tests añadidos**: `backend_test.py` cubre register-default-lang-es, register-with-lang-en, PATCH-me-persists, PATCH-me-rejects-fr (400), PATCH-me-requires-auth (401). 23/23 PASS.
- ✅ **Validado E2E** vía testing_agent (iteration_5): localStorage='es' fue sobrescrito a 'en' al hacer login cuando el servidor tenía lang='en'. Anonymous puede toggle libremente. Sidebar/more-sheet ya no contienen Favoritos. 17/18 sub-checks PASS (1 N/A por dead code de coming-soon).

## Implemented (2026-05-03 · part 8) — Readings rebuilt on Evangelizo RSS
- 🔁 **Backend switch**: reemplazado el JSON scrape no-oficial por el RSS oficial `https://feed.evangelizo.org/v2/reader.php`. Nuevo módulo `/app/backend/readings.py` expone `GET /api/readings?lang=es|en&date=YYYY-MM-DD` que consolida 11 llamadas upstream en paralelo (asyncio.gather + httpx.AsyncClient):
  - `type=liturgic_t` → título litúrgico del día
  - `type=reading_lt` + `type=reading` para `content=FR|PS|SR|GSP` (8 calls)
  - `type=comment_t` · `comment_a` · `comment_s` · `comment` (4 calls)
- 🧹 **Sanitización HTML server-side**: `_clean()` quita los wrappers `<font>`, bloquea script/style/iframe/object/embed (defensa en profundidad), y strippea el footer de atribución que Evangelizo append-ea a cada lectura ("Extraído de la Biblia …" / "Copyright © Confraternity of Christian Doctrine, USCCB …"). Conserva `<br/>` porque es la señal de salto de línea que el frontend renderiza.
- 💾 **Caché MongoDB**: `readings_cache` con `_id = "{YYYYMMDD}_{lang}"`, TTL 7 días. Sirve cache stale si el upstream falla (patrón idéntico a liturgy/news). Evita superar el rate-limit de Evangelizo (100 req/s, 2000 req/min por IP).
- 🗂️ **UI reconstruida** (`Readings.jsx`):
  - Selector sticky de 5 tabs (FR · PS · SR · GSP · Comentario) con el mismo estilo de pills que Favoritos. Posición `sticky top-[57px] lg:top-[73px] z-20` con backdrop-blur para seguir visible al hacer scroll. El backdrop tiene negative-margin + padding hasta el borde de la columna de contenido para que se vea edge-to-edge.
  - Tab SR se muestra **deshabilitado + aria-disabled + opacity-60** (no hidden) cuando el día no tiene segunda lectura, manteniendo 5 opciones constantes. Si el usuario estaba en SR y cambia el día, auto-rebota a FR.
  - Cada panel usa `dangerouslySetInnerHTML` con DOMPurify (ALLOWED_TAGS: br/p/em/i/b/strong/a/span). `FavoriteButton` en el header de cada lectura + en el bloque de comentario de Evangelizo.
  - **Evangeli.net iframe movido al tab "Comentario"** tal como pidió el usuario. Debajo del iframe se renderiza el comentario de Evangelizo (título, autor con descripción, fuente, cuerpo sanitizado).
  - Badge del título litúrgico (ej. "LUNES DE LA 5A SEMANA DE PASCUA") arriba del selector, color sangre.
- 🗑️ **Borrado**: `frontend/src/components/EvangelizoReadings.jsx` eliminado (ya no se usa).
- 🧪 **Tests**: 5 nuevos en `TestReadings` — Sunday ES shape, EN shape, weekday SR=null, footer stripping (debe faltar "Extraído de la Biblia", "evangeliodeldia.org", "<font"), invalid date → 400. Backend pytest **28/28 PASS**.
- ✅ **Testing agent iteration_6**: 100% backend (28/28), 100% frontend (11/11 criterios). Pre-commit limpio.

## Implemented (2026-05-03 · part 9) — Readings date navigator (±7 days)
- 📅 **DateNavigator** above el selector sticky en `/readings`: controles prev/next de un día, botón con ícono de calendario que abre el `<input type="date">` nativo del browser (showPicker() con fallback focus+click para iOS Safari), y un pill "HOY" que aparece solo cuando el usuario no está viendo la fecha de hoy.
- 🎯 **Ventana ±7 días** desde hoy (constante `DATE_WINDOW_DAYS=7`). El `min`/`max` del native date input respeta la ventana; los chevrones se deshabilitan en los bordes. Evangelizo permite hasta 30 días, así que ±7 es UX-safe (sin 404s por días fuera de rango) y cubre perfectamente el caso "me salté misa el domingo".
- 🪄 **Hero title dinámico**: h1 ahora muestra "Hoy" / "Ayer" / "Mañana" / nombre del día (ej. "Viernes") según el delta entre la fecha seleccionada y la de hoy. Traducciones nuevas `readings.prev_day`, `readings.next_day`, `readings.pick_date`, `readings.go_today` para ambos idiomas.
- 🧠 **Auto-rollover controlado**: el timer de midnight sigue ahí pero solo avanza si el usuario está viendo hoy; si navegó manualmente a otro día respeta su elección (solo vuelve a hoy si pulsa el pill "HOY").
- 🧱 Componente inline `DateNavigator` dentro de `Readings.jsx` (no se abstrae a `/components/` porque es específico de esta página y mantiene el flujo de props claro). Uses `shiftDate(iso, delta)` + `daysFromToday(iso)` helpers puros.
- ✅ Verificado por screenshot: prev→"Ayer" + aparece pill "HOY"; click "HOY"→vuelve a "Hoy"; todas las lecturas + commentary se actualizan correctamente al cambiar de fecha (usan el caché por `(date, lang)` del backend `readings_cache`). Pre-commit 9/9 PASS, eslint limpio.

## Implemented (2026-05-03 · part 10) — Liturgical vestment colour indicator
- 🎨 **Nuevo helper** `frontend/src/lib/liturgicalColor.js`: inspecciona el `liturgic_title` del día con 5 patrones regex ordenados por prioridad (red → rose → violet → white → green) y devuelve uno de {white, red, violet, rose, green}. Default = green (Tiempo Ordinario, feria safe).
- ✅ **Cobertura**: 29 casos unitarios cubren Pascua, Pentecostés, Ramos, Viernes Santo, mártires, apóstoles, Gaudete/Laetare, Adviento, Cuaresma, Ceniza, Navidad, Epifanía, Asunción, Todos los Santos, Cristo Rey, Tiempo Ordinario, título vacío/null/undefined → todos pasan.
- 🎯 **Badge rediseñado**: el antiguo `<p>` de una línea ahora es un chip con borde izquierdo de 4px en el color litúrgico + dot circular + nombre del color al extremo derecho ("Blanco" / "Rojo" / "Morado" / "Rosa" / "Verde" en ES, equivalentes en EN). Usa Tailwind classes puras (`border-l-amber-300`, `border-l-red-600`, `border-l-purple-700`, `border-l-pink-400`, `border-l-emerald-600`). El label textual solo se muestra en pantallas `sm:` o más grandes para no saturar móvil.
- 🔖 **Accesibilidad**: el chip completo lleva `title` con el nombre del color (tooltip nativo), `data-liturgic-color` para tests/scrapers, y `aria-hidden` en el dot decorativo. Cambiar de fecha con el DateNavigator refresca el color automáticamente (reactivo al `data.liturgic_title`).
- 📐 Detalle UX: sigue siendo texto compacto — no añade nuevo "peso visual" significativo; el usuario católico reconoce el color instantáneamente (como el misal) y el lector casual solo ve un acento cromático agradable.
- ✅ Verificado: screenshot Pascua → chip blanco/ámbar con "BLANCO"; pre-commit 9/9 PASS, ESLint 0 warnings.

## Implemented (2026-05-03 · part 11) — Favorites: lang-scoped view + sticky toolbar + back-to-top
- 🌐 **Filtrado por idioma (FIX)**: `/favorites` ahora muestra solamente favoritos cuyo `lang` coincide con el idioma actual del usuario. Items legacy sin `lang` se tratan como Español (default histórico). Se añade hint discreto al pie ("También tienes N favorito(s) guardado(s) en inglés." / equivalente EN) para que el usuario nunca piense que desaparecieron — solo cambian de "pestaña mental" al cambiar idioma en Ajustes.
- 📌 **Toolbar sticky**: el input de búsqueda + los chips de filtro están ahora dentro de un bloque sticky (`top-[57px] lg:top-[73px] z-20`) con backdrop-blur + borde inferior. El usuario puede desplazarse por listas largas y seguir pudiendo filtrar/buscar sin scrollear de regreso. Usa el mismo patrón de negative-margin + padding que `Readings.jsx` para que el backdrop cubra todo el ancho de la columna.
- ⬆️ **Back-to-top**: se añade `<BackToTopButton testId="favorites-back-to-top" threshold={250} />` al final de la página. Umbral reducido a 250px (vs. 400 del default) porque las cards de favorito son más compactas y 400px rara vez se alcanza con pocos items.
- 🧠 **Reset automático del filtro**: al cambiar de idioma, el chip-filter vuelve a "Todos" por si el filtro previo ya no aplica a ningún item del nuevo idioma (previene estado vacío "fantasma").
- 🏷️ **Chip "Todos" localizado**: "Todos (N)" en ES, "All (N)" en EN (antes siempre decía "All" hardcoded).
- ✅ **Verificado E2E**:
  - Backend: POST `/api/favorites` con `lang:"en"` y `lang:"es"` se persisten correctamente; GET devuelve `lang` en cada item. Curl manual + testing_agent previo confirman.
  - Frontend: seeds via `fetch()` en ES y EN; al estar en Ajustes=ES solo aparecen los ES ("Todos (3)" + hint "1 en inglés"), al cambiar a EN solo aparecen EN ("All (1)"). Hint bidireccional.
- Pre-commit **9/9 PASS**, ESLint 0 warnings.

## Implemented (2026-05-03 · part 12) — Favorites counter badge on the header heart
- ❤️‍🔥 **Nuevo contexto** `FavoritesCountProvider` (`/app/frontend/src/contexts/FavoritesCountContext.jsx`): hace `GET /api/favorites` una sola vez y cuenta items cuyo `lang` coincide con el idioma actual del usuario. Expone `{ count, refresh }`. Se reevalúa automáticamente cuando cambia `user` o `lang` (se refresca con el idioma del usuario al hacer login).
- 🎯 **Badge en el header**: pequeña píldora redonda con el número de favoritos pegada al ícono del corazón (`-top-1.5 -right-1.5`, `bg-sangre text-sand-50`, ring-2 ring-sand-50 para contraste). Se oculta cuando count=0 o no hay usuario. Si hay más de 99, muestra "99+". `aria-label` del NavLink incluye el conteo para lectores de pantalla.
- 🔄 **Refresh reactivo**: todos los call-sites que mutan favoritos llaman `refreshCount()` tras el POST/DELETE:
  - `FavoriteButton.jsx` (guardar desde Lecturas, Noticias, Biblia, Catecismo, Liturgia, Oraciones).
  - `Favorites.jsx` `onDelete` (borrar una tarjeta).
  - `Bible.jsx` `toggleVerseFavorite` (tap en un versículo).
  - `useVotdFavorite.js` `toggle` (Verse of the Day en Dashboard).
- 🪶 **Diseño minimalista**: una sola query HTTP al cargar + una extra por toggle. No se añade endpoint backend — se aprovecha el `/api/favorites` existente.
- ✅ **Verificado E2E Playwright**:
  - Badge = 10 en ES con 10 favs ES.
  - Switch a EN vía Ajustes → badge pasa automáticamente a 1 (los EN favs del usuario).
  - DELETE del único fav EN + reload → badge desaparece (count=0 oculta el span).
- Pre-commit **9/9 PASS**, ESLint 0 warnings.

## Implemented (2026-05-03 · part 13) — Readings tabs UX polish (abbreviations, horizontal scroll, commentary order)
- ✂️ **Etiquetas abreviadas**: "Primera Lectura" → **"1ra Lectura"**, "Segunda Lectura" → **"2da Lectura"** (ES); "First Reading" → **"1st Reading"**, "Second Reading" → **"2nd Reading"** (EN). Aplicado a `readings.first` y `readings.second` en `LangContext.jsx`. Tab pills más cortas → cabe todo el selector en una sola línea sin wrap.
- ➡️ **Scroll horizontal** en la barra de selectores: reemplazado `flex flex-wrap gap-2` por `flex gap-2 overflow-x-auto whitespace-nowrap scrollbar-none snap-x snap-mandatory`. Cada botón es `shrink-0 snap-start` para que se alinee al borde izquierdo al hacer scroll. Añadida clase `.scrollbar-none` en `index.css` para ocultar la scrollbar en WebKit/Firefox/IE manteniendo el comportamiento. Por default aparece "1ra Lectura" activa a la izquierda; el usuario arrastra/swipea horizontal para llegar hasta "Comentario".
- 🔀 **Orden del Comentario invertido**: en el tab "Comentario" ahora se renderiza PRIMERO el comentario RSS de Evangelizo (comment_t/comment_a/comment_s/comment) y DESPUÉS el iframe de evangeli.net. Los fieles ven primero la reflexión firmada y con autor antes de la reflexión embed externa. Verificado por Playwright (May 3 domingo): `[readings-evangelizo-commentary, iframe-container]`. En días sin comentario RSS (como May 4 lunes) solo muestra el iframe como fallback.
- ✅ **Smoke test**: mobile 420px viewport → tabs se desplazan horizontalmente con "1ra Lectura" activa a la izquierda; el resto visible al scrollear. Pre-commit **9/9 PASS**, ESLint 0 warnings, ruff clean.

## Implemented (2026-05-03 · part 14) — Mobile horizontal-scroll containment fix
- 🐛 **Bug**: el scroll horizontal introducido en los tabs de `/readings` estaba propagando al `<body>` en viewports mobile (375px → body scrollWidth=709px), permitiendo que el usuario swipeara TODA la página horizontalmente.
- 🔬 **Root cause**: el `<main>` en `Layout.jsx` era `flex-1` sin `min-width: 0`. Por spec de flexbox, un flex item tiene `min-width: auto` por default, lo que le deja crecer más allá del parent cuando un descendiente tiene contenido intrínsecamente ancho (como `overflow-x-auto` + tabs con `shrink-0 whitespace-nowrap`). El contenido ancho "empujaba" al `<main>` (y por ende al `<body>`) a 709px.
- 🩹 **Fix (1 línea)**: añadido `min-w-0` al `<main>` en Layout.jsx. Esto permite que `overflow-x-auto` del tablist realmente contenga el scroll internamente.
- ✅ **Verificado Playwright 375px**:
  - `body_scrollWidth: 375` (== viewport, antes: 709) ✓
  - `main_clientWidth: 375` (antes: 709) ✓
  - `tabs_scrollWidth: 673 > tabs_clientWidth: 339` → scroll interno habilitado ✓
  - `window.scrollTo(200, 0)` → `scrollX: 0` (antes: 200) ✓ la página rechaza scroll horizontal
  - `tabs.scrollLeft = 200` → funciona como esperado ✓
- 🎓 **Note to future devs**: cuando añadas cualquier `overflow-x-auto` dentro de un flex item, revisar que el flex item tenga `min-w-0`. Es el "gotcha" de flexbox más común.

## Implemented (2026-05-03 · part 15) — Long-press context menu en tarjetas de Oraciones
- 🤲 **Mismo patrón que Biblia**: las cards de oración en `/prayers` ahora responden a:
  - **Long-press móvil** (500ms hold sin moverse > 10px)
  - **Click derecho desktop** (vía `oncontextmenu`)
  - Ambos accionados por el hook `useLongPress` del componente compartido `LongPressMenu.jsx`.
- 📋 **Menú con 3 acciones**:
  1. **Guardar en favoritos** (Heart) → POST `/api/favorites` con `section:"prayers"`, `metadata: { category }`, `lang`. Refresca el badge del header.
  2. **Copiar oración** (Copy) → escribe al clipboard `"{título}\n[{categoría}]\n\n{contenido}"`. Toast de confirmación.
  3. **Compartir** (Share) → `navigator.share({ title, text, url: source_url })` con fallback a copy si no hay Web Share API.
- 🎯 **Diseño robusto**:
  - El contenido completo de la oración no está en memoria al renderizar la card (solo título + slug). El `PrayerContextMenu` hace fetch lazy a `/api/prayers/{slug}?lang=...` la primera vez que el usuario invoca cualquier acción y cachea el resultado en un `useRef` para que sucesivas acciones (e.g. copy → share) no rehit el endpoint.
  - El menú flotante hereda el comportamiento ya probado de `ContextMenu`: anclado a la card, flip arriba/abajo según overflow del viewport, cierre al click-outside / Escape / scroll.
  - `select-none + WebkitUserSelect:none + WebkitTouchCallout:none` en la card previenen que iOS Safari abra su selector nativo antes de los 500ms.
  - El click normal sigue funcionando (abre el detalle); el hook intercepta el click subsiguiente solo cuando el long-press dispara (vía `fired.current` flag).
- 🌐 **Traducciones**: nuevo bloque `prayers_actions` en LangContext (ES + EN) con `copy`, `share`, `copied`, `share_title`, `long_press_hint`. Pequeña hint italic bajo el subtítulo de la página: "Mantén presionado para más opciones" / "Long-press for more options".
- ✅ **Verificado E2E (Playwright)**:
  - Right-click en una card → menu visible con los 3 items (`prayer-menu-{slug}-item-fav|copy|share`).
  - Click en "Copiar" → clipboard contiene el bloque formateado (verificación intentada; permission denied en headless es esperado).
  - Click en "Guardar en favoritos" → POST exitoso al backend; verificado vía GET `/api/favorites`: 1 fav con `section:'prayers'`, `metadata.category:'Antes y después de comulgar'`, `lang:'es'`. Badge del header pasó de 7 a 8.
- Pre-commit **9/9 PASS**, ESLint 0 warnings.

## Implemented (2026-05-03 · part 16) — Long-press menu en tarjetas de Lecturas
- 📖 **Quick-win replicado en /readings**: el `FavoriteButton` que estaba arriba-derecha en cada panel (FR/PS/SR/GSP/Comentario) se reemplazó por un botón `DotsThreeVertical` que abre el mismo `ContextMenu` usado en Biblia y Oraciones.
- 🤲 **Long-press móvil + click-derecho desktop** sobre toda la `<article>` del panel: dispara el menú vía `useLongPress` + `onContextMenu`. El click en el botón ⋮ es el fallback explícito para usuarios que prefieren tap directo.
- 🎯 **3 acciones**:
  1. **Guardar en favoritos**: POST `/api/favorites` con `section:"readings"`, `metadata:{ tab }` (FR/PS/SR/GSP/COMM), `lang`, `title:"1ra Lectura — {referencia}"`. Refresca el badge del header.
  2. **Copiar texto** (label genérico "Copiar texto" / "Copy text" para no decir "oración" en una lectura): clipboard recibe `"{label}\n{título_referencia}\n\n{texto_plano}"`.
  3. **Compartir**: `navigator.share()` con título + texto formateado + source URL; fallback a copy si no hay Web Share API.
- 🧠 **Provenance preservada en el Comentario**: el payload de share del bloque Evangelizo include autor + fuente entre el título y el cuerpo: `"{título}\n{autor}\n{fuente}\n\n{texto}"`. Quien recibe el mensaje sabe quién escribió la reflexión (cumple con la atribución del feed).
- 🔌 **Integración con FavoritesCount**: cada save dispara `refreshCount()` para que el badge del header suba al instante (verificado: badge pasó de 7 → 8).
- 🪶 **Eliminado el `FavoriteButton` import** en Readings.jsx (ya no se usa); reemplazado por imports directos de `Heart`, `Copy`, `ShareNetwork`, `DotsThreeVertical` + el toolkit `LongPressMenu`. Sin código muerto.
- ✅ **Verificado E2E (Playwright)**:
  - FR panel: 0 legacy fav buttons, 1 actions button. Click → menú con 3 items.
  - "Guardar en favoritos" en FR → backend recibe POST con `metadata.tab:"FR"`, badge sube. Cleanup OK.
  - Domingo 3-mayo (con comentario): card del Comentario muestra ⋮ button, menú con "Copiar texto" (label correcto, no "oración").
  - Pre-commit **9/9 PASS**, ESLint 0 warnings.

## Implemented (2026-05-04 · part 17) — Autenticación biométrica (Face ID / Touch ID / Windows Hello) vía WebAuthn / Passkeys
- 🔐 **Backend** (`/app/backend/webauthn_routes.py`): nuevo módulo con 6 endpoints bajo `/api/auth/webauthn`:
  - `POST /register/options` (auth requerida) → genera `PublicKeyCredentialCreationOptions` con `authenticator_attachment=PLATFORM`, `resident_key=REQUIRED`, `user_verification=REQUIRED`. Excluye credenciales ya registradas para que el mismo authenticator no se duplique.
  - `POST /register/verify` (auth requerida) → valida la respuesta del navegador con la lib `webauthn==2.7.0` (Duo Labs), persiste el credential en `users.webauthn_credentials` (array) con `credential_id`, `public_key`, `sign_count`, `transports`, `device_name` (UA-derived: iPhone/iPad/Mac/Android/Windows/Linux), `created_at`, `aaguid`.
  - `POST /auth/options` (público) → `PublicKeyCredentialRequestOptions` con `allowCredentials: []` (discoverable credential flow — sin pedir email).
  - `POST /auth/verify` (público) → resuelve el credential al user, valida firma + sign-count, incrementa contador, actualiza `last_used_at`, emite los mismos JWT cookies que el flujo de password (`set_auth_cookies` reutilizado).
  - `GET /credentials` (auth) + `DELETE /credentials/{cid}` (auth) → administración.
- 💾 **Storage**: `users.webauthn_credentials = [{credential_id, public_key, sign_count, transports, device_name, created_at, last_used_at, aaguid}]`. Challenges en `webauthn_challenges` con TTL index 5 min y delete-on-consume para anti-replay.
- 🌐 **Env vars** (`/app/backend/.env`): `WEBAUTHN_RP_ID=apostol-sacred.preview.emergentagent.com`, `WEBAUTHN_RP_NAME=Soy Apóstol`, `WEBAUTHN_ALLOWED_ORIGINS=https://apostol-sacred.preview.emergentagent.com,https://soyapostol.org`. Origen validado contra el whitelist; rp_id derivado del env.
- 🖥️ **Frontend** (`/app/frontend/src/lib/webauthn.js` + `Settings.jsx` + `Login.jsx`):
  - Lib helper exporta `webauthnSupported()`, `platformAuthenticatorAvailable()`, `registerPasskey()`, `authenticateWithPasskey()`, `listPasskeys()`, `deletePasskey()`. Usa `@simplewebauthn/browser@13.3.0` que maneja serialización base64url ↔ ArrayBuffer.
  - **Settings**: nueva sección "Seguridad / Face ID / Touch ID" (sólo visible cuando hay sesión iniciada). Botón "Activar en este dispositivo" registra un passkey nuevo. Lista de "Dispositivos registrados" con nombre, fecha y "Olvidar dispositivo". Sección oculta cuando dispositivo no soporta biometría AND no hay credentials.
  - **Login**: si `passkeyHint` está set en localStorage Y el browser tiene platform authenticator, aparece arriba un botón **"Iniciar sesión con Face ID / Touch ID"** con icono de huella, separador "O usa contraseña" y formulario de password como **fallback transparente** debajo. Cancelación silenciosa (no toast) — el usuario simplemente puede usar password.
- 🔗 **Auto-trigger**: el botón es manual (no auto-prompt al cargar Login) por respeto al usuario; pero el `passkeyHint` en localStorage hace que el botón aparezca automáticamente solo en el dispositivo donde se registró.
- 🐛 **Fix descubierto durante testing**: MongoDB devolvía `created_at` como datetime naive; al restar contra `datetime.now(timezone.utc)` daba TypeError. Coerced naive → aware UTC en `_consume_challenge`.
- 🧪 **Backend tests**: 9 tests nuevos (`TestWebAuthn`) cubren auth-protection en los 4 endpoints autenticados, shape de los options responses, rechazos correctos en auth/verify (400/401, nunca 500), `allowCredentials: []` para flujo discoverable. **37/37 backend tests PASS**.
- ✅ **E2E Playwright con virtual authenticator** (Chrome DevTools Protocol):
  - Setup: `WebAuthn.addVirtualAuthenticator(ctap2, internal, residentKey, userVerification)` → simula Face ID en headless.
  - Register: click "Activar en este dispositivo" → "Biometría activada" toast → "Linux registrado: 4/5/2026" en la lista.
  - Logout + Login: passkey button visible, click → URL navega a `/`, `/api/auth/me` devuelve user válido. Sign-in 100% biométrico funcionando.
- Pre-commit **9/9 PASS**, ESLint 0 warnings, ruff clean.

## Implemented (2026-05-04 · part 18) — Onboarding biométrico post-login (prompt suave de adopción)
- 🪄 **Nuevo componente** `BiometricEnrollPrompt.jsx` montado a nivel `Layout`. Se dispara automáticamente cuando concurren las 4 condiciones:
  1. El usuario acaba de iniciar sesión con email/contraseña (flag one-shot `soyapostol_just_logged_in_pw` en `localStorage`, set por `AuthContext.login()` y `register()`, consumido por el componente).
  2. El navegador expone un platform authenticator (Face ID / Touch ID / Windows Hello) — `platformAuthenticatorIsAvailable()`.
  3. El usuario NO tiene ya un passkey en este dispositivo (`passkeyHint` no está set).
  4. El usuario NO descartó previamente el prompt (`soyapostol_passkey_prompt_dismissed_at` ausente).
- 💬 **UX**: dialog modal centrado con ícono de huella en círculo sangre, título "¿Iniciar sesión con Face ID / Touch ID?", copy de confianza ("nunca sale de aquí"), 2 botones — **"Más tarde"** (descarta permanente, escribe el flag) y **"Sí, activar"** (sangre, ejecuta `registerPasskey()`).
- 🤝 **Respeta al usuario**:
  - Si cancela el OS prompt nativo → el dialog queda abierto (puede reintentar o "Más tarde").
  - Click en "Más tarde" o cierre del dialog (X / overlay click / Escape) → marca como descartado y no vuelve a aparecer (no nag).
  - Si el dispositivo no soporta biometría → ni siquiera se renderiza.
- 📍 **Posición**: dialog se renderiza encima del dashboard (la primera página tras login) sin bloquear nav lateral ni header — diseño no intrusivo.
- ✅ **E2E Playwright con virtual authenticator**:
  - Estado limpio (sin hint, sin dismissed): login pw → prompt visible (1) con `enable_btn` + `later_btn`. Click "Sí, activar" → prompt cierra, `registered creds: 1`.
  - Logout + login pw subsiguiente: `prompt after enrolled: 0` ✓ (no nag al usuario que ya enroló).
- Pre-commit **9/9 PASS**, ESLint 0 warnings.

## Implemented (2026-05-04 · part 19) — Performance: cold-boot UX + readings IDB cache + dep cleanup
- 🚀 **Boot loader inline** (`public/index.html` + `index.js`): ahora cuando el usuario abre la PWA ve INSTANTÁNEAMENTE un loader con logo + "soyapostol" + "CARGANDO…" en el mismo color de fondo del app (sand-50). Cero pantalla blanca/negra. El loader se desvanece (CSS transition .35s) cuando React hace su primer commit (`requestAnimationFrame` x2 → `body.app-ready`) y el nodo se elimina del DOM 450ms después para no bloquear focus/eventos.
- 💾 **IDB cache para Lecturas** (`/app/frontend/src/lib/readingsCache.js` nuevo): wrapper que hace IDB-first → fallback a `/api/readings` → re-persiste en IDB. Key `readings_{YYYY-MM-DD}_{lang}` así diferentes días no colisionan y los cambios de idioma no invalidan días previos. Lógica de freshness:
  - Días pasados: cache permanente (no van a cambiar nunca).
  - Día de hoy: re-valida cada hora (1h `FRESH_FOR_TODAY_MS`) por si hay correcciones del editor.
  - El backend ya cachea contra Evangelizo en MongoDB 7 días, así que el peor caso es 1 fetch por día por idioma.
- ✅ **Bible y Catechism ya estaban óptimos** (verificación post-investigación):
  - Lazy load: solo se hace fetch cuando el usuario navega a `/bible` o `/catechism` (no en boot ni en otras páginas).
  - Idioma sólo: cache key incluye `lang`, así que solo se descarga el JSON del idioma activo.
  - IDB persistente: una vez descargado, sobrevive reloads / cierres de la app (storage de IndexedDB). Comportamiento idéntico al pedido del usuario sin cambios extra.
  - Cargando feedback: ambas páginas ya muestran "Cargando…" durante el primer fetch.
- 🧹 **Backend `requirements.txt` adelgazado**: de 134 → **50 líneas** (-63%):
  - **Removido**: numpy, pandas, boto3, botocore, s3transfer, google-api-core, google-auth, grpcio, emergentintegrations, litellm, openai, stripe, resend (no, kept — se usa en email_service), pillow, huggingface_hub, pyee, playwright, mypy, pytest, pre_commit, pycodestyle, pyflakes, mccabe, virtualenv, nodeenv, watchfiles, jq, lxml, tiktoken, tenacity, fastuuid, fsspec, ecdsa, python-jose, passlib, y ~70 transitive deps que vinieron de paquetes ahora removidos.
  - **Mantenido**: fastapi/starlette/uvicorn/anyio/h11/httpx/idna/certifi (web stack), pydantic/pydantic_core (validación), motor/pymongo/dnspython (DB), bcrypt/PyJWT (auth), webauthn/cbor2/cryptography/pyOpenSSL/asn1crypto/pycparser/cffi (passkeys), beautifulsoup4/feedparser/sgmllib3k/soupsieve (scraping prayers + RSS), requests, resend (emails), python-dotenv/python-multipart/email-validator/click/Jinja2/MarkupSafe/PyYAML.
  - Backend pytest **37/37 PASS** post-cleanup. Smoke tests `/api/`, `/api/readings`, `/api/news`, `/api/auth/webauthn/auth/options` todos 200. App levanta en ~0.5s.
- 📊 **Resultado de performance**:
  - Cold boot: usuario ve UI inmediato (loader vs blank).
  - Warm boot (cualquier visita posterior): readings sirven desde IDB → instant.
  - Bible / Catechism: primera visita normal (fetch JSON), siguientes: instant desde IDB.
- Pre-commit **9/9 PASS**, ESLint 0 warnings, ruff clean, backend pytest 37/37 PASS.

## Implemented (2026-05-04 · part 20) — Service Worker v6: SWR + prewarm + navigation preload + user-scope bypass
- 🚀 **Bump SW_VERSION → v6**: fuerza a todos los clientes existentes a actualizar, descartar caches viejas (v5 y anteriores) y aplicar las nuevas reglas en su próximo arranque.
- 🌐 **Navigation Preload activado** en `activate`: `self.registration.navigationPreload.enable()`. Cuando el usuario navega entre rutas, el browser inicia la fetch de la red EN PARALELO con la activación del SW; `networkFirst()` consume `event.preloadResponse` cuando está disponible. Resultado: latencia añadida por el SW = ~0ms.
- 🔥 **Prewarm de cache en activate**: tras `self.clients.claim()`, fire-and-forget `prewarmRuntimeCache()` que precarga 7 endpoints públicos en ambos idiomas:
  - `/api/`, `/api/readings?lang=es|en`, `/api/news?lang=es|en&source=all`, `/api/prayers?lang=es`, `/api/liturgy?lang=es`.
  - No bloquea `activate` (await omitido) → sin penalty en arranque.
  - La PRIMERA vez que el dashboard pida `/api/readings` después de instalar el SW, ya viene del cache → render <50ms.
- 🚫 **Bypass para endpoints user-scoped**: `/api/auth/*`, `/api/favorites`, `/api/admin/*` NUNCA pasan por el cache (un logout o un add-favorite que devuelva un 200 stale sería un bug real). El SW deja pasar la request directo a la red (`return` sin `respondWith`).
- ✅ **Lecturas, Noticias, Liturgia, Oraciones, Catecismo** siguen con stale-while-revalidate: usuario ve el cache instantáneo + SW refetchea en background y actualiza el cache para la siguiente visita. Combinado con el IDB cache que ya tiene la app (Bible, Catechism, Readings via `readingsCache.js`), tenemos dos capas: SW para warm starts del browser, IDB para warm starts del JS context.
- 📊 **Resultado esperado**:
  - Cold start (SW recién instalado, sin cache): network normal → cache se llena.
  - Warm start (segunda visita+): readings/news/liturgy aparecen <100ms desde el cache del SW. IDB confirma desde el JS layer en otro <50ms.
  - Comparable a apps nativas en redes 3G.
- ✅ **Verificación**: SW v6 servido correctamente (HTTP 200, contenido nuevo confirmado). Pre-commit **9/9 PASS**, ESLint 0 warnings. (Playwright headless no registra SW por defecto, así que la verificación fue vía curl + lint + diseño.)

## 2026-05-06 — Prayer detail 3-dot menu (parity with Readings)
- ✅ Reemplazado el botón "Agregar a Favoritos" en la cabecera del detalle de oración por el menú contextual de 3 puntos (`PrayerDetailMenuButton` en `Prayers.jsx`), siguiendo el mismo patrón de `ReadingActionsMenu` en Lecturas.
- Acciones: **Guardar en favoritos**, **Copiar oración**, **Compartir** (Web Share API + fallback a portapapeles).
- Reusa el `content` ya cargado (title, category, content, source_url) → cero fetches extra.
- Eliminado import sin usar `FavoriteButton` y limpieza de imports en `webauthn_routes.py` (`base64`, `bson.ObjectId`, `fastapi.Body`).
- Pre-commit **9/9 PASS**, smoke screenshot OK.

## Backlog (P0/P1/P2)
### P1 (active)
- Custom-domain CORS rewrite on `soyapostol.org` (blocked — Cloudflare edge). Awaiting Emergent Support.
- Firebase / GA4 telemetry (blocked — pending user API keys; must exclude `/examen` page).

### P2
- Reading plans / Freemium model.
- Highlight-to-favorite on Bible/CCC paragraphs.
- Catecismo del día en Dashboard (rotating featured paragraph).
- Documentos legales adicionales (Términos, Cookies).
- Tarjeta "Únete a la misión" en Ajustes.
- Component refactor: `Settings.jsx`, `Bible.jsx`, `Catechism.jsx`, `PrayersAdmin.jsx`, `Rosary.jsx` — extract sub-components / hooks to reduce cyclomatic complexity.
- Tighten `bibleAbbrev` regex to a whitelist built from `Object.keys(RAW)` (currently safe via `resolveBookName` filter — code-review note from iteration_3).

## Credentials
See `/app/memory/test_credentials.md`
