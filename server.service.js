const svr=this;
//const player=service_require("web/player/player");
const crypto=require("crypto");

svr.clients=new Set();
svr.running=true;

async function* eventGenerator(client){
	const UPDATE_INTERVAL=5e3;
	if(!svr.clients.has(client)) throw new Error("client not exist");
	while(svr.running){
		yield ["log",(new Date()).toTimeString()];
		await new Promise(r=>setTimeout(r,UPDATE_INTERVAL));
	}
}

function newClient(){
	const client={
		id: crypto.randomBytes(8).toString("hex").substring(0,16),
	};
	svr.clients.add(client);
	return client;
}
function removeClient(client){
	return svr.clients.delete(client);
}

svr.eventGenerator=eventGenerator;
svr.newClient=newClient;
svr.removeClient=removeClient;
return async ()=>{
	svr.running=false;
	svr.clients.clear();
};