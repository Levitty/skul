#!/usr/bin/env tsx
/**
 * Automated TypeScript type generation for Supabase
 * 
 * Usage:
 *   npx tsx scripts/auto-generate-types.ts [project-ref-id]
 * 
 * Or set SUPABASE_PROJECT_REF environment variable
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'

// Try to get project ref from various sources
function getProjectRef(): string | null {
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
  const envPath = join(process.cwd(), '.env.local')
  if (existsSync(envPath)) {
    try {
      const envContent = readFileSync(envPath, 'utf-8')
      const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=https?:\/\/([^.]+)\.supabase\.co/)
      if (urlMatch && urlMatch[1]) {
        return urlMatch[1]
      }
    } catch (error) {
      console.error('Error reading .env.local:', error)
    }
  }

  // 4. Try to extract from .env
  const envPath2 = join(process.cwd(), '.env')
  if (existsSync(envPath2)) {
    try {
      const envContent = readFileSync(envPath2, 'utf-8')
      const urlMatch = envContent.match(/NEXT_PUBLIC_SUPABASE_URL=https?:\/\/([^.]+)\.supabase\.co/)
      if (urlMatch && urlMatch[1]) {
        return urlMatch[1]
      }
    } catch (error) {
      // Ignore
    }
  }

  return null
}

async function generateTypes() {
  console.log('🔄 Generating Supabase TypeScript types...\n')

  const projectRef = getProjectRef()

  if (!projectRef) {
    console.error('❌ Error: Project Reference ID not found\n')
    console.log('Please provide it in one of these ways:')
    console.log('  1. Command line: npx tsx scripts/auto-generate-types.ts YOUR_PROJECT_REF')
    console.log('  2. Environment: export SUPABASE_PROJECT_REF=YOUR_PROJECT_REF')
    console.log('  3. .env.local: Add NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co')
    console.log('\nTo find your Project Reference ID:')
    console.log('  → Go to https://supabase.com/dashboard')
    console.log('  → Select your project')
    console.log('  → Settings → API')
    console.log('  → Copy the "Project Reference ID"')
    process.exit(1)
  }

  console.log(`📦 Using Project Reference: ${projectRef}\n`)

  try {
    // Check if supabase CLI is available
    try {
      execSync('npx supabase --version', { stdio: 'ignore' })
    } catch {
      console.log('📥 Installing Supabase CLI...\n')
      execSync('npm install -g supabase', { stdio: 'inherit' })
    }

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

    // Check file size
    const stats = require('fs').statSync(outputPath)
    console.log(`📊 File size: ${(stats.size / 1024).toFixed(2)} KB`)

    // Count tables
    const content = output
    const tableMatches = content.match(/^\s+(\w+):\s*\{$/gm)
    const tableCount = tableMatches ? tableMatches.length : 0
    console.log(`📋 Found ${tableCount} tables\n`)

    console.log('✨ Next steps:')
    console.log('  1. Review types: cat types/database.ts | head -100')
    console.log('  2. Check for errors: npm run types:check')
    console.log('  3. Build project: npm run build\n')

  } catch (error: any) {
    console.error('❌ Failed to generate types\n')
    
    if (error.message.includes('not found') || error.message.includes('ENOENT')) {
      console.error('Error: Supabase CLI not found')
      console.log('\nTry installing it:')
      console.log('  npm install -g supabase')
      console.log('  or')
      console.log('  npx supabase gen types typescript --project-id YOUR_PROJECT_REF > types/database.ts\n')
    } else if (error.message.includes('Unauthorized') || error.message.includes('401')) {
      console.error('Error: Unauthorized - check your Project Reference ID')
    } else if (error.message.includes('Not found') || error.message.includes('404')) {
      console.error('Error: Project not found - verify your Project Reference ID')
    } else {
      console.error('Error:', error.message)
    }
    
    process.exit(1)
  }
}

generateTypes()



