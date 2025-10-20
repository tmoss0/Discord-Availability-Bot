const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const express = require('express');
const cron = require('node-cron');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// Environment variables validation
if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN environment variable is required!');
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is required!');
  process.exit(1);
}

if (!process.env.CHANNEL_ID) {
  console.error('❌ CHANNEL_ID environment variable is required!');
  process.exit(1);
}

const botToken = process.env.BOT_TOKEN;
const mongoUri = process.env.MONGODB_URI;
const channelId = process.env.CHANNEL_ID;
const activePolls = new Map();

const POLL_CONFIG = {
  channelId: channelId,
  // cronSchedule: process.env.CRON_SCHEDULE || '0 12 * * 1', // Default: Mondays at 12 PM
  cronSchedule: '0 17 * * 1', // Default: Mondays at 5 PM
  pollDuration: 24 * 60 * 60 * 1000, // 24 hours
  pollQuestion: 'What days are you available this week?',
  pollOptions: [
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

// MongoDB Schema
const pollSchema = new mongoose.Schema({
  pollId: { type: String, required: true, unique: true },
  question: String,
  options: [String],
  votes: mongoose.Schema.Types.Mixed,
  endTime: Number,
  channelId: String,
  messageId: String,
  multipleChoice: Boolean,
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
});

const Poll = mongoose.model('Poll', pollSchema);

// Health check server
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    bot: client.user ? client.user.tag : 'not ready',
    uptime: process.uptime(),
    mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    activePolls: activePolls.size,
    cronSchedule: POLL_CONFIG.cronSchedule,
  });
});

app.get('/health', (req, res) => {
  const isHealthy = client.user && mongoose.connection.readyState === 1;
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'unhealthy',
  });
});

app.listen(PORT, () => {
  console.log(`🏥 Health check server running on port ${PORT}`);
});

