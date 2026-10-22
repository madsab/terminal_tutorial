# Slik skriver du en oppgave

En oppgave er **én fil** i `src/tasks/` pluss et kart. Motoren, scenen og skjermene trenger ingen endringer.
Eksempelet under er `src/tasks/homayoon-bar.ts` (oppgave 1). Les den ved siden av denne guiden.

Husk reglene: all tekst eleven ser (oppgavetekst, hint, tilbakemelding, slutter) er **norsk**. Alt terminalen skriver
(prompt, utskrift, feilmeldinger) er **engelsk** og skal ligne det ekte skallet. Mappe- og skriptnavn har **ikke æ, ø, å**.
Tilbakemelding fra historien skrives aldri i terminalen, men i oppgavevinduet.

## 1. Skjelettet

```ts
export const homayoonBar = defineTask<State>({
  id: 'homayoon-bar',            // brukes i ?task=… og av admin
  title: 'Oppgave 1: Homayoon Bar',
  intro: '…',                    // valgfri oppgavetekst under tittelen (f.eks. sudo-passordet)
  user: 'homayoon', host: 'bar', // gir prompten  homayoon@bar ~ %
  map: 'homayoon-bar.json',      // Tiled-kart i public/maps
  character: { name: 'Homayoon', head: 'homayoon.png' },  // bilde i assets/heads/
  tree: { bar: {}, bord: {}, toalett: {} },                // mappene (nøstet objekt)
  spots: { '.': 'inngang', bar: 'bar', … },                // mappe → punkt på kartet
  commands: ['cd', 'ls', 'pwd', 'clear'],                  // fra kommandobiblioteket
  scripts: { … }, initialState: { … }, steps: […], endings: […], hints: […], stats: …,
});
```

En `commands`-oppføring kan være en hel kommandolinje (f.eks. `'pip install pet_python'`); den slås opp på første ord. `python` forutsetter `source`.

Legg til en linje i `src/tasks/registry.ts` (`taskOrder`). Rekkefølgen der er rekkefølgen admin går gjennom.

## 2. Mappetreet og hjemmemappen

