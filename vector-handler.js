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

async function chatLogCheck(openai){
    //get the vector, first
    // try{
    //     //delete the file if it already exists
    //     const vectorStoreFile = await openai.beta.vectorStores.files.del(
    //         process.env.VECTOR_STORE,
    //         "ChatLogs"
    //       );
    // }catch(error){
    //     console.log("It's empty")
    // }

    console.log("TODO")
}

async function onlineUserCheck(openai, client){
    fileToDeleteId = "";
    try{
        //get the list of files and find the UserList.txt file's ID
        const list = await openai.files.list();
        const files = list.data; // Assuming the list is in the data.data array
        const file = files.find(f => f.filename === "UserList.txt"); 
        fileToDeleteId = file.id;
    }catch(error){
        console.log("UserList.txt didn't exist in Storage Uploads")
    }
    
    //delete the file from both the File Storage and Vector Storage
    try{
        //first, delete it from the vector storage
        const vectorStoreFile = await openai.beta.vectorStores.files.del(
            process.env.VECTOR_STORE,
            fileToDeleteId
        );
        //then, delete it from the file storage
        const file = await openai.files.del(fileToDeleteId);
        //now get Discord Users and build a new UserList.txt
        getUserList(client, openai);
    }catch(error){
        //if the file doesn't exist (like in a new install) then just make a new one
        getUserList(client, openai);
    }
}

async function getUserList(client, openai){
    //this will store all users
    let userArray = [];

    //get all users and log them in an array with their username, online/offline status, and roles
    const guild = await client.guilds.cache.get(process.env.GUILD_ID);
    try {
        const members = await guild.members.fetch();
        members.forEach(member => {
            userRoles = "";
            member.roles.cache.forEach(role => {
                userRoles = userRoles + (role.name + ", ");
            });
            userArray.push("USERNAME: '" + member.user.username + "' (" + (member.presence?.status ? "Online" : "Offline") + ") ROLES: " + userRoles);
        });
    } catch (error) {
        console.error('Failed to fetch members:', error);
    }

    //turn the list into a file
    const allUsers = userArray.join('\n'); //turns the list into a string
    fs.writeFile('./UserList.txt', allUsers, 'utf8', function(err) {
        if (err) {
            console.log('An error occurred while writing UserList:', err);
            return;
        }
        console.log('UserList saved!');
    });

    //upload that file to OpenAI (step 1)
    uploadedFileId = "";
    try{
        const file = await openai.files.create({
            file: fs.createReadStream("./UserList.txt"),
            purpose: "assistants",
        });
        uploadedFileId = file.id;
        console.log("Uploaded UserList to Storage Files")
    }catch(error){
        console.log("Error in uploading UserList to Storage Files: " + error)
    }

    //now that its uploaded to openAI, 'upload' it to the VectorStore (step 2)
    // (as of this writing, there's no way to direct upload to vector store)
    try{
        const vectorStoreFile = await openai.beta.vectorStores.files.create(
            process.env.VECTOR_STORE,
            {
                file_id: uploadedFileId
            }
        );
        console.log("Uploaded UserList file to VectoreStore")
    }catch(error){
        console.log("Error in uploading UserList to the VectoreStore: " + error)
    }
}

module.exports = {
    chatLogCheck,
    onlineUserCheck
};