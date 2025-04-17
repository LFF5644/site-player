const svr=this;
const player=service_require("web/player/player");
const crypto=require("crypto");

svr.clients=new Map();
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
async function* eventGenerator(client){
	//const UPDATE_INTERVAL=5e3;
	if(!svr.clients.has(client.id)) throw new Error("client not exist");
	while(svr.running){
		const wait=client.wait();
		yield ["log","still active connection!"];
		while(client.requests.length>0){
			const request=client.requests.pop();
			log("request: "+request+", from client: "+client.id);
			if(request==="get_albums"){
				const albums=player.albums
					.map(item=>({
						...item,
						id: simpleHash(item.album_id),
						files: (player.files
							.filter(i=>i.album_id===item.album_id)
							.map(i=>i.src)
						),
					}));
				yield ["set-albums",JSON.stringify(albums)];
			}
			else yield ["log","err unknown request in server side."];
		}
		// its the main-loop like in an game.
		await wait; // waits until the client needs data, false means exit generator.
		//new Promise(r=>setTimeout(r,UPDATE_INTERVAL));
	}
}

function newClient(){
	const client={
		id: crypto.randomBytes(8).toString("hex").substring(0,16),
		requests: [],
		//nextTick: null, // this is a promise
		wait: null, // this is a function that returns a promise that
	};
	client.wait=()=>new Promise(resolve=>{client.check=resolve});
	//client.wait();
	svr.clients.set(client.id,client);
	return client;
}
function removeClient(client){
	return svr.clients.delete(client.id);
}

svr.eventGenerator=eventGenerator;
svr.newClient=newClient;
svr.removeClient=removeClient;
return async ()=>{
	svr.running=false;
	svr.clients.clear();
};
