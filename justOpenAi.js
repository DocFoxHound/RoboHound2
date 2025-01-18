// Retrieve RoboHound and make a thread
async function main() {
	const myAssistant = await openai.beta.assistants.retrieve(
		process.env.ASSISTANT_KEY
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