import express from 'express';
import cors from 'cors';
import axios from 'axios';
import { Readable } from 'stream';

const app = express();
const port: number = 3000;
const TTS_API_URL: string = 'http://127.0.0.1:8383/generate-audio';

app.use(cors());
app.use(express.static('public'));

function splitIntoSentences(text: string): string[] {
    return text.match(/[^.!?]+[.!?]+/g) || [text];
}

async function generateAudioStream(text: string): Promise<Readable> {
    const response = await axios.post(TTS_API_URL, 
        { text: text.trim(), name: "coolio" },
        { responseType: 'arraybuffer' }
    );
    
    return Readable.from(Buffer.from(response.data));
}

app.get('/tts', async (req, res) => {
    const text = req.query.text as string;
    if (!text) {
        return res.status(400).json({ error: 'Text is required' });
    }

    try {
        const sentences = splitIntoSentences(text);
        
        // Set headers for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        // Process each sentence
        for (let i = 0; i < sentences.length; i++) {
            const stream = await generateAudioStream(sentences[i]);
            const chunks: Buffer[] = [];

            // Collect chunks from the stream
            for await (const chunk of stream) {
                chunks.push(Buffer.from(chunk));
            }

            // Send the audio data as an event
            const audioData = Buffer.concat(chunks).toString('base64');
            res.write(`data: ${JSON.stringify({
                index: i,
                total: sentences.length,
                audio: audioData
            })}\n\n`);
        }

        // End the SSE connection
        res.write('data: {"done": true}\n\n');
        res.end();

    } catch (error) {
        console.error('Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate audio' });
        }
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
