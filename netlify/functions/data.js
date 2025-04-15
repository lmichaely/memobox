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

// Das Lehrer-Passwort wird hier im Backend NICHT mehr benötigt oder verwendet
// const TEACHER_PASSWORD = process.env.TEACHER_PASSWORD;

// Initialisiere den Supabase Client (nur einmal pro Funktionsaufruf)
let supabase = null;
if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
        supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    } catch (error) {
        console.error("Error initializing Supabase client:", error);
    }
} else {
    console.error("FATAL: Supabase URL or Anon Key environment variable is missing!");
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

  if (!supabase) {
    console.error("Handler check: Supabase client is not initialized.");
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Server configuration error: Supabase client not available." }),
    };
  }

  try {
    // --- Daten LADEN (HTTP GET Request) ---
    if (event.httpMethod === 'GET') {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('app_data')
        .eq('data_key', DATA_OBJECT_KEY)
        .maybeSingle();

      if (error) { throw error; }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data?.app_data || {}),
      };
    }

    // --- Daten SPEICHERN (HTTP POST Request) ---
    if (event.httpMethod === 'POST') {
      if (!event.body) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Request body is missing." }) };
      }
      let body;
      try {
          body = JSON.parse(event.body);
      } catch(e) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON in request body." }) };
      }

      // const providedPassword = body.password; // -- ENTFERNT --
      const newAppData = body.data;

      // --- START: Passwortprüfung ENTFERNT ---
      // if (!providedPassword) { ... }
      // if (providedPassword !== TEACHER_PASSWORD) { ... }
      // --- ENDE: Passwortprüfung ENTFERNT ---

      if (newAppData === undefined || newAppData === null) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing data payload.' }) };
      }

      const { error: upsertError } = await supabase
        .from(TABLE_NAME)
        .upsert({
          data_key: DATA_OBJECT_KEY,
          app_data: newAppData
        }, {
          onConflict: 'data_key'
        });

      if (upsertError) { throw upsertError; }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Data saved successfully.' }),
      };
    }

    // --- Fallback für nicht unterstützte Methoden ---
    return { statusCode: 405, headers, body: JSON.stringify({ error: `Method ${event.httpMethod} not allowed.` }) };

  } catch (error) {
    // Allgemeiner Fehler-Handler
    console.error('Unhandled error in function handler:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'An internal server error occurred.', details: error.message }),
    };
  }
};