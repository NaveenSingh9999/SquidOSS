#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, rmSync, cpSync } from 'node:fs'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const NM = resolve(ROOT, 'node_modules')
const PKG = resolve(ROOT, 'package.json')
const ARCH = process.arch
const PLATFORM = process.platform
const IS_ARM = ARCH === 'arm64' || ARCH === 'aarch64'
const IS_ANDROID = PLATFORM === 'android'

console.log(`[arm64-fix] Arch: ${ARCH}, Platform: ${PLATFORM}`)
console.log(`[arm64-fix] Detected ${IS_ARM ? 'ARM64' : 'non-ARM'} platform`)

if (!IS_ARM && !IS_ANDROID) {
  console.log('[arm64-fix] Not ARM64/Android, skipping fixes')
  process.exit(0)
}

let fixed = 0

function fixMissingEsm(dir) {
  const pkgJson = resolve(dir, 'package.json')
  if (!existsSync(pkgJson)) return
  const pkg = JSON.parse(readFileSync(pkgJson, 'utf8'))
  const distDir = resolve(dir, 'dist')
  if (!existsSync(distDir)) return
  
  const main = pkg.main?.replace(/^\.\//, '')
  const module = pkg.module?.replace(/^\.\//, '')
  
  if (module && !existsSync(resolve(dir, module)) && main) {
    const src = resolve(dir, main)
    const dst = resolve(dir, module)
    if (existsSync(src)) {
      const ext = module.endsWith('.mjs') ? '.mjs' : '.mjs'
      const content = readFileSync(src, 'utf8')
      if (module.endsWith('.mjs')) {
        writeFileSync(dst, content)
      } else {
        copyFileSync(src, dst)
      }
      console.log(`  ✓ Fixed missing ESM: ${pkg.name}`)
      fixed++
    }
  }
  
  if (pkg.exports) {
    for (const [key, exp] of Object.entries(pkg.exports)) {
      if (typeof exp !== 'object') continue
      for (const [cond, entry] of Object.entries(exp)) {
        if (cond === 'import' && typeof entry === 'object' && entry.default) {
          const p = entry.default.replace(/^\.\//, '')
          const full = resolve(dir, p)
          if (!existsSync(full)) {
            const cjsEntry = exp.require?.default?.replace(/^\.\//, '') || main
            if (cjsEntry) {
              const cjsFull = resolve(dir, cjsEntry)
              if (existsSync(cjsFull)) {
                mkdirSync(dirname(full), { recursive: true })
                copyFileSync(cjsFull, full)
                console.log(`  ✓ Fixed export ${p}: ${pkg.name}`)
                fixed++
              }
            }
          }
        }
      }
    }
  }
}

function scanPackages(rootDir) {
  if (!existsSync(rootDir)) return
  const entries = readdirSync(rootDir, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    if (entry.name.startsWith('@')) {
      const scopeDir = resolve(rootDir, entry.name)
      const scoped = readdirSync(scopeDir, { withFileTypes: true })
      for (const s of scoped) {
        if (s.isDirectory()) {
          fixMissingEsm(resolve(scopeDir, s.name))
        }
      }
    } else {
      fixMissingEsm(resolve(rootDir, entry.name))
    }
  }
}

function fixVitePluginWasm() {
  const pkgDir = resolve(NM, 'vite-plugin-wasm')
  if (!existsSync(pkgDir)) return
  const mjsPath = resolve(pkgDir, 'exports', 'import.mjs')
  if (!existsSync(mjsPath)) {
    const cjsPath = resolve(pkgDir, 'exports', 'require.cjs')
    if (existsSync(cjsPath)) {
      const content = readFileSync(cjsPath, 'utf8')
      writeFileSync(mjsPath, content)
      console.log('  ✓ Fixed vite-plugin-wasm import.mjs')
      fixed++
    }
  }
}

function fixTailwindMerge() {
  const distDir = resolve(NM, 'tailwind-merge', 'dist')
  if (!existsSync(distDir)) return
  const mjs = resolve(distDir, 'bundle-mjs.mjs')
  const cjs = resolve(distDir, 'bundle-cjs.js')
  if (!existsSync(mjs) && existsSync(cjs)) {
    copyFileSync(cjs, mjs)
    console.log('  ✓ Fixed tailwind-merge bundle-mjs.mjs')
    fixed++
  }
  const es5Mjs = resolve(distDir, 'es5', 'bundle-mjs.mjs')
  const es5Cjs = resolve(distDir, 'es5', 'bundle-cjs.js')
  if (!existsSync(es5Mjs) && existsSync(es5Cjs)) {
    mkdirSync(dirname(es5Mjs), { recursive: true })
    copyFileSync(es5Cjs, es5Mjs)
    console.log('  ✓ Fixed tailwind-merge es5 bundle-mjs.mjs')
    fixed++
  }
}

function fixSupabase() {
  const pkgDir = resolve(NM, 'supabase')
  if (!existsSync(pkgDir)) return
  const postinstall = resolve(pkgDir, 'scripts', 'postinstall.js')
  if (existsSync(postinstall)) {
    writeFileSync(postinstall, 'export {};\n')
    console.log('  ✓ Patched supabase postinstall to skip platform check')
    fixed++
  }
}

function fixElectron() {
  const pkgDir = resolve(NM, 'electron')
  if (!existsSync(pkgDir)) return
  const install = resolve(pkgDir, 'install.js')
  if (existsSync(install)) {
    const content = readFileSync(install, 'utf8')
    if (!content.includes('SKIP_BINARY_DOWNLOAD')) {
      const patched = `process.env.ELECTRON_SKIP_BINARY_DOWNLOAD = '1';\n${content}`
      writeFileSync(install, patched)
      console.log('  ✓ Patched electron install.js to skip binary download')
      fixed++
    }
  }
}

function fixSwc() {
  const pkgDir = resolve(NM, '@swc', 'core')
  if (!existsSync(pkgDir)) return
  const binding = resolve(pkgDir, 'binding.js')
  if (existsSync(binding)) {
    let content = readFileSync(binding, 'utf8')
    if (!content.includes('process.env.SWC_SKIP')) {
      content = `if (process.env.SWC_SKIP_NATIVE) { module.exports = { transformSync: (c) => c, transform: (c) => c }; throw new Error('SWC native disabled on this platform'); }\n${content}`
      writeFileSync(binding, content)
      console.log('  ✓ Patched @swc/core binding.js to allow SWC_SKIP_NATIVE')
      fixed++
    }
  }
}

// Main
console.log('[arm64-fix] Checking node_modules...')
if (!existsSync(NM)) {
  console.log('[arm64-fix] node_modules not found, skipping')
  process.exit(0)
}

fixSupabase()
fixElectron()
fixSwc()
scanPackages(NM)
fixVitePluginWasm()
fixTailwindMerge()

console.log(`[arm64-fix] Done — ${fixed} fixes applied`)
