// CREATED: 12.04.2025
// newer version of currently-playing/musicPlayer, created: 14.01.2023, https://github.com/LFF5644/site-spotifyApiService
const svr=this; // makes possible to use the service_object in functions.
const CONFIG_FILE="player/player_config.json";

const logging=process.argv.includes("-v");
if(logging) await rtjscomp.actions.module_cache_clear();

const {data_load}=rtjscomp;
const musicLib=require("./public/web/player/player.lib.js")();
const fsp=require("fs/promises");
const fs=require("fs");
const crypto=require("crypto");

let id3;
try{
	id3=require("node-id3");
}catch(e){
	log("require: node-id3 not found, continue without.");
}

// no svr.start function required in new rtjscomp version.
const config=await data_load(CONFIG_FILE); // using new data_load function.
if(!config) throw new Error("cant start service, config empty.")

function chunkCreator(array,size){
	return new Array(Math.ceil(array.length/size)).fill(0).map((_item,index)=>array.slice(index*size,index*size+size));
}

async function getFiles(folder){
	if(!folder.endsWith("/")) folder+="/";
	let items=[];
	try{
		items=await fsp.readdir(folder);
	}catch(e){
		items=[];
		log("readdir err: "+e.message);
		//return;
		throw e;
	}
	items=items.map(item=>folder+item);
	let files=[];
	let directories=[];
	do{
		let promises=[];
		for(const item of items){
			promises.push(new Promise(async resolve=>{
				const stat=await fsp.stat(item);
				if(stat.isFile()) files.push(item);
				else if(stat.isDirectory()) directories.push(item);
				resolve();
			}));
		}
		await Promise.all(promises);
		promises=[];
		items=[];
		for(const dir of directories){
			promises.push(new Promise(async resolve=>{
				items.push(
					...(await fsp.readdir(dir)).map(item=>dir+"/"+item)
				);
				resolve();
			}));
		}
		await Promise.all(promises);
		promises=[];
		directories=[];
	}
	while(items.length>0);
	return files;
}
async function getMetadata(file){
	let try_alternative=true;
	const metadata={
		//id: crypto.createHash("sha256").update(file).digest("hex"),
		album_artist: null,
		album_id: null,
		album_name: null,
		artist: null,
		disc_number: 0,
		gerne: null,
		image_buffer: null,
		image_id: null,
		image_type: null,
		src: file,
		title: null,
		track_length: 0,
		track_number: 0,
		used_alternative: false,
		used_id3: false,
		year: null,
	}
	
	const filename=file.split("/").pop();
	const fileExtension=filename.split(".").pop();
	const pathList=file.split("/");
	pathList.pop();

	readMetadata:{
		if(!id3) break readMetadata;
		if(fileExtension!=="mp3") break readMetadata;

		// open the file but not the entire file
		//const MAX_READ_SIZE=1024*640; // i hope the file header is in the first 640KB. with the image.
		const MAX_READ_SIZE=1024*1; // just one KB for fast service start.
		const stream=fs.createReadStream(file,{
			start: 0,
			end: MAX_READ_SIZE,
		});
		let buffer=Buffer.alloc(0);
		await new Promise(resolve=>{
			stream.on("data",chunk=>{
				buffer=Buffer.concat([
					buffer,
					chunk,
				]);
			});
			stream.on("end",resolve);
		});
		// Daten gelesen, jz id3 versuchen.
		let tags;
		try{
			tags=await id3.read(buffer); // i do not need a await but i just wrote it because maybe in future xD RIP ;)
		}catch(e){
			log("Fehler beim Öffnen des Datei-Buffers mit ID3, MAX_READ_SIZE zu klein oder ungültige Datei? Datei: "+file+"; Datei Buffer: "+buffer.length);
			break readMetadata;
		}
		// checking tags and sorting.
		//console.log(tags);
		delete buffer; // not longer needed! FREE MEM :P
		delete tags.raw; // more memory for me :P
		if(!tags.title) break readMetadata; // i guess if no title we have no other infos.
		metadata.used_id3=true;

		if(tags.album) metadata.album_name=tags.album;
		if(tags.artist) metadata.artist=tags.artist;
		if(tags.gerne) metadata.gerne=gerne;
		if(tags.length&&!isNaN(Number(tags.length)/1000)) metadata.track_length=Number(tags.length)/1000;
		if(tags.partOfSet&&!isNaN(Number(tags.partOfSet))) metadata.disc_number=Number(tags.partOfSet);
		if(tags.performerInfo) metadata.album_artist;
		if(tags.title) metadata.title=tags.title;
		if(tags.trackNumber&&!isNaN(Number(tags.trackNumber))) metadata.track_number=Number(tags.trackNumber);
		if(tags.year&&!isNaN(Number(tags.year))) metadata.year=Number(tags.year);
		if(tags.image&&tags.image.imageBuffer){
			metadata.image_id=crypto.createHash("sha256").update(tags.image.imageBuffer).digest("hex");
			metadata.image_type=tags.image.mime;
			metadata.image_buffer=tags.image.imageBuffer;
			delete tags.image.imageBuffer;
		}

		if(
			metadata.album_name&&
			metadata.title
		) try_alternative=false;
	}
	if(try_alternative){
		// alternative way for none mp3 files or not supported files.
		metadata.used_alternative=true;
		let name=filename.substring(0,filename.length-fileExtension.length-1);
		const track_number=(
			Number(filename.split(" ").shift())||
			Number(filename.split("_").shift())||
			Number(filename.split("-").shift())
		);
		if(!isNaN(track_number)){ // has track_number!
			metadata.track_number=track_number;
			if(!isNaN(Number(filename.split(" ").shift()))) name=name.substring(filename.split(" ").shift().length);
			else if(!isNaN(Number(filename.split("_").shift()))) name=name.substring(filename.split("_").shift().length);
			else if(!isNaN(Number(filename.split("-").shift()))) name=name.substring(filename.split("-").shift().length);
		}
		metadata.title=name.split("_").join(" ");
		if(pathList[pathList.length-1]&&pathList[pathList.length-1].startsWith("CD")){
			if(!isNaN(Number(pathList[pathList.length-1].substring(2).trim()))){
				metadata.disc_number=Number(pathList.pop().substring(2).trim());
			}
		}
		let parentFolder=pathList.pop();
		delete pathList;
		
		if(
			parentFolder.substring(parentFolder.length-6,parentFolder.length-5)==="("&&
			!isNaN(Number(parentFolder.substring(parentFolder.length-5,parentFolder.length-1)))&&
			parentFolder.substring(parentFolder.length-1,parentFolder.length)==="("
		){
			const year=Number(parentFolder.substring(parentFolder.length-5,parentFolder.length-1));
			metadata.year=year;
			parentFolder=parentFolder.substring(0,parentFolder.length-6).trim();
		}
		metadata.album_name=parentFolder.split("_").join(" ");
	}
	return metadata;
}
async function searchMedia(){
	if(logging) log("searching for music files...");
	let files=config.singleFiles||[];
	let promises=[];
	for(const folder of config.directories){
		promises.push(new Promise(async resolve=>{
			files.push(
				...(await getFiles(folder))
					.filter(item=>config.allowedFileTypes.some(i=>item.endsWith(i))
				)
			);
			resolve();
		}));
	}
	await Promise.all(promises);
	delete promises;
	if(logging) log(files.length+" music files found, starting searching for metadata...");
	
	const startTime=Date.now();
	let completed=0;
	let completed_chunks=0;
	let files_metadata=[];
	const chunked=chunkCreator(files,8);

	const log_fn=()=>{
		log("Lese Meta-Daten, files: "+completed+" / "+files.length+", chunks: "+completed_chunks+" / "+chunked.length);
		log_timeout=setTimeout(log_fn,100);
	};
	let log_timeout=setTimeout(log_fn,100);

	for(const chunk of chunked){
		const promises=[];
		for(const file of chunk){
			promises.push(new Promise(async resolve=>{
				const metadata=await getMetadata(file)
				completed+=1;
				resolve(metadata);
			}));
		}
		const data=await Promise.all(promises);
		files_metadata.push(...data);
		completed_chunks+=1;
	}
	clearTimeout(log_timeout);
	const time=Date.now()-startTime;
	log("Alle Dateien Ausgelesen!, "+time/1000+"s gebraucht.");
	console.log(completed_chunks,completed,files_metadata.length);
	// free RAM!
	delete chunked;
	delete completed_chunks;
	delete completed;
	delete files; // i guess i wont need him any more.
	delete log_fn;
	delete log_timeout;

	const albumTemplate={
		//id: null,
		album_artist: null,
		album_id: null,
		album_name: null,
		disc_number: 0,
		image_id: null,
		used_alternative: false,
		used_id3: false,
		year: 0,
	};
	for(const file of files_metadata){
		if(file.image_id){
			if(!svr.thumbnails.has(file.image_id)) svr.thumbnails.set(file.image_id,[file.image_type,file.image_buffer]);
			delete file.image_buffer;
			delete file.image_type;
		}
		else{
			// not needed, because image_id.
			delete file.image_buffer;
			delete file.image_type;
		}

		if(file.album_name){
			const album_id=crypto.createHash("sha256").update(file.album_name+file.album_artist+file.disc_number).digest("hex");
			if(!hasAlbum(album_id)) svr.albums.push({
				...albumTemplate,
				album_id,
			});
			const album=getAlbum(album_id);

			if(!album.album_artist&&file.album_artist) album.album_artist=file.album_artist;
			if(!album.album_name&&file.album_name) album.album_name=file.album_name;
			if(!album.disc_number&&file.disc_number) album.disc_number=file.disc_number;
			if(!album.image_id&&file.image_id) album.image_id=file.image_id;
			if(!album.used_alternative&&file.used_alternative) album.used_alternative=file.used_alternative;
			if(!album.used_id3&&file.used_id3) album.used_id3=file.used_id3;
			if(!album.year&&file.year) album.year=file.year;

			if(file.image_id===album.image_id) delete file.image_id;

			// now unused.
			delete file.album_artist;
			delete file.album_name;
			delete file.disc_number;
			delete file.year;
			
			// because of album_id.
			file.album_id=album_id;
		}
		else{
			// remove unused keys from non album track.
			// and saving memory and disc space.
			delete file.album_artist;
			delete file.album_id;
			delete file.album_name;
			delete file.disc_number;
			delete file.year;
		}
	}
	const totalSize=[...svr.thumbnails.entries()].map(item=>item[1][1].length).reduce((size,value)=>size+value); // read thumbnail size from all cached images with hacky way.
	log("Total image size cached: "+Math.round(totalSize/1024*1000)/1000+" KB, "+svr.thumbnails.size+" images cached.");
	log("Alben: "+svr.albums.length);
	fsp.writeFile("/tmp/musicFiles.json",JSON.stringify({
		albums: svr.albums,
		files: files_metadata, //[...files_metadata.entries()].map(item=>item[1]), // hacky way to transform a Map to an Array.
	},null,"\t"));

	return files_metadata;
}
function eventRunner(event,...args){
	if(!svr.events[event]) throw new Error("event with name "+event+" do not exist!");
	for(const fn of svr.events[event]){
		fn(...args);
	}
}
function hasAlbum(album_id){return svr.albums.some(item=>item.album_id===album_id)}
function getAlbum(album_id){return svr.albums.find(item=>item.album_id===album_id)}
function playlist_add_album(album_id){
	if(!hasAlbum(album_id)) throw new Error("cant play not existing album: "+album_id);
	const album=getAlbum(album_id);
	let tracks=svr.files.filter(item=>item.album_id===album_id);
	const album_has_track_numbers=(!tracks.some(item=>!item.track_number));
	//console.log("album_has_track_numbers:",album_has_track_numbers);
	//if(!album_has_track_numbers) console.log(tracks);
	tracks=tracks.sort((item1,item2)=> // sorting tracks by track_number or alternative by src/filename
		album_has_track_numbers
		? 	item1.track_number-item2.track_number
		: 	item1.src.localeCompare(item2.src) // I FORGOT AN FUCKING "E" at the end and got an error that localCompare is not a function and i searched too long :(
	);
	if(logging) log("PLAYLIST: adding album'"+album.album_name+"' with "+tracks.length+" tracks.");
	
	svr.current_playlist.push(...tracks);
}
function playAlbum(album_id,force_play=false){
	if(force_play){ // clearing current_playlist to start with album directly.
		musicLib.stopPlayback();
		svr.current_playlist=[];
	}
	playlist_add_album(album_id);
	continuePlaylist();
}
function onPlaybackEnd(ended_track){
	continuePlaylist();
}
function onPlaybackStart(track){
	eventRunner("playback_change");
}
function onPlaybackStopp(){
	eventRunner("playback_change");
}

