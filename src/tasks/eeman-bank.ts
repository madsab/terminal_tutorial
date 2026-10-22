import { defineTask, type TaskCtx } from "./api.js"

interface State {
  usedLs: boolean
  checked: boolean
  /** Tried one of the important actions, with or without sudo. */
  tried: boolean
  usedSudo: boolean
  /** The important action that was last refused, so the hint can name it. */
  lastDenied: string | null
  laughs: number
  withdrawn: boolean
  bribed: boolean
  /** Talked to the old man on the sofa. */
  heardYear: boolean
  /** Shouted with sudo: the safe door is open, and the police can be called. */
  robbing: boolean
  /** How the safe was opened, if it was. */
  opened: "kode" | "dynamitt" | null
  arrested: boolean
  /** Knocked the plant over with sudo. */
  plantFallen: boolean
  /** Kroner Eeman leaves with. Shown to the admin. */
  money: number
}

/** Kroner on Eeman's account. */
const SALDO = 10
/** Kroner in the safe. */
const SAFE = 2_000_000
/** Kroner left after the dynamite. */
const DYNAMITE_KEEPS = 1_400_000
const SAFE_CODE = "1962"

const PASSWORD = "Bank123"
const OLD_MAN_LINE = "Jeg husker da dette stedet åpnet i 1962."

const ROOMS = ["sofa", "skranke", "plante"]

/** 2000000 -> "2 000 000" */
const kroner = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")
/** The last sentence of every ending, so the admin sees how much money Eeman got. */
const got = (n: number) => `Eeman fikk med seg ${kroner(n)} kr.`

type Ctx = TaskCtx<State>

/** The common shape of an important action: refused without sudo (funny), succeeds with it. */
const important = (
  name: string,
  dir: string | string[],
  ok: (ctx: Ctx) => void,
  denied: (ctx: Ctx) => void,
  visibleWhen?: (s: State) => boolean,
) => ({
  dir,
  visibleWhen,
  requiresSudo: true,
  run(ctx: Ctx) {
    ctx.state.tried = true
    ctx.state.usedSudo = true
    ok(ctx)
  },
  onDenied(ctx: Ctx) {
    ctx.state.tried = true
    ctx.state.lastDenied = name
    denied(ctx)
  },
})

