const Discord = require('discord.js');
const {
    prefix,
    token
} = require('./config.json');

// We only need this core, if we want video to be played from YouTube. We can change to play audio from local storage, then we can simply remove this without an issue
const ytdl = require('ytdl-core');

// Variable for writing into JSON files, used in volumeChange();
var fs = require('fs');

// Initialising and logging as discord bot via token from ./config.json
const client = new Discord.Client();
client.login(token);


// Variable storing volume modifier
const config = require('./bot-config.json');
console.log(config);
var volume = config.volume;
console.log('Initialized volume: ' + volume);

// Bunch of listeners for logging
client.once('ready', () => {
    console.log('Ready');
});
client.once('reconnecting', () => {
    console.log('Reconnecting...');
});
client.once('disconnect', () => {
    console.log('Disconnect');
})


// Listener for message event, we will get and process commands in this block
client.on('message', async message => {
    // Check if message coming from bot
    if (message.author.bot) return;

    // Check if message is addressed to bot, with prefix stored in ./config.json 
    if (!message.content.startsWith(prefix)) return;

    // Constant for keeping track on current bot status, if serverQueue is defined - bot is currently playing music
    const serverQueue = queue.get(message.guild.id);

    // Block checking which command to execute
    if (message.content.startsWith(`${prefix}play`) || message.content.startsWith(`${prefix}p`)) {
        console.log('Play command called')
        execute(message, serverQueue);
        return
    } else if (message.content.startsWith(`${prefix}skip`)) {
        console.log('Skip command called')
        skip(message, serverQueue);
        return;
    } else if (message.content.startsWith(`${prefix}stop`)) {
        console.log('Stop command called')
        stop(message, serverQueue);
        return;
    } else if (message.content.startsWith(`${prefix}volume`) || message.content.startsWith(`${prefix}v`)) {
        console.log('Volume command called')
        volumeChange(message);
        return;
    } else if (message.content.startsWith(`${prefix}dc`)) {
        console.log('Leave command called')
        leave(message, serverQueue);
        return;
        // Testing command with short track
    } else if (message.content.startsWith(`${prefix}t`)) {
        console.log('Test command called')
        message.content = '>p https://www.youtube.com/watch?v=0JOKNcqK7X8'
        execute(message, serverQueue);
        return;
    } else {
        console.log('Invalid command detected, message: ' + message.content)
        message.channel.send('Invalid command');
    }
});

// Function for changing the volume modifier, rewrites bot-config.json, NOT APPENDS, MIGHT CAUSE TROUBLES IF THERE WOULD BE SOMETHING ELSE IN CONFIG.
function volumeChange(message) {
    console.log('Current volume: ' + volume);

    // Checking if there's any argument after volume command call, if not - returning current volume in message, as well as instruction
    if (!message.content.split(' ')[1]) {
        return message.channel.send(`Current volume: ${volume}\n To change volume - type \`${prefix}volume [percentage]\` or \`${prefix}v [percentage]\`.`);

        // Checking if provided argument is a number, if not - returning info that value must be a number
    } else if (!isNaN(message.content.split(' ')[1])) {

        // Parsing string with volume value and storing it in volume variable
        volume = parseInt(message.content.split(' ')[1]);
        // Creating config constant to write in ./bot-config.json
        const config = { "volume": volume };
        // Applying JSON format to config object and storing it in json const
        const json = JSON.stringify(config);

        // Writing json'ified config to bot-config.json and logging new volume
        fs.writeFile('./bot-config.json', json, 'utf8', () => {
            console.log('Volume has been changed, new volume: ' + volume);
            return message.channel.send(`Changing volume... New volume: ${volume}`);
        });
    } else {
        console.warn('Passed volume variable is not a number')
        return message.channel.send('Percentage value must be a number.')
    }
}

// Constant for playlist, will be filled later in execute() function.
const queue = new Map();


