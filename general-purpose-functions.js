async function routineFunctions(userCache){
    setInterval(() => vectorHandler.refreshChatLogs(channelIdAndName, openai, client),
        10800000 //every 3 hours
      );
    setInterval(() => vectorHandler.refreshUserList(openai, client),
        43200000 //every 12 hours
      );
    setInterval(() => {
        userCache.clear();
        console.log('User cache cleared');
    }, 3600000); // Clear cache every hour, avoids excessive memory bloat
}

async function getCachedUser(guild, userId, userCache) {
    // Check if the user is already in cache
    if (userCache.has(userId)) {
        return userCache.get(userId);
    }

    // Fetch the user and add to cache if not present
    try {
        const user = await guild.members.fetch(userId);
        if (user) {
            userCache.set(userId, user);
            return user;
        }
    } catch (error) {
        console.error(`Could not fetch user: ${userId}`, error);
    }

    return null; // Return null if user cannot be fetched or does not exist
}

module.exports = {
  routineFunctions,
  getCachedUser
};