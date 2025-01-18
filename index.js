// Require the necessary node classes
const fs = require('node:fs');
const path = require('node:path');
// Require the necessary discord.js classes
const { Client, Collection, Events, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
// Initialize dotenv
const dotenv = require('dotenv');
// Require openai
const { Configuration, OpenAI } = require("openai");
const { threadId } = require('node:worker_threads');
// Require global functions
const { initPersonalities } = require(path.join(__dirname, "common.js"));

// Initialize dotenv config file
const args = process.argv.slice(2);
let envFile = '.env';
if (args.length === 1) {
	envFile = `${args[0]}`;
}
dotenv.config({ path: envFile });

// Setup OpenAI
const openai = new OpenAI(process.env.OPENAI_API_KEY);

// Create a new discord client instance
const client = new Client({intents: [GatewayIntentBits.Guilds,GatewayIntentBits.GuildMessages,GatewayIntentBits.MessageContent,] });

// Retrieve RoboHound and make a thread
const myAssistant = openai.beta.assistants.retrieve(
	process.env.ASSISTANT_KEY
);

// Set channels
channelIds = process.env?.CHANNELS?.split(',');

//array of threads (one made per channel)
threadArray = [];

// Create state array
let state = {
	isPaused: false,
	personalities: [],
	tokenTimer: null,
	tokenCount: null,
	startTime: new Date(),
	totalTokenCount: 0,
	slowModeTimer: {}
};

//create a thread
async function createThread(){
	const thread = openai.beta.threads.create();
	// let threadCombo = new threadAndChannel(channelId, (await thread).id);
	return((await thread).id);
}

//TODO: Add discord message to a thread
async function addMessageToThread(usedChannelId, messageUser, messageContent){
	const threadChannelPair = threadArray.find(array => array.channelId = usedChannelId);
	await openai.beta.threads.messages.create(
		threadChannelPair.threadId,
		{
			role: "user",
			content: messageUser + ": " + messageContent
		}
		);
};

//polled response
async function createAndPollMessage(discordMessage){
	console.log("Assistant2: " + myAssistant.id)
	const threadChannelPair = threadArray.find(array => array.channelId = discordMessage.channelId);
	let run = await openai.beta.threads.runs.createAndPoll(
		threadChannelPair.threadId,
		{ 
		  assistant_id: myAssistant.id,
		}
	);
	if(run.status === 'in_progress'){
		//TODO: spinny wheel in discord
		console.log("In Progress...");
	}
	if (run.status === 'completed') {
		const messages = await openai.beta.threads.messages.list(
		  run.thread_id
		);
		for (const message of messages.data.reverse()) {
		  console.log(`${message.role} > ${message.content[0].text.value}`);
		  discordMessage.channel.send(message.content[0].text.value);
		}
		} else {
		console.log(run.status);
	}
}

//---------------------------------------------------------------------------------//

//Event Listener: login
client.on('ready', () => {
	//Create one thread per channel listed in .env
	channelIds.forEach(async element => {
		// threadArray.push(createThread(element))
		threadArray.push({channelId: element, threadId: await createThread()})
	});
	console.log("Assistant: " + myAssistant.id)
	console.log(`Logged in as ${client.user.tag}!`);
});

//Event Listener: Waiting for messages and actioning them
client.on('messageCreate', message => {
    if (!message.guild) return; // Ignore DMs

    if (message.mentions.users.has(client.user.id)) { //if the user mentions the bot (or replies?)
		addMessageToThread(message.channelId, message.author.username, message.content); //add the message to the right thread
		createAndPollMessage(message); //poll and run the message
		// message.channel.send('Hello! How can I help you?');
    }
});

// Error handling to prevent crashes
client.on('error', (e) => {
    console.error('Discord client error!', e);
});

// Attempt to auto-reconnect on disconnection
client.on('disconnect', () => {
    console.log('Disconnected! Trying to reconnect...');
    client.login(process.env.CLIENT_TOKEN);
});

//logs the bot in
client.login(process.env.CLIENT_TOKEN);