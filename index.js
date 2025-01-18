// Require the necessary node classes
const fs = require('node:fs');
const path = require('node:path');
// Require the necessary discord.js classes
const { Client, Collection, Events, GatewayIntentBits, PermissionFlagsBits } = require('discord.js');
// Initialize dotenv
const dotenv = require('dotenv');
// Require openai
const { Configuration, OpenAI } = require("openai");

// Initialize dotenv config file
const args = process.argv.slice(2);
let envFile = '.env';
if (args.length === 1) {
	envFile = `${args[0]}`;
}
dotenv.config({ path: envFile });

// Setup OpenAI
// const openai = new OpenAIApi(process.env.OPENAI_API_KEY);
const openai = new OpenAI(process.env.OPENAI_API_KEY);

// Retrieve RoboHound and make a thread
async function main() {
	const myAssistant = await openai.beta.assistants.retrieve(
	  ""
	);
	console.log(myAssistant.name + " " + myAssistant.model);

	//create a thread
	const thread = await openai.beta.threads.create();

	//add a message to a thread
	const message = await openai.beta.threads.messages.create(
		thread.id,
		{
		  role: "user",
		  content: "What is your opinion of the IronPoint crew"
		}
		);

	//polled response
	let run = await openai.beta.threads.runs.createAndPoll(
		thread.id,
		{ 
		  assistant_id: myAssistant.id,
		}
	);
	if (run.status === 'completed') {
		const messages = await openai.beta.threads.messages.list(
		  run.thread_id
		);
		for (const message of messages.data.reverse()) {
		  console.log(`${message.role} > ${message.content[0].text.value}`);
		}
		} else {
		console.log(run.status);
	}
  }
  
  main();