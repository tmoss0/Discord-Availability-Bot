const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN environment variable is required!');
  process.exit(1);
}

const botToken = process.env.BOT_TOKEN;
const activePolls = new Map();
const POLLS_FILE = path.join(__dirname, 'polls.json');

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

function isCronMode() {
  return process.env.AUTO_POLL_MODE === 'true';
}

// Poll persistence functions
function savePolls() {
  try {
    const pollsData = {};
    for (const [pollId, pollData] of activePolls.entries()) {
      // Convert Map and Set objects to plain objects for JSON serialization
      const serializedVotes = {};
      for (const [userId, userVotes] of pollData.votes.entries()) {
        if (pollData.multipleChoice) {
          serializedVotes[userId] = Array.from(userVotes);
        } else {
          serializedVotes[userId] = userVotes;
        }
      }
      
      pollsData[pollId] = {
        ...pollData,
        votes: serializedVotes
      };
    }
    fs.writeFileSync(POLLS_FILE, JSON.stringify(pollsData, null, 2));
  } catch (error) {
    console.error('Error saving polls:', error);
  }
}

function loadPolls() {
  try {
    if (fs.existsSync(POLLS_FILE)) {
      const data = fs.readFileSync(POLLS_FILE, 'utf8');
      const pollsData = JSON.parse(data);
      
      for (const [pollId, pollData] of Object.entries(pollsData)) {
        // Skip expired polls
        if (Date.now() > pollData.endTime) {
          continue;
        }
        
        // Reconstruct Map and Set objects
        const votes = new Map();
        for (const [userId, userVotes] of Object.entries(pollData.votes)) {
          if (pollData.multipleChoice) {
            votes.set(userId, new Set(userVotes));
          } else {
            votes.set(userId, userVotes);
          }
        }
        
        activePolls.set(pollId, {
          ...pollData,
          votes
        });
        
        // Set up timeout for remaining duration
        const remainingTime = pollData.endTime - Date.now();
        if (remainingTime > 0) {
          setTimeout(() => endPoll(pollId), remainingTime);
        }
      }
      
      console.log(`Loaded ${activePolls.size} active polls from storage`);
    }
  } catch (error) {
    console.error('Error loading polls:', error);
  }
}

function getPollData(pollId) {
  const pollData = activePolls.get(pollId);
  if (!pollData) return null;
  if (Date.now() > pollData.endTime) return null;
  return pollData;
}

client.once('ready', async () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);

  // Load any existing polls from storage
  loadPolls();

  // Set up periodic saves every 5 minutes
  setInterval(savePolls, 5 * 60 * 1000);

  if (!isCronMode()) {
    await registerAvailabilityCommand();
  }

  if (isCronMode()) {
    console.log('🕐 Running in CRON mode - creating weekly poll and staying online for votes');
    await createWeeklyPoll();

    // Stay online for the duration of the poll (Railway.com compatible)
    const bufferMs = 15000; // small buffer to allow result message edits to complete
    console.log(
      `⏳ Staying online for ${(POLL_CONFIG.pollDuration / (60 * 1000)).toFixed(0)} minutes to collect votes...`
    );
    // Note: Removed process.exit() to keep bot running on Railway.com
    setTimeout(() => {
      console.log('✅ Poll window complete. Bot will continue running...');
    }, POLL_CONFIG.pollDuration + bufferMs);
  } else {
    console.log('🔄 Running in persistent mode - bot will stay online');
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
    console.log('🔄 Registering availability command...');
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log('✅ Availability command registered successfully!');
  } catch (error) {
    console.error('❌ Error registering availability command:', error);
  }
}

async function createWeeklyPoll() {
  try {
    if (!POLL_CONFIG.channelId) {
      console.log('⚠️ CHANNEL_ID not configured. Skipping automatic weekly poll creation.');
      return null;
    }

    const channel = client.channels.cache.get(POLL_CONFIG.channelId);
    if (!channel) {
      console.error('❌ Channel not found! Please check your CHANNEL_ID configuration.');
      return null;
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

    savePolls(); // Save to persistent storage
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
    savePolls(); // Save votes to persistent storage
  } catch (error) {
    console.error('Error handling poll vote:', error);
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
    const pollData = getPollData(pollId);
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
        components: [], // Remove voting buttons
      });
    } catch (error) {
      console.error('Error updating ended poll message:', error);
    }

    activePolls.delete(pollId);
    savePolls(); // Remove ended poll from storage
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

    savePolls(); // Save to persistent storage
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
