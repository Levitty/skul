#!/usr/bin/env node
/**
 * Generate Supabase TypeScript types with authentication handling
 */

const { execSync } = require('child_process')
const { writeFileSync, existsSync, readFileSync } = require('fs')
const { join } = require('path')

const PROJECT_REF = 'eskxkjgnoldcssvgwpkm'

console.log('🔄 Generating Supabase TypeScript types...\n')
console.log(`📦 Project Reference: ${PROJECT_REF}\n`)

// Check if user is logged in
let isLoggedIn = false
try {
  execSync('npx supabase projects list', { stdio: 'ignore', encoding: 'utf-8' })
  isLoggedIn = true
} catch (error) {
  isLoggedIn = false
}

if (!isLoggedIn) {
  console.log('⚠️  You need to authenticate with Supabase first.\n')
  console.log('Please run this command to login:')
  console.log('  npx supabase login\n')
  console.log('This will open your browser to authenticate.\n')
  console.log('After logging in, run this script again:\n')
  console.log('  npm run types:generate\n')
  process.exit(1)
}

try {
  console.log('✅ Authenticated with Supabase\n')
  console.log('🔄 Generating types...\n')
  
  const output = execSync(
    `npx supabase gen types typescript --project-id ${PROJECT_REF}`,
    { encoding: 'utf-8', stdio: 'pipe' }
  )

  const outputPath = join(process.cwd(), 'types', 'database.ts')
  writeFileSync(outputPath, output, 'utf-8')

  console.log('✅ Types generated successfully!')
  console.log(`📁 Output: ${outputPath}\n`)

  // Count tables
  const tableMatches = output.match(/^\s+(\w+):\s*\{$/gm)
  const tableCount = tableMatches ? tableMatches.length : 0
  console.log(`📋 Found ${tableCount} tables\n`)

  // Show first few lines
  const lines = output.split('\n').slice(0, 30).join('\n')
  console.log('📄 Preview (first 30 lines):')
  console.log('─'.repeat(50))
  console.log(lines)
  console.log('─'.repeat(50))
  console.log('...\n')

  console.log('✨ Next steps:')
  console.log('  1. Review full types: cat types/database.ts')
  console.log('  2. Check for errors: npm run types:check')
  console.log('  3. Build project: npm run build\n')

} catch (error) {
  console.error('❌ Failed to generate types\n')
  console.error('Error:', error.message)
  
  if (error.message.includes('Access token')) {
    console.log('\n💡 Solution:')
    console.log('  Run: npx supabase login')
    console.log('  Then run this script again\n')
  } else if (error.message.includes('Not found') || error.message.includes('404')) {
    console.log('\n💡 Solution:')
    console.log('  Verify your Project Reference ID is correct')
    console.log('  Check: https://supabase.com/dashboard/project/' + PROJECT_REF + '/settings/api\n')
  } else {
    console.log('\n💡 Try running manually:')
    console.log(`  npx supabase gen types typescript --project-id ${PROJECT_REF} > types/database.ts\n`)
  }
  
  process.exit(1)
}



