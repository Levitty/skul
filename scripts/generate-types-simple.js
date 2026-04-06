#!/usr/bin/env node
/**
 * Simple script to generate Supabase TypeScript types
 * Automatically extracts project ref from .env.local if available
 */

const { execSync } = require('child_process')
const { readFileSync, writeFileSync, existsSync } = require('fs')
const { join } = require('path')

function getProjectRef() {
  // 1. Check command line argument
  const args = process.argv.slice(2)
  if (args[0]) {
    return args[0]
  }

  // 2. Check environment variable
  if (process.env.SUPABASE_PROJECT_REF) {
    return process.env.SUPABASE_PROJECT_REF
  }

  // 3. Try to extract from .env.local
  const envPaths = ['.env.local', '.env']
  for (const envPath of envPaths) {
    const fullPath = join(process.cwd(), envPath)
    if (existsSync(fullPath)) {
      try {
        const envContent = readFileSync(fullPath, 'utf-8')
        const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=https?:\/\/([^.]+)\.supabase\.co/)
        if (urlMatch && urlMatch[1]) {
          return urlMatch[1]
        }
      } catch (error) {
        // Continue to next file
      }
    }
  }

  return null
}

function main() {
  console.log('🔄 Generating Supabase TypeScript types...\n')

  const projectRef = getProjectRef()

  if (!projectRef) {
    console.error('❌ Error: Project Reference ID not found\n')
    console.log('Please provide it in one of these ways:')
    console.log('  1. Command line: node scripts/generate-types-simple.js YOUR_PROJECT_REF')
    console.log('  2. Environment: export SUPABASE_PROJECT_REF=YOUR_PROJECT_REF')
    console.log('  3. .env.local: Add NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co')
    console.log('\nTo find your Project Reference ID:')
    console.log('  → Go to https://supabase.com/dashboard')
    console.log('  → Select your project')
    console.log('  → Settings → API')
    console.log('  → Copy the "Project Reference ID" (the part before .supabase.co in your URL)')
    process.exit(1)
  }

  console.log(`📦 Using Project Reference: ${projectRef}\n`)

  try {
    // Generate types
    console.log('🔄 Generating types from Supabase...\n')
    const output = execSync(
      `npx supabase gen types typescript --project-id ${projectRef}`,
      { encoding: 'utf-8', stdio: 'pipe' }
    )

    // Write to file
    const outputPath = join(process.cwd(), 'types', 'database.ts')
    writeFileSync(outputPath, output, 'utf-8')

    console.log('✅ Types generated successfully!')
    console.log(`📁 Output: ${outputPath}\n`)

    // Count tables
    const tableMatches = output.match(/^\s+(\w+):\s*\{$/gm)
    const tableCount = tableMatches ? tableMatches.length : 0
    console.log(`📋 Found ${tableCount} tables\n`)

    console.log('✨ Next steps:')
    console.log('  1. Review types: cat types/database.ts | head -100')
    console.log('  2. Check for errors: npm run types:check')
    console.log('  3. Build project: npm run build\n')

  } catch (error) {
    console.error('❌ Failed to generate types\n')
    
    if (error.message.includes('not found') || error.message.includes('ENOENT')) {
      console.error('Error: Supabase CLI not found')
      console.log('\nInstalling Supabase CLI...')
      try {
        execSync('npm install -g supabase', { stdio: 'inherit' })
        console.log('\n✅ Installed! Run the script again.')
      } catch (installError) {
        console.log('\nTry manually:')
        console.log('  npm install -g supabase')
        console.log('  or')
        console.log('  npx supabase gen types typescript --project-id YOUR_PROJECT_REF > types/database.ts\n')
      }
    } else if (error.message.includes('Unauthorized') || error.message.includes('401')) {
      console.error('Error: Unauthorized - check your Project Reference ID')
    } else if (error.message.includes('Not found') || error.message.includes('404')) {
      console.error('Error: Project not found - verify your Project Reference ID')
    } else {
      console.error('Error:', error.message)
      console.log('\nTry running manually:')
      console.log(`  npx supabase gen types typescript --project-id ${projectRef} > types/database.ts`)
    }
    
    process.exit(1)
  }
}

main()



