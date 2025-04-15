// netlify/functions/data.js

// Benötigtes Paket für Supabase
const { createClient } = require('@supabase/supabase-js');

// --- Konfiguration ---
// Supabase URL und Anon Key (AUS UMGEBUNGSVARIABLEN!)
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

// Name der Tabelle in Supabase
const TABLE_NAME = 'memobox_storage';
// Fester Wert für den Schlüssel, um unser Datenobjekt zu identifizieren
const DATA_OBJECT_KEY = 'main_memobox_data_v1';

// Das Lehrer-Passwort (AUS UMGEBUNGSVARIABLE!)
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD;

// Initialisiere den Supabase Client (nur einmal pro Funktionsaufruf)
let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (error) {
        console.error("Error initializing Supabase client:", error);
        // Fehler hier loggen, aber Handler kann trotzdem versuchen zu laufen
        // und wird dann im !supabase Check fehlschlagen.
    }
} else {
    console.error("FATAL: Supabase URL or Anon Key environment variable is missing!");
}

// --- Hauptfunktion (Netlify Function Handler) ---
exports.handler = async (event, context) => {
  // Wichtig für Serverless-Funktionen, um auf Antworten zu warten
  context.callbackWaitsForEmptyEventLoop = false;

  // CORS Header für die Antwort
  const headers = {
    'Access-Control-Allow-Origin': '*', // Oder spezifischer: 'https://deine-domain.netlify.app'
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // CORS Preflight Request behandeln
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // --- Prüfen, ob Supabase Client verfügbar ist ---
  if (!supabase) {
    console.error("Handler check: Supabase client is not initialized. Check environment variables and initialization logs.");
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Server configuration error: Supabase client not available." }),
    };
  }

  try {
    // --- Daten LADEN (HTTP GET Request) ---
    if (event.httpMethod === 'GET') {
      // console.log('Handling Supabase GET request...');
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('app_data')
        .eq('data_key', DATA_OBJECT_KEY)
        .maybeSingle();

      if (error) {
        console.error('Supabase GET error:', error);
        // Wirf den Supabase-Fehler weiter, um unten gefangen zu werden
        throw error;
      }

      // console.log('Data fetched successfully from Supabase.');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data?.app_data || {}), // Sende Daten oder leeres Objekt
      };
    }

    // --- Daten SPEICHERN (HTTP POST Request) ---
    if (event.httpMethod === 'POST') {
      // console.log('Handling Supabase POST request...');
      if (!event.body) {
        // Früher Fehler für fehlenden Body
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Request body is missing." }) };
      }

      let body;
      try {
          body = JSON.parse(event.body);
      } catch(e) {
          console.error("Error parsing request body:", e);
          return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON in request body." }) };
      }

      const providedPassword = body.password;
      const newAppData = body.data;

      // Passwort prüfen
      if (!providedPassword) {
        console.warn('Supabase POST: Missing password.');
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'Password is required.' }) };
      }
      if (providedPassword !== TEACHER_PASSWORD) {
        console.warn('Supabase POST: Invalid password attempt.');
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Invalid password.' }) };
      }

      // Daten prüfen
      if (newAppData === undefined || newAppData === null) {
        console.warn('Supabase POST: Missing data payload.');
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing data payload.' }) };
      }

      // Daten in Supabase speichern/aktualisieren (Upsert)
      const { error: upsertError } = await supabase
        .from(TABLE_NAME)
        .upsert({
          data_key: DATA_OBJECT_KEY,
          app_data: newAppData
        }, {
          onConflict: 'data_key' // Aktualisiere, wenn data_key schon existiert
        });

      if (upsertError) {
        console.error('Supabase POST (upsert) error:', upsertError);
        // Wirf den Supabase-Fehler weiter
        throw upsertError;
      }

      // console.log('Data successfully upserted in Supabase.');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Data saved successfully.' }),
      };
    }

    // --- Fallback für nicht unterstützte Methoden ---
    console.log(`Unsupported method: ${event.httpMethod}`);
    return { statusCode: 405, headers, body: JSON.stringify({ error: `Method ${event.httpMethod} not allowed.` }) };

  } catch (error) {
    // Allgemeiner Fehler-Handler für alle Fehler innerhalb des try-Blocks
    console.error('Unhandled error in function handler:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'An internal server error occurred.', details: error.message }),
    };
  }
};