# Wieso dieses Project?
- Mein Server steht in meinem Zimmer und hat eine Musik-Box angeschlossen wieso nicht über eine Coole WebGUI Steuern was grade als Musik läuft, so war damals schon die Grund-Idee
- Diese Repo Soll das Ehmalige Project site-currently-playing von mir ablösen, da dies veraltet ist und ich lange nicht mehr gepflegt habe.
- Deswegen habe ich am 12.04.2025 entschieden das Project https://github.com/LFF5644/site-spotifyApiService (was ich am 14.01.2023 erstellt habe) abzulösen


## Aufbau der Dateien
- player.lib.js - zuständig für das abspielen, Arbeitet mit child_process -> ffplay
- player.service.js - zuständig fürs Laden fon Songs, Alben Sortierung, Wiedergabelisten Verteilung, mp3 Files Lesen Metadaten, Steuerung von musicLib (player.lib.js)
- server.service.js - Effiziente Client Kommunikation via EventGenerator (500 IQ Programmcode), Client kann Wiedgabe Steuern usw
- get.api - EventStream wo der Client zuhört und Infos erhält!
- post.api - Client benutzt diese zum ändern der Wiedergabe oder anfordern von z.B. Metadaten von Songs (beim Klicken auf ein Album o.ä.)
- index.html, app.js, style.css -  Der Coole Client der alles sauber umsätzen lässt, sehr schnell und Performant, dank dem LUI framework was wenige nur wenige KB groß ist!
- legacy.html, build/legacy.js - Ermöglicht alten Browsern beispielsweise Firefox v48 auf Windows XP mit SSE1 CPU läuft die App super ohne Probleme!

Wem der VLC Player zu Schwer ist kann es mal mit NodeJS rtjscomp und diesem Coolen Project probieren :)