// ES6 Static Imports =========================================================
import fs from 'fs'
import {URL} from 'url'
import https from 'https'
import express from 'express'
import {networkInterfaces} from 'os'
import {Server as SocketIO} from 'socket.io'
import {default as Turn} from 'node-turn'

// Constants ===========================================================
const port = 3000
const __filename = new URL('', import.meta.url).pathname
const __dirname = new URL('.', import.meta.url).pathname

// Variables ===========================================================
let users

// Create Turn Server ===========================================================
const server = new Turn({
	//debugLevel: 'ALL',
	authMech: 'none',	//'long-term'
	//credentials: {username: "password"}
})
server.start()

// https express Server =========================================================
const app = express()
const options = {
	key:  fs.readFileSync('key.pem',  'utf8'),
	cert: fs.readFileSync('cert.pem', 'utf8')
}
const httpServer = https.createServer(options, app).listen(port, () => {
	const ip = networkInterfaces().eth0[0].address
	console.log('listening https://' + ip +':'+port)
})
app.use('/', express.static(__dirname + '/'))

// io Server ============================================================
const io = new SocketIO(httpServer)

io.on('connection', (socket) => {
	console.log('Connected: '+socket.id)
	socket.on('disconnect', (reason) => { disconnect(socket, reason) })	
	socket.on('join', async (msg, callback) => { await join(socket, msg, callback) })
	socket.on('call', async (msg, callback) => { await call(socket, msg, callback) })
	socket.on('hangup', async (msg, callback) => { await hangup(socket, msg, callback) })
	
	socket.on('offer', async (msg, callback) => { await offer(socket, msg, callback) })
	socket.on('icecandidate', async (msg, callback) => { await icecandidate(socket, msg, callback) })
})

// ================= socket.on Functions ========================================
async function disconnect(socket, reason) {
	console.log('Disconnected: '+socket.id)	
}
async function join(socket, user, callback) {	
	const users = (await io.fetchSockets()).map(socket => socket.data.user)
	if(users.includes(user)) {
		callback('fail')
		return			
	}
	socket.data.user=user
	socket.data.paired_with=false
	callback('ok')
}
async function call(socket, callee, callback) {
	const caller = socket.data.user
	const users = (await io.fetchSockets()).map(socket => socket.data.user)
	if(caller == callee || !users.includes(callee) || socket.data.paired_with) {
		callback('fail') 
		return
	}
	const toSocket = (await io.fetchSockets()).find(socket => socket.data.user==callee)
	socket.data.paired_with = callee
	toSocket.data.paired_with = caller
	toSocket.emit("call", caller, (response) => {
		(response=='ok') ? callback('ok') : callback('fail')
	})
}
async function hangup(socket, msg, callback) {
	const toSocket = (await io.fetchSockets()).find(sock => sock.data.user==socket.data.paired_with)
	socket.data.paired_with = false
	toSocket.data.paired_with = false
	toSocket.emit("hangup")	
}

async function offer(socket, offer, callback) {
	const toSocket = (await io.fetchSockets()).find(sock => sock.data.user==socket.data.paired_with)	
	toSocket.emit("offer", offer, async (response) => callback(response))
}
async function icecandidate(socket, candidate, callback) {
	const toSocket = (await io.fetchSockets()).find(sock => sock.data.user==socket.data.paired_with)
	toSocket.emit("icecandidate", candidate)
}
