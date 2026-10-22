import { defineTask } from "./api.js"

interface Cage {
  /** Folder the cage lives in, relative to the root. */
  room: string
  name: string
  snakes: number
}

interface State {
  /** Keyed by the cage folder's path relative to the root, e.g. "soverom/.venv". */
  cages: Record<string, Cage>
  /** Path of the activated cage, or null. */
  active: string | null
  loose: number
  snakeSeq: number
  usedLs: boolean
  visitedBedroom: boolean
  everActivated: boolean
}

const SPOTS: Record<string, string> = { ".": "stue", soverom: "soverom", kjokken: "kjokken", bad: "bad" }

/** The map spot for a folder: its own, else the nearest parent's, else the entrance. */
function spotFor(rel: string): string {
  let probe = rel
  while (probe !== "." && !probe.startsWith("/")) {
    if (probe in SPOTS) return SPOTS[probe]
    probe = probe.includes("/") ? probe.slice(0, probe.lastIndexOf("/")) : "."
  }
  return SPOTS["."]
}

const roomOf = (rel: string) => (rel.includes("/") ? rel.slice(0, rel.lastIndexOf("/")) : ".")
const nameOf = (rel: string) => rel.slice(rel.lastIndexOf("/") + 1)
const caged = (s: State) => Object.values(s.cages).filter((c) => c.snakes > 0)
const empty = (s: State) => Object.entries(s.cages).filter(([, c]) => c.snakes === 0)
const roomName = (room: string) => (room === "." ? "stua" : room)

const activateCmd = (os: string, cage: Cage) =>
  os === "windows" ? `${cage.name}\\Scripts\\Activate.ps1` : `source ${cage.name}/bin/activate`
const goBack = (room: string) => (room === "." ? "cd ~" : `cd ~/${room}`)

