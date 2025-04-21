const svr=this;
const player=service_require("web/player/player");
const crypto=require("crypto");

const {xxhash}=globals.functions;

svr.clients=new Map();
svr.client_ids=[];
svr.running=true;

let id_counter=0;

async function* eventGenerator(client_id){
	const l=a=>log("Generator-"+client_id+": "+a);
	//const UPDATE_INTERVAL=5e3;
	if(!svr.clients.has(client_id)) throw new Error("client not exist");
	const client=svr.clients.get(client_id);
	initial:{
		const {
			paused,
			playing,
			track,
		}=player.playback;
		yield ["log","CONNECTION-OPENED: "+client_id];
		yield ["set-playback",JSON.stringify({playing,paused,track})];
	};
	while(svr.running){
		const wait=client.wait();
		yield ["log","NEXT-TICK: "+client_id];
		while(client.requests.length>0){
			let request=client.requests.pop();
			let data;
			if(typeof(request)!=="string"){
				data=request[1];
				request=request[0];
			}

			l("request: "+request);
			if(request==="get_albums"){
				const albums=(player.albums
					.map(item=>({
						...item,
						//id: hash(item.album_id),
						files: (player.files
							.filter(i=>i.album_id===item.id)
							.map(i=>i.id)
						),
					}))
				);
				yield ["set-albums",JSON.stringify(albums)];
			}
			else if(request==="update_playback"){
				const {
					paused,
					playing,
					track,
				}=player.playback;
				yield ["log","playback changed."];
				yield ["set-playback",JSON.stringify({playing,paused,track})];
			}
			else if(request==="get_files"){
				if(!data) yield ["log","err files to send not given."];
				else{
					for(const file_id of data){
						const file=player.files.find(item=>item.id===file_id);
						if(!file) yield ["log","err file id not exist."];
						else yield ["add-file",JSON.stringify({
							...file,
							//id: hash(file.src),
						})];
					}
				}
			}
			else yield ["log","err unknown request in server side."];
		}
		// its the main-loop like in an game.
		const info=await wait; // waits until the client needs data, false means exit generator.
		if(info===false) break; // if info false break/stopping generator.
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
function updateClientGenerator(request){
	for(const id of svr.client_ids){
		const client=svr.clients.get(id);
		if(request) client.requests.push(request);
		client.check(request===false?false:undefined); // stopping waiting and recheck for changes.
	}
}
function onPlaybackChange(){
	updateClientGenerator("update_playback");
}

svr.eventGenerator=eventGenerator;
svr.newClient=newClient;
svr.removeClient=removeClient;

player.events.playback_change.push(onPlaybackChange);

return async ()=>{
	svr.running=false;
	for(const id of svr.client_ids){
		const client=svr.clients.get(id);
		client.check(false); // make the generator stop.
	}
	svr.client_ids=[];
	svr.clients.clear();
};