async function continuePlaylist(){
	if(musicLib.player.playing) return;
	if(musicLib.player.paused){
		musicLib.resumePlayback();
		return;
	}

	if(svr.current_playlist.length>0){
		const track=svr.current_playlist.shift();
		if(logging) log("playing next track.");
		musicLib.changePlayback(track);
	}
	else{
		if(logging) log("playlist finished!");
	}
}

svr.getAlbum=getAlbum;
svr.hasAlbum=hasAlbum;
svr.albums=[];
svr.current_playlist=[];
svr.thumbnails=new Map();

svr.files=await searchMedia();

// append event listeners
musicLib.events.playback_ended.push(onPlaybackEnd);
musicLib.events.playback_started.push(onPlaybackStart);
musicLib.events.playback_stopped.push(onPlaybackStopp);

//const test_music_file="/media/storage/Medien/Musik/Alben - OMA/Desktop Musik/Adalberto Alvarez - Grandes Exitos/01 Tu Fiel Irorador.wma";
//const other_test_music_file="/home/lff/test.mp3";
//const other_test_music_file2="/home/lff/audiodump.wav";

//playAlbum("142494ba08737bbca72ae49eb50e9425bce99f1661c793a1bdf554247cd2de6e"); // "Techno Parade '95"
//playAlbum("7fca7f51770552daed41a97e1116bc7253675a361fed9ce37a567b31f75eaf20"); // "Sunshine Live"
//playAlbum("717ac49b9a06f0cfcf119f8434625ebf86a347bab53eed5d5d0b1dda37e3fb30"); // "Dream Dance Vol. 6"

svr.playback=musicLib.player;
svr.stopPlayback=musicLib.stopPlayback;
svr.playAlbum=playAlbum;
svr.getAlbums=()=>[...svr.albums]; //[...svr.albums.entries()].map(item=>({...item[1],album_id:item[0]}));
svr.pausePlayback=musicLib.pausePlayback;
svr.resumePlayback=musicLib.resumePlayback;
svr.play=continuePlaylist;
svr.playNext=()=>{
	musicLib.stopPlayback();
	continuePlaylist();
}
svr.events={
	"playback_change":[],
};

return async()=>{
	musicLib.stopPlayback(); // stopping playback & killing player.

	// FREE RAM
	delete svr.albums;
	delete svr.files;
	delete svr.thumbnails;
}
