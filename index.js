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
const { initPersonalities } = require(path.join(__dirname, "common.js"));

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
  ],
});

//used for finding user mentions, later on in the program
const mentionRegex = /<@!?(\d+)>/g;

//stores unique user ID's
const userIds = new Set();

// Set channels
channelIds = process.env?.CHANNELS?.split(",");

//array of threads (one made per channel)
threadArray = [];

//array of stored messages to be processed
messageArray = [];

//populate the messageArray as an array of messages grouped by the ChannelId as a key
channelIds.forEach(channel => {
  messageArray.push({channelId: channel, conversation: []});
});

// Retrieve RoboHound
myAssistant = openai.beta.assistants;
async function retrieveAssistant() {
  myAssistant = await openai.beta.assistants.retrieve(
    process.env.ASSISTANT_KEY
  );
};

//Add discord message to a thread
async function addMessagesToThread(combinedConvo, thread) {
  // add conversation to a thread
  try {
    await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: combinedConvo
    });
  } catch (error) {
      console.error('Error adding message to thread: ', error);
  }
}

//polled response
async function runThread(message, thread) {
  //run the thread
  let run = await openai.beta.threads.runs.createAndPoll(
    thread.id,
    {
      assistant_id: myAssistant.id,
      additional_instructions: process.env.BOT_INSTRUCTIONS //reinforce some behaviors in the bot that aren't working right
    }
  );
  if (run.status === "in_progress"){} //DELETE?
  if (run.status === "completed") {
    //capture the thread and shove it into a reply
    try{
      const messages = await openai.beta.threads.messages.list(run.thread_id);
      //print to discord only the last message
      message.reply((messages.data[0].content[0].text.value).replace(client.user.username + ": ", "").replace(/【.*?】/gs, '')); //the way this works, sometimes it responds in the third person. This removes that.
    }catch(error){
      console.error('Error running the thread: ', error);
    }
  }
}

//---------------------------------------------------------------------------------//

//retrieve the chatGPT assistant
retrieveAssistant();

//Event Listener: login
client.on("ready", () => {
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

      // Replace mentions with user's username
      const readableMessage = message.content.replace(mentionRegex, (match, userId) => {
        const user = message.guild.members.cache.get(userId);
        return user ? `@${user.displayName}` : "@unknown-user";
      });

      //add message to the proper array, and if its over X entries get rid of the oldest
      const channelConvoPair = messageArray.find(c => c.channelId === message.channel.id);
      if (channelConvoPair.conversation.length >= process.env.MESSAGE_AMOUNT){
        channelConvoPair.conversation.shift();
      }
      channelConvoPair.conversation.push(message.member.displayName + ": " + readableMessage)
      
      //convert the array into a string, because it's faster than storing every message and 
      // separately adding it to the assistant's thread using the API (and also cheaper), or 
      // else you end up trying to cram 100 entries into 100 API calls and hang the system.
      // ask me how I know. I mean sure, the bot loses some context, but really... it's not
      // that noticeable
      const combinedConvo = channelConvoPair.conversation.join('\n') //newline that shit

      //create a thread
      const thread = await openai.beta.threads.create();

      //add the message to the correct thread
      await addMessagesToThread(combinedConvo, thread); 

      //poll, run, get response, and send it to the discord channel
      await runThread(message, thread); 
      return;
    } else {
      //FOR ALL OTHER MESSAGES
      // Replace mentions with user's username
      const readableMessage = message.content.replace(mentionRegex, (match, userId) => {
        const user = message.guild.members.cache.get(userId);
        return user ? `@${user.displayName}` : "@unknown-user";
      });

      //add message to the proper array, and if its over X entries get rid of the oldest
      const channelConvoPair = messageArray.find(c => c.channelId === message.channel.id);
      if (channelConvoPair.conversation.length >= process.env.MESSAGE_AMOUNT){
        channelConvoPair.conversation.shift();
      }
      channelConvoPair.conversation.push(message.member.displayName + ": " + readableMessage)
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
