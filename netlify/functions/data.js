// netlify/functions/data.js

// --- START Logging ---
console.log("--- Function data.js START ---");
console.log("Timestamp:", new Date().toISOString());
console.log("Reading Env Vars...");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log("SUPABASE_URL exists:", !!SUPABASE_URL);
// Logge NIE den Service Key selbst, nur ob er da ist!
console.log("SUPABASE_SERVICE_ROLE_KEY exists:", !!SUPABASE_SERVICE_ROLE_KEY);
// --- END Logging ---

// Benötigtes Paket für Supabase
const { createClient } = require('@supabase/supabase-js');

// Name der Tabelle in Supabase
const TABLE_NAME = 'memobox_storage';
// Fester Wert für den Schlüssel, um unser Datenobjekt zu identifizieren
const DATA_OBJECT_KEY = 'main_memobox_data_v1';

// Initialisiere den Supabase Client (nur einmal pro Funktionsaufruf)
let supabase = null;
let initializationError = null; // Fehler speichern

try {
    console.log("Attempting Supabase client initialization..."); // LOG
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
        // Prüfen ob das Objekt erstellt wurde
        if (supabase) {
             console.log("Supabase client initialization SUCCESSFUL."); // LOG
        } else {
             // Sollte nicht passieren, wenn createClient keinen Fehler wirft, aber sicher ist sicher
             initializationError = new Error("createClient returned null/undefined without throwing error.");
             console.error(initializationError.message); // LOG ERROR
        }
    } else {
        initializationError = new Error("FATAL: Supabase URL or Service Role Key env var is missing!");
        console.error(initializationError.message); // LOG ERROR
    }
} catch (error) {
    initializationError = error; // Fehler speichern
    console.error("FATAL: Exception during Supabase client initialization:", error); // LOG ERROR
}
console.log("Initialization check complete. Supabase client object:", supabase ? "Exists" : "NULL"); // LOG
console.log("Initialization error object:", initializationError); // LOG


// --- Hauptfunktion (Netlify Function Handler) ---
exports.handler = async (event, context) => {
  console.log("--- Handler Invoked ---"); // LOG
  console.log("Timestamp:", new Date().toISOString()); // LOG
  console.log("HTTP Method:", event.httpMethod); // LOG
  context.callbackWaitsForEmptyEventLoop = false;

  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };

  // Handle OPTIONS request for CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    console.log("Handling OPTIONS request."); // LOG
    return { statusCode: 204, headers, body: '' };
  }

  // Prüfe auf Initialisierungsfehler FRÜH im Handler
  if (initializationError || !supabase) {
    console.error(">>> ERROR: Supabase client not available in handler."); // LOG ERROR
    const errorMsg = initializationError ? initializationError.message : "Supabase client object is null.";
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Server configuration error.", details: errorMsg }),
    };
  }

  // --- Ab hier sollte supabase initialisiert sein ---
  try {
    console.log("Supabase client seems OK, proceeding with method:", event.httpMethod); // LOG

    // --- Daten LADEN (HTTP GET Request) ---
    if (event.httpMethod === 'GET') {
      console.log("Executing GET request to fetch data..."); // LOG
      const { data, error: selectError } = await supabase
        .from(TABLE_NAME)
        .select('app_data')
        .eq('data_key', DATA_OBJECT_KEY)
        .maybeSingle(); // Verwende maybeSingle(), um null statt Fehler zu bekommen, wenn nichts gefunden wird

      console.log("GET request completed. Error:", selectError, "Data received:", !!data); // LOG Ergebnis

      // WICHTIG: Behandle den Fehler hier explizit
      if (selectError) {
          console.error(">>> ERROR during GET select:", selectError); // LOG ERROR
          // Wirf den Fehler weiter, damit er im allgemeinen Catch-Block behandelt wird
          throw selectError;
      }

      // Sende leeres Objekt {}, wenn keine Daten gefunden wurden (statt null)
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data?.app_data || {}), // Sicherer Zugriff mit Optional Chaining und Fallback
      };
    }

    // --- Daten SPEICHERN (HTTP POST Request) ---
    if (event.httpMethod === 'POST') {
      console.log("Executing POST request to save data..."); // LOG

      if (!event.body) {
        console.error(">>> ERROR: POST request body is missing."); // LOG ERROR
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Request body is missing." }) };
      }

      let body;
      try {
          body = JSON.parse(event.body);
      } catch(e) {
          console.error(">>> ERROR: Invalid JSON in POST request body:", e); // LOG ERROR
          return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON in request body." }) };
      }

      const newAppData = body.data;

      if (newAppData === undefined || newAppData === null) {
          console.error(">>> ERROR: Missing 'data' payload in POST request body."); // LOG ERROR
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing data payload.' }) };
      }

      console.log("Attempting upsert operation..."); // LOG
      const { error: upsertError } = await supabase
        .from(TABLE_NAME)
        .upsert({
          data_key: DATA_OBJECT_KEY,
          app_data: newAppData // Das gesamte Objekt wird in die JSONB-Spalte geschrieben
        }, {
          onConflict: 'data_key' // Stellt sicher, dass 'data_key' UNIQUE oder PK ist
        });

      console.log("Upsert operation completed. Error:", upsertError); // LOG Ergebnis

      // WICHTIG: Behandle den Fehler hier explizit
      if (upsertError) {
        console.error(">>> ERROR during POST upsert:", upsertError); // LOG ERROR
        // Wirf den Fehler weiter
        throw upsertError;
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Data saved successfully.' }),
      };
    }

    // --- Fallback für nicht unterstützte Methoden ---
    console.warn(`>>> WARN: Method ${event.httpMethod} not allowed.`); // LOG WARN
    return { statusCode: 405, headers, body: JSON.stringify({ error: `Method ${event.httpMethod} not allowed.` }) };

  } catch (error) {
    // Allgemeiner Fehler-Handler für Fehler *innerhalb* des try-Blocks des Handlers
    console.error('>>> ERROR during handler execution:', error); // LOG ERROR
    const details = error.message || 'No details available.';
    const code = error.code || 'UNKNOWN';
    // Überlege, ob du dem Client spezifischere Fehlermeldungen geben willst
    // return { statusCode: 500, headers, body: JSON.stringify({ error: 'An internal server error occurred.', details: details, code: code }) };
     return { statusCode: 500, headers, body: JSON.stringify({ error: 'An error occurred while processing your request.' }) }; // Generischere Meldung für Client
  }
};

console.log("--- Function data.js END (initial script execution) ---"); // LOG