const {
	hook_effect,
	hook_model,
	init,
	node_dom,
	node_map,
}=window.lui;
let log_counter=0;
const model={
	init:()=>({
		albums: [],
		client_id: null,
		log: [],
		playback: {},
		requests: [],
		search: "",
		stream_connection: false,
		tracks: [],
	}),
	addRequest: (state,request)=>({
		...state,
		requests: [
			...state.requests.filter(item=>item!==request),
			request,
		],
	}),
	addTrack: (state,...tracks)=>({
		...state,
		tracks: [
			...state.tracks.filter(item=>!tracks.some(i=>i.src===item.src)),
			...tracks,
		],
	}),
	removeRequest: (state,request)=>({
		...state,
		requests: [...state.requests.filter(item=>item!==request)],
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
	deleteLogs: state=>({
		...state,
		log:[],
	}),
}
async function makeRequest(request,client_id){
	const API_URL="/web/player/post.api";
	const head=await fetch(API_URL,{
		method: "post",
		headers:{
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			client_id,
			action: request,
		}),
	});
	const response=(await head.text()).trim();
	if(response!=="OK"){
		alert("request nicht durchgelassen: "+request+"\nantwort: "+response);
	}
	else console.log("successful action: '"+request+"' getting response via eventStream.");
}
function initialiseStream(actions){
	const stream=new EventSource("/raw/player.event");
	stream.onerror=e=>{
		console.log("ERROR:",e);
		//alert("Verbindungs-Fehler.");
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
	};

	stream.addEventListener("log",event=>{
		console.log(event.type,event.data);
		actions.appendLog({
			id: log_counter+=1, // log_counter+=1; value => id.
			data: event.data,
			event: event.type,
		});
	});
	stream.addEventListener("set-albums",event=>{
		//alert(event.data);
		console.log("setting albums.");
		console.log("albums",JSON.parse(event.data));
		
		actions.modify({
			albums: JSON.parse(event.data),
		});
		actions.removeRequest("albums");
	});
	stream.addEventListener("set-playback",event=>{
		const playback=JSON.parse(event.data);
		console.log("set-playback",playback);
		actions.modify({
			playback,
		});
		if(playback.track) actions.addTrack(playback.track);
	});
	stream.addEventListener("init-id",event=>{
		actions.modify({
			client_id: event.data
		});
	});
	return stream;
}
function AlbumPreview({I}){
	return [
		node_dom("p",{
			innerText: I.album_name+" ("+I.files.length+") ",
		},[
			node_dom("a[innerText=P]",{
				href: "/web/player/input.api?action=play&album_id="+I.album_id,
				target: "_blank",
				onclick: ()=> confirm("Möchtest du '"+I.album_name+"' abspielen?"),
			}),
		]),
	];
}
function LogEntry({I}){
	return[
		node_dom("p",{
			innerText: `LOG: ${I.event}: ${I.data}`,
			title: I.id,
		}),
	];
}
function Root(){
	const [state,actions]=hook_model(model);
	hook_effect((connection)=>{
		if(connection) return; // return because already connected.
		actions.deleteLogs();
		window.stream=initialiseStream(actions);
	},[state.stream_connection]);
	hook_effect((albums,requests,client_id)=>{
		if(
			albums.length>0||
			requests.includes("albums")||
			!client_id
		) return;
		actions.addRequest("albums");
		//debugger;
		makeRequest("request_albums",client_id,actions);
	},[state.albums,state.requests,state.client_id]);
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
			}),
		]),
		node_dom("p[innerText=Suche: ]",null,[
			node_dom("input",{
				oninput: event=> actions.modify({search: event.target.value}),
			})
		]),

		state.playback.playing&&
		state.playback.track&&
		node_dom("p[innerText=Aktuelle Wiedergabe: ]",null,[
			node_dom("span",{
				innerText: state.playback.track.title,
			}),
		]),
		!state.playback.playing&&
		node_dom("p[innerText=Derzeit keine Musik-Wiedergabe.][style=color:red]"),

		node_map(AlbumPreview,
			state.search
			? 	state.albums.filter(item=>item.album_name.toLowerCase().includes(state.search.toLowerCase()))
			: 	state.albums
		),
		node_map(LogEntry,state.log),
	];
}

init(Root);
