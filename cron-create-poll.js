// cron-create-poll.js
// This script runs weekly via Railway CRON to create new polls
// The main bot should run as a persistent service to handle votes

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { MongoClient } = require('mongodb');

if (!process.env.BOT_TOKEN || !process.env.MONGODB_URI || !process.env.CHANNEL_ID) {
  console.error('❌ Missing required environment variables!');
  process.exit(1);
}

const botToken = process.env.BOT_TOKEN;
const mongoUri = process.env.MONGODB_URI;
const channelId = process.env.CHANNEL_ID;

const POLL_CONFIG = {
  pollDuration: 24 * 60 * 60 * 1000, // 24 hours
  defaultPollQuestion: 'What days are you available this week?',
  defaultPollOptions: [
    '1️⃣ Monday',
    '2️⃣ Tuesday',
    '3️⃣ Wednesday',
    '4️⃣ Thursday',
    '5️⃣ Friday',
    '6️⃣ Saturday',
    '7️⃣ Sunday',
    '❌ Unavailable',
  ],
  multipleChoice: true,
};

async function createWeeklyPoll() {
  let mongoClient;
  const client = new Client({
    intents: [GatewayIntentBits.Guilds],
  });

  try {
    // Connect to MongoDB
    console.log('📊 Connecting to database...');
    mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    const db = mongoClient.db('discord_polls');
    const pollsCollection = db.collection('polls');

    // Login to Discord
    console.log('🔐 Logging in to Discord...');
    await client.login(botToken);

    // Wait for bot to be ready
    await new Promise((resolve) => {
      client.once('ready', resolve);
    });

    console.log(`✅ Bot ready as ${client.user.tag}`);

    // Get channel
    const channel = await client.channels.fetch(channelId);
    if (!channel) {
      throw new Error('Channel not found!');
    }

    // Create poll
    const pollId = Date.now().toString();
    const endTime = Date.now() + POLL_CONFIG.pollDuration;

    const pollData = {
      pollId,
      question: POLL_CONFIG.defaultPollQuestion,
      options: POLL_CONFIG.defaultPollOptions,
      votes: {},
      endTime,
      channelId,
      multipleChoice: POLL_CONFIG.multipleChoice,
      status: 'active',
      createdAt: new Date(),
    };

    // Create embed and buttons
    const embed = new EmbedBuilder()
      .setTitle('📊 Weekly Availability Poll')
      .setDescription(pollData.question)
      .setColor('#0099ff')
      .setTimestamp()
      .setFooter({
        text: `${pollData.multipleChoice ? 'Multiple choices allowed' : 'Single choice only'}`,
      });

    pollData.options.forEach((option) => {
      embed.addFields({
        name: `${option} (0 votes)`,
        value: 'No votes yet',
        inline: false,
      });
    });

    const endTimeSeconds = Math.floor(endTime / 1000);
    embed.addFields({
      name: 'Poll Ends',
      value: `<t:${endTimeSeconds}:R>`,
      inline: false,
    });

    // Create buttons
    const rows = [];
    const buttonsPerRow = 5;

    for (let i = 0; i < pollData.options.length; i += buttonsPerRow) {
      const row = new ActionRowBuilder();

      for (let j = i; j < Math.min(i + buttonsPerRow, pollData.options.length); j++) {
        const option = pollData.options[j];
        const [emoji, ...dayParts] = option.split(' ');
        const day = dayParts.join(' ');

        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`poll_${pollId}_${j}`)
            .setLabel(day)
            .setEmoji(emoji)
            .setStyle(ButtonStyle.Primary)
        );
      }

      rows.push(row);
    }

    // Send poll message
    const pollMessage = await channel.send({
      content: '**Weekly Poll is Live!**',
      embeds: [embed],
      components: rows,
    });

    // Save to database
    pollData.messageId = pollMessage.id;
    await pollsCollection.insertOne(pollData);

    console.log(`✅ Weekly poll created successfully!`);
    console.log(`   Poll ID: ${pollId}`);
    console.log(`   Message ID: ${pollMessage.id}`);
    console.log(`   Ends at: ${new Date(endTime).toLocaleString()}`);

    // Cleanup
    client.destroy();
    await mongoClient.close();

    console.log('✅ CRON job completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating weekly poll:', error);

    if (client) {
      client.destroy();
    }
    if (mongoClient) {
      await mongoClient.close();
    }

    process.exit(1);
  }
}

// Run the function
createWeeklyPoll();
