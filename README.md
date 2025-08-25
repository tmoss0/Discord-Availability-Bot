# Discord Availability Bot

A Discord bot that creates weekly availability polls automatically.

## Features

- Automated weekly polls dependending on Cron schedule
- Multiple choice voting
- Real-time vote tracking
- Shows who voted for what
- Manual poll creation with `/availability` command

## Local Setup

1. Clone the repository
2. Install dependencies: `npm install`
3. Copy `env.example` to `.env` and fill in your values:
   ```
   BOT_TOKEN=your_bot_token_here
   CHANNEL_ID=your_channel_id_here
   ```
4. Run the bot: `npm start`

## Railway.com Deployment

1. **Connect your repository** to Railway
2. **Set Environment Variables** in Railway dashboard:
   - `BOT_TOKEN`: Your Discord bot token
   - `CHANNEL_ID`: Your Discord channel ID (optional - bot will work without it)
3. **Deploy** - Railway will automatically run `npm start`

## Discord Bot Setup

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

## Environment Variables

- `BOT_TOKEN` (required): Your Discord bot token
- `CHANNEL_ID` (optional): Discord channel ID for automatic weekly polls
