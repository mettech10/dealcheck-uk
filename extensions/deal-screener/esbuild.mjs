#!/usr/bin/env node
/**
 * Bundle the MV3 service worker + popup, copy static assets into dist/.
 * Load unpacked from dist/ — see README.md.
 */
import * as esbuild from "esbuild"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.dirname(fileURLToPath(import.meta.url))
const dist = path.join(root, "dist")
const src = path.join(root, "src")

fs.rmSync(dist, { recursive: true, force: true })
fs.mkdirSync(dist, { recursive: true })

function copyFile(from, to) {
  fs.mkdirSync(path.dirname(to), { recursive: true })
  fs.copyFileSync(from, to)
}

const aliasPlugin = {
  name: "alias-at",
  setup(build) {
    build.onResolve({ filter: /^@\// }, (args) => ({
      path: path.join(root, "../..", args.path.slice(2)),
    }))
  },
}

async function bundle() {
  await esbuild.build({
    absWorkingDir: root,
    entryPoints: {
      background: path.join(src, "background.ts"),
      popup: path.join(src, "popup.ts"),
    },
    outdir: dist,
    bundle: true,
    format: "esm",
    target: ["chrome114"],
    platform: "browser",
    sourcemap: true,
    plugins: [aliasPlugin],
    logLevel: "info",
  })

  copyFile(path.join(root, "manifest.json"), path.join(dist, "manifest.json"))
  copyFile(path.join(src, "popup.html"), path.join(dist, "popup.html"))
  copyFile(path.join(src, "popup.css"), path.join(dist, "popup.css"))
  copyFile(path.join(src, "collect-rightmove.js"), path.join(dist, "collect-rightmove.js"))

  const iconsDir = path.join(root, "icons")
  if (fs.existsSync(iconsDir)) {
    for (const file of fs.readdirSync(iconsDir)) {
      copyFile(path.join(iconsDir, file), path.join(dist, "icons", file))
    }
  }
}

bundle().catch((err) => {
  console.error(err)
  process.exit(1)
})
