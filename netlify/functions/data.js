// netlify/functions/data.js

// Benötigtes Paket für MongoDB
const { MongoClient } = require('mongodb');

// --- Konfiguration ---
// MongoDB Connection String (WIRD ALS UMGEBUNGSVARIABLE GESETZT!)
const MONGO_URI = process.env.MONGODB_URI;
// Name der Datenbank in MongoDB Atlas
const DB_NAME = 'MemoBoxDB'; // Sollte mit dem Namen im Connection String übereinstimmen
// Name der Collection in MongoDB
const COLLECTION_NAME = 'memobox_data';
// Feste ID für das *eine* Dokument, das alle unsere Daten enthält
const DOCUMENT_ID = 'main_data_singleton';

// Das Lehrer-Passwort (WIRD ALS UMGEBUNGSVARIABLE GESETZT!)
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD;

// Globale Variable für den MongoDB Client (um Verbindungen wiederzuverwenden)
let cachedClient = null;

// Hilfsfunktion zum Verbinden mit der DB
async function connectToDatabase() {
  if (cachedClient && cachedClient.topology && cachedClient.topology.isConnected()) {
      console.log('Using cached database instance');
    return cachedClient;
  }
  try {
    console.log('Connecting to database...');
    const client = new MongoClient(MONGO_URI); // Entferne veraltete Optionen
    cachedClient = await client.connect();
    //console.log('New database connection established');
    console.log('[connectToDatabase] MongoDB Connection SUCCESSFUL!');
    return cachedClient;
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw new Error('Could not connect to database.');
  }
}

// --- Hauptfunktion (Netlify Function Handler) ---
exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    const client = await connectToDatabase();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // --- Daten LADEN (HTTP GET Request) ---
    if (event.httpMethod === 'GET') {
      // console.log('Handling GET request...');
      const doc = await collection.findOne({ _id: DOCUMENT_ID });
      if (doc) {
        // console.log('Data fetched successfully from MongoDB.');
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(doc.appData || {}),
        };
      } else {
        // console.log(`MongoDB: Document with _id '${DOCUMENT_ID}' not found. Returning empty data.`);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({}),
        };
      }
    }

    // --- Daten SPEICHERN (HTTP POST Request) ---
    if (event.httpMethod === 'POST') {
      // console.log('Handling POST request...');
       if (!event.body) { throw new Error("Request body is missing."); }
      const body = JSON.parse(event.body);
      const providedPassword = body.password;
      const newAppData = body.data;

       if (!providedPassword) {
         console.warn('MongoDB POST: Missing password.');
          return { statusCode: 401, headers, body: JSON.stringify({ error: 'Password is required.' }) };
       }
      if (providedPassword !== TEACHER_PASSWORD) {
        console.warn('MongoDB POST: Invalid password attempt.');
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Invalid password.' }) };
      }
      if (newAppData === undefined || newAppData === null) {
        console.warn('MongoDB POST: Missing data payload.');
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing data payload.' }) };
      }

      // console.log(`Attempting to upsert document with _id: ${DOCUMENT_ID}`);
      const result = await collection.updateOne(
        { _id: DOCUMENT_ID },
        { $set: { appData: newAppData } },
        { upsert: true }
      );

       if (result.acknowledged) {
           // console.log('Data successfully upserted in MongoDB.');
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify({ success: true, message: 'Data saved successfully.' }),
            };
       } else {
           throw new Error('MongoDB update operation was not acknowledged.');
       }
    }

    // --- Fallback für nicht unterstützte Methoden ---
    return { statusCode: 405, headers, body: JSON.stringify({ error: `Method ${event.httpMethod} not allowed.` }) };

  } catch (error) {
    console.error('Unhandled error in function:', error);
    // Detailliertere Fehlermeldung zurückgeben
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'An internal server error occurred in the function.', details: error.message }),
    };
  }
};