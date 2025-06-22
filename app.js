const {
	hook_effect,
	hook_model,
	init,
	node_dom,
	node_map,
	node,
}=window.lui;
let log_counter=0;

// let me use someArray=[1,2,3]; someArray.softPop() gives me the last value and not touch the array. not like pop.
Array.prototype.last=function(){return this[this.length-1];}
Array.prototype.removeLast=function(){return this.slice(0,this.length-1);}

const IMG_PLAY="/files/img/playBTN.png";
const IMG_PAUSE="/files/img/pauseBTN.png";
const IMG_ALBUM_PLACEHOLDER="/files/img/folderRED.png";

const SHOW_ALBUM_PLACEHOLDER=true;

const model={
	init:()=>({
		albums: [],
		client_id: null,
		log: [],
		playback: {},
		requests: [],
		search: "",
		stream_connection: false,
		files: [],
		view_id: 0,
		view_last: [],
		view: "overview",
	}),
	changeView: (state,view,id,remember=true)=>({
		...state,
		view,
		view_id: id||0,
		view_last: !remember?state.view_last:[
			...state.view_last,
			[state.view, state.view_id],
		],
	}),
	showLastView: state=>({
		...state,
		view: state.view_last.last()[0]||"overview", // still throws if last_view is [] 
		view_id: state.view_last.last()[1]||0,
		view_last: state.view_last.removeLast(),
	}),
	addRequest: (state,...requests)=>({
		...state,
		requests: [
			...state.requests.filter(item=>!requests.some(i=>i===item)),
			...requests,
		],
	}),
	addFile: (state,...files)=>({
		...state,
		files: [
			...state.files.filter(item=>!files.some(i=>i.src===item.src)),
			...files,
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
	logState: state=>console.log("state:",state)||state,
}
async function makeRequest(client_id,request,data={}){
	const API_URL="/web/player/post.api";
	const head=await fetch(API_URL,{
		method: "post",
		headers:{
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			...data,
			action: request,
			client_id,
		}),
	});
	const response=(await head.text()).trim();
	if(response!=="OK"){
		alert("request nicht durchgelassen: "+request+"\nAntwort: "+response);
	}
	else console.log("successful action: '"+request+"' getting response via eventStream.");
}
function initialiseStream(actions){
	const stream=new EventSource("/raw/player.event");
	stream.onerror=e=>{
		console.log("ERROR:",e);
		//alert("Verbindungs-Fehler.");
		actions.modify({stream_connection: false});
		stream._close();
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
		if(playback.track) actions.addFile(playback.track);
	});
	stream.addEventListener("add-file",event=>{
		const file=JSON.parse(event.data);
		console.log("add-file",file);
		actions.addFile(file);
		actions.removeRequest("file-"+file.id);
	});
	stream.addEventListener("init-id",event=>{
		actions.modify({
			client_id: event.data
		});
	});
	return stream;
}
function checkRequestFiles(files,state,actions){
	const neededFiles=files.filter(item=>!state.files.some(i=>i.id===item));
	const requestFiles=neededFiles.filter(item=>!state.requests.some(i=>i===("file-"+item)));

	if(requestFiles.length===0) return [neededFiles,[]];

	actions.addRequest(...requestFiles.map(item=>"file-"+item));
	makeRequest(state.client_id,"request_files",{files:requestFiles});
	return [neededFiles,requestFiles];
}

function HeadLine({actions,title,backButton=true}){
	return[
		node_dom("h1",{
			F: {
				withButton: backButton,
			},
		},[
			backButton&&
			node_dom("button[innerText=Zurück]",{
				onclick: actions.showLastView,
			}),
			node_dom("span",{
				innerText: title,
			})
		]),
	]
}
function AlbumEntry({I,actions,playback,client_id}){
	const ALBUM_IN_PLAYBACK=(
		playback.playing&&
		playback.track.album_id===I.id
	);
	const HAS_ALBUM_IMAGE=Boolean(I.image_id);
	const IMG_URL=(
		HAS_ALBUM_IMAGE
		? 	"/web/player/image.api?image_id="+I.image_id
		: 	IMG_ALBUM_PLACEHOLDER
	);
	return [
		node_dom("li[className=album]",null,[
			(SHOW_ALBUM_PLACEHOLDER||I.image_id)&&
			node_dom("img[loading=lazy][alt=Album-Thumbnail]",{
				src: IMG_URL,
				height: 50,
				width: 50,
				onmouseleave: event=> event.target.src=IMG_URL,
				onmouseenter: event=> event.target.src=(
					ALBUM_IN_PLAYBACK
					? 	IMG_PAUSE
					: 	IMG_PLAY
				),
				onclick: ()=>{
					if(ALBUM_IN_PLAYBACK){
						makeRequest(client_id,"player_pause");
					}else{
						makeRequest(client_id,"player_play",{
							album_id: I.id,
							mode: "force",
						});
					}
						
					//actions.changeView("album",I.id),
				},
			}),
			node_dom("a",{
				innerText: I.album_name+" ("+I.files.length+") ",
				href: "#",
				onclick: event=>{
					event.preventDefault();
					actions.changeView("album",I.id);
					return false;
				},
			}),
		]),
	];
}
function FileEntry({I,state}){
	return [
		node_dom("p",{
			S:{
				color: (
					(state.playback.playing&&state.playback.track.src===I.src)
					? 	"green":
					(state.playback.paused&&state.playback.track.src===I.src)
						?"orange"
						:""
				),
			}
		},[
			I.track_number&&
			node_dom("b",{innerText: String(I.track_number).padStart(2,"0")+". "}),
			node_dom("span",{innerText: I.title}),

			node_dom("button[innerText=Play]",{
				onclick:()=> makeRequest(state.client_id,"player_play",{
					track_id: I.id,
					mode: confirm("Direkt Abspielen? (OK drücken).\nZur Wiedergabe hinzufügen (Abbrechen).")?"force":"append",
				}),
			}),
		]),
	];
}
function ViewAlbum({album_id,state,actions}){
	const album=state.albums.find(item=>item.id===album_id);
	if(!album) throw new Error("ALBUM NOT EXIST! "+album_id); // using and lui hook/node that blocking render or something like that.
	//const laterAlert=()=>alert("i will code that function in future for infos open github:\n\nhttps://github.com/LFF5644/site-player/issues/4");
	const [neededFiles,requestedFiles]=checkRequestFiles(album.files,state,actions);
	return [
		node(HeadLine,{actions,title:"Album"}),
		node_dom("p",{innerText: "Album: "+album.album_name}),
		album.album_artist&&node_dom("p",{innerText: "Künstler: "+album.album_artist}),
		album.disc_number&&node_dom("p",{innerText: "CD: "+album.disc_number}),
		album.year&&node_dom("p",{innerText: "Jahr: "+album.year}),
		album.image_id&&node_dom("p",null,[
			node_dom("img[alt=Album-Thumbnail][loading=lazy][title=Album-Cover]",{
				src: "/web/player/image.api?image_id="+album.image_id,
				height: "200",
			}),
		]),
		node_dom("p",{innerText: "Lieder: "+album.files.length}),
		node_dom("p[innerText=Aktionen: ]",null,[
			node_dom("button[innerText=Album zur Wiedergabeliste hinzufügen]",{
				onclick: async()=>{
					await makeRequest(state.client_id,"player_play",{
						album_id: album.id,
						mode: "append",
					});
					alert("Zur Wiedergabeliste hinzugefügt.");
				},
			}),
			node_dom("button[innerText=Direkt abspielen]",{
				onclick:()=> makeRequest(state.client_id,"player_play",{
					album_id: album.id,
					mode: "force",
				}),
			}),
		]),

		requestedFiles.length>0&&
		neededFiles.length>0&&
		node_dom("p",{innerText:"Es wird noch auf "+requestedFiles.length+" Datei Metadaten gewartet..."}),

		requestedFiles.length===0&&
		neededFiles.length===0&&
		node_map(
			FileEntry,
			album.files.map(item=>state.files.find(i=>i.id===item)),
				//.filter(Boolean),
			{state,actions},
		),
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
function ViewOverview({state,actions}){
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

		(
			state.playback.playing||
			(
				!state.playback.playing&&
				state.playback.paused
			)
		)&&
		state.playback.track&&
		node_dom("p",{
			innerText: state.playback.playing?"Aktuelle Wiedergabe: ":"Pausierte Wiedergabe: ",
			S:{
				color: state.playback.playing?"auto":"orange",
			},
		},[
			node_dom("span",{
				innerText: state.playback.track.title,
			}),
			node_dom("button[innerText=Anzeigen]",{
				onclick: ()=> actions.changeView("playback"),
			}),
		]),
		!state.playback.playing&&
		!state.playback.paused&&
		node_dom("p[innerText=Derzeit keine Musik-Wiedergabe.][style=color:red]",null,[
			node_dom("button[innerText=Anzeigen]",{
				onclick: ()=> actions.changeView("playback"),
			}),
		]),
		node_dom("ul[className=albums]",null,[
			node_map(AlbumEntry,
				state.search
				? 	state.albums.filter(item=>item.album_name.toLowerCase().includes(state.search.toLowerCase()))
				: 	state.albums,
				{
					actions,
					client_id: state.client_id,
					playback: state.playback,
				},
			),
		]),
		node_map(LogEntry,state.log),
	];
}
function ViewPlayback({client_id,actions,playback,state}){
	return[
		node(HeadLine,{
			actions,
			backButton:true,
			title: "Aktuelle Wiedergabe",
		}),

		(
			playback.playing||
			playback.paused
		)&&
		playback.track&&
		node_dom("div",null,[
			playback.track.image_id&&
			node_dom("p",null,[
				node_dom("img[alt=Album-Thumbnail][loading=lazy][title=Album-Cover]",{
					src: "/web/player/image.api?image_id="+playback.track.image_id,
					height: "200",
				}),
			]),
			node_dom("p",{
				innerText: `Wiedergabe: ${playback.track.title}`,
			}),
			playback.track.album_id&&

			node_dom("p[innerText=Aktionen: ]",null,[
				node_dom("button[innerText=Play (try)]",{
					onclick: ()=> makeRequest(client_id,"player_play"),
				}),
				node_dom("button[innerText=Previous-Track]",{
					onclick: ()=> makeRequest(client_id,"player_pervious"),
				}),
				node_dom("button[innerText=Next-Track]",{
					onclick: ()=> makeRequest(client_id,"player_next"),
				}),
				node_dom("button[innerText=Pausieren]",{
					onclick: ()=> makeRequest(client_id,"player_pause"),
				}),
				node_dom("button[innerText=Fortsetzen]",{
					onclick: ()=> makeRequest(client_id,"player_resume"),
				}),
			]),
		]),

		!playback.playing&&
		!playback.paused&&
		node_dom("p[innerText=Keine Wiedergabe.]",null,[
			node_dom("button[innerText=Wiedergabeliste fortfahren]",{
				onclick: ()=> makeRequest(client_id,"player_play"),
			}),
		]),
	];
}
function Root(){
	const [state,actions]=hook_model(model);
	window.logState=actions.logState;
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
		makeRequest(client_id,"request_albums");
	},[state.albums,state.requests,state.client_id]);
	return[
		state.view==="overview"&&
		node(ViewOverview,{state,actions}),

		state.view==="album"&&
		state.view_id&&
		node(ViewAlbum,{
			state, actions,
			album_id: state.view_id,
		}),

		state.view==="playback"&&
		node(ViewPlayback,{
			client_id: state.client_id,
			playback: state.playback,
			state, actions,
		}),
	];
}

init(Root);
