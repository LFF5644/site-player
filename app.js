const {
	hook_effect,
	hook_model,
	init,
	node_dom,
	node_map,
}=window.lui;

const model={
	init:()=>({
		log: [],
		client_id: null,
		stream_connection: false,
	}),
	modify: (state,changes)=>({
		...state,
		...changes,
	}),
	appendLog: (state,...log)=>({
		...state,
		log:[
			...state.log,
			...log,
		],
	}),
	deleteLog: state=>({
		...state,
		log:[],
	})
}
function initialiseStream(actions){
	const stream=new EventSource("/raw/player.event");
	stream.onerror=e=>{
		console.log("ERROR:",e);
		alert("Verbindungs-Fehler.");
		actions.modify({stream_connection: false});
	};
	stream.onmessage=event=>{
		console.log("event:",event);
	};
	stream.onopen=event=>{
		console.log("onopen:",event);
		actions.modify({stream_connection: true});
	};
	stream._close=stream.close;
	stream.close=()=>{
		actions.modify({stream_connection: false});
		stream._close();
	}

	stream.addEventListener("log",event=>{
		console.log(event);
		actions.appendLog({
			id: Number(event.lastEventId),
			data: event.data,
			event: event.type,
		});
	});
	stream.addEventListener("init-id",event=>{
		actions.modify({client_id:event.data});
	});
	return stream;
}
function Entry({I}){
	return[
		node_dom("p",{
			innerText: `${I.event}: ${I.data}`,
			title: I.id,
		}),
	];
}
function Root(){
	const [state,actions]=hook_model(model);
	hook_effect((connection,actions)=>{
		if(connection) return; // return because already connected.
		actions.deleteLog();
		window.stream=initialiseStream(actions);
	},[state.stream_connection,actions]);
	return[
		node_dom("h1[innerText=LUI geladen.]"),
		node_dom("p",{
			innerText: (
				state.stream_connection
				? "Verbindung zum Server Besteht."
				: "Keine Verbindung zum Server!"
			),
			S:{
				color: (
					state.stream_connection
					? null
					: "red"
				),
			},
		}),
		state.client_id&&
		node_dom("p",{
			innerText: "Interaktive Benutzer ID: "+state.client_id,
		}),
		state.stream_connection&&
		node_dom("p[innerText=Hacky Actions: ]",null,[
			node_dom("button[innerText=Verbindung Schließen]",{
				onclick:()=> stream.close(),
			})
		]),
		node_map(Entry,state.log),
	];
}

init(Root);
