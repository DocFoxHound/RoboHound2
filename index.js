// Require the necessary discord.js classes
const { Client, GatewayIntentBits } = require("discord.js");
// Initialize dotenv
const dotenv = require("dotenv");
// Require openai
const { OpenAI } = require("openai");
// Require global functions
const vectorHandler = require("./vector-handler.js");
const threadHandler = require("./thread-handler");
const generalPurpose = require("./general-purpose-functions.js")

// Initialize dotenv config file
const args = process.argv.slice(2);
let envFile = ".env";
if (args.length === 1) {
  envFile = `${args[0]}`;
}
dotenv.config({
  path: envFile,
});

// Setup OpenAI
const openai = new OpenAI(process.env.OPENAI_API_KEY);

// Create a new discord client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

//stores unique user ID's
const userIds = new Set();

//used for finding user mentions, later on in the program
const mentionRegex = /<@!?(\d+)>/g;

// Set channels
channelIds = process.env?.CHANNELS?.split(",");
channelIdAndName = [];

//array of threads (one made per channel)
threadArray = [];

//array of stored messages to be processed
messageArray = [];

//used to store cache'd users, periodically refreshed
userCache = new Map();

//populate the messageArray as an array of messages grouped by the ChannelId as a key
channelIds.forEach((channel) => {
  messageArray.push({
    channelId: channel,
    conversation: [],
  });
});

// Retrieve the bot assistant (read: personality)
myAssistant = openai.beta.assistants;
async function retrieveAssistant() {
  myAssistant = await openai.beta.assistants.retrieve(
    process.env.ASSISTANT_KEY
  );
}

//---------------------------------------------------------------------------------//

//retrieve the chatGPT assistant
retrieveAssistant();

//run the vector checker to see if we need to update the vector store for the bot's background knowledge
generalPurpose.routineFunctions();

//Event Listener: login
client.on("ready", async () => {
  //fetch channels on a promise, reducing startup time
  const channelFetchPromises = channelIds.map(id => client.channels.fetch(id).catch(e => console.error(`Failed to fetch channel: ${id}`, e)));
  const channels = await Promise.all(channelFetchPromises);
  //preload some channelIDs and Names
  channelIdAndName = channels.map(channel => ({
    channelName: channel?.name,
    channelId: channel?.id
  })).filter(channel => channel.channelId);
  console.log(`Logged in as ${client.user.tag}!`);
});

// //Event Listener: Waiting for messages and actioning them
// client.on("messageCreate", async (message) => {
//   //ignore if the message channel is not one that's being listened to
//   if (channelIds.includes(message.channelId)) {
//     // Ignore DMs
//     if (!message.guild) {
//       return;
//     }

//     // Don't reply to system messages
//     if (message.system) {
//       return;
//     }

//     //if the user mentions the bot or replies to the bot
//     if (message.mentions.users.has(client.user.id)) {
//       //send a typing status
//       message.channel.sendTyping();

//       //process the message so that it comes out nice and neat for use
//       const newMessage = threadHandler.processMessageToSend(
//         message,
//         mentionRegex
//       );

//       //combine the convo
//       const previosConvo = threadHandler.processPreviosConvo(
//         messageArray,
//         message
//       );

//       //put the conversation and the latest message in an array
//       const combinedMessages = [previosConvo, newMessage];

//       //create a thread
//       const thread = await openai.beta.threads.create();

//       //add the message to the thread
//       for (const message of combinedMessages) {
//         await threadHandler.addMessagesToThread(message, thread, openai);
//       }

//       //poll, run, get response, and send it to the discord channel
//       await threadHandler.runThread(message, thread, openai, client);
//       return;
//     } else {
//       //FOR ALL OTHER MESSAGES
//       threadHandler.formatMessage(message, messageArray, mentionRegex);
//     }
//   } else {
//     return;
//   }
// });

client.on("messageCreate", async (message) => {
  // Check for conditions to ignore the message early
  if (!channelIds.includes(message.channelId) || !message.guild || message.system) {
    return;
  }

  // Check if the bot is mentioned or if the message is a reply to the bot
  if (message.mentions.users.has(client.user.id)) {
    message.channel.sendTyping();  // Send typing indicator once we know we need to process

    const newMessage = threadHandler.processMessageToSend(message, mentionRegex, userCache);
    const previosConvo = threadHandler.processPreviosConvo(messageArray, message, userCache);
    const combinedMessages = [previosConvo, newMessage];

    // Handle thread creation and message processing
    try {
      const thread = await openai.beta.threads.create();
      for (const message of combinedMessages) {
        await threadHandler.addMessagesToThread(message, thread.id, openai);
      }
      await threadHandler.runThread(message, thread, openai, client);
    } catch (error) {
      console.error("Failed to process thread:", error);
      message.channel.send("ERROR.");
    }
  } else {
    // Handle all other messages
    threadHandler.formatMessage(message, messageArray, mentionRegex);
  }
});

// Error handling to prevent crashes
client.on("error", (e) => {
  console.error("Discord client error!", e);
});

// Attempt to auto-reconnect on disconnection
client.on("disconnect", () => {
  console.log("Disconnected! Trying to reconnect...");
  client.login(process.env.CLIENT_TOKEN);
});

//logs the bot in
client.login(process.env.CLIENT_TOKEN);

//TODO
//see active users, see user roles
