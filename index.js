const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { MongoClient } = require('mongodb');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN environment variable is required!');
  process.exit(1);
}

if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is required!');
  process.exit(1);
}

const botToken = process.env.BOT_TOKEN;
const mongoUri = process.env.MONGODB_URI;
let db;
let pollsCollection;

const POLL_CONFIG = {
  channelId: process.env.CHANNEL_ID,
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

// Connect to MongoDB
async function connectDB() {
  try {
    const mongoClient = new MongoClient(mongoUri);
    await mongoClient.connect();
    db = mongoClient.db('discord_polls');
    pollsCollection = db.collection('polls');

    // Create index for efficient queries
    await pollsCollection.createIndex({ pollId: 1 });
    await pollsCollection.createIndex({ endTime: 1 });
    await pollsCollection.createIndex({ status: 1 });

    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
}

// Save poll to database
async function savePoll(pollId, pollData) {
  try {
    await pollsCollection.updateOne(
      { pollId },
      {
        $set: {
          ...pollData,
          pollId,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );
  } catch (error) {
    console.error('❌ Error saving poll:', error);
  }
}

// Get poll from database
async function getPoll(pollId) {
  try {
    return await pollsCollection.findOne({ pollId });
  } catch (error) {
    console.error('❌ Error retrieving poll:', error);
    return null;
  }
}

// Get all active polls
async function getActivePolls() {
  try {
    return await pollsCollection
      .find({
        status: 'active',
        endTime: { $gt: Date.now() },
      })
      .toArray();
  } catch (error) {
    console.error('❌ Error retrieving active polls:', error);
    return [];
  }
}

// Get polls that should end
async function getPollsToEnd() {
  try {
    return await pollsCollection
      .find({
        status: 'active',
        endTime: { $lte: Date.now() },
      })
      .toArray();
  } catch (error) {
    console.error('❌ Error retrieving polls to end:', error);
    return [];
  }
}

client.once('ready', async () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);

  await connectDB();
  await registerAvailabilityCommand();

  // Check for polls that need to be ended (handles bot restarts)
  await checkAndEndPolls();

  // Set up periodic check every 5 minutes for polls that should end
  setInterval(async () => {
    await checkAndEndPolls();
  }, 5 * 60 * 1000);

  console.log('🔄 Bot is running in persistent mode');
});

async function registerAvailabilityCommand() {
  const { REST, Routes } = require('discord.js');
  const rest = new REST({ version: '10' }).setToken(botToken);

  const commands = [
    {
      name: 'availability',
      description: 'Create a weekly availability poll',
    },
    {
      name: 'endpoll',
      description: 'Manually end an active poll',
      options: [
        {
          name: 'pollid',
          description: 'The ID of the poll to end',
          type: 3, // STRING type
          required: true,
        },
      ],
    },
  ];

  try {
    console.log('🔄 Registering commands...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Commands registered successfully!');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
}

async function createWeeklyPoll(channelId) {
  try {
    if (!channelId) {
      console.log('⚠️ Channel ID not provided.');
      return null;
    }

    const channel = client.channels.cache.get(channelId);
    if (!channel) {
      console.error('❌ Channel not found!');
      return null;
    }

    const pollId = Date.now().toString();
    const endTime = Date.now() + POLL_CONFIG.pollDuration;

    const pollData = {
      pollId,
      question: POLL_CONFIG.defaultPollQuestion,
      options: POLL_CONFIG.defaultPollOptions,
      votes: {}, // Store as plain object for MongoDB
      endTime,
      channelId,
      multipleChoice: POLL_CONFIG.multipleChoice,
      status: 'active',
      createdAt: new Date(),
    };

    const embed = createPollEmbed(pollData);
    const buttons = createPollButtons(pollData.options, pollId);

    const pollMessage = await channel.send({
      content: '**Weekly Poll is Live!**',
      embeds: [embed],
      components: buttons,
    });

    pollData.messageId = pollMessage.id;
    await savePoll(pollId, pollData);

    console.log(`✅ Weekly poll created with ID: ${pollId}`);
    console.log(`⏰ Poll will end at: ${new Date(endTime).toLocaleString()}`);

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
    .setColor(pollData.status === 'ended' ? '#ff0000' : '#0099ff')
    .setTimestamp()
    .setFooter({
      text: `${pollData.multipleChoice ? 'Multiple choices allowed' : 'Single choice only'}`,
    });

  pollData.options.forEach((option, index) => {
    let voteCount = 0;
    const votersForOption = [];

    Object.entries(pollData.votes || {}).forEach(([userId, userVotes]) => {
      if (pollData.multipleChoice) {
        if (Array.isArray(userVotes) && userVotes.includes(index)) {
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
    name: pollData.status === 'ended' ? 'Poll Ended' : 'Poll Ends',
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

    const pollData = await getPoll(pollId);
    if (!pollData || pollData.status !== 'active') {
      await interaction.followUp({
        content: '❌ This poll is no longer active.',
        ephemeral: true,
      });
      return;
    }

    if (Date.now() > pollData.endTime) {
      await interaction.followUp({
        content: '❌ This poll has ended.',
        ephemeral: true,
      });
      return;
    }

    if (
      typeof optionIndex !== 'number' ||
      Number.isNaN(optionIndex) ||
      optionIndex < 0 ||
      optionIndex >= pollData.options.length
    ) {
      return;
    }

    const userId = interaction.user.id;
    const votes = pollData.votes || {};

    if (pollData.multipleChoice) {
      if (!votes[userId]) {
        votes[userId] = [];
      }

      const userVotes = votes[userId];
      const voteIndex = userVotes.indexOf(optionIndex);

      if (voteIndex > -1) {
        userVotes.splice(voteIndex, 1);
      } else {
        userVotes.push(optionIndex);
      }

      if (userVotes.length === 0) {
        delete votes[userId];
      }
    } else {
      const previousVote = votes[userId];
      if (previousVote === optionIndex) {
        delete votes[userId];
      } else {
        votes[userId] = optionIndex;
      }
    }

    pollData.votes = votes;
    await savePoll(pollId, pollData);
    await updatePollMessage(pollData);
  } catch (error) {
    console.error('❌ Error handling poll vote:', error);
  }
}

async function updatePollMessage(pollData) {
  try {
    const channel = client.channels.cache.get(pollData.channelId);
    if (!channel) return;

    const message = await channel.messages.fetch(pollData.messageId);
    if (!message) return;

    const embed = createPollEmbed(pollData);
    const buttons = pollData.status === 'active' ? createPollButtons(pollData.options, pollData.pollId) : [];

    await message.edit({
      embeds: [embed],
      components: buttons,
    });
  } catch (error) {
    console.error('❌ Error updating poll message:', error);
  }
}

async function checkAndEndPolls() {
  try {
    const pollsToEnd = await getPollsToEnd();

    if (pollsToEnd.length > 0) {
      console.log(`🔍 Found ${pollsToEnd.length} poll(s) to end`);

      for (const pollData of pollsToEnd) {
        await endPoll(pollData.pollId);
      }
    }
  } catch (error) {
    console.error('❌ Error checking polls to end:', error);
  }
}

async function endPoll(pollId) {
  try {
    const pollData = await getPoll(pollId);
    if (!pollData) {
      console.error('❌ Poll data not found for ID:', pollId);
      return;
    }

    if (pollData.status === 'ended') {
      console.log(`⚠️ Poll ${pollId} already ended`);
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
      pollData.status = 'ended';
      const embed = createPollEmbed(pollData);
      embed.setTitle('📊 Weekly Poll (ENDED)');

      await message.edit({
        embeds: [embed],
        components: [], // Remove voting buttons
      });
    } catch (error) {
      console.error('❌ Error updating ended poll message:', error);
    }

    // Update poll status in database
    await pollsCollection.updateOne(
      { pollId },
      {
        $set: {
          status: 'ended',
          endedAt: new Date(),
        },
      }
    );

    console.log(`✅ Poll ${pollId} has ended`);
  } catch (error) {
    console.error('❌ Error ending poll:', error);
  }
}

function createResultsEmbed(pollData) {
  const embed = new EmbedBuilder()
    .setTitle('📊 Availability Poll Results')
    .setDescription(pollData.question)
    .setColor('#00ff00')
    .setTimestamp();

  const voteCounts = new Array(pollData.options.length).fill(0);
  const votersPerOption = new Array(pollData.options.length).fill(null).map(() => []);

  Object.entries(pollData.votes || {}).forEach(([userId, userVotes]) => {
    if (pollData.multipleChoice) {
      if (Array.isArray(userVotes)) {
        userVotes.forEach((optionIndex) => {
          voteCounts[optionIndex]++;
          votersPerOption[optionIndex].push(`<@${userId}>`);
        });
      }
    } else {
      voteCounts[userVotes]++;
      votersPerOption[userVotes].push(`<@${userId}>`);
    }
  });

  const totalVoters = Object.keys(pollData.votes || {}).length;

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
  // Handle button interactions (poll votes)
  if (interaction.isButton()) {
    const [action, pollId, optionIndex] = interaction.customId.split('_');

    if (action === 'poll') {
      await handlePollVote(interaction, pollId, parseInt(optionIndex));
    }
    return;
  }

  // Handle slash command interactions
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'availability') {
      await createAvailabilityPoll(interaction);
    } else if (interaction.commandName === 'endpoll') {
      await handleEndPollCommand(interaction);
    }
    return;
  }
});

async function createAvailabilityPoll(interaction) {
  try {
    await interaction.deferReply();

    const pollId = Date.now().toString();
    const endTime = Date.now() + POLL_CONFIG.pollDuration;

    const pollData = {
      pollId,
      question: POLL_CONFIG.defaultPollQuestion,
      options: POLL_CONFIG.defaultPollOptions,
      votes: {},
      endTime,
      channelId: interaction.channel.id,
      multipleChoice: POLL_CONFIG.multipleChoice,
      status: 'active',
      createdAt: new Date(),
    };

    const embed = createPollEmbed(pollData);
    const buttons = createPollButtons(pollData.options, pollId);

    const pollMessage = await interaction.editReply({
      content: '**Weekly Availability Poll Created!**',
      embeds: [embed],
      components: buttons,
    });

    pollData.messageId = pollMessage.id;
    await savePoll(pollId, pollData);

    console.log(`✅ Manual availability poll created with ID: ${pollId}`);
  } catch (error) {
    console.error('❌ Error creating availability poll:', error);
    await interaction.editReply({
      content: '❌ An error occurred while creating the poll.',
    });
  }
}

async function handleEndPollCommand(interaction) {
  try {
    const pollId = interaction.options.getString('pollid');

    await interaction.deferReply({ ephemeral: true });

    const pollData = await getPoll(pollId);
    if (!pollData) {
      await interaction.editReply({
        content: '❌ Poll not found with that ID.',
      });
      return;
    }

    if (pollData.status === 'ended') {
      await interaction.editReply({
        content: '❌ This poll has already ended.',
      });
      return;
    }

    await endPoll(pollId);
    await interaction.editReply({
      content: `✅ Poll ${pollId} has been ended successfully!`,
    });
  } catch (error) {
    console.error('❌ Error ending poll manually:', error);
    await interaction.editReply({
      content: '❌ An error occurred while ending the poll.',
    });
  }
}

client.on('error', console.error);

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('⚠️ SIGTERM received, shutting down gracefully...');
  client.destroy();
  process.exit(0);
});

client.login(botToken);
