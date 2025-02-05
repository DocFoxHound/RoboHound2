// Require the necessary node classes
const fs = require("node:fs");
// Require the necessary discord.js classes
const { ChannelType } = require("discord.js");

async function refreshChatLogs(channelIdAndName, openai, client) {
  console.log("Refreshing Chat Logs");
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  const list = await openai.files.list();
  const files = list.data;
  const now = new Date();
  const activeChannels = [];

  //ignore inactive channels
  for (const channelInfo of channelIdAndName) {
    const channelObject = await client.channels.fetch(channelInfo.channelId);

    if (!channelObject) {
      console.log(
        `Channel with ID ${channelInfo.channelId} not found in cache.`
      );
      continue;
    }

    //get the time for the last message in this channel
    if ((channelObject.type = 15)) {
      //if its a forum channel
      console.log("Forum Thread Refresh");
      try {
        const threadFetch = await channelObject.threads.fetchActive(); // Fetch active threads
        const threads = threadFetch.threads;
        if (threads.size > 0) {
          const newestThread = Array.from(threads.values()).sort(
            (a, b) => b.createdTimestamp - a.createdTimestamp
          )[0];
          const messageDate = new Date(newestThread.createdTimestamp);
          const hoursDiff = (now - messageDate) / 3600000;
          if (hoursDiff <= 3) {
            activeChannels.push(channelInfo);
          }
        } else {
          console.error(
            `No messages found in ${channelInfo.channelName}: ${error}`
          );
        }
      } catch (error) {
        console.error(
          `Failed to fetch messages for channel ${channelInfo.channelName}: ${error}`
        );
      }
    } else {
      //if its a text channel
      console.log("Chat Channel Refresh");
      try {
        const lastMessage = await channelObject.messages.fetch({
          limit: 1,
        });
        if (lastMessage.size > 0) {
          const lastMsg = lastMessage.first();
          const messageDate = new Date(lastMsg.createdTimestamp);
          const hoursDiff = (now - messageDate) / 3600000;
          if (hoursDiff <= 3) {
            activeChannels.push(channelInfo);
          }
        } else {
          console.error(
            `No messages found in ${channelInfo.channelName}: ${error}`
          );
        }
      } catch (error) {
        console.error(
          `Failed to fetch messages for channel ${channelInfo.channelName}: ${error}`
        );
      }
    }
  }

  //delete the channel chatlogs that need refreshed
  for (const channel of activeChannels) {
    try {
      const file = files.find(
        (f) =>
          f.filename === guild.name + "ChatLogs-" + channel.channelName + ".txt"
      );
      fileToDeleteId = file.id;
    } catch (error) {}

    try {
      //first, delete it from the vector storage
      await openai.beta.vectorStores.files.del(
        process.env.VECTOR_STORE,
        fileToDeleteId
      );
      //then, delete it from the file storage
      await openai.files.del(fileToDeleteId);
    } catch (error) {}
  }

  //Now get the chat logs and upload them
  try {
    await getChatLogs(client, guild, activeChannels, openai);
  } catch (error) {
    console.log("Error uploading chatlogs: " + error);
  }
}

async function refreshUserList(openai, client) {
  console.log("Refreshing User List");
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  fileToDeleteId = "";
  try {
    //get the list of files and find the UserList.txt file's ID
    const list = await openai.files.list();
    const files = list.data; // Assuming the list is in the data.data array
    const file = files.find((f) => f.filename === guild.name + "UserList.txt");
    fileToDeleteId = file.id;
    console.log("Removed old UserList.txt");
  } catch (error) {
    console.log("UserList.txt didn't exist in Storage Uploads");
  }

  //delete the file from both the File Storage and Vector Storage
  try {
    //first, delete it from the vector storage
    await openai.beta.vectorStores.files.del(
      process.env.VECTOR_STORE,
      fileToDeleteId
    );
    //then, delete it from the file storage
    await openai.files.del(fileToDeleteId);
    //now get Discord Users and build a new UserList.txt
    getAndUploadUserList(client, guild);
  } catch (error) {
    console.log("Error in deleting UserList files: " + error);
  }

  try {
    getAndUploadUserList(client, guild);
  } catch (error) {
    console.log("There was an error uploading a UserList: " + error);
  }
}

// retrieves and uploads a user list by role (listed in .env)
async function getAndUploadUserList(client, guild) {
  console.log("Getting the UserList");
  let userArray = ["All Members/Users of " + guild.name + " and their roles"];
  const roleIDs = process.env.MEMBER_ROLES;

  //get all users and log them in an array with their username, online/offline status, and roles
  try {
    const members = await guild.members.fetch();
    const membersWithRoles = members.filter((member) =>
      member.roles.cache.some((role) => roleIDs.includes(role.id))
    );
    membersWithRoles.forEach((member) => {
      userRoles = "";
      member.roles.cache.forEach((role) => {
        userRoles = userRoles + (role.name + ", ");
      });
      if (member.nickname == null) {
        userArray.push(
          "USERNAME: '" + member.user.username + "' ROLES: " + userRoles
        );
      } else {
        userArray.push(
          "USERNAME: '" + member.nickname + "' ROLES: " + userRoles
        );
      }
    });
  } catch (error) {
    console.error("Failed to fetch members: ", error);
  }

  //turns the list into a string
  const allUsers = userArray.join("\n");

  //create a text document and upload it
  createAndUploadFile(allUsers, guild.name, "UserList");
}