// Connect to MongoDB with retry logic
async function connectToMongoDB(retries = 5, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      await mongoose.connect(mongoUri);
      console.log('✅ Connected to MongoDB');
      return true;
    } catch (error) {
      console.error(`❌ MongoDB connection attempt ${i + 1}/${retries} failed:`, error.message);
      if (i < retries - 1) {
        console.log(`⏳ Retrying in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }
  console.error('❌ Failed to connect to MongoDB after all retries');
  process.exit(1);
}

// Save poll to MongoDB
async function savePollToDB(pollId, pollData) {
  try {
    const serializedVotes = {};
    for (const [userId, userVotes] of pollData.votes.entries()) {
      if (pollData.multipleChoice) {
        serializedVotes[userId] = Array.from(userVotes);
      } else {
        serializedVotes[userId] = userVotes;
      }
    }

    await Poll.findOneAndUpdate(
      { pollId },
      {
        pollId,
        question: pollData.question,
        options: pollData.options,
        votes: serializedVotes,
        endTime: pollData.endTime,
        channelId: pollData.channelId,
        messageId: pollData.messageId,
        multipleChoice: pollData.multipleChoice,
        status: 'active',
      },
      { upsert: true, new: true }
    );
  } catch (error) {
    console.error('❌ Error saving poll to MongoDB:', error);
  }
}

// Load active polls from MongoDB
async function loadPollsFromDB() {
  try {
    const polls = await Poll.find({ status: 'active' });

    for (const poll of polls) {
      // Skip expired polls
      if (Date.now() > poll.endTime) {
        await Poll.findOneAndUpdate({ pollId: poll.pollId }, { status: 'ended' });
        continue;
      }

      // Reconstruct Map and Set objects
      const votes = new Map();
      for (const [userId, userVotes] of Object.entries(poll.votes || {})) {
        if (poll.multipleChoice) {
          votes.set(userId, new Set(userVotes));
        } else {
          votes.set(userId, userVotes);
        }
      }

      activePolls.set(poll.pollId, {
        question: poll.question,
        options: poll.options,
        votes,
        endTime: poll.endTime,
        channelId: poll.channelId,
        messageId: poll.messageId,
        multipleChoice: poll.multipleChoice,
      });

      // Set up timeout for remaining duration
      const remainingTime = poll.endTime - Date.now();
      if (remainingTime > 0) {
        setTimeout(() => endPoll(poll.pollId), remainingTime);
      }
    }

    console.log(`✅ Loaded ${activePolls.size} active polls from MongoDB`);
  } catch (error) {
    console.error('❌ Error loading polls from MongoDB:', error);
  }
}

// Delete poll from MongoDB
async function deletePollFromDB(pollId) {
  try {
    await Poll.findOneAndUpdate({ pollId }, { status: 'ended' });
  } catch (error) {
    console.error('❌ Error deleting poll from MongoDB:', error);
  }
}

function getPollData(pollId, options = {}) {
  const { allowExpired = false } = options;
  const pollData = activePolls.get(pollId);
  if (!pollData) {
    console.log(`❌ Poll data not found for ID: ${pollId}`);
    return null;
  }
  if (!allowExpired && Date.now() > pollData.endTime) return null;
  return pollData;
}

client.once('ready', async () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);

  // Connect to MongoDB
  await connectToMongoDB();

  // Load any existing polls from MongoDB
  await loadPollsFromDB();

  // Set up cron job for automatic polls
  if (POLL_CONFIG.channelId) {
    console.log(`⏰ CRON schedule: ${POLL_CONFIG.cronSchedule}`);
    cron.schedule(POLL_CONFIG.cronSchedule, async () => {
      console.log('🕐 CRON job triggered - creating weekly poll');
      await createWeeklyPoll();
    });
    console.log('✅ CRON job scheduled successfully');
  } else {
    console.log('⚠️ CHANNEL_ID not set - automatic polls disabled');
  }
});

async function createWeeklyPoll() {
  try {
    const channelId = POLL_CONFIG.channelId;
    if (!channelId) {
      console.log('⚠️ CHANNEL_ID not configured. Skipping poll creation.');
      return null;
    }

    const channel = client.channels.cache.get(channelId);
    if (!channel) {
      console.error('❌ Channel not found! Please check your CHANNEL_ID configuration.');
      return null;
    }

    const pollId = Date.now().toString();
    const pollData = {
      question: POLL_CONFIG.pollQuestion,
      options: POLL_CONFIG.pollOptions,
      votes: new Map(),
      endTime: Date.now() + POLL_CONFIG.pollDuration,
      channelId: channelId,
      multipleChoice: POLL_CONFIG.multipleChoice,
    };

    const embed = createPollEmbed(pollData);
    const buttons = createPollButtons(pollData.options, pollId);
    const pollMessage = await channel.send({
      content: '**Weekly Poll is Live!**',
      embeds: [embed],
      components: buttons,
    });

    activePolls.set(pollId, {
      ...pollData,
      messageId: pollMessage.id,
    });

    await savePollToDB(pollId, { ...pollData, messageId: pollMessage.id });
    setTimeout(() => endPoll(pollId), POLL_CONFIG.pollDuration);

    console.log(`✅ Weekly poll created with ID: ${pollId}`);
    return pollId;
  } catch (error) {
    console.error('❌ Error creating weekly poll:', error);
    return null;
  }
}

function createPollEmbed(pollData) {
  const embed = new EmbedBuilder()
    .setTitle('📊 Weekly Availability Poll')
    .setDescription(pollData.question)
    .setColor('#0099ff')
    .setTimestamp()
    .setFooter({
      text: `${pollData.multipleChoice ? 'Multiple choices allowed' : 'Single choice only'}`,
    });

  pollData.options.forEach((option, index) => {
    let voteCount = 0;
    const votersForOption = [];

    pollData.votes.forEach((userVotes, userId) => {
      if (pollData.multipleChoice) {
        if (userVotes.has(index)) {
          voteCount++;
          votersForOption.push(`<@${userId}>`);
        }
      } else {
        if (userVotes === index) {
          voteCount++;
          votersForOption.push(`<@${userId}>`);
        }
      }
    });

    const votersList = votersForOption.length > 0 ? votersForOption.join(', ') : 'No votes yet';

    embed.addFields({
      name: `${option} (${voteCount} votes)`,
      value: votersList,
      inline: false,
    });
  });

  const endTime = Math.floor(pollData.endTime / 1000);
  embed.addFields({
    name: 'Poll Ends',
    value: `<t:${endTime}:R>`,
    inline: false,
  });

  return embed;
}

function createPollButtons(options, pollId) {
  const rows = [];
  const buttonsPerRow = 5;

  for (let i = 0; i < options.length; i += buttonsPerRow) {
    const row = new ActionRowBuilder();

    for (let j = i; j < Math.min(i + buttonsPerRow, options.length); j++) {
      const option = options[j];
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

  return rows;
}

async function handlePollVote(interaction, pollId, optionIndex) {
  try {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }

    const pollData = getPollData(pollId);
    if (!pollData) return;

    if (
      typeof optionIndex !== 'number' ||
      Number.isNaN(optionIndex) ||
      optionIndex < 0 ||
      optionIndex >= pollData.options.length
    )
      return;

    const userId = interaction.user.id;

    if (pollData.multipleChoice) {
      if (!pollData.votes.has(userId)) {
        pollData.votes.set(userId, new Set());
      }

      const userVotes = pollData.votes.get(userId);
      if (userVotes.has(optionIndex)) {
        userVotes.delete(optionIndex);
      } else {
        userVotes.add(optionIndex);
      }

      if (userVotes.size === 0) {
        pollData.votes.delete(userId);
      }
    } else {
      const previousVote = pollData.votes.get(userId);
      if (previousVote === optionIndex) {
        pollData.votes.delete(userId);
      } else {
        pollData.votes.set(userId, optionIndex);
      }
    }

    await updatePollMessage(pollId);
    await savePollToDB(pollId, pollData);
  } catch (error) {
    console.error('❌ Error handling poll vote:', error);
  }
}

async function updatePollMessage(pollId) {
  try {
    const pollData = getPollData(pollId);
    if (!pollData) return;

    const channel = client.channels.cache.get(pollData.channelId);
    if (!channel) return;

    const message = await channel.messages.fetch(pollData.messageId);
    if (!message) return;

    const embed = createPollEmbed(pollData);
    const buttons = createPollButtons(pollData.options, pollId);

    await message.edit({
      embeds: [embed],
      components: buttons,
    });
  } catch (error) {
    console.error('❌ Error updating poll message:', error);
  }
}

async function endPoll(pollId) {
  try {
    const pollData = getPollData(pollId, { allowExpired: true });
    if (!pollData) {
      console.error('❌ Poll data not found for ID:', pollId);
      return;
    }

    const channel = client.channels.cache.get(pollData.channelId);
    if (!channel) {
      console.error('❌ Channel not found for poll ID:', pollId);
      return;
    }

    const resultsEmbed = createResultsEmbed(pollData);

    await channel.send({
      content: '**Poll Results**',
      embeds: [resultsEmbed],
    });

    try {
      const message = await channel.messages.fetch(pollData.messageId);
      const embed = createPollEmbed(pollData);
      embed.setColor('#ff0000');
      embed.setTitle('📊 Weekly Poll (ENDED)');

      await message.edit({
        embeds: [embed],
        components: [],
      });
    } catch (error) {
      console.error('❌ Error updating ended poll message:', error);
    }

    activePolls.delete(pollId);
    await deletePollFromDB(pollId);
    console.log(`✅ Poll ${pollId} has ended`);
  } catch (error) {
    console.error('❌ Error ending poll:', error);
  }
}

function createResultsEmbed(pollData) {
  const embed = new EmbedBuilder()
    .setTitle('Availability Poll Results')
    .setDescription(pollData.question)
    .setColor('#00ff00')
    .setTimestamp();

  const voteCounts = new Array(pollData.options.length).fill(0);
  const votersPerOption = new Array(pollData.options.length).fill(null).map(() => []);

  pollData.votes.forEach((userVotes, userId) => {
    if (pollData.multipleChoice) {
      userVotes.forEach((optionIndex) => {
        voteCounts[optionIndex]++;
        votersPerOption[optionIndex].push(`<@${userId}>`);
      });
    } else {
      voteCounts[userVotes]++;
      votersPerOption[userVotes].push(`<@${userId}>`);
    }
  });

  const totalVoters = pollData.votes.size;

  pollData.options.forEach((option, index) => {
    const votes = voteCounts[index];
    const percentage = totalVoters > 0 ? ((votes / totalVoters) * 100).toFixed(1) : '0.0';
    const voters = votersPerOption[index];
    const votersList = voters.length > 0 ? voters.join(', ') : 'No one';

    embed.addFields({
      name: `${option} - ${votes} people (${percentage}%)`,
      value: votersList,
      inline: false,
    });
  });

  embed.addFields({
    name: '👥 Total Participants',
    value: totalVoters.toString(),
    inline: true,
  });

  return embed;
}

client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isButton()) {
      const [action, pollId, optionIndex] = interaction.customId.split('_');

      if (action === 'poll') {
        await handlePollVote(interaction, pollId, parseInt(optionIndex));
      }
      return;
    }
  } catch (error) {
    console.error('❌ Error handling interaction:', error);
  }
});

// Error handlers
client.on('error', (error) => {
  console.error('❌ Discord client error:', error);
});

mongoose.connection.on('error', (error) => {
  console.error('❌ MongoDB connection error:', error);
});

mongoose.connection.on('disconnected', () => {
  console.log('⚠️ MongoDB disconnected. Attempting to reconnect...');
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('📴 SIGTERM received, shutting down gracefully...');
  client.destroy();
  await mongoose.connection.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('📴 SIGINT received, shutting down gracefully...');
  client.destroy();
  await mongoose.connection.close();
  process.exit(0);
});

client.login(botToken).catch((error) => {
  console.error('❌ Failed to login to Discord:', error);
  process.exit(1);
});
