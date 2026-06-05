import type { Har } from 'har-format'
import { readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Target directory
const targetDir = join(homedir(), 'Documents', 'api-gateway')

// Recursively find files ending with .har
function findHarFiles(dir: string): string[] {
  let results: string[] = []
  try {
    const list = readdirSync(dir)
    for (const file of list) {
      const fullPath = join(dir, file)
      const stat = statSync(fullPath)

      if (stat && stat.isDirectory()) {
        results = results.concat(findHarFiles(fullPath))
      } else if (file.endsWith('.har')) {
        results.push(fullPath)
      }
    }
  } catch (e) {
    console.error(`Skipping path due to error: ${dir}`)
  }
  return results
}

// Main execution
async function main() {
  const harFiles = findHarFiles(targetDir)
  console.log(`Found ${harFiles.length} HAR file(s) in ${targetDir}\n`)

  for (const filePath of harFiles) {
    console.log(`--- Processing: ${filePath} ---`)
    const file = Bun.file(filePath)

    try {
      const harData = (await file.json()) as Har
      const entries = harData.log.entries
      console.log(`Requests: ${entries.length}`)

      // Print first 3 requests as a quick preview
      entries.slice(0, 3).forEach((entry, i) => {
        console.log(
          `  [${entry.response.status}] ${entry.request.method} -> ${entry.request.url}`
        )
      })
    } catch (err) {
      console.error(`  Error parsing JSON: ${filePath}`)
    }
    console.log('\n')
  }
}

main()
