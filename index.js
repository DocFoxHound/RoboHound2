// Require the necessary node classes
const fs = require("node:fs");
const path = require("node:path");
const util = require('util');
// Require the necessary discord.js classes
const {
  Client,
  Collection,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
} = require("discord.js");
// Initialize dotenv
const dotenv = require("dotenv");
// Require openai
const { Configuration, OpenAI } = require("openai");
const { threadId } = require("node:worker_threads");
const { isNull } = require("node:util");
// Require global functions
const vectorHandler = require("./vector-handler.js");
const threadHandler = require("./thread-handler");

// Initialize dotenv config file
const args = process.argv.slice(2);
let envFile = ".env";
if (args.length === 1) {
  envFile = `${args[0]}`;
}
dotenv.config({ path: envFile });

// Setup OpenAI
const openai = new OpenAI(process.env.OPENAI_API_KEY);

// Create a new discord client instance
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
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

//populate the messageArray as an array of messages grouped by the ChannelId as a key
channelIds.forEach(channel => {
  messageArray.push({channelId: channel, conversation: []});
});

// Retrieve the bot assistant (read: personality)
myAssistant = openai.beta.assistants;
async function retrieveAssistant() {
  myAssistant = await openai.beta.assistants.retrieve(
    process.env.ASSISTANT_KEY
  );
};

//---------------------------------------------------------------------------------//

//retrieve the chatGPT assistant
retrieveAssistant();

//Event Listener: login
client.on("ready", () => {
  //preload some channelIDs and Names
  channelIds.forEach(channel => {
    channelObj = client.channels.cache.get(channel)
    channelIdAndName.push({channelName: channelObj.name, channelId: channelObj.id});
  });

  //run the vector checker to see if we need to update the vector store for the bot's background knowledge
  const checkChatLogs = setInterval(() => vectorHandler.refreshChatLogs(channelIdAndName, openai, client), 30000);
  // const checkChatLogs = setInterval(() => vectorHandler.chatLogCheck(openai), 86400000);
  const checkUsersOnline = setInterval(() => vectorHandler.refreshUserList(openai, client), 43200000);
  console.log(`Logged in as ${client.user.tag}!`);
});

//Event Listener: Waiting for messages and actioning them
client.on("messageCreate", async (message) => {
  //ignore if the message channel is not one that's being listened to
  if (channelIds.includes(message.channelId)) {
    // Ignore DMs
    if (!message.guild){
      return; 
    }

    // Don't reply to system messages
    if (message.system) {
      return;
    }

    //if the user mentions the bot or replies to the bot
    if (message.mentions.users.has(client.user.id)) {
      //send a typing status
      message.channel.sendTyping();

      //process the message so that it comes out nice and neat for use
      const combinedConvo = threadHandler.processMessageToSend(message, messageArray, mentionRegex)

      //create a thread
      const thread = await openai.beta.threads.create();

      //add the message to the thread
      await threadHandler.addMessagesToThread(combinedConvo, thread, openai); 

      //poll, run, get response, and send it to the discord channel
      await threadHandler.runThread(message, thread, openai, client); 
      return;
    } else {
      //FOR ALL OTHER MESSAGES
      threadHandler.processMessage(message, messageArray, mentionRegex);
    }
  } else {
    return;
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