# Discord Availability Bot

A Discord bot designed to manage weekly availability polls for teams and communities. The bot automatically creates polls asking members about their weekly availability and stores the results in MongoDB for persistence.

## Features

- **Automated Weekly Polls**: Creates polls automatically using cron scheduling (default: Mondays at 12:00 PM)
- **Interactive Poll Interface**: Users can vote using Discord buttons with emoji indicators
- **Multiple Choice Support**: Users can select multiple days they're available
- **Real-time Updates**: Poll results update in real-time as users vote
- **Persistent Storage**: All poll data is stored in MongoDB for reliability
- **Health Monitoring**: Built-in health check endpoints for monitoring
- **Admin Commands**: Slash commands for managing polls
- **Graceful Shutdown**: Proper cleanup on bot restart/shutdown

## Poll Configuration

The bot creates polls with the following options:
- 1️⃣ Monday
- 2️⃣ Tuesday  
- 3️⃣ Wednesday
- 4️⃣ Thursday
- 5️⃣ Friday
- 6️⃣ Saturday
- 7️⃣ Sunday
- ❌ Unavailable

## Prerequisites

- Node.js 18.0.0 or higher
- MongoDB database
- Discord Bot Token
- Discord Server with appropriate permissions

## Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd DiscordBot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   Create a `.env` file in the root directory with the following variables:
   ```env
   BOT_TOKEN=your_discord_bot_token
   MONGODB_URI=your_mongodb_connection_string
   CHANNEL_ID=your_target_channel_id
   CRON_SCHEDULE=default: 0 12 * * 1 (Monday at 8:00 AM EST)
   PORT=3000
   ```

   **Required Environment Variables:**
   - `BOT_TOKEN`: Your Discord bot token from the Discord Developer Portal
   - `MONGODB_URI`: MongoDB connection string (e.g., `mongodb://localhost:27017/discord-bot`)
   - `CHANNEL_ID`: Discord channel ID where polls will be posted
   - `CRON_SCHEDULE`: see Cron Schedule Format below (default: `0 12 * * 1` = Monday at 8:00 AM EST)
   - `PORT`: Port for health check server (default: 3000)

## Usage

### Starting the Bot

**Development mode:**
```bash
npm run dev
```

**Production mode:**
```bash
npm start
```

### Slash Commands

The bot provides several admin commands for managing polls:

- `/delete-poll <poll_id>` - Delete a specific poll from the database
- `/clean-polls` - Remove all ended polls from the database
- `/list-polls` - List all active polls with their status
- `/force-end-poll <poll_id>` - Force end a specific active poll immediately
- `/clear-all-polls` - Clear all poll data from memory and database (⚠️ Dangerous)

### Health Monitoring

The bot includes health check endpoints:

- `GET /` - General status information
- `GET /health` - Health check endpoint (returns 200 if healthy, 503 if unhealthy)

## Bot Permissions

Your Discord bot needs the following permissions:
- Send Messages
- Use Slash Commands
- Add Reactions
- Embed Links
- Read Message History

## MongoDB Schema

The bot uses the following schema for storing poll data:

```javascript
{
  pollId: String (unique),
  question: String,
  options: [String],
  votes: Mixed (serialized Map/Set),
  endTime: Number,
  channelId: String,
  messageId: String,
  multipleChoice: Boolean,
  status: String ('active' | 'ended'),
  createdAt: Date
}
```

## Configuration Options

You can customize the bot behavior by modifying the `POLL_CONFIG` object in `index.js`:

```javascript
const POLL_CONFIG = {
  channelId: channelId,
  cronSchedule: cronSchedule,
  pollDuration: 24 * 60 * 60 * 1000, // 24 hours
  pollQuestion: 'What days are you available this week?',
  pollOptions: [...], // Customize poll options
  multipleChoice: true,
};
```

## Cron Schedule Format

The bot uses the standard cron format for scheduling:
```
* * * * *
│ │ │ │ │
│ │ │ │ └─── Day of week (0-7, Sunday = 0 or 7)
│ │ │ └───── Month (1-12)
│ │ └─────── Day of month (1-31)
│ └───────── Hour (0-23)
└─────────── Minute (0-59)
```

**Common examples:**
- `0 12 * * 1` - Every Monday at 12:00 PM
- `0 9 * * 1-5` - Every weekday at 9:00 AM
- `0 18 * * 5` - Every Friday at 6:00 PM

## Error Handling

The bot includes comprehensive error handling for:
- MongoDB connection failures with retry logic
- Discord API errors
- Missing environment variables
- Invalid poll operations
- Network connectivity issues

## Logging

The bot provides detailed logging with emoji indicators:
- ✅ Success operations
- ❌ Error conditions
- ⚠️ Warnings
- 🔄 Processing operations
- 📴 Shutdown operations

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

**Tim Moss**

## Support

If you encounter any issues or have questions, please:
1. Check the logs for error messages
2. Verify your environment variables are set correctly
3. Ensure your bot has the required Discord permissions
4. Check your MongoDB connection

For additional support, please open an issue in the repository.
