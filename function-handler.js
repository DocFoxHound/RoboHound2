async function executeFunction(functionData, message, client, openai){
    //if the function is something that requires getting a list of users...
    if(functionData.function.name === "get_users_and_roles"){
        console.log("Get Users and Roles")
        //this will store all users
        let userArray = [];

        //get all users and log them in an array with their username, online/offline status, and roles
        const guild = await client.guilds.cache.get(process.env.GUILD_ID); //THIS IS FOR TESTING
        // const guild = await client.guilds.cache.get(message.guildId); //THIS IS CORRECT
        try {
            const roleIDs = process.env.MEMBER_ROLES;
            const members = await guild.members.fetch();
            const membersWithRoles = members.filter(member =>
                member.roles.cache.some(role => roleIDs.includes(role.id))
            );
            const onlineMembers = membersWithRoles.filter(member => member.presence && member.presence.status === 'online');
            
            onlineMembers.forEach(member => {
                userRoles = "";
                member.roles.cache.forEach(role => {
                    userRoles = userRoles + (role.name + ", ");
                });
            // userArray.push("USERNAME: '" + member.user.username + "' (" + (member.presence?.status ? "Online" : "Offline") + ") ROLES: " + userRoles); //keep for another function
            userArray.push(member.user.username);
        });
        } catch (error) {
            console.error('Failed to fetch members: ', error);
        }

        //turn the list into a file
        const allUsers = userArray.join('\n'); //turns the list into a string
        console.log(allUsers)

        return allUsers;
    }
}

module.exports = {
    executeFunction
};