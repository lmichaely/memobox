// netlify/functions/data.js
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD; // Auch gleich mitloggen

// --- Logge die Variablen direkt nach dem Laden ---
console.log("--- Environment Variables ---");
console.log("SUPABASE_URL:", SUPABASE_URL ? 'SET (length: ' + SUPABASE_URL.length + ')' : 'NOT SET or EMPTY');
console.log("SUPABASE_ANON_KEY:", SUPABASE_ANON_KEY ? 'SET (length: ' + SUPABASE_ANON_KEY.length + ')' : 'NOT SET or EMPTY');
console.log("TEACHER_PASSWORD:", TEACHER_PASSWORD ? 'SET' : 'NOT SET or EMPTY');
console.log("---------------------------");

const TABLE_NAME = 'memobox_storage';
const DATA_OBJECT_KEY = 'main_memobox_data_v1';

let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
         supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
         console.log("Supabase client potentially initialized.");
    } catch (error) {
        console.error("Error during createClient:", error);
        // Fehler hier schon loggen, falls createClient selbst fehlschlägt
    }
} else {
    console.error("FATAL: Supabase URL or Anon Key environment variable is missing!");
}

exports.handler = async (event, context) => {
    context.callbackWaitsForEmptyEventLoop = false;
    const headers = { /* ... CORS headers ... */ };

    if (event.httpMethod === 'OPTIONS') { /* ... OPTIONS handling ... */ }

     // Prüfe erneut, da Initialisierung fehlschlagen könnte
    if (!supabase) {
        console.error("Handler check: Supabase client is not initialized.");
        return { /* ... Fehler 500 zurückgeben ... */ };
    }

    // Rest des Handlers (GET/POST) ...
    if (event.httpMethod === 'GET') {
       // ... (GET Logik)
    }
    if (event.httpMethod === 'POST') {
        // ... (POST Logik)
    }

    return { /* ... 405 Fehler ... */ };
}; // Ende von exports.handler


// Name der Tabelle in Supabase
const TABLE_NAME = 'memobox_storage';
// Fester Wert für den Schlüssel, um unser Datenobjekt zu identifizieren
const DATA_OBJECT_KEY = 'main_memobox_data_v1'; // Eindeutiger Schlüssel

// Das Lehrer-Passwort (WIRD ALS UMGEBUNGSVARIABLE GESETZT!)
const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD;

// Initialisiere den Supabase Client (nur einmal pro Funktionsaufruf)
// WICHTIG: Stelle sicher, dass die Umgebungsvariablen gesetzt sind!
let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.error("FATAL: Supabase URL or Anon Key environment variable is missing!");
    // Verhindere, dass die Funktion ohne Client weiterläuft
    // (Wir könnten hier einen Fehler werfen, aber das erzeugt evtl. Kaltstarts. Besser im Handler prüfen)
}


// --- Hauptfunktion (Netlify Function Handler) ---
exports.handler = async (event, context) => {
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

  // Prüfen, ob Supabase Client initialisiert werden konnte
   if (!supabase) {
       console.error("Supabase client is not initialized. Check environment variables.");
       return {
           statusCode: 500,
           headers,
           body: JSON.stringify({ error: "Server configuration error: Supabase client not available." }),
       };
   }

  // --- Daten LADEN (HTTP GET Request) ---
  if (event.httpMethod === 'GET') {
    // console.log('Handling Supabase GET request...');
    try {
      // Hole die Zeile, deren 'data_key' unserem festen Schlüssel entspricht
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('app_data') // Wähle nur die Spalte mit den JSONB-Daten aus
        .eq('data_key', DATA_OBJECT_KEY) // Finde die Zeile mit unserem Schlüssel
        .maybeSingle(); // Erwarte höchstens eine Zeile (oder null)

      if (error) {
        console.error('Supabase GET error:', error);
        throw error; // Wirf den Fehler, um ihn unten zu fangen
      }

      // console.log('Data fetched successfully from Supabase.');
      // Gib die Daten aus 'app_data' zurück oder ein leeres Objekt, falls nichts gefunden wurde
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data?.app_data || {}), // ?. für Sicherheit, falls data null ist
      };

    } catch (error) {
      console.error('Error during Supabase GET:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to fetch data from database.', details: error.message }),
      };
    }
  }

  // --- Daten SPEICHERN (HTTP POST Request) ---
  if (event.httpMethod === 'POST') {
    // console.log('Handling Supabase POST request...');
    try {
      // 1. Daten aus dem Request Body holen
       if (!event.body) { throw new Error("Request body is missing."); }
      const body = JSON.parse(event.body);
      const providedPassword = body.password;
      const newAppData = body.data; // Das ist das komplette memoBoxData Objekt

      // 2. Passwort prüfen
       if (!providedPassword) {
         console.warn('Supabase POST: Missing password.');
          return { statusCode: 401, headers, body: JSON.stringify({ error: 'Password is required.' }) };
       }
      if (providedPassword !== TEACHER_PASSWORD) {
        console.warn('Supabase POST: Invalid password attempt.');
        return { statusCode: 403, headers, body: JSON.stringify({ error: 'Invalid password.' }) };
      }

      // 3. Prüfen, ob Daten vorhanden sind
      if (newAppData === undefined || newAppData === null) {
        console.warn('Supabase POST: Missing data payload.');
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing data payload.' }) };
      }

      // 4. Daten in Supabase aktualisieren oder einfügen (Upsert)
      // Wir nutzen upsert(), um die Zeile zu aktualisieren, falls sie existiert
      // (basierend auf dem data_key), oder sie neu einzufügen, falls nicht.
      // console.log(`Attempting to upsert document with data_key: ${DATA_OBJECT_KEY}`);
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .upsert({
            data_key: DATA_OBJECT_KEY, // Der feste Schlüssel
            app_data: newAppData      // Die neuen MemoBox-Daten
         }, {
            onConflict: 'data_key' // Wenn ein Konflikt bei data_key auftritt (d.h. Zeile existiert), wird sie geupdated
         })
        .select() // Optional: Um die eingefügten/geupdateten Daten zurückzubekommen (brauchen wir hier nicht unbedingt)
        .single(); // Wir erwarten genau eine Zeile als Ergebnis des Upserts


      if (error) {
        console.error('Supabase POST (upsert) error:', error);
        throw error; // Wirf den Fehler, um ihn unten zu fangen
      }

      // console.log('Data successfully upserted in Supabase.');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Data saved successfully.' }),
      };

    } catch (error) {
      console.error('Error during Supabase POST:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to save data to the database.', details: error.message }),
      };
    }
  }

  // --- Fallback für nicht unterstützte Methoden ---
  return { statusCode: 405, headers, body: JSON.stringify({ error: `Method ${event.httpMethod} not allowed.` }) };
};