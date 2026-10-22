import { defineTask } from "./api.js"

interface State {
  drinks: number
  usedLs: boolean
  /** Where tiss was run (relative to the root), or null while it has not been. */
  tissAt: string | null
  /** The girl at the sofakrok ran away after Homayoon hit on her. */
  girlGone: boolean
  cakeEaten: boolean
}

/** Drinking more than this many Hiroshimas makes Homayoon pass out. */
const PASS_OUT_ABOVE = 10

/** Oppgave 1. Commands practised: cd, ls, cd .., running scripts. Ending texts are placeholders the owner can edit. */
export const homayoonBar = defineTask<State>({
  id: "homayoon-bar",
  title: "Oppgave 1: Homayoon Bar",
  user: "homayoon",
  host: "bar",
  intro:
    "Homayoon har kommet seg inn på Circus (sjokkerende nok). Hjelp Homayoon med å drikke en Hiroshima og ha en fantastisk kveld! For å gjøre handlinger skriv handlingen i terminalen (f.eks. `kjop-hiroshima`).",
  map: "homayoon-bar.json",
  character: { name: "Homayoon", head: "homayoon.png", body: "Adam" },
  tree: { "bar-omrade": { bar: {}, sofakrok: {}, toalettet: {}, bord: {}, kake: {} }, bord: {}, kake: {} },
  doors: [{ name: "inngang", from: ["bar-omrade"], to: "." }],
  spots: {
    ".": "inngang",
    bord: "bord-inngang",
    "bar-omrade": "bar-omrade",
    "bar-omrade/bar": "bar",
    "bar-omrade/sofakrok": "sofakrok",
    "bar-omrade/toalettet": "toalett",
    "bar-omrade/bord": "bord",
    kake: "kake",
    "bar-omrade/kake": "kake",
  },
  commands: ["cd", "ls"],
  scripts: {
    "kjop-hiroshima": {
      dir: "bar-omrade/bar",
      run(ctx) {
        ctx.state.drinks++
        ctx.feedback(`Homayoon drakk en Hiroshima! (${ctx.state.drinks} totalt)`)
        ctx.scene.play("drink")
        if (ctx.state.drinks > PASS_OUT_ABOVE) ctx.scene.play("besvim")
      },
    },
    tiss: {
      dir: "*",
      visibleWhen: (s) => s.drinks >= 1,
      run(ctx) {
        ctx.state.tissAt = ctx.cwd
        ctx.scene.play("tiss")
      },
    },
    "sjekk-opp-jente": {
      dir: "bar-omrade/sofakrok",
      visibleWhen: (s) => !s.girlGone,
      run(ctx) {
        ctx.state.girlGone = true
        ctx.scene.say("Du er digg")
        ctx.scene.play("girl-flee")
      },
    },
    "spis-kake": {
      dir: ["kake", "bar-omrade/kake"],
      visibleWhen: (s) => !s.cakeEaten,
      run(ctx) {
        ctx.state.cakeEaten = true
        ctx.scene.say("mmmm digg kake, mann")
        ctx.scene.play("spis-kake")
      },
    },
  },
  initialState: { drinks: 0, usedLs: false, tissAt: null, girlGone: false, cakeEaten: false },
  onEvent(e, ctx) {
    if (e.type === "commandRun" && e.name === "ls") ctx.state.usedLs = true
  },
  steps: [
    {
      text: (s) =>
        s.drinks > 0
          ? `Hjelp Homayoon å drikke en Hiroshima (${s.drinks} drukket)`
          : "Hjelp Homayoon å drikke en Hiroshima",
      done: (s) => s.drinks >= 1,
      textOnCompletion:
        "Homayoon chugger hiroshimaen og merker med en gang at dette er alt for mye drikke for en iraner. Blæra presses på, og om ikke Homayoon for tisset snart kan han bare si takk og farvel til drømmen som profesjonell wrestler.",
    },
    { text: "Hjelp Homayoon å tisse på toalettet", done: (s) => s.tissAt === "bar-omrade/toalettet" },
  ],
  endings: [
    {
      id: "besvimte",
      correct: false,
      text: `Hiroshima nummer ${PASS_OUT_ABOVE + 1} ble en for mye. Homayoon besvimer og faller på gulvet.`,
      when: (s) => s.drinks > PASS_OUT_ABOVE,
    },
    {
      id: "toalett",
      correct: true,
      text: "Ahh, mye bedre! Homayoon tisset på toalettet.",
      when: (s) => s.tissAt === "bar-omrade/toalettet",
    },
    { id: "inngang", correct: false, text: "Rett utenfor døra? Seriøst?", when: (s) => s.tissAt === "." },
    {
      id: "bar",
      correct: false,
      text: "Bartenderen ble forbanna! Homayoon ble kastet ut av baren.",
      when: (s) => s.tissAt === "bar-omrade/bar",
    },
    {
      id: "bord",
      correct: false,
      text: "Midt blant bordene? Gjestene flyktet i skrekk.",
      when: (s) => s.tissAt === "bord",
    },
    {
      id: "bord-under-baren",
      correct: false,
      text: "Rett under baren? Gjestene mistet drinkene sine.",
      when: (s) => s.tissAt === "bar-omrade/bord",
    },
    {
      id: "sofakrok",
      correct: false,
      text: "Sofaen ble aldri helt den samme igjen.",
      when: (s) => s.tissAt === "bar-omrade/sofakrok",
    },
    {
      id: "kake",
      correct: false,
      text: "Rett ved kaken? Ingen fikk lyst på kake etter det.",
      when: (s) => s.tissAt === "kake" || s.tissAt === "bar-omrade/kake",
    },
    {
      id: "bar-omrade",
      correct: false,
      text: "Midt på gulvet? Der alle menneskene er? Seriøst?",
      when: (s) => s.tissAt === "bar-omrade",
    },
  ],
  hints: [
    { when: (s, cwd) => s.drinks >= 1 && cwd === "bar-omrade/toalettet", text: "Skriv `tiss`." },
    {
      when: (s, cwd) => s.drinks >= 1 && cwd === "bar-omrade/bar",
      text: "Homayoon må tisse! Bruk `cd ..` for å gå ut av baren.",
    },
    { when: (s) => s.drinks >= 1, text: "Bruk `ls` for å se etter toalettet, og gå dit med `cd`." },
    {
      when: (_s, cwd) => cwd === "bar-omrade/bar",
      text: "Bruk `ls` for å se hva du kan gjøre, og skriv `kjop-hiroshima`.",
    },
    { when: (s, cwd) => cwd === "." && !s.usedLs, text: "Skriv `ls` for å se hvor Homayoon kan gå." },
    { when: (_s, cwd) => cwd === ".", text: "Bruk `cd bar-omrade` for å gå inn i baren." },
    { when: (_s, cwd) => cwd === "bar-omrade", text: "Bruk `ls` for å se rommene, og gå til baren med `cd bar`." },
    { when: (_s, cwd) => cwd.startsWith("/"), text: "Du har gått ut av baren. Bruk `cd ~` for å komme tilbake." },
    {
      when: (_s, cwd) => cwd.startsWith("bar-omrade/"),
      text: "Bruk `cd ..` for å gå tilbake til bar-området, og så `cd bar`.",
    },
    { when: () => true, text: "Bruk `cd ..` for å gå tilbake til inngangen, og så `cd bar-omrade`." },
  ],
  stats: (s) => ({ hiroshimaer: s.drinks }),
})
