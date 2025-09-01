# Discord Availability Bot

A simple Discord bot that creates weekly availability polls automatically via cron jobs, with manual poll creation capability.

## Features

- **Cron Job Compatible**: Designed to run as scheduled tasks on Render.com
- **Simple Architecture**: Single file handles everything - no complex setup needed
- **Automatic Poll Management**: Polls automatically close after 24 hours and show results
- **Multiple Choice Voting**: Users can select multiple available days
- **Real-time Updates**: Vote counts update in real-time
- **Manual Poll Creation**: Use `/availability` command to create polls anytime
- **Clean Results**: Shows final results and removes voting buttons when polls end

## How It Works

1. **Cron Job**: Bot starts, creates a weekly poll, then exits (perfect for Render.com)
2. **Voting**: Users click buttons to vote for available days
3. **Auto-Close**: After 24 hours, poll automatically closes and shows results
4. **Manual Command**: Users can create polls anytime with `/availability`

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

### 4. Deploy to Render.com

1. **Fork/Clone** this repository to your GitHub account
2. **Connect to Render**: 
   - Go to [Render.com](https://render.com)
   - Click "New" → "Cron Job"
   - Connect your GitHub repository
3. **Configure the Cron Job**:
   - **Build Command**: `npm install`
   - **Start Command**: `npm run cron`
   - **Schedule**: `0 23 * * 0` (Sunday 11 PM UTC - adjust for your timezone)
4. **Set Environment Variables**:
   - `BOT_TOKEN`: Your Discord bot token
   - `CHANNEL_ID`: Your Discord channel ID
   - `IS_RENDER_CRON`: `true`
5. **Deploy**: Render will create a cron job that runs weekly

## Usage

### Running Modes

1. **Cron Mode** (for scheduled poll creation):
   ```bash
   IS_RENDER_CRON=true npm run cron
   ```
   - Creates weekly poll
   - Exits after completion
   - Use this in your Render.com cron job

2. **Manual Mode** (for testing or always-on usage):
   ```bash
   npm start
   ```
   - Bot stays online to handle commands and voting
   - Good for development and testing

### Poll Lifecycle

1. **Poll Creation**: Cron job creates poll with 24-hour duration
2. **Voting Period**: Users vote via button interactions
3. **Auto-Close**: Poll automatically ends after 24 hours
   - Posts final results to Discord
   - Updates original poll message to show "ENDED" status
   - Removes voting buttons
4. **Results**: Shows vote counts, percentages, and who voted for what

## Environment Variables

- `BOT_TOKEN` (required): Your Discord bot token
- `CHANNEL_ID` (required): Discord channel ID for automatic weekly polls
- `IS_RENDER_CRON` (optional): Set to `"true"` for cron job mode

## Render.com Setup

### Cron Job Configuration:
- **Service Type**: Cron Job
- **Build Command**: `npm install`
- **Start Command**: `npm run cron`
- **Schedule**: `0 23 * * 0` (Sunday 11 PM UTC)
- **Environment Variables**:
  - `BOT_TOKEN`: Your Discord bot token
  - `CHANNEL_ID`: Your Discord channel ID
  - `IS_RENDER_CRON`: `true`

### Timezone Note:
The cron schedule `0 23 * * 0` runs at 11:00 PM UTC every Sunday. Adjust this for your local timezone:
- **Eastern Time (UTC-5)**: Use `0 4 * * 1` for Monday 12:00 AM UTC (Sunday 7:00 PM ET)
- **Pacific Time (UTC-8)**: Use `0 7 * * 1` for Monday 7:00 AM UTC (Sunday 11:00 PM PT)

## Troubleshooting

### Common Issues:

1. **Polls not closing**: Make sure the bot has proper permissions and can edit messages
2. **Votes not working**: Check that the bot is running and has the right intents
3. **Cron job not running**: Verify the schedule in Render.com and check logs

### Testing:

1. **Test Cron Job Locally**:
   ```bash
   IS_RENDER_CRON=true npm run cron
   ```

2. **Test Manual Mode**:
   ```bash
   npm start
   ```

3. **Test Command**:
   - Use `/availability` in Discord to create a test poll

## Files

- `main.js` - Main bot code (handles everything)
- `package.json` - Dependencies and scripts
- `.env` - Environment variables (create this)
- `README.md` - This file

## Scripts

- `npm start` - Run bot in manual mode (stays online)
- `npm run cron` - Run bot in cron mode (creates poll and exits)
- `npm run dev` - Run with nodemon for development
