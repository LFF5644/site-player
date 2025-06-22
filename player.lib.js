const child_process=require("child_process");
const fs=require("fs");

const logging=process.argv.includes("-v");

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
	playback_paused: [],
	playback_resumed: [],
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
				"-autoexit",
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
	player.process.on("close",(code,signal)=>{
		if(logging) console.log("player process closed with code & signal:",code,signal);
		player.process=null;
		player.paused=false;
		player.playing=false;
	});
	player.process.stdin.on("error",e=>{
		console.log("player stdin error: "+e.code);
		//exitPlayer();
	});
}

async function exitPlayer(){
	if(player.process){
		const closed_promise=new Promise(resolve=> player.process.once("close",resolve));
		if(logging) console.log("player killing...");
		player.process.kill("SIGINT");
		await closed_promise; // waits while player closing...
		//if(logging) console.log("player killed.");
		//player.process=null;
	}
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

async function changePlayback(track){
	await exitPlayer();
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
		if(logging) console.log("playback stream ended.");
	});
	player.process.once("close",(code,signal)=>{
		//if(logging) console.log("player closed with:",signal,code);
		//player.playing=false;
		//exitPlayer(); // i hope not needed because already correctly ended.
		if(signal||code){
			// code 123 happens if i guess player killed with SIGINT or pipe err.
			if(logging||code!==123) console.log("playback not ended successfully. SIGNAL:",signal,"CODE:",code);
			eventRunner("playback_stopped",track);
		}
		else eventRunner("playback_ended",track);
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
	eventRunner("playback_paused");
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
	eventRunner("playback_resumed");
}
function play(track){
	if(typeof(track)==="string") track={src:track};
	changePlayback(track);
	// return promise that resolves if track ended.
	/*return new Promise(r=>{
		player.stream.on("close",()=>r());
	});*/ // i will recode that later.
}
async function stopPlayback(){
	if(
		!player.process&&
		!player.stream&&
		!player.track
	) return; //throw new Error("you cant stop player because already stopped or not started.");
	log("stopping playback...");
	await exitPlayer();
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
