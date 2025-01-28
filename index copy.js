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

// Set channels
channelIds = process.env?.CHANNELS?.split(",");

//array of threads (one made per channel)
threadArray = [];

//array of stored messages to be processed
messageArray = [];

//populate the messageArray as an array of messages grouped by the ChannelId as a key
channelIds.forEach(channel => {
  messageArray.push({channelId: channel, messages: [], isBusy: false});
});

// Retrieve RoboHound
myAssistant = openai.beta.assistants;
async function retrieveAssistant() {
  myAssistant = await openai.beta.assistants.retrieve(
    process.env.ASSISTANT_KEY
  );
};

//Add discord message to a thread
async function addMessagesToThread(fetchedMessages, thread, message) {
  // Convert the Collection (that's what .fetch() returns) to an array and reverse it
  const messagesArray = Array.from(fetchedMessages.values()).reverse();

  //add each message to a thread
  for (const msg of messagesArray) {
    //if the message was a reply, we want to include the previous message as the newest
    if(msg.reference && msg.reference.messageId){
      const referencedMessage = await msg.channel.messages.fetch(msg.reference.messageId);
      if(referencedMessage.author.id === client.user.id){
        try {
          await openai.beta.threads.messages.create(thread.id, {
              role: "assistant",
              content: referencedMessage.content
          });
        } catch (error) {
            console.error('Error adding message to thread: ', error);
        }
      }else{
        try {
          await openai.beta.threads.messages.create(thread.id, {
              role: "user",
              content: referencedMessage.author.username + ": " + referencedMessage.content
          });
        } catch (error) {
            console.error('Error adding message to thread: ', error);
        }
      }
    }
    //if the message is the bot, we want to add it a certain way so the bot knows it was itself speaking
    if(msg.author.id === client.user.id){
      try {
        await openai.beta.threads.messages.create(thread.id, {
            role: "assistant",
            content: msg.content
        });
      } catch (error) {
          console.error('Error adding message to thread: ', error);
      }
    }else{
      try {
        await openai.beta.threads.messages.create(thread.id, {
            role: "user",
            content: msg.author.username + ": " + msg.content
        });
      } catch (error) {
          console.error('Error adding message to thread: ', error);
      }
    }
  }
}

//polled response
async function runThread(message, thread) {
  //run the thread
  let run = await openai.beta.threads.runs.createAndPoll(
    thread.id,
    {
      assistant_id: myAssistant.id,
      additional_instructions: "Do not start with 'Ah,'. Do not ask to continue the conversation. Do not reference files." //reinforce some behaviors in the bot that aren't working right
    }
  );
  if (run.status === "in_progress"){}
  if (run.status === "completed") {
    //capture the thread (it gets the whole convo on the API side)
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
  //send a typing status
  message.channel.sendTyping();

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
      //get the last 5 messages in this channel
      const fetchedMessages = await message.channel.messages.fetch({ limit: 50 });

      // Replace user mentions in the message content
      fetchedMessages.forEach(msg => {
          msg.mentions.users.forEach(user => {
              const regex = new RegExp(`<@!?${user.id}>`, 'g');
              msg.content = msg.content.replace(regex, `@${user.username}`);
          });
      });

      //create a thread
      const thread = await openai.beta.threads.create();

      //add the message to the correct thread
      await addMessagesToThread(fetchedMessages, thread, message); 

      //poll, run, get response, and send it to the discord channel
      await runThread(message, thread); 
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