`tree` er mappene under «hjemmemappen» `~` (`/Users/<user>` på Mac, `/home/<user>` på Linux, `C:\Users\<user>` på Windows).
`~` er utgangspunktet, ofte inngangen. Utenfor treet finnes en realistisk, nesten tom filstruktur, slik at `cd ..`,
`cd /` og `cd C:\` fungerer som i det ekte skallet. Står eleven utenfor treet, går figuren til inngangen (`spots['.']`).

## 3. Tilstand

`initialState` er hele tilstanden til oppgaven (`drinks`, `tissAt`, …). Den klones for hver elev.
Skript og `onEvent` endrer den. Stegene, slutter, hint og statistikk leser den.

## 4. Skript

Et skript er en «kommando» som ligger i en mappe, vises av `ls` og kjøres med navnet (også `./navn`, `.\navn` i PowerShell).
Utenfor mappen sin gir det skallets ekte «command not found».

```ts
'kjop-hiroshima': {
  dir: 'bar',                       // mappe, liste av mapper, eller '*' for alle mapper (inkludert ~)
  run(ctx) {
    ctx.state.drinks++;
    ctx.feedback(`Homayoon drakk en Hiroshima! (${ctx.state.drinks} totalt)`);  // oppgavevinduet
    ctx.scene.play('drink');                                                    // scenen
    // return 'tekst' skriver tekst i terminalen (engelsk!). Uten return skrives ingenting.
  },
},
tiss: { dir: '*', visibleWhen: (s) => s.drinks >= 1, run(ctx) { … } },
```

* `visibleWhen`: et skript som ikke er synlig finnes ikke. Det vises ikke i `ls` og gir «command not found» (se `tiss`).
* `requiresSudo: true`: uten `sudo` skriver terminalen en ekte tillatelsesfeil, og `onDenied(ctx)` kalles slik at du kan vise
  den norske konsekvensen i oppgavevinduet. Med `sudo` kjøres `run`, og `ctx.sudo` er `true`. Se `eeman-bank.ts`.
  `sudoPassword` i oppgaven er passordet (vis det i `intro`).
* `ctx.cwd` er mappen relativt til roten (`'.'` er inngangen). Utenfor treet er den en absolutt sti som starter med `/`.

## 4b. Dører

Rommene er vanlige mapper i `tree`. En dør er en «mappe» i et rom som `cd` følger til et annet rom, uten at stien vokser:

```ts
doors: [
  { name: 'kjokken', from: ['stue'], to: 'kjokken' },                               // to: '.' er inngangen
  { name: 'hemmelig', from: ['stue'], to: 'kjeller', visibleWhen: (s) => s.open },  // finnes først når s.open
],
hiddenFolders: ['kjeller'],   // ekte mapper som ikke vises i vanlig ls
```

Skjulte mapper (`hiddenFolders`) kan fortsatt nås med `cd`, og de vises med `ls -a`.

Etter `cd kjokken` er `pwd` den ekte stien, så `cd ..` går til den ekte forelderen. I `ls` er en dør en vanlig mappe.
Skript får argumentene sine i `ctx.args` (`foo 1962` gir `['1962']`).

## 5. Hendelser: `onEvent`

Skallet sender `cwdChanged`, `commandRun { name, args, ok }` og `custom` (f.eks. `venvCreated`, `pipInstall`).
`onEvent(e, ctx)` er stedet for logikk som ikke hører til et enkelt skript. Oppgave 1 bruker det til å huske at eleven har kjørt `ls`
(for hintet). Oppgave 2 bygger hele buret/slange-modellen på `custom`-hendelsene.

## 6. Steg, slutter, hint, statistikk

* `steps`: `{ text, done(s), textOnCompletion? }`. `text` kan være en funksjon av tilstanden (for «3 drukket»).
  `textOnCompletion` er historietekst som vises under målet når det er fullført, før neste mål (også tekst eller funksjon).
* `endings`: `{ id, text, correct, when(s, e) }`. Første som matcher vinner, og den første slutten er endelig.
  Alle slutter teller som «ferdig» hos admin, og `correct` vises som ✓ / ✗. Når eleven er ferdig, åpnes en resultatdialog med
  sluttteksten, målene (avkrysset eller ikke) og statistikken.
* `hints`: den første `when(s, cwd)` som er sann gir hintet. `text` kan være en funksjon `(os, s) => string` når kommandoene
  er ulike per OS (se aktivering av venv i `aleksander-python.ts`).
* `stats`: tall som admin ser som egne kolonner (`hiroshimaer`).

## 7. Scenen og kartet

Kartet lages i **Tiled** og lagres som JSON i `public/maps/`. Det må ha:

* et tegnlag som heter `collision` (felt med flis = blokkert, brukes til veifinning), og tegnlag for utseendet (`ground`, `furniture`),
* et objektlag `spots` med **punkter** (point objects) med navn, f.eks. `inngang`, `bar`, `toalett`. Det første punktet er der figuren starter.

Oppgaven knytter mapper til punkter med `spots`. Bytter eleven mappe, går figuren dit. En mappe uten eget punkt bruker nærmeste forelder.
Tilesets som kartet viser til lastes fra `assets/limezu/<bildefilen>`. Finnes de ikke, brukes plassholdergrafikk.
Plassholderkartene lages av `npx tsx scripts/make-maps.ts` (kun det eieren har beskrevet).

`ctx.scene` kan:

| kall | hva |
| --- | --- |
| `walkTo(spot)` | figuren går til et punkt (nye kall avbryter en pågående gange) |
| `play(anim)` | liten animasjon, f.eks. `drink`, `tiss` (lager også en gul flekk på gulvet), `laugh`, `cash`, og `robber` (skimaske og pistol som blir på Eeman, og alle andre enn de ansatte skriker og løper ut gjennom inngangen), `dynamite`, `police`, `velt-plante` (planten i banken velter, med jord på gulvet), og `besvim` (Homayoon legger seg ned på gulvet og blir liggende) |
| `say(text)` | snakkeboble |
| `spawn(id, kind, spotEllerId, label?)` | legger ut et objekt (`cage`, `snake`, …). Stedet kan være et punkt eller id-en til et annet objekt |
| `move(id, spot)`, `wander(id)`, `remove(id)` | flytt, la vandre tilfeldig, fjern |

Scenen venter aldri på animasjoner. Mange kommandoer på rad hopper videre, og tellerne i tilstanden er alltid nøyaktige.

## 8. Forhåndsvisning

Åpne en oppgave direkte uten server og admin:

```
http://localhost:5173/?task=homayoon-bar&os=linux       (os = mac | linux | windows)
```

(`npm run dev`). Her kan du gå gjennom hele oppgaven og se scenen, sjekklisten og hintet.

## 9. Test oppgaven som skript

`runTaskScript(def, mode, lines)` kjører kommandoer mot oppgaven i én OS-modus og gir tilbake tilstand, siste oppdatering
(steg, hint, slutt, tilbakemelding, statistikk), terminalutskrift per linje og alle scene-kall.
En linje som kommer mens terminalen spør om skjult passord, besvarer spørsmålet.

```ts
const r = await runTaskScript(homayoonBar, 'windows', ['cd bar', 'kjop-hiroshima', 'cd ..', 'cd toalett', 'tiss']);
expect(r.update.ending).toMatchObject({ id: 'toalett', correct: true });
expect(r.update.hint).toBe(…);
```

Kjør hver test i alle tre modusene (`describe.each(MODES)`), som i `tests/tasks/homayoon-bar.test.ts`.

## 10. Nye kommandoer

Kommandoene ligger i `src/shell/commands/` og registreres i `src/shell/commands/index.ts` med navn og alias per OS. Oppgaven velger
dem med `commands: [...]`. En ny kommando får `ctx.shell`, `ctx.vfs` (filsystemet kan endres av kommandoer), `ctx.emit(...)` for hendelser
og `ctx.mode`. En `commands`-oppføring kan være en hel kommandolinje (f.eks. `'pip install pet_python'`), løst opp på første ord, og `python` innebærer `source`. Skriv skallets ekte feilmeldinger (tester per OS ligger i `tests/shell/`).
