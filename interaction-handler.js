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
      console.log(`📁 Interaction Handler: Loaded ${activePolls.size} active polls from storage`);
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
    console.log(`💾 Interaction Handler: Saved ${activePolls.size} active polls to storage`);
  } catch (error) {
    console.error('❌ Error saving polls to file:', error);
  }
}

// Clean up expired polls and end them properly
async function cleanupExpiredPolls() {
  const now = Date.now();
  let cleanedCount = 0;
  
  for (const [pollId, pollData] of activePolls.entries()) {
    if (now > pollData.endTime) {
      // End the poll properly before cleaning up
      await endPoll(pollId);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`🧹 Interaction Handler: Ended and cleaned up ${cleanedCount} expired polls`);
  }
}

// More frequent check specifically for ending polls (every 5 minutes)
async function checkAndEndExpiredPolls() {
  const now = Date.now();
  let endedCount = 0;
  
  for (const [pollId, pollData] of activePolls.entries()) {
    // Check if poll has expired (with a small buffer to avoid timing issues)
    if (now >= pollData.endTime - 30000) { // 30 seconds buffer
      console.log(`⏰ Poll ${pollId} has expired. Ending now...`);
      await endPoll(pollId);
      endedCount++;
    }
  }
  
  if (endedCount > 0) {
    console.log(`⏰ Ended ${endedCount} expired polls`);
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

    if (!pollData) {
      console.log(`❌ Poll ${pollId} not found`);
      return;
    }

    if (Date.now() > pollData.endTime) {
      console.log(`❌ Poll ${pollId} has expired`);
      // End the poll if it hasn't been ended yet
      await endPoll(pollId);
      return;
    }

    if (
      typeof optionIndex !== 'number' ||
      Number.isNaN(optionIndex) ||
      optionIndex < 0 ||
      optionIndex >= pollData.options.length
    ) {
      console.log(`❌ Invalid option index: ${optionIndex}`);
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
        console.log(`🗳️ User ${userId} removed vote for: ${optionText}`);
      } else {
        userVotes.add(optionIndex);
        console.log(`🗳️ User ${userId} voted for: ${optionText}`);
      }

      if (userVotes.size === 0) {
        pollData.votes.delete(userId);
      }
    } else {
      const previousVote = pollData.votes.get(userId);

      if (previousVote === optionIndex) {
        pollData.votes.delete(userId);
        console.log(`🗳️ User ${userId} removed their vote`);
      } else {
        pollData.votes.set(userId, optionIndex);
        const optionText = pollData.options[optionIndex];
        console.log(`🗳️ User ${userId} voted for: ${optionText}`);
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

client.once('ready', async () => {
  console.log(`✅ Interaction Handler Bot is ready! Logged in as ${client.user.tag}`);
  
  // Load existing polls from storage
  loadPolls();
  
  // Clean up any expired polls
  await cleanupExpiredPolls();
  
  // Set up periodic cleanup (every 30 minutes)
  setInterval(async () => {
    await cleanupExpiredPolls();
  }, 30 * 60 * 1000);
  
  // Set up more frequent poll ending checks (every 5 minutes)
  setInterval(async () => {
    await checkAndEndExpiredPolls();
  }, 5 * 60 * 1000);
});

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
    savePolls();

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
});

client.on('error', console.error);

client.login(botToken);
