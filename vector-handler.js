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

async function refreshChatLogs(channelIdAndName, openai, client){
    console.log("Refreshing Chat Logs")
    const guild = await client.guilds.cache.get(process.env.GUILD_ID);
    
    //find all channel chat logs already being hosted and delete them
    const list = await openai.files.list();
    const files = list.data;
    for (const channel of channelIdAndName) {
        try{
            const file = files.find(f => f.filename === (guild.name + "ChatLogs-" + channel.channelName + ".txt" )); 
            fileToDeleteId = file.id;
        }catch(error){
            console.log("No '" + channel.channelName + "' ChatLog existed in Storage Uploads")
        }

        try{
            //first, delete it from the vector storage
            await openai.beta.vectorStores.files.del(
                process.env.VECTOR_STORE,
                fileToDeleteId
            );
            //then, delete it from the file storage
            await openai.files.del(fileToDeleteId);
        }catch(error){
            console.log("Error deleting the chatlog for " + channel.channelName + ": " + error)
        }
    }
    
    //Now get the chat logs and upload them
    try{
        await getChatLogs(client, guild, channelIdAndName, openai);
    }catch(error){
        console.log("Error uploading chatlogs: " + error);
    }
}

async function refreshUserList(openai, client){
    console.log("Refreshing User List")
    const guild = await client.guilds.cache.get(process.env.GUILD_ID);
    fileToDeleteId = "";
    try{
        //get the list of files and find the UserList.txt file's ID
        const list = await openai.files.list();
        const files = list.data; // Assuming the list is in the data.data array
        const file = files.find(f => f.filename === (guild.name + "UserList.txt")); 
        fileToDeleteId = file.id;
        console.log("Removed old UserList.txt")
    }catch(error){
        console.log("UserList.txt didn't exist in Storage Uploads")
    }
    
    //delete the file from both the File Storage and Vector Storage
    try{
        //first, delete it from the vector storage
        await openai.beta.vectorStores.files.del(
            process.env.VECTOR_STORE,
            fileToDeleteId
        );
        //then, delete it from the file storage
        await openai.files.del(fileToDeleteId);
        //now get Discord Users and build a new UserList.txt
        getAndUploadUserList(client, guild);
    }catch(error){
        console.log("Error in deleting UserList files: " + error)
    }

    try{
        getAndUploadUserList(client, guild);
    }catch(error){
        console.log("There was an error uploading a UserList: " + error)
    }

}

// retrieves and uploads a user list by role (listed in .env)
async function getAndUploadUserList(client, guild){
    console.log("Getting the UserList")
    let userArray = ["All Members/Users of " + guild.name + " and their roles"];
    const roleIDs = process.env.MEMBER_ROLES;

    //get all users and log them in an array with their username, online/offline status, and roles
    try {
        const members = await guild.members.fetch();
        const membersWithRoles = members.filter(member =>
            member.roles.cache.some(role => roleIDs.includes(role.id))
        );
        membersWithRoles.forEach(member => {
            userRoles = "";
            member.roles.cache.forEach(role => {
                userRoles = userRoles + (role.name + ", ");
            });
            if(member.nickname == null)
            {
                userArray.push("USERNAME: '" + member.user.username + "' ROLES: " + userRoles);
            }else{
                userArray.push("USERNAME: '" + member.nickname + "' ROLES: " + userRoles);
            }

        });
    } catch (error) {
        console.error('Failed to fetch members: ', error);
    }

    //turns the list into a string
    const allUsers = userArray.join('\n'); 

    //create a text document and upload it
    createAndUploadFile(allUsers, guild.name, "UserList");
}

async function getChatLogs(client, guild, channelIdAndName, openai){
    console.log("Getting the Chat Logs")
    for (const channel of channelIdAndName) {
        messageArray = ["Chat Logs of " + guild.name + "'s " + channel.channelName + " chat channel."];
        channelObject = client.channels.cache.get(channel.channelId)
        try{
            console.log("Retrieving " + channel.channelName + " Messages")
            //TODO If this is a forum channel (.type == 15) do it differently
            if(channelObject.type !== 15){
                const messages = await channelObject.messages.fetch({ limit: 100 });
                messages.forEach(message => {
                    if (message.embeds.length > 0) { //if its an embed, log it differently
                        message.embeds.forEach((embed, index) => {
                            messageArray.push(`<${message.createdTimestamp}> Embed: \"${embed.title}\": Description: \"${embed.description}\"`);
                            // If the embed has fields, log each field
                            if (embed.fields.length > 0) {
                                embed.fields.forEach((field, fieldIndex) => {
                                    messageArray.push(`Field: ${field.name}: \"${field.value}\"`);
                                });
                            }
                        });
                    }
                    if(message.member && message.member.nickname) {
                        messageArray.push(`<${message.createdTimestamp}> ${message.member.nickname}: ${message.content}`);
                    } else {
                        messageArray.push(`<${message.createdTimestamp}> ${message.author.username}: ${message.content}`);
                    }
                });

                // Flatten the array into a string
                const allMessages = messageArray.join('\n'); 

                // Send the string off to be turned into a file and uploaded
                createAndUploadFile(allMessages, openai, guild.name, `ChatLogs-${channel.channelName}`);
            }else{
                console.log("Forum Thread Channel")
                const threads = await channelObject.threads.fetchActive({ limit: 100 });
                for (const thread of threads) {
                    const messages = await thread.messages.fetch();
                    messageArray.push("\nThread: " + thread.name);
                    // Process messages as needed
                    messages.forEach(message => {
                        messageArray.push("<" + message.createdTimestamp + "> " + message.member.nickname + ": \"" + message.content + "\"");
                    });
                }
                //flatten the array into a string
                const allMessages = messageArray.join('\n'); 

                //send the string off to be turned into a file and uploaded
                createAndUploadFile(allMessages, openai, guild.name, `ChatLogs-${channel.channelName}`);
            }
        }catch(error){
            console.log("Error getting chat logs: " + error)
        }
    }
}

async function createAndUploadFile(textString, openai, guildName, givenName){
    const fileName = "./" + guildName + givenName + ".txt";
    await fs.writeFile(fileName, textString, 'utf8', function(err) {
        if (err) {
            console.log('An error occurred while writing ' + fileName + ': ', err);
            return;
        }
        console.log(fileName + ' saved locally');
    });

    //upload that file to OpenAI (step 1)
    uploadedFileId = "";
    try{
        const file = await openai.files.create({
            file: fs.createReadStream(fileName),
            purpose: "assistants",
        });
        uploadedFileId = file.id;
        console.log("Uploaded " + fileName + " to Storage Files")
    }catch(error){
        console.log("Error in uploading " + fileName + " to Storage Files: " + error)
    }

    //now that its uploaded to openAI, 'upload' it to the VectorStore (step 2)
    // (as of this writing, there's no way to direct upload to the vector store)
    try{
        await openai.beta.vectorStores.files.create(
            process.env.VECTOR_STORE,
            {
                file_id: uploadedFileId
            }
        );
        console.log("Moved " + fileName + " to VectoreStore")
    }catch(error){
        console.log("Error in moving " + fileName + " to the VectoreStore: " + error)
    }
}

module.exports = {
    refreshChatLogs,
    refreshUserList
};