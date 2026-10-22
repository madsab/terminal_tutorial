import { readFile, stat } from "node:fs/promises"
import { createServer, type ServerResponse } from "node:http"
import type { AddressInfo } from "node:net"
import { extname, join, normalize, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"
import { WebSocketServer } from "ws"
import { taskOrder } from "../tasks/registry.js"
import { Hub } from "./hub.js"
import { Session, type TaskInfo } from "./session.js"

export interface ServerOptions {
  port: number
  basePath: string
  dataDir: string
  /** Built front end. Defaults to dist/client next to the compiled server. */
  staticDir?: string
  /** Git-ignored art (head photos, LimeZu). Only heads/ and limezu/ are served. Defaults to ./assets. */
  assetsDir?: string
  adminPassword?: string
  /** Tasks the admin steps through. Defaults to the registry. */
  tasks?: TaskInfo[]
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
}

export function normalizeBase(base: string): string {
  const trimmed = base.replace(/^\/+|\/+$/g, "")
  return trimmed ? `/${trimmed}` : ""
}

function defaultStaticDir(): string {
  // dist/server/server/index.js -> dist/client
  return resolve(fileURLToPath(new URL(".", import.meta.url)), "../../client")
}

export async function startServer(opts: ServerOptions): Promise<{ close(): Promise<void>; url: string }> {
  const base = normalizeBase(opts.basePath)
  const staticDir = resolve(opts.staticDir ?? defaultStaticDir())
  const assetsDir = resolve(opts.assetsDir ?? "assets")

  async function sendFile(res: ServerResponse, root: string, rel: string): Promise<void> {
    const file = normalize(join(root, rel))
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(404).end("Not found")
      return
    }
    try {
      if (!(await stat(file)).isFile()) throw new Error("not a file")
      const body = await readFile(file)
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" })
      res.end(body)
    } catch {
      res.writeHead(404).end("Not found")
    }
  }

  const http = createServer(async (req, res) => {
    let pathname: string
    try {
      pathname = decodeURIComponent((req.url ?? "/").split("?")[0])
    } catch {
      res.writeHead(400).end("Bad request")
      return
    }
    // Asset links are relative, so the page must be served from a URL with the right depth.
    if (base && pathname === base) {
      res.writeHead(301, { location: `${base}/` }).end()
      return
    }
    if (pathname === `${base}/admin/`) {
      res.writeHead(301, { location: `${base}/admin` }).end()
      return
    }
    if (pathname !== base && !pathname.startsWith(`${base}/`)) {
      res.writeHead(404).end("Not found")
      return
    }
    let rel = pathname.slice(base.length) || "/"
    if (rel === "/admin" || rel === "/admin/") rel = "/admin.html"
    if (rel.endsWith("/")) rel += "index.html"
    const asset = /^\/local-assets\/(heads|limezu)\/(.+)$/.exec(rel)
    if (asset) return sendFile(res, join(assetsDir, asset[1]), asset[2])
    if (rel.startsWith("/local-assets/")) {
      res.writeHead(404).end("Not found")
      return
    }
    return sendFile(res, staticDir, rel)
  })

  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 })
  http.on("upgrade", (req, socket, head) => {
    const pathname = (req.url ?? "").split("?")[0]
    if (pathname !== `${base}/ws`) {
      socket.destroy()
      return
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req))
  })
  const session = new Session(opts.dataDir, opts.tasks ?? taskOrder.map((t) => ({ id: t.id, title: t.title, intro: t.intro })))
  const hub = new Hub(session, opts.adminPassword, () => wss.clients)
  wss.on("connection", (ws) => hub.attach(ws))

  await new Promise<void>((ok) => http.listen(opts.port, ok))
  const port = (http.address() as AddressInfo).port
  return {
    url: `http://localhost:${port}`,
    close: async () => {
      hub.close()
      await session.flush()
      await new Promise<void>((ok) => {
        for (const c of wss.clients) c.terminate()
        wss.close()
        http.close(() => ok())
        http.closeAllConnections()
      })
    },
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT ?? 8080)
  const basePath = process.env.BASE_PATH ?? "/"
  startServer({
    port,
    basePath,
    dataDir: process.env.DATA_DIR ?? "./data",
    assetsDir: process.env.ASSETS_DIR,
    adminPassword: process.env.ADMIN_PASSWORD || "supersecretpp",
  }).then((s) => console.log(`Server kjører på ${s.url}${normalizeBase(basePath)}/`))
}
