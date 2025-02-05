const functionHandler = require("./function-handler");

//convert the message into something we'll store to use for later
function formatMessage(message, messageArray, mentionRegex){
    // Replace mentions with user's username
    const readableMessage = message.content.replace(mentionRegex, (match, userId) => {
        const user = message.guild.members.cache.get(userId);
        return user ? `@${user.displayName}` : "@unknown-user";
      });
      //add message to the proper array, and if its over X entries get rid of the oldest
      //note here that the max character amount that can go into a single message is 2000, 
      //so an entry number over, like, 50 is absolutely pointless and just wastes RAM space
      const channelConvoPair = messageArray.find(c => c.channelId === message.channel.id);
      if (channelConvoPair.conversation.length >= process.env.MESSAGE_AMOUNT){
        channelConvoPair.conversation.shift();
      }
      try{
        channelConvoPair.conversation.push(`<${message.createdTimestamp}> ${message.member.displayName}: ${readableMessage}`)
      }catch(error){
        console.log(`There was an error adding a message to the ConvoPair array: ${error}`);
      }
}

//Convert the input text to something the bot can use
function processMessageToSend(message, mentionRegex){
    // Replace mentions with user's username
    const readableMessage = message.content.replace(mentionRegex, (match, userId) => {
        const user = message.guild.members.cache.get(userId);
        return user ? `@${user.displayName}` : "@unknown-user";
    });
    //convert the array into a string, because it's faster than sending each individual message via the api
    const contentText = `<${message.createdTimestamp}> ${message.member.displayName}: ${readableMessage}`;
    //strings being put into a single message cannot exceed 2000 characters
    if (contentText.length > 1999) {
        return contentText.slice(contentText.length - 1999);
    }
    return contentText;
}

async function processWelcomeMessage(message, openai, client){
    const mentionedUser = message.mentions.users;
    const thread = await openai.beta.threads.create();
    const welcomeInstructions = process.env.WELCOME_INSTRUCTION;
    const welcomeInstructions2 = process.env.WELCOME_INSTRUCTION2;
    if (message.channelId === process.env.WELCOME_CHANNEL_ID && message.content.includes(process.env.WELCOME_MESSAGE)){
        await addMessagesToThread(`${welcomeInstructions}: USER: ${mentionedUser}`, thread, openai); 
        await runThread(message, thread, openai, client, mentionedUser); 
    } else if (message.channelId === process.env.WELCOME_CHANNEL_ID && message.content.includes(process.env.WELCOME_MESSAGE2)){
        await addMessagesToThread(`${welcomeInstructions2}: USER: ${mentionedUser}`, thread, openai); 
        await runThread(message, thread, openai, client, mentionedUser); 
    }
}

//Convert the input text to something the bot can use
function processPreviosConvo(messageArray, message){
    //add message to the proper array, and if its over X entries get rid of the oldest
    const channelConvoPair = messageArray.find(c => c.channelId === message.channel.id);
    if (channelConvoPair.conversation.length >= process.env.MESSAGE_AMOUNT){
        channelConvoPair.conversation.shift();
    }
    //convert the array into a string, because it's faster than sending each individual message via the api
    const contentText = channelConvoPair.conversation.join('\n')

    //strings being put into a single message cannot exceed 2000 characters
    if (contentText.length > 1999) {
        return contentText.slice(contentText.length - 1999);
    }
    return contentText;
}

//Add discord message to a thread
async function addMessagesToThread(contentText, thread, openai) {
    // add conversation to a thread
    try {
        const run = await openai.beta.threads.messages.create(thread.id, {
            role: "user",
            content: contentText
        });
    } catch (error) {
        console.error('Error adding message to thread, if the bot just started this is expected.');
    }
}

//a tool and/or Function Call
async function addResultsToRun(contentText, openai, threadId, toolId, runId){
        // if the toolId is populated, that means this is a tool call and we need
        // to add the results back to the thread
        if (contentText.length > 1999) {
            contentText = contentText.slice(contentText.length - 1999);
        }
        try{
            const run = await openai.beta.threads.runs.submitToolOutputsAndPoll(
                threadId,
                runId,
                {
                  tool_outputs: [
                    {
                      tool_call_id: toolId,
                      output: contentText,
                    },
                  ],
                }
            )
            return run;
        }catch(error){
            console.log("Error adding tool/function results to run: " + error)
        }
}
  
//polled response
async function runThread(message, thread, openai, client, mentionedUser) {
    //run the thread
    let run = await openai.beta.threads.runs.createAndPoll(
        thread.id,
        {
        assistant_id: myAssistant.id,
        additional_instructions: process.env.BOT_INSTRUCTIONS //reinforce some behaviors in the bot that aren't working right
        }
    );
    if (run.status === "requires_action"){ //this runs if there's a tool/function call, so we gotta do work before returning the results
        console.log("Requires Action");
        message.channel.sendTyping();
        toolCallId = run.required_action.submit_tool_outputs.tool_calls[0].id;
        //get the function results as a string
        contentText = await functionHandler.executeFunction(run.required_action.submit_tool_outputs.tool_calls[0], message, client, openai);

        //Add the results from the function to the run and run it again
        const newRun = await addResultsToRun(contentText, openai, thread.id, toolCallId, run.id);
        
        if (newRun.status === "completed"){
            console.log("Completed Request");
            try{
                const messages = await openai.beta.threads.messages.list(thread.id);
                response = messages.data[0].content[0].text.value;
                //if this is a welcome message, mentionedUser will be populated
                if(mentionedUser.username === undefined){
                    //you have to take out a lot of regular "bot-isms" to make it look normal
                    message.reply((response)
                        .replace(client.user.username + ": ", "")
                        .replace(/【.*?】/gs, '')
                        .replace("Ah, ", "")
                        .replace(/<.*?>/gs, '')
                    ); 
                }else{
                    const messages = await openai.beta.threads.messages.list(thread.id);
                    response = messages.data[0].content[0].text.value;
                    await channel.send(`<@${mentionedUser.userId}>! ${response}`);
                }
                
            }catch(error){
                console.error('Error running the thread: ', error);
            }
        }
    }
    if (run.status === "completed") {
        message.channel.sendTyping();
        //capture the thread and shove it into a reply
        try{
        const messages = await openai.beta.threads.messages.list(run.thread_id);
        response = messages.data[0].content[0].text.value;
        //print to discord only the last message
        message.reply((response).replace(client.user.username + ": ", "").replace(/【.*?】/gs, '').replace("Ah, ", "")); //the way this works, sometimes it responds in the third person. This removes that.
        }catch(error){
        console.error('Error running the thread: ', error);
        }
    }
}

module.exports = {
    formatMessage,
    processMessageToSend,
    addMessagesToThread,
    runThread,
    processPreviosConvo,
    processWelcomeMessage
};