/** Oppgave 3. Commands practised: ls, running scripts, sudo. Texts are placeholders the owner can edit. */
export const eemanBank = defineTask<State>({
  id: "eeman-bank",
  title: "Oppgave 3: Eeman i banken",
  intro:
    "Eeman befinner seg i banken og ønsker å skaffe seg litt penger til en pen kjole og en shawarma til borteseminar. Kan du hjelpe henne med å skaffe penger? \n \n Noen handlinger er vanskligere å gjøre en andre. Dermed må du bruke `sudo` foran kommandoer for å utføre større viktigere handlinger. " +
    `\n\n Passordet er «${PASSWORD}». Du ser ingenting mens du skriver det, og det er helt normalt!`,
  user: "eeman",
  host: "bank",
  map: "eeman-bank.json",
  character: { name: "Eeman", head: "eeman.png", body: "Alex" },
  tree: { sofa: {}, skranke: {}, plante: {} },
  doors: [
    { name: "inngang", from: ROOMS, to: "." },
    ...ROOMS.flatMap((from) => ROOMS.filter((to) => to !== from).map((to) => ({ name: to, from: [from], to }))),
    { name: "safe", from: ROOMS, to: "safe", visibleWhen: (s) => s.robbing },
  ],
  spots: { ".": "inngang", sofa: "sofa", skranke: "skranke", plante: "plante", safe: "safe" },
  commands: ["cd", "ls", "sudo"],
  sudoPassword: PASSWORD,
  scripts: {
    "spor-om-penger": {
      dir: "skranke",
      run(ctx) {
        ctx.scene.say("Kan jeg få litt penger?")
        ctx.feedback(
          "Eeman spurte kasseren pent om penger. Kassereren smilte og sa: «Hvis du har en konto, kan jeg hjelpe deg med det.»",
        )
      },
    },
    "vis-saldo": {
      dir: ".",
      run(ctx) {
        ctx.state.checked = true
        ctx.feedback(`Saldoen er ${kroner(SALDO)} kr. Akkurat nok til en drops på Power.`)
      },
    },
    "snakk-med-gammel-mann": {
      dir: "sofa",
      visibleWhen: (s) => !s.robbing,
      run(ctx) {
        ctx.state.heardYear = true
        ctx.scene.say(OLD_MAN_LINE)
        ctx.feedback(OLD_MAN_LINE)
      },
    },
    "ring-politiet": {
      ...important(
        "ring-politiet",
        [".", ...ROOMS, "safe"],
        (ctx) => {
          ctx.state.arrested = true
          ctx.scene.play("police")
          ctx.feedback("Eeman ringte politiet midt i sitt eget ran. For et geni")
        },
        (ctx) => ctx.feedback("Bro, jeg ringer ikke politiet midt i et ran"),
      ),
      visibleWhen: (s) => s.robbing,
    },
    "apne-safe": {
      dir: "safe",
      visibleWhen: (s) => s.robbing,
      run(ctx) {
        if (ctx.sudo) {
          ctx.state.usedSudo = true
          ctx.state.opened = "dynamitt"
          ctx.state.money = DYNAMITE_KEEPS
          ctx.scene.play("dynamite")
          ctx.feedback("BOOM! Eeman sprengte safen.")
          return
        }
        if (ctx.args.length === 0) return "apne-safe: safen er låst. Bruk: apne-safe <kode>"
        if (ctx.args[0] !== SAFE_CODE) return "apne-safe: feil kode"
        ctx.state.opened = "kode"
        ctx.state.money = SAFE
        ctx.scene.play("cash")
        ctx.feedback("Klikk! Safen gikk opp.")
      },
    },
    "ta-ut-penger": important(
      "ta-ut-penger",
      "skranke",
      (ctx) => {
        ctx.state.withdrawn = true
        ctx.state.money = SALDO
        ctx.scene.play("cash")
        ctx.feedback("Eeman tok ut pengene sine, helt lovlig.")
      },
      (ctx) => ctx.feedback("Kassereren: «Du trenger administratorrettigheter for å ta ut penger.»"),
      (s) => !s.robbing,
    ),
    "skrik-gi-meg-penger": {
      ...important(
        "skrik-gi-meg-penger",
        [".", ...ROOMS],
        (ctx) => {
          ctx.state.robbing = true
          ctx.vfs.mkdir(`${ctx.shell.home}/safe`)
          ctx.scene.play("robber")
          ctx.scene.say("GI MEG PENGENE!")
          ctx.feedback("Eeman dar frem en pistol! GI MEG PENGA!!!")
        },
        (ctx) => {
          ctx.state.laughs++
          ctx.scene.say("GI MEG PENGER!")
          ctx.scene.play("laugh")
          ctx.feedback("Eeman skrek «GI MEG PENGER!» Alle i banken lo av henne.")
        },
      ),
      visibleWhen: (s) => !s.robbing,
    },
    "velt-plante": {
      dir: "plante",
      requiresSudo: true,
      run(ctx) {
        ctx.state.plantFallen = true
        ctx.scene.play("velt-plante")
        ctx.feedback("Eeman veltet planten. Det ble jord over hele gulvet.")
      },
      onDenied(ctx) {
        ctx.scene.say("Burde nok ikke gjøre det")
        ctx.feedback("Burde nok ikke gjøre det")
      },
    },
    "bestikk-kassereren": important(
      "bestikk-kassereren",
      "skranke",
      (ctx) => {
        ctx.state.bribed = true
        ctx.scene.play("cash")
        ctx.scene.say("Her er en liten gave til deg, kassereren.")
        ctx.feedback("Eeman la en konvolutt på disken. Kassereren ble ikke imponert.")
      },
      (ctx) => ctx.feedback("Kassereren løftet et øyebryn: «Prøver du å bestikke meg?»"),
    ),
  },
  initialState: {
    usedLs: false,
    checked: false,
    tried: false,
    usedSudo: false,
    lastDenied: null,
    laughs: 0,
    withdrawn: false,
    bribed: false,
    heardYear: false,
    robbing: false,
    opened: null,
    arrested: false,
    plantFallen: false,
    money: 0,
  },
  onEvent(e, ctx) {
    if (e.type === "commandRun" && e.name === "ls") ctx.state.usedLs = true
  },
  steps: [
    {
      text: "Se hva Eeman kan gjøre i banken",
      done: (s) => s.usedLs,
      textOnCompletion: "Eeman ser seg rundt omkring i banken. Hun tenker «Hvordan kan jeg skaffe meg penger her?»",
    },
    { text: "Hjelp Eeman ta ut penger fra banken", done: (s) => s.money > 0 },
  ],
  endings: [
    {
      id: "uttak",
      correct: true,
      text: `Eeman tar du det resterende beløpet hun har på konto. «Flott!», sier hun sarkastisk. «Nå har jeg råd til to drops på Power» ${got(SALDO)}`,
      when: (s) => s.withdrawn,
    },
    {
      id: "bestikkelse",
      correct: false,
      text: `Bestikkelse! Kassereren trykket på alarmknappen, og Eeman ble pågrepet. ${got(0)}`,
      when: (s) => s.bribed,
    },
    {
      id: "ran-kode",
      correct: true,
      text: `Eeman åpnet safen med koden og stakk av med sekken full av penger. Politisirener nærmer seg... ${got(SAFE)}`,
      when: (s) => s.opened === "kode",
    },
    {
      id: "ran-dynamitt",
      correct: true,
      text: `Eeman sprengte safen med dynamitt. Noen av pengene brant opp. ${got(DYNAMITE_KEEPS)}`,
      when: (s) => s.opened === "dynamitt",
    },
    {
      id: "arrestert",
      correct: false,
      text: `Eeman ringte politiet midt i sitt eget ran og ble arrestert på stedet. For et geni. ${got(0)}`,
      when: (s) => s.arrested,
    },
  ],
  hints: [
    {
      when: (s, cwd) => s.robbing && cwd !== "safe",
      text: (_os, s) =>
        s.heardYear
          ? "Ranet er i gang! Gå til safen med `cd safe` og har vi hørt noe om en kode?"
          : "Ranet er i gang! Gå til safen med `cd safe`.",
    },
    {
      when: (s) => s.robbing && !s.heardYear,
      text: "Safen er låst med en kode. Vi må bruke makt for å få den opp. `sudo`",
    },
    { when: (s) => s.robbing, text: `Den gamle mannen husket året banken åpnet. Skriv \`apne-safe ${SAFE_CODE}\`.` },
    { when: (s) => !s.usedLs, text: "Skriv `ls` for å se hva Eeman kan gjøre i banken." },
    {
      when: (s) => s.lastDenied !== null && !s.usedSudo,
      text: (_os, s) =>
        `Det krever administratorrettigheter. Skriv \`sudo ${s.lastDenied}\`. Passordet står i oppgaveteksten, og du ser ingenting mens du skriver det.`,
    },
    {
      when: (s, cwd) => !s.tried && cwd !== "skranke",
      text: "Bruk `cd skranke` for å gå til skranken, og se hva du kan gjøre der med `ls`.",
    },
    {
      when: (s) => !s.tried,
      text: "Kjør et av skriptene ved å skrive navnet, for eksempel `spor-om-penger` eller `ta-ut-penger`.",
    },
    { when: () => true, text: "Prøv et annet skript, eller sett `sudo` foran for å kjøre det som administrator." },
  ],
  stats: (s) => ({ latter: s.laughs, kroner: s.money }),
})
