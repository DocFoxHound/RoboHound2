//convert the message into something we'll store to use for later
function processMessage(message, messageArray, mentionRegex){
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
      channelConvoPair.conversation.push("<" + message.createdTimestamp + "> " + message.member.displayName + ": " + readableMessage)
}

//Convert the input text to something the bot can use
function processMessageToSend(message, messageArray, mentionRegex){
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
    channelConvoPair.conversation.push("<" + message.createdTimestamp + "> " + message.member.displayName + ": " + readableMessage)
    
    //convert the array into a string, because it's faster than sending each individual message via the api
    const combinedConvo = channelConvoPair.conversation.join('\n')

    //strings being put into a single message cannot exceed 2000 characters
    if (combinedConvo.length > 1999) {
        return combinedConvo.slice(combinedConvo.length - 1999);
    }

    return combinedConvo;
}

//Add discord message to a thread
async function addMessagesToThread(combinedConvo, thread, openai) {
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
async function runThread(message, thread, openai, client) {
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
        response = messages.data[0].content[0].text.value;
        //print to discord only the last message
        message.reply((response).replace(client.user.username + ": ", "").replace(/【.*?】/gs, '').replace("Ah, ", "")); //the way this works, sometimes it responds in the third person. This removes that.
        }catch(error){
        console.error('Error running the thread: ', error);
        }
    }
}

module.exports = {
    processMessage,
    processMessageToSend,
    addMessagesToThread,
    runThread
};