# Discord Availability Bot

A Discord bot for creating weekly availability polls with persistent storage and Railway.com deployment support.

## Features

- **Persistent Storage**: Polls and votes survive container restarts
- **Railway.com Compatible**: Optimized for continuous deployment
- **Automatic Poll Management**: Polls automatically close after 24 hours
- **Multiple Choice Voting**: Users can select multiple available days
- **Real-time Updates**: Vote counts update in real-time
- **Manual Poll Creation**: Use `/availability` slash command anytime
- **Clean Results**: Shows final results and removes voting buttons when polls end

## Environment Variables Required

Set these environment variables in your Railway.com project:

### Required

- `BOT_TOKEN`: Your Discord bot token from the Discord Developer Portal
- `CHANNEL_ID`: Discord channel ID where automatic polls will be posted
  
### Optional

- `AUTO_POLL_MODE`: Set to `"true"` to enable automatic weekly poll creation, otherwise polls will not be created on CRON job execution

## Deployment Steps

1. **Connect your GitHub repository** to Railway.com
2. **Set environment variables** in Railway dashboard
3. **Deploy** - Railway will automatically detect your Node.js app

## How Polls Work on Railway.com

### Fixed Issues

- **Persistent Storage**: Polls and votes are now saved to `polls.json` file
- **Container Restarts**: Polls survive container restarts and deployments
- **Continuous Operation**: Bot stays running without `process.exit()`
- **Auto-Recovery**: Active polls are restored when the bot restarts

### Poll Behavior

- **Manual Polls**: Use `/availability` slash command anytime
- **Automatic Polls**: Set `AUTO_POLL_MODE=true` and `CHANNEL_ID` for weekly polls
- **Duration**: Polls run for 24 hours by default
- **Voting**: Multiple choice enabled - users can select multiple days
- **Results**: Automatic results posted when poll ends

### File Storage

- Poll data is stored in `polls.json` in your project directory
- Data persists across deployments and restarts
- Expired polls are automatically cleaned up

## Testing Your Deployment

1. Deploy to Railway.com
2. Invite bot to your Discord server with proper permissions
3. Test manual poll: `/availability`
4. Check that votes are saved and poll updates correctly
5. Wait for poll to end and verify results are posted

## Monitoring

Check Railway.com logs to see:

- Bot startup messages
- Poll creation and vote handling
- Any error messages

## Troubleshooting

- **Bot not responding**: Check if environment variable `BOT_TOKEN` is set correctly
- **Polls not creating**: Check if environment variable `CHANNEL_ID` is set and bot has permissions
- **Cron job not running**: Check if environment variable `AUTO_POLL_MODE` is set correctly
- **Votes not saving**: Check file permissions in Railway container
