#!/bin/bash

# Script to generate Supabase TypeScript types
# Usage: ./scripts/generate-types.sh [project-ref-id]

set -e

PROJECT_REF=${1:-""}

if [ -z "$PROJECT_REF" ]; then
  echo "❌ Error: Project Reference ID is required"
  echo ""
  echo "Usage: ./scripts/generate-types.sh YOUR_PROJECT_REF"
  echo ""
  echo "To find your Project Reference ID:"
  echo "1. Go to https://supabase.com/dashboard"
  echo "2. Select your project"
  echo "3. Go to Settings → API"
  echo "4. Copy the 'Project Reference ID' (not the API key)"
  echo ""
  echo "Or set it as an environment variable:"
  echo "  export SUPABASE_PROJECT_REF=your-project-ref"
  echo "  ./scripts/generate-types.sh"
  exit 1
fi

echo "🔄 Generating TypeScript types from Supabase..."
echo "📦 Project Reference: $PROJECT_REF"
echo ""

# Generate types
npx supabase gen types typescript --project-id "$PROJECT_REF" > types/database.ts

if [ $? -eq 0 ]; then
  echo "✅ Types generated successfully!"
  echo "📁 Output: types/database.ts"
  echo ""
  echo "Next steps:"
  echo "1. Review the generated types: cat types/database.ts | head -50"
  echo "2. Run type check: npx tsc --noEmit --skipLibCheck"
  echo "3. Build project: npm run build"
else
  echo "❌ Failed to generate types"
  echo ""
  echo "Troubleshooting:"
  echo "1. Verify your Project Reference ID is correct"
  echo "2. Check your internet connection"
  echo "3. Ensure you have access to the Supabase project"
  exit 1
fi



