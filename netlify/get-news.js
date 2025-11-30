/**
 * Netlify Serverless Function to securely proxy requests to the Google Gemini API.
 * This function hides the API key from the client-side code.
 *
 * It requires the GEMINI_API_KEY environment variable to be set in the Netlify dashboard.
 */

// Define the API URL and Model used for the Gemini call
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";
// --- SECURE: Key is read from Netlify's private environment variables ---
const API_KEY = process.env.GEMINI_API_KEY; 

// Main handler for the Netlify function
exports.handler = async (event, context) => {
    // 1. Input Validation and Security Check
    if (event.httpMethod !== "POST") {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: "Method Not Allowed" })
        };
    }
    
    // Ensure the secret key is configured on the Netlify side
    if (!API_KEY) {
        console.error("GEMINI_API_KEY environment variable is not set.");
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Server configuration error: API key missing." })
        };
    }

    let payload;
    try {
        // The frontend sends the structured payload (including the prompt) in the request body
        payload = JSON.parse(event.body);
    } catch (e) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Invalid JSON body provided." })
        };
    }
    
    // Minimal payload check
    if (!payload || !payload.contents) {
         return {
            statusCode: 400,
            body: JSON.stringify({ error: "Missing required 'contents' in payload." })
        };
    }

    // Construct the actual Gemini API URL using the secret key
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${API_KEY}`;
    
    // 2. Exponential Backoff Implementation for robust network calls
    const maxRetries = 3;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                // If Gemini returns a non-200 status, log the details and retry if needed
                const errorBody = await response.json();
                console.error(`Gemini API Error (Attempt ${attempt + 1}):`, errorBody);
                throw new Error(`Gemini API returned status ${response.status}`);
            }

            // Successfully received response
            const geminiResponse = await response.json();
            
            // 3. Success Response: Forward the Gemini result back to the client
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(geminiResponse)
            };

        } catch (error) {
            console.warn(`Attempt ${attempt + 1} failed: ${error.message}`);
            if (attempt < maxRetries - 1) {
                // Wait time: 1s, 2s
                const waitTime = Math.pow(2, attempt) * 1000;
                await new Promise(resolve => setTimeout(resolve, waitTime));
            } else {
                // 4. Final Failure Response
                return {
                    statusCode: 502, // Bad Gateway or Service Unavailable
                    body: JSON.stringify({ 
                        error: "Failed to communicate with the Gemini API after multiple retries.",
                        details: error.message
                    })
                };
            }
        }
    }
};
