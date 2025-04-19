const svr=this;
const player=service_require("web/player/player");
const crypto=require("crypto");

svr.clients=new Map();
svr.client_ids=[];
svr.running=true;

//async function 
function simpleHash(str){
	let hash=1;
	let multiplayer=5644;
	for(let index=0; index<str.length; index+=1){
		hash=hash*multiplayer+str.charCodeAt(index) >>> 0; // because of 32 bit;
	}
	//console.log(str,hash);
	return hash;
}
async function* eventGenerator(client_id){
	//const UPDATE_INTERVAL=5e3;
	if(!svr.clients.has(client_id)) throw new Error("client not exist");
	const client=svr.clients.get(client_id);
	while(svr.running){
		const wait=client.wait();
		yield ["log","still active connection!"];
		while(client.requests.length>0){
			const request=client.requests.pop();
			log("request: "+request+", from client: "+client.id);
			if(request==="get_albums"){
				const albums=(player.albums
					.map(item=>({
						...item,
						id: simpleHash(item.album_id),
						files: (player.files
							.filter(i=>i.album_id===item.album_id)
							.map(i=>i.src)
						),
					}))
				);
				yield ["set-albums",JSON.stringify(albums)];
			}
			else yield ["log","err unknown request in server side."];
		}
		// its the main-loop like in an game.
		const info=await wait; // waits until the client needs data, false means exit generator.
		if(info===false) break; // if info false break/stopping generator.
		else if(!info) continue; // no custom action.
		else if(info==="playback_change"){
			const {
				paused,
				playing,
				track,
			}=player.playback;
			yield ["log","playback changed."];
			yield ["set-playback",JSON.stringify({playing,paused,track})];
		}
	}
}

function newClient(){
	const client={
		check: null,
		id: crypto.randomBytes(8).toString("hex").substring(0,16),
		requests: [],
		wait: null,
	};
	client.wait=()=>new Promise(resolve=>{client.check=resolve});
	//client.wait();
	svr.clients.set(client.id,client);
	svr.client_ids.push(client.id);
	return client;
}
function removeClient(client){
	svr.clients.delete(client.id);
	svr.client_ids=svr.client_ids.filter(item=>item!==client.id);
}
function updateClientGenerator(info){
	for(const id of svr.client_ids){
		const client=svr.clients.get(id);
		client.check(info); // stopping waiting and recheck for changes.
	}
}
function onPlaybackChange(){
	updateClientGenerator("playback_change");
}

svr.eventGenerator=eventGenerator;
svr.newClient=newClient;
svr.removeClient=removeClient;

player.events.playback_change.push(onPlaybackChange);

return async ()=>{
	svr.running=false;
	for(const id of svr.client_ids){
		const client=svr.clients.get(id);
		client.check(); // make the generator stop.
	}
	svr.client_ids=[];
	svr.clients.clear();
};
