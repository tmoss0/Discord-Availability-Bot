const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN environment variable is required!');
  console.error('Please set your Discord bot token in the .env file or environment variables.');
  process.exit(1);
}

const botToken = process.env.BOT_TOKEN;
const activePolls = new Map();
const POLLS_FILE = path.join(__dirname, 'active_polls.json');

// Helper function to check if running in cron mode
function isCronMode() {
  const isRenderCronJob = process.env.RENDER === 'true' && process.env.IS_RENDER_CRON === 'true';
  return process.env.CRON_MODE === 'true' || isRenderCronJob;
}

// Load existing polls from file
function loadPolls() {
  try {
    if (fs.existsSync(POLLS_FILE)) {
      const data = fs.readFileSync(POLLS_FILE, 'utf8');
      const pollsData = JSON.parse(data);
      
      // Convert back to Map with proper data structures
      for (const [pollId, pollData] of Object.entries(pollsData)) {
        // Convert votes back to Map structure
        const votes = new Map();
        if (pollData.votes) {
          for (const [userId, userVotes] of Object.entries(pollData.votes)) {
            if (pollData.multipleChoice && Array.isArray(userVotes)) {
              votes.set(userId, new Set(userVotes));
            } else {
              votes.set(userId, userVotes);
            }
          }
        }
        
        activePolls.set(pollId, {
          ...pollData,
          votes
        });
      }
      console.log(`📁 Loaded ${activePolls.size} active polls from storage`);
    }
  } catch (error) {
    console.error('❌ Error loading polls from file:', error);
  }
}

// Save polls to file
function savePolls() {
  try {
    const pollsData = {};
    
    // Convert Map to serializable object
    for (const [pollId, pollData] of activePolls.entries()) {
      const votes = {};
      
      // Convert votes Map to serializable object
      for (const [userId, userVotes] of pollData.votes.entries()) {
        if (pollData.multipleChoice && userVotes instanceof Set) {
          votes[userId] = Array.from(userVotes);
        } else {
          votes[userId] = userVotes;
        }
      }
      
      pollsData[pollId] = {
        ...pollData,
        votes
      };
    }
    
    fs.writeFileSync(POLLS_FILE, JSON.stringify(pollsData, null, 2));
    console.log(`💾 Saved ${activePolls.size} active polls to storage`);
  } catch (error) {
    console.error('❌ Error saving polls to file:', error);
  }
}
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

function findActivePollIdByChannel(channelId) {
  for (const [existingPollId, pollData] of activePolls.entries()) {
    if (pollData.channelId === channelId && Date.now() < pollData.endTime) {
      return existingPollId;
    }
  }
  return null;
}

