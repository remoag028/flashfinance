import fetch from 'node-fetch';

const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";
// The API Key is securely pulled from Netlify's environment variables
const API_KEY = process.env.GEMINI_API_KEY;

/**
 * Handles communication with the Gemini API for both real-time news fetching and summarization.
 * This function acts as a secure proxy, preventing the API key from being exposed on the client-side.
 */
exports.handler = async (event) => {
    if (!API_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "API Key is not configured on the server." }),
        };
    }

    // Netlify Functions parse the request body automatically for POST requests
    const body = JSON.parse(event.body || '{}');
    const apiType = body.type; // 'fetch' or 'summarize'

    let systemPrompt = "";
    let userQuery = "";
    let tools = [];

    if (apiType === 'fetch') {
        // Configuration for real-time news fetching
        userQuery = "What are the top 5 current finance and business news stories?";
        systemPrompt = "Act as a concise news aggregator. Provide the title and full body of the top 5 finance stories. Format the output as clean markdown, separating each story clearly using titles and paragraphs.";
        tools = [{ "google_search": {} }]; // Enable real-time search
    } else if (apiType === 'summarize') {
        // Configuration for summarization
        userQuery = body.textToSummarize;
        systemPrompt = "You are a highly efficient editor. Condense the provided financial news content into a single, cohesive, jargon-free paragraph. The summary must be 60 words or less. Do not use a title, introduction, or citation placeholders.";
    } else {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Invalid API type specified." }),
        };
    }

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`;
    
    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
    };

    if (tools.length > 0) {
        payload.tools = tools;
    }

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorBody = await response.json();
            console.error("Gemini API Error:", errorBody);
            return {
                statusCode: response.status,
                body: JSON.stringify({ error: `External API call failed: ${response.status}`, details: errorBody }),
            };
        }

        const result = await response.json();
        
        // Pass the full result (including text and grounding metadata) back to the client
        return {
            statusCode: 200,
            body: JSON.stringify(result),
        };

    } catch (error) {
        console.error("Internal Server Error:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error during API proxy." }),
        };
    }
};