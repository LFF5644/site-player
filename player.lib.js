const child_process=require("child_process");
const fs=require("fs");

const logging=process.argv.includes("-v");
//const log

let player_settings={
	engine: "ffplay",
};
let player={
	paused: false,
	playing: false,
	process: null,
	stream: null,
	track: null,
};
let events={
	playback_ended: [],
	playback_started:[],
	playback_stopped: [],
};

function eventRunner(eventName,...args){
	if(!events[eventName]) throw new Error("event name not found internal error!");
	for(const fn of events[eventName]){
		fn(...args);
	}
}
function spawnPlayer(){
	if(player_settings.engine==="ffplay"){
		try{
			player.process=child_process.spawn("/usr/bin/ffplay",[
				"-nodisp",
				"-analyzeduration", "0",
				"-probesize", "32",
				"-loglevel","quiet",
				"-fflags","nobuffer",
				"-i","-",
			],{
				stdio: ["pipe", "ignore", "ignore"],
			});
		}catch(e){
			console.log("failed to spawn player!");
			throw e;
		}
	}
	else throw new Error("engine is not supported: "+config.engine);
	if(logging) console.log("spawning player");
	player.process.stdin.on("error",e=>{
		console.log("player stdin error: "+e.code);
		exitPlayer();
	});
}

function exitPlayer(){
	if(!player.process) return;
	player.process.kill("SIGTERM");
	if(logging) console.log("player killed.");
	if(player.stream){
		player.stream.destroy();
		if(logging) console.log("stream killed.");
		player.stream=null;

	}
	player.process=null;
	player.track=null;
	player.paused=false;
	player.playing=false;
}

function changePlayback(track){
	exitPlayer();
	spawnPlayer();
	try{
		player.stream=fs.createReadStream(track.src);
	}catch(e){
		throw new Error("cannot read file in stream: "+track.src);
	}
	player.playing=true;
	player.track=track;
	if(logging) console.log("new playback "+track.src);
	eventRunner("playback_started",track);
	player.stream.pipe(player.process.stdin).on("error",e=>{
		console.log("player stream pipe error "+e.code);
	});
	player.stream.on("end",()=>{
		player.stream=null;
		player.playing=false;
		if(logging) console.log("playback stream ended.");
		exitPlayer();
		eventRunner("playback_ended",track);
	});
	player.stream.on("close",()=>{
		player.stream=null;
	});
};
function pausePlayback(){
	if(
		!player.playing||
		!player.process||
		!player.track||
		player.paused
	) throw new Error("you cant pause right now player not ready or already paused.");
	player.process.kill("SIGSTOP");
	player.paused=true;
	player.playing=false;
	if(logging) console.log("player paused.");
}
function resumePlayback(){
	if(
		!player.paused||
		!player.process||
		!player.track||
		player.playing
	) throw new Error("you cant resume the player because its not paused or already playing.");
	player.process.kill("SIGCONT");
	player.paused=false;
	player.playing=true;
	if(logging) console.log("player resumed.");
}
function play(track){
	if(typeof(track)==="string") track={src:track};
	changePlayback(track);
	return new Promise(r=>{
		player.stream.on("close",()=>r());
	});
}
function stopPlayback(){
	if(
		!player.process&&
		!player.stream&&
		!player.track
	) return; //throw new Error("you cant stop player because already stopped or not started.");
	log("stopping playback...");
	exitPlayer();
	eventRunner("playback_stopped");
}


process.on("exit",exitPlayer);
process.on("SIGINT",exitPlayer);
process.on("SIGTERM",exitPlayer);

module.exports=(inp={})=>{
	events={
		...events,
		...inp.events||{},
	};
	player_settings={
		...player_settings,
		...inp.player_settings||{},
	};

	return {
		changePlayback,
		pausePlayback,
		play,
		resumePlayback,
		stopPlayback,
		events,
		player_settings,
		player,
	};
};
