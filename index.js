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

// Set channels
channelIds = process.env?.CHANNELS?.split(',');

//array of threads (one made per channel)
threadArray = [];

// Retrieve RoboHound
myAssistant = openai.beta.assistants;
async function retrieveAssistant(){
	myAssistant = await openai.beta.assistants.retrieve(
		process.env.ASSISTANT_KEY
	);
}

//create a thread
async function createThread(){
	const thread = openai.beta.threads.create();
	// let threadCombo = new threadAndChannel(channelId, (await thread).id);
	return((await thread).id);
}

//multiple same thread check and merge
async function threadsCheck(usedChannelId){
	sameChannelThreads = threadArray.filter(pair => pair.channelId > usedChannelId);
	const thread = openai.beta.threads.create();
}

//checks if threads need to be merged
async function threadCheckAndMerge(usedChannelId) {
	sameChannelThreads = threadArray.filter(pair => pair.channelId > usedChannelId);
	const combinedUniqueArray = [...new Set([...array1, ...array2])];
}

//Add discord message to a thread
async function addMessageToThread(usedChannelId, messageUser, messageContent){
	const threadChannelPair = threadArray.find(array => array.channelId = usedChannelId); //get the channel-thread pair (which also has run status)
	await openai.beta.threads.messages.create( //add the message to the thread
		threadChannelPair.threadId,
		{
			role: "user",
			content: messageUser + ": " + messageContent
		}
	);
};

//polled response
async function createAndPollMessage(discordMessage){
	//get the thread by the channel it came from
	const threadChannelPair = threadArray.find(array => array.channelId = discordMessage.channelId);
	//set the running status tag to true
	threadChannelPair.running = true;
	//run the thread
	let run = await openai.beta.threads.runs.createAndPoll(
		threadChannelPair.threadId,
		{ 
			assistant_id: myAssistant.id,
		}
	);
	if(run.status === 'in_progress'){
		// Start typing indicator - this doesn't actually do anything
		console.log("In Progress...");
	}
	if (run.status === 'completed') {
		//set the running status tag to true
		threadChannelPair.running = false;
		//capture the thread (it gets the whole convo on the API side)
		const messages = await openai.beta.threads.messages.list(
			run.thread_id
		  );
		//print to discord only the last message
		discordMessage.channel.send(messages.data[0].content[0].text.value);
	}
}

//---------------------------------------------------------------------------------//

//retrieve the chatGPT assistant
retrieveAssistant();

//Event Listener: login
client.on('ready', () => {
	//Create one thread per channel listed in .env
	channelIds.forEach(async element => {
		threadArray.push({channelId: element, threadId: await createThread(), lastMessageId: '', running: false})
	});
	console.log(`Logged in as ${client.user.tag}!`);
});

//Event Listener: Waiting for messages and actioning them
client.on('messageCreate', async message => {
	//check if the message channel is one that's being listened to
	if(channelIds.includes(message.channelId)){

		if (!message.guild) return; // Ignore DMs
		
		// Don't do anything when message is from self or bot depending on config
		if ((process.env.BOT_REPLIES === 'true' && message.author.id === client.user.id) || (process.env.BOT_REPLIES !== 'true' && message.author.bot)) return;

		// Don't reply to system messages
		if (message.system) return;

		//if the user mentions the bot or replies to the bot
		if (message.mentions.users.has(client.user.id)) { 
			//send a typing status
			message.channel.sendTyping();
			
			const threadChannelPair = threadArray.find(array => array.channelId = message.channelId); //retrieve the thread-channelId pair for the status
			if(threadChannelPair.running === false){ //check the thread status
				threadChannelPair.lastMessageId = message.id;
				addMessageToThread(message.channelId, message.author.username, message.content); //add the message to the correct thread
				createAndPollMessage(message); //poll, run, get response, and send it to the discord channel
			}else{
				//create a new thread and merge them afterwards
				threadArray.push({channelId: message.channelId, threadId: await createThread(),  lastMessageId: message.id, running: false});
				//activate thread check/merge/shorten function
				threadCheckAndMerge(message.channelId);
			}
			return;
		}else{ //for all other messages, we record them into the thread for reference
			if(threadChannelPair.running === false){
				addMessageToThread(message.channelId, message.author.username, message.content);
			}else{
				//create a new thread and merge them afterwards
				threadArray.push({channelId: message.channelId, threadId: await createThread(),  lastMessageId: message.id, running: false});
				//activate thread check/merge/shorten function
				threadCheckAndMerge(message.channelId);
			}
		}
	}else{ //if its not in a channel we specified in .env, it gets ignored
		return;
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