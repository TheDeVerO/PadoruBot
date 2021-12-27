const Discord = require('discord.js');
const {
    prefix,
    token
} = require('./config.json');

// We only need this core, if we want video to be played from YouTube. We can change to play audio from local storage, then we can simply remove this without an issue
const ytdl = require('ytdl-core');

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
        console.log('Play command called, executing')
        execute(message, serverQueue);
        return
    } else if (message.content.startsWith(`${prefix}skip`)) {
        skip(message, serverQueue);                                                                                 //TODO: add command logging in console
        return;
    } else if (message.content.startsWith(`${prefix}stop`)) {
        stop(message, serverQueue);
        return;
    } else if (message.content.startsWith(`${prefix}volume`) || message.content.startsWith(`${prefix}v`)) {
        volumeChange(message);
        return;
    } else if (message.content.startsWith(`${prefix}dc`)) {
        leave(message, serverQueue);
        return;
    } else if (message.content.startsWith(`${prefix}t`)) {                                                          // Command for testing with short track
        message.content = '>p https://www.youtube.com/watch?v=0JOKNcqK7X8'
        execute(message, serverQueue);
        return;
    } else {
        message.channel.send('Invalid command');
    }
});

function volumeChange(message) {
    console.log('Current volume: ' + volume);
    if (!message.content.split(' ')[1]) {
        return message.channel.send(`Current volume: ${volume}\n To change volume - type \`${prefix}volume [percentage]\` or \`${prefix}v [percentage]\`.`);
    } else if (!isNaN(message.content.split(' ')[1])) {
        volume = parseInt(message.content.split(' ')[1]);
        const config = {
            "volume": volume
        }
        const json = JSON.stringify(config);
        fs.writeFile('./bot-config.json', json, 'utf8', () => {
            console.log('Volume has been changed, new volume: ' + volume);
        });

    } else {
        console.warn('Passed volume variable is not a number.')
        return message.channel.send('Percentage value is must be a number.')
    }
}

// Constant for playlist 
const queue = new Map();


// Function for playing sequence
async function execute(message, serverQueue) {

    changeStatus('dnd');
    // Splitting message string into args, [0] - prefix with command, [1] - url link to video
    const args = message.content.split(' ');

    // Song object, will store song title and url
    var song = {};


    // Declaring voice channel object, and checking if user is in one, if not - returning info message
    const voiceChannel = message.member.voice.channel;
    if (!voiceChannel) {
        console.warn('Unable to get voiceChannel object.');
        return message.channel.send('You need to be in a voice channel.');
    }

    // Checking if bot has required permissions, if not - returning info message
    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has('CONNECT') || !permissions.has('SPEAK')) {
        console.warn('Missing CONNECT or SPEAK permission.')
        return message.channel.send('Missing permissions to join or speak.');
    }

    // Check if music url provided, True - initializing song variable and storing there song data | False - playing padoru.
    if (args[1]) {
        const songInfo = await ytdl.getInfo(args[1]);
        //TODO: make sure that passed argument is actually a url and it's valid
        // Since we accepting only YouTube links - should start with it domain.
        song = {
            title: songInfo.videoDetails.title,
            url: songInfo.videoDetails.video_url,
        }
        console.log('Received song ulr, initialised a song object.')
    } else {
        console.log('No parameters given, playing padoru.');
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
        // Adding contract to queue 
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
        } catch (e) {
            // If any error occurs during connection - printing it in both console and chat, so that bot won't crash
            console.log(e);
            queue.delete(message.guild.id);
            return message.channel.send(e);
        }

    } else {
        // Pushing song request at the end of queue and logging it in console
        serverQueue.songs.push(song);
        console.log(serverQueue.songs);
        // Indicating that bot is busy playing
        changeStatus('dnd');
        // If everything went right - informing user about successfull operation
        console.log(`Added ${song.title} to queue.`);
        return message.channel.send(`${song.title} has been added to the queue!`);
    }


}

// Function to change bot status
async function changeStatus(status) {
    client.user.setPresence({ status: status, activity: { name: 'PADORU PADORU', type: 'PLAYING', url: 'https://www.youtube.com/watch?v=dQ_d_VKrFgM' } });
    console.log('Changed status to ' + status);
}
//TODO: add comments

function leave(message, serverQueue) {
    stop(message, serverQueue);
    serverQueue.voiceChannel.leave();
}


function play(guild, song) {
    const serverQueue = queue.get(guild.id);

    if (!song) {
        changeStatus('online')
        serverQueue.voiceChannel.leave();
        queue.delete(guild.id);
        return;
    }

    const dispatcher = serverQueue.connection
        .play(ytdl(song.url))
        .on('finish', () => {
            serverQueue.songs.shift();
            play(guild, serverQueue.songs[0]);
            queue.delete(guild.id);
        })
        .on('error', err => console.error(err));
    dispatcher.setVolumeLogarithmic(serverQueue.volume / 5);
    changeStatus('dnd');

    console.log(ytdl(song.url));

    console.log(`Start playing: ${song.title} at ${guild.name}`);
    serverQueue.textChannel.send(`Start playing: **${song.title}**`);

}

function skip(message, serverQueue) {
    if (!message.member.voice.channel) return message.channel.send("You have to be in a voice channel.");
    if (!serverQueue) return message.channel.send("No song to skip.");

    serverQueue.connection.dispatcher.end();
}

function stop(message, serverQueue) {
    if (!message.member.voice.channel) return message.channel.send("You have to be in a voice channel.");
    if (!serverQueue) return message.channel.send("There is no song that I could stop!");

    serverQueue.songs = [];
    serverQueue.connection.dispatcher.end();
}