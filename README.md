# Terminal-oppgaver

Klasseromsside der omtrent 30 elever løser lekne oppgaver i en simulert terminal (macOS/zsh, Linux/bash, Windows PowerShell),
mens en pikselkunst-scene viser hva kommandoene gjør. Admin følger med live og starter hver oppgave.

* Elevene åpner `/`, skriver navn, velger terminal og venter til admin starter oppgaven.
* Admin åpner `/admin` (passord fra `ADMIN_PASSWORD`) og trykker «Start neste oppgave».
* Oppgavene ligger i `src/tasks/`. Se [docs/writing-tasks.md](docs/writing-tasks.md) for hvordan du lager en ny.

## Kjør lokalt

```bash
npm install
npm run dev          # Vite på :5173 + server på :8080 (admin: http://localhost:5173/admin)
npm test             # enhetstester (Vitest)
npm run e2e          # Playwright-røyktest (bygger og starter serveren selv)
npm run loadtest     # 60 simulerte elever, p95 skal være under 200 ms
npm run build && ADMIN_PASSWORD=hemmelig npm start
```

Forhåndsvis en oppgave uten server: `http://localhost:5173/?task=homayoon-bar&os=linux`.

### Miljøvariabler

| variabel | standard | hva |
| --- | --- | --- |
| `PORT` | `8080` | port |
| `BASE_PATH` | `/` | under-sti, f.eks. `/tq` |
| `ADMIN_PASSWORD` | – | passord til `/admin`. **Uten passord kommer ingen inn som admin.** |
| `DATA_DIR` | `./data` | her lagres `session.json`, slik at en omstart ikke mister økten |
| `ASSETS_DIR` | `./assets` | bilder som ikke skal i git (se under) |

## Bilder: LimeZu og hodebilder

Begge mappene er git-ignorert og serveres av Node-serveren under `<BASE_PATH>/local-assets/`.

* **Hodebilder:** `assets/heads/homayoon.png`, `aleksander.png`, `eeman.png`. Bildet beskjæres til et kvadrat og pikselleres automatisk.
  Uten bilde brukes et farget hode med forbokstaven.
* **LimeZu «Modern Interiors» (gratis):** pakk ut pakken slik den er lastet ned, så mappene `Interiors_free/` og `Characters_free/`
  ligger rett under `assets/limezu/` (f.eks. `assets/limezu/Interiors_free/16x16/Interiors_free_16x16.png` og
  `assets/limezu/Characters_free/Adam_16x16.png`). Pakken er **kun for ikke-kommersiell bruk**: den er git-ignorert og
  ligger ikke i Docker-imaget. Sjekk lisensen (`assets/limezu/LICENSE.txt`) før noe publiseres.
* **Kartene** i `public/maps/` er Tiled JSON med bare tile-indekser (ingen bilder), og er med i git.
  `homayoon-bar.json`, `eeman-bank.json` og `aleksander-house.json` er LimeZu-versjonene; ved siden av ligger `*.placeholder.json`
  med plassholdergrafikk. Mangler grafikken (eller bare ett tileset), bruker nivået plassholderkartet automatisk og logger én advarsel.
* **Lag om kartene:** `npx tsx scripts/make-limezu-maps.ts` skriver de tre LimeZu-kartene (plasseringene står i skriptet,
  portert fra `docs/superpowers/plans/2026-10-18-level-layouts.py`). `npx tsx scripts/make-maps.ts` lager plassholderkartene.
* **Tiled:** kartene kan åpnes og redigeres i [Tiled](https://www.mapeditor.org/). Tilesetene peker på `../../assets/limezu/…`.
  Lag: `ground`, `walls`, `furniture` (bak figuren), `above` (foran figuren), `collision` (alt som ikke er tomt stopper figuren),
  objektlaget `spots` (navngitte punkter, navnene brukes av oppgavene) og valgfritt `sprites`: punkter nederst midt under spritens føtter (rute),
  `name` er enten en figur (`Adam`, `Alex`, `Amelia`, `Bob`, står stille; egenskapen `facing` = right/up/left/down) eller en
  egentegnet sprite (`toilet`, `bathtub`). Hodebilder og figurens kropp (`character.body`) er egne ting, se over.

## Deploy med Docker

```bash
docker build -t terminal-oppgaver .
docker run -p 8080:8080 \
  -e ADMIN_PASSWORD=hemmelig \
  -v tq-data:/data \
  -v "$PWD/assets:/app/assets:ro" \
  terminal-oppgaver
```

Åpne `http://<vert>:8080/`. Under en under-sti: `-e BASE_PATH=/tq` (da er siden på `http://<vert>/tq/`).
Bildene i `assets/` monteres inn og er ikke med i imaget.

### Bak reverse proxy (HTTPS)

WebSocket må slippes gjennom, og proxyen skal **ikke** fjerne `BASE_PATH`-prefikset. nginx:

```nginx
location /tq/ {
  proxy_pass http://127.0.0.1:8080;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 1h;
}
```

Caddy: `reverse_proxy 127.0.0.1:8080` (støtter WebSocket av seg selv). Serveren sender ping hvert 25. sekund slik at
proxyer ikke stenger stille forbindelser, og nettleserne kobler til igjen automatisk.

### Deploy på OpenStack (Terraform)

`infra/` lager en server på NTNU OpenStack med HTTPS (Caddy) på ditt eget domene. Se [infra/README.md](infra/README.md).

### Test på IDUN (5 minutter)

1. Bygg og start containeren på IDUN, og noter URL og port.
2. Åpne URL-en fra en annen maskin på eduroam (helst en telefon på skolens nett).
3. Elevsiden skal laste og vise navneskjermen. Åpne `/admin` og logg inn, og start en oppgave fra en annen fane.
   Fungerer det, er WebSocket oppe.
4. Hvis ikke: sjekk brannmur/port og at proxyen sender `Upgrade`-headere. Er IDUN ikke nåbar for elevene, bruk samme image på en annen
   container-vert (Fly.io, Render, Railway) eller en universitets-VM.
   En laptop på klasseromsnettet er siste utvei, siden eduroam ofte blokkerer trafikk mellom maskiner.

## Under panseret

* All terminal- og scenelogikk kjører i nettleseren (egen skall-motor → xterm.js, Phaser + Tiled). Skriving venter aldri på nettverket.
* Én Node-prosess serverer frontend og videresender tilstand over WebSocket. Tilstanden ligger i minnet og lagres i `DATA_DIR/session.json`.
* Første slutt en elev når i en oppgave er endelig og lagres på serveren. En omlasting etter slutten viser sluttskjermen igjen.
* Skriftene følger med i bygget (npm `@fontsource*`), ingenting hentes fra Google. Windows-terminalen er laget som Windows Terminal med Windows PowerShell-profilen og Campbell-fargene.