// Clean up expired polls
function cleanupExpiredPolls() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [pollId, pollData] of activePolls.entries()) {
    if (now > pollData.endTime) {
      activePolls.delete(pollId);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Cleaned up ${cleanedCount} expired polls`);
    savePolls();
  }
}

// Check if it's time for a new weekly poll (e.g., every Monday)
function shouldCreateNewWeeklyPoll(channelId) {
  const existingPollId = findActivePollIdByChannel(channelId);
  if (existingPollId) {
    console.log(`⚠️ An active poll already exists in channel ${channelId} (id: ${existingPollId}). Skipping creation.`);
    return false;
  }
  
  // Additional logic: Check if we've already created a poll this week
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Start of current week (Sunday)
  startOfWeek.setHours(0, 0, 0, 0);
  
  // Check if any poll was created this week for this channel
  for (const [pollId, pollData] of activePolls.entries()) {
    if (pollData.channelId === channelId) {
      const pollCreatedTime = parseInt(pollId); // pollId is timestamp
      if (pollCreatedTime >= startOfWeek.getTime()) {
        console.log(`⚠️ A poll was already created this week for channel ${channelId}. Skipping creation.`);
        return false;
      }
    }
  }
  
  return true;
}

client.once('ready', async () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
  
  // Load existing polls from storage
  loadPolls();
  
  // Clean up any expired polls
  cleanupExpiredPolls();
  
  await registerAvailabilityCommand();
  
  // Check if running in cron mode
  if (isCronMode()) {
    console.log('🕐 Running in CRON mode - will create weekly poll if needed');
    await createWeeklyPoll();
    
    // In cron mode, exit after creating poll
    setTimeout(() => {
      console.log('✅ Cron job completed. Exiting...');
      savePolls();
      process.exit(0);
    }, 10000); // Give 10 seconds for poll creation to complete on Render
  } else {
    console.log('🔄 Running in persistent mode - bot will stay online');
    await createWeeklyPoll();
  }
});

async function registerAvailabilityCommand() {
  const { REST, Routes } = require('discord.js');
  const rest = new REST({ version: '10' }).setToken(botToken);

  const commands = [
    {
      name: 'availability',
      description: 'Create a weekly availability poll',
    },
  ];

  try {
    console.log('Registering availability command...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('Availability command registered successfully!');
  } catch (error) {
    console.error('Error registering availability command:', error);
  }
}

async function createWeeklyPoll() {
  try {
    if (!POLL_CONFIG.channelId) {
      console.log('⚠️ CHANNEL_ID not configured. Skipping automatic weekly poll creation.');
      console.log('Use the /availability command to create polls manually.');
      return;
    }

    const channel = client.channels.cache.get(POLL_CONFIG.channelId);
    if (!channel) {
      console.error('❌ Channel not found! Please check your CHANNEL_ID configuration.');
      return;
    }

    // Use the improved checking logic
    if (!shouldCreateNewWeeklyPoll(POLL_CONFIG.channelId)) {
      return;
    }

    const pollId = Date.now().toString();
    const pollData = {
      question: POLL_CONFIG.defaultPollQuestion,
      options: POLL_CONFIG.defaultPollOptions,
      votes: new Map(),
      endTime: Date.now() + POLL_CONFIG.pollDuration,
      channelId: POLL_CONFIG.channelId,
      multipleChoice: POLL_CONFIG.multipleChoice,
    };

    const embed = createPollEmbed(pollData, pollId);
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

    // Save to persistent storage
    savePolls();

    // Always set the timeout to automatically close the poll after 24 hours
    setTimeout(() => endPoll(pollId), POLL_CONFIG.pollDuration);
  } catch (error) {
    console.error('❌ Error creating weekly poll:', error);
  }
}

function createPollEmbed(pollData) {
  const embed = new EmbedBuilder()
    .setTitle('📊 Weekly Availability Poll')
    .setDescription(pollData.question)
    .setColor('#0099ff')
    .setTimestamp()
    .setFooter({
      text: `${pollData.multipleChoice ? '• Multiple choices allowed' : '• Single choice only'}`,
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
      const day = dayParts.join(' '); // Get the day name (e.g., "Monday")

      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`poll_${pollId}_${j}`)
          .setLabel(day) // Show the day name as the label
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

    const pollData = activePolls.get(pollId);

    if (!pollData) return;

    if (Date.now() > pollData.endTime) return;

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
      const optionText = pollData.options[optionIndex];

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
        const optionText = pollData.options[optionIndex];
      }
    }

    await updatePollMessage(pollId);
    
    // Save changes to persistent storage
    savePolls();
  } catch (error) {
    console.error('Error handling poll vote:', error);
  }
}

async function updatePollMessage(pollId) {
  try {
    const pollData = activePolls.get(pollId);
    if (!pollData) return;

    const channel = client.channels.cache.get(pollData.channelId);
    if (!channel) return;

    const message = await channel.messages.fetch(pollData.messageId);
    if (!message) return;

    const embed = createPollEmbed(pollData, pollId);
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
    const pollData = activePolls.get(pollId);
    if (!pollData) return;

    const channel = client.channels.cache.get(pollData.channelId);
    if (!channel) return;

    const resultsEmbed = createResultsEmbed(pollData, pollId);

    await channel.send({
      content: '**Poll Results**',
      embeds: [resultsEmbed],
    });

    try {
      const message = await channel.messages.fetch(pollData.messageId);
      const embed = createPollEmbed(pollData, pollId);
      embed.setColor('#ff0000');
      embed.setTitle('📊 Weekly Poll (ENDED)');

      await message.edit({
        embeds: [embed],
        components: [],
      });
    } catch (error) {
      console.error('Error updating ended poll message:', error);
    }

    activePolls.delete(pollId);

    console.log(`Poll ${pollId} has ended`);
  } catch (error) {
    console.error('Error ending poll:', error);
  }
}

function createResultsEmbed(pollData, pollId) {
  const embed = new EmbedBuilder()
    .setTitle('Availability Poll Results')
    .setDescription(pollData.question)
    .setColor('#00ff00')
    .setTimestamp();

  // Calculate results
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
    }
    return;
  }
});

async function createAvailabilityPoll(interaction) {
  try {
    // Prevent duplicate active polls in the same channel
    const existingPollId = findActivePollIdByChannel(interaction.channel.id);
    if (existingPollId) {
      await interaction.reply({
        content: 'There is already an active poll in this channel. Please wait until it ends.',
        ephemeral: true,
      });
      return;
    }

    const pollId = Date.now().toString();
    const pollData = {
      question: POLL_CONFIG.defaultPollQuestion,
      options: POLL_CONFIG.defaultPollOptions,
      votes: new Map(),
      endTime: Date.now() + POLL_CONFIG.pollDuration,
      channelId: interaction.channel.id,
      multipleChoice: POLL_CONFIG.multipleChoice,
    };

    const embed = createPollEmbed(pollData, pollId);
    const buttons = createPollButtons(pollData.options, pollId);

    const pollMessage = await interaction.reply({
      content: '**Weekly Availability Poll Created!**',
      embeds: [embed],
      components: buttons,
      fetchReply: true,
    });

    activePolls.set(pollId, {
      ...pollData,
      messageId: pollMessage.id,
    });

    // Save to persistent storage
    savePolls();

    // Always set the timeout to automatically close the poll after 24 hours
    setTimeout(() => endPoll(pollId), POLL_CONFIG.pollDuration);

    console.log(`Manual availability poll created with ID: ${pollId}`);
  } catch (error) {
    console.error('Error creating availability poll:', error);
    await interaction.reply({
      content: 'An error occurred while creating the poll.',
      ephemeral: true,
    });
  }
}

client.on('error', console.error);

client.login(botToken);
