const functionHandler = require("./function-handler");
const generalPurpose = require("./general-purpose-functions")

//convert the message into something we'll store to use for later
function formatMessage(message, messageArray, mentionRegex, userCache) {
    const readableMessage = message.content.replace(mentionRegex, (match, userId) => {
        const user = generalPurpose.getCachedUser(message.guild, userId, userCache);
        const displayName = user ? `@${user.displayName}` : "@unknown-user";
        return displayName;
    });
    const channelConvoPair = messageArray.find(c => c.channelId === message.channel.id);
    if (channelConvoPair) {
        const maxEntries = process.env.MESSAGE_AMOUNT; 
        // Efficiently manage the conversation array to avoid memory overflow
        if (channelConvoPair.conversation.length >= maxEntries) {
            channelConvoPair.conversation.shift(); // Remove the oldest message
        }
        try {
            channelConvoPair.conversation.push(
                `<${message.createdTimestamp}> ${message.member.displayName || 'Unknown User'}: ${readableMessage}`
            );
        } catch (error) {
            console.error(`Error adding message to the ConvoPair array: ${error}`);
        }
    } else {
        console.error("No matching conversation pair found for the channel");
    }
}

//Convert the input text to something the bot can use
function processMessageToSend(message, mentionRegex, userCache) {
    const readableMessage = message.content.replace(mentionRegex, (match, userId) => {
        const user = generalPurpose.getCachedUser(message.guild, userId, userCache);
        const displayName = user ? `@${user.displayName}` : "@unknown-user";
        return displayName;
    });
    // Format the message, adding metadata
    const contentText = `<${message.createdTimestamp}> ${message.member.displayName || "Unknown Member"}: ${readableMessage}`;
    // Ensure the message length does not exceed Discord's limit of 2000 characters
    if (contentText.length > 2000) {
        // Return only the last 2000 characters of the message
        return contentText.slice(-2000);
    }
    return contentText;
}

function processPreviosConvo(messageArray, message) {
    const maxEntries = process.env.MESSAGE_AMOUNT; // Default and fallback
    const maxLength = 2000; // Maximum length for a Discord message
    // Find the conversation pair for the current channel
    const channelConvoPair = messageArray.find(c => c.channelId === message.channel.id);
    if (!channelConvoPair) {
        console.error(`No conversation pair found for channel: ${message.channel.id}`);
        return ''; // Early return if no conversation pair exists
    }
    // Manage conversation size
    if (channelConvoPair.conversation.length >= maxEntries) {
        channelConvoPair.conversation.shift(); // Remove the oldest message
    }
    // Prepare the conversation text
    let contentText = channelConvoPair.conversation.join("\n");
    // Ensure the content text does not exceed the Discord message limit
    if (contentText.length > maxLength) {
        contentText = contentText.slice(-maxLength);
    }
    return contentText;
}

//Add discord message to a thread
async function addMessagesToThread(contentText, threadId, openai) {
  // add conversation to a thread
  try {
    const run = await openai.beta.threads.messages.create(threadId, {
      role: "user",
      content: contentText,
    });
  } catch (error) {
    console.error(
      "Error adding message to thread, if the bot just started this is expected."
    );
  }
}

//a tool and/or Function Call
async function addResultsToRun(contentText, openai, threadId, toolId, runId) {
  // if the toolId is populated, that means this is a tool call and we need
  // to add the results back to the thread
  const maxLength = 2000; // Maximum length for a Discord message
  if (contentText.length > maxLength) {
        contentText = contentText.slice(-maxLength);
    }
  try {
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
    );
    return run;
  } catch (error) {
    console.log("Error adding tool/function results to run: " + error);
  }
}

async function runThread(message, thread, openai, client, mentionedUser) {
    // Run the thread
    let run = await openai.beta.threads.runs.createAndPoll(thread.id, {
        assistant_id: myAssistant.id,
        additional_instructions: process.env.BOT_INSTRUCTIONS,
    });

    if (run.status === "requires_action") {
        await handleRequiresAction(message, run, openai, client);
    } else if (run.status === "completed") {
        await handleCompletedRun(message, run, client, openai, mentionedUser);
    }
}

async function handleRequiresAction(message, run, openai, client) {
    console.log("Requires Action");
    message.channel.sendTyping();
    const toolCall = run.required_action.submit_tool_outputs.tool_calls[0];
    const contentText = await functionHandler.executeFunction(toolCall, message, client, openai);
    const newRun = await addResultsToRun(contentText, openai, run.thread_id, toolCall.id, run.id);

    if (newRun.status === "completed") {
        console.log("Completed Request");
        await sendResponse(message, newRun.thread_id, openai, client);
    }
}

async function handleCompletedRun(message, run, client, openai, mentionedUser) {
    message.channel.sendTyping();
    await sendResponse(message, run.thread_id, openai, client, mentionedUser);
}

async function sendResponse(message, threadId, openai, client, mentionedUser) {
    try {
        const messages = await openai.beta.threads.messages.list(threadId);
        let response = messages.data[0].content[0].text.value;
        response = response.replace(client.user.username + ": ", "")
                           .replace(/【.*?】/gs, "")
                           .replace("Ah, ", "")
                           .replace(/<.*?>/gs, "");

        if (mentionedUser && mentionedUser.username !== undefined) {
            await message.channel.send(`<@${mentionedUser.userId}>! ${response}`);
        } else {
            await message.reply(response);
        }
    } catch (error) {
        console.error("Error running the thread: ", error);
        await message.reply("Sorry, there was an error processing your request.");
    }
}

module.exports = {
  formatMessage,
  processMessageToSend,
  addMessagesToThread,
  runThread,
  processPreviosConvo,
};