// Function for playing sequence
async function execute(message, serverQueue) {

    // Changing current status into Do Not Disturb mode, so you can always see if bot is busy or not
    changeStatus('dnd');
    // Splitting message string into args, [0] - prefix with command, [1] - url link to video
    const args = message.content.split(' ');
    // Song object, will store song title and url
    var song = {};


    // Declaring voice channel object, and checking if user is in one, if not - returning info message
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
        console.warn('Unable to get voiceChannel object');
        return message.channel.send('You must be in a voice channel.');
    }

    // Checking if bot has required permissions, if not - returning info message
    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
        console.warn('Missing CONNECT or SPEAK permission');
        return message.channel.send('Missing permissions to join or speak.');
    }

    // Check if music url provided, True - initializing song variable and storing there song data | False - playing padoru
    if (args[1]) {

        // Checking if URL provided is YouTube video, if not - logging and sending info message in chat
        if (args[1].startsWith('https://www.youtube.com/watch?') || args[1].startsWith('https://youtu.be/')) {
            // Trying to get song info from ytdl-core, if failing - logging and sending an info message in chat
            try {
                const songInfo = await ytdl.getInfo(args[1]);

                // Filling song obj with songInfo details
                song = { title: songInfo.videoDetails.title, url: songInfo.videoDetails.video_url, }
                console.log('Received song ulr, initialised a song object');

            } catch (err) {
                console.error(err);
                return message.channel.send('Error occured during video fetch, check the link, it\'s probably invalid');
            }

        } else {
            console.log('Received argument is not a valid link: ' + message.content);
            return message.channel.send('I can only play music from YouTube videos, no other sources or YouTube playlists are currently supported.');
        }
    } else {
        console.log('No parameters given, playing padoru');
        song = { title: `PADORU PADORU`, url: `https://www.youtube.com/watch?v=dQ_d_VKrFgM` }
    }



    // Checking if music already playing, True - adding request to queue | False - starting playing
    if (!serverQueue) {

        // QueueContract object, stores contract info
        const queueContract = {
            textChannel: message.channel,
            voiceChannel: voiceChannel,
            connection: null,
            songs: [],
            volume: volume,
            playing: true
        }

        // Filling queue map with id of a guild we'll be connecting to and queueContract
        queue.set(message.guild.id, queueContract);

        // Pushing song object into songs array
        queueContract.songs.push(song);
        try {
            // Connecting to voicechat and assigning connection as an object
            var connection = await voiceChannel.join();
            queueContract.connection = connection;
            console.log(`connected to ${voiceChannel.name}`);
            // Starting playing a song
            play(message.guild, queueContract.songs[0]);
        } catch (err) {
            // If any error occurs during connection - printing it in both console and chat, so that bot won't crash
            console.error(err);
            queue.delete(message.guild.id);
            return message.channel.send(err);
        }

    } else {
        // Pushing song request at the end of queue and logging it in console
        serverQueue.songs.push(song);
        console.log(serverQueue.songs);
        // Indicating that bot is busy playing
        changeStatus('dnd');
        // If everything went right - informing user about successfull operation
        console.log(`Added ${song.title} to queue`);
        return message.channel.send(`**${song.title}** has been added to the queue!`);
    }


}

// Function to change bot status
async function changeStatus(status) {
    client.user.setPresence({ status: status, activity: { name: 'PADORU PADORU', type: 'PLAYING', url: 'https://www.youtube.com/watch?v=dQ_d_VKrFgM' } });
    console.log('Changed status to ' + status);
}

// Function that ensures bot leaving voice channel, invokes stop() function to sieze queue and stop playing and then manually leaves
function leave(message, serverQueue) {
    try {
        stop(message, serverQueue);
        serverQueue.songs = [];
        queue.delete(message.guild.id);
        serverQueue.voiceChannel.leave();
    } catch (err) {
        console.error(err);
    }
}

// Main play function, receives guild to play at and song information
function play(guild, song) {
    const serverQueue = queue.get(guild.id);

    // If there's no song - changes status to online and leaves the channel, cleaning connection info in queue, 
    if (!song) {
        console.log('No more songs, leaving the channel');
        changeStatus('online')
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }

    // Connection dispatcher, manages connection to Voice Channel
    const dispatcher = serverQueue.connection
        .play(ytdl(song.url))
        .on('finish', () => {
            // Once bot finishes playing music - shifts playlist and plays next song
            console.log('Finished playing');
            serverQueue.songs.shift();
            play(guild, serverQueue.songs[0]);
        })
        // Logging errors if any occurs
        .on('error', err => console.error(err));

    // Applying volume setting
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 100);
    // Changing status while playing
    changeStatus('dnd');

    console.log(`Started playing: ${song.title} at ${guild.name}`);
    serverQueue.textChannel.send(`Started playing: **${song.title}**`);

}

// Skip function, removes current playing song
function skip(message, serverQueue) {
    if (!message.member.voice.channel) return message.channel.send('You have to be in a voice channel.');
    if (!serverQueue) return message.channel.send('No song to skip.');

    try {
        serverQueue.connection.dispatcher.end();
    } catch (err) {
        console.error(err);
    }
}

// Stop function, clears serverQueue.songs[] map and removes current playing song.
function stop(message, serverQueue) {
    if (!message.member.voice.channel) return message.channel.send('You have to be in a voice channel.');
    if (!serverQueue) return message.channel.send('No song to stop.');

    serverQueue.songs = [];
    try {
        serverQueue.connection.dispatcher.end();
    } catch (err) {
        console.error(err);
    }
}