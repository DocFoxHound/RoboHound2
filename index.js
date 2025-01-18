// Require the necessary node classes
const fs = require('node:fs');
const path = require('node:path');
// Require the necessary discord.js classes
const { Client, Collection, Events, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
// Initialize dotenv
const dotenv = require('dotenv');
// Require openai
const { Configuration, OpenAI } = require("openai");
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

// Initialize Commands
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
// Initialize command files
for (const file of commandFiles) {
	const filePath = path.join(commandsPath, file);
	const command = require(filePath);
	// Set a new item in the Collection with the key as the command name and the value as the exported module
	if ('data' in command && 'execute' in command) {
		client.commands.set(command.data.name, command);
	} else {
		console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
	}
}

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

// Retrieve RoboHound and make a thread
const myAssistant = await openai.beta.assistants.retrieve(
	process.env.ASSISTANT_KEY
);

//create a thread
async function createThread(){
	const thread = await openai.beta.threads.create();
	return(thread);
}

//TODO: Add discord message to a thread
async function addMessageToThread(){
	const message = await openai.beta.threads.messages.create(
		thread.id,
		{
			role: "user",
			content: "What is your opinion of the IronPoint crew"
		}
		);
		return(message);
};




//Event Listeners that keep the bot active and looking for something to respond to
client.on('ready', () => {
	console.log(`Logged in as ${client.user.tag}!`);
});
client.on('messageCreate', message => {
    if (!message.guild) return; // Ignore DMs

    if (message.mentions.users.has(client.user.id)) {
        message.channel.send('Hello! How can I help you?');
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