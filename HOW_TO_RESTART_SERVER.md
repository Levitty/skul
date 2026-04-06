# How to Restart the Development Server

## Method 1: If Server is Running in Terminal

If you can see the terminal window where `npm run dev` is running:

1. **Press `Ctrl + C`** (or `Cmd + C` on Mac) in that terminal
2. Wait for it to stop (you'll see a message)
3. **Run again:** `npm run dev`

## Method 2: If Server is Running in Background

If the server is running in the background (like it is now):

### Option A: Using Terminal Commands

```bash
# Find the process
ps aux | grep "next dev" | grep -v grep

# Kill it (replace PID with the number you see)
kill <PID>

# Restart
npm run dev
```

### Option B: Kill All Node Processes (careful!)

```bash
# Kill all node processes (will stop ALL node apps)
pkill -f "next dev"

# Then restart
npm run dev
```

### Option C: Use Port 3000

```bash
# Kill whatever is using port 3000
lsof -ti:3000 | xargs kill -9

# Then restart
npm run dev
```

## Method 3: Simple Restart Script

You can create a simple script. Create a file called `restart.sh`:

```bash
#!/bin/bash
pkill -f "next dev"
sleep 2
npm run dev
```

Then make it executable:
```bash
chmod +x restart.sh
```

And run it:
```bash
./restart.sh
```

## When to Restart

You need to restart the server when:
- ✅ You change `.env.local` file
- ✅ You install new npm packages
- ✅ You change `next.config.js`
- ✅ The server crashes or stops responding

You DON'T need to restart when:
- ❌ You edit React components (hot reload handles this)
- ❌ You edit TypeScript files (hot reload handles this)
- ❌ You edit CSS files (hot reload handles this)

## Quick Check: Is Server Running?

Visit: http://localhost:3000

If you see the login page or any page (not an error), the server is running!

## Current Status

✅ **Server is currently running!**

Visit http://localhost:3000 to see your application.




