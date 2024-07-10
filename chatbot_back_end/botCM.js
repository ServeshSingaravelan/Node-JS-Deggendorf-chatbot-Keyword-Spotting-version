require('dotenv').config();

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

const port = process.env.PORT || 3000;

app.use(express.static(__dirname + '/public'));

//intents and responses
let intents;
let responses;

try {
    intents = JSON.parse(fs.readFileSync('intents.json', 'utf8'));
    responses = JSON.parse(fs.readFileSync('responses.json', 'utf8'));
} catch (error) {
    console.error('Error reading intents or responses:', error);
    process.exit(1);
}

//softfallback counter and previous intent tracker
const fallbackCounts = {};
const previousIntent = {};

//get intent from the message
function getIntent(message) {
    for (const [intent, keywords] of Object.entries(intents)) {
        for (const keyword of keywords) {
            if (message.includes(keyword)) {
                return intent;
            }
        }
    }
    return null;
}

io.on('connection', (socket) => {
    console.log('A user connected');

    //init fallback count and previous intent for the connected user
    fallbackCounts[socket.id] = 0;
    previousIntent[socket.id] = null;

    socket.on('message', (message) => {
        const intent = getIntent(message.toLowerCase());

        if (intent) {
            let response = responses[intent];
            socket.emit('response', { text: response });
            
            //reset the fallback count and update previous intent on a good response
            fallbackCounts[socket.id] = 0;
            previousIntent[socket.id] = intent;
        } else {
            fallbackCounts[socket.id]++;
            //conversational memory - powered hard and soft fallbacks
            if (fallbackCounts[socket.id] >= 3) {
                let responseText;
                if (previousIntent[socket.id] && previousIntent[socket.id].includes('insurance')) {
                    responseText = "It seems like you have insurance-related questions. Could you please clarify your query or ask about something specific regarding health insurance?";
                } else if (previousIntent[socket.id] && previousIntent[socket.id].includes('bank_account')) {
                    responseText = "It seems like you have bank account-related questions. Could you please clarify your query or ask about something specific regarding bank accounts?";
                } else {
                    responseText = "I'm sorry, but I seem to be having trouble understanding you, I shall now clear the page, and start over.";
                    setTimeout(() => {
                        socket.emit('clear');
                    }, 6000); //emit event to clear chatbot page for hardfallback
                }
                socket.emit('response', { text: responseText });
                
                //reset the fallback count
                fallbackCounts[socket.id] = 0;
            } else {
                let responseText;
                if (previousIntent[socket.id] && previousIntent[socket.id].includes('insurance')) {
                    responseText = "I am sorry I cannot understand you, please rephrase your insurance-related query. Can you provide more details about the health insurance you are looking for?";
                } else if (previousIntent[socket.id] && previousIntent[socket.id].includes('bank_account')) {
                    responseText = "I am sorry I cannot understand you, please rephrase your bank account-related query. Can you provide more details about the bank account you are looking to open?";
                } else {
                    responseText = "I am sorry I cannot understand you, please rephrase your query, and please make your questions clear and precise!";
                }
                socket.emit('response', { text: responseText });
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected');
        //reset fallback and previous intent on disconnect
        delete fallbackCounts[socket.id];
        delete previousIntent[socket.id];
    });
});

app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
});

//start server
server.listen(port, () => {
    console.log(`Chatbot is listening on port ${port}`);
});
