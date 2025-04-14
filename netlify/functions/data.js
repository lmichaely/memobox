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
// Wir verwenden einen festen Wert für das _id Feld, um immer dasselbe Dokument zu finden/updaten
const DOCUMENT_ID = 'main_data_singleton';

// Das Lehrer-Passwort (WIRD ALS UMGEBUNGSVARIABLE GESETZT!)
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD;

// Globale Variable für den MongoDB Client (um Verbindungen wiederzuverwenden)
let cachedClient = null;

// Hilfsfunktion zum Verbinden mit der DB
async function connectToDatabase() {
  if (cachedClient && cachedClient.topology && cachedClient.topology.isConnected()) {
    // console.log('Using cached database instance');
    return cachedClient;
  }
  try {
    // console.log('Connecting to database...');
    const client = new MongoClient(MONGO_URI, {
       useNewUrlParser: true, // Veraltet, aber manchmal noch empfohlen
       useUnifiedTopology: true, // Veraltet, aber manchmal noch empfohlen
       // Neuere Optionen, falls die oberen Warnungen geben:
       // serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true } // Benötigt 'mongodb' v4.1+
    });
    cachedClient = await client.connect();
    // console.log('New database connection established');
    return cachedClient;
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw new Error('Could not connect to database.'); // Fehler werfen, um ihn im Handler zu fangen
  }
}

// --- Hauptfunktion (Netlify Function Handler) ---
exports.handler = async (event, context) => {
  // Verhindern, dass die Funktion auf das Schließen der Verbindung wartet
  context.callbackWaitsForEmptyEventLoop = false;

  // CORS Header
  const headers = {
    'Access-Control-Allow-Origin': '*', // In Produktion anpassen!
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // CORS Preflight Request
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  try {
    // Mit DB verbinden (oder gecachte Verbindung nutzen)
    const client = await connectToDatabase();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // --- Daten LADEN (HTTP GET Request) ---
    if (event.httpMethod === 'GET') {
      // console.log('Handling GET request...');
      // Finde das eine Dokument anhand seiner festen _id
      // Wir verwenden findOne, da wir nur ein Dokument erwarten
      const doc = await collection.findOne({ _id: DOCUMENT_ID });

      if (doc) {
        // console.log('Data fetched successfully from MongoDB.');
        // Gib die Daten aus dem 'appData'-Feld zurück (oder wie auch immer du es nennen möchtest)
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(doc.appData || {}), // Sende die Daten oder ein leeres Objekt
        };
      } else {
        // console.log(`MongoDB: Document with _id '${DOCUMENT_ID}' not found. Returning empty data.`);
        // Dokument nicht gefunden, leeres Objekt zurückgeben
        return {
          statusCode: 200, // OK, aber keine Daten
          headers,
          body: JSON.stringify({}),
        };
      }
    }

    // --- Daten SPEICHERN (HTTP POST Request) ---
    if (event.httpMethod === 'POST') {
      // console.log('Handling POST request...');
      // 1. Daten aus dem Request Body holen
       if (!event.body) {
            throw new Error("Request body is missing.");
       }
      const body = JSON.parse(event.body);
      const providedPassword = body.password;
      const newAppData = body.data; // Das ist das komplette memoBoxData Objekt

      // 2. Passwort prüfen
       if (!providedPassword) {
         console.warn('MongoDB POST: Missing password.');
          return { statusCode: 401, headers, body: JSON.stringify({ error: 'Password is required.' }) };
       }
      if (providedPassword !== TEACHER_PASSWORD) {
        console.warn('MongoDB POST: Invalid password attempt.');
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Invalid password.' }) };
      }

      // 3. Prüfen, ob Daten vorhanden sind
      if (newAppData === undefined || newAppData === null) {
        console.warn('MongoDB POST: Missing data payload.');
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing data payload.' }) };
      }

      // 4. Daten in MongoDB aktualisieren oder einfügen (Upsert)
      // Wir nutzen updateOne mit der Option upsert:true.
      // Das aktualisiert das Dokument mit _id: DOCUMENT_ID, falls es existiert,
      // oder fügt es neu ein, falls es nicht existiert.
      // console.log(`Attempting to upsert document with _id: ${DOCUMENT_ID}`);
      const result = await collection.updateOne(
        { _id: DOCUMENT_ID }, // Filter: Finde das Dokument mit dieser ID
        { $set: { appData: newAppData } }, // Update: Setze das Feld 'appData' auf die neuen Daten
        { upsert: true } // Option: Wenn kein Dokument gefunden wird, erstelle es
      );

      // console.log('MongoDB Update Result:', result);
       if (result.acknowledged) {
           console.log('Data successfully upserted in MongoDB.');
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
    // console.log(`Unsupported method: ${event.httpMethod}`);
    return { statusCode: 405, headers, body: JSON.stringify({ error: `Method ${event.httpMethod} not allowed.` }) };

  } catch (error) {
    // Allgemeiner Fehler-Handler
    console.error('Unhandled error in function:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'An internal server error occurred.', details: error.message }),
    };
  }
  // Hinweis: Die DB-Verbindung wird durch die Serverless-Umgebung automatisch geschlossen/eingefroren.
  // Explizites client.close() ist hier oft nicht nötig und kann Probleme verursachen.
};