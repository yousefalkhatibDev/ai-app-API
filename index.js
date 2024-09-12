const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const axios = require("axios")
const multer = require('multer');
const bcrypt = require('bcrypt');
const session = require('express-session');
const passport = require('passport');
const { v4: uuidv4 } = require('uuid');
const initializePassport = require('./helper/passport-config');
const { createCanvas } = require('canvas');
const Tesseract = require('tesseract.js');
const pdfjs = require('pdfjs-dist');
const pool = require('./helper/database').pool;
const http = require('http');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 8082;

const corsOptions = {
    origin: "http://localhost:3000", // change this to your frontend URL
    credentials: true,
    "Access-Control-Allow-Credentials": true
};

app.use(cors(corsOptions));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(
    session({
        key: 'sid',
        secret: "Klded",
        resave: false,
        saveUninitialized: false,
        cookie: {
            secure: false,
        },
    }),
);

app.use(passport.initialize());
app.use(passport.session());

initializePassport(passport);

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

let conversationHistory = [];

app.get('/sendInfo', (req, res) => {
    const loginData = JSON.stringify({
        email: 'yo.khatib@gmail.com',
        password: '1234'
    });

    const options = {
        hostname: 'localhost',
        port: 8082,
        path: '/login',
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': loginData.length
        }
    };

    const loginReq = http.request(options, (loginRes) => {
        let data = '';

        loginRes.on('data', (chunk) => {
            data += chunk;
        });

        loginRes.on('end', () => {
            console.log(data);
            res.send(data);
        });
    });

    loginReq.on('error', (e) => {
        console.error(`Problem with request: ${e.message}`);
        res.status(500).send(`Problem with request: ${e.message}`);
    });

    loginReq.write(loginData);
    loginReq.end();
});

// Register User
app.post('/register', async (req, res) => {
    const { name, email, password } = req.body;
    const user_id = uuidv4(); // Generate UUID for user_id

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const sqlQuery = "INSERT INTO users VALUES (?, ?, ?, ?, ?)";
        await pool.query(sqlQuery, ["", user_id, name, email, hashedPassword], (err, results) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') {
                    return res.status(400).json({ error: 'Email already exists' });
                }
                return res.status(500).json({ error: 'Error while registering user' });
            }
            res.status(201).json({ message: 'User registered successfully' });
        });
    } catch (error) {
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login User
app.post('/login', (req, res, next) => {
    passport.authenticate('local', async (err, user, info) => {
        if (err) {
            return next(err);
        }
        if (!user) {
            return res.status(401).json({ message: info.message });
        }
        req.logIn(user, async (err) => {
            if (err) {
                return next(err);
            }

            return res.status(200).json({ message: 'Login successful' });
        });
    })(req, res, next);
});

app.get('/isLoggedIn', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ isLoggedIn: true })
    } else {
        res.json({ isLoggedIn: false })
    }
});

// Middleware to check if user is authenticated
function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return next();
    }
    res.json({ isLoggedIn: false })
}

// Middleware to check if user is not authenticated
function checkNotAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
        return res.redirect('/');
    }
    next();
}

// Route for handling PDF uploads and text extraction
app.post('/upload-pdf', upload.single('pdf'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }

    try {
        // Convert PDF to text using OCR
        const extractedText = await convertPdfToText(req.file.buffer);
        console.log(extractedText)

        // Add the extracted text to the conversation history
        conversationHistory.push({ role: 'system', content: extractedText });

        // Send an initial message to ChatGPT
        const initialMessage = 'Here is a text of a book I extracted from a PDF using OCR.';
        conversationHistory.push({ role: 'user', content: initialMessage });

        console.log(conversationHistory)

        const chatGptResponse = await sendMessageToChatGPT(conversationHistory);
        conversationHistory.push({ role: 'assistant', content: chatGptResponse });

        res.json({ chatGptResponse });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Failed to convert PDF to text' });
    }
});

// Function to convert PDF to text using OCR
async function convertPdfToText(pdfBuffer) {
    try {
        const data = new Uint8Array(pdfBuffer);
        const pdf = await pdfjs.getDocument({ data }).promise;
        const numPages = pdf.numPages;
        let fullText = '';

        for (let pageNumber = 1; pageNumber <= numPages; pageNumber++) {
            const page = await pdf.getPage(pageNumber);
            const scale = 2;
            const viewport = page.getViewport({ scale });

            const canvas = createCanvas(viewport.width, viewport.height);
            const context = canvas.getContext('2d');

            // Render PDF page into canvas context
            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            // Convert canvas to image buffer
            const imageDataUrl = canvas.toDataURL('image/jpeg');
            const imageBuffer = Buffer.from(imageDataUrl.split(',')[1], 'base64');

            // Perform OCR using Tesseract.js
            const { data: { text } } = await Tesseract.recognize(
                imageBuffer,
                'eng', // Specify Arabic and English languages
                { logger: m => console.log(m) }
            );

            fullText += text.trim() + '\n';
        }

        return fullText.trim();
    } catch (error) {
        console.error('Error converting PDF to text:', error);
        throw error;
    }
}

// Route for handling AI chat
async function sendMessageToChatGPT(messages) {
    try {
        const response = await axios.post(
            'https://api.openai.com/v1/chat/completions',
            {
                model: 'gpt-3.5-turbo',
                messages: messages,
                // max_tokens: 150,
            },
            {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
                    'Content-Type': 'application/json',
                }
            }
        );

        return response.data.choices[0].message.content.trim();
    } catch (error) {
        console.error('Error sending message to ChatGPT:', error.response ? error.response.data : error.message);
        throw new Error('Something went wrong');
    }
}

// Route for handling AI chat
app.post('/aichat', checkAuthenticated, async (req, res) => {
    const { message } = req.body;

    try {
        // Add the user's message to the conversation history
        conversationHistory.push({ role: 'user', content: message });

        const chatGptResponse = await sendMessageToChatGPT(conversationHistory);
        conversationHistory.push({ role: 'assistant', content: chatGptResponse });

        res.json({ reply: chatGptResponse });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Something went wrong' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});