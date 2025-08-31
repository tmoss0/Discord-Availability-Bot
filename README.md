# Discord Availability Bot

A Discord bot that creates weekly availability polls automatically, designed to work with cron job scheduling.

## Features

- **Cron Job Compatible**: Designed to run as scheduled tasks
- **Persistent Storage**: Poll data survives between cron runs using JSON file storage
- **Dual Mode Operation**: 
  - Cron mode for creating polls
  - Always-on interaction handler for processing votes
- Multiple choice voting
- Real-time vote tracking
- Shows who voted for what
- Manual poll creation with `/availability` command
- Automatic cleanup of expired polls

## Architecture

This bot uses a **two-process architecture** for cron job compatibility:

1. **Main Bot (Cron Job)**: Creates weekly polls and exits
2. **Interaction Handler (Always Running)**: Processes button clicks and votes

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Create a `.env` file with:
```env
BOT_TOKEN=your_bot_token_here
CHANNEL_ID=your_channel_id_here
CRON_MODE=true  # Set this for cron job mode
```

### 3. Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" section and create a bot
4. Copy the bot token and add it to your environment variables
5. Enable these bot permissions:
   - Send Messages
   - Use Slash Commands
   - Add Reactions
   - Embed Links
6. Invite the bot to your server with appropriate permissions

### 4. Cron Job Setup

#### Option A: Linux/macOS Cron
```bash
# Edit crontab
crontab -e

# Add this line for weekly polls every Monday at 9 AM
0 9 * * 1 cd /path/to/your/bot && npm run cron

# Or for testing, every 5 minutes:
# */5 * * * * cd /path/to/your/bot && npm run cron
```

#### Option B: Windows Task Scheduler
1. Open Task Scheduler
2. Create Basic Task
3. Set trigger (e.g., Weekly, Monday, 9:00 AM)
4. Set action: Start a program
   - Program: `cmd`
   - Arguments: `/c cd "C:\path\to\your\bot" && npm run cron`

### 5. Start the Interaction Handler

The interaction handler must run continuously to process votes:

```bash
# Start the interaction handler (keep this running)
npm run interaction-handler
```

**Important**: Deploy the interaction handler to a service like Railway, Heroku, or run it on a VPS to ensure 24/7 availability.

## Usage

### Running Modes

1. **Cron Mode** (for scheduled poll creation):
   ```bash
   npm run cron
   ```
   - Creates weekly poll if needed
   - Exits after completion
   - Use this in your cron job

2. **Interaction Handler** (always running):
   ```bash
   npm run interaction-handler
   ```
   - Processes button clicks and votes
   - Must run continuously
   - Deploy to a cloud service

3. **Traditional Mode** (single process, always running):
   ```bash
   npm start
   ```
   - Creates polls and handles interactions
   - Use if you don't want cron jobs

### Data Persistence

- Poll data is stored in `active_polls.json`
- Votes and poll state persist between cron runs
- Expired polls are automatically ended and cleaned up

### Poll Lifecycle

1. **Poll Creation**: Cron job creates poll with 24-hour duration
2. **Voting Period**: Users vote via button interactions (handled by interaction handler)
3. **Poll Ending**: Interaction handler automatically ends polls after 24 hours
   - Posts final results to Discord
   - Updates original poll message to show "ENDED" status
   - Removes voting buttons
   - Cleans up poll data
4. **Cleanup**: Periodic cleanup every 30 minutes removes any orphaned data

## Environment Variables

- `BOT_TOKEN` (required): Your Discord bot token
- `CHANNEL_ID` (required): Discord channel ID for automatic weekly polls
- `CRON_MODE` (optional): Set to `"true"` for cron job mode

## Deployment Options

### Option 1: Render.com (Recommended for Cron Jobs)

The project includes a `render.yaml` file for easy deployment:

1. **Fork/Clone** this repository to your GitHub account
2. **Connect to Render**: 
   - Go to [Render.com](https://render.com)
   - Click "New" → "Blueprint"
   - Connect your GitHub repository
3. **Set Environment Variables** in Render dashboard:
   - `BOT_TOKEN`: Your Discord bot token
   - `CHANNEL_ID`: Your Discord channel ID
4. **Deploy**: Render will automatically create:
   - **Background Worker**: Handles button interactions (always running)
   - **Cron Job**: Creates weekly polls every Monday at 9 AM UTC

### Option 2: Manual Cron Setup
1. **Interaction Handler**: Deploy to Railway/Heroku (always running)
2. **Cron Job**: Run on your server/local machine (scheduled)

### Option 3: Traditional Setup
1. Deploy entire bot to Railway/Heroku (always running)
2. No cron job needed

## Render.com Specific Setup

### Using the Blueprint (render.yaml):
- **Worker Service**: Runs `npm run interaction-handler` continuously
- **Cron Service**: Runs `npm run cron` weekly on Mondays at 9 AM UTC
- **Automatic Scaling**: Worker scales based on usage
- **Persistent Storage**: Uses shared file system for `active_polls.json`

### Manual Render Setup:
1. **Create Background Worker**:
   - Service Type: Background Worker
   - Build Command: `npm install`
   - Start Command: `npm run interaction-handler`

2. **Create Cron Job**:
   - Service Type: Cron Job
   - Build Command: `npm install`
   - Start Command: `npm run cron`
   - Schedule: `0 9 * * 1` (Monday 9 AM UTC)
   - Environment Variable: `IS_RENDER_CRON=true`

## Troubleshooting

### Common Issues:

1. **Votes not working**: Make sure interaction handler is running
2. **Duplicate polls**: Check if poll already exists for the current week
3. **Data loss**: Ensure `active_polls.json` has proper read/write permissions
4. **Render.com file persistence**: Data might not persist between cron runs on Render's free tier

### Render.com Specific Issues:

1. **File Storage**: 
   - Free tier has ephemeral storage
   - Consider upgrading to paid plan for persistent disk
   - Alternative: Use external database (MongoDB, PostgreSQL)

2. **Cold Starts**:
   - Worker might take time to start up
   - First interaction might be slower

3. **Environment Variables**:
   - Set `IS_RENDER_CRON=true` for cron jobs
   - Don't set `CRON_MODE` when using `IS_RENDER_CRON`

### Logs:
- **Render Logs**: Check service logs in Render dashboard
- **Cron job logs**: View in Render cron job service logs
- **Interaction handler logs**: Check worker service logs
- **Poll creation**: Look for "Weekly Poll is Live!" messages

### Testing:

1. **Test Cron Job Locally**:
   ```bash
   IS_RENDER_CRON=true npm run cron
   ```

2. **Test Interaction Handler**:
   ```bash
   npm run interaction-handler
   ```