async function getChatLogs(client, guild, channelIdAndName, openai) {
  console.log("Getting the Chat Logs");
  for (const channel of channelIdAndName) {
    let messageArray = [
      `Chat Logs of ${guild.name}'s ${channel.channelName} chat channel.`,
    ];
    let lastId = null;
    let channelObject = await client.channels.fetch(channel.channelId);
    if (!channelObject) {
      console.log(`Channel ${channel.channelName} not found`);
      continue;
    }
    try {
      console.log(`Retrieving ${channel.channelName} Messages`);
      while (messageArray.length < 500) {
        const options = {
          limit: 100,
        };
        if (lastId) {
          options.before = lastId;
        }

        //Check and process if its a forum channel or a regular channel
        if (channelObject.type === ChannelType.GuildForum) {
          //if this is a forum channel, do this:
          const now = new Date();
          const daysOld = now.getTime() - process.env.DAYS_OLD * 86400000;
          const threadFetch = await channelObject.threads.fetchActive();
          //filter by parent channel (discord actually has a bug returning all threads from everywhere)
          //and by how old they are
          const threads = threadFetch.threads.filter(
            (thread) =>
              thread.parentId === channel.channelId &&
              now.getTime() - thread.createdTimestamp < daysOld
          );

          // This maps out all of the messages and details we need and returns them as a promise, so they're all done asynchronously,
          // improving speed of this operation a lot. I wont lie, I asked ChatGPT to replace the code previously here and to make it
          // faster, and I'm not disappointed.
          const messagesFetchPromises = threads.map(async (thread) => {
            const messages = await thread.messages.fetch();
            const messageDetails = messages
              .map((message) => {
                const embedsDetails = message.embeds
                  .map((embed) => {
                    const fieldsDetails = embed.fields
                      .map((field) => `Field: ${field.name}: "${field.value}"`)
                      .join("\n");
                    return `<${message.createdTimestamp}> Embed: "${
                      embed.title ?? "No Title"
                    }": Description: "${
                      embed.description ?? "No Description"
                    }"\n${fieldsDetails}`;
                  })
                  .join("\n");

                const displayName =
                  message.member?.nickname ?? message.author.username;
                return (
                  embedsDetails ||
                  `<${message.createdTimestamp}> ${displayName}: "${message.content}"`
                );
              })
              .join("\n");
            lastId = messages.last().id;
            return `\nThread: ${thread.name}\n${messageDetails}`;
          });

          // Await all fetched messages and then handle them
          try {
            const allMessages = await Promise.all(messagesFetchPromises);
            allMessages.forEach((messagesContent) =>
              messageArray.push(messagesContent)
            );
          } catch (error) {
            console.error("Error fetching messages from threads:", error);
          }
        } else {
          //this is a text channel
          const messages = await channelObject.messages.fetch(options);
          if (messages.size === 0) {
            break; // No more messages left to fetch
          }
          messages.forEach(async (message) => {
            if (message.embeds.length > 0) {
              await message.embeds.forEach((embed, index) => {
                let embedLog = `<${message.createdTimestamp}> Embed: "${
                  embed.title ?? "No Title"
                }": Description: "${embed.description ?? "No Description"}"`;
                messageArray.push(embedLog);
                if (embed.fields) {
                  embed.fields.forEach((field, fieldIndex) => {
                    messageArray.push(`Field: ${field.name}: "${field.value}"`);
                  });
                }
              });
            } else {
              const displayName =
                message.member?.nickname ?? message.author.username;
              messageArray.push(
                `<${message.createdTimestamp}> ${displayName}: "${message.content}"`
              );
            }
          });
          lastId = messages.last().id;
        }
      }
      //flatten the array into a string
      const allMessages = messageArray.join("\n");
      //send the string off to be turned into a file and uploaded
      await createAndUploadFile(
        allMessages,
        openai,
        guild.name,
        `ChatLogs-${channel.channelName}`
      );
    } catch (error) {
      console.log("Error getting chat logs: " + error);
    }
  }
}

async function createAndUploadFile(textString, openai, guildName, givenName) {
  const fileName = "./" + guildName + givenName + ".txt";
  await fs.promises.writeFile(fileName, textString, "utf8", function (err) {
    if (err) {
      console.log("An error occurred while writing " + fileName + ": ", err);
      return;
    }
    console.log(fileName + " saved locally");
  });

  //upload that file to OpenAI (step 1)
  uploadedFileId = "";
  try {
    const file = await openai.files.create({
      file: fs.createReadStream(fileName),
      purpose: "assistants",
    });
    uploadedFileId = file.id;
    console.log("Uploaded " + fileName + " to Storage Files");
  } catch (error) {
    console.log(
      "Error in uploading " + fileName + " to Storage Files: " + error
    );
  }

  //now that its uploaded to openAI, 'upload' it to the VectorStore (step 2)
  // (as of this writing, there's no way to direct upload to the vector store)
  try {
    await openai.beta.vectorStores.files.create(process.env.VECTOR_STORE, {
      file_id: uploadedFileId,
    });
    console.log("Moved " + fileName + " to VectoreStore");
  } catch (error) {
    console.log(
      "Error in moving " + fileName + " to the VectoreStore: " + error
    );
  }
}

module.exports = {
  refreshChatLogs,
  refreshUserList,
};