/** Oppgave 2. Commands practised: cd, ls, python -m venv, activating a venv, pip install. Texts are placeholders the owner can edit. */
export const aleksanderPython = defineTask<State>({
  id: "aleksander-python",
  title: "Oppgave 2: Aleksanders pythonslange",
  user: "aleksander",
  host: "hus",
  intro:
    "Aleksander har kommet hjem etter en sykkeltur til dyrebutikken. Han har kjøpt en pythonslange som han vil kose med. Hjelp Aleksander med å sette slangen sin i bur ;). \n\n For å sette ut et bur `python -m venv <navn på bur>`. For å plassere en slange: `pip install pet_python`. Husk å åpne buret før man setter inn slangen! ",
  map: "aleksander-house.json",
  character: { name: "Aleksander", head: "aleksander.png", body: "Alex" },
  tree: { soverom: {}, kjokken: {}, bad: {} },
  hiddenFolders: ["kjokken"],
  doors: [
    { name: "stue", from: ["soverom", "bad"], to: "." },
    { name: "kjokken", from: ["soverom", "bad"], to: "kjokken" },
    { name: "soverom", from: ["kjokken"], to: "soverom" },
    { name: "bad", from: ["kjokken"], to: "bad" },
  ],
  spots: SPOTS,
  commands: ["cd", "ls", "python", "pip install pet_python", "deactivate"],
  scripts: {},
  initialState: {
    cages: {},
    active: null,
    loose: 0,
    snakeSeq: 0,
    usedLs: false,
    visitedBedroom: false,
    everActivated: false,
  },
  onEvent(e, ctx) {
    const s = ctx.state
    if (e.type === "cwdChanged") {
      if (ctx.relative(e.to) === "soverom") s.visitedBedroom = true
    } else if (e.type === "commandRun") {
      if (e.name === "ls") s.usedLs = true
    } else if (e.type === "custom") {
      const data = e.data as { path?: string | null; venvPath?: string | null } | undefined
      if (e.name === "venvCreated" && data?.path) {
        const rel = ctx.relative(data.path)
        if (rel.startsWith("/") || s.cages[rel]) return
        s.cages[rel] = { room: roomOf(rel), name: nameOf(rel), snakes: 0 }
        ctx.vfs.setForceVisible(data.path, true) // cages show in ls even when dot-named
        ctx.scene.spawn(`cage:${rel}`, "cage", spotFor(roomOf(rel)), nameOf(rel))
        ctx.feedback(`Et bur «${nameOf(rel)}» ble laget i ${roomName(roomOf(rel))}.`)
      } else if (e.name === "venvActivated" && data?.path) {
        const rel = ctx.relative(data.path)
        if (!s.cages[rel]) return
        s.active = rel
        s.everActivated = true
        ctx.feedback(`Buret «${s.cages[rel].name}» er åpent. Slanger du installerer havner nå her.`)
      } else if (e.name === "venvDeactivated") {
        s.active = null
        ctx.feedback("Buret er lukket igjen. Nye slanger slipper løs i huset.")
      } else if (e.name === "pipInstall") {
        const rel = data?.venvPath ? ctx.relative(data.venvPath) : null
        const id = `snake-${++s.snakeSeq}`
        if (rel && s.cages[rel]) {
          s.cages[rel].snakes++
          ctx.scene.spawn(id, "snake", `cage:${rel}`)
          ctx.feedback(`En python ble satt i buret «${s.cages[rel].name}» (${s.cages[rel].snakes} der).`)
        } else {
          s.loose++
          ctx.scene.spawn(id, "snake", spotFor(ctx.cwd))
          ctx.scene.wander(id)
          ctx.feedback(`Pytonen slapp løs i huset! (${s.loose} løse)`)
        }
      }
    }
  },
  steps: [
    {
      text: "Gå til soverommet",
      done: (s) => s.visitedBedroom,
      textOnCompletion: "Aleksander går inn på soverommet, hvor han har tenkt å sette slangen sin i et bur ;)",
    },
    {
      text: "Lag et bur til pytonen",
      done: (s) => Object.keys(s.cages).length > 0,
      textOnCompletion:
        "Aleksander plasserer ut et bur han fikk for 4999kr på Musti. «Å se så fint bur. Dette blir scphaa», sier Aleksander. Nå må han åpne buret for å sette inn slangen.",
    },
    { text: "Åpne buret slik at pytonen kan flytte inn", done: (s) => s.everActivated },
    {
      text: "Sett en python i buret",
      done: (s) => caged(s).length > 0,
      textOnCompletion:
        "«Her skal du få bo lille Alexander Kristoff» sier Aleksander. Så skal jeg se om jeg får satt ut et bur til Thor Hushovd også.",
    },
    {
      text: "Sett en python i et annet bur også",
      done: (s) => caged(s).length >= 2,
      textOnCompletion:
        "«Å der var også Thor inne i buret. Dette blir scphaa», sier Aleksander mens han smiler. Han er en stolt dyreeier.",
    },
  ],
  endings: [
    {
      id: "vellykket",
      correct: true,
      text: "«Perfekt!», roper Aleksander. To bur, og en fornøyd python i hvert. Aleksander er stolt dyreeier med to store slanger.",
      when: (s) => caged(s).length >= 2,
    },
    {
      id: "dead-aleksander",
      correct: false,
      text: "Pytoner overalt! Aleksander prøver å flykte, men blir spist av sin egen slangeplage.",
      when: (s) => s.loose > 10,
    },
    {
      id: "dead-from-cages",
      correct: false,
      text: "Aleksander plasserer tar et dypt pust og plasserer det siste buret. Han kjenner det presse på brystet. «Dette rommet var ikke bygget for så mange bur.», tenker Aleksander før han lukker øynene og blir klemt ihjel.",
      when: (s) => {
        const perRoom: Record<string, number> = {}
        for (const c of Object.values(s.cages)) perRoom[c.room] = (perRoom[c.room] ?? 0) + 1
        return Object.values(perRoom).some((n) => n > 10)
      },
    },
    {
      id: "dead-snakes",
      correct: false,
      text: "Elleve pytoner i ett bur. Aleksander skjønner ikke hva han har gjort. «Hadde han ikke bare 2?», gråter Aleksander. Det er stille. Skyldfølelsen blir for mye. Aleksander dør av hjertesorg over hva han har gjort.",
      when: (s) => Object.values(s.cages).some((c) => c.snakes > 10),
    },
  ],
  hints: [
    {
      when: (s, cwd) => Object.keys(s.cages).length === 0 && !s.visitedBedroom && cwd !== "soverom",
      text: "Gå til soverommet med `cd ~/soverom`.",
    },
    {
      when: (s) => Object.keys(s.cages).length === 0,
      text: "Lag et bur med `python -m venv .venv` (navnet kan være hva du vil, for eksempel `python -m venv bur`).",
    },
    { when: (s) => !s.usedLs, text: "Skriv `ls` for å se buret du laget." },
    {
      when: (s, cwd) => s.active === null && empty(s).length > 0 && cwd !== empty(s).at(-1)![1].room,
      text: (_os, s) => {
        const room = empty(s).at(-1)![1].room
        return `Gå tilbake til rommet med buret (\`${goBack(room)}\`), og aktiver det der.`
      },
    },
    {
      when: (s) => s.active === null && empty(s).length > 0,
      text: (os, s) =>
        `Aktiver buret med \`${activateCmd(os, empty(s).at(-1)![1])}\`. Da havner slanger du installerer i det.`,
    },
    { when: (s) => s.active === null, text: "Lag et nytt bur med `python -m venv bur2`, og aktiver det." },
    {
      when: (s) => s.active !== null && s.cages[s.active]?.snakes === 0,
      text: "Sett en python i buret med `pip install pet_python`.",
    },
    {
      when: (s) => empty(s).length > 0,
      text: (os, s) => {
        const [, cage] = empty(s).at(-1)!
        return `Kjør \`deactivate\`, og aktiver så det nye buret med \`${activateCmd(os, cage)}\`.`
      },
    },
    { when: () => true, text: "Lag et nytt bur med `python -m venv bur2`, aktiver det, og installer en python der." },
  ],
  stats: (s) => ({
    bur: Object.keys(s.cages).length,
    pythonerIBur: Object.values(s.cages).reduce((n, c) => n + c.snakes, 0),
    pythonerLoes: s.loose,
  }),
})
