const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
require('dotenv').config();

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});
const botToken = process.env.BOT_TOKEN;
const activePolls = new Map();
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

client.once('ready', async () => {
  console.log(`✅ Bot is ready! Logged in as ${client.user.tag}`);
  await registerAvailabilityCommand();
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
    const channel = client.channels.cache.get(POLL_CONFIG.channelId);
    if (!channel) {
      console.error('Channel not found!');
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

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  const [action, pollId, optionIndex] = interaction.customId.split('_');

  if (action === 'poll') {
    await handlePollVote(interaction, pollId, parseInt(optionIndex));
  }
});

async function handlePollVote(interaction, pollId, optionIndex) {
  try {
    const pollData = activePolls.get(pollId);

    if (!pollData) {
      await interaction.reply({
        content: 'This poll is no longer active.',
        ephemeral: true,
      });
      return;
    }

    if (Date.now() > pollData.endTime) {
      await interaction.reply({
        content: 'This poll has already ended.',
        ephemeral: true,
      });
      return;
    }

    const userId = interaction.user.id;

    if (pollData.multipleChoice) {
      if (!pollData.votes.has(userId)) {
        pollData.votes.set(userId, new Set());
      }

      const userVotes = pollData.votes.get(userId);
      const optionText = pollData.options[optionIndex];

      if (userVotes.has(optionIndex)) {
        userVotes.delete(optionIndex);
        await interaction.reply({
          content: `✅ Removed vote for: ${optionText}`,
          ephemeral: true,
        });
      } else {
        userVotes.add(optionIndex);
        await interaction.reply({
          content: `✅ Added vote for: ${optionText}`,
          ephemeral: true,
        });
      }

      if (userVotes.size === 0) {
        pollData.votes.delete(userId);
      }
    } else {
      const previousVote = pollData.votes.get(userId);

      if (previousVote === optionIndex) {
        pollData.votes.delete(userId);
        await interaction.reply({
          content: '✅ Your vote has been removed.',
          ephemeral: true,
        });
      } else {
        pollData.votes.set(userId, optionIndex);
        const optionText = pollData.options[optionIndex];
        await interaction.reply({
          content: `✅ You voted for: ${optionText}`,
          ephemeral: true,
        });
      }
    }

    await updatePollMessage(pollId);
  } catch (error) {
    console.error('Error handling poll vote:', error);
    await interaction.reply({
      content: 'An error occurred while processing your vote.',
      ephemeral: true,
    });
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
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === 'availability') {
    await createAvailabilityPoll(interaction);
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